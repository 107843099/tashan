import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Run the shipped account controller through its public API and delegated forms.
// The HTTP/session and stone-entry adapters are fixtures; no real account or browser
// state is accessed, and this test does not claim a browser layout acceptance check.
const source=readFileSync(new URL('../assets/js/accounts.js',import.meta.url),'utf8');
const member=(overrides={})=>({id:'ui-fixture-member',username:'classroom_member',displayName:'课堂教师',role:'member',status:'active',mustChangePassword:false,...overrides});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({loginUser=member(),initialUser=null,locale='zh-CN',hash='#login',entryGate,passwordFailure}={}){
 const handlers={},entryHandlers={},windowHandlers={},requests=[],transitions=[],scrolls=[],feedback=[],formData=[];
 let session=initialUser,entryCount=0,mountCount=0,html='',api;
 const routes=[];let currentHash=hash;
 const location={get hash(){return currentHash;},set hash(value){currentHash=value.startsWith('#')?value:'#'+value;routes.push(currentHash);}};
 const entry={addEventListener:(type,handler)=>{entryHandlers[type]=handler;}};
 const root={addEventListener:(type,handler)=>{handlers[type]=handler;},querySelector:selector=>selector==='[data-entry-account]'&&html.includes('data-entry-account')?entry:null};
 const document={documentElement:{lang:locale},visibilityState:'visible',activeElement:null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},createElement(){return {dataset:{},setAttribute(){},remove(){},textContent:''};}};
 class FixtureFormData{
  constructor(form){this.values=new Map(Object.values(form.elements).map(input=>[input.name,input.value]));formData.push(this);}
  get(name){return this.values.get(name)||null;}
  delete(name){this.values.delete(name);}
 }
 const fetch=async(path,options)=>{
  const body=options.body?JSON.parse(options.body):undefined;requests.push({path,method:options.method,body,credentials:options.credentials});
  let result;
  if(path==='/api/v1/status')result={configured:true,mode:'local'};
  else if(path==='/api/v1/auth/session')result={user:session};
  else if(path==='/api/v1/auth/login'){session={...loginUser};result={user:session};}
  else if(path==='/api/v1/auth/password'){
   if(passwordFailure)result={error:{code:passwordFailure},status:400};
   else {session={...session,mustChangePassword:false};result={user:session};}
  } else if(path==='/api/v1/private-fixture')result={error:{code:'PASSWORD_CHANGE_REQUIRED'},status:403};
  else throw new Error('Unexpected fixture route: '+path);
  return {ok:!result.error,status:result.status||200,json:async()=>result};
 };
 const window={addEventListener:(name,listener)=>{windowHandlers[name]=listener;},scrollTo:value=>scrolls.push(value),TashanEntrance:{mountAuth(){mountCount++;},dismissAuth(){},async playAfterLogin(){entryCount++;await entryGate?.promise;}},dispatchEvent(){}};
 const sandbox=vm.createContext({window,document,location,fetch,FormData:FixtureFormData,TextEncoder,AbortController,setTimeout,clearTimeout,queueMicrotask,CustomEvent:class{},localStorage:{setItem(){assert.fail('Credentials or account state must not be persisted by account UI');}},sessionStorage:{setItem(){assert.fail('Credentials or account state must not be persisted by account UI');}}});
 vm.runInContext(source,sandbox);api=window.TashanAccounts;
 const render=()=>{html=api.render(currentHash==='#account'?'account':'login');api.bind(root);};
 const initialized=api.init({onRender:render,onBeforeChange:async()=>{},onChange:async(user,context)=>{transitions.push({user,reason:context.reason});}});
 async function submit(kind,values){
  const elements=Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{name,value,attributes:{},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},focus(){document.activeElement=this;}}]));
  const button={disabled:false,before(node){feedback.push(node.textContent);}};
  const form={dataset:{accountForm:kind},elements,closest:()=>form,setAttribute(){},querySelector:selector=>selector==='[type="submit"]'?button:null,querySelectorAll:()=>Object.values(elements).filter(input=>input.attributes['aria-invalid'])};
  await handlers.submit({target:form,preventDefault(){},stopImmediatePropagation(){}});
  return form;
 }
 return {api,initialized,requests,transitions,scrolls,routes,feedback,formData,location,render,submit,get html(){return html;},get entryCount(){return entryCount;},get mountCount(){return mountCount;},setLocale(value){document.documentElement.lang=value;render();}};
}
const login=f=>f.submit('login',{username:'classroom_member',password:'InitialClassroom123'});
const password=f=>f.submit('password',{currentPassword:'InitialClassroom123',newPassword:'MyClassroomPassword234',confirmPassword:'MyClassroomPassword234'});

test('new account with server flag false enters through the stone animation without forced password setup',async()=>{
 const gate=deferred(),f=fixture({entryGate:gate});await f.initialized;
 assert.match(f.html,/data-account-form="login"/);assert.ok(f.mountCount>0);
 const signingIn=login(f);await tick();
 assert.equal(f.entryCount,1,'Verified new account starts the regular entrance');
 assert.equal(f.api.user.mustChangePassword,false);assert.equal(f.api.busy,true);
 assert.ok(!f.routes.includes('#account'),'No forced-password redirect occurs before or during the animation');
 assert.equal(f.requests.filter(request=>request.path.endsWith('/auth/password')).length,0);
 gate.resolve();const form=await signingIn;
 assert.equal(f.location.hash,'#discover');assert.equal(f.api.busy,false);assert.equal(form.elements.password.value,'');
 assert.equal(f.formData.at(-1).get('password'),null,'Submitted credentials are released from FormData');
 assert.equal(f.scrolls.at(-1).top,0);assert.equal(f.transitions.at(-1).reason,'login');
 assert.equal(f.requests.find(request=>request.path.endsWith('/auth/login')).credentials,'same-origin');
});

test('personal account page offers voluntary password change and stays on that page after success',async()=>{
 const f=fixture();await f.initialized;await login(f);f.location.hash='#account';f.render();
 assert.match(f.html,/data-account-form="password"/);assert.match(f.html,/name="currentPassword"/);assert.match(f.html,/name="newPassword"/);assert.match(f.html,/name="confirmPassword"/);
 assert.match(f.html,/我的账户/);assert.doesNotMatch(f.html,/请先设置你的新密码/);
 const before=f.entryCount,form=await password(f);
 assert.equal(f.location.hash,'#account','A voluntary change keeps the person in their account page');
 assert.equal(f.entryCount,before,'Voluntary password changes do not replay the entrance');
 assert.equal(f.api.user.mustChangePassword,false);assert.match(f.html,/密码已更新/);
 assert.equal(f.requests.filter(request=>request.path.endsWith('/auth/password')).length,1);
 for(const name of ['currentPassword','newPassword','confirmPassword'])assert.equal(form.elements[name].value,'');
});

test('administrator-reset flag true still requires password change before entry',async()=>{
 const f=fixture({loginUser:member({mustChangePassword:true})});await f.initialized;await login(f);
 assert.equal(f.location.hash,'#account');assert.equal(f.entryCount,0);assert.equal(f.api.user.mustChangePassword,true);
 assert.match(f.html,/请先设置你的新密码/);assert.match(f.html,/data-entry-account/);assert.match(f.html,/data-account-form="password"/);
 await password(f);assert.equal(f.api.user.mustChangePassword,false);assert.equal(f.entryCount,1);assert.equal(f.location.hash,'#discover');
});

test('restored sessions honor the server flag rather than inferring first login from a new username',async()=>{
 const direct=fixture({initialUser:member({username:'never_seen_before'})});await direct.initialized;
 assert.equal(direct.location.hash,'#discover');assert.equal(direct.api.user.mustChangePassword,false);assert.equal(direct.entryCount,0);assert.ok(!direct.routes.includes('#account'));
 const reset=fixture({initialUser:member({mustChangePassword:true}),hash:'#discover'});await reset.initialized;
 assert.equal(reset.location.hash,'#account');assert.equal(reset.entryCount,0);assert.match(reset.html,/请先设置你的新密码/);
});

test('a server-required password reset received during a session cannot be bypassed',async()=>{
 const f=fixture({initialUser:member(),hash:'#account'});await f.initialized;
 await assert.rejects(f.api.request('/private-fixture'),error=>error.code==='PASSWORD_CHANGE_REQUIRED');
 assert.equal(f.api.user.mustChangePassword,true);assert.equal(f.location.hash,'#account');assert.match(f.html,/请先设置你的新密码/);
 await password(f);assert.equal(f.entryCount,1);assert.equal(f.location.hash,'#discover');
});

test('incorrect current password keeps the normal account signed in and reports the error',async()=>{
 const f=fixture({initialUser:member(),hash:'#account',passwordFailure:'INCORRECT_PASSWORD'});await f.initialized;
 await password(f);assert.equal(f.location.hash,'#account');assert.equal(f.api.user.id,'ui-fixture-member');assert.equal(f.entryCount,0);assert.equal(f.api.user.mustChangePassword,false);assert.match(f.html,/当前密码不正确/);
});

test('optional password form validates confirmation without sending an invalid mutation',async()=>{
 const f=fixture({initialUser:member(),hash:'#account'});await f.initialized;
 const form=await f.submit('password',{currentPassword:'InitialClassroom123',newPassword:'MyClassroomPassword234',confirmPassword:'DifferentPassword456'});
 assert.equal(f.requests.filter(request=>request.path.endsWith('/auth/password')).length,0);assert.match(f.feedback.at(-1),/两次输入的新密码不一致/);assert.equal(form.elements.confirmPassword.attributes['aria-invalid'],'true');assert.equal(f.location.hash,'#account');
});

test('voluntary account settings remain available in simplified Chinese, traditional Chinese and English',async()=>{
 const f=fixture({initialUser:member(),hash:'#account'});await f.initialized;
 for(const [locale,title,change,forced] of [['zh-CN','我的账户','修改密码','请先设置你的新密码'],['zh-Hant','我的帳戶','修改密碼','請先設定你的新密碼'],['en','My account','Change password','Set your new password first']]){
  f.setLocale(locale);assert.ok(f.html.includes(title));assert.ok(f.html.includes(change));assert.ok(!f.html.includes(forced));assert.match(f.html,/data-account-form="password"/);
 }
});
