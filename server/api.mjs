// The browser receives account data only. Provider credentials and tokens stay server-side.
import { handleProjectRequest } from './projects-api.mjs';
import { AI_LIMITS, validateAiInput } from './ai-provider.mjs';
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const PREFIX = '/api/v1';
const ACCESS = 'tashan_access';
const REFRESH = 'tashan_refresh';
const BODY_LIMIT = 16 * 1024;
const USER_FIELDS = ['id', 'username', 'displayName', 'role', 'status', 'mustChangePassword', 'createdAt', 'updatedAt'];
export const publicUser = user => user ? {...Object.fromEntries(USER_FIELDS.map(key => [key, user[key]])), affiliationType:user.affiliationType || 'personal', organizationName:user.affiliationType && user.affiliationType !== 'personal' ? user.organizationName || '' : ''} : null;
// Partial patches are validated here, then merged with the locked database row
// by each provider. Omitting these fields must never reset an existing profile.
export function validateAffiliation(input, {partial = false} = {}) {
  const hasType = Object.hasOwn(input, 'affiliationType'), hasName = Object.hasOwn(input, 'organizationName');
  if (partial && !hasType && !hasName) return {};
  const type = hasType ? input.affiliationType : partial ? undefined : 'personal';
  if (type !== undefined && !['personal','school','organization'].includes(type)) fail(400, 'INVALID_AFFILIATION_TYPE', '请选择个人、学校或机构。');
  if (type === 'personal') return {affiliationType:type, organizationName:''};
  const result = type === undefined ? {} : {affiliationType:type};
  if (hasName || !partial) {
    const name = input.organizationName;
    if (typeof name !== 'string' || /\p{Cc}/u.test(name) || !name.trim() || Array.from(name.trim()).length > 100) fail(400, 'INVALID_ORGANIZATION_NAME', '学校或机构名称需为 1–100 个字符，不能包含控制字符。');
    result.organizationName = name.trim();
  }
  return result;
}
export function validateUsername(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(value.trim())) fail(400, 'INVALID_USERNAME', '用户名需为 3–32 位英文字母、数字、下划线或连字符。');
  return value.trim().toLowerCase();
}
export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72 || new TextEncoder().encode(value).byteLength > 72) fail(400, 'INVALID_PASSWORD', '密码至少 8 位，可以只用数字；总长度不能超过 72 字节。');
  return value;
}
export function validateDisplayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(value)) fail(400, 'INVALID_DISPLAY_NAME', '显示名称需为 1–60 个字符。');
  return value.trim();
}
function cookies(request) {
  const result = {};
  for (const item of (request.headers.get('Cookie') || '').split(';')) {
    const split = item.indexOf('=');
    if (split > 0) { try { result[item.slice(0, split).trim()] = decodeURIComponent(item.slice(split + 1)); } catch {} }
  }
  return result;
}
function cookie(name, value, seconds, request) {
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return `${name}=${encodeURIComponent(value)}; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=${seconds}${url.protocol === 'https:' || !loopback ? '; Secure' : ''}`;
}
function sessionCookies(headers, session, request) {
  if (!session) return;
  if (!session.accessToken || !session.refreshToken) fail(503, 'ACCOUNT_SERVICE_UNAVAILABLE', '账号服务暂时不可用，请稍后重试。');
  headers.append('Set-Cookie', cookie(ACCESS, session.accessToken, Math.max(60, Math.min(3600, Number(session.expiresIn) || 3600)), request));
  headers.append('Set-Cookie', cookie(REFRESH, session.refreshToken, 7 * 86400, request));
}
function clearCookies(headers, request) {
  headers.append('Set-Cookie', cookie(ACCESS, '', 0, request));
  headers.append('Set-Cookie', cookie(REFRESH, '', 0, request));
}
async function body(request, bodyLimit = BODY_LIMIT) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', '请使用 JSON 格式提交。');
  if (Number(request.headers.get('Content-Length')) > bodyLimit) fail(413, 'BODY_TOO_LARGE', '提交内容过大。');
  const reader = request.body?.getReader();
  let size = 0, text = '';
  const decoder = new TextDecoder();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) { await reader.cancel(); fail(413, 'BODY_TOO_LARGE', '提交内容过大。'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  let result;
  try { result = JSON.parse(text || '{}'); } catch { fail(400, 'INVALID_JSON', '提交内容不是有效的 JSON。'); }
  if (!result || Array.isArray(result) || typeof result !== 'object') fail(400, 'INVALID_JSON', '提交内容需要是 JSON 对象。');
  return result;
}
function exactFields(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'UNKNOWN_FIELD', '提交内容包含不支持的字段。');
}
function role(value) { if (!['admin', 'member'].includes(value)) fail(400, 'INVALID_ROLE', '请选择有效的账号角色。'); return value; }
function checkOrigin(request) {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin || ['cross-site', 'none'].includes(request.headers.get('Sec-Fetch-Site'))) fail(403, 'INVALID_ORIGIN', '请从本站页面提交操作。');
}
async function limit(provider, key, count, windowSeconds) {
  if (typeof provider.rateLimit === 'function') await provider.rateLimit(key, { limit: count, windowSeconds });
}
async function aiLimit(provider, key, count, windowSeconds, code, message) {
  try { await limit(provider, key, count, windowSeconds); }
  catch (error) {
    if (error?.code !== 'RATE_LIMITED') throw error;
    throw Object.assign(new ApiError(429, code, message), {retryAfter: windowSeconds});
  }
}
async function configured(provider) {
  const status = await provider.status();
  if (!status?.configured) fail(503, 'ACCOUNT_SERVICE_UNAVAILABLE', '账号服务尚未配置，请联系管理员。');
  return status;
}
export async function handleApi(request, provider, context = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Origin' });
  const respond = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers });
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const projectRoute = /^\/api\/v1\/(projects|published)(\/|$)/.test(path);
    if (!path.startsWith(PREFIX + '/')) fail(404, 'NOT_FOUND', '接口不存在。');
    if (!['GET', 'POST', 'PATCH', ...(projectRoute?['DELETE','PUT']:[])].includes(method)) fail(405, 'METHOD_NOT_ALLOWED', '接口不支持此操作。');
    if (method !== 'GET') checkOrigin(request);
    if (path === PREFIX + '/status' && method === 'GET') {
      const status = await provider.status();
      return respond({ configured: !!status.configured, mode: status.mode || 'unconfigured', signupEnabled: false });
    }
    const projectResponse = async user => {
      const response = await handleProjectRequest(request, {user, provider:context.projectsProvider, clientIp:context.clientIp, uploadPolicy:context.projectUploadPolicy});
      const combined = new Headers(response.headers);
      headers.forEach((value,key)=>{if(!['content-type','set-cookie'].includes(key))combined.set(key,value);});
      for(const value of headers.getSetCookie())combined.append('Set-Cookie',value);
      return new Response(response.body,{status:response.status,headers:combined});
    };
    if(path===PREFIX+'/projects/capabilities'&&method==='GET')return projectResponse(null);
    const inputCookies = cookies(request);
    const access = inputCookies[ACCESS] || '';
    const refresh = inputCookies[REFRESH] || '';
    if (path === PREFIX + '/auth/logout' && method === 'POST') {
      clearCookies(headers, request);
      if (access || refresh) { await configured(provider); await provider.logout(access, refresh); }
      return respond({ ok: true });
    }
    await configured(provider);
    if (path === PREFIX + '/auth/login' && method === 'POST') {
      const input = await body(request);
      exactFields(input, ['username', 'password']);
      const username = validateUsername(input.username);
      if (typeof input.password !== 'string' || !input.password || input.password.length > 128) fail(401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
      await limit(provider, `login-ip:${context.clientIp || 'unknown'}`, 30, 900);
      await limit(provider, `login-user:${username}`, 10, 900);
      const result = await provider.login(username, input.password, { clientIp: context.clientIp });
      if (!result?.user || result.user.status !== 'active') fail(401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
      sessionCookies(headers, result.session, request);
      return respond({ user: publicUser(result.user) });
    }
    const identity = access || refresh ? await provider.authenticate(access, refresh) : null;
    const user = identity?.user?.status === 'active' ? identity.user : null;
    if (!user && (access || refresh)) clearCookies(headers, request);
    if (user) sessionCookies(headers, identity.session, request);
    if (path === PREFIX + '/auth/session' && method === 'GET') return respond({ user: publicUser(user) });
    if(projectRoute){
      let scope=method==='GET'?'read':'write',count=method==='GET'?(user?600:180):15;
      if(context.projectUploadPolicy?.transport==='r2-stream-v1'){
        if(method==='POST'&&/^\/api\/v1\/projects\/local-[A-Za-z0-9_-]+\/uploads$/.test(path))scope='upload-start';
        else if(method==='PUT'&&/^\/api\/v1\/projects\/local-[A-Za-z0-9_-]+\/versions\/version-[A-Za-z0-9_-]+\/files\/(attachment|coverFile)$/.test(path)){scope='upload-file';count=30;}
        else if(method==='POST'&&/^\/api\/v1\/projects\/local-[A-Za-z0-9_-]+\/versions\/version-[A-Za-z0-9_-]+\/commit$/.test(path))scope='upload-commit';
      }
      // One streaming version takes up to four requests. Independent bounded
      // stages keep a valid upload from spending its commit allowance on files.
      await limit(provider, `projects:${scope}:${user?.id||context.clientIp||'unknown'}`, count,60);
      return projectResponse(user);
    }
    if (!user) fail(401, 'UNAUTHENTICATED', '请先登录。');
    if (path === PREFIX + '/auth/password' && method === 'POST') {
      await limit(provider, `password:${user.id}`, 5, 900);
      const input = await body(request);
      exactFields(input, ['currentPassword', 'newPassword']);
      if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 128) fail(400, 'CURRENT_PASSWORD_REQUIRED', '请填写当前密码。');
      const password = validatePassword(input.newPassword);
      if (password === input.currentPassword) fail(400, 'PASSWORD_UNCHANGED', '新密码不能与当前密码相同。');
      const result = await provider.changePassword(user, input.currentPassword, password);
      sessionCookies(headers, result.session, request);
      return respond({ user: publicUser(result.user) });
    }
    if (user.mustChangePassword) fail(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改管理员重置的密码。');
    if (path === PREFIX + '/ai/capabilities' && method === 'GET') return respond(context.aiProvider?.status() || {configured:false,limits:AI_LIMITS});
    if (path === PREFIX + '/ai/assist' && method === 'POST') {
      const input = validateAiInput(await body(request, AI_LIMITS.requestBytes));
      if (!context.aiProvider?.status().configured) fail(503, 'AI_NOT_CONFIGURED', 'AI 服务尚未配置，请联系管理员。');
      await aiLimit(provider, `ai:minute:${user.id}`, AI_LIMITS.perMinute, 60, 'AI_MINUTE_LIMIT', '每个账号每分钟最多生成 3 次，请稍后重试。');
      await aiLimit(provider, `ai:day:${user.id}`, AI_LIMITS.perDay, 86400, 'AI_DAILY_LIMIT', '已达到账号 24 小时内 30 次的 AI 额度，请额度恢复后再试。');
      await aiLimit(provider, 'ai:global:day', AI_LIMITS.globalPerDay, 86400, 'AI_GLOBAL_LIMIT', '平台已达到 24 小时内的 AI 总额度，请稍后再来或联系管理员。');
      return respond(await context.aiProvider.assist(input, {signal:request.signal}));
    }
    if (!path.startsWith(PREFIX + '/admin/')) fail(404, 'NOT_FOUND', '接口不存在。');
    if (user.role !== 'admin') fail(403, 'FORBIDDEN', '只有管理员可以执行此操作。');
    await limit(provider, `admin:${user.id}`, method === 'GET' ? 120 : 30, 60);
    if (path === PREFIX + '/admin/users' && method === 'GET') {
      const page = Number(url.searchParams.get('page') || 1);
      const query = (url.searchParams.get('query') || '').trim();
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || query.length > 60) fail(400, 'INVALID_QUERY', '搜索或页码无效。');
      const result = await provider.listUsers(user, { query, page });
      return respond({ users: result.users.map(publicUser), total: result.total, page: result.page, pageSize: result.pageSize || 20 });
    }
    if (path === PREFIX + '/admin/users' && method === 'POST') {
      const input = await body(request);
      exactFields(input, ['username', 'displayName', 'password', 'role', 'affiliationType', 'organizationName']);
      const created = await provider.createUser(user, { username: validateUsername(input.username), displayName: validateDisplayName(input.displayName), password: validatePassword(input.password), role: role(input.role || 'member'), ...validateAffiliation(input) });
      return respond({ user: publicUser(created) }, 201);
    }
    if (path === PREFIX + '/admin/audit' && method === 'GET') {
      const result = await provider.listAudit(user);
      return respond({ events: result.events });
    }
    const match = path.match(/^\/api\/v1\/admin\/users\/([a-zA-Z0-9_-]{1,100})(\/password)?$/);
    if (match && method === (match[2] ? 'POST' : 'PATCH')) {
      const id = match[1];
      const input = await body(request);
      if (match[2]) {
        exactFields(input, ['newPassword']);
        if (id === user.id) fail(409, 'SELF_RESET_FORBIDDEN', '请在账号设置中修改自己的密码。');
        return respond({ user: publicUser(await provider.resetPassword(user, id, validatePassword(input.newPassword))) });
      }
      exactFields(input, ['displayName', 'role', 'status', 'affiliationType', 'organizationName']);
      if (!Object.keys(input).length) fail(400, 'EMPTY_UPDATE', '请至少修改一项账号信息。');
      const changes = validateAffiliation(input, {partial:true});
      if ('displayName' in input) changes.displayName = validateDisplayName(input.displayName);
      if ('role' in input) changes.role = role(input.role);
      if ('status' in input) { if (!['active', 'disabled'].includes(input.status)) fail(400, 'INVALID_STATUS', '账号状态无效。'); changes.status = input.status; }
      if (id === user.id && (changes.role === 'member' || changes.status === 'disabled')) fail(409, 'SELF_LOCKOUT', '不能停用或降级当前登录的管理员。');
      return respond({ user: publicUser(await provider.updateUser(user, id, changes)) });
    }
    fail(404, 'NOT_FOUND', '接口不存在。');
  } catch (error) {
    const safe = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 && typeof error.code === 'string';
    const status = safe ? error.status : 500;
    if (status === 429) headers.set('Retry-After', String(error.retryAfter || 60));
    return respond({ error: { code: safe ? error.code : 'INTERNAL_ERROR', message: safe ? error.message : '操作未完成，请稍后重试。' } }, status);
  }
}
