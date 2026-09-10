import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalProvider} from '../server/local-provider.mjs';
import {LocalProjectsProvider} from '../server/local-projects.mjs';
import {handleProjectRequest,normalizeProjectVersion,PROJECT_LIMITS} from '../server/projects-api.mjs';
import {createSupabaseProjectsProvider} from '../server/supabase-projects.mjs';
import {handleApi} from '../server/api.mjs';

const origin='http://127.0.0.1:4189';
const id='local-01234567-89ab-4cde-8fab-0123456789ab';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=';
function snapshot(number=1,title='圆的探索'){
 return {projectCode:'TS-L-0123456789AB4CDE',version:{id:'version-fixture-'+number,number,createdAt:'2026-09-10T08:00:00.000Z',note:'版本记录',sourceReferences:[{projectId:'earth',title:{'zh-CN':'地球公转'},versionNumber:1}]},
 metadata:{id,title,kind:'visual',subject:'数学',core:'用于课堂投屏的几何探索',currentVersionId:'version-fixture-'+number},
 files:{attachment:{name:'project.html',type:'text/html',base64:Buffer.from('<h1>Private geometry</h1><script>window.demo=true</script>').toString('base64')},coverFile:{name:'cover.png',type:'image/png',base64:png}}};
}
async function fixture(work){
 const directory=await mkdtemp(join(tmpdir(),'tashan-project-api-')),database=join(directory,'accounts.sqlite'),filesDir=join(directory,'files');
 let accounts=new LocalProvider(database),provider=new LocalProjectsProvider(accounts,{filesDir});
 const admin=await accounts.bootstrap({username:'admin',password:'FixtureAdmin123',displayName:'测试管理员'});
 const member=await accounts.createUser(admin,{username:'teacher',password:'FixtureTeacher123',displayName:'测试教师',role:'member'});
 const memberIdentity=(await accounts.changePassword(member,'FixtureTeacher123','FixtureTeacher234')).user;
 const env={admin,member:memberIdentity,provider,accounts,directory,filesDir,async restart(){accounts.close();accounts=new LocalProvider(database);provider=new LocalProjectsProvider(accounts,{filesDir});env.accounts=accounts;env.provider=provider;}};
 try{await work(env);}finally{accounts.close();await rm(directory,{recursive:true,force:true});}
}
async function call(env,path,{user=env.member,method='GET',data,requestOrigin=origin,headers={}}={}){
 const request=new Request(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:requestOrigin,...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
 const response=await handleProjectRequest(request,{user,provider:env.provider,clientIp:'fixture'});
 const result=response.headers.get('Content-Type')?.includes('application/json')?await response.json():null;
 return {response,status:response.status,data:result};
}
const save=(env,value=snapshot(),options={})=>call(env,`/projects/${id}/versions`,{method:'POST',data:value,...options});

test('real SQLite/files upload is private, durable, idempotent and retains stable IDs/provenance',async()=>fixture(async env=>{
 const first=await save(env);assert.equal(first.status,201,JSON.stringify(first.data));
 assert.equal(first.data.project.projectCode,snapshot().projectCode);assert.equal(first.data.version.id,'version-fixture-1');
 assert.deepEqual(first.data.version.sourceReferences,snapshot().version.sourceReferences);
 assert.equal(first.data.version.files.attachment.base64,undefined);assert.equal(first.data.version.files.attachment.bytes,undefined);
 assert.equal((await save(env)).status,200,'An identical retry reuses the immutable snapshot');
 assert.equal(env.accounts.db.prepare('SELECT count(*) n FROM project_versions').get().n,1);
 assert.equal((await readdir(join(env.filesDir,env.member.id))).length,2);
 assert.equal((await call(env,`/projects/${id}`,{user:null})).status,401);
 assert.equal((await call(env,`/projects/${id}`,{user:env.admin})).status,404,'Admin status does not expose another owner’s private work');
 assert.equal((await call(env,'/published',{user:null})).data.total,0);
 await env.restart();
 const opened=await call(env,`/projects/${id}/versions/version-fixture-1`);
 assert.equal(opened.status,200);assert.equal(opened.data.version.metadata.title,'圆的探索');
 const file=await call(env,`/projects/${id}/versions/version-fixture-1/files/attachment`);
 assert.match(await file.response.text(),/Private geometry/);assert.match(file.response.headers.get('Content-Disposition'),/^attachment/);
 assert.equal(file.response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(file.response.headers.get('Content-Security-Policy'),/sandbox/);
}));

test('members publish only their own frozen version, new drafts never alter public content',async()=>fixture(async env=>{
 await save(env);
 let published=await call(env,`/projects/${id}/publish`,{method:'POST',data:{versionId:'version-fixture-1',expectedVersionId:null}});
 assert.equal(published.status,200);assert.equal(published.data.project.publishedVersionId,'version-fixture-1');
 assert.equal((await call(env,`/published/${id}`,{user:null})).data.project.title,'圆的探索');
 await save(env,snapshot(2,'已改名的新草稿'));
 assert.equal((await call(env,`/projects/${id}`)).data.project.title,'已改名的新草稿');
 const publicProject=(await call(env,`/published/${id}`,{user:null})).data.project;
 assert.equal(publicProject.title,'圆的探索');assert.equal(publicProject.latestVersionId,'version-fixture-1');
 assert.match(publicProject.coverURL,/published\/.+\/version-fixture-1\/files\/coverFile$/);
 assert.equal((await call(env,`/published/${id}/versions/version-fixture-2`,{user:null})).status,404);
 assert.equal((await call(env,`/projects/${id}/publish`,{user:env.admin,method:'POST',data:{versionId:'version-fixture-2',expectedVersionId:'version-fixture-1'}})).status,404);
 const wrong=await call(env,`/projects/${id}/publish`,{method:'POST',data:{versionId:'version-fixture-2',expectedVersionId:null}});assert.equal(wrong.status,409);
 published=await call(env,`/projects/${id}/publish`,{method:'POST',data:{versionId:'version-fixture-2',expectedVersionId:'version-fixture-1'}});assert.equal(published.status,200);
 assert.equal((await call(env,`/published/${id}/versions/version-fixture-1/files/attachment`,{user:null})).status,404,'Previously published versions stop being public after replacement');
 assert.equal((await call(env,`/projects/${id}/publication`,{method:'DELETE',data:{expectedVersionId:'version-fixture-1'}})).status,409);
 assert.equal((await call(env,`/projects/${id}/publication`,{method:'DELETE',data:{expectedVersionId:'version-fixture-2'}})).status,200);
 assert.equal((await call(env,`/published/${id}/versions/version-fixture-2/files/attachment`,{user:null})).status,404);
 assert.equal((await call(env,`/projects/${id}/versions/version-fixture-1`)).status,200,'Withdrawal preserves owner history');
}));

test('immutable IDs, version numbers and project codes reject conflicting uploads',async()=>fixture(async env=>{
 await save(env);
 const changed=snapshot();changed.metadata.title='Do not overwrite';assert.equal((await save(env,changed)).status,409);
 const collision=snapshot();collision.version.id='version-same-number';assert.equal((await save(env,collision)).data.error.code,'VERSION_NUMBER_CONFLICT');
 const renumber=snapshot(2);renumber.projectCode='TS-L-AAAAAAAAAAAAAAAA';assert.equal((await save(env,renumber)).data.error.code,'PROJECT_CODE_CONFLICT');
 const other=snapshot();other.metadata.id='local-another-project';other.version.id='version-other-project';
 assert.equal((await call(env,'/projects/local-another-project/versions',{method:'POST',data:other})).data.error.code,'PROJECT_CODE_CONFLICT');
 assert.equal((await call(env,`/projects/${id}/versions`)).data.versions.length,1);
 await save(env,snapshot(2));assert.equal(env.accounts.db.prepare('SELECT count(*) n FROM project_assets').get().n,2,'Identical bytes are shared within an owner across versions');
}));

test('disabled owners lose access and their publication no longer serves files',async()=>fixture(async env=>{
 await save(env);await call(env,`/projects/${id}/publish`,{method:'POST',data:{versionId:'version-fixture-1',expectedVersionId:null}});
 await env.accounts.updateUser(env.admin,env.member.id,{status:'disabled'});
 assert.equal((await call(env,`/projects/${id}`)).status,401,'Provider re-checks the account instead of trusting stale request identity');
 assert.equal((await call(env,'/published',{user:null})).data.total,0);
 assert.equal((await call(env,`/published/${id}/versions/version-fixture-1/files/attachment`,{user:null})).status,404);
}));

test('invalid bodies, unsafe filenames, fake cover images and foreign Origins never write files',async()=>fixture(async env=>{
 assert.equal((await save(env,snapshot(),{requestOrigin:'https://outside.invalid'})).status,403);
 const traversal=snapshot();traversal.files.attachment.name='../private.html';assert.equal((await save(env,traversal)).status,400);
 const cover=snapshot();cover.files.coverFile.base64=Buffer.from('<script>bad</script>').toString('base64');assert.equal((await save(env,cover)).status,400);
 const oversized=await save(env,snapshot(),{headers:{'Content-Length':String(PROJECT_LIMITS.requestBytes+1)}});assert.equal(oversized.status,413);
 const metadata=snapshot();metadata.metadata.attachment={base64:'unsafe'};assert.equal((await save(env,metadata)).status,400);
 assert.equal((await readdir(env.filesDir)).length,0);
 assert.equal(env.accounts.db.prepare('SELECT count(*) n FROM projects').get().n,0);
}));

test('deterministic missing codes use UUID-derived IDs and changing a title does not renumber',async()=>{
 const value=snapshot();delete value.projectCode;const normalized=await normalizeProjectVersion(id,value);
 assert.equal(normalized.projectCode,'TS-L-0123456789AB4CDE');
 value.metadata.title='Another title';assert.equal((await normalizeProjectVersion(id,value)).projectCode,normalized.projectCode);
});

test('maximum-size attachments decode without regexp stack exhaustion; malformed padding is rejected',async()=>{
 assert.equal(PROJECT_LIMITS.attachmentBytes,10*1024*1024);
 assert.equal(PROJECT_LIMITS.coverBytes,5*1024*1024);
 assert.equal(PROJECT_LIMITS.ownerBytes,200*1024*1024);
 const value=snapshot();value.files={attachment:{name:'large.txt',base64:Buffer.alloc(PROJECT_LIMITS.attachmentBytes,65).toString('base64')}};
 assert.equal((await normalizeProjectVersion(id,value)).files.attachment.size,PROJECT_LIMITS.attachmentBytes);
 for(const base64 of ['A===','=AAA','AA=A','A','@@==']){
  value.files.attachment.base64=base64;
  await assert.rejects(normalizeProjectVersion(id,value),error=>error.code==='INVALID_PROJECT');
 }
});

test('10 MiB plus one byte is rejected before Base64 decoding or saving any version',async()=>{
 const env={member:{id:'fixture-member',status:'active',mustChangePassword:false},provider:{status:async()=>({configured:true,mode:'fixture'}),saveVersion:()=>assert.fail('Oversized attachments must never save')}};
 const value=snapshot();value.files.attachment.base64=Buffer.alloc(10*1024*1024+1,65).toString('base64');
 const original=globalThis.atob;let decodes=0;
 globalThis.atob=()=>{decodes++;throw new Error('Unexpected decode');};
 try{
  const result=await save(env,value);assert.equal(result.status,413);assert.equal(result.data.error.code,'FILE_TOO_LARGE');assert.equal(decodes,0);
 }finally{globalThis.atob=original;}
});

test('cloud +00:00 timestamps normalize to ISO Z in private/public downloads and version lists',async()=>{
 const createdAt='2026-09-10T08:00:00+00:00',project={id},version={...snapshot().version,createdAt,metadata:snapshot().metadata,files:{}};
 const env={member:{id:'fixture-member',status:'active',mustChangePassword:false},provider:{status:async()=>({configured:true,mode:'supabase'}),getVersion:async()=>({project,version}),listVersions:async()=>({project,versions:[version]})}};
 for(const path of [`/projects/${id}/versions/version-fixture-1`,`/published/${id}/versions/version-fixture-1`]){
  const result=await call(env,path);assert.equal(result.status,200);assert.equal(result.data.version.createdAt,'2026-09-10T08:00:00.000Z');
 }
 const listed=await call(env,`/projects/${id}/versions`);assert.equal(listed.status,200);assert.equal(listed.data.versions[0].createdAt,'2026-09-10T08:00:00.000Z');
 assert.equal(version.createdAt,createdAt,'Response normalization does not mutate provider records');
});

test('incremental attachment migration changes only the attachment bound and preserves the 200 MiB owner quota',async()=>{
 const original=await readFile(new URL('../supabase/migrations/202609100002_projects.sql',import.meta.url),'utf8');
 const migration=await readFile(new URL('../supabase/migrations/202609100003_attachment_limit.sql',import.meta.url),'utf8');
 const previous=original.match(/create function public\.tashan_project_prepare\([\s\S]*?end;\$\$;/)[0];
 const next=migration.match(/create or replace function public\.tashan_project_prepare\([\s\S]*?end;\$\$;/)[0];
 assert.equal(next,previous.replace('create function','create or replace function').replace('else 20971520 end','else 10485760 end'),'No unrelated function behavior or quota may change');
 assert.match(next,/used\+extra\+metadata_size>209715200/);
 assert.match(migration,/revoke all on function public\.tashan_project_prepare\(uuid,jsonb\) from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.tashan_project_prepare\(uuid,jsonb\) to service_role/);
});

test('catalog provenance retains stable revision IDs alongside uploaded snapshot references',async()=>{
 const value=snapshot();value.version.sourceReferences=[{projectId:'earth',projectCode:'TS-0001',versionId:'catalog-'+'a'.repeat(32),versionNumber:null,title:{'zh-CN':'地球'}}];
 assert.deepEqual((await normalizeProjectVersion(id,value)).sourceReferences,value.version.sourceReferences);
 value.version.sourceReferences[0].versionId='../invalid';
 await assert.rejects(normalizeProjectVersion(id,value),error=>error.code==='INVALID_PROJECT');
});

test('simultaneous publishers cannot replace a version selected against stale publication state',async()=>fixture(async env=>{
 await save(env);await save(env,snapshot(2));await save(env,snapshot(3));
 await env.provider.publish(env.member,id,{versionId:'version-fixture-1',expectedVersionId:null});
 const results=await Promise.allSettled([2,3].map(number=>env.provider.publish(env.member,id,{versionId:'version-fixture-'+number,expectedVersionId:'version-fixture-1'})));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.code,'PUBLICATION_CONFLICT');
}));

test('authenticated project browsing does not spend the separate upload rate-limit budget',async()=>fixture(async env=>{
 const context={projectsProvider:env.provider,clientIp:'project-rate-fixture'};
 const login=await handleApi(new Request(origin+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'teacher',password:'FixtureTeacher234'})}),env.accounts,context);
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
 const authenticated=async(path,method='GET',data)=>handleApi(new Request(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},...(data===undefined?{}:{body:JSON.stringify(data)})}),env.accounts,context);
 for(let index=0;index<20;index++)assert.equal((await authenticated('/projects')).status,200);
 const upload=await authenticated(`/projects/${id}/versions`,'POST',snapshot());
 assert.equal(upload.status,201,JSON.stringify(await upload.json()));
 assert.equal(env.accounts.db.prepare('SELECT count(*) n FROM project_versions').get().n,1);
}));

test('Supabase upload reserves privately, uploads immutable Storage objects, then commits readiness',async()=>{
 const normalized=await normalizeProjectVersion(id,snapshot()),events=[];
 const record={project:{id,projectCode:normalized.projectCode},version:{...normalized,files:Object.fromEntries(Object.entries(normalized.files).map(([field,{bytes,...file}])=>[field,file]))},created:true};
 const provider=createSupabaseProjectsProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'},{fetch:async(url,options)=>{
  events.push({url,options});
  if(url.endsWith('/tashan_project_prepare'))return Response.json({ready:false,created:true});
  if(url.includes('/storage/v1/object/'))return Response.json({Key:'private-object'});
  if(url.endsWith('/tashan_project_commit'))return Response.json(record);
  throw new Error('Unexpected fixture endpoint');
 }});
 const result=await provider.saveVersion({id:'owner-uuid'},normalized);assert.equal(result.created,true);
 assert.match(events[0].url,/tashan_project_prepare$/);assert.match(events.at(-1).url,/tashan_project_commit$/);
 const manifest=JSON.parse(events[0].options.body).p_snapshot;
 assert.equal(manifest.files.attachment.bytes,undefined);assert.equal(manifest.files.attachment.base64,undefined);
 for(const event of events.filter(event=>event.url.includes('/storage/'))){assert.equal(event.options.headers['x-upsert'],'false');assert.ok(event.options.body instanceof Uint8Array);assert.equal(event.options.headers.Authorization,undefined);}
});

test('failed Supabase file upload does not commit or publish and a same-version retry can finish',async()=>{
 const normalized=await normalizeProjectVersion(id,snapshot());let failUpload=true,committed=0;
 const provider=createSupabaseProjectsProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'},{fetch:async(url)=>{
  if(url.endsWith('/tashan_project_prepare'))return Response.json({ready:false,created:false});
  if(url.includes('/storage/'))return failUpload?Response.json({message:'upstream secret details'},{status:500}):Response.json({Key:'object'});
  if(url.endsWith('/tashan_project_commit')){committed++;return Response.json({created:true,project:{id},version:{id:normalized.id}});}
  throw new Error('Unexpected fixture endpoint');
 }});
 await assert.rejects(provider.saveVersion({id:'owner'},normalized),error=>error.code==='PROJECT_SERVICE_UNAVAILABLE'&&!error.message.includes('secret'));
 assert.equal(committed,0);failUpload=false;await provider.saveVersion({id:'owner'},normalized);assert.equal(committed,1);
});

test('public file requests reauthorize through SQL and never expose Storage keys or signed URLs',async()=>{
 const events=[],hash='a'.repeat(64);
 const provider=createSupabaseProjectsProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'},{fetch:async(url,options)=>{
  events.push({url,options});
  if(url.endsWith('/tashan_project_file'))return Response.json({name:'project.html',type:'text/html',size:8,sha256:hash,objectKey:'owner/'+hash});
  return new Response('<p>x</p>');
 }});
 const file=await provider.getFile(null,id,'version-fixture-1','attachment',{published:true});
 assert.equal(JSON.parse(events[0].options.body).p_actor,null);assert.equal(JSON.parse(events[0].options.body).p_public,true);
 assert.match(events[1].url,/\/object\/authenticated\/tashan-projects\//);assert.equal(file.objectKey,undefined);assert.equal(file.signedUrl,undefined);
});

test('unconfigured hosted project service advertises false capabilities without local fallback',async()=>{
 const env={provider:createSupabaseProjectsProvider({}),member:null};
 const status=await call(env,'/projects/capabilities',{user:null});assert.equal(status.data.configured,false);assert.equal(status.data.canUpload,false);assert.equal(status.data.canPublish,false);
 assert.equal((await call(env,'/published',{user:null})).status,503);
});

// Optional actual PostgreSQL engine check, kept dependency-free for the normal
// Node/SQLite suite. Point PGLITE_MODULE at an independently installed PGlite ESM
// module to validate migrations and SQL RPC behavior without a cloud account.
test('PostgreSQL migrations and private reserve/commit/publication authorization lifecycle', {skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const rpc=async(name,args,casts)=>{
  const sql='select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts?.[i]?'::'+casts[i]:'')).join(',')+') as result';
  return (await db.query(sql,args)).rows[0].result;
 };
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(bucket_id text,name text);');
  // Existing projects may have permissive sequence defaults and similarly named
  // functions. Migrations must revoke only their own exact signatures/sequence.
  await db.exec("alter default privileges in schema public grant all on sequences to public,anon,authenticated;create function public.tashan_legacy_tool() returns integer language sql as 'select 1';create function public.tashan_project_legacy() returns integer language sql as 'select 2';create function public.tashanXprojectYlegacy() returns integer language sql as 'select 3';create function public.tashan_project_get(text) returns integer language sql as 'select 4';insert into storage.buckets values('existing-app','existing-app',true,777);");
  const existingFunctions=await db.query("select oid,proname,proacl from pg_proc where pronamespace='public'::regnamespace order by oid");
  const existingBuckets=await db.query('select * from storage.buckets order by id');
  for(const name of ['202609100001_accounts.sql','202609100002_projects.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const prepareBefore=(await db.query("select oid,proacl,prosecdef,proconfig from pg_proc where oid='public.tashan_project_prepare(uuid,jsonb)'::regprocedure")).rows;
  const policiesBefore=(await db.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname")).rows;
  await db.exec(await readFile(new URL('../supabase/migrations/202609100003_attachment_limit.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query("select oid,proacl,prosecdef,proconfig from pg_proc where oid='public.tashan_project_prepare(uuid,jsonb)'::regprocedure")).rows,prepareBefore,'Limit migration preserves function identity and execution grants');
  assert.deepEqual((await db.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname")).rows,policiesBefore,'Limit migration leaves RLS policies unchanged');
  await db.exec(await readFile(new URL('../supabase/migrations/202609100004_account_onboarding.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select * from storage.buckets order by id')).rows,existingBuckets.rows,'Schema migrations do not create or modify Storage metadata');
  const preservedFunctions=await db.query("select oid,proname,proacl from pg_proc where oid=any($1::oid[]) order by oid",[existingFunctions.rows.map(row=>row.oid)]);
  assert.deepEqual(preservedFunctions.rows,existingFunctions.rows,'Unrelated prefixes and same-name overloads retain their ACLs');
  const installedFunctions=await db.query("select p.oid,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute from pg_proc p where p.pronamespace='public'::regnamespace and not(p.oid=any($1::oid[]))",[existingFunctions.rows.map(row=>row.oid)]);
  assert.equal(installedFunctions.rows.length,21);
  for(const row of installedFunctions.rows){assert.equal(row.prosecdef,true);assert.equal(row.anon_execute,false);assert.equal(row.member_execute,false);assert.equal(row.service_execute,true);}
  const sequenceACL=(await db.query("select has_sequence_privilege('anon','public.tashan_account_audit_id_seq','USAGE,SELECT,UPDATE') as anon_access,has_sequence_privilege('authenticated','public.tashan_account_audit_id_seq','USAGE,SELECT,UPDATE') as member_access,has_sequence_privilege('service_role','public.tashan_account_audit_id_seq','USAGE') as service_usage,has_sequence_privilege('service_role','public.tashan_account_audit_id_seq','SELECT') as service_select")).rows[0];
  assert.deepEqual(sequenceACL,{anon_access:false,member_access:false,service_usage:true,service_select:true});
  // Test-only metadata fixture representing the result of a separate Storage API
  // createBucket call. Production must not provision buckets with direct SQL.
  await db.query("insert into storage.buckets values('tashan-projects','tashan-projects',false,10485760)");
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await db.query("insert into public.tashan_accounts(id,username,display_name,role,must_change_password) values($1,'teacher','Teacher','member',false),($2,'admin','Admin','admin',false)",[owner,other]);
  assert.equal((await db.query("select public from storage.buckets where id='tashan-projects'")).rows[0].public,false);
  const normalized=await normalizeProjectVersion(id,snapshot());
  const manifest={...normalized,files:Object.fromEntries(Object.entries(normalized.files).map(([field,{bytes,...file}])=>[field,file]))};
  // Size enforcement is independently retained at the SQL RPC boundary.
  const boundary={...manifest,projectId:'local-sql-limit',projectCode:'TS-L-ABCDEF0123456789',id:'version-sql-limit',files:{attachment:{...manifest.files.attachment,size:10485761,sha256:'a'.repeat(64)}}};
  await assert.rejects(rpc('tashan_project_prepare',[owner,boundary],['uuid','jsonb']),/E_INVALID_INPUT/);
  assert.equal((await db.query("select count(*)::integer n from public.tashan_projects where id='local-sql-limit'")).rows[0].n,0,'Rejected size allocates no project or assets');
  boundary.files.attachment.size=10485760;
  assert.equal((await rpc('tashan_project_prepare',[owner,boundary],['uuid','jsonb'])).ready,false,'Exactly 10 MiB is accepted');
  const coverBoundary={...boundary,id:'version-sql-cover-limit',number:2,files:{coverFile:{...manifest.files.coverFile,size:5242881,sha256:'b'.repeat(64)}}};
  await assert.rejects(rpc('tashan_project_prepare',[owner,coverBoundary],['uuid','jsonb']),/E_INVALID_INPUT/);
  coverBoundary.files.coverFile.size=5242880;
  assert.equal((await rpc('tashan_project_prepare',[owner,coverBoundary],['uuid','jsonb'])).ready,false,'The existing 5 MiB cover limit remains unchanged');
  // Nineteen pre-existing 10 MiB files model a 190 MiB account without allocating
  // actual blobs. Another 9 MiB still fits, but 1 MiB after it exceeds 200 MiB
  // once version metadata is included. This catches accidental quota reductions.
  for(let number=1;number<=19;number++){
   const sha256=number.toString(16).padStart(64,'0');
   await db.query('insert into public.tashan_project_assets(id,owner_id,sha256,size) values($1,$2,$3,10485760)',[other+'/'+sha256,other,sha256]);
  }
  const quota={...manifest,projectId:'local-sql-owner-quota',projectCode:'TS-L-9988776655443322',id:'version-sql-owner-quota',files:{attachment:{...manifest.files.attachment,size:9*1024*1024,sha256:'c'.repeat(64)}}};
  assert.equal((await rpc('tashan_project_prepare',[other,quota],['uuid','jsonb'])).ready,false,'Accounts retain their full 200 MiB allowance');
  const overQuota={...quota,id:'version-sql-over-quota',number:2,files:{attachment:{...quota.files.attachment,size:1024*1024,sha256:'d'.repeat(64)}}};
  await assert.rejects(rpc('tashan_project_prepare',[other,overQuota],['uuid','jsonb']),/E_STORAGE_QUOTA/);
  assert.equal((await db.query('select count(*)::integer n from public.tashan_project_assets where owner_id=$1',[other])).rows[0].n,20,'Quota rejection reserves no additional file');
  assert.equal((await rpc('tashan_project_prepare',[owner,manifest],['uuid','jsonb'])).ready,false);
  assert.equal((await rpc('tashan_project_list',[owner,1])).total,0,'Pending versions are hidden');
  assert.equal((await rpc('tashan_project_published',[1])).total,0);
  await assert.rejects(rpc('tashan_project_publish',[owner,id,normalized.id,null]),/E_PROJECT_NOT_FOUND/);
  await assert.rejects(rpc('tashan_project_commit',[owner,id,normalized.id,normalized.fingerprint]),/E_PROJECT_FILE_MISSING/);
  assert.equal((await rpc('tashan_project_prepare',[owner,manifest],['uuid','jsonb'])).created,false);
  for(const file of Object.values(manifest.files))await db.query("insert into storage.objects(bucket_id,name) values('tashan-projects',$1)",[owner+'/'+file.sha256]);
  await db.query("update public.tashan_accounts set status='disabled' where id=$1",[owner]);
  await assert.rejects(rpc('tashan_project_commit',[owner,id,normalized.id,normalized.fingerprint]),/E_FORBIDDEN/,'Disabling an owner during an upload prevents commit');
  await db.query("update public.tashan_accounts set status='active' where id=$1",[owner]);
  assert.equal((await rpc('tashan_project_commit',[owner,id,normalized.id,normalized.fingerprint])).created,true);
  assert.equal((await rpc('tashan_project_commit',[owner,id,normalized.id,normalized.fingerprint])).created,false);
  await assert.rejects(rpc('tashan_project_version',[other,id,normalized.id,false]),/E_PROJECT_NOT_FOUND/);
  await rpc('tashan_project_publish',[owner,id,normalized.id,null]);
  const draft=await normalizeProjectVersion(id,snapshot(2,'Secret new draft'));
  const draftManifest={...draft,files:manifest.files};
  await rpc('tashan_project_prepare',[owner,draftManifest],['uuid','jsonb']);
  await rpc('tashan_project_commit',[owner,id,draft.id,draft.fingerprint]);
  const visible=await rpc('tashan_project_get',[null,id,true]);
  assert.equal(visible.title,'圆的探索');assert.equal(visible.latestVersionId,normalized.id);
  assert.match(visible.coverURL,/version-fixture-1/);
  await assert.rejects(rpc('tashan_project_version',[null,id,draft.id,true]),/E_PROJECT_NOT_FOUND/);
  const collision={...draftManifest,id:'version-conflict',number:3,projectCode:'TS-L-AAAAAAAAAAAAAAAA'};
  await assert.rejects(rpc('tashan_project_prepare',[owner,collision],['uuid','jsonb']),/E_PROJECT_CODE_CONFLICT/);
  await assert.rejects(rpc('tashan_project_publish',[owner,id,draft.id,null]),/E_PUBLICATION_CONFLICT/);
  await rpc('tashan_project_publish',[owner,id,draft.id,normalized.id]);
  await assert.rejects(rpc('tashan_project_file',[null,id,normalized.id,'attachment',true]),/E_PROJECT_NOT_FOUND/);
  await db.query("update public.tashan_accounts set status='disabled' where id=$1",[owner]);
  assert.equal((await rpc('tashan_project_published',[1])).total,0);
  await assert.rejects(rpc('tashan_project_file',[null,id,draft.id,'attachment',true]),/E_PROJECT_NOT_FOUND/);
  await db.query("update public.tashan_accounts set status='active' where id=$1",[owner]);
  await rpc('tashan_project_unpublish',[owner,id,draft.id]);
  assert.equal((await rpc('tashan_project_published',[1])).total,0);
  assert.equal((await rpc('tashan_project_versions',[owner,id])).versions.length,2);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   try{
    await assert.rejects(db.query('select * from public.tashan_project_versions'),/permission denied/);
    await assert.rejects(rpc('tashan_project_get',[owner,id,false]),/permission denied/);
   }finally{await db.exec('reset role');}
  }
 }finally{await db.close();}
});
