import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/accounts.js',import.meta.url),'utf8');
const admin={id:'ai-admin-one',username:'admin_one',displayName:'管理员一',role:'admin',status:'active',mustChangePassword:false};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
async function fixture({user=admin,loadFailure=false,holdGet,holdPatch}={}){
 const handlers={},requests=[],dialogs=[],root={addEventListener:(name,fn)=>{handlers[name]=fn;},querySelector:()=>null};let html='',session={...user},api;
 const configs=Object.fromEntries(['upload','teaching','prompt'].map(task=>[task,{task,prompt:'Default '+task,defaultPrompt:'Default '+task,revision:0,isDefault:true,updatedAt:null,updatedBy:null}]));
 const document={documentElement:{lang:'zh-CN',dataset:{theme:'light'}},visibilityState:'visible',querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},querySelector:selector=>selector==='.account-ai-confirm'?dialogs.find(dialog=>!dialog.removed):null,body:{append(dialog){dialogs.push(dialog);}},createElement(){const events={};return {returnValue:'',setAttribute(){},addEventListener:(name,fn)=>{events[name]=fn;},showModal(){},remove(){this.removed=true;},close(value='cancel'){this.returnValue=value;events.close?.();}};}};
 const window={addEventListener(){},scrollTo(){},TashanEntrance:{dismissAuth(){}}},location={hash:'#admin'};
 const sandbox=vm.createContext({window,document,location,AbortController,TextEncoder,setTimeout,clearTimeout,queueMicrotask,fetch:async(path,options)=>{
  const body=options.body?JSON.parse(options.body):undefined;requests.push({path,method:options.method,body});let data,status=200;
  if(path.endsWith('/status'))data={configured:true,mode:'local'};
  else if(path.endsWith('/auth/session'))data={user:session};
  else if(path.startsWith('/api/v1/admin/users?'))data={users:[session],total:1,page:1,pageSize:20};
  else if(path==='/api/v1/admin/ai-prompts'){
   if(holdGet)await holdGet.promise;
   if(loadFailure){status=503;data={error:{code:'AI_PROMPT_STORAGE_UNAVAILABLE'}};}else data={prompts:Object.values(configs)};
  }else if(path.startsWith('/api/v1/admin/ai-prompts/')&&options.method==='PATCH'){
   if(holdPatch)await holdPatch.promise;
   const task=path.split('/').at(-1),config=configs[task];
   if(body.expectedRevision!==config.revision){status=409;data={error:{code:'AI_PROMPT_CONFLICT'}};}
   else {Object.assign(config,{prompt:body.prompt===null?config.defaultPrompt:body.prompt,revision:config.revision+1,isDefault:body.prompt===null,updatedAt:'2026-09-15T10:00:00Z',updatedBy:session});data={prompt:config};}
  }else if(path==='/api/v1/admin/audit')data={events:[{action:'ai_prompt.updated',details:{task:'upload',revision:2,reset:true},actorUsername:'admin_one'}]};
  else throw new Error('Unexpected UI fixture route '+path);
  return {ok:status<400,status,json:async()=>structuredClone(data)};
 },localStorage:{setItem(){assert.fail('Admin prompt drafts must never enter persistent storage');}},sessionStorage:{setItem(){assert.fail('Admin prompt drafts must never enter persistent storage');}}});
 vm.runInContext(source,sandbox);api=window.TashanAccounts;
 const render=()=>{html=api.render('admin');api.bind(root);};await api.init({onRender:render});await tick();
 const click=(action,task)=>handlers.click({target:{closest:()=>({dataset:{accountAction:action,task}})},preventDefault(){},stopImmediatePropagation(){}});
 const input=(task,value)=>handlers.input({target:{closest:()=>({dataset:{task,accountAiEditor:''},value})},stopImmediatePropagation(){}});
 const submit=(task,value)=>{const form={dataset:{accountForm:'ai-prompt',task},elements:{prompt:{value}},closest:()=>form};return handlers.submit({target:form,preventDefault(){},stopImmediatePropagation(){}});};
 return {api,requests,configs,dialogs,click,input,submit,render,get html(){return html;},async open(){await click('ai-tab');await tick();},locale(value){document.documentElement.lang=value;render();},theme(value){document.documentElement.dataset.theme=value;render();},async switchUser(value){session={...value};await api.refreshSession();await tick();},mutate(task,text){Object.assign(configs[task],{prompt:text,revision:configs[task].revision+1,isDefault:false});}};
}
const writes=f=>f.requests.filter(item=>item.method==='PATCH');

test('AI settings are hidden from members and accounts requiring a password reset',async()=>{
 for(const user of [{...admin,role:'member'},{...admin,mustChangePassword:true}]){
  const f=await fixture({user});await f.click('ai-tab');await f.submit('upload','Not allowed');assert.doesNotMatch(f.html,/data-account-action="ai-tab"|data-account-form="ai-prompt"/);assert.equal(f.requests.filter(r=>r.path.includes('/ai-prompts')).length,0);
 }
});

test('failed initial loading never invents a savable default revision',async()=>{
 const f=await fixture({loadFailure:true});await f.open();assert.match(f.html,/提示词配置读取失败/);assert.match(f.html,/重新读取最新配置/);assert.match(f.html,/未读取/);assert.doesNotMatch(f.html,/系统默认|data-account-form="ai-prompt"/);await f.submit('upload','A valid draft');assert.equal(writes(f).length,0);
});

test('separate drafts survive feature, language, theme and account-list refresh changes',async()=>{
 const f=await fixture();await f.open();f.input('upload','Upload draft\n\tClassroom context');await f.click('ai-task','teaching');f.input('teaching','Teaching draft');await f.click('ai-task','upload');
 assert.match(f.html,/Upload draft/);f.locale('en');assert.match(f.html,/Upload draft/);assert.match(f.html,/Save prompt/);f.theme('dark');await f.click('reload-users');assert.match(f.html,/Upload draft/);await f.click('ai-task','teaching');assert.match(f.html,/Teaching draft/);assert.equal(writes(f).length,0);
});

test('prompt validation counts Unicode characters and renders prompt markup as text',async()=>{
 const f=await fixture();await f.open();
 for(const invalid of ['  ','𠮷'.repeat(4001),'Text\u0000control','Text\u0080control']){await f.submit('upload',invalid);assert.match(f.html,/1–4000/);assert.equal(writes(f).length,0);}
 const valid='𠮷'.repeat(3996)+'\r\n\tA';await f.submit('upload',valid);assert.equal(writes(f).length,1);assert.equal(writes(f)[0].body.prompt,'𠮷'.repeat(3996)+'\n\tA');assert.equal(writes(f)[0].body.expectedRevision,0);assert.match(f.html,/提示词已保存，下次调用生效/);
 f.input('upload','</textarea><img src=x onerror=alert(1)>');f.render();assert.match(f.html,/&lt;\/textarea&gt;&lt;img/);assert.doesNotMatch(f.html,/<img src=x/);
});

test('conflicts preserve the draft and require explicit latest-revision review before saving',async()=>{
 const f=await fixture();await f.open();f.mutate('upload','Other administrator text');await f.submit('upload','My unsubmitted text');assert.equal(writes(f).length,1);assert.match(f.html,/其他管理员已修改/);assert.match(f.html,/My unsubmitted text/);
 await f.submit('upload','My unsubmitted text');assert.equal(writes(f).length,1,'Conflict cannot blindly retry');await f.click('reload-ai-prompts');assert.match(f.html,/Other administrator text/);assert.match(f.html,/My unsubmitted text/);await f.submit('upload','My unsubmitted text');assert.equal(writes(f).length,1,'Loading alone does not authorize overwriting the latest revision');
 await f.click('rebase-ai-prompt','upload');await f.submit('upload','My reviewed text');assert.equal(writes(f).length,2);assert.equal(writes(f)[1].body.expectedRevision,1);assert.equal(f.configs.upload.prompt,'My reviewed text');
});

test('restoring a default requires confirmation and an old dialog cannot write as a new account',async()=>{
 const f=await fixture();await f.open();await f.submit('upload','Custom instructions');f.input('upload','Unsaved local edit');
 let reset=f.click('reset-ai-prompt','upload');await tick();assert.equal(writes(f).length,1);f.dialogs.at(-1).close('cancel');await reset;f.render();assert.match(f.html,/Unsaved local edit/);
 reset=f.click('reset-ai-prompt','upload');await tick();f.dialogs.at(-1).close('confirm');await reset;assert.equal(writes(f).at(-1).body.prompt,null);assert.equal(writes(f).at(-1).body.expectedRevision,1);assert.match(f.html,/已恢复默认/);
 f.input('upload','Another draft');reset=f.click('reset-ai-prompt','upload');await tick();await f.switchUser({...admin,id:'ai-admin-two',username:'second'});f.dialogs.at(-1).close('confirm');await reset;assert.equal(writes(f).length,2);assert.doesNotMatch(f.html,/Another draft/);
});

test('late reads and writes cannot expose a previous administrator’s prompts after identity changes',async()=>{
 const readGate=deferred(),f=await fixture({holdGet:readGate});const opening=f.open();await tick();await f.switchUser({...admin,role:'member',id:'other-member'});readGate.resolve();await opening;await tick();assert.doesNotMatch(f.html,/Default upload|data-account-form="ai-prompt"/);
 const writeGate=deferred(),g=await fixture({holdPatch:writeGate});await g.open();const saving=g.submit('upload','Private former-admin draft');await tick();await g.switchUser({...admin,role:'member',id:'other-member'});writeGate.resolve();await saving;assert.doesNotMatch(g.html,/Private former-admin draft|提示词已保存/);
});

test('audit entries describe the feature and revision without exposing raw action names',async()=>{
 const f=await fixture();await f.click('audit-tab');await tick();assert.match(f.html,/恢复默认 AI 提示词 · 上传信息分析 · r2/);assert.doesNotMatch(f.html,/ai_prompt\.updated|undefined/);f.locale('en');assert.match(f.html,/Restore default AI prompt · Upload analysis · r2/);
});


test('pending saves preserve later typing and a first read has no invented default status',async()=>{
 const readGate=deferred(),f=await fixture({holdGet:readGate});const opening=f.open();await tick();assert.match(f.html,/正在读取/);assert.doesNotMatch(f.html,/系统默认|data-account-form="ai-prompt"/);readGate.resolve();await opening;
 const writeGate=deferred(),g=await fixture({holdPatch:writeGate});await g.open();const saving=g.submit('upload','Submitted revision');await tick();g.input('upload','Later unsaved revision');await g.click('ai-task','teaching');g.input('teaching','Other feature draft');writeGate.resolve();await saving;await g.click('ai-task','upload');assert.equal(g.configs.upload.prompt,'Submitted revision');assert.match(g.html,/Later unsaved revision/);assert.match(g.html,/你还有新的未保存修改/);await g.click('ai-task','teaching');assert.match(g.html,/Other feature draft/);
});


test('losing administrator access invalidates pending AI work even when the account ID is unchanged',async()=>{
 const gate=deferred(),f=await fixture({holdPatch:gate});await f.open();const saving=f.submit('upload','Former administrator pending edit');await tick();f.input('upload','Private draft after pending save');await f.switchUser({...admin,role:'member'});assert.doesNotMatch(f.html,/Private draft/);gate.resolve();await saving;await f.switchUser(admin);await f.open();assert.doesNotMatch(f.html,/Private draft after pending save|本次已保存/);assert.match(f.html,/Former administrator pending edit/,'Reinstated access reads the actual server value without restoring the old draft');
});
