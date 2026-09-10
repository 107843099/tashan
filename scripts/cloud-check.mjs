#!/usr/bin/env node
// Operator-only, read-only preflight. Never copy this script or its configuration into dist/.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_AUTH_EMAIL_DOMAIN'];
export const PROJECT_BUCKET = 'tashan-projects';
export const PROJECT_BUCKET_LIMIT = 10 * 1024 * 1024;
export const REQUIRED_RPCS = [
  'tashan_require_admin', 'tashan_register_account', 'tashan_register_account_profile', 'tashan_session_account', 'tashan_rate_limit',
  'tashan_begin_password_change', 'tashan_finish_password_change', 'tashan_update_account', 'tashan_list_accounts', 'tashan_list_audit',
  'tashan_project_list', 'tashan_project_get', 'tashan_project_versions', 'tashan_project_version', 'tashan_project_prepare',
  'tashan_project_commit', 'tashan_project_publish', 'tashan_project_unpublish', 'tashan_project_published', 'tashan_project_file',
  'tashan_project_reserve_upload', 'tashan_project_prepare_r2', 'tashan_project_upload_file', 'tashan_project_mark_verified', 'tashan_project_commit_r2'
];

export class CloudToolError extends Error {
  constructor(code, message) { super(message); this.name = 'CloudToolError'; this.code = code; }
}
const fail = (code, message) => { throw new CloudToolError(code, message); };

export function loadCloudEnvironment({ root = ROOT, environment = process.env } = {}) {
  let file = {};
  try {
    const content = readFileSync(resolve(root, '.dev.vars'), 'utf8');
    if (Buffer.byteLength(content) > 65536) fail('CONFIG_FILE', '私有配置文件过大，请核对 .dev.vars。');
    file = parseEnv(content);
  } catch (error) {
    if (error.code !== 'ENOENT') fail('CONFIG_FILE', '无法安全读取 .dev.vars，请检查文件格式与权限。');
  }
  // Select known keys; unrelated provider credentials never enter this tool's result.
  return Object.fromEntries(ENV_KEYS.map(key => [key, environment[key] === undefined ? file[key] || '' : environment[key]]));
}

export function validateCloudEnvironment(env) {
  const endpoint = String(env?.SUPABASE_URL || '').trim();
  const key = String(env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!endpoint || !key) fail('CONFIG_MISSING', '尚未配置 SUPABASE_URL 与 SUPABASE_SECRET_KEY（或兼容的 service-role 密钥）。');
  let url;
  try { url = new URL(endpoint); } catch { fail('CONFIG_URL', 'SUPABASE_URL 不是有效的项目地址。'); }
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('CONFIG_URL', 'SUPABASE_URL 必须是 HTTPS 项目根地址；本机 Supabase 可使用 HTTP 回环地址。');
  if (key.startsWith('sb_secret_')) {
    if (!/^sb_secret_[A-Za-z0-9_-]{12,}$/.test(key)) fail('CONFIG_KEY', '服务端 Secret key 格式无效。');
  } else {
    let claims;
    try {
      const parts = key.split('.');
      if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch { fail('CONFIG_KEY', '请配置服务端 Secret key 或旧版 service-role JWT，不能使用 publishable/anon key。'); }
    // This is only a format check; a real API request below validates the credential.
    if (claims.role !== 'service_role') fail('CONFIG_KEY', '旧版 JWT 必须是 service_role，不能使用 anon 或用户会话凭据。');
  }
  const domain = String(env?.SUPABASE_AUTH_EMAIL_DOMAIN || 'accounts.tashan.invalid').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) fail('CONFIG_DOMAIN', '内部账号域名配置无效。');
  const normalized = { SUPABASE_URL: url.origin, SUPABASE_SECRET_KEY: key, SUPABASE_AUTH_EMAIL_DOMAIN: domain };
  return { env: normalized, endpoint: url.origin, key, domain, target: createHash('sha256').update(url.origin + '\n' + domain).digest('hex') };
}

export function createCloudReader(config, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async function read(path, extraHeaders = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) fail('INVALID_PATH', '云端检查路径无效。');
    const headers = { apikey: config.key, Accept: 'application/json', ...extraHeaders };
    if (!config.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${config.key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(config.endpoint + path, { method: 'GET', headers, redirect: 'error', signal: controller.signal });
      if (!response.ok) fail('CLOUD_HTTP', `云服务检查未通过（HTTP ${response.status}）。请核对密钥、迁移和服务状态。`);
      try { return await response.json(); } catch { fail('CLOUD_RESPONSE', '云服务未返回有效的检查结果。'); }
    } catch (error) {
      if (error instanceof CloudToolError) throw error;
      fail('CLOUD_NETWORK', '无法连接云服务。请核对项目地址、网络和服务状态。');
    } finally { clearTimeout(timer); }
  };
}

export async function readCloudAccounts(read) {
  const rows = [];
  // Use explicit pagination; PostgREST can otherwise silently cap a directory at 1,000 rows.
  for (let offset = 0; offset < 100000; offset += 1000) {
    const batch = await read('/rest/v1/tashan_accounts?select=id,username,display_name,role,status,must_change_password&order=id.asc&limit=1000&offset=' + offset);
    if (!Array.isArray(batch)) fail('CLOUD_DIRECTORY', '云端账号目录格式无效。');
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  fail('CLOUD_DIRECTORY_LIMIT', '云端账号数量超出本工具的迁移范围，请分批核对。');
}

export async function runCloudChecks(env, options = {}) {
  let config;
  try { config = validateCloudEnvironment(env); }
  catch (error) { return { configured: false, ready: false, checks: [{ id: 'configuration', status: 'fail', code: error.code || 'CONFIG_INVALID', message: error instanceof CloudToolError ? error.message : '云配置无效。' }] }; }
  const read = createCloudReader(config, options);
  const checks = [{ id: 'configuration', status: 'pass', message: '已读取服务端配置；密钥未输出。' }];
  const inspect = async (id, action) => {
    try { return { id, status: 'pass', message: await action() }; }
    catch (error) { return { id, status: 'fail', code: error instanceof CloudToolError ? error.code : 'CHECK_FAILED', message: error instanceof CloudToolError ? error.message : '检查未完成，请核对迁移与服务配置。' }; }
  };
  const pending = [
    inspect('auth-settings', async () => {
      const settings = await read('/auth/v1/settings');
      if (settings.disable_signup !== true || settings.external?.anonymous_users !== false) fail('SIGNUP_ENABLED', '请在 Supabase Auth 关闭公开注册和匿名登录；本工具不会修改这些设置。');
      if (settings.external?.email !== true) fail('PASSWORD_AUTH_DISABLED', '请启用 Email/Password 提供方，供平台内部用户名映射登录。');
      return '公开注册和匿名登录已关闭，密码登录可用。';
    }),
    inspect('accounts-schema', async () => {
      const rows = await read('/rest/v1/tashan_accounts?select=id,affiliation_type,organization_name&limit=0');
      if (!Array.isArray(rows)) fail('ACCOUNT_SCHEMA', '账号表不可读取，请先执行账号迁移。');
      return '账号及学校／机构归属字段可由服务端读取。';
    }),
    inspect('administrator', async () => {
      const rows = await read('/rest/v1/tashan_accounts?select=id&role=eq.admin&status=eq.active&must_change_password=eq.false&limit=1');
      if (!Array.isArray(rows) || !rows.length) fail('ADMIN_REQUIRED', '尚无可用云端管理员。空环境先执行管理员引导；处于重置后待改密状态的管理员需先设置新密码。');
      return '存在可用且不处于重置后待改密状态的云端管理员。';
    }),
    ...['tashan_projects', 'tashan_project_versions', 'tashan_project_assets', 'tashan_project_upload_receipts'].map(table => inspect(table, async () => {
      const rows = await read('/rest/v1/' + table + '?select=' + (table==='tashan_project_upload_receipts'?'version_id':'id') + '&limit=0');
      if (!Array.isArray(rows)) fail('PROJECT_SCHEMA', '项目迁移表不可读取，请执行项目迁移。');
      return '项目迁移表已存在。';
    })),
    inspect('migration-functions', async () => {
      const schema = await read('/rest/v1/', { Accept: 'application/openapi+json' });
      const missing = REQUIRED_RPCS.filter(name => !schema?.paths?.['/rpc/' + name]);
      if (missing.length) fail('MIGRATION_FUNCTIONS', '缺少迁移函数或 OpenAPI 未公开函数目录：' + missing.join(', ') + '。请按顺序执行完整迁移并刷新 PostgREST schema cache。');
      return '账号与项目的必要 RPC 已注册；本检查未调用写入函数。';
    }),
    inspect('private-storage', async () => {
      const bucket = await read('/storage/v1/bucket/' + PROJECT_BUCKET);
      if (bucket.id !== PROJECT_BUCKET || bucket.public !== false) fail('BUCKET_NOT_PRIVATE', '项目存储桶不存在或不是私有桶，请核对项目迁移。');
      if (Number(bucket.file_size_limit) !== PROJECT_BUCKET_LIMIT) fail('BUCKET_FILE_LIMIT', '项目存储桶单文件上限应为 10 MiB；已有较大上限请核对后执行 cloud:storage -- --update-limit。');
      return 'tashan-projects 存储桶存在、为私有，且单文件上限为 10 MiB。';
    })
  ];
  checks.push(...await Promise.all(pending));
  return { configured: true, ready: checks.every(check => check.status === 'pass'), checks, note: '这是只读配置检查，不替代实际账号登录、跨账号权限、版本上传和发布撤回验收；尚未验证 Cloudflare 部署。' };
}

async function selfTest() {
  const { strict: assert } = await import('node:assert');
  const key = 'sb_secret_DO_NOT_PRINT_THIS_FIXTURE';
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: key };
  let calls = 0;
  const healthy = async (url, options) => {
    calls++;
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, key); assert.equal(options.headers.Authorization, undefined);
    const path = new URL(url).pathname;
    const value = path.endsWith('/settings') ? { disable_signup: true, external: { anonymous_users: false, email: true } }
      : path.includes('/bucket/') ? { id: PROJECT_BUCKET, public: false, file_size_limit: PROJECT_BUCKET_LIMIT }
      : path === '/rest/v1/' ? { paths: Object.fromEntries(REQUIRED_RPCS.map(name => ['/rpc/' + name, {}])) }
      : url.includes('role=eq.admin') ? [{ id: 'fixture-admin' }] : [];
    return new Response(JSON.stringify(value));
  };
  assert.equal((await runCloudChecks({}, { fetch: healthy })).configured, false);
  assert.equal(calls, 0);
  for (const patch of [{ SUPABASE_URL: 'https://user:secret@example.org/' }, { SUPABASE_URL: 'http://example.org' }, { SUPABASE_SECRET_KEY: 'sb_publishable_fixture' }]) {
    assert.equal((await runCloudChecks({ ...env, ...patch }, { fetch: healthy })).ready, false);
    assert.equal(calls, 0);
  }
  assert.equal((await runCloudChecks(env, { fetch: healthy })).ready, true);
  const badBucket = await runCloudChecks(env, { fetch: async (url, options) => url.includes('/bucket/') ? new Response(JSON.stringify({ id: PROJECT_BUCKET, public: true })) : healthy(url, options) });
  assert.equal(badBucket.ready, false); assert.equal(badBucket.checks.find(check => check.id === 'private-storage').code, 'BUCKET_NOT_PRIVATE');
  for (const limit of [null, 5 * 1024 * 1024, 20 * 1024 * 1024]) {
    const wrongLimit = await runCloudChecks(env, { fetch: async (url, options) => url.includes('/bucket/') ? Response.json({ id: PROJECT_BUCKET, public: false, file_size_limit: limit }) : healthy(url, options) });
    assert.equal(wrongLimit.ready, false); assert.equal(wrongLimit.checks.find(check => check.id === 'private-storage').code, 'BUCKET_FILE_LIMIT');
  }
  const openSignup = await runCloudChecks(env, { fetch: async (url, options) => url.endsWith('/settings') ? new Response(JSON.stringify({ disable_signup: false, external: { anonymous_users: true, email: true } })) : healthy(url, options) });
  assert.equal(openSignup.checks.find(check => check.id === 'auth-settings').code, 'SIGNUP_ENABLED');
  const incomplete = await runCloudChecks(env, { fetch: async (url, options) => new URL(url).pathname === '/rest/v1/' ? new Response(JSON.stringify({ paths: {} })) : healthy(url, options) });
  assert.equal(incomplete.checks.find(check => check.id === 'migration-functions').code, 'MIGRATION_FUNCTIONS');
  const oldProfile = await runCloudChecks(env, { fetch: async (url, options) => new URL(url).pathname === '/rest/v1/' ? Response.json({paths:Object.fromEntries(REQUIRED_RPCS.filter(name=>name!=='tashan_register_account_profile').map(name=>['/rpc/'+name,{}]))}) : healthy(url, options) });
  assert.equal(oldProfile.checks.find(check=>check.id==='migration-functions').code,'MIGRATION_FUNCTIONS');
  const oldColumns = await runCloudChecks(env, { fetch: async (url, options) => url.includes('select=id,affiliation_type,organization_name') ? Response.json({code:'42703'},{status:400}) : healthy(url, options) });
  assert.equal(oldColumns.checks.find(check=>check.id==='accounts-schema').status,'fail');
  const noAdmin = await runCloudChecks(env, { fetch: async (url, options) => url.includes('role=eq.admin') ? new Response('[]') : healthy(url, options) });
  assert.equal(noAdmin.checks.find(check => check.id === 'administrator').code, 'ADMIN_REQUIRED');
  const failure = await runCloudChecks(env, { fetch: async () => { throw new Error(key); } });
  assert.equal(JSON.stringify(failure).includes(key), false); assert.equal(failure.ready, false);
  const legacy = 'fixture.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
  const legacyConfig = validateCloudEnvironment({ ...env, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: legacy });
  await createCloudReader(legacyConfig, { fetch: async (url, options) => { assert.equal(options.headers.Authorization, 'Bearer ' + legacy); return new Response('{}'); } })('/auth/v1/settings');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const temporary = mkdtempSync(resolve(tmpdir(), 'tashan-cloud-check-'));
  try {
    writeFileSync(resolve(temporary, '.dev.vars'), 'SUPABASE_URL=https://file.example.org\nSUPABASE_SECRET_KEY=' + key + '\nUNRELATED_PRIVATE_KEY=never-forward\n', { mode: 0o600 });
    const loaded = loadCloudEnvironment({ root: temporary, environment: { SUPABASE_URL: env.SUPABASE_URL } });
    assert.equal(loaded.SUPABASE_URL, env.SUPABASE_URL); assert.equal(loaded.SUPABASE_SECRET_KEY, key);
    assert.equal(JSON.stringify(loaded).includes('never-forward'), false);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  console.log('cloud-check self-test passed: read-only requests, missing/invalid configuration, private bucket, closed signup and redacted failures.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  if (args.some(arg => !['--json', '--help'].includes(arg))) fail('ARGUMENTS', '用法：node scripts/cloud-check.mjs [--json] [--help]；--self-test 为无网络自测。');
  if (args.includes('--help')) { console.log('只读检查 Supabase 配置、注册策略、账号/项目迁移、管理员和私有存储。默认读取 .dev.vars，已有环境变量优先。\n用法：node scripts/cloud-check.mjs [--json]'); return; }
  const result = await runCloudChecks(loadCloudEnvironment());
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.checks.map(check => `${check.status === 'pass' ? '✓' : '×'} ${check.id}: ${check.message}`).join('\n') + (result.note ? '\n' + result.note : ''));
  if (!result.ready) process.exitCode = result.configured ? 1 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof CloudToolError ? error.message : '云端检查未完成；请核对运行环境与配置。'); process.exitCode = 1; });
