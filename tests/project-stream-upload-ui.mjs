import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';

// Exercise the real controller through its mounted click handler. The fixture replaces
// transport and browser storage only; it never contacts a server or uses an account.
const source=readFileSync(new URL('../assets/js/project-lifecycle.js',import.meta.url),'utf8');
const id='local-711f38a7-9279-4af1-85e0-5cfe72757811',vid='version-9186d269-7b90-4505-8dd0-f2f56e2ad165';
const fingerprint='ab'.repeat(32),MiB=1048576;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,1));
async function until(check){for(let i=0;i<1000;i++){if(check())return;await tick();}throw new Error('Fixture did not settle');}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const caps=overrides=>({configured:true,mode:'supabase',canUpload:true,canPublish:true,uploadTransport:'r2-stream-v1',uploadPolicy:{mode:'worker'},limits:{attachmentBytes:10*MiB,coverBytes:5*MiB,metadataBytes:65536,requestBytes:98304},...overrides});

async function fixture({capability=caps(),core='观察不同星球上的自由落体。',attachment='<h1>课堂重力实验</h1>',cover='small image fixture',attachmentType='text/html',coverType='image/png',filename='课堂.html',locale='zh-CN',respond,digest,reloadLocal,confirm=async()=>true,respondRead}={}){
  const calls=[],handlers={},timers=new Map(),counts={encoded:0,reads:0,hashes:0,reload:0,sessionRefresh:0};let timerId=0;
  class TrackedBlob extends Blob{async arrayBuffer(){counts.reads++;return super.arrayBuffer();}}
  const file=(name,type,contents)=>({name,type,blob:new TrackedBlob([typeof contents==='number'?new Uint8Array(contents):contents],{type})});
  const snapshot={id,projectCode:'TS-L-711F38A792794AF1',currentVersionId:vid,title:'重力实验',kind:'visual',core,sourceReferences:[{projectId:'earth',versionId:'catalog-'+'1'.repeat(32)}],...(attachment===null?{}:{attachment:file(filename,attachmentType,attachment)}),...(cover===null?{}:{coverFile:file('cover.png',coverType,cover)})};
  const version={id:vid,number:2,createdAt:'2026-09-11T12:00:00.000Z',note:'课堂试验',snapshot},record={...snapshot};
  const account={initialized:true,user:{id:'fixture-owner',status:'active',mustChangePassword:false},refreshSession:async()=>{counts.sessionRefresh++;}};
  const location={hash:'#project/'+id};
  const store={get:async()=>record,getVersion:async()=>version,listVersions:async()=>[version],saveVersion:async()=>{},getDraft:async()=>null,encodeRecord:async value=>{
    counts.encoded++;const result={...value};for(const field of ['attachment','coverFile'])if(value[field])result[field]={name:value[field].name,type:value[field].type,base64:Buffer.from(await value[field].blob.arrayBuffer()).toString('base64')};return result;
  }};
  const window={PracticeStore:store,TashanAccounts:account};
  const context=vm.createContext({window,document:{documentElement:{lang:locale}},location,Blob,TextEncoder,AbortController,Uint8Array,
    crypto:{subtle:{digest:async(...args)=>{counts.hashes++;return digest?digest(...args):webcrypto.subtle.digest(...args);}}},
    setTimeout:(fn,ms)=>{const next=++timerId;timers.set(next,{fn,ms});return next;},clearTimeout:key=>timers.delete(key),queueMicrotask:()=>{},
    fetch:async(path,options)=>{
      const call={path,options,json:typeof options.body==='string'?JSON.parse(options.body):null};calls.push(call);
      if(options.method==='GET')return await respondRead?.(call)??response(path.endsWith('/capabilities')?capability:path==='/api/v1/projects/'+id?{project:{id,latestVersionId:vid,publishedVersionId:null}}:{projects:[],total:0});
      const result=respond?await respond(call):null;
      return result??response(path.endsWith('/uploads')?{ready:false,fingerprint}:{project:{id}},201);
    }
  });
  vm.runInContext(source,context);const api=window.TashanProjects;
  api.init({confirm,record:()=>record,render:()=>{},reloadLocal:async()=>{counts.reload++;await reloadLocal?.();}});
  api.mount({addEventListener:(type,fn)=>{handlers[type]=fn;},querySelectorAll:()=>[],querySelector:()=>null});
  await api.refresh();
  return {api,calls,counts,account,location,record,version,timers,context,mutations:()=>calls.filter(call=>call.options.method!=='GET'),
    start(){handlers.click({target:{closest:()=>({dataset:{projectAction:'upload',id}})},preventDefault(){},stopImmediatePropagation(){}});},
    async settle(){await until(()=>!api.busy);await tick();},async upload(){this.start();await this.settle();},
    switchAccount(reset=true){account.user={...account.user,id:'different-owner'};if(reset)api.reset();}
  };
}

test('stream upload hashes original files and performs prepare, raw PUTs, then commit',async()=>{
  const f=await fixture();await f.upload();const calls=f.mutations();
  assert.deepEqual(calls.map(call=>[call.options.method,call.path]),[
    ['POST',`/api/v1/projects/${id}/uploads`],['PUT',`/api/v1/projects/${id}/versions/${vid}/files/attachment`],
    ['PUT',`/api/v1/projects/${id}/versions/${vid}/files/coverFile`],['POST',`/api/v1/projects/${id}/versions/${vid}/commit`]
  ]);
  assert.equal(f.counts.encoded,0);assert.equal(f.counts.hashes,2);
  const manifest=calls[0].json;assert.equal(manifest.projectCode,f.record.projectCode);assert.equal(manifest.version.id,vid);assert.equal(manifest.version.number,2);
  assert.deepEqual(manifest.version.sourceReferences,JSON.parse(JSON.stringify(f.record.sourceReferences)));
  assert.doesNotMatch(calls[0].options.body,/base64|"blob"/);
  for(const [offset,field] of [[1,'attachment'],[2,'coverFile']]){
    const original=f.version.snapshot[field],descriptor=manifest.files[field],sent=calls[offset];
    assert.deepEqual(Object.keys(descriptor).sort(),['name','sha256','size','type']);
    assert.equal(descriptor.sha256,createHash('sha256').update(Buffer.from(await original.blob.arrayBuffer())).digest('hex'));
    assert.equal(descriptor.size,original.blob.size);assert.equal(sent.options.body,original.blob);
    assert.equal(sent.options.headers['Content-Type'],original.type);assert.equal(sent.options.headers['X-Tashan-Fingerprint'],fingerprint);
  }
  for(const {options} of calls){assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.ok(options.signal);assert.equal(Object.keys(options.headers).some(key=>key.toLowerCase()==='content-length'),false);}
  assert.deepEqual(calls.at(-1).json,{fingerprint});assert.equal(f.counts.reload,1);assert.equal(f.location.hash,'cloud/'+id);assert.equal(f.timers.size,0);
});

test('an already prepared version skips files and still commits idempotently',async()=>{
  const f=await fixture({respond:call=>call.path.endsWith('/uploads')?response({ready:true,fingerprint}):null});await f.upload();
  assert.deepEqual(f.mutations().map(call=>call.path.split('/').at(-1)),['uploads','commit']);assert.equal(f.counts.encoded,0);
});

test('text-only versions and empty MIME types use the same stream protocol',async()=>{
  const text=await fixture({attachment:null,cover:null});await text.upload();assert.deepEqual(text.mutations().map(call=>call.options.method),['POST','POST']);assert.deepEqual(text.mutations()[0].json.files,{});assert.equal(text.counts.hashes,0);
  const binary=await fixture({attachmentType:'',cover:null});await binary.upload();assert.equal(binary.mutations()[0].json.files.attachment.type,'application/octet-stream');assert.equal(binary.mutations()[1].options.headers['Content-Type'],'application/octet-stream');
});

test('a failed file never commits and stops before any later file',async()=>{
  for(const failedField of ['attachment','coverFile']){
    const f=await fixture({respond:call=>call.path.endsWith('/files/'+failedField)?response({error:{message:'Storage did not accept this file'}},503):null});await f.upload();
    assert.equal(f.mutations().some(call=>call.path.endsWith('/commit')),false);assert.equal(f.mutations().at(-1).path.endsWith('/'+failedField),true);
    assert.equal(f.counts.reload,0);assert.equal(f.location.hash,'#project/'+id);assert.match(f.api.workspaceMarkup(),/Storage did not accept this file/);
  }
});

test('malformed prepare responses cannot be used as upload headers or committed',async()=>{
  for(const prepared of [{ready:false,fingerprint:'AB'.repeat(32)},{ready:false,fingerprint:'bad\r\nheader'},{ready:'yes',fingerprint},{ready:false}]){
    const f=await fixture({respond:()=>response(prepared)});await f.upload();assert.equal(f.mutations().length,1);assert.equal(f.counts.reload,0);assert.match(f.api.workspaceMarkup(),/上传响应无效/);
  }
});

test('account changes during prepare stop every subsequent upload without requiring reset',async()=>{
  const held=deferred(),f=await fixture({respond:call=>call.path.endsWith('/uploads')?held.promise:null});f.start();await until(()=>f.mutations().length===1);
  f.switchAccount(false);held.resolve(response({ready:false,fingerprint}));await f.settle();
  assert.equal(f.mutations().length,1);assert.equal(f.counts.reload,0);assert.equal(f.location.hash,'#project/'+id);assert.doesNotMatch(f.api.workspaceMarkup(),/项目已上传|Session changed/);
});

test('reset aborts an in-flight Blob PUT; an ignored abort still cannot commit or navigate',async()=>{
  const held=deferred(),f=await fixture({respond:call=>call.options.method==='PUT'?held.promise:null});f.start();await until(()=>f.mutations().length===2);
  const signal=f.mutations()[1].options.signal;f.switchAccount();assert.equal(signal.aborted,true);
  held.resolve(response({ok:true}));await tick();await tick();
  assert.equal(f.mutations().length,2);assert.equal(f.counts.reload,0);assert.equal(f.location.hash,'#project/'+id);assert.equal(f.timers.size,0);
});

test('account change during hashing does not prepare a stale version',async()=>{
  const held=deferred(),f=await fixture({digest:()=>held.promise});f.start();await until(()=>f.counts.hashes===1);f.switchAccount(false);
  held.resolve(new Uint8Array(32).buffer);await f.settle();assert.equal(f.mutations().length,0);assert.equal(f.counts.hashes,1);assert.equal(f.counts.reload,0);
});

test('changing account after commit while local reload is pending prevents navigation and refresh',async()=>{
  const held=deferred(),f=await fixture({reloadLocal:()=>held.promise});f.start();await until(()=>f.counts.reload===1);const reads=f.calls.filter(call=>call.options.method==='GET').length;
  f.switchAccount(false);held.resolve();await f.settle();assert.equal(f.calls.filter(call=>call.options.method==='GET').length,reads);assert.equal(f.location.hash,'#project/'+id);assert.doesNotMatch(f.api.workspaceMarkup(),/项目已上传/);
});

test('stream file and UTF-8 metadata limits reject before hashing, encoding or preparing',async()=>{
  const cases=[
    {options:{attachment:10*MiB+1},label:'附件'},
    {options:{cover:5*MiB+1},label:'封面'},
    {options:{core:'课'.repeat(23000)},label:'文字资料'},
    {options:{capability:caps({limits:{attachmentBytes:32,coverBytes:32,metadataBytes:65536,requestBytes:98304}}),attachment:33},label:'附件'},
    {options:{capability:caps({limits:{attachmentBytes:20*MiB,coverBytes:20*MiB,metadataBytes:2*MiB,requestBytes:2*MiB}}),core:'x'.repeat(MiB)},label:'文字资料'},
    {options:{capability:caps({limits:{attachmentBytes:20*MiB,coverBytes:20*MiB,metadataBytes:2*MiB,requestBytes:2*MiB}}),attachment:10*MiB+1},label:'附件'}
  ];
  for(const {options,label} of cases){const f=await fixture(options);await f.upload();assert.equal(f.counts.reads,0,label);assert.equal(f.counts.hashes,0,label);assert.equal(f.counts.encoded,0,label);assert.equal(f.mutations().length,0,label);assert.match(f.api.workspaceMarkup(),new RegExp(label+'.*超过当前上传限制'));}
});

test('stream checks the UTF-8 manifest boundary without counting the raw file body',async()=>{
  const good=await fixture({attachment:128*1024,cover:null});await good.upload();assert.equal(good.mutations().length,3);
  const manifestBytes=Buffer.byteLength(good.mutations()[0].options.body);assert.ok(manifestBytes<98304);
  const settings={...caps().limits,requestBytes:manifestBytes};
  const exact=await fixture({capability:caps({limits:settings}),attachment:128*1024,cover:null});await exact.upload();assert.equal(exact.mutations().length,3);
  const small=await fixture({capability:caps({limits:{...settings,requestBytes:manifestBytes-1}}),attachment:128*1024,cover:null});await small.upload();
  assert.equal(small.counts.reads,0);assert.equal(small.mutations().length,0);assert.match(small.api.workspaceMarkup(),/提交资料.*超过当前上传限制/);
});

test('stream limits copy is translated and omits the Base64 aggregate',async()=>{
  for(const [locale,expected,absent] of [['zh-CN','文件逐个上传','含编码'],['zh-Hant','檔案逐一上傳','含編碼'],['en','Files upload separately','including encoding']]){
    const f=await fixture({locale});const html=f.api.workspaceMarkup();assert.ok(html.includes(expected));assert.ok(!html.includes(absent));assert.match(html,/10 MiB.*5 MiB.*64 KiB/);
  }
});

test('request timeout aborts a pending file and a late response never commits',async()=>{
  const held=deferred(),f=await fixture({respond:call=>call.options.method==='PUT'?held.promise:null});f.start();await until(()=>f.mutations().length===2);
  const timer=[...f.timers.values()].find(value=>value.ms===120000);assert.ok(timer);timer.fn();assert.equal(f.mutations()[1].options.signal.aborted,true);
  held.resolve(response({ok:true}));await f.settle();assert.equal(f.mutations().length,2);assert.match(f.api.workspaceMarkup(),/请求超时/);assert.equal(f.counts.reload,0);
});

test('a real fetch-style AbortError is translated and repeated clicks do not prepare twice',async()=>{
  const f=await fixture({locale:'en',respond:call=>call.path.endsWith('/uploads')?new Promise((_,reject)=>call.options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('The operation was aborted'),{name:'AbortError'})),{once:true})):null});
  f.start();await until(()=>f.mutations().length===1);f.start();assert.equal(f.mutations().length,1);
  [...f.timers.values()].find(value=>value.ms===120000).fn();await f.settle();assert.equal(f.mutations().length,1);assert.match(f.api.workspaceMarkup(),/The request timed out/);assert.equal(f.counts.reload,0);assert.equal(f.timers.size,0);
});

test('a prepare network failure remains reviewable and sends no files or commit',async()=>{
  const f=await fixture({respond:()=>{throw new Error('Network unavailable <retry>');}});await f.upload();assert.equal(f.mutations().length,1);
  assert.match(f.api.workspaceMarkup(),/Network unavailable &lt;retry&gt;/);assert.equal(f.counts.reload,0);assert.equal(f.location.hash,'#project/'+id);
});

test('an expired session stops upload and asks the account controller to refresh',async()=>{
  const f=await fixture({respond:call=>call.options.method==='PUT'?response({error:{message:'Sign in again'}},401):null});await f.upload();
  assert.equal(f.counts.sessionRefresh,1);assert.equal(f.mutations().some(call=>call.path.endsWith('/commit')),false);assert.equal(f.counts.reload,0);
});

test('legacy local capabilities still encode once and send one JSON version request',async()=>{
  const f=await fixture({capability:caps({mode:'local',uploadTransport:undefined,uploadPolicy:{mode:'local'},limits:{attachmentBytes:10*MiB,coverBytes:5*MiB,metadataBytes:MiB,requestBytes:36*MiB}})});await f.upload();
  const calls=f.mutations();assert.equal(calls.length,1);assert.equal(calls[0].path,`/api/v1/projects/${id}/versions`);assert.equal(calls[0].options.method,'POST');
  assert.equal(f.counts.encoded,1);assert.equal(f.counts.hashes,0);assert.equal(Buffer.from(calls[0].json.files.attachment.base64,'base64').toString(),'<h1>课堂重力实验</h1>');
  assert.equal(calls[0].json.files.attachment.sha256,undefined);assert.equal(f.location.hash,'cloud/'+id);
});


test('combined sharing uploads and commits before publishing the saved version',async()=>{
  const previous='version-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const f=await fixture({respondRead:call=>call.path==='/api/v1/projects/'+id?response({project:{id,publishedVersionId:previous}}):null});
  await f.api.share(id);
  assert.deepEqual(f.mutations().map(call=>call.path.split('/').at(-1)),['uploads','attachment','coverFile','commit','publish']);
  assert.deepEqual(f.mutations().at(-1).json,{versionId:vid,expectedVersionId:previous});
  assert.match(f.api.workspaceMarkup(),/其他成员和游客均可查看/);
});

test('cancelling sharing and changing account during confirmation do not upload',async()=>{
  const cancelled=await fixture({confirm:async()=>false});await cancelled.api.share(id);assert.equal(cancelled.mutations().length,0);
  const decision=deferred(),f=await fixture({confirm:()=>decision.promise});const sharing=f.api.share(id);
  f.switchAccount();decision.resolve(true);await sharing;assert.equal(f.mutations().length,0);
});

test('combined sharing never publishes incomplete uploads and reports recoverable failures',async()=>{
  const upload=await fixture({respond:call=>call.options.method==='PUT'?response({error:{message:'Upload failed'}},503):null});
  await upload.api.share(id);assert.equal(upload.mutations().some(call=>call.path.endsWith('/publish')),false);assert.match(upload.api.workspaceMarkup(),/本地副本已保留/);
  const publish=await fixture({respond:call=>call.path.endsWith('/publish')?response({error:{message:'Publish failed'}},503):null});
  await publish.api.share(id);assert.equal(publish.counts.reload,1);assert.equal(publish.record.currentVersionId,vid);assert.match(publish.api.workspaceMarkup(),/项目已上传，但公开未完成/);assert.equal(publish.location.hash,'cloud/'+id);
});

test('already public current version is not published twice',async()=>{
  const f=await fixture({respondRead:call=>call.path==='/api/v1/projects/'+id?response({project:{id,publishedVersionId:vid}}):null});
  await f.api.share(id);assert.equal(f.mutations().filter(call=>call.path.endsWith('/publish')).length,0);
});
