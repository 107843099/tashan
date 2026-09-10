import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {handleApi} from '../server/api.mjs';
import {LocalProvider} from '../server/local-provider.mjs';
import {createSupabaseProvider} from '../server/supabase-provider.mjs';
import {AI_PROMPT_TASKS,AI_PROMPT_LIMITS,DEFAULT_AI_PROMPTS,validatePromptUpdate,resolvePromptConfig,promptStorageError} from '../server/ai-prompts.mjs';

const origin='http://127.0.0.1:4173';
const raw=(task='upload',revision=1,prompt='A configured teaching instruction')=>({task,prompt,revision,updatedAt:'2026-09-11T00:00:00.000Z',updatedBy:{id:'fixture-editor',username:'editor',displayName:'Editor'}});
async function call(provider,path,{method='GET',data,cookie='',requestOrigin=origin,context={}}={}){
  const response=await handleApi(new Request(origin+'/api/v1'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),provider,{clientIp:'prompt-config-fixture',...context});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),cache:response.headers.get('Cache-Control')};
}
const login=(provider,username)=>call(provider,'/auth/login',{method:'POST',data:{username,password:'12345678'}});

test('prompt contract validates Unicode, text controls, reset and revision; only an absent row uses defaults',()=>{
  assert.equal(AI_PROMPT_LIMITS.requestBytes,20480);
  for(const task of AI_PROMPT_TASKS){const value=resolvePromptConfig(task);assert.equal(value.prompt,DEFAULT_AI_PROMPTS[task]);assert.equal(value.revision,0);assert.equal(value.isDefault,true);assert.equal(value.updatedBy,null);}
  assert.deepEqual(validatePromptUpdate({prompt:' \u3000First\r\nSecond\rThird\tpoint\u00a0',expectedRevision:1}),{prompt:'First\nSecond\nThird\tpoint',expectedRevision:1});
  assert.equal(Array.from(validatePromptUpdate({prompt:'𠮷'.repeat(4000),expectedRevision:0}).prompt).length,4000);
  assert.deepEqual(validatePromptUpdate({prompt:null,expectedRevision:2}),{prompt:null,expectedRevision:2});
  for(const input of [{prompt:'',expectedRevision:0},{prompt:' \t\n',expectedRevision:0},{prompt:'𠮷'.repeat(4001),expectedRevision:0},{prompt:'x',expectedRevision:-1},{prompt:'x',expectedRevision:1.5},{prompt:'x',expectedRevision:Number.MAX_SAFE_INTEGER},{expectedRevision:0},{prompt:[],expectedRevision:0},{prompt:'x',expectedRevision:0,role:'admin'},...['\0','\x08','\v','\f','\x1f','\x7f','\u0085','\u009f'].map(control=>({prompt:'Text'+control,expectedRevision:0}))])assert.throws(()=>validatePromptUpdate(input),error=>error.code==='AI_PROMPT_INVALID');
  const reset=resolvePromptConfig('upload',raw('upload',3,null));assert.equal(reset.revision,3);assert.equal(reset.isDefault,true);assert.equal(reset.prompt,DEFAULT_AI_PROMPTS.upload);
  assert.throws(()=>resolvePromptConfig('unknown'),error=>error.code==='AI_PROMPT_INVALID_TASK');
  for(const row of [{},[],raw('teaching'),{...raw(),prompt:''},{...raw(),prompt:' padded '},{...raw(),revision:0},{...raw(),updatedAt:'invalid'},{...raw(),updatedBy:{id:'one'}}])assert.throws(()=>resolvePromptConfig('upload',row),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
});

test('real SQLite/HTTP stores all tasks, protects admin edits, detects concurrent saves and retains reset revisions across restarts',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'tashan-ai-prompts-')),path=join(folder,'accounts.sqlite');let provider=new LocalProvider(path),second;
  try{
    const admin=await provider.bootstrap({username:'prompt_admin',password:'12345678'});
    const editor=await provider.createUser(admin,{username:'prompt_editor',displayName:'Second editor',role:'admin',password:'12345678'});
    const member=await provider.createUser(admin,{username:'prompt_member',displayName:'Member',role:'member',password:'12345678'});
    const [a,b,m]=await Promise.all([login(provider,admin.username),login(provider,editor.username),login(provider,member.username)]);
    const list=await call(provider,'/admin/ai-prompts',{cookie:a.cookie});assert.equal(list.status,200);assert.equal(list.cache,'no-store, private');assert.deepEqual(list.data.prompts.map(row=>row.task),AI_PROMPT_TASKS);assert(list.data.prompts.every(row=>row.revision===0));assert.equal(provider.db.prepare('select count(*) n from ai_prompts').get().n,0);
    for(const cookie of ['',m.cookie])assert.equal((await call(provider,'/admin/ai-prompts',{cookie})).status,cookie?403:401);
    const patch=(task,data,cookie=a.cookie,requestOrigin=origin,p=provider)=>call(p,'/admin/ai-prompts/'+task,{method:'PATCH',data,cookie,requestOrigin});
    assert.equal((await patch('upload',{prompt:'Denied write',expectedRevision:0},m.cookie)).status,403);
    assert.equal((await patch('upload',{prompt:'Denied origin',expectedRevision:0},a.cookie,'https://other.invalid')).status,403);
    assert.equal((await patch('unknown',{prompt:'Invalid task',expectedRevision:0})).status,400);
    assert.equal((await patch('upload',{prompt:'x'.repeat(4001),expectedRevision:0})).status,400);
    assert.equal((await patch('upload',{prompt:'x'.repeat(21000),expectedRevision:0})).status,413);
    const large=await patch('teaching',{prompt:'𠮷'.repeat(4000),expectedRevision:0});assert.equal(large.status,200,'4000 four-byte characters fit the 20 KiB request limit');assert.equal(large.data.prompt.revision,1);
    const normal=await patch('prompt',{prompt:'First\r\n\tSecond',expectedRevision:0});assert.equal(normal.data.prompt.prompt,'First\n\tSecond');
    second=new LocalProvider(path);
    const concurrent=await Promise.all([patch('upload',{prompt:'PRIVATE_PROMPT_BODY_A',expectedRevision:0}),patch('upload',{prompt:'PRIVATE_PROMPT_BODY_B',expectedRevision:0},b.cookie,origin,second)]);
    assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,409]);assert.equal(provider.getAiPrompt('upload').revision,1);
    const auditCount=provider.db.prepare("select count(*) n from audit where action='ai_prompt.updated'").get().n;
    assert.equal((await patch('upload',{prompt:null,expectedRevision:0})).data.error.code,'AI_PROMPT_CONFLICT');assert.equal(provider.db.prepare("select count(*) n from audit where action='ai_prompt.updated'").get().n,auditCount);
    const reset=await patch('upload',{prompt:null,expectedRevision:1});assert.equal(reset.status,200);assert.equal(reset.data.prompt.revision,2);assert.equal(reset.data.prompt.isDefault,true);assert.equal(reset.data.prompt.updatedBy.id,admin.id);
    assert.equal(provider.db.prepare("select prompt from ai_prompts where task='upload'").get().prompt,null,'Reset stores a null row rather than deleting the revision');
    assert.equal((await patch('upload',{prompt:'Stale after reset',expectedRevision:0})).status,409);
    second.close();second=null;provider.close();provider=new LocalProvider(path);
    assert.equal(provider.getAiPrompt('upload').revision,2);assert.equal(provider.getAiPrompt('upload').prompt,DEFAULT_AI_PROMPTS.upload);
    assert.equal(provider.getAiPrompt('teaching').prompt,'𠮷'.repeat(4000));
    const events=(await provider.listAudit(admin)).events.filter(event=>event.action==='ai_prompt.updated');
    for(const event of events)assert.deepEqual(Object.keys(event.details).sort(),['reset','revision','task']);assert.doesNotMatch(JSON.stringify(events),/PRIVATE_PROMPT_BODY|First|𠮷/);
    await provider.resetPassword(admin,editor.id,'87654321');await assert.rejects(provider.updateAiPrompt(editor,'upload',{prompt:'Reset editor denied',expectedRevision:2}),error=>error.code==='PASSWORD_CHANGE_REQUIRED');
    await provider.updateUser(admin,editor.id,{status:'disabled'});await assert.rejects(provider.listAiPrompts(editor),error=>error.status===403);
    assert.equal((await call(provider,'/auth/session',{cookie:m.cookie})).data.user.id,member.id,'Prompt edits never revoke unrelated user sessions');
  }finally{second?.close();provider.close();await rm(folder,{recursive:true,force:true});}
});

test('missing or corrupt local configuration storage fails closed instead of silently using defaults',async()=>{
  const provider=new LocalProvider(':memory:');
  try{
    const admin=await provider.bootstrap({username:'prompt_storage',password:'12345678'});
    await provider.updateAiPrompt(admin,'prompt',{prompt:'Valid saved instruction',expectedRevision:0});
    provider.db.prepare("update ai_prompts set prompt='' where task='prompt'").run();
    assert.throws(()=>provider.getAiPrompt('prompt'),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
    provider.db.exec('drop table ai_prompts');
    assert.throws(()=>provider.getAiPrompt('upload'),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
    await assert.rejects(provider.listAiPrompts(admin),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
    await assert.rejects(provider.updateAiPrompt(admin,'upload',{prompt:'Do not silently recover',expectedRevision:0}),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
  }finally{provider.close();}
});

test('Supabase configuration reads, lists, CAS and reset use service RPCs; failures and cancellation cannot fall back',async()=>{
  const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'},calls=[],rows=new Map();
  let broken=false,malformed=false,observedSignal;
  const provider=createSupabaseProvider(env,{fetch:async(url,options)=>{
    const path=new URL(url).pathname,body=JSON.parse(options.body);calls.push({path,body});assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);
    if(broken)return Response.json({message:'private database detail'},{status:500});
    if(path.endsWith('/tashan_get_ai_prompt'))return Response.json(malformed?{}:rows.get(body.p_task)||null);
    if(path.endsWith('/tashan_list_ai_prompts'))return Response.json({prompts:[...rows.values()]});
    if(path.endsWith('/tashan_update_ai_prompt')){const current=rows.get(body.p_task);if((current?.revision||0)!==body.p_expected_revision)return Response.json({message:'E_AI_PROMPT_CONFLICT'},{status:400});const next=raw(body.p_task,body.p_expected_revision+1,body.p_prompt);rows.set(next.task,next);return Response.json(next);}
    throw new Error('Unexpected synthetic prompt RPC');
  }});
  assert.equal((await provider.getAiPrompt('upload')).revision,0);assert.equal((await provider.listAiPrompts({id:'fixture-admin'})).prompts.length,3);
  assert.equal((await provider.updateAiPrompt({id:'fixture-admin'},'upload',{prompt:' New instruction ',expectedRevision:0})).prompt,'New instruction');
  await assert.rejects(provider.updateAiPrompt({id:'fixture-admin'},'upload',{prompt:null,expectedRevision:0}),error=>error.code==='AI_PROMPT_CONFLICT');
  const reset=await provider.updateAiPrompt({id:'fixture-admin'},'upload',{prompt:null,expectedRevision:1});assert.equal(reset.revision,2);assert.equal(reset.isDefault,true);
  const before=calls.length;await assert.rejects(provider.updateAiPrompt({id:'fixture-admin'},'upload',{prompt:'',expectedRevision:2}),error=>error.code==='AI_PROMPT_INVALID');assert.equal(calls.length,before);
  malformed=true;await assert.rejects(provider.getAiPrompt('upload'),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');malformed=false;broken=true;
  await assert.rejects(provider.getAiPrompt('upload'),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE'&&!error.message.includes('private database'));
  const pendingProvider=createSupabaseProvider(env,{fetch:async(url,options)=>new Promise((resolve,reject)=>{observedSignal=options.signal;options.signal.addEventListener('abort',()=>reject(new Error('Aborted synthetic request')),{once:true});})});
  const controller=new AbortController(),pending=pendingProvider.getAiPrompt('upload',{signal:controller.signal});controller.abort();await assert.rejects(pending,error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');assert.equal(observedSignal.aborted,true);
});

test('Supabase prompt RPCs require HTTP 200 JSON while unrelated Auth logout still accepts 204',async()=>{
  const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture'};
  const operations=[
    provider=>provider.getAiPrompt('teaching'),
    provider=>provider.listAiPrompts({id:'fixture-admin'}),
    provider=>provider.updateAiPrompt({id:'fixture-admin'},'teaching',{prompt:null,expectedRevision:0})
  ];
  for(const status of [201,202,204,205,206,304,500]){
    const provider=createSupabaseProvider(env,{fetch:async()=>new Response([204,205,304].includes(status)?null:'null',{status})});
    for(const operation of operations)await assert.rejects(operation(provider),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE',`HTTP ${status} is not evidence that no configuration exists`);
  }
  const malformed=createSupabaseProvider(env,{fetch:async()=>new Response('<html>not JSON</html>',{status:200})});
  for(const operation of operations)await assert.rejects(operation(malformed),error=>error.code==='AI_PROMPT_STORAGE_UNAVAILABLE');
  const absent=createSupabaseProvider(env,{fetch:async()=>Response.json(null)});
  assert.equal((await absent.getAiPrompt('teaching')).revision,0);
  const paths=[],logout=createSupabaseProvider(env,{fetch:async url=>{
    const path=new URL(url).pathname;paths.push(path);
    return path==='/auth/v1/user'?Response.json({id:'fixture-member'}):new Response(null,{status:204});
  }});
  await logout.logout('fixture-access','');
  assert.deepEqual(paths,['/auth/v1/user','/auth/v1/logout']);
});

test('API resolves prompt before generation quotas and does not accept client-supplied internal config',async()=>{
  const counters=[];let assisted=false,preparedSignal;
  const cookie='tashan_access=synthetic-prompt-config-session';
  const provider={status:()=>({configured:true,mode:'local'}),authenticate:()=>({user:{id:'fixture-member',role:'member',status:'active',mustChangePassword:false}}),rateLimit:(key)=>counters.push(key)};
  const data={task:'teaching',locale:'zh-CN',context:{core:'An isolated teaching fixture with enough text'}};
  const failure=await call(provider,'/ai/assist',{method:'POST',data,cookie,context:{aiProvider:{status:()=>({configured:true}),prepare:async(task,{signal})=>{preparedSignal=signal;throw promptStorageError();},assist:()=>{assisted=true;}}}});
  assert.equal(failure.status,503);assert.equal(failure.data.error.code,'AI_PROMPT_STORAGE_UNAVAILABLE');assert.equal(assisted,false);assert(preparedSignal instanceof AbortSignal);assert.equal(counters.filter(key=>key.startsWith('ai:')).length,0);
  const config=resolvePromptConfig('teaching');
  const success=await call(provider,'/ai/assist',{method:'POST',data,cookie,context:{aiProvider:{status:()=>({configured:true}),prepare:async()=>config,assist:async(input,options)=>{assert.equal(options.promptConfig,config);return {task:input.task,result:{fields:{}},promptRevision:0};}}}});
  assert.equal(success.status,200);assert.equal(counters.filter(key=>key.startsWith('ai:')).length,3);assert.equal(JSON.stringify(success.data).includes(DEFAULT_AI_PROMPTS.teaching),false);
  assert.equal((await call(provider,'/ai/assist',{method:'POST',data:{...data,promptConfig:config},cookie})).status,400);
});

test('007 PostgreSQL config migration protects defaults, CAS revisions, permissions and minimal audits',{skip:!process.env.PGLITE_MODULE},async()=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();let sequence=1;
  const uuid=()=>`70000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;
  const rpc=async(name,args,casts)=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+'::'+casts[i]).join(',')+') result',args)).rows[0].result;
  const change=(actor,task,prompt,revision)=>rpc('tashan_update_ai_prompt',[actor,task,prompt,revision],['uuid','text','text','bigint']);
  const register=async(actor,name,role='member',bootstrap=false)=>{const id=uuid();await db.query('insert into auth.users(id) values($1)',[id]);return rpc('tashan_register_account',[actor,id,name,name,role,bootstrap],['uuid','uuid','text','text','text','boolean']);};
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);');
    for(const file of ['202609100001_accounts.sql','202609100002_projects.sql','202609100003_attachment_limit.sql','202609100004_account_onboarding.sql','202609110005_stream_uploads.sql','202609110006_account_affiliation.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const admin=await register(null,'prompt_admin','admin',true),editor=await register(admin.id,'prompt_editor','admin'),member=await register(admin.id,'prompt_member');
    const oldRows=(await db.query('select to_jsonb(a) row from public.tashan_accounts a order by id')).rows;
    const functions=()=>db.query("select oid,proacl,proconfig,prosecdef,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace order by oid").then(result=>result.rows);
    const tables=()=>db.query("select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in('r','S') order by oid").then(result=>result.rows);
    const oldFunctions=await functions(),oldTables=await tables();
    await db.exec(await readFile(new URL('../supabase/migrations/202609110007_ai_prompts.sql',import.meta.url),'utf8'));
    assert.deepEqual((await functions()).filter(row=>oldFunctions.some(old=>old.oid===row.oid)),oldFunctions);assert.deepEqual((await tables()).filter(row=>oldTables.some(old=>old.oid===row.oid)),oldTables);assert.deepEqual((await db.query('select to_jsonb(a) row from public.tashan_accounts a order by id')).rows,oldRows);
    assert.equal((await db.query('select count(*)::int n from public.tashan_ai_prompts')).rows[0].n,0);
    assert.equal(await rpc('tashan_get_ai_prompt',['upload'],['text']),null);assert.deepEqual(await rpc('tashan_list_ai_prompts',[admin.id],['uuid']),{prompts:[]});
    const concurrent=await Promise.allSettled([change(admin.id,'upload','PRIVATE_PROMPT_A',0),change(editor.id,'upload','PRIVATE_PROMPT_B',0)]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);assert.match(concurrent.find(result=>result.status==='rejected').reason.message,/E_AI_PROMPT_CONFLICT/);
    const reset=await change(admin.id,'upload',null,1);assert.equal(reset.prompt,null);assert.equal(reset.revision,2);assert.equal(reset.updatedBy.id,admin.id);
    await assert.rejects(change(admin.id,'upload','Stale',0),/E_AI_PROMPT_CONFLICT/);await assert.rejects(change(editor.id,'upload',null,1),/E_AI_PROMPT_CONFLICT/);
    const large=await change(editor.id,'teaching','𠮷'.repeat(4000),0);assert.equal(Array.from(large.prompt).length,4000);
    const normalized=await change(admin.id,'prompt','\u3000Line\r\n\tNext\rFinal\u00a0',0);assert.equal(normalized.prompt,'Line\n\tNext\nFinal');
    const rowsBefore=(await db.query('select * from public.tashan_ai_prompts order by task')).rows;
    const audits=()=>db.query("select details from public.tashan_account_audit where action='ai_prompt.updated' order by id").then(result=>result.rows);
    const auditBefore=await audits();
    for(const [task,prompt,revision]of [['bad','x',0],['upload','',2],['upload',' \t\n',2],['upload','𠮷'.repeat(4001),2],['upload','Text\u0085',2],['upload','Text\v',2],['upload','x',-1],['upload','x',9007199254740991]])await assert.rejects(change(admin.id,task,prompt,revision),/E_AI_PROMPT_INVALID/);
    assert.deepEqual((await db.query('select * from public.tashan_ai_prompts order by task')).rows,rowsBefore);assert.deepEqual(await audits(),auditBefore);
    for(const event of auditBefore)assert.deepEqual(Object.keys(event.details).sort(),['reset','revision','task']);assert.doesNotMatch(JSON.stringify(auditBefore),/PRIVATE_PROMPT|𠮷|Line/);
    await assert.rejects(change(member.id,'upload','Not admin',2),/E_FORBIDDEN/);await assert.rejects(rpc('tashan_list_ai_prompts',[member.id],['uuid']),/E_FORBIDDEN/);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(db.query('select * from public.tashan_ai_prompts'),/permission denied/);await assert.rejects(rpc('tashan_get_ai_prompt',['upload'],['text']),/permission denied/);await assert.rejects(rpc('tashan_list_ai_prompts',[admin.id],['uuid']),/permission denied/);await assert.rejects(change(admin.id,'upload','Not service role',2),/permission denied/);await db.exec('reset role');
    }
    await db.exec('set role service_role');assert.equal((await rpc('tashan_get_ai_prompt',['upload'],['text'])).revision,2);assert.equal((await change(editor.id,'upload','Allowed service request',2)).revision,3);await db.exec('reset role');
    await rpc('tashan_begin_password_change',[admin.id,editor.id,true],['uuid','uuid','boolean']);await assert.rejects(change(editor.id,'upload','Locked editor',3),/E_FORBIDDEN/);
  }finally{await db.close();}
});
