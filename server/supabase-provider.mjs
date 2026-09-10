import { ApiError, validateUsername, validatePassword, validateDisplayName, validateAffiliation } from './api.mjs';
import { AI_PROMPT_TASKS, validatePromptTask, validatePromptUpdate, resolvePromptConfig, promptStorageError } from './ai-prompts.mjs';

const account = row => row ? ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, status: row.status, mustChangePassword: row.must_change_password, createdAt: row.created_at, updatedAt: row.updated_at, affiliationType:row.affiliation_type || 'personal', organizationName:row.organization_name || '' }) : null;
const session = data => ({ accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
const unavailable = () => new ApiError(503, 'ACCOUNT_SERVICE_UNAVAILABLE', '账号服务暂时不可用，请稍后重试。');
const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_ERRORS = {
  E_FORBIDDEN: [403, 'FORBIDDEN', '没有执行此操作的权限。'],
  E_NOT_FOUND: [404, 'ACCOUNT_NOT_FOUND', '账号不存在。'],
  E_USERNAME_TAKEN: [409, 'USERNAME_TAKEN', '这个用户名已被使用。'],
  E_SELF_LOCKOUT: [409, 'SELF_LOCKOUT', '不能通过此操作停用或降级当前管理员。'],
  E_LAST_ADMIN: [409, 'LAST_ADMIN', '至少需要保留一个可用的管理员账号。'],
  E_ACCOUNT_BUSY: [409, 'ACCOUNT_BUSY', '这个账号正在修改密码，请稍后重试。'],
  E_BOOTSTRAP_CLOSED: [409, 'BOOTSTRAP_CLOSED', '初始管理员已创建，请通过管理员工作台管理账号。'],
  E_INVALID_INPUT: [400, 'INVALID_INPUT', '账号信息格式无效。'],
  E_INVALID_AFFILIATION: [400, 'INVALID_AFFILIATION_TYPE', '请选择个人、学校或机构。'],
  E_INVALID_ORGANIZATION: [400, 'INVALID_ORGANIZATION_NAME', '学校或机构名称需为 1–100 个字符，不能包含控制字符。'],
  E_AI_PROMPT_INVALID: [400, 'AI_PROMPT_INVALID', 'AI 指令或当前版本号无效。'],
  E_AI_PROMPT_CONFLICT: [409, 'AI_PROMPT_CONFLICT', 'AI 指令已由另一位管理员更新，请重新读取后再修改。']
};
function trustedClaims(token) {
  // Only inspect a token AFTER Auth has validated it with GET /user.
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part));
  } catch { return {}; }
}

/** No SDK session singleton: every request uses explicit credentials to prevent cross-user leakage. */
export function createSupabaseProvider(env, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const endpoint = String(env?.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY || '');
  const emailDomain = String(env?.SUPABASE_AUTH_EMAIL_DOMAIN || 'accounts.tashan.invalid').toLowerCase();
  let isConfigured = !!(endpoint && key && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(emailDomain));
  try { const url = new URL(endpoint); isConfigured &&= url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); } catch { isConfigured = false; }
  function requireConfig() { if (!isConfigured) throw new ApiError(503, 'ACCOUNT_SERVICE_UNAVAILABLE', '账号服务尚未配置，请联系管理员。'); }
  const email = username => `${validateUsername(username)}@${emailDomain}`;
  async function request(path, { method = 'GET', body, bearer = key, allowInvalidAuth = false, signal, requireJson200 = false } = {}) {
    requireConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      const headers = { apikey: key, 'Content-Type': 'application/json' };
      // Current sb_secret keys are opaque API keys, not JWT bearer tokens.
      if (bearer !== key || !key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${bearer}`;
      response = await fetchImpl(endpoint + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal,controller.signal]) : controller.signal });
    } catch { throw unavailable(); } finally { clearTimeout(timeout); }
    // A missing JSONB RPC row is HTTP 200 with JSON null. Other successful
    // statuses cannot prove absence; never silently replace saved AI settings.
    if (requireJson200 && response.ok && response.status !== 200) throw unavailable();
    let result = null;
    if (response.status !== 204) { try { result = await response.json(); } catch { if (response.ok) throw unavailable(); } }
    if (!response.ok) {
      const known = SQL_ERRORS[result?.message];
      if (known) throw new ApiError(...known);
      if (response.status === 429) throw new ApiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后重试。');
      if (allowInvalidAuth && [400, 401, 403, 422].includes(response.status)) return null;
      if (['email_exists', 'user_already_exists'].includes(result?.error_code) || result?.code === '23505') throw new ApiError(409, 'USERNAME_TAKEN', '这个用户名已被使用。');
      if (['weak_password', 'same_password'].includes(result?.error_code)) throw new ApiError(400, 'INVALID_PASSWORD', '密码未满足账号服务要求，请使用更长且未使用过的密码。');
      throw unavailable();
    }
    return result;
  }
  const rpc = (name, body) => request('/rest/v1/rpc/' + name, { method: 'POST', body });
  async function promptRpc(name,body,{signal}={}){
    try{return await request('/rest/v1/rpc/'+name,{method:'POST',body,signal,requireJson200:true});}catch(error){if(error.status===403||error.code?.startsWith('AI_PROMPT_'))throw error;throw promptStorageError();}
  }
  async function authIdentity(accessToken) {
    if (!accessToken) return null;
    const data = await request('/auth/v1/user', { bearer: accessToken, allowInvalidAuth: true });
    if (!data?.id) return null;
    const claims = trustedClaims(accessToken);
    if (claims.sub !== data.id || !UUID.test(claims.session_id || '')) return null;
    // A valid JWT alone is insufficient after logout, disable, reset or role changes.
    const row = await rpc('tashan_session_account', { p_user: data.id, p_session: claims.session_id });
    return account(row);
  }
  async function passwordLogin(username, password) {
    return request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email(username), password }, allowInvalidAuth: true });
  }
  async function signOut(accessToken) {
    if (accessToken) await request('/auth/v1/logout?scope=local', { method: 'POST', bearer: accessToken, allowInvalidAuth: true });
  }
  async function makeAccount(actor, input, bootstrap = false) {
    const username = validateUsername(input.username), displayName = validateDisplayName(input.displayName), affiliation = validateAffiliation(input);
    validatePassword(input.password);
    if (!['member', 'admin'].includes(input.role)) throw new ApiError(400, 'INVALID_ROLE', '请选择有效的角色。');
    // Database authorization runs both before creating an Auth identity and at registration.
    if (!bootstrap) await rpc('tashan_require_admin', { p_actor: actor.id });
    const data = await request('/auth/v1/admin/users', { method: 'POST', body: { email: email(username), password: input.password, email_confirm: true, app_metadata: { tashan_managed: true } } });
    const id = data?.id || data?.user?.id;
    if (!UUID.test(id || '')) throw unavailable();
    try {
      return account(await rpc('tashan_register_account_profile', { p_actor: actor?.id || null, p_id: id, p_username: username, p_display_name: displayName, p_role: input.role, p_bootstrap: bootstrap, p_affiliation_type:affiliation.affiliationType, p_organization_name:affiliation.organizationName }));
    } catch (error) {
      // Only this operation's newly-created, unregistered identity is removed.
      // If registration response was lost, first check ownership to avoid deleting a live account.
      try {
        const registered = await request('/rest/v1/tashan_accounts?select=id&id=eq.' + encodeURIComponent(id));
        if (Array.isArray(registered) && registered.length === 0) await request('/auth/v1/admin/users/' + id, { method: 'DELETE' });
      } catch { /* An orphaned Auth identity has no directory entry and cannot access the platform. */ }
      throw error;
    }
  }
  async function replacePassword(actor, id, password, adminReset) {
    validatePassword(password);
    if (!UUID.test(id || '')) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '账号不存在。');
    const operation = await rpc('tashan_begin_password_change', { p_actor: actor.id, p_id: id, p_admin_reset: adminReset });
    let changed = false;
    try {
      await request('/auth/v1/admin/users/' + id, { method: 'PUT', body: { password } });
      changed = true;
      const row = await rpc('tashan_finish_password_change', { p_id: id, p_lock: operation.lock, p_actor: actor.id, p_admin_reset: adminReset, p_success: true });
      return account(row);
    } catch (error) {
      if (!changed) {
        try { await rpc('tashan_finish_password_change', { p_id: id, p_lock: operation.lock, p_actor: actor.id, p_admin_reset: adminReset, p_success: false }); } catch { /* Lock expires after five minutes; access stays closed during uncertainty. */ }
      }
      throw error;
    }
  }
  const provider = {
    status: async () => ({ configured: isConfigured, mode: 'supabase' }),
    rateLimit: async (value, { limit, windowSeconds }) => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      const hash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
      if (!await rpc('tashan_rate_limit', { p_key_hash: hash, p_limit: limit, p_window_seconds: windowSeconds })) throw new ApiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后重试。');
    },
    login: async (username, password) => {
      const data = await passwordLogin(username, password);
      if (!data?.access_token) throw invalidCredentials();
      const user = await authIdentity(data.access_token);
      if (!user) { await signOut(data.access_token); throw invalidCredentials(); }
      return { user, session: session(data) };
    },
    authenticate: async (accessToken, refreshToken) => {
      if (accessToken) {
        const user = await authIdentity(accessToken);
        if (user) return { user };
      }
      if (!refreshToken) return null;
      const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken }, allowInvalidAuth: true });
      if (!data?.access_token) return null;
      const user = await authIdentity(data.access_token);
      if (!user) { await signOut(data.access_token); return null; }
      return { user, session: session(data) };
    },
    logout: async (accessToken, refreshToken) => {
      // Refresh an expired access token so logout still revokes the refresh session.
      if (accessToken && await request('/auth/v1/user', { bearer: accessToken, allowInvalidAuth: true })) return signOut(accessToken);
      if (refreshToken) {
        const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken }, allowInvalidAuth: true });
        if (data?.access_token) await signOut(data.access_token);
      }
    },
    changePassword: async (user, currentPassword, newPassword) => {
      validatePassword(newPassword);
      const proof = await passwordLogin(user.username, currentPassword);
      if (!proof?.access_token || proof.user?.id !== user.id) throw new ApiError(401, 'INCORRECT_PASSWORD', '当前密码不正确。');
      try {
        if (!await authIdentity(proof.access_token)) throw new ApiError(401, 'UNAUTHENTICATED', '账号状态已变更，请重新登录。');
        await replacePassword(user, user.id, newPassword, false);
      } finally { try { await signOut(proof.access_token); } catch {} }
      return provider.login(user.username, newPassword);
    },
    listUsers: async (actor, { query = '', page = 1 } = {}) => {
      const result = await rpc('tashan_list_accounts', { p_actor: actor.id, p_query: query, p_page: page });
      return { ...result, users: result.users.map(account) };
    },
    createUser: (actor, input) => makeAccount(actor, input),
    updateUser: async (actor, id, changes) => {
      if (!UUID.test(id || '')) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '账号不存在。');
      return account(await rpc('tashan_update_account', { p_actor: actor.id, p_id: id, p_changes: {...changes,...validateAffiliation(changes,{partial:true})} }));
    },
    resetPassword: (actor, id, password) => replacePassword(actor, id, password, true),
    listAudit: async actor => {
      const result = await rpc('tashan_list_audit', { p_actor: actor.id });
      return { events: result.events.map(event => ({ id: String(event.id), action: event.action, details: event.details, createdAt: event.created_at, actorUsername: event.actor_username, targetUsername: event.target_username })) };
    },
    getAiPrompt:async(task,{signal}={})=>{
      validatePromptTask(task);return resolvePromptConfig(task,await promptRpc('tashan_get_ai_prompt',{p_task:task},{signal}));
    },
    listAiPrompts:async actor=>{
      const result=await promptRpc('tashan_list_ai_prompts',{p_actor:actor.id});
      if(!Array.isArray(result?.prompts)||result.prompts.some(row=>!row||!AI_PROMPT_TASKS.includes(row.task))||new Set(result.prompts.map(row=>row.task)).size!==result.prompts.length)throw promptStorageError();
      return {prompts:AI_PROMPT_TASKS.map(task=>resolvePromptConfig(task,result.prompts.find(row=>row.task===task)||null))};
    },
    updateAiPrompt:async(actor,task,changes)=>{
      validatePromptTask(task);const input=validatePromptUpdate(changes);
      const result=await promptRpc('tashan_update_ai_prompt',{p_actor:actor.id,p_task:task,p_prompt:input.prompt,p_expected_revision:input.expectedRevision});
      if(result===null)throw promptStorageError();return resolvePromptConfig(task,result);
    },
    // Exposed to the private CLI only, never routed by handleApi.
    bootstrapAdmin: input => makeAccount(null, { ...input, role: 'admin' }, true)
  };
  return Object.freeze(provider);
}
