import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Public controller regression with cloned HTTP results and synthetic accounts.
// No browser, real credentials, storage or network is accessed.
const source=readFileSync(new URL('../assets/js/accounts.js',import.meta.url),'utf8');
const admin={id:'access-fixture-admin',username:'admin_fixture',displayName:'Admin fixture',role:'admin',status:'active',mustChangePassword:false};
const member={id:'access-fixture-member',username:'member_fixture',displayName:'Member fixture',role:'member',status:'active',mustChangePassword:false};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({holdLists=0,holdAudits=0}={}){
  const handlers={},writes=[],dialogs=[],listJobs=[],auditJobs=[];let row={...member},session={...admin},html='',api;
  const delayed=(jobs,maximum,data)=>{let finish;const promise=new Promise(resolve=>{finish=(value=data,status=200)=>resolve({ok:status<400,status,json:async()=>structuredClone(value)});});jobs.push({finish,data});return jobs.length<=maximum?promise:(finish(),promise);};
  const root={addEventListener:(type,fn)=>{handlers[type]=fn;},querySelector:()=>null};
  const document={documentElement:{lang:'zh-CN'},visibilityState:'visible',querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,addEventListener(){},body:{append(dialog){dialogs.push(dialog);}},createElement(type){
    assert.equal(type,'dialog');const listeners={};return {returnValue:'',setAttribute(){},addEventListener:(name,fn)=>{listeners[name]=fn;},showModal(){},remove(){this.removed=true;},close(value='cancel'){this.returnValue=value;listeners.close?.();}};
  }};
  const window={addEventListener(){},scrollTo(){},TashanEntrance:{dismissAuth(){}}};
  const context=vm.createContext({window,document,location:{hash:'#admin'},AbortController,TextEncoder,setTimeout,clearTimeout,queueMicrotask,fetch:async(path,options)=>{
    let data;
    if(path.endsWith('/status'))data={configured:true,mode:'local'};
    else if(path.endsWith('/auth/session'))data={user:{...session}};
    else if(path.startsWith('/api/v1/admin/users?'))return delayed(listJobs,holdLists,{users:[{...session},{...row}],total:2,page:1,pageSize:20});
    else if(path==='/api/v1/admin/audit')return delayed(auditJobs,holdAudits,{events:[{id:'audit-'+session.id,action:'account_created',actorUsername:session.username,targetUsername:row.username}]});
    else if(options.method==='PATCH'){const body=JSON.parse(options.body);writes.push({path,body});row={...row,...body};data={user:{...row}};}
    else throw new Error('Unexpected access-intent fixture route');
    return {ok:true,status:200,json:async()=>structuredClone(data)};
  }});
  vm.runInContext(source,context);api=window.TashanAccounts;
  const render=()=>{html=api.render('admin');api.bind(root);};await api.init({onRender:render});await tick();await tick();
  const clickButton=button=>handlers.click({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});
  const click=(action,id)=>clickButton({dataset:{accountAction:action,userId:id}});
  const accessButton=()=>{
    const match=html.match(/<button\b[^>]*data-account-action="toggle-user"[^>]*>([^<]+)<\/button>/);assert.ok(match,'Selected account exposes its access action');
    const dataset=Object.fromEntries([...match[0].matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(([,name,value])=>[name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
    return {dataset,label:match[1]};
  };
  return {api,writes,dialogs,listJobs,auditJobs,click,clickButton,accessButton,updateServer:changes=>{row={...row,...changes};},async switchSession(user){session={...user};await api.refreshSession();await tick();await tick();},get html(){return html;},get row(){return row;}};
}

test('refreshing a selected disabled account updates the visible action and sends its displayed intent',async()=>{
  const f=await fixture();await f.click('edit-user',member.id);assert.equal(f.accessButton().label,'停用账户');
  f.updateServer({status:'disabled'});await f.click('reload-users');
  const enable=f.accessButton();assert.equal(enable.label,'重新启用');assert.equal(enable.dataset.nextStatus,'active');
  await f.clickButton(enable);assert.deepEqual(f.writes.map(call=>call.body),[{status:'active'}]);assert.equal(f.dialogs.length,0);
});

test('an old disable button cannot silently become an enable action after a background refresh',async()=>{
  const f=await fixture();await f.click('edit-user',member.id);const oldDisable=f.accessButton();assert.equal(oldDisable.dataset.nextStatus,'disabled');
  f.updateServer({status:'disabled'});await f.click('reload-users');
  const action=f.clickButton(oldDisable);await tick();
  assert.equal(f.writes.length,0,'A disable intent must not turn into an immediate enable request');
  assert.equal(f.dialogs.length,1,'An explicit disable still asks for confirmation');f.dialogs[0].close('confirm');await action;
  assert.deepEqual(f.writes.map(call=>call.body),[{status:'disabled'}]);assert.equal(f.row.status,'disabled');
});

test('cancelling an explicit disable makes no write and missing action intent cannot toggle access',async()=>{
  const f=await fixture();await f.click('edit-user',member.id);const button=f.accessButton();
  const action=f.clickButton(button);await tick();assert.equal(f.dialogs.length,1);f.dialogs[0].close('cancel');await action;assert.equal(f.writes.length,0);
  for(const nextStatus of [undefined,'unexpected'])await f.clickButton({dataset:{accountAction:'toggle-user',userId:member.id,...(nextStatus?{nextStatus}:{})}});
  assert.equal(f.writes.length,0);assert.equal(f.dialogs.length,1);
});

test('refreshing the selected account also updates the server-owned role and display name',async()=>{
  const f=await fixture();await f.click('edit-user',member.id);
  f.updateServer({role:'admin',displayName:'Changed on server'});await f.click('reload-users');
  assert.match(f.html,/name="displayName"[^>]*value="Changed on server"/);
  assert.match(f.html,/<option value="admin" selected>管理员<\/option>/);
});

test('an old 401 cannot sign out a new administrator or finish the new account’s pending list',async()=>{
  const f=await fixture({holdLists:2});assert.equal(f.listJobs.length,1);
  const next={...admin,id:'access-fixture-second',username:'second_admin'};await f.switchSession(next);
  assert.equal(f.api.user.id,next.id);assert.equal(f.listJobs.length,2,'New identity can start loading without waiting for the previous account');
  f.listJobs[0].finish({error:{code:'UNAUTHENTICATED',message:'Old fixture session expired'}},401);await tick();await tick();
  assert.equal(f.api.user.id,next.id,'A late 401 belongs to the identity that sent that request');
  assert.match(f.html,/正在读取账户/);assert.equal(f.listJobs.length,2,'Old finally must not clear loading and start a duplicate request');
  assert.doesNotMatch(f.html,/登录已过期|Old fixture|ACCOUNT_CONTEXT_CHANGED/);
  f.listJobs[1].finish();await tick();await tick();assert.match(f.html,/@second_admin/);assert.doesNotMatch(f.html,/正在读取账户/);
});

test('A to B to A rejects both old successful rows and old 401s using the identity epoch',async()=>{
  for(const status of [200,401]){
    const f=await fixture({holdLists:1});await f.switchSession({...admin,id:'access-fixture-second',username:'second_admin'});await f.switchSession({...admin});
    assert.equal(f.api.user.id,admin.id);assert.equal(f.listJobs.length,3);
    f.listJobs[0].finish(status===200?{users:[{...member,displayName:'STALE PRIVATE ROW'}],total:1,page:1,pageSize:20}:{error:{code:'UNAUTHENTICATED',message:'Old fixture session expired'}},status);
    await tick();await tick();assert.equal(f.api.user.id,admin.id);assert.doesNotMatch(f.html,/STALE PRIVATE ROW|登录已过期|Old fixture/);assert.match(f.html,/@admin_fixture/);assert.equal(f.listJobs.length,3);
  }
});

test('late audit failure cannot reset the next administrator or end their pending audit load',async()=>{
  const f=await fixture({holdAudits:2});await f.click('audit-tab');await tick();assert.equal(f.auditJobs.length,1);
  const next={...admin,id:'access-fixture-second',username:'second_admin'};await f.switchSession(next);assert.equal(f.auditJobs.length,2);
  f.auditJobs[0].finish({error:{code:'PASSWORD_CHANGE_REQUIRED',message:'Old fixture reset required'}},403);await tick();await tick();
  assert.equal(f.api.user.id,next.id);assert.equal(f.api.user.mustChangePassword,false);assert.match(f.html,/正在处理/);assert.equal(f.auditJobs.length,2);assert.doesNotMatch(f.html,/Old fixture|请先设置你的新密码/);
  f.auditJobs[1].finish();await tick();await tick();assert.match(f.html,/second_admin/);assert.doesNotMatch(f.html,/正在处理/);
});

test('a disable confirmation opened by a previous identity cannot mutate under the new session',async()=>{
  const f=await fixture();await f.click('edit-user',member.id);
  const action=f.clickButton(f.accessButton());await tick();assert.equal(f.dialogs.length,1);
  const next={...admin,id:'access-fixture-second',username:'second_admin'};await f.switchSession(next);assert.equal(f.api.user.id,next.id);
  // A real modal may close automatically on identity change. Confirming any old
  // event afterward must still be harmless; the actor that opened it is gone.
  f.dialogs[0].close('confirm');await action;assert.equal(f.writes.length,0);assert.equal(f.row.status,'active');assert.equal(f.api.user.id,next.id);
});
