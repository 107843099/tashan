// Development only: the hosting Worker never imports this module.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateAffiliation } from './api.mjs';
import { AI_PROMPT_TASKS, validatePromptTask, validatePromptUpdate, resolvePromptConfig, promptStorageError } from './ai-prompts.mjs';

const derive = promisify(scrypt);
const now = () => new Date().toISOString();
const digest = value => createHash('sha256').update(String(value || '')).digest('hex');
const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
const canonical = value => String(value || '').trim().toLowerCase();
function validateUsername(value) {
  const username = canonical(value);
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) throw failure(400, 'INVALID_USERNAME', '账号名需为 3–32 位字母、数字、下划线或连字符。');
  return username;
}
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72 || Buffer.byteLength(value, 'utf8') > 72) throw failure(400, 'INVALID_PASSWORD', '密码至少 8 位，可以只用数字；总长度不能超过 72 字节。');
}
function displayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(value)) throw failure(400, 'INVALID_DISPLAY_NAME', '请填写 1–60 位显示名称。');
  return value.trim();
}
async function passwordHash(password, salt = randomBytes(24).toString('hex')) {
  const key = await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function passwordMatches(password, hash) {
  const [scheme, salt, expected] = String(hash).split('$');
  if (scheme !== 'scrypt' || !salt || !expected || typeof password !== 'string' || password.length > 128) return false;
  const calculated = (await passwordHash(password, salt)).split('$')[2];
  const left = Buffer.from(calculated, 'hex'), right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role, status: row.status,
    mustChangePassword: Boolean(row.must_change_password), createdAt: row.created_at, updatedAt: row.updated_at,
    affiliationType:row.affiliation_type || 'personal', organizationName:row.organization_name || '' };
}
function hasOnlyInitialPasswordRequirement(account, history) {
  const creation = history.filter(event => event.action === 'account.created');
  if (creation.length !== 1) return false;
  const first = creation[0];
  if (!first.actor_id || first.actor_id === account.id || !Number.isFinite(Date.parse(first.created_at)) || !Number.isFinite(Date.parse(account.created_at)) || Date.parse(first.created_at) < Date.parse(account.created_at)) return false;
  return history.every(event => {
    if (!event.actor_id) return false;
    let details;
    try { details = JSON.parse(event.details); } catch { return false; }
    if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
    if (event.action === 'account.created') return details.username === account.username && details.role === account.role && Object.keys(details).every(key => ['username','role'].includes(key));
    if (event.action === 'account.updated') return Object.keys(details).every(key => ['displayName','role','status'].includes(key));
    // Unlike Supabase's account audit, the local audit also records logins.
    if (event.action === 'auth.login') return event.actor_id === account.id && Object.keys(details).length === 0;
    return false; // Unknown or future credential actions require manual review.
  });
}

export class LocalProvider {
  constructor(path) {
    // Local development has one server process. Briefly replay a successful refresh
    // so concurrent requests/tabs do not invalidate each other's freshly set cookie.
    // Tokens are never persisted here; production uses Supabase's durable reuse window.
    this.refreshReplay = new Map();
    if (path !== ':memory:') { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); chmodSync(dirname(path), 0o700); }
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
        must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        access_hash TEXT UNIQUE NOT NULL, refresh_hash TEXT UNIQUE NOT NULL,
        access_until INTEGER NOT NULL, refresh_until INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT,
        details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_prompts (
        task TEXT PRIMARY KEY CHECK(task IN ('upload','teaching','prompt')), prompt TEXT,
        revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
        updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT
      );
    `);
    this.upgradeAffiliation();
    this.upgradeInitialPasswordPolicy();
  }
  upgradeAffiliation() {
    this.transaction(() => {
      const columns = new Set(this.db.prepare('PRAGMA table_info(accounts)').all().map(column => column.name));
      if (!columns.has('affiliation_type')) this.db.exec("ALTER TABLE accounts ADD COLUMN affiliation_type TEXT NOT NULL DEFAULT 'personal' CHECK(affiliation_type IN ('personal','school','organization'))");
      if (!columns.has('organization_name')) this.db.exec("ALTER TABLE accounts ADD COLUMN organization_name TEXT NOT NULL DEFAULT ''");
    });
  }
  upgradeInitialPasswordPolicy() {
    // One atomic upgrade: clear only a proven initial-assignment requirement.
    // Password reset/changed history, ambiguous creation and disabled accounts
    // retain their protection. A restart must never clear a later reset flag.
    this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM audit WHERE action='system.initial_password_optional' LIMIT 1").get()) return;
      const history = this.db.prepare('SELECT actor_id,action,details,created_at FROM audit WHERE target_id=?');
      const eligible = this.db.prepare("SELECT id,username,role,created_at FROM accounts WHERE status='active' AND must_change_password=1").all()
        .filter(account => hasOnlyInitialPasswordRequirement(account, history.all(account.id)));
      const timestamp = now();
      for (const { id } of eligible) {
        this.db.prepare('UPDATE accounts SET must_change_password=0, updated_at=? WHERE id=?').run(timestamp, id);
        this.record(null, 'account.initial_password_requirement_removed', id, { reason: 'initial-assignment-policy' });
      }
      this.record(null, 'system.initial_password_optional', null, { version: 1, updatedAccounts: eligible.length });
    });
  }
  status() { return { configured: true, mode: 'local', needsSetup: this.db.prepare('SELECT count(*) AS count FROM accounts').get().count === 0 }; }
  close() { this.refreshReplay.clear(); this.db.close(); }
  transaction(operation) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  record(actor, action, target, details = {}) {
    this.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(randomUUID(), actor?.id || null, action, target || null, JSON.stringify(details), now());
  }
  account(id) { return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id); }
  requireAdmin(actor) {
    const current = this.account(actor?.id || '');
    if (!current || current.status !== 'active' || current.role !== 'admin') throw failure(403, 'FORBIDDEN', '仅管理员可执行此操作。');
    if (current.must_change_password) throw failure(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改管理员重置的密码。');
    return current;
  }
  async rateLimit(key, { limit, windowSeconds }) {
    const stamp = Date.now();
    return this.transaction(() => {
      this.db.prepare('DELETE FROM rate_limits WHERE until < ?').run(stamp);
      const existing = this.db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(digest(key));
      if (existing && existing.count >= limit) throw failure(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试。');
      this.db.prepare('INSERT INTO rate_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count = count + 1').run(digest(key), 1, stamp + windowSeconds * 1000);
      return true;
    });
  }
  issue(userId, existingId) {
    const accessToken = randomBytes(32).toString('base64url'), refreshToken = randomBytes(40).toString('base64url');
    const stamp = Date.now();
    this.db.prepare('DELETE FROM sessions WHERE refresh_until < ?').run(stamp);
    if (existingId) this.db.prepare('DELETE FROM sessions WHERE id = ?').run(existingId);
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(randomUUID(), userId, digest(accessToken), digest(refreshToken), stamp + 900000, stamp + 7 * 86400000);
    return { accessToken, refreshToken, expiresIn: 900 };
  }
  async login(username, password) {
    const row = this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(canonical(username));
    // Perform the same expensive operation for unknown usernames.
    const matched = row ? await passwordMatches(password, row.password_hash) : (await passwordHash(String(password || '').slice(0, 128)), false);
    if (!matched || !row || row.status !== 'active') throw failure(401, 'INVALID_CREDENTIALS', '账号或密码不正确，或账号已停用。');
    return this.transaction(() => {
      const current = this.account(row.id);
      if (current.status !== 'active' || current.password_hash !== row.password_hash) throw failure(401, 'INVALID_CREDENTIALS', '账号或密码不正确，或账号已停用。');
      const session = this.issue(current.id);
      this.record(current, 'auth.login', current.id);
      return { user: publicUser(current), session };
    });
  }
  async authenticate(accessToken, refreshToken) {
    if (!accessToken && !refreshToken) return null;
    const stamp = Date.now();
    let row = accessToken && this.db.prepare('SELECT * FROM sessions WHERE access_hash = ? AND access_until > ?').get(digest(accessToken), stamp);
    let refresh = false;
    if (!row && refreshToken) {
      const refreshHash = digest(refreshToken);
      row = this.db.prepare('SELECT * FROM sessions WHERE refresh_hash = ? AND refresh_until > ?').get(refreshHash, stamp);
      refresh = Boolean(row);
      if (!row) {
        const replay = this.refreshReplay.get(refreshHash);
        if (replay && replay.until > stamp) {
          const currentSession = this.db.prepare('SELECT * FROM sessions WHERE refresh_hash = ? AND refresh_until > ?').get(digest(replay.session.refreshToken), stamp);
          const currentAccount = currentSession && this.account(currentSession.user_id);
          // Revocation still wins over replay, including logout, reset and disable.
          if (currentAccount?.status === 'active') return { user: publicUser(currentAccount), session: { ...replay.session } };
        }
        this.refreshReplay.delete(refreshHash);
      }
    }
    if (!row) return null;
    const account = this.account(row.user_id);
    if (!account || account.status !== 'active') return null;
    if (refresh) {
      const result = this.transaction(() => ({ user: publicUser(account), session: this.issue(account.id, row.id) }));
      const key = digest(refreshToken);
      if (this.refreshReplay.size >= 1000) this.refreshReplay.delete(this.refreshReplay.keys().next().value);
      this.refreshReplay.set(key, { session: { ...result.session }, until: stamp + 10000 });
      const expiry = setTimeout(() => this.refreshReplay.delete(key), 10000);
      expiry.unref?.();
      return result;
    }
    return { user: publicUser(account) };
  }
  async logout(accessToken, refreshToken) {
    const replay = this.refreshReplay.get(digest(refreshToken));
    this.db.prepare('DELETE FROM sessions WHERE access_hash = ? OR refresh_hash = ? OR refresh_hash = ?').run(digest(accessToken), digest(refreshToken), digest(replay?.session.refreshToken));
    this.refreshReplay.delete(digest(refreshToken));
  }
  async changePassword(actor, currentPassword, newPassword) {
    validatePassword(newPassword);
    const row = this.account(actor?.id || '');
    if (!row || row.status !== 'active' || !await passwordMatches(currentPassword, row.password_hash)) throw failure(400, 'CURRENT_PASSWORD_INVALID', '当前密码不正确。');
    if (currentPassword === newPassword) throw failure(400, 'PASSWORD_UNCHANGED', '新密码不能与当前密码相同。');
    const hash = await passwordHash(newPassword);
    return this.transaction(() => {
      const current = this.account(row.id);
      if (current.status !== 'active' || current.password_hash !== row.password_hash) throw failure(409, 'ACCOUNT_CHANGED', '账号已更新，请重新登录。');
      this.db.prepare('UPDATE accounts SET password_hash=?, must_change_password=0, updated_at=? WHERE id=?').run(hash, now(), row.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
      this.record(actor, 'auth.password_changed', row.id);
      return { user: publicUser(this.account(row.id)), session: this.issue(row.id) };
    });
  }
  async listUsers(actor, { query = '', page = 1 } = {}) {
    this.requireAdmin(actor);
    const pattern = '%' + String(query).replace(/[\\%_]/g, '\\$&') + '%';
    const where = "username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\'";
    const total = this.db.prepare(`SELECT count(*) AS count FROM accounts WHERE ${where}`).get(pattern, pattern).count;
    const pageSize = 20;
    const users = this.db.prepare(`SELECT * FROM accounts WHERE ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).all(pattern, pattern, pageSize, (page - 1) * pageSize).map(publicUser);
    return { users, total, page, pageSize };
  }
  async createUser(actor, input) {
    this.requireAdmin(actor);
    const username = validateUsername(input.username), name = displayName(input.displayName), affiliation = validateAffiliation(input);
    validatePassword(input.password);
    if (!['admin', 'member'].includes(input.role)) throw failure(400, 'INVALID_ROLE', '账号角色无效。');
    const hash = await passwordHash(input.password);
    return this.transaction(() => {
      this.requireAdmin(actor);
      if (this.db.prepare('SELECT id FROM accounts WHERE username=?').get(username)) throw failure(409, 'USERNAME_EXISTS', '这个账号名已存在。');
      const id = randomUUID(), timestamp = now();
      this.db.prepare('INSERT INTO accounts (id,username,display_name,password_hash,role,status,must_change_password,created_at,updated_at,affiliation_type,organization_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, username, name, hash, input.role, 'active', 0, timestamp, timestamp, affiliation.affiliationType, affiliation.organizationName);
      this.record(actor, 'account.created', id, { username, role: input.role, ...affiliation });
      return publicUser(this.account(id));
    });
  }
  async updateUser(actor, id, patch) {
    return this.transaction(() => {
      this.requireAdmin(actor);
      const row = this.account(id);
      if (!row) throw failure(404, 'USER_NOT_FOUND', '未找到账号。');
      const name = patch.displayName === undefined ? row.display_name : displayName(patch.displayName);
      const affiliation = validateAffiliation({affiliationType:row.affiliation_type, organizationName:row.organization_name, ...validateAffiliation(patch,{partial:true})});
      const role = patch.role ?? row.role, status = patch.status ?? row.status;
      if (!['admin', 'member'].includes(role) || !['active', 'disabled'].includes(status)) throw failure(400, 'INVALID_ACCOUNT', '账号状态或角色无效。');
      if (id === actor.id && (role !== row.role || status !== 'active')) throw failure(400, 'SELF_PROTECTION', '不能停用自己或移除自己的管理员权限。');
      if (row.role === 'admin' && row.status === 'active' && (role !== 'admin' || status !== 'active')) {
        const count = this.db.prepare("SELECT count(*) AS count FROM accounts WHERE role='admin' AND status='active'").get().count;
        if (count <= 1) throw failure(409, 'LAST_ADMIN', '至少需要保留一个启用的管理员。');
      }
      this.db.prepare('UPDATE accounts SET display_name=?, role=?, status=?, updated_at=?, affiliation_type=?, organization_name=? WHERE id=?').run(name, role, status, now(), affiliation.affiliationType, affiliation.organizationName, id);
      if (role !== row.role || status !== row.status) this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      this.record(actor, 'account.updated', id, { displayName: name, role, status, ...affiliation });
      return publicUser(this.account(id));
    });
  }
  async resetPassword(actor, id, password) {
    this.requireAdmin(actor); validatePassword(password);
    if (id === actor.id) throw failure(400, 'USE_PASSWORD_CHANGE', '请在账号设置中修改自己的密码。');
    const hash = await passwordHash(password);
    return this.transaction(() => {
      this.requireAdmin(actor);
      if (!this.account(id)) throw failure(404, 'USER_NOT_FOUND', '未找到账号。');
      this.db.prepare('UPDATE accounts SET password_hash=?, must_change_password=1, updated_at=? WHERE id=?').run(hash, now(), id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      this.record(actor, 'account.password_reset', id);
      return publicUser(this.account(id));
    });
  }
  async listAudit(actor) {
    this.requireAdmin(actor);
    return { events: this.db.prepare('SELECT a.*, u.username AS actor_username, t.username AS target_username FROM audit a LEFT JOIN accounts u ON u.id=a.actor_id LEFT JOIN accounts t ON t.id=a.target_id ORDER BY a.created_at DESC, a.id DESC LIMIT 100').all().map(row => ({
      id: row.id, actorId: row.actor_id, actorUsername: row.actor_username, targetId: row.target_id,
      targetUsername: row.target_username, action: row.action, details: JSON.parse(row.details), createdAt: row.created_at
    })) };
  }
  getAiPrompt(task) {
    validatePromptTask(task);
    try {
      const row=this.db.prepare('SELECT p.*,a.username,a.display_name FROM ai_prompts p LEFT JOIN accounts a ON a.id=p.updated_by WHERE p.task=?').get(task);
      return resolvePromptConfig(task,row?{task:row.task,prompt:row.prompt,revision:row.revision,updatedAt:row.updated_at,updatedBy:{id:row.updated_by,username:row.username,displayName:row.display_name}}:null);
    }catch{throw promptStorageError();}
  }
  async listAiPrompts(actor) {
    try{this.requireAdmin(actor);return {prompts:AI_PROMPT_TASKS.map(task=>this.getAiPrompt(task))};}
    catch(error){if(error.status)throw error;throw promptStorageError();}
  }
  async updateAiPrompt(actor,task,changes) {
    validatePromptTask(task);const input=validatePromptUpdate(changes);
    try{return this.transaction(()=>{
      this.requireAdmin(actor);
      const row=this.db.prepare('SELECT revision FROM ai_prompts WHERE task=?').get(task);
      if((row?.revision||0)!==input.expectedRevision)throw failure(409,'AI_PROMPT_CONFLICT','AI 指令已由另一位管理员更新，请重新读取后再修改。');
      const revision=input.expectedRevision+1;
      this.db.prepare('INSERT INTO ai_prompts(task,prompt,revision,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT(task) DO UPDATE SET prompt=excluded.prompt,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(task,input.prompt,revision,now(),actor.id);
      this.record(actor,'ai_prompt.updated',null,{task,revision,reset:input.prompt===null});
      return this.getAiPrompt(task);
    });}catch(error){if(error.status)throw error;throw promptStorageError();}
  }
  async bootstrap({ username, password, displayName: name }) {
    const login = validateUsername(username);
    validatePassword(password);
    const label = displayName(name || login), hash = await passwordHash(password);
    return this.transaction(() => {
      if (this.db.prepare('SELECT count(*) AS count FROM accounts').get().count) throw failure(409, 'ALREADY_INITIALIZED', '本地账号库已初始化，不能覆盖已有账号。');
      const id = randomUUID(), timestamp = now();
      this.db.prepare('INSERT INTO accounts (id,username,display_name,password_hash,role,status,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, login, label, hash, 'admin', 'active', 0, timestamp, timestamp);
      this.record({ id }, 'account.bootstrap', id, { localDevelopment: true });
      return publicUser(this.account(id));
    });
  }
}
