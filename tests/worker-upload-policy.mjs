import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../server/worker.mjs';
import { handleApi } from '../server/api.mjs';
import { handleProjectRequest, workerUploadPolicy, PROJECT_LIMITS } from '../server/projects-api.mjs';

const origin = 'https://tashan.example.test';
const id = 'local-01234567-89ab-4cde-8fab-0123456789ab';
const user = { id:'01234567-89ab-4cde-8fab-0123456789ab', username:'fixture', status:'active', role:'member', mustChangePassword:false };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=';
const variable = { requestBytes:'TASHAN_UPLOAD_REQUEST_BYTES', attachmentBytes:'TASHAN_UPLOAD_ATTACHMENT_BYTES', coverBytes:'TASHAN_UPLOAD_COVER_BYTES', metadataBytes:'TASHAN_UPLOAD_METADATA_BYTES' };
// These small numbers exercise boundaries; they are NOT recommended deployment limits.
const testLimits = { requestBytes:4096, attachmentBytes:256, coverBytes:256, metadataBytes:2048 };
const policy = overrides => workerUploadPolicy(Object.fromEntries(Object.entries({...testLimits,...overrides}).map(([key,value])=>[variable[key],String(value)])));
function input() {
  return { projectCode:'TS-L-0123456789AB4CDE', version:{id:'version-test-1',number:1,createdAt:'2026-09-10T08:00:00.000Z',note:'初版',sourceReferences:[]}, metadata:{id,title:'中文课堂 🌱',kind:'visual',core:'课堂探索'}, files:{attachment:{name:'课堂.html',type:'text/html',base64:Buffer.from('<h1>课堂</h1>').toString('base64')},coverFile:{name:'封面.png',type:'image/png',base64:png}} };
}
function fixture(mode='supabase') {
  const calls = {save:0,publish:0,read:0};
  const existing = { project:{id,publishedVersionId:null}, version:{...input().version,metadata:input().metadata,files:{}} };
  const provider = {
    status:async()=>({configured:true,mode}), rateLimit:async()=>{},
    saveVersion:async(actor,snapshot)=>{ calls.save++;return {created:true,project:{id},version:snapshot}; },
    getVersion:async()=>{calls.read++;return existing;},
    listVersions:async()=>({project:existing.project,versions:[existing.version]}),
    listPublished:async()=>({projects:[],total:0}), listProjects:async()=>({projects:[],total:0}),
    publish:async()=>{calls.publish++;return {...existing.project,publishedVersionId:existing.version.id};},
  };
  return {provider,calls};
}
function request(path, body, headers={}) {
  return new Request(origin+'/api/v1'+path, {method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
const uploadRequest = (body=input(), headers) => request('/projects/'+id+'/versions',body,headers);
async function run(req, env, uploadPolicy) { const response=await handleProjectRequest(req,{user,provider:env.provider,uploadPolicy});return {response,status:response.status,data:await response.json()}; }
async function noDecode(work) {
  const original = globalThis.atob;let decoded=0;
  globalThis.atob=value=>{decoded++;return original(value);};
  try { await work();assert.equal(decoded,0,'Rejected uploads must not decode an attachment'); }
  finally { globalThis.atob=original; }
}

test('Worker requires all four explicit integer limits; no request mutates standard limits',()=>{
  assert.equal(workerUploadPolicy({}).enabled,false);
  assert.equal(workerUploadPolicy({}).reason,'UPLOAD_LIMITS_REQUIRED');
  const settings = Object.fromEntries(Object.entries(testLimits).map(([key,value])=>[variable[key],String(value)]));
  for(const key of Object.values(variable)){
    const missing={...settings};delete missing[key];assert.equal(workerUploadPolicy(missing).enabled,false);
    for(const invalid of ['0','-1','1.5','1e3','NaN','999999999999999999999'])assert.equal(workerUploadPolicy({...settings,[key]:invalid}).enabled,false);
  }
  for(const [field,key] of Object.entries(variable))assert.equal(workerUploadPolicy({...settings,[key]:String(PROJECT_LIMITS[field]+1)}).enabled,false);
  const ready=policy();assert.equal(ready.enabled,true);assert.equal(ready.mode,'worker');
  for(const [key,value] of Object.entries(testLimits))assert.equal(ready.limits[key],value);
  assert.equal(ready.limits.ownerBytes,200*1024*1024);
  assert.equal(PROJECT_LIMITS.requestBytes,36*1024*1024);
  assert(Object.isFrozen(ready.limits));
});

test('Worker capability reflects its policy without network; Node and Node cloud keep original limits',async()=>{
  const original=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw new Error('No real network allowed');};
  try {
    const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture_only'};
    const closed=await (await worker.fetch(request('/projects/capabilities'),env)).json();
    assert.equal(closed.configured,true);assert.equal(closed.canUpload,false);assert.equal(closed.canPublish,true);
    assert.equal(closed.limits.requestBytes,0);
    const settings=Object.fromEntries(Object.entries(testLimits).map(([key,value])=>[variable[key],String(value)]));
    const opened=await (await worker.fetch(request('/projects/capabilities'),{...env,...settings})).json();
    assert.equal(opened.canUpload,true);assert.equal(opened.limits.requestBytes,testLimits.requestBytes);
    assert.equal(network,0);
    for(const mode of ['local','supabase']){
      const response=await run(request('/projects/capabilities'),fixture(mode));
      assert.equal(response.data.canUpload,true);assert.equal(response.data.uploadPolicy.mode,'standard');
      assert.deepEqual(response.data.limits,PROJECT_LIMITS);
    }
  } finally {globalThis.fetch=original;}
});

test('paused uploads do not consume the body; saved versions remain readable and publishable',async()=>{
  const env=fixture(),closed=workerUploadPolicy({}),req=uploadRequest('not JSON');
  await noDecode(async()=>{
    const result=await run(req,env,closed);assert.equal(result.status,503);assert.equal(result.data.error.code,'UPLOADS_PAUSED');
    assert.equal(req.bodyUsed,false);assert.equal(env.calls.save,0);
  });
  assert.equal((await run(request('/projects/'+id+'/versions/version-test-1'),env,closed)).status,200);
  assert.equal((await run(request('/projects/'+id+'/publish',{versionId:'version-test-1',expectedVersionId:null}),env,closed)).status,200);
  assert.equal(env.calls.read,1);assert.equal(env.calls.publish,1);
});

test('account API forwards Worker policy while retaining authentication',async()=>{
  const env=fixture(),accounts={status:async()=>({configured:true}),authenticate:async()=>({user}),rateLimit:async()=>{}};
  const response=await handleApi(uploadRequest(input(),{Cookie:'tashan_access=fixture'}),accounts,{projectsProvider:env.provider,projectUploadPolicy:workerUploadPolicy({})});
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'UPLOADS_PAUSED');assert.equal(env.calls.save,0);
  const unauthenticated=await handleApi(uploadRequest(),accounts,{projectsProvider:env.provider,projectUploadPolicy:workerUploadPolicy({})});
  assert.equal(unauthenticated.status,401);
});

test('declared oversized request rejects before reading or decoding',async()=>{
  const env=fixture(),req=uploadRequest('not JSON',{'Content-Length':String(testLimits.requestBytes+1)});
  await noDecode(async()=>{const result=await run(req,env,policy());assert.equal(result.status,413);assert.equal(result.data.error.code,'BODY_TOO_LARGE');assert.equal(req.bodyUsed,false);assert.equal(env.calls.save,0);});
});

test('chunked UTF-8 request without Content-Length is cancelled at the byte limit before parsing',async()=>{
  const env=fixture();let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('教'.repeat(40)));},cancel(){cancelled=true;}});
  const req=new Request(origin+'/api/v1/projects/'+id+'/versions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body,duplex:'half'});
  await noDecode(async()=>{const result=await run(req,env,policy({requestBytes:100}));assert.equal(result.status,413);assert.equal(result.data.error.code,'BODY_TOO_LARGE');assert.equal(cancelled,true);assert.equal(env.calls.save,0);});
});

test('either oversized file and oversized UTF-8 metadata reject before any attachment decoding',async()=>{
  for(const [value,limits,code] of [
    [input(),{attachmentBytes:1},'FILE_TOO_LARGE'],
    [input(),{coverBytes:1},'FILE_TOO_LARGE'],
    [{...input(),files:{attachment:{name:'padding.txt',base64:Buffer.alloc(5).toString('base64')}}},{attachmentBytes:4},'FILE_TOO_LARGE'],
    [{...input(),metadata:{...input().metadata,core:'教'.repeat(500)}},{metadataBytes:600},'METADATA_TOO_LARGE']
  ]){
    const env=fixture();await noDecode(async()=>{const result=await run(uploadRequest(value),env,policy(limits));assert.equal(result.status,413,JSON.stringify(result.data));assert.equal(result.data.error.code,code);assert.equal(env.calls.save,0);});
  }
});

test('a payload at the exact UTF-8 request limit saves, one byte lower rejects',async()=>{
  const value=input(),bytes=Buffer.byteLength(JSON.stringify(value)),env=fixture();
  assert.equal((await run(uploadRequest(value),env,policy({requestBytes:bytes}))).status,201);
  assert.equal(env.calls.save,1);
  await noDecode(async()=>{assert.equal((await run(uploadRequest(value),env,policy({requestBytes:bytes-1}))).status,413);assert.equal(env.calls.save,1);});
});

async function frontend(capability, {attachmentBytes=12,core='课堂探索',filename='课堂🌱.html'}={}) {
  const handlers={},calls={encoded:0,posted:[]},body=input();
  const snapshot={...body.metadata,projectCode:body.projectCode,currentVersionId:body.version.id,sourceReferences:[],core,attachment:{name:filename,type:'text/html',blob:new Blob(['x'.repeat(attachmentBytes)],{type:'text/html'})}};
  const version={...body.version,snapshot},record={...snapshot};
  const store={get:async()=>record,getVersion:async()=>version,listVersions:async()=>[version],saveVersion:async()=>{},getDraft:async()=>null,encodeRecord:async value=>{
    calls.encoded++;return {...value,attachment:{name:value.attachment.name,type:value.attachment.type,base64:Buffer.from(await value.attachment.blob.arrayBuffer()).toString('base64')}};
  }};
  const window={PracticeStore:store,TashanAccounts:{initialized:true,user}};
  const context=vm.createContext({window,document:{documentElement:{lang:'zh-CN'}},location:{hash:'#project/'+id},Blob,TextEncoder,AbortController,setTimeout,clearTimeout,queueMicrotask:()=>{},fetch:async(url,options={})=>{
    if(options.method==='POST'){calls.posted.push(options.body);return new Response('{}',{status:201});}
    return new Response(JSON.stringify(url.endsWith('/capabilities')?capability:{projects:[],total:0}));
  }});
  vm.runInContext(await readFile(new URL('../assets/js/project-lifecycle.js',import.meta.url),'utf8'),context);
  const api=window.TashanProjects;api.init({record:()=>record,render:()=>{},reloadLocal:async()=>{}});
  api.mount({addEventListener:(name,handler)=>{handlers[name]=handler;},querySelectorAll:()=>[],querySelector:()=>null});
  await api.refresh();
  return {api,calls,record,version,async click(){
    const button={dataset:{projectAction:'upload',id}};
    handlers.click({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});
    for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(!api.busy)return;}
    throw new Error('UI upload did not settle');
  }};
}
const cap = overrides => ({configured:true,mode:'supabase',canUpload:true,canPublish:true,limits:{...PROJECT_LIMITS,...testLimits,...overrides},uploadPolicy:{mode:'worker',reason:null}});

test('UI blocks a paused policy and oversized Blob before encodeRecord or POST',async()=>{
  const paused=await frontend({...cap(),canUpload:false});
  assert.match(paused.api.detailMarkup({id}),/<button data-project-action="upload"[^>]*disabled/);
  assert.match(paused.api.workspaceMarkup(),/仍可保存到此浏览器或导出备份/);
  await paused.click();assert.equal(paused.calls.encoded,0);assert.equal(paused.calls.posted.length,0);
  const large=await frontend(cap({attachmentBytes:5}),{attachmentBytes:6});
  await large.click();assert.equal(large.calls.encoded,0);assert.equal(large.calls.posted.length,0);
  assert.match(large.api.workspaceMarkup(),/超过当前上传限制/);
});

test('UI checks UTF-8 metadata and whole Base64 envelope before encoding; exact envelope passes',async()=>{
  const unicode=await frontend(cap({metadataBytes:600}),{core:'教'.repeat(400)});
  await unicode.click();assert.equal(unicode.calls.encoded,0);assert.equal(unicode.calls.posted.length,0);
  assert.match(unicode.api.workspaceMarkup(),/文字资料/);
  const good=await frontend(cap());await good.click();assert.equal(good.calls.encoded,1);assert.equal(good.calls.posted.length,1);
  const bytes=Buffer.byteLength(good.calls.posted[0]);
  const exact=await frontend(cap({requestBytes:bytes}));await exact.click();assert.equal(exact.calls.posted.length,1);assert.equal(Buffer.byteLength(exact.calls.posted[0]),bytes);
  const short=await frontend(cap({requestBytes:bytes-1}));await short.click();assert.equal(short.calls.encoded,0);assert.equal(short.calls.posted.length,0);
  assert.match(short.api.workspaceMarkup(),/单次合计（含编码）/);
});
