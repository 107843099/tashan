import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi, ApiError, validatePassword } from '../server/api.mjs';
import { createSupabaseProvider } from '../server/supabase-provider.mjs';
import { LocalProvider } from '../server/local-provider.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Deliberately small in-memory TEST adapter. Production and the UI never import it.
function fixture() {
  const users = new Map();
  const passwords = new Map();
  const sessions = new Map();
  const limits = new Map();
  const events = [];
  let sequence = 0;
  const error = (status, code, message = code) => { throw new ApiError(status, code, message); };
  const add = (id, role, mustChangePassword = false) => {
    const user = { id, username: id, displayName: id, role, status: 'active', mustChangePassword, createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', internalSecret: 'not-for-browser' };
    users.set(id, user); passwords.set(id, id === 'admin' ? 'admin' : 'InitialPassword123'); return user;
  };
  add('admin', 'admin'); add('member', 'member'); add('temporary', 'member', true); // Administrator-reset fixture; new accounts no longer receive this flag.
  const sessionFor = user => {
    const token = 'fixture-session-' + ++sequence;
    sessions.set(token, user.id);
    return { user: { ...user }, session: { accessToken: token, refreshToken: token + '-refresh', expiresIn: 3600 } };
  };
  const clear = id => { for (const [token, owner] of sessions) if (owner === id) sessions.delete(token); };
  const admin = actor => { if (users.get(actor.id)?.role !== 'admin' || users.get(actor.id)?.status !== 'active') error(403, 'FORBIDDEN'); };
  const provider = {
    status: async () => ({ configured: true, mode: 'local' }),
    rateLimit: async (key, { limit }) => { const count = (limits.get(key) || 0) + 1; limits.set(key, count); if (count > limit) error(429, 'RATE_LIMITED'); },
    login: async (username, password) => {
      const user = users.get(username);
      if (!user || user.status !== 'active' || passwords.get(username) !== password) error(401, 'INVALID_CREDENTIALS');
      return sessionFor(user);
    },
    authenticate: async accessToken => { const user = users.get(sessions.get(accessToken)); return user?.status === 'active' ? { user } : null; },
    logout: async accessToken => { sessions.delete(accessToken); },
    changePassword: async (user, current, next) => {
      if (passwords.get(user.id) !== current) error(401, 'INCORRECT_PASSWORD');
      passwords.set(user.id, next); user.mustChangePassword = false; clear(user.id); return sessionFor(user);
    },
    listUsers: async (actor, { query, page }) => { admin(actor); const rows = [...users.values()].filter(u => !query || u.username.includes(query)); return { users: rows, total: rows.length, page, pageSize: 20 }; },
    createUser: async (actor, input) => { admin(actor); if (users.has(input.username)) error(409, 'USERNAME_TAKEN'); const user = add(input.username, input.role, false); user.displayName = input.displayName; passwords.set(user.id, input.password); events.push({ action: 'account_created', details: { role: input.role } }); return user; },
    updateUser: async (actor, id, changes) => { admin(actor); const user = users.get(id); if (!user) error(404, 'ACCOUNT_NOT_FOUND'); Object.assign(user, changes); if (changes.status === 'disabled' || changes.role) clear(id); return user; },
    resetPassword: async (actor, id, next) => { admin(actor); const user = users.get(id); if (!user) error(404, 'ACCOUNT_NOT_FOUND'); passwords.set(id, next); user.mustChangePassword = true; clear(id); return user; },
    listAudit: async actor => { admin(actor); return { events }; }
  };
  return { provider, users, passwords, sessions };
}
const origin = 'http://127.0.0.1:4173';
function cookieHeader(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
async function call(provider, path, { method = 'GET', data, cookie = '', requestOrigin = origin, urlOrigin = origin, headers = {} } = {}) {
  const request = new Request(urlOrigin + '/api/v1' + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: requestOrigin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return handleApi(request, provider, { clientIp: '127.0.0.1' });
}
async function login(provider, username = 'admin', password = 'admin') {
  const response = await call(provider, '/auth/login', { method: 'POST', data: { username, password } });
  assert.equal(response.status, 200);
  return { response, cookie: cookieHeader(response), data: await response.json() };
}

test('new password policy accepts eight digits without composition rules and keeps the 72-byte ceiling', () => {
  for (const password of ['12345678', 'abcdefgh', '密'.repeat(8), '9'.repeat(72), '密'.repeat(24), 'LegacyPassword12345']) assert.equal(validatePassword(password), password);
  for (const password of [undefined, null, 12345678, '', '1234567', 'abcdefg', '9'.repeat(73), '密'.repeat(25)]) assert.throws(() => validatePassword(password), error => error.code === 'INVALID_PASSWORD' && error.status === 400);
});

test('real SQLite accepts numeric creation, voluntary change and administrator reset while rejecting seven digits', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tashan-numeric-password-')), file = join(folder, 'accounts.sqlite');
  let provider = new LocalProvider(file);
  try {
    await assert.rejects(provider.bootstrap({ username:'admin', password:'admin', displayName:'Fixture admin', allowDemoPassword:true }), error => error.code === 'INVALID_PASSWORD');
    await assert.rejects(provider.bootstrap({ username:'admin', password:'1234567', displayName:'Fixture admin' }), error => error.code === 'INVALID_PASSWORD');
    const legacyPassword = 'Legacy9-' + 'x'.repeat(64);
    const adminUser = await provider.bootstrap({ username:'admin', password:legacyPassword, displayName:'Fixture admin' });
    const admin = await login(provider, 'admin', legacyPassword);
    const input = { username:'numeric_teacher', displayName:'Numeric teacher', role:'member', password:'12345678' };
    const weakCreate = await call(provider, '/admin/users', { method:'POST', cookie:admin.cookie, data:{...input,password:'1234567'} });
    assert.equal(weakCreate.status,400); assert.equal((await weakCreate.json()).error.code,'INVALID_PASSWORD');
    assert.equal(provider.db.prepare('SELECT count(*) n FROM accounts').get().n,1);
    const created = await call(provider, '/admin/users', { method:'POST', cookie:admin.cookie, data:input });
    assert.equal(created.status,201); const member = (await created.json()).user; assert.equal(member.mustChangePassword,false);
    const initial = await login(provider, input.username, input.password);
    const oldHash = provider.account(member.id).password_hash;
    const weakChange = await call(provider, '/auth/password', { method:'POST', cookie:initial.cookie, data:{currentPassword:input.password,newPassword:'2345678'} });
    assert.equal(weakChange.status,400); assert.equal((await weakChange.json()).error.code,'INVALID_PASSWORD'); assert.equal(provider.account(member.id).password_hash,oldHash);
    const changed = await call(provider, '/auth/password', { method:'POST', cookie:initial.cookie, data:{currentPassword:input.password,newPassword:'23456789'} });
    assert.equal(changed.status,200); const changedCookie = cookieHeader(changed); assert.equal((await changed.json()).user.mustChangePassword,false);
    assert.equal((await (await call(provider, '/auth/session', {cookie:initial.cookie})).json()).user,null);
    assert.equal((await call(provider, '/auth/login', {method:'POST',data:{username:input.username,password:input.password}})).status,401);
    assert.equal((await login(provider,input.username,'23456789')).data.user.id,member.id);
    const hashBeforeReset = provider.account(member.id).password_hash;
    const weakReset = await call(provider, '/admin/users/'+member.id+'/password', {method:'POST',cookie:admin.cookie,data:{newPassword:'8765432'}});
    assert.equal(weakReset.status,400); assert.equal((await weakReset.json()).error.code,'INVALID_PASSWORD'); assert.equal(provider.account(member.id).password_hash,hashBeforeReset);
    assert.equal((await (await call(provider,'/auth/session',{cookie:changedCookie})).json()).user.id,member.id);
    const reset = await call(provider, '/admin/users/'+member.id+'/password', {method:'POST',cookie:admin.cookie,data:{newPassword:'87654321'}});
    assert.equal(reset.status,200); assert.equal((await reset.json()).user.mustChangePassword,true);
    assert.equal((await (await call(provider,'/auth/session',{cookie:changedCookie})).json()).user,null);
    const resetLogin = await login(provider,input.username,'87654321'); assert.equal(resetLogin.data.user.mustChangePassword,true);
    const finish = await call(provider,'/auth/password',{method:'POST',cookie:resetLogin.cookie,data:{currentPassword:'87654321',newPassword:'98765432'}});
    assert.equal(finish.status,200); assert.equal((await finish.json()).user.mustChangePassword,false);
    assert.equal((await (await call(provider,'/auth/session',{cookie:resetLogin.cookie})).json()).user,null);
    assert.equal((await call(provider,'/admin/users',{cookie:cookieHeader(finish)})).status,403,'Numeric passwords do not change role permissions');
    const adminHash = provider.account(adminUser.id).password_hash;
    provider.close(); provider = new LocalProvider(file);
    assert.equal((await provider.login(input.username,'98765432')).user.id,member.id);
    assert.equal((await provider.login('admin',legacyPassword)).user.id,adminUser.id,'Existing long credentials still authenticate after a restart');
    assert.equal(provider.account(adminUser.id).password_hash,adminHash,'Policy changes never rewrite existing credentials');
    const audit = JSON.stringify(await provider.listAudit(adminUser));
    for (const password of [input.password,'23456789','87654321','98765432',legacyPassword]) assert.equal(audit.includes(password),false);
  } finally { provider.close(); await rm(folder,{recursive:true,force:true}); }
});

test('Supabase provider and CLI bootstrap accept eight digits; invalid new passwords make no Auth or RPC request', async () => {
  const id='30000000-0000-4000-8000-000000000001',actor={id:'30000000-0000-4000-8000-000000000002',role:'admin',status:'active',mustChangePassword:false};
  const row={id,username:'numeric_cloud',display_name:'Numeric cloud',role:'member',status:'active',must_change_password:false};
  const calls=[],sessions=new Map(); let currentPassword='',sequence=0;
  const provider=createSupabaseProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'}, {fetch:async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null; calls.push({path,method:options.method,body});
    if(path==='/rest/v1/rpc/tashan_require_admin')return Response.json(null);
    if(path==='/auth/v1/admin/users'&&options.method==='POST'){currentPassword=body.password;return Response.json({id});}
    if(path==='/rest/v1/rpc/tashan_register_account_profile'){Object.assign(row,{username:body.p_username,display_name:body.p_display_name,role:body.p_role,affiliation_type:body.p_affiliation_type,organization_name:body.p_organization_name});return Response.json(row);}
    if(path==='/auth/v1/token'){
      if(body.password!==currentPassword)return Response.json({error_code:'invalid_credentials'},{status:400});
      const sessionId='40000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
      const token='fixture.'+Buffer.from(JSON.stringify({sub:id,session_id:sessionId})).toString('base64url')+'.fixture';sessions.set(token,sessionId);
      return Response.json({access_token:token,refresh_token:'fixture-refresh-'+sequence,expires_in:3600,user:{id}});
    }
    if(path==='/auth/v1/user'){const token=options.headers.Authorization?.slice(7);return sessions.has(token)?Response.json({id}):Response.json({error_code:'bad_jwt'},{status:401});}
    if(path==='/rest/v1/rpc/tashan_session_account')return Response.json([...sessions.values()].includes(body.p_session)?row:null);
    if(path==='/rest/v1/rpc/tashan_begin_password_change'){sessions.clear();return Response.json({lock:'fixture-lock'});}
    if(path==='/auth/v1/admin/users/'+id&&options.method==='PUT'){currentPassword=body.password;return Response.json({id});}
    if(path==='/rest/v1/rpc/tashan_finish_password_change'){row.must_change_password=body.p_admin_reset;return Response.json(row);}
    if(path==='/auth/v1/logout'){sessions.delete(options.headers.Authorization?.slice(7));return new Response(null,{status:204});}
    throw new Error('Unexpected isolated Auth fixture route');
  }});
  const input={username:row.username,displayName:row.display_name,role:'member',password:'12345678'};
  const noRequest=async operation=>{const before=calls.length;await assert.rejects(operation,error=>error.code==='INVALID_PASSWORD');assert.equal(calls.length,before,'Invalid input cannot create a proof session, identity or credential lock');};
  await noRequest(()=>provider.createUser(actor,{...input,password:'1234567'}));
  await noRequest(()=>provider.bootstrapAdmin({...input,password:'1234567'}));
  await noRequest(()=>provider.resetPassword(actor,id,'1234567'));
  await noRequest(()=>provider.changePassword({id,username:row.username},'12345678','1234567'));
  const member=await provider.createUser(actor,input);assert.equal(member.mustChangePassword,false);assert.equal(currentPassword,'12345678');
  const first=await provider.login(member.username,'12345678');assert.equal(first.user.id,id);
  const changed=await provider.changePassword(member,'12345678','23456789');assert.equal(changed.user.mustChangePassword,false);assert.equal(currentPassword,'23456789');
  assert.equal(await provider.authenticate(first.session.accessToken,''),null);
  const reset=await provider.resetPassword(actor,id,'87654321');assert.equal(reset.mustChangePassword,true);assert.equal(currentPassword,'87654321');
  assert.equal(await provider.authenticate(changed.session.accessToken,''),null);
  const afterReset=await provider.login(member.username,'87654321');assert.equal(afterReset.user.mustChangePassword,true);
  const restored=await provider.changePassword(afterReset.user,'87654321','98765432');assert.equal(restored.user.mustChangePassword,false);assert.equal(currentPassword,'98765432');
  const writes=calls.filter(call=>call.path==='/auth/v1/admin/users/'+id&&call.method==='PUT');assert.deepEqual(writes.map(call=>call.body.password),['23456789','87654321','98765432']);
  const bootstrap=await provider.bootstrapAdmin({username:'bootstrap_numeric',displayName:'Bootstrap fixture',password:'11223344'});assert.equal(bootstrap.role,'admin');assert.equal(currentPassword,'11223344');
  assert.equal(calls.at(-1).body.p_bootstrap,true,'The private bootstrap path retains its distinct database authorization');
});

test('login permits the explicit local legacy password, sets private cookies, and never sends tokens', async () => {
  const { provider } = fixture();
  const { response, data, cookie } = await login(provider);
  assert.equal(data.user.role, 'admin');
  assert.equal(data.user.internalSecret, undefined);
  assert.equal(data.session, undefined);
  assert.match(cookie, /tashan_access=/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  for (const value of response.headers.getSetCookie()) {
    assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Strict/); assert.match(value, /Path=\/api\/v1/); assert.doesNotMatch(value, /; Secure/);
  }
  const secure = await call(provider, '/auth/login', { method: 'POST', data: { username: 'admin', password: 'admin' }, urlOrigin: 'https://tashan.example', requestOrigin: 'https://tashan.example' });
  assert.ok(secure.headers.getSetCookie().every(value => value.includes('; Secure')));
});

test('anonymous, member and temporary-password accounts cannot administer users', async () => {
  const { provider } = fixture();
  assert.equal((await call(provider, '/auth/session')).status, 200);
  assert.deepEqual(await (await call(provider, '/auth/session')).json(), { user: null });
  assert.equal((await call(provider, '/admin/users')).status, 401);
  const member = await login(provider, 'member', 'InitialPassword123');
  assert.equal((await call(provider, '/admin/users', { cookie: member.cookie })).status, 403);
  const temporary = await login(provider, 'temporary', 'InitialPassword123');
  const blocked = await call(provider, '/admin/users', { cookie: temporary.cookie });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('all mutations require a matching Origin and reject cross-site requests including login', async () => {
  const { provider } = fixture();
  for (const requestOrigin of ['https://attacker.invalid', 'null', '']) {
    assert.equal((await call(provider, '/auth/login', { method: 'POST', requestOrigin, data: { username: 'admin', password: 'admin' } })).status, 403);
  }
  const admin = await login(provider);
  const blocked = await call(provider, '/admin/users/member', { method: 'PATCH', cookie: admin.cookie, data: { role: 'admin' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(blocked.status, 403);
  assert.equal((await call(provider, '/auth/logout', { method: 'POST', cookie: admin.cookie, requestOrigin: '' })).status, 403);
});

test('administrator can create accounts; clients cannot submit ownership, credentials or unknown fields', async () => {
  const { provider } = fixture();
  const admin = await login(provider);
  const input = { username: 'Teacher_One', displayName: '张老师', password: 'NewTeacher12345', role: 'member' };
  const result = await call(provider, '/admin/users', { method: 'POST', cookie: admin.cookie, data: input });
  assert.equal(result.status, 201);
  const created = (await result.json()).user;
  assert.equal(created.username, 'teacher_one'); assert.equal(created.mustChangePassword, false);
  const signedIn = await login(provider, created.username, input.password);
  assert.equal(signedIn.data.user.mustChangePassword, false);
  assert.equal((await call(provider, '/ai/capabilities', { cookie: signedIn.cookie })).status, 200, 'A newly created member can immediately access ordinary account features');
  assert.equal((await (await call(provider, '/admin/users', { cookie: signedIn.cookie })).json()).error.code, 'FORBIDDEN', 'Ordinary role protection still applies');
  assert.equal(created.password, undefined); assert.equal(created.internalSecret, undefined);
  assert.equal((await call(provider, '/admin/users', { method: 'POST', cookie: admin.cookie, data: input })).status, 409);
  assert.equal((await call(provider, '/admin/users/member', { method: 'PATCH', cookie: admin.cookie, data: { id: 'admin', mustChangePassword: false } })).status, 400);
  assert.equal((await call(provider, '/admin/users', { method: 'POST', cookie: admin.cookie, data: { ...input, username: 'new_user', password: 'weak' } })).status, 400);
  assert.equal((await call(provider, '/admin/users', { method: 'POST', cookie: admin.cookie, data: { ...input, username: 'new_user', password: 'A1' + 'x'.repeat(71) } })).status, 400);
  assert.equal((await call(provider, '/admin/users', { method: 'POST', cookie: admin.cookie, data: { ...input, username: 'new_user', password: 'A1' + '密'.repeat(24) } })).status, 400);
  const audit = await (await call(provider, '/admin/audit', { cookie: admin.cookie })).json();
  assert.doesNotMatch(JSON.stringify(audit), /NewTeacher12345|password/i);
});

test('required change after administrator reset verifies old password, renews cookies and revokes the previous session', async () => {
  const { provider } = fixture();
  const member = await login(provider, 'temporary', 'InitialPassword123');
  const bad = await call(provider, '/auth/password', { method: 'POST', cookie: member.cookie, data: { currentPassword: 'Incorrect1234', newPassword: 'MyNewPassword1234' } });
  assert.equal(bad.status, 401);
  const changed = await call(provider, '/auth/password', { method: 'POST', cookie: member.cookie, data: { currentPassword: 'InitialPassword123', newPassword: 'MyNewPassword1234' } });
  assert.equal(changed.status, 200); assert.equal((await changed.json()).user.mustChangePassword, false);
  assert.notEqual(cookieHeader(changed), member.cookie);
  assert.deepEqual(await (await call(provider, '/auth/session', { cookie: member.cookie })).json(), { user: null });
  assert.equal((await call(provider, '/auth/login', { method: 'POST', data: { username: 'temporary', password: 'InitialPassword123' } })).status, 401);
});

test('disable and reset immediately block old sessions; reset forces a new password', async () => {
  const { provider } = fixture();
  const admin = await login(provider);
  const member = await login(provider, 'member', 'InitialPassword123');
  assert.equal((await call(provider, '/admin/users/member', { method: 'PATCH', cookie: admin.cookie, data: { status: 'disabled' } })).status, 200);
  assert.deepEqual(await (await call(provider, '/auth/session', { cookie: member.cookie })).json(), { user: null });
  assert.equal((await call(provider, '/auth/login', { method: 'POST', data: { username: 'member', password: 'InitialPassword123' } })).status, 401);
  await call(provider, '/admin/users/member', { method: 'PATCH', cookie: admin.cookie, data: { status: 'active' } });
  const active = await login(provider, 'member', 'InitialPassword123');
  const reset = await call(provider, '/admin/users/member/password', { method: 'POST', cookie: admin.cookie, data: { newPassword: 'ResetPassword1234' } });
  assert.equal(reset.status, 200); assert.equal((await reset.json()).user.mustChangePassword, true);
  assert.deepEqual(await (await call(provider, '/auth/session', { cookie: active.cookie })).json(), { user: null });
  assert.equal((await login(provider, 'member', 'ResetPassword1234')).data.user.mustChangePassword, true);
});

test('self-disable, self-demotion and administrator self-reset are rejected', async () => {
  const { provider } = fixture(); const admin = await login(provider);
  for (const data of [{ role: 'member' }, { status: 'disabled' }]) assert.equal((await call(provider, '/admin/users/admin', { method: 'PATCH', cookie: admin.cookie, data })).status, 409);
  assert.equal((await call(provider, '/admin/users/admin/password', { method: 'POST', cookie: admin.cookie, data: { newPassword: 'NoSelfReset1234' } })).status, 409);
  assert.equal((await call(provider, '/admin/users', { cookie: admin.cookie })).status, 200);
});

test('logout revokes the session and clears both cookies', async () => {
  const { provider } = fixture(); const admin = await login(provider);
  const response = await call(provider, '/auth/logout', { method: 'POST', cookie: admin.cookie });
  assert.equal(response.status, 200); assert.ok(response.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  assert.deepEqual(await (await call(provider, '/auth/session', { cookie: admin.cookie })).json(), { user: null });
});

test('login rate limits and body limits fail safely', async () => {
  const { provider } = fixture();
  let response;
  for (let i = 0; i < 11; i++) response = await call(provider, '/auth/login', { method: 'POST', data: { username: 'member', password: 'bad' } });
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal((await call(provider, '/auth/login', { method: 'POST', data: { username: 'member', password: 'x'.repeat(20000) } })).status, 413);
});

test('unconfigured production never falls back to a local admin or exposes service details', async () => {
  const provider = createSupabaseProvider({});
  assert.deepEqual(await (await call(provider, '/status')).json(), { configured: false, mode: 'supabase', signupEnabled: false });
  const loginResponse = await call(provider, '/auth/login', { method: 'POST', data: { username: 'admin', password: 'admin' } });
  assert.equal(loginResponse.status, 503); assert.equal((await loginResponse.json()).error.code, 'ACCOUNT_SERVICE_UNAVAILABLE');
});

test('Supabase provider validates with Auth and checks the live account/session before trusting a token', async () => {
  const id = '10000000-0000-4000-8000-000000000001', sessionId = '20000000-0000-4000-8000-000000000002';
  const token = 'test.' + Buffer.from(JSON.stringify({ sub: id, session_id: sessionId })).toString('base64url') + '.test';
  const requests = [];
  let enabled = true;
  const provider = createSupabaseProvider({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' }, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return Response.json({ id });
      if (url.endsWith('/rest/v1/rpc/tashan_session_account')) return Response.json(enabled ? { id, username: 'teacher', display_name: 'Teacher', role: 'member', status: 'active', must_change_password: false } : null);
      throw new Error('unexpected endpoint');
    }
  });
  assert.equal((await provider.authenticate(token, '')).user.username, 'teacher');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + token);
  assert.deepEqual(JSON.parse(requests[1].options.body), { p_user: id, p_session: sessionId });
  enabled = false;
  assert.equal(await provider.authenticate(token, ''), null);
});

test('Supabase errors are sanitized and database authorization failures remain actionable', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' };
  const denied = createSupabaseProvider(env, { fetch: async () => Response.json({ message: 'E_FORBIDDEN' }, { status: 400 }) });
  await assert.rejects(denied.listUsers({ id: 'anything' }, {}), error => error.code === 'FORBIDDEN' && error.status === 403);
  const failed = createSupabaseProvider(env, { fetch: async () => Response.json({ message: 'internal fixture-secret database schema detail' }, { status: 500 }) });
  await assert.rejects(failed.listUsers({ id: 'anything' }, {}), error => error.code === 'ACCOUNT_SERVICE_UNAVAILABLE' && !error.message.includes('fixture-secret'));
});

test('new Supabase secret keys go in apikey without being misrepresented as bearer JWTs', async () => {
  const calls = [];
  const provider = createSupabaseProvider({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_fixture' }, {
    fetch: async (url, options) => { calls.push({ url, options }); return Response.json({ users: [], total: 0, page: 1, pageSize: 20 }); }
  });
  await provider.listUsers({ id: 'actor' }, {});
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_fixture');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('real SQLite concurrent refreshes keep account creation authenticated and persist the new user', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tashan-create-regression-'));
  const file = join(folder, 'accounts.sqlite');
  let provider = new LocalProvider(file);
  try {
    await provider.bootstrap({ username: 'admin', password: '12345678', displayName: 'Test admin' });
    const signedIn = await provider.login('admin', '12345678');
    provider.db.prepare('UPDATE sessions SET access_until = 0').run();
    const results = await Promise.all(Array.from({ length: 6 }, () => provider.authenticate(signedIn.session.accessToken, signedIn.session.refreshToken)));
    assert.ok(results.every(result => result?.user.id === signedIn.user.id), 'Every simultaneous request remains authenticated');
    assert.equal(new Set(results.map(result => result.session.accessToken)).size, 1, 'Overlapping responses set the same renewed cookie');
    const oldCookie = `tashan_access=${signedIn.session.accessToken}; tashan_refresh=${signedIn.session.refreshToken}`;
    const createdResponse = await call(provider, '/admin/users', { method: 'POST', cookie: oldCookie, data: { username: 'teacher_create', displayName: '创建验证教师', password: 'CreateTeacher1234', role: 'member' } });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).user;
    const listed = await call(provider, '/admin/users?query=teacher_create', { cookie: cookieHeader(createdResponse) });
    assert.equal((await listed.json()).users[0].id, created.id);
    provider.close(); provider = new LocalProvider(file);
    const teacher = await login(provider, 'teacher_create', 'CreateTeacher1234');
    assert.equal(teacher.data.user.id, created.id, 'A freshly opened SQLite connection can sign the new user in');
    assert.equal(teacher.data.user.mustChangePassword, false);
  } finally { provider.close(); await rm(folder, { recursive: true, force: true }); }
});

test('real SQLite refresh replay never restores a logged-out or disabled session', async () => {
  const provider = new LocalProvider(':memory:');
  try {
    const admin = await provider.bootstrap({ username: 'admin', password: '12345678', displayName: 'Test admin' });
    const member = await provider.createUser(admin, { username: 'refresh_member', displayName: 'Refresh member', password: 'RefreshMember1234', role: 'member' });
    const signedIn = await provider.login('refresh_member', 'RefreshMember1234');
    provider.db.prepare('UPDATE sessions SET access_until = 0').run();
    const renewed = await provider.authenticate(signedIn.session.accessToken, signedIn.session.refreshToken);
    // Logout can itself race the response that carries the new cookies.
    await provider.logout(signedIn.session.accessToken, signedIn.session.refreshToken);
    assert.equal(await provider.authenticate(signedIn.session.accessToken, signedIn.session.refreshToken), null);
    assert.equal(await provider.authenticate(renewed.session.accessToken, renewed.session.refreshToken), null);
    const next = await provider.login('refresh_member', 'RefreshMember1234');
    provider.db.prepare('UPDATE sessions SET access_until = 0').run();
    await provider.authenticate(next.session.accessToken, next.session.refreshToken);
    await provider.updateUser(admin, member.id, { status: 'disabled' });
    assert.equal(await provider.authenticate(next.session.accessToken, next.session.refreshToken), null);
  } finally { provider.close(); }
});

test('SQLite onboarding upgrade is atomic, evidence-based and never clears a later password reset', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'tashan-onboarding-upgrade-'));
  const file = join(folder, 'accounts.sqlite');
  let provider = new LocalProvider(file);
  try {
    assert.equal(provider.db.prepare('PRAGMA table_info(accounts)').all().find(column => column.name === 'must_change_password').dflt_value, '0', 'New account tables default to ordinary access');
    const admin = await provider.bootstrap({ username:'admin', password:'FixtureAdmin1234', displayName:'Fixture admin' });
    const template = provider.account(admin.id), stamp = '2026-09-01T00:00:00.000Z';
    const protectedKinds = ['disabled','reset','changed','unknown','duplicate','password-pending','future-credential','wrong-creation','unknown-update','malformed-update','missing-actor','self-created'];
    for (const kind of ['initial', ...protectedKinds]) {
      const id = 'legacy-' + kind;
      provider.db.prepare('INSERT INTO accounts (id,username,display_name,password_hash,role,status,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, id, id, template.password_hash, 'member', kind === 'disabled' ? 'disabled' : 'active', 1, stamp, stamp);
      if (kind !== 'unknown') provider.record(kind === 'self-created' ? {id} : admin, 'account.created', id, {username:id,role:'member'});
      if (kind === 'duplicate') provider.record(admin, 'account.created', id, {username:id,role:'member'});
      if (kind === 'reset') provider.record(admin, 'account.password_reset', id);
      if (kind === 'changed') provider.record({id}, 'auth.password_changed', id);
      if (kind === 'password-pending') provider.record({id}, 'auth.password_change_pending', id);
      if (kind === 'future-credential') provider.record(admin, 'account.credential_rotated', id);
      if (kind === 'wrong-creation') provider.db.prepare("UPDATE audit SET details=? WHERE target_id=? AND action='account.created'").run(JSON.stringify({username:'someone-else',role:'member'}),id);
      if (kind === 'unknown-update') provider.record(admin, 'account.updated', id, {mustChangePassword:true});
      if (kind === 'malformed-update') provider.record(admin, 'account.updated', id, []);
      if (kind === 'missing-actor') provider.record(null, 'account.updated', id, {displayName:id});
    }
    provider.record({id:'legacy-initial'}, 'auth.login', 'legacy-initial');
    provider.record(admin, 'account.updated', 'legacy-initial', {displayName:'Updated display'});
    const initialSession = provider.issue('legacy-initial');
    provider.issue('legacy-reset');
    const credentialsBefore = provider.db.prepare('SELECT id,password_hash,role,status,created_at FROM accounts ORDER BY id').all();
    const sessionsBefore = provider.db.prepare('SELECT * FROM sessions ORDER BY id').all();
    // Remove only the test database's marker to represent an older installation.
    provider.db.prepare("DELETE FROM audit WHERE action='system.initial_password_optional'").run();
    provider.db.exec("CREATE TRIGGER fail_policy_marker BEFORE INSERT ON audit WHEN NEW.action='system.initial_password_optional' BEGIN SELECT RAISE(ABORT,'simulated migration failure'); END;");
    assert.throws(() => provider.upgradeInitialPasswordPolicy(), /simulated migration failure/);
    assert.equal(provider.account('legacy-initial').must_change_password, 1, 'A failed completion marker rolls back account updates');
    assert.equal(provider.db.prepare("SELECT count(*) n FROM audit WHERE action='account.initial_password_requirement_removed'").get().n, 0, 'Failed upgrades leave no partial per-account audit');
    provider.db.exec('DROP TRIGGER fail_policy_marker');
    provider.close(); provider = new LocalProvider(file);
    assert.equal(provider.account('legacy-initial').must_change_password, 0);
    for (const kind of protectedKinds) assert.equal(provider.account('legacy-' + kind).must_change_password, 1, kind + ' keeps its existing protection');
    assert.deepEqual(provider.db.prepare('SELECT id,password_hash,role,status,created_at FROM accounts ORDER BY id').all(), credentialsBefore, 'The upgrade never changes credentials, roles or account status');
    assert.deepEqual(provider.db.prepare('SELECT * FROM sessions ORDER BY id').all(), sessionsBefore, 'The upgrade does not mint or remove sessions');
    assert.equal((await provider.authenticate(initialSession.accessToken, initialSession.refreshToken)).user.mustChangePassword, false, 'Existing authenticated sessions see the corrected account state');
    const auditBeforeRestart = provider.db.prepare('SELECT * FROM audit ORDER BY id').all();
    provider.close(); provider = new LocalProvider(file);
    assert.deepEqual(provider.db.prepare('SELECT * FROM audit ORDER BY id').all(), auditBeforeRestart, 'A repeated upgrade is a no-op');
    await provider.resetPassword(admin, 'legacy-initial', 'ResetAfterUpgrade1234');
    assert.equal(await provider.authenticate(initialSession.accessToken, initialSession.refreshToken), null, 'A subsequent reset still revokes old sessions');
    provider.close(); provider = new LocalProvider(file);
    assert.equal(provider.account('legacy-initial').must_change_password, 1, 'Restarting cannot undo a reset performed after the upgrade');
    assert.equal(provider.db.prepare("SELECT count(*) n FROM audit WHERE action='system.initial_password_optional'").get().n, 1);
    assert.equal(provider.db.prepare("SELECT count(*) n FROM audit WHERE action='account.initial_password_requirement_removed'").get().n, 1);
  } finally { provider.close(); await rm(folder, { recursive:true, force:true }); }
});
