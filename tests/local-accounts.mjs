import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProvider } from '../server/local-provider.mjs';
import { LocalProjectsProvider } from '../server/local-projects.mjs';
import { handleApi } from '../server/api.mjs';
import { applyRuntimePolicy } from '../server/runtime-policy.mjs';

const folder = await mkdtemp(join(tmpdir(), 'tashan-accounts-test-'));
const file = join(folder, 'accounts.sqlite');
let provider = new LocalProvider(file);
let projectsProvider = new LocalProjectsProvider(provider, { filesDir:join(folder, 'project-files') });
const origin = 'http://127.0.0.1:4173';
const jars = { admin: new Map(), member: new Map(), second: new Map() };
async function call(path, { method = 'GET', body, as = 'admin', originHeader = origin, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: originHeader };
  headers.Cookie = cookie ?? Array.from(jars[as] || [], ([key, value]) => key + '=' + value).join('; ');
  const response = await handleApi(new Request(origin + '/api/v1' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), provider, { clientIp:'local-tests', projectsProvider, aiProvider:{status:()=>({configured:true,mode:'fixture'})} });
  if (cookie === undefined && jars[as]) for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0], at = pair.indexOf('=');
    jars[as].set(pair.slice(0, at), pair.slice(at + 1));
  }
  return { response, data: await response.json(), status: response.status };
}
const password = 'LocalTeacher12345';
try {
  const admin = await provider.bootstrap({ username:'admin', password:'admin', displayName:'管理员', allowDemoPassword:true });
  assert.equal(provider.status().mode, 'local');
  await assert.rejects(provider.bootstrap({ username:'other', password, displayName:'Other' }), error => error.code === 'ALREADY_INITIALIZED');
  assert.equal((await call('/admin/users')).status, 401, 'Anonymous requests cannot list accounts');
  assert.equal((await call('/auth/login', { method:'POST', body:{ username:'admin', password:'wrong' } })).status, 401);
  assert.equal((await call('/auth/login', { method:'POST', body:{ username:'admin', password:'admin' }, originHeader:'https://attacker.invalid' })).status, 403);
  let result = await call('/auth/login', { method:'POST', body:{ username:'ADMIN', password:'admin' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.id, admin.id);
  assert(!JSON.stringify(result.data).includes('Token'), 'API never returns session tokens in JSON');
  for (const cookie of result.response.headers.getSetCookie()) { assert(cookie.includes('HttpOnly')); assert(cookie.includes('SameSite=')); assert(cookie.includes('Path=/api/v1')); }
  assert(result.response.headers.get('Cache-Control').includes('no-store'));
  assert.equal((await call('/admin/users/' + admin.id, { method:'PATCH', body:{ status:'disabled' } })).status, 409);
  assert.equal((await call('/admin/users/' + admin.id, { method:'PATCH', body:{ role:'member' } })).status, 409);
  result = await call('/admin/users', { method:'POST', body:{ username:'teacher_a', displayName:'教师甲', password, role:'member' } });
  assert.equal(result.status, 201);
  const member = result.data.user;
  assert.equal(member.mustChangePassword, false);
  assert.equal((await call('/admin/users', { method:'POST', body:{ username:'teacher_a', displayName:'重复', password, role:'member' } })).status, 409);
  assert.equal((await call('/admin/users?query=teacher_a')).data.total, 1);
  result = await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password } });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.mustChangePassword, false, 'New accounts can use their assigned password without a forced change');
  assert.equal((await call('/projects', { as:'member' })).status, 200, 'A freshly signed-in member can access their projects immediately');
  assert.equal((await call('/projects/local-onboarding/versions', { as:'member', method:'POST', body:{
    projectCode:'TS-L-1122334455667788', version:{id:'version-onboarding',number:1,createdAt:'2026-09-10T08:00:00.000Z'},
    metadata:{id:'local-onboarding',title:'首次登录的项目',kind:'prompt',core:'设计一个课堂观察活动。'},files:{}
  } })).status, 201, 'A new member can save a private server version before any password change');
  assert.equal((await call('/ai/capabilities', { as:'member' })).status, 200, 'AI account features no longer require a first-login password change');
  assert.equal((await call('/admin/users', { as:'member' })).data.error.code, 'FORBIDDEN', 'A normal member still has no administrator permission');
  const initialCookie = Array.from(jars.member, ([key, value]) => key + '=' + value).join('; ');
  assert.equal((await call('/auth/password', { as:'member', method:'POST', body:{ currentPassword:'WrongTeacher12345', newPassword:'ChangedTeacher23456' } })).data.error.code, 'CURRENT_PASSWORD_INVALID');
  result = await call('/auth/password', { as:'member', method:'POST', body:{ currentPassword:password, newPassword:'ChangedTeacher23456' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.mustChangePassword, false);
  assert.equal((await call('/auth/session', { cookie:initialCookie })).data.user, null, 'An optional password change still revokes earlier sessions');
  assert.equal((await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password } })).status, 401, 'The old assigned password stops working after a voluntary change');
  assert.equal((await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password:'ChangedTeacher23456' } })).status, 200);
  assert.equal((await call('/admin/users', { as:'member' })).status, 403, 'Members remain forbidden after changing password');
  assert.equal((await call('/admin/users/' + admin.id, { as:'member', method:'PATCH', body:{ role:'admin' } })).status, 403);
  const oldCookie = Array.from(jars.member, ([key, value]) => key + '=' + value).join('; ');
  assert.equal((await call('/admin/users/' + member.id + '/password', { method:'POST', body:{ newPassword:'ResetTeacher34567' } })).status, 200);
  assert.equal((await call('/auth/session', { cookie:oldCookie })).data.user, null, 'Password reset revokes existing access and refresh tokens');
  assert.equal((await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password:'ChangedTeacher23456' } })).status, 401);
  assert.equal((await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password:'ResetTeacher34567' } })).data.user.mustChangePassword, true);
  assert.equal((await call('/projects', { as:'member' })).data.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await call('/ai/capabilities', { as:'member' })).data.error.code, 'PASSWORD_CHANGE_REQUIRED', 'Administrator reset still requires a password change before protected features');
  assert.equal((await call('/admin/users/' + member.id, { method:'PATCH', body:{ status:'disabled' } })).status, 200);
  assert.equal((await call('/auth/session', { as:'member' })).data.user, null, 'Disabling invalidates the current session');
  assert.equal((await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password:'ResetTeacher34567' } })).status, 401);
  await call('/admin/users/' + member.id, { method:'PATCH', body:{ status:'active' } });
  await call('/auth/login', { as:'member', method:'POST', body:{ username:'teacher_a', password:'ResetTeacher34567' } });
  await call('/auth/password', { as:'member', method:'POST', body:{ currentPassword:'ResetTeacher34567', newPassword:'FinalTeacher45678' } });
  const beforeRefresh = jars.member.get('tashan_access');
  provider.db.prepare('UPDATE sessions SET access_until = 0 WHERE user_id=?').run(member.id);
  assert.equal((await call('/auth/session', { as:'member' })).data.user.id, member.id);
  assert.notEqual(jars.member.get('tashan_access'), beforeRefresh, 'Expired access tokens rotate using an HttpOnly refresh cookie');
  const revoked = Array.from(jars.member, ([key, value]) => key + '=' + value).join('; ');
  await call('/auth/logout', { as:'member', method:'POST', body:{} });
  assert.equal((await call('/auth/session', { cookie:revoked })).data.user, null);
  const audit = await call('/admin/audit');
  assert(audit.data.events.some(event => event.action === 'account.password_reset'));
  assert(!JSON.stringify(audit.data).includes(password));
  await provider.rateLimit('bounded-test', { limit:1, windowSeconds:60 });
  await assert.rejects(provider.rateLimit('bounded-test', { limit:1, windowSeconds:60 }), error => error.status === 429);
  // A process restart keeps users, hashes and revoked sessions, not browser flags.
  provider.close(); provider = new LocalProvider(file);
  projectsProvider = new LocalProjectsProvider(provider, { filesDir:join(folder, 'project-files') });
  assert.equal((await provider.login('teacher_a', 'FinalTeacher45678')).user.id, member.id);
  const bytes = await readFile(file);
  assert(!bytes.includes(Buffer.from('FinalTeacher45678')));
  assert(!bytes.includes(Buffer.from('ResetTeacher34567')));
  assert.equal((await call('/auth/signup', { method:'POST', body:{} })).status, 404);
  const runtime = applyRuntimePolicy(new Request(origin + '/projects/earth/index.html'), new Response('<h1>Runtime</h1>', { headers:{ 'Content-Type':'text/html' } }));
  assert(runtime.headers.get('Content-Security-Policy').includes('sandbox allow-scripts'));
  assert(!runtime.headers.get('Content-Security-Policy').includes('allow-same-origin'));
  const main = applyRuntimePolicy(new Request(origin + '/index.html'), new Response('Main', { headers:{ 'Content-Type':'text/html' } }));
  assert.equal(main.headers.get('Content-Security-Policy'), null, 'Account UI itself is not sandboxed');
  console.log('Local account integration passed: persistence, cookie sessions, CSRF, RBAC, password lifecycle, disable/re-enable, refresh/logout, audit, limits and runtime isolation.');
} finally { provider.close(); await rm(folder, { recursive:true, force:true }); }
