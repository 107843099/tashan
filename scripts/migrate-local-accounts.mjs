#!/usr/bin/env node
// Private operator CLI. Default is a read-only plan; --apply is the only mutation path.
import { constants, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, lstatSync, realpathSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ROOT, CloudToolError, loadCloudEnvironment, validateCloudEnvironment, createCloudReader, readCloudAccounts } from './cloud-check.mjs';
import { createSupabaseProvider } from '../server/supabase-provider.mjs';
import { validateUsername, validateDisplayName, validatePassword, validateAffiliation } from '../server/api.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code, message) => { throw new CloudToolError(code, message); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceKeys = ['localId', 'username', 'displayName', 'role', 'status', 'affiliationType', 'organizationName', 'updatedAt'];

function privateDirectory(root) {
  const directory = resolve(root, '.local');
  try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') fail('PRIVATE_DIRECTORY', '无法建立私有迁移目录。'); }
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== resolve(realpathSync(root), '.local')) fail('PRIVATE_DIRECTORY', '.local 必须是项目内的真实私有目录，不能使用符号链接。');
  chmodSync(directory, 0o700);
  return directory;
}
function privatePath(root, path) {
  const directory = privateDirectory(root), full = resolve(root, path);
  if (dirname(full) !== directory || !/^account-migration-(?:result-)?[a-f0-9-]{36}\.json$/.test(basename(full))) fail('PRIVATE_PATH', '迁移计划与结果必须是本项目 .local 中由工具生成的 JSON 文件。');
  return full;
}
function writeNewPrivate(root, path, value) {
  const full = privatePath(root, path);
  const descriptor = openSync(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n'); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  return full;
}
function rewritePrivate(root, path, value) {
  const full = privatePath(root, path), info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('PRIVATE_PATH', '迁移结果文件状态异常，已停止写入。');
  const temporary = full + '.' + randomUUID() + '.tmp';
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n'); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, full);
}
function readPrivatePlan(root, path) {
  const full = privatePath(root, path), info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * 1024 * 1024) fail('PLAN_FILE', '迁移计划不是有效的本地私有文件。');
  const descriptor = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return JSON.parse(readFileSync(descriptor, 'utf8')); } catch { fail('PLAN_FILE', '无法读取迁移计划，请重新生成。'); } finally { closeSync(descriptor); }
}

function normalizeLocalRows(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) fail('LOCAL_DIRECTORY', '本地账号目录格式无效或超出迁移范围。');
  const ids = new Set(), usernames = new Set();
  return rows.map(row => {
    let username, displayName, affiliation;
    try {
      username = validateUsername(row.username); displayName = validateDisplayName(row.display_name ?? row.displayName);
      const hasType = Object.hasOwn(row, 'affiliation_type') || Object.hasOwn(row, 'affiliationType');
      const hasName = Object.hasOwn(row, 'organization_name') || Object.hasOwn(row, 'organizationName');
      const type = row.affiliation_type ?? row.affiliationType, name = row.organization_name ?? row.organizationName;
      if (hasType !== hasName || hasType && (typeof type !== 'string' || typeof name !== 'string')) throw new Error('Incomplete local affiliation');
      affiliation = validateAffiliation(hasType ? { affiliationType: type, organizationName: name } : {});
    } catch { fail('LOCAL_DIRECTORY', '本地账号信息或学校/机构资料不符合当前规则，请先在管理员工作台调整。'); }
    const localId = row.id || row.localId;
    if (!UUID.test(localId || '') || ids.has(localId) || usernames.has(username) || !['admin', 'member'].includes(row.role) || !['active', 'disabled'].includes(row.status)) fail('LOCAL_DIRECTORY', '本地账号 ID、角色、状态或唯一性无效。');
    ids.add(localId); usernames.add(username);
    return { localId, username, displayName, role: row.role, status: row.status, ...affiliation, updatedAt: row.updated_at ?? row.updatedAt ?? null };
  }).sort((a, b) => a.localId.localeCompare(b.localId));
}

export async function readLocalAccounts(root = ROOT) {
  const directory = resolve(root, '.local'), path = resolve(directory, 'accounts.sqlite');
  let info;
  try {
    if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== resolve(realpathSync(root), '.local')) fail('LOCAL_DATABASE', '本地账号数据库不能位于符号链接目录。');
    info = lstatSync(path);
  } catch { fail('LOCAL_DATABASE', '未找到 .local/accounts.sqlite。请在创建本地账号的项目目录运行迁移。'); }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('LOCAL_DATABASE', '本地账号数据库必须是项目内的普通文件。');
  const { DatabaseSync } = await import('node:sqlite');
  let database;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const columns = new Set(database.prepare('PRAGMA table_info(accounts)').all().map(column => column.name));
    const hasType = columns.has('affiliation_type'), hasName = columns.has('organization_name');
    if (hasType !== hasName) fail('LOCAL_DATABASE', '本地账号归属字段不完整，请先完成本机账号数据库升级后再迁移。');
    const affiliationSelect = hasType ? 'affiliation_type, organization_name' : "'personal' AS affiliation_type, '' AS organization_name";
    // Password hashes and sessions are deliberately never selected.
    return normalizeLocalRows(database.prepare('SELECT id, username, display_name, role, status, updated_at, ' + affiliationSelect + ' FROM accounts ORDER BY id').all());
  } catch (error) { if (error instanceof CloudToolError) throw error; fail('LOCAL_DATABASE', '无法只读访问本地账号目录，请核对数据库与 Node 版本。'); }
  finally { database?.close(); }
}

export function buildMigrationPlan(localRows, cloudRows, config = null) {
  const local = normalizeLocalRows(localRows), cloud = cloudRows || [];
  if (!Array.isArray(cloud)) fail('CLOUD_DIRECTORY', '云端账号目录格式无效。');
  const names = new Map(cloud.map(row => [row.username, row]));
  return {
    format: 'tashan-account-migration/v1', id: randomUUID(), createdAt: new Date().toISOString(),
    target: config?.target || null, cloudChecked: !!config, sourceFingerprint: digest(local),
    note: '仅迁移账号资料（含个人/学校/机构归属），为新账号分配新密码，登录后即可使用，也可在个人账号页主动修改。不会复制本地密码、修改已有云账号，或合并浏览器项目空间。仅允许将 action 改为 skip；其他内容改变后请重新生成计划。',
    entries: local.map(row => ({ ...row,
      action: row.status === 'disabled' ? 'skip' : !config ? 'review' : names.has(row.username) ? 'conflict' : 'create',
      reason: row.status === 'disabled' ? 'disabled-local-account' : !config ? 'cloud-not-configured' : names.has(row.username) ? 'username-exists-in-cloud' : 'new-cloud-account',
      ...(names.has(row.username) ? { existingCloudId: names.get(row.username).id } : {})
    }))
  };
}

function validatePlan(plan, localRows, cloudRows, config, administrator) {
  const local = normalizeLocalRows(localRows);
  if (plan?.format !== 'tashan-account-migration/v1' || !UUID.test(plan.id || '') || !plan.cloudChecked || plan.target !== config.target) fail('PLAN_TARGET', '计划没有核对云环境，或当前目标与计划不同。请重新执行 dry-run。');
  if (plan.sourceFingerprint !== digest(local) || !Array.isArray(plan.entries) || plan.entries.length !== local.length) fail('PLAN_STALE', '本地账号资料已经变化，请重新生成计划。');
  let username;
  try { username = validateUsername(administrator); } catch { fail('ADMIN_REQUIRED', '--admin 必须指定一个现有云端管理员用户名。'); }
  const actor = cloudRows.find(row => row.username === username);
  if (!actor || !UUID.test(actor.id || '') || actor.role !== 'admin' || actor.status !== 'active' || actor.must_change_password !== false) fail('ADMIN_REQUIRED', '指定账号不是可用云端管理员，或仍需完成管理员重置后的改密；请先登录云环境核对。');
  const seen = new Set(), byId = new Map(local.map(row => [row.localId, row])), names = new Set(cloudRows.map(row => row.username));
  const pending = [];
  for (const entry of plan.entries) {
    const original = byId.get(entry?.localId);
    if (!original || seen.has(entry.localId) || sourceKeys.some(key => entry[key] !== original[key])) fail('PLAN_CHANGED', '计划的账号资料已被编辑，请重新生成；只允许将 action 改为 skip。');
    seen.add(entry.localId);
    if (entry.action === 'skip') continue;
    if (entry.action !== 'create') fail('CONFLICT_REVIEW', '计划仍有同名冲突或待核对账号。保留云端账号，并将不迁移条目的 action 改为 skip 后再执行。');
    if (entry.status !== 'active' || names.has(entry.username)) fail('CLOUD_CONFLICT', '某个待创建用户名已存在，或本地账号被禁用。不会覆盖云端账号，请重新生成计划。');
    pending.push(entry);
  }
  return { actor, pending };
}

export async function applyMigration({ plan, localRows, cloudRows, config, administrator, provider, root = ROOT }) {
  const { actor, pending } = validatePlan(plan, localRows, cloudRows, config, administrator);
  if (!pending.length) return { created: 0, resultPath: null };
  const resultPath = resolve(privateDirectory(root), 'account-migration-result-' + randomUUID() + '.json');
  const journal = {
    format: 'tashan-account-migration-result/v1', planId: plan.id, target: config.target,
    createdAt: new Date().toISOString(), administratorId: actor.id, state: 'running',
    warning: '此文件包含新账号初始密码。仅私下交给对应本人，交接完成后妥善清理；本人可在个人账号页主动改密。映射不代表浏览器资料已经迁移。', accounts: []
  };
  writeNewPrivate(root, resultPath, journal);
  for (const entry of pending) {
    const password = 'Ts9-' + randomBytes(20).toString('base64url');
    validatePassword(password);
    const item = { localId: entry.localId, username: entry.username, displayName: entry.displayName, role: entry.role, affiliationType: entry.affiliationType, organizationName: entry.organizationName, initialPassword: password, state: 'pending', cloudId: null };
    journal.accounts.push(item);
    // Persist the generated credential BEFORE the remote request, including ambiguous timeouts.
    rewritePrivate(root, resultPath, journal);
    try {
      const user = await provider.createUser(actor, { username: entry.username, displayName: entry.displayName, role: entry.role, affiliationType: entry.affiliationType, organizationName: entry.organizationName, password });
      if (!UUID.test(user?.id || '') || user.username !== entry.username || user.displayName !== entry.displayName || user.role !== entry.role || user.status !== 'active' || user.mustChangePassword !== false || user.affiliationType !== entry.affiliationType || user.organizationName !== entry.organizationName) fail('CREATE_UNCONFIRMED', '云端新增账号或学校/机构资料尚未确认，请核对账号策略迁移。');
      item.cloudId = user.id; item.state = 'created'; item.mustChangePassword = false;
      rewritePrivate(root, resultPath, journal);
    } catch {
      item.state = 'unconfirmed'; journal.state = 'needs-review';
      try { rewritePrivate(root, resultPath, journal); } catch { /* The previously persisted pending credential still allows manual recovery. */ }
      // Never retry, delete or reset a potentially created identity after an uncertain response.
      const error = new CloudToolError('MIGRATION_UNCONFIRMED', '某个账号创建结果尚未确认。请核对私有结果文件与云端账号目录；本工具不会自动重试或覆盖账号。');
      error.resultPath = resultPath;
      throw error;
    }
  }
  journal.state = 'complete'; journal.completedAt = new Date().toISOString();
  rewritePrivate(root, resultPath, journal);
  return { created: journal.accounts.length, resultPath };
}

async function selfTest() {
  const { strict: assert } = await import('node:assert');
  const { mkdtempSync, rmSync, readdirSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const testRoot = mkdtempSync(resolve(tmpdir(), 'tashan-account-migration-'));
  try {
    const local = [
      { id: randomUUID(), username: 'teacher-one', display_name: '教师一', role: 'member', status: 'active', affiliation_type: 'school', organization_name: '\u3000示例学校\u00a0', updated_at: '2026-09-10' },
      { id: randomUUID(), username: 'teacher-two', display_name: '教师二', role: 'admin', status: 'active', affiliationType: 'organization', organizationName: '示例教育机构', updated_at: '2026-09-10' },
      { id: randomUUID(), username: 'disabled-member', display_name: '停用成员', role: 'member', status: 'disabled', updated_at: '2026-09-10' }
    ];
    const cloud = [{ id: randomUUID(), username: 'cloud-admin', display_name: '云管理员', role: 'admin', status: 'active', must_change_password: false }];
    const config = validateCloudEnvironment({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_PRIVATE_TEST_VALUE' });
    const plan = buildMigrationPlan(local, cloud, config);
    assert.equal(plan.entries.filter(entry => entry.action === 'create').length, 2);
    assert.equal(plan.entries.find(entry => entry.status === 'disabled').action, 'skip');
    assert.equal(plan.entries.find(entry => entry.username === 'teacher-one').affiliationType, 'school');
    assert.equal(plan.entries.find(entry => entry.username === 'teacher-one').organizationName, '示例学校');
    assert.equal(plan.entries.find(entry => entry.username === 'teacher-two').affiliationType, 'organization');
    assert.equal(plan.entries.find(entry => entry.status === 'disabled').affiliationType, 'personal');
    assert.equal(plan.entries.find(entry => entry.status === 'disabled').organizationName, '');
    const unicodeName = '𠮷'.repeat(100);
    assert.equal(buildMigrationPlan([{ ...local[0], organization_name: unicodeName }], cloud, config).entries[0].organizationName, unicodeName, 'Organization length counts Unicode code points, not UTF-16 units');
    for (const changes of [{ organization_name: '𠮷'.repeat(101) }, { organization_name: '\u3000\u00a0' }, { organization_name: '学校\u0085名称' }, { affiliation_type: 'unknown' }]) assert.throws(() => buildMigrationPlan([{ ...local[0], ...changes }], cloud, config), { code: 'LOCAL_DIRECTORY' });
    assert.throws(() => buildMigrationPlan([{ ...local[2], organizationName: 'Cannot infer missing affiliation type' }], cloud, config), { code: 'LOCAL_DIRECTORY' });
    assert.equal(buildMigrationPlan(local, null).cloudChecked, false);
    let calls = 0;
    const provider = { async createUser(actor, input) {
      calls++; assert.equal(actor.id, cloud[0].id); validatePassword(input.password);
      const planned = plan.entries.find(entry => entry.username === input.username);
      assert.equal(input.affiliationType, planned.affiliationType); assert.equal(input.organizationName, planned.organizationName);
      const files = readdirSync(resolve(testRoot, '.local')).filter(name => name.startsWith('account-migration-result-'));
      assert(files.some(name => JSON.parse(readFileSync(resolve(testRoot, '.local', name))).accounts.some(row => row.username === input.username && row.initialPassword === input.password && row.affiliationType === input.affiliationType && row.organizationName === input.organizationName && row.state === 'pending')));
      return { id: randomUUID(), ...input, status: 'active', mustChangePassword: false };
    } };
    const args = { plan, localRows: local, cloudRows: cloud, config, administrator: 'cloud-admin', provider, root: testRoot };
    await assert.rejects(applyMigration({ ...args, config: { ...config, target: 'different-target' } }), { code: 'PLAN_TARGET' });
    await assert.rejects(applyMigration({ ...args, localRows: local.map((row, i) => i ? row : { ...row, display_name: 'changed' }) }), { code: 'PLAN_STALE' });
    for (const changes of [{ affiliation_type: 'organization' }, { organization_name: '另一所学校' }]) await assert.rejects(applyMigration({ ...args, localRows: local.map((row, i) => i ? row : { ...row, ...changes }) }), { code: 'PLAN_STALE' });
    for (const changes of [{ affiliationType: 'personal', organizationName: '' }, { organizationName: '被编辑的名称', action: 'skip' }]) await assert.rejects(applyMigration({ ...args, plan: { ...plan, entries: plan.entries.map(entry => entry.username === 'teacher-one' ? { ...entry, ...changes } : entry) } }), { code: 'PLAN_CHANGED' });
    const legacyFingerprint = digest(normalizeLocalRows(local).map(({ affiliationType, organizationName, ...row }) => row));
    await assert.rejects(applyMigration({ ...args, plan: { ...plan, sourceFingerprint: legacyFingerprint } }), { code: 'PLAN_STALE' }, 'Plans created before affiliation support must be regenerated');
    await assert.rejects(applyMigration({ ...args, cloudRows: [{ ...cloud[0], must_change_password: true }] }), { code: 'ADMIN_REQUIRED' });
    const existing = { id: randomUUID(), username: 'teacher-one', role: 'member', status: 'active' };
    await assert.rejects(applyMigration({ ...args, cloudRows: [...cloud, existing] }), { code: 'CLOUD_CONFLICT' });
    const conflict = buildMigrationPlan(local, [...cloud, existing], config);
    await assert.rejects(applyMigration({ ...args, plan: conflict, cloudRows: [...cloud, existing] }), { code: 'CONFLICT_REVIEW' });
    assert.equal(calls, 0);
    const result = await applyMigration(args);
    assert.equal(calls, 2); assert.equal(result.created, 2);
    assert.equal(statSync(result.resultPath).mode & 0o777, 0o600);
    const journal = JSON.parse(readFileSync(result.resultPath));
    assert.equal(journal.state, 'complete'); assert(journal.accounts.every(row => row.cloudId && row.mustChangePassword === false));
    for (const item of journal.accounts) { const planned = plan.entries.find(entry => entry.localId === item.localId); assert.equal(item.affiliationType, planned.affiliationType); assert.equal(item.organizationName, planned.organizationName); }
    assert.equal(journal.accounts.some(row => row.username === 'cloud-admin'), false);
    assert.equal(JSON.stringify(plan).includes('initialPassword'), false);
    let incompatibleCalls = 0;
    await assert.rejects(applyMigration({ ...args, provider:{createUser:async (actor, input) => {
      incompatibleCalls++;
      return {id:randomUUID(),...input,status:'active',mustChangePassword:true};
    }} }), error => {
      const incompatible = JSON.parse(readFileSync(error.resultPath));
      assert.equal(incompatible.state, 'needs-review'); assert.equal(incompatible.accounts[0].state, 'unconfirmed');
      return error.code === 'MIGRATION_UNCONFIRMED';
    });
    assert.equal(incompatibleCalls, 1, 'An old cloud onboarding policy stops migration instead of silently confirming restricted accounts');
    for (const returnedProfile of [{ affiliationType: undefined, organizationName: undefined }, { affiliationType: 'personal', organizationName: '' }, { organizationName: 'Other organization' }]) {
      let profileCalls = 0;
      await assert.rejects(applyMigration({ ...args, provider: { createUser: async (actor, input) => {
        profileCalls++; return { id: randomUUID(), ...input, status: 'active', mustChangePassword: false, ...returnedProfile };
      } } }), error => {
        const unconfirmed = JSON.parse(readFileSync(error.resultPath));
        assert.equal(unconfirmed.state, 'needs-review'); assert.equal(unconfirmed.accounts[0].state, 'unconfirmed');
        const planned = plan.entries.find(entry => entry.localId === unconfirmed.accounts[0].localId);
        assert.equal(unconfirmed.accounts[0].affiliationType, planned.affiliationType); assert.equal(unconfirmed.accounts[0].organizationName, planned.organizationName);
        return error.code === 'MIGRATION_UNCONFIRMED';
      });
      assert.equal(profileCalls, 1, 'A missing or changed cloud affiliation stops migration without retry or overwriting any account');
    }
    let failedPath, partialCalls = 0;
    await assert.rejects(applyMigration({ ...args, provider: { createUser: async (actor, input) => {
      if (++partialCalls === 1) return provider.createUser(actor, input);
      throw new Error('SECRET_NEVER_LOGGED');
    } } }), error => { failedPath = error.resultPath; assert.equal(error.message.includes('SECRET_NEVER_LOGGED'), false); return error.code === 'MIGRATION_UNCONFIRMED'; });
    const partial = JSON.parse(readFileSync(failedPath));
    assert.equal(partial.accounts[0].state, 'created'); assert.equal(partial.accounts[1].state, 'unconfirmed');
    const planPath = resolve(testRoot, '.local', 'account-migration-' + plan.id + '.json');
    writeNewPrivate(testRoot, planPath, plan);
    assert.deepEqual(readPrivatePlan(testRoot, planPath), plan);
    assert.throws(() => writeNewPrivate(testRoot, planPath, plan), { code: 'EEXIST' });
    const linked = resolve(testRoot, '.local', 'account-migration-' + randomUUID() + '.json');
    symlinkSync(planPath, linked);
    assert.throws(() => readPrivatePlan(testRoot, linked), { code: 'PLAN_FILE' });
    const { DatabaseSync } = await import('node:sqlite');
    const databasePath = resolve(testRoot, '.local/accounts.sqlite'), database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE accounts (id TEXT, username TEXT, display_name TEXT, role TEXT, status TEXT, updated_at TEXT, password_hash TEXT)');
    database.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?,?)').run(local[0].id, local[0].username, local[0].display_name, local[0].role, local[0].status, local[0].updated_at, 'NEVER_READ_LOCAL_HASH');
    database.close();
    const before = createHash('sha256').update(readFileSync(databasePath)).digest('hex');
    const selected = await readLocalAccounts(testRoot);
    assert.equal(selected.length, 1); assert.equal(JSON.stringify(selected).includes('NEVER_READ_LOCAL_HASH'), false);
    assert.equal(selected[0].affiliationType, 'personal'); assert.equal(selected[0].organizationName, '', 'A pre-affiliation SQLite schema has explicit personal defaults');
    assert.equal(createHash('sha256').update(readFileSync(databasePath)).digest('hex'), before);
    const upgraded = new DatabaseSync(databasePath);
    upgraded.exec("ALTER TABLE accounts ADD COLUMN affiliation_type TEXT NOT NULL DEFAULT 'personal'; ALTER TABLE accounts ADD COLUMN organization_name TEXT NOT NULL DEFAULT '';");
    upgraded.prepare('UPDATE accounts SET affiliation_type=?, organization_name=? WHERE id=?').run('school', local[0].organization_name, local[0].id);
    upgraded.prepare('INSERT INTO accounts (id,username,display_name,role,status,updated_at,password_hash,affiliation_type,organization_name) VALUES (?,?,?,?,?,?,?,?,?)').run(local[1].id, local[1].username, local[1].display_name, local[1].role, local[1].status, local[1].updated_at, 'NEVER_READ_OTHER_HASH', 'organization', unicodeName);
    upgraded.close();
    const upgradedHash = createHash('sha256').update(readFileSync(databasePath)).digest('hex');
    const withAffiliations = await readLocalAccounts(testRoot);
    assert.equal(withAffiliations.find(row => row.username === 'teacher-one').organizationName, '示例学校');
    assert.equal(withAffiliations.find(row => row.username === 'teacher-one').affiliationType, 'school');
    assert.equal(withAffiliations.find(row => row.username === 'teacher-two').organizationName, unicodeName);
    assert.equal(withAffiliations.find(row => row.username === 'teacher-two').affiliationType, 'organization');
    assert.equal(JSON.stringify(withAffiliations).includes('NEVER_READ_'), false);
    assert.equal(createHash('sha256').update(readFileSync(databasePath)).digest('hex'), upgradedHash, 'Both PRAGMA inspection and the new-field SELECT leave SQLite byte-for-byte unchanged');
    const partialRoot = resolve(testRoot, 'partial-schema'); mkdirSync(partialRoot); mkdirSync(resolve(partialRoot, '.local'));
    const partialDatabase = new DatabaseSync(resolve(partialRoot, '.local/accounts.sqlite'));
    partialDatabase.exec('CREATE TABLE accounts(id TEXT,username TEXT,display_name TEXT,role TEXT,status TEXT,updated_at TEXT,affiliation_type TEXT)'); partialDatabase.close();
    await assert.rejects(readLocalAccounts(partialRoot), { code: 'LOCAL_DATABASE' }, 'A partial column upgrade must not silently erase organization information');
    console.log('account migration self-test passed: old/new read-only SQLite schemas, complete affiliation preservation, source/plan tamper checks, private journal before create, cloud affiliation confirmation, conflict/admin/disabled protection and uncertain-result stop.');
  } finally { rmSync(testRoot, { recursive: true, force: true }); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  if (args.length === 1 && args[0] === '--help') {
    console.log('默认：只读账号资料，保存 .local 私有迁移计划，不复制密码或浏览器数据。\n用法：node scripts/migrate-local-accounts.mjs [--dry-run]\n执行：node scripts/migrate-local-accounts.mjs --apply .local/account-migration-<id>.json --admin <现有云管理员>\n仅允许把计划中的 action 改为 skip；冲突不会覆盖。--self-test 为无网络自测。'); return;
  }
  let apply, administrator;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run' && args.length === 1) continue;
    if (args[i] === '--apply' && !apply && args[i + 1]) apply = args[++i];
    else if (args[i] === '--admin' && !administrator && args[i + 1]) administrator = args[++i];
    else fail('ARGUMENTS', '参数无效。请使用 --help 查看 dry-run 与显式 apply 用法。');
  }
  if (!!apply !== !!administrator) fail('ARGUMENTS', '--apply 与 --admin 必须一起指定。');
  const localRows = await readLocalAccounts();
  let config;
  try { config = validateCloudEnvironment(loadCloudEnvironment()); }
  catch (error) { if (error.code !== 'CONFIG_MISSING' || apply) throw error; }
  const cloudRows = config ? await readCloudAccounts(createCloudReader(config)) : null;
  if (!apply) {
    const plan = buildMigrationPlan(localRows, cloudRows, config);
    const path = writeNewPrivate(ROOT, resolve(ROOT, '.local', 'account-migration-' + plan.id + '.json'), plan);
    console.log(plan.entries.map(entry => `${entry.username}: ${entry.role}, ${entry.action} (${entry.reason})`).join('\n') || '本地没有账号可迁移。');
    console.log('只读计划已保存：' + path);
    console.log(config ? '未创建或修改云账号。先核对计划；同名账号必须明确跳过，不自动绑定。' : '云配置未就绪；此离线计划不能 apply。填写配置后重新生成计划。');
    return;
  }
  const plan = readPrivatePlan(ROOT, apply);
  const result = await applyMigration({ plan, localRows, cloudRows, config, administrator, provider: createSupabaseProvider(config.env, { fetch: (url, options) => fetch(url, { ...options, redirect: 'error' }) }) });
  console.log('已创建云端账号：' + result.created + '。已有账号与本地数据未改动。');
  if (result.resultPath) console.log('新旧 ID 映射与初始密码仅保存在私有文件：' + result.resultPath + '\n通过私下渠道交给对应本人，登录后即可使用，也可在个人账号页主动改密；浏览器项目空间未自动迁移。');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof CloudToolError ? error.message : '账号迁移未完成，请检查本地私有文件与运行环境；没有执行自动重试。');
  if (error instanceof CloudToolError && error.resultPath) console.error('请核对私有结果：' + error.resultPath);
  process.exitCode = 1;
});
