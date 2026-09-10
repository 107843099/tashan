import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {handleApi,validateAffiliation} from '../server/api.mjs';
import {LocalProvider} from '../server/local-provider.mjs';
import {createSupabaseProvider} from '../server/supabase-provider.mjs';

const origin='http://127.0.0.1:4173';
const affiliation=user=>({affiliationType:user.affiliationType,organizationName:user.organizationName});
const personal={affiliationType:'personal',organizationName:''};
const cookie=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function call(provider,path,{method='GET',data,session='',requestOrigin=origin}={}){
  const response=await handleApi(new Request(origin+'/api/v1'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(session?{Cookie:session}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),provider,{clientIp:'affiliation-fixture'});
  return {status:response.status,data:await response.json(),cookie:cookie(response)};
}
const login=(provider,username,password='12345678')=>call(provider,'/auth/login',{method:'POST',data:{username,password}});

test('affiliation validator normalizes personal and Unicode names, validates partial changes without losing omitted fields',()=>{
  assert.deepEqual(validateAffiliation({}),personal);
  assert.deepEqual(validateAffiliation({affiliationType:'personal',organizationName:'Not retained'}),personal);
  assert.deepEqual(validateAffiliation({affiliationType:'school',organizationName:'\u3000实验学校\u00a0'}),{affiliationType:'school',organizationName:'实验学校'});
  assert.equal(Array.from(validateAffiliation({affiliationType:'organization',organizationName:'𠮷'.repeat(100)}).organizationName).length,100);
  for(const input of [{affiliationType:null},{affiliationType:'company'},{affiliationType:'school'},{affiliationType:'school',organizationName:' \u3000'},{affiliationType:'school',organizationName:'𠮷'.repeat(101)},...['\0','\t','\n','\x7f','\u0085','\u009f'].map(control=>({affiliationType:'organization',organizationName:'School'+control}))])assert.throws(()=>validateAffiliation(input),error=>error.status===400);
  assert.deepEqual(validateAffiliation({displayName:'Changed'},{partial:true}),{});
  assert.deepEqual(validateAffiliation({affiliationType:'organization'},{partial:true}),{affiliationType:'organization'});
  assert.deepEqual(validateAffiliation({organizationName:' New school '},{partial:true}),{organizationName:'New school'});
});

test('real HTTP/SQLite creation, editing, sessions and restart retain affiliations without changing permissions or credentials',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'tashan-affiliation-')),path=join(folder,'accounts.sqlite');let provider=new LocalProvider(path);
  try{
    const admin=await provider.bootstrap({username:'aff_admin',displayName:'Admin',password:'12345678'});
    const adminSession=await login(provider,admin.username);assert.equal(adminSession.status,200);assert.deepEqual(affiliation(adminSession.data.user),personal);
    const create=extra=>call(provider,'/admin/users',{method:'POST',session:adminSession.cookie,data:{username:'teacher_one',displayName:'Teacher',password:'12345678',role:'member',...extra}});
    const created=await create({affiliationType:'school',organizationName:'\u3000实验学校\u00a0'});assert.equal(created.status,201);const member=created.data.user;
    assert.deepEqual(affiliation(member),{affiliationType:'school',organizationName:'实验学校'});assert.equal(member.mustChangePassword,false);
    const signedIn=await login(provider,member.username);assert.equal(signedIn.status,200);assert.deepEqual(affiliation(signedIn.data.user),affiliation(member));
    const session=await call(provider,'/auth/session',{session:signedIn.cookie});assert.deepEqual(affiliation(session.data.user),affiliation(member));
    const list=await call(provider,'/admin/users',{session:adminSession.cookie});assert.deepEqual(affiliation(list.data.users.find(row=>row.id===member.id)),affiliation(member));
    const patch=data=>call(provider,'/admin/users/'+member.id,{method:'PATCH',session:adminSession.cookie,data});
    const originalHash=provider.account(member.id).password_hash;
    assert.equal((await patch({displayName:'Renamed'})).status,200);assert.deepEqual(affiliation((await patch({role:'member'})).data.user),affiliation(member),'Old partial patches retain the school');
    const org=await patch({affiliationType:'organization',organizationName:' 教学研究中心 '});assert.equal(org.status,200);assert.equal(org.data.user.organizationName,'教学研究中心');
    assert.equal((await patch({organizationName:'另一个机构'})).data.user.organizationName,'另一个机构');
    const cleared=await patch({affiliationType:'personal',organizationName:'Do not persist this name'});assert.deepEqual(affiliation(cleared.data.user),personal);
    assert.equal((await patch({affiliationType:'school'})).status,400,'Changing a personal account to school needs a name');
    const restored=await patch({affiliationType:'school',organizationName:'稳定学校'});assert.equal(restored.status,200);
    assert.equal(provider.account(member.id).password_hash,originalHash);
    assert.equal((await call(provider,'/auth/session',{session:signedIn.cookie})).data.user.organizationName,'稳定学校','Metadata edits do not revoke valid sessions');
    assert.equal((await call(provider,'/admin/users/'+member.id,{method:'PATCH',session:signedIn.cookie,data:{affiliationType:'personal'}})).status,403);
    assert.equal((await call(provider,'/admin/users/'+member.id,{method:'PATCH',session:adminSession.cookie,requestOrigin:'https://elsewhere.invalid',data:{affiliationType:'personal'}})).status,403);
    assert.equal((await call(provider,'/admin/users/'+admin.id,{method:'PATCH',session:adminSession.cookie,data:{affiliationType:'organization',organizationName:'管理员机构'}})).status,200,'Admins can edit their own affiliation');
    assert.equal((await call(provider,'/admin/users/'+admin.id,{method:'PATCH',session:adminSession.cookie,data:{role:'member',affiliationType:'personal'}})).status,409);
    const audit=JSON.stringify(await provider.listAudit(admin));assert.doesNotMatch(audit,/Do not persist this name|12345678/);
    provider.close();provider=new LocalProvider(path);
    const after=await login(provider,member.username);assert.equal(after.status,200);assert.deepEqual(affiliation(after.data.user),{affiliationType:'school',organizationName:'稳定学校'});assert.equal(provider.account(member.id).password_hash,originalHash);
    const reset=await provider.resetPassword(admin,member.id,'87654321');assert.equal(reset.mustChangePassword,true);assert.equal(reset.organizationName,'稳定学校');assert.equal((await call(provider,'/auth/session',{session:after.cookie})).data.user,null);
    const changed=await provider.changePassword(reset,'87654321','98765432');assert.equal(changed.user.mustChangePassword,false);assert.equal(changed.user.organizationName,'稳定学校');
  }finally{provider.close();await rm(folder,{recursive:true,force:true});}
});

test('invalid account affiliations are rejected before persistence; missing fields keep legacy defaults',async()=>{
  const provider=new LocalProvider(':memory:');
  try{
    const admin=await provider.bootstrap({username:'invalid_admin',password:'12345678'}),signedIn=await login(provider,admin.username);
    const base={username:'invalid_member',displayName:'Teacher',role:'member',password:'12345678'};
    for(const extra of [{affiliationType:'invalid'},{affiliationType:'school'},{affiliationType:'organization',organizationName:' '},{affiliationType:'school',organizationName:'N'.repeat(101)},{affiliationType:'school',organizationName:'Name\u0085'}]){
      const response=await call(provider,'/admin/users',{method:'POST',session:signedIn.cookie,data:{...base,...extra}});assert.equal(response.status,400);assert.equal(provider.db.prepare('select count(*) n from accounts').get().n,1);
    }
    const result=await call(provider,'/admin/users',{method:'POST',session:signedIn.cookie,data:base});assert.equal(result.status,201);assert.deepEqual(affiliation(result.data.user),personal);
    const before=provider.account(result.data.user.id),events=provider.db.prepare('select count(*) n from audit').get().n;
    const invalid=await call(provider,'/admin/users/'+before.id,{method:'PATCH',session:signedIn.cookie,data:{displayName:'Must rollback',affiliationType:'school'}});
    assert.equal(invalid.status,400);assert.deepEqual(provider.account(before.id),before);assert.equal(provider.db.prepare('select count(*) n from audit').get().n,events);
  }finally{provider.close();}
});

test('an actual pre-affiliation SQLite database migrates without rewriting account or session data',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'tashan-old-affiliation-')),path=join(folder,'legacy.sqlite');let provider;
  try{
    const seed=new LocalProvider(':memory:');const admin=await seed.bootstrap({username:'old_admin',password:'12345678'});const row=seed.account(admin.id);seed.close();
    const legacy=new DatabaseSync(path);
    legacy.exec("create table accounts(id text primary key,username text unique not null,display_name text not null,password_hash text not null,role text not null,status text not null,must_change_password integer not null,created_at text not null,updated_at text not null)");
    legacy.prepare('insert into accounts values(?,?,?,?,?,?,?,?,?)').run(...['id','username','display_name','password_hash','role','status','must_change_password','created_at','updated_at'].map(key=>row[key]));legacy.close();
    provider=new LocalProvider(path);const actual={...provider.account(admin.id)};assert.equal(actual.affiliation_type,'personal');assert.equal(actual.organization_name,'');delete actual.affiliation_type;delete actual.organization_name;
    const expected={...row};delete expected.affiliation_type;delete expected.organization_name;assert.deepEqual(actual,expected);
    const signedIn=await provider.login(admin.username,'12345678');const sessionRows=provider.db.prepare('select * from sessions').all();provider.close();provider=new LocalProvider(path);
    assert.deepEqual(provider.db.prepare('select * from sessions').all(),sessionRows);assert.equal((await provider.authenticate(signedIn.session.accessToken,'')).user.affiliationType,'personal');
  }finally{provider?.close();await rm(folder,{recursive:true,force:true});}
});

test('Supabase sends complete affiliation in the atomic registration RPC and returns it through account operations',async()=>{
  const id='50000000-0000-4000-8000-000000000001',actor={id:'50000000-0000-4000-8000-000000000002'},calls=[];
  let row={id,username:'cloud_school',display_name:'Teacher',role:'member',status:'active',must_change_password:false};
  const provider=createSupabaseProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'},{fetch:async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,method:options.method});
    if(path.endsWith('/tashan_require_admin'))return Response.json(null);
    if(path==='/auth/v1/admin/users')return Response.json({id});
    if(path.endsWith('/tashan_register_account_profile')){row={...row,affiliation_type:body.p_affiliation_type,organization_name:body.p_organization_name};return Response.json(row);}
    if(path.endsWith('/tashan_update_account')){const patch=body.p_changes;if(patch.affiliationType)row.affiliation_type=patch.affiliationType;if('organizationName'in patch)row.organization_name=patch.organizationName;return Response.json(row);}
    if(path.endsWith('/tashan_list_accounts'))return Response.json({users:[row],total:1,page:1,pageSize:20});
    if(path==='/auth/v1/token')return Response.json({access_token:'fixture.'+Buffer.from(JSON.stringify({sub:id,session_id:'50000000-0000-4000-8000-000000000003'})).toString('base64url')+'.fixture',refresh_token:'fixture-refresh',expires_in:3600,user:{id}});
    if(path==='/auth/v1/user')return Response.json({id});
    if(path.endsWith('/tashan_session_account'))return Response.json(row);
    throw new Error('Unexpected isolated affiliation fixture route');
  }});
  const input={username:'cloud_school',displayName:'Teacher',role:'member',password:'12345678',affiliationType:'school',organizationName:' 学校 '};
  const created=await provider.createUser(actor,input);assert.deepEqual(affiliation(created),{affiliationType:'school',organizationName:'学校'});
  assert.deepEqual(calls.map(call=>call.path),['/rest/v1/rpc/tashan_require_admin','/auth/v1/admin/users','/rest/v1/rpc/tashan_register_account_profile'],'No second profile PATCH after registration');
  assert.equal(calls[2].body.p_organization_name,'学校');assert.equal(calls[2].body.p_affiliation_type,'school');
  assert.deepEqual(affiliation((await provider.login(input.username,input.password)).user),affiliation(created));assert.deepEqual(affiliation((await provider.listUsers(actor)).users[0]),affiliation(created));
  const before=calls.length;await assert.rejects(provider.createUser(actor,{...input,organizationName:''}),error=>error.code==='INVALID_ORGANIZATION_NAME');assert.equal(calls.length,before);
  await provider.updateUser(actor,id,{displayName:'Renamed'});assert.deepEqual(calls.at(-1).body.p_changes,{displayName:'Renamed'});
  assert.deepEqual(affiliation(await provider.updateUser(actor,id,{affiliationType:'personal',organizationName:'discard'})),personal);
});

test('006 PostgreSQL migration preserves existing rows/security and enforces atomic profile operations', {skip:!process.env.PGLITE_MODULE},async()=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();let count=1;
  const uuid=()=>`60000000-0000-4000-8000-${String(count++).padStart(12,'0')}`;
  const rpc=async(name,args,casts)=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+'::'+casts[i]).join(',')+') result',args)).rows[0].result;
  const oldRegister=async(actor,name,bootstrap=false)=>{const id=uuid();await db.query('insert into auth.users(id) values($1)',[id]);return rpc('tashan_register_account',[actor,id,name,name,bootstrap?'admin':'member',bootstrap],['uuid','uuid','text','text','text','boolean']);};
  const register=async(actor,type,name,username='profile_'+count)=>{const id=uuid();await db.query('insert into auth.users(id) values($1)',[id]);return rpc('tashan_register_account_profile',[actor,id,username,username,'member',false,type,name],['uuid','uuid','text','text','text','boolean','text','text']);};
  const update=(actor,id,changes)=>rpc('tashan_update_account',[actor,id,changes],['uuid','uuid','jsonb']);
  const account=id=>db.query('select * from public.tashan_accounts where id=$1',[id]).then(result=>result.rows[0]);
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);');
    for(const file of ['202609100001_accounts.sql','202609100002_projects.sql','202609100003_attachment_limit.sql','202609100004_account_onboarding.sql','202609110005_stream_uploads.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const admin=await oldRegister(null,'profile_admin',true),old=await oldRegister(admin.id,'old_member');
    const before=(await db.query('select * from public.tashan_accounts order by id')).rows;
    const tables=()=>db.query("select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in('r','S') order by oid").then(result=>result.rows);
    const functions=()=>db.query("select oid,proacl,prosecdef,proconfig,proname from pg_proc where pronamespace='public'::regnamespace order by oid").then(result=>result.rows);
    const beforeTables=await tables(),beforeFunctions=await functions(),oldDefinition=(await db.query("select pg_get_functiondef('public.tashan_register_account(uuid,uuid,text,text,text,boolean)'::regprocedure) definition")).rows;
    await db.exec(await readFile(new URL('../supabase/migrations/202609110006_account_affiliation.sql',import.meta.url),'utf8'));
    const after=(await db.query('select * from public.tashan_accounts order by id')).rows;
    assert.deepEqual(after.map(({affiliation_type,organization_name,...row})=>{assert.equal(affiliation_type,'personal');assert.equal(organization_name,'');return row;}),before);
    assert.deepEqual(await tables(),beforeTables);assert.deepEqual((await functions()).filter(fn=>fn.proname!=='tashan_register_account_profile'),beforeFunctions);
    assert.deepEqual((await db.query("select pg_get_functiondef('public.tashan_register_account(uuid,uuid,text,text,text,boolean)'::regprocedure) definition")).rows,oldDefinition);
    assert.equal((await oldRegister(admin.id,'legacy_client')).affiliation_type,'personal');
    const school=await register(admin.id,'school','\u3000学校\u00a0');assert.equal(school.organization_name,'学校');assert.equal(school.must_change_password,false);
    const astral=await register(admin.id,'organization','𠮷'.repeat(100));assert.equal(Array.from(astral.organization_name).length,100);
    const baseline=(await db.query('select count(*)::int n from public.tashan_accounts')).rows[0].n,auditBaseline=(await db.query('select count(*)::int n from public.tashan_account_audit')).rows[0].n;
    for(const [type,name]of [['school',''],['organization','\u3000\u00a0'],['school','𠮷'.repeat(101)],['organization','Name\u0085'],['invalid','Name']])await assert.rejects(register(admin.id,type,name),/E_INVALID_(ORGANIZATION|AFFILIATION)/);
    assert.equal((await db.query('select count(*)::int n from public.tashan_accounts')).rows[0].n,baseline);assert.equal((await db.query('select count(*)::int n from public.tashan_account_audit')).rows[0].n,auditBaseline,'Invalid registration leaves neither account nor audit');
    const sessionId=uuid();await db.query('insert into auth.sessions values($1,$2,clock_timestamp())',[sessionId,school.id]);
    const credentials=(await db.query('select credentials_changed_at::text value from public.tashan_accounts where id=$1',[school.id])).rows[0].value;
    assert.equal((await update(admin.id,school.id,{displayName:'New display'})).organization_name,'学校');
    assert.equal((await update(admin.id,school.id,{affiliationType:'organization'})).organization_name,'学校');
    assert.equal((await update(admin.id,school.id,{organizationName:' 新机构 '})).organization_name,'新机构');
    const cleared=await update(admin.id,school.id,{affiliationType:'personal',organizationName:'discard'});assert.equal(cleared.organization_name,'');
    assert.equal((await db.query('select credentials_changed_at::text value from public.tashan_accounts where id=$1',[school.id])).rows[0].value,credentials);assert.equal((await rpc('tashan_session_account',[school.id,sessionId],['uuid','uuid'])).id,school.id);
    const rowBefore=await account(school.id);await assert.rejects(update(admin.id,school.id,{displayName:'Rollback',affiliationType:'school'}),/E_INVALID_ORGANIZATION/);assert.deepEqual(await account(school.id),rowBefore);
    await assert.rejects(update(old.id,school.id,{affiliationType:'personal'}),/E_FORBIDDEN/);
    assert.equal((await update(admin.id,admin.id,{affiliationType:'school',organizationName:'Admin school'})).organization_name,'Admin school');
    await assert.rejects(update(admin.id,admin.id,{role:'member',affiliationType:'personal'}),/E_SELF_LOCKOUT/);
    await assert.rejects(db.query("update public.tashan_accounts set organization_name='orphan' where id=$1",[school.id]),/check constraint/);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(rpc('tashan_register_account_profile',[admin.id,uuid(),'denied','Denied','member',false,'personal',''],['uuid','uuid','text','text','text','boolean','text','text']),/permission denied/);
      await assert.rejects(update(admin.id,school.id,{affiliationType:'personal'}),/permission denied/);
      await assert.rejects(db.query('select * from public.tashan_accounts'),/permission denied/);await db.exec('reset role');
    }
    await db.exec('set role service_role');assert.equal((await update(admin.id,school.id,{affiliationType:'organization',organizationName:'Service role fixture'})).organization_name,'Service role fixture');await db.exec('reset role');
    const lock=await rpc('tashan_begin_password_change',[admin.id,school.id,true],['uuid','uuid','boolean']);
    await assert.rejects(update(admin.id,school.id,{affiliationType:'personal'}),/E_ACCOUNT_BUSY/);assert.equal((await account(school.id)).credential_lock,lock.lock);
    assert.equal(await rpc('tashan_session_account',[school.id,sessionId],['uuid','uuid']),null);
    const audit=(await db.query("select details from public.tashan_account_audit where action='account_updated' and details ? 'organizationName'")).rows;
    assert.equal(JSON.stringify(audit).includes('discard'),false);
  }finally{await db.close();}
});
