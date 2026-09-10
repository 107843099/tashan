import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// The shipped controller, isolated HTTP responses and no browser/cloud state.
const source=await readFile(new URL('../assets/js/accounts.js',import.meta.url),'utf8');
const user={id:'startup-member',username:'startup_member',displayName:'Startup fixture',role:'member',status:'active',mustChangePassword:false};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const requests=[],changes=[],renders=[],motions=[];
 const location={hash:'#login'};
 const document={documentElement:{lang:'zh-CN'},visibilityState:'visible',querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 const window={addEventListener(){},scrollTo(){},TashanEntrance:{mountAuth(){motions.push('mount');},playAfterLogin(){motions.push('play');}}};
 const context=vm.createContext({window,document,location,AbortController,TextEncoder,setTimeout,clearTimeout,queueMicrotask,
  fetch(path,options){
   let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
   requests.push({path,options,reply(data,status=200){resolve({ok:status<400,status,json:async()=>structuredClone(data)});},fail(){reject(new TypeError('synthetic network failure'));}});
   return promise;
  },localStorage:{setItem(){assert.fail('Session prefetch must not persist personal data');}},sessionStorage:{setItem(){assert.fail('Session prefetch must not persist personal data');}}});
 vm.runInContext(source,context);
 const api=window.TashanAccounts;
 const hooks={onBeforeChange:async detail=>changes.push({kind:'before',reason:detail.reason}),onChange:async(value,detail)=>changes.push({kind:'identity',user:value,reason:detail.reason}),onRender:()=>renders.push(api.initialized)};
 return {api,requests,changes,renders,motions,location,hooks,init:()=>api.init(hooks)};
}

test('startup requests begin together before init; neither partial nor complete prefetch publishes an identity',async()=>{
 const f=fixture();
 assert.deepEqual(f.requests.map(r=>r.path),['/api/v1/status','/api/v1/auth/session']);
 assert.ok(f.requests.every(r=>r.options.method==='GET'&&r.options.credentials==='same-origin'&&r.options.cache==='no-store'));
 assert.equal(f.api.initialized,false);assert.equal(f.api.user,null);
 f.requests[1].reply({user});await tick();
 assert.equal(f.api.user,null);assert.equal(f.changes.length,0);assert.equal(f.motions.length,0);
 f.requests[0].reply({configured:true,mode:'supabase'});await tick();
 assert.equal(f.api.initialized,false);assert.equal(f.api.user,null);assert.equal(f.changes.length,0);assert.equal(f.renders.length,0);
 const ready=f.init();assert.equal(f.init(),ready,'Repeated init reuses the same initialization');await ready;
 assert.equal(f.api.user.id,user.id);assert.equal(f.api.configured,true);assert.equal(f.api.mode,'supabase');assert.equal(f.api.initialized,true);
 assert.deepEqual(f.changes.map(c=>c.kind),['before','identity']);assert.equal(f.changes[1].reason,'initial');
 assert.equal(f.requests.length,2,'Installing hooks consumes startup work without another request');
 assert.equal(f.motions.length,0,'Restoring an existing session never starts the stone scene');
 assert.equal(f.location.hash,'discover');
});

test('init waits for both verified responses before invoking installed workspace hooks',async()=>{
 const f=fixture(),ready=f.init();
 f.requests[0].reply({configured:true,mode:'local'});await tick();
 assert.equal(f.changes.length,0);assert.equal(f.api.initialized,false);assert.equal(f.api.user,null);
 f.requests[1].reply({user});await ready;
 assert.equal(f.changes.filter(c=>c.kind==='identity').length,1);assert.equal(f.api.user.id,user.id);
});

test('unconfigured service ignores a failed or still pending session prefetch safely',async()=>{
 for(const failureFirst of [true,false]){
  const f=fixture();if(failureFirst){f.requests[1].fail();await tick();}
  f.requests[0].reply({configured:false,mode:'unavailable'});
  await f.init();
  assert.equal(f.api.configured,false);assert.equal(f.api.user,null);assert.equal(f.api.initialized,true);
  assert.equal(f.changes.at(-1).user,null);assert.equal(f.requests.length,2);assert.equal(f.motions.length,0);
  if(!failureFirst){f.requests[1].fail();await tick();}
 }
});

test('either initial status failure or non-auth session failure remains an unavailable service',async()=>{
 for(const failStatus of [true,false]){
  const f=fixture();
  if(failStatus){f.requests[0].fail();f.requests[1].reply({user});}
  else{f.requests[0].reply({configured:true,mode:'supabase'});f.requests[1].fail();}
  await tick();assert.equal(f.changes.length,0);
  await f.init();assert.equal(f.api.configured,false);assert.equal(f.api.user,null);assert.equal(f.api.mode,'unavailable');
  assert.equal(f.changes.at(-1).user,null);assert.equal(f.motions.length,0);
 }
});

test('initial 401 becomes a signed-out session, and later refresh reads fresh status then fresh session',async()=>{
 const f=fixture();f.requests[0].reply({configured:true,mode:'supabase'});f.requests[1].reply({error:{code:'UNAUTHORIZED'}},401);await f.init();
 assert.equal(f.api.configured,true);assert.equal(f.api.user,null);assert.equal(f.motions.length,0);
 const refresh=f.api.refreshSession();
 assert.equal(f.requests.length,3,'Normal refresh still begins with its status request');
 assert.equal(f.requests[2].path,'/api/v1/status');
 f.requests[2].reply({configured:true,mode:'supabase'});await tick();
 assert.equal(f.requests.length,4);assert.equal(f.requests[3].path,'/api/v1/auth/session');
 f.requests[3].reply({user:{...user,id:'new-session-user'}});await refresh;
 assert.equal(f.api.user.id,'new-session-user');assert.equal(f.changes.at(-1).reason,'external');
 const latest=f.api.refreshSession();f.requests[4].reply({configured:true,mode:'supabase'});await tick();f.requests[5].reply({user:null});await latest;
 assert.equal(f.api.user,null,'A previous startup/refresh snapshot cannot keep a revoked identity signed in');
 assert.equal(f.requests.length,6);assert.equal(f.motions.length,0);
});
