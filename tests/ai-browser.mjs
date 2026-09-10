import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Component controller fixture: no browser network, AI provider or user storage.
// Real layout/accessibility is checked separately in the in-app browser.
const source=readFileSync(new URL('../assets/js/ai-assistant.js',import.meta.url),'utf8');
const fields={purpose:'Explain the seasons',audience:'Secondary learners',prior:'Earth and sunlight',outcome:'Explain annual daylight changes',setting:'Predict, observe, explain'};
const uploadFields={title:'Explore the seasons',subject:'地理',stage:'高中',...fields};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture({task='teaching',locale='zh-CN',context={},respond,extract,ignoreAbort=false}={}){
 const handlers={},listeners={},requests=[],applied=[],timers=new Map();let timerId=0,html='',enabled=true,epoch=1,target={},file,refreshes=0;
 const data={title:'Earth and seasons',kind:'visual',core:'A simulation for exploring the seasons.',...context};
 const actor={id:'fixture-member',status:'active',mustChangePassword:false};
 const location={hash:task==='prompt'?'adapt/earth':'upload'};
 const accounts={user:actor,busy:false,refreshSession:async()=>{refreshes++;}};
 const slot={get dataset(){return {aiTask:task,aiKey:task==='prompt'?'earth':'draft'};},get outerHTML(){return html;},set outerHTML(value){html=value;}};
 const root={contains:()=>true,addEventListener:(name,handler)=>{(handlers[name]??=[]).push(handler);},querySelector:selector=>selector==='[data-ai-slot]'&&enabled?slot:selector==='[data-ai-action="apply"]'?{disabled:false}:{focus(){}}};
 const window={TashanAccounts:accounts,TashanAIExtract:{extract:extract|| (async()=>({text:'Extracted teaching text about sunlight and seasons.',supported:true}))},addEventListener:(name,handler)=>{listeners[name]=handler;},dispatchEvent:()=>true};
 const fetch=async(path,options)=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({path,body,options});
  let job=Promise.resolve(path.endsWith('capabilities')?{configured:true,model:'test-model',limits:{perMinute:3,perDay:30}}:respond?respond(body,options):{task:body.task,result:body.task==='prompt'?{text:'A refined classroom creation prompt.'}:{fields:body.task==='upload'?uploadFields:fields},model:'test-model'});
  if(!ignoreAbort)job=Promise.race([job,new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})),{once:true}))]);
  const result=await job;
  return {ok:!result?.error,status:result?.status||200,json:async()=>result};
 };
 const sandbox=vm.createContext({window,document:{documentElement:{lang:locale}},location,fetch,AbortController,CustomEvent:class{constructor(type,detail){this.type=type;this.detail=detail;}},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source,sandbox);const api=window.TashanAI;
 const capture=()=>enabled?{epoch,target,file,context:{...data}}:null;
 const render=()=>{html=api.markup(task,task==='prompt'?'earth':'draft');api.mount(root);};
 api.init({capture,apply:(kind,key,result)=>{applied.push(JSON.parse(JSON.stringify({kind,key,result})));if(result.fields)Object.assign(data,result.fields);else data.core=result.text;render();},busy:()=>false});render();
 const emit=async(name,node)=>{for(const callback of handlers[name]||[])await callback({target:node,preventDefault(){}});};
 return {api,requests,applied,data,accounts,location,timers,render,async ready(){await tick();},get html(){return html;},get refreshes(){return refreshes;},click:action=>emit('click',{closest:()=>({dataset:{aiAction:action},disabled:false})}),input:async(key,value)=>{data[key]=value;await emit('input',{dataset:{draft:key}});},toggle:checked=>emit('change',{dataset:{aiAuto:''},checked}),select:(key,checked)=>emit('change',{dataset:{aiField:key},checked}),async setFile(next,options={}){file=next;render();return api.fileChanged(next,options);},navigate(){enabled=false;api.reset();},replaceDraft(){target={};render();},switchActor(){epoch++;accounts.user={...actor,id:'another-member'};api.reset({account:true});render();},setLocale(value){sandbox.document.documentElement.lang=value;render();}};
}

test('teaching suggestions are reviewed and only selected fields are applied',async()=>{
 const f=fixture({context:{purpose:'Teacher original'}});await f.ready();await f.click('generate');
 assert.equal(f.applied.length,0);assert.match(f.html,/data-ai-review/);assert.equal(f.data.purpose,'Teacher original');
 await f.select('purpose',false);await f.click('apply');assert.equal(f.applied.length,1);assert.equal(f.data.purpose,'Teacher original');assert.equal(f.data.audience,fields.audience);assert.deepEqual(Object.keys(f.applied[0].result.fields),['audience','prior','outcome','setting']);
});
test('prompt adoption is explicit and untrusted model markup remains text',async()=>{
 const malicious='<img src=x onerror=alert(1)>\n</textarea><script>private()</script>';
 const f=fixture({task:'prompt',respond:()=>({task:'prompt',result:{text:malicious}})});await f.ready();await f.click('generate');
 assert.equal(f.applied.length,0);assert.match(f.html,/&lt;script&gt;/);assert.doesNotMatch(f.html,/<script>|<img src=x/);await f.click('apply');assert.equal(f.data.core,malicious);
});
test('AI request excludes private paths, binary/account data and is bounded',async()=>{
 const f=fixture({context:{core:'Teaching '+ 'x'.repeat(13000),purpose:'/Users/person/private/file.html',audience:'Learners',reference:'file:///private/secret',password:'not allowed'}});await f.ready();await f.click('generate');
 const {body,options}=f.requests.at(-1);assert.equal(body.context.core.length,6000);assert.ok(Object.values(body.context).reduce((a,b)=>a+b.length,0)<=10000);assert.doesNotMatch(JSON.stringify(body),/\/Users|\/private|password|fixture-member|attachment/);assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.match(f.html,/本地路径已省略/);
});
test('rapid repeated generation sends one request and cancellation discards late output',async()=>{
 const pending=deferred(),f=fixture({respond:()=>pending.promise,ignoreAbort:true});await f.ready();const first=f.click('generate');await tick();await f.click('generate');assert.equal(f.requests.filter(x=>x.body).length,1);await f.click('cancel');pending.resolve({task:'teaching',result:{fields}});await first;assert.equal(f.applied.length,0);assert.doesNotMatch(f.html,/data-ai-review/);
});
test('editing, replacing a draft, leaving the route and switching account discard old results',async()=>{
 for(const action of ['edit','replace','navigate','account']){
  const pending=deferred(),f=fixture({respond:()=>pending.promise,ignoreAbort:true});await f.ready();const job=f.click('generate');await tick();
  if(action==='edit')await f.input('core','The teacher changed this lesson context.');if(action==='replace')f.replaceDraft();if(action==='navigate')f.navigate();if(action==='account')f.switchActor();
  pending.resolve({task:'teaching',result:{fields}});await job;assert.equal(f.applied.length,0,action);if(action!=='navigate')assert.doesNotMatch(f.html,/data-ai-review/,action);
 }
});
test('70 second timeout gives actionable feedback without applying data',async()=>{
 const f=fixture({respond:()=>new Promise(()=>{})});await f.ready();const job=f.click('generate');await tick();const timeout=[...f.timers.values()].find(timer=>timer.ms===70000);assert.ok(timeout);timeout.fn();await job;assert.match(f.html,/生成超时/);assert.equal(f.applied.length,0);
});
test('session expiry and first-password-change responses direct to account flows',async()=>{
 for(const [status,code,hash] of [[401,'UNAUTHORIZED','login'],[403,'PASSWORD_CHANGE_REQUIRED','account']]){
  const f=fixture({respond:()=>({status,error:{code}})});await f.ready();await f.click('generate');assert.equal(f.refreshes,1);assert.equal(f.location.hash,hash);assert.equal(f.applied.length,0);
 }
});
test('quota errors have translated actionable messages',async()=>{
 for(const [code,pattern] of [['AI_MINUTE_LIMIT',/3 requests per minute/],['AI_DAILY_LIMIT',/30 requests in 24 hours/],['AI_GLOBAL_LIMIT',/platform has reached its AI limit/]]){
  const f=fixture({locale:'en',respond:()=>({status:429,error:{code}})});await f.ready();await f.click('generate');assert.match(f.html,pattern);
 }
 const traditional=fixture({locale:'zh-Hant'});assert.match(traditional.html,/AI 教學建議/);assert.match(traditional.html,/傳送給 DeepSeek/);
});
test('automatic upload is default on, uses extracted text and fills empty required fields',async()=>{
 const f=fixture({task:'upload',context:{title:'earth-demo',core:'',purpose:'Keep this teacher wording',tested:'none',used:'no',license:'unconfirmed'}});await f.ready();assert.match(f.html,/data-ai-auto checked/);
 const file={name:'earth-demo.html',binary:'PRIVATE FILE BYTES'};await f.setFile(file,{generatedTitle:true});
 assert.equal(f.requests.filter(x=>x.body).length,1);assert.equal(f.requests.at(-1).body.task,'upload');assert.equal(f.requests.at(-1).body.context.core,'Extracted teaching text about sunlight and seasons.');assert.doesNotMatch(JSON.stringify(f.requests.at(-1).body),/PRIVATE FILE BYTES|binary|license|tested|used/);
 assert.equal(f.data.core,'');assert.equal(f.data.title,uploadFields.title);assert.equal(f.data.purpose,'Keep this teacher wording');assert.equal(f.data.subject,'地理');assert.equal(f.applied.length,1);assert.match(f.html,/AI 预填，请核对/);assert.match(f.html,/未自动保存/);
});
test('turning off automatic analysis sends nothing; manual analysis still works',async()=>{
 const f=fixture({task:'upload',context:{core:'',title:'User title'}});await f.ready();await f.toggle(false);await f.setFile({name:'file.html'});assert.equal(f.requests.filter(x=>x.body).length,0);await f.click('generate');assert.equal(f.requests.filter(x=>x.body).length,1);assert.equal(f.data.title,'User title');assert.doesNotMatch(f.html,/data-ai-auto checked/);
});
test('unsupported files are never represented as read; a manual description can be analysed',async()=>{
 const f=fixture({task:'upload',context:{core:''},extract:async()=>({text:'',supported:false})});await f.ready();await f.setFile({name:'file.zip'});assert.equal(f.requests.filter(x=>x.body).length,0);assert.match(f.html,/暂不支持文字提取/);await f.click('generate');assert.equal(f.requests.filter(x=>x.body).length,0);await f.input('core','This project lets students explore solar geometry.');await f.click('generate');assert.equal(f.requests.filter(x=>x.body).length,1);
});
test('changing a file or removing it during extraction never sends stale teaching text',async()=>{
 const first=deferred(),f=fixture({task:'upload',context:{core:''},extract:file=>file.name==='first.html'?first.promise:Promise.resolve({text:'Second file teaching content.',supported:true})});await f.ready();const before=f.setFile({name:'first.html'});await tick();await f.setFile({name:'second.html'});first.resolve({text:'OLD PRIVATE FIRST FILE',supported:true});await before;
 assert.equal(f.requests.filter(x=>x.body).length,1);assert.match(f.requests.at(-1).body.context.core,/Second file/);assert.doesNotMatch(JSON.stringify(f.requests),/OLD PRIVATE FIRST FILE/);
 const pending=deferred(),g=fixture({task:'upload',extract:()=>pending.promise});await g.ready();const work=g.setFile({name:'removed.html'});await tick();g.api.fileRemoved();pending.resolve({text:'Removed project teaching.',supported:true});await work;assert.equal(g.requests.filter(x=>x.body).length,0);
});
test('an upload response cannot overwrite typing or data belonging to a replacement file',async()=>{
 for(const action of ['typing','file']){
  const waiting=deferred(),f=fixture({task:'upload',context:{core:''},respond:()=>waiting.promise,ignoreAbort:true});await f.ready();const work=f.setFile({name:'first.html'},{generatedTitle:true});await tick();
  if(action==='typing')await f.input('purpose','Written while AI was working');else{f.api.fileRemoved();await f.toggle(false);await f.setFile({name:'replacement.html'});}
  waiting.resolve({task:'upload',result:{fields:uploadFields}});await work;assert.equal(f.applied.length,0,action);if(action==='typing')assert.equal(f.data.purpose,'Written while AI was working');
 }
});
test('incomplete or wrong-task results cannot be applied',async()=>{
 for(const response of [{task:'prompt',result:{text:'wrong task'}},{task:'teaching',result:{fields:{purpose:'only one'}}}]){
  const f=fixture({respond:()=>response});await f.ready();await f.click('generate');assert.equal(f.applied.length,0);assert.match(f.html,/返回内容不完整/);assert.doesNotMatch(f.html,/data-ai-review/);
 }
});

test('service configuration and malformed upstream errors remain specific without exposing secrets',async()=>{
 for(const [code,pattern] of [['AI_BALANCE_REQUIRED',/insufficient credit/],['AI_KEY_REJECTED',/service key is unavailable/],['AI_INVALID_RESPONSE',/result was incomplete/],['AI_INCOMPLETE',/result was incomplete/]]){
  const f=fixture({locale:'en',respond:()=>({status:502,error:{code,message:'UPSTREAM_SECRET_SHOULD_NOT_RENDER'}})});await f.ready();await f.click('generate');assert.match(f.html,pattern);assert.doesNotMatch(f.html,/UPSTREAM_SECRET/);
 }
});

test('actual app hooks wire both upload steps and Prompt adoption without saving or verification changes',async()=>{
 const catalog=JSON.parse(readFileSync(new URL('../data/generated/catalog.json',import.meta.url),'utf8'));
 const root={innerHTML:'',addEventListener(){},querySelector(){return null;}},calls=[];let hooks,saves=0;
 const ai={init:options=>{hooks=options;},markup:(task,key)=>{calls.push([task,key]);return '<div data-fixture-ai></div>';},mount:()=>{calls.push(['mount']);},reset(){},guide:()=> 'Configured AI assistance'};
 const env=vm.createContext({document:{documentElement:{lang:'zh-CN',dataset:{theme:'light'}},getElementById:id=>id==='practice-ui'?root:{focus(){}},querySelectorAll:()=>[]},location:{hash:'#upload'},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null},PRACTICE_LIBRARY:catalog,PRACTICE_TRANSLATIONS:{},PRACTICE_ICONS:{},TashanAI:ai,TashanAccounts:{initialized:true,user:{id:'test-member',status:'active'},header:()=>'',bind(){},init(){}},PracticeStore:{put:()=>{saves++;},putDraft:()=>{saves++;}},addEventListener(){},setTimeout,clearTimeout,URL,Blob});
 vm.runInContext('window=globalThis',env);
 let app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');const end=app.lastIndexOf('})();');app=app.slice(0,end)+'window.appFixture={state,render};'+app.slice(end);vm.runInContext(app,env);
 assert.equal(typeof hooks.capture,'function');assert.ok(calls.some(([task])=>task==='upload'));assert.ok(calls.some(([task])=>task==='mount'));
 const draft=hooks.capture('upload','draft').target;Object.assign(draft,{core:'Original project source',used:'no',tested:'not tested',license:'unconfirmed'});
 hooks.apply('upload','draft',{fields:uploadFields});assert.equal(draft.core,'Original project source');assert.equal(draft.used,'no');assert.equal(draft.tested,'not tested');assert.equal(draft.license,'unconfirmed');assert.equal(saves,0);
 env.appFixture.state.step=2;env.appFixture.render();assert.ok(calls.some(([task])=>task==='teaching'));assert.equal(hooks.capture('upload','draft'),null);assert.equal(hooks.capture('teaching','draft').context.title,uploadFields.title);
 env.location.hash='#adapt/poetry';env.appFixture.render();const prompt=hooks.capture('prompt','poetry');assert.equal(prompt.context.core,catalog.projects.find(p=>p.id==='poetry').document.content);assert.equal(prompt.context.reference.includes('/Users'),false);hooks.apply('prompt','poetry',{text:'Refined task text'});assert.equal(env.appFixture.state.briefs.poetry,'Refined task text');assert.equal(saves,0);
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(index.indexOf('assets/js/ai-extractor.js')<index.indexOf('assets/js/ai-assistant.js'));assert.ok(index.indexOf('assets/js/ai-assistant.js')<index.indexOf('assets/js/app.js'));assert.match(root.innerHTML,/Refined task text/);
});
