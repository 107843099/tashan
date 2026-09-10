import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi } from '../server/api.mjs';
import { createAiProvider, validateAiInput, AI_LIMITS, AI_MODEL } from '../server/ai-provider.mjs';
import worker from '../server/worker.mjs';
const input={task:'teaching',locale:'zh-CN',context:{title:'纸桥承重',kind:'visual',core:'用一张纸制作不同结构的桥，控制跨度和载荷，比较承重并解释差异。'}};
const fields={purpose:'比较结构与承重',audience:'有基础测量经验的小学生',prior:'会保持跨度和材料相同',outcome:'用数据说明设计差异',setting:'小组预测、测试、记录并修改设计'};
const uploadFields={title:'纸桥结构与承重探索',...fields,subject:'综合实践活动',stage:'小学'};
const output=(result=fields,finish='stop')=>({choices:[{finish_reason:finish,message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:100,completion_tokens:80,total_tokens:180}});
function fixture(options={}){
  const calls=[],counts=new Map(),mutations=[];
  const forbiddenWrite=name=>async()=>{mutations.push(name);assert.fail('AI assistance must not persist '+name);};
  const projectsProvider={saveVersion:forbiddenWrite('project versions'),publish:forbiddenWrite('publication'),unpublish:forbiddenWrite('publication withdrawal')};
  const aiProvider=createAiProvider({DEEPSEEK_API_KEY:'private-test-key'},{fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(output());},...options});
  const provider={status:async()=>({configured:true}),authenticate:async(token)=>token==='disabled'?null:{user:{id:token,role:token==='admin'?'admin':'member',status:'active',mustChangePassword:token==='temporary'}},rateLimit:async(key,{limit})=>{const n=(counts.get(key)||0)+1;counts.set(key,n);if(n>limit)throw Object.assign(new Error('请求过多'),{status:429,code:'RATE_LIMITED'});}};
  const call=(data=input,{token='member',origin='https://tashan.test',path='/ai/assist',method='POST',raw,signal}={})=>handleApi(new Request('https://tashan.test/api/v1'+path,{method,signal,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:'tashan_access='+token}:{})},...(method==='GET'?{}:{body:raw??JSON.stringify(data)})}),provider,{aiProvider,projectsProvider});
  return {calls,counts,call,provider,aiProvider,mutations};
}
test('member can request structured teaching suggestions through server-only DeepSeek call',async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.status,200);
  const data=await response.json();assert.deepEqual(data.result.fields,fields);assert.equal(data.model,AI_MODEL);assert.equal(data.usage.totalTokens,180);
  assert.equal(response.headers.get('Cache-Control'),'no-store, private');assert.equal(f.calls.length,1);
  const {url,init}=f.calls[0],sent=JSON.parse(init.body);assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer private-test-key');assert.equal(sent.max_tokens,1600);assert.deepEqual(sent.thinking,{type:'disabled'});assert.equal(sent.tools,undefined);assert.deepEqual(JSON.parse(sent.messages[1].content),input.context);assert.ok(!JSON.stringify(data).includes('private-test-key'));
});
test('upload analysis returns exactly eight editable fields without saving a project',async()=>{
  const request={...input,task:'upload',locale:'en'},before=structuredClone(request);let sent;
  const f=fixture({fetchImpl:async(_,init)=>{sent=JSON.parse(init.body);return Response.json(output(uploadFields));}});
  const response=await f.call(request);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.task,'upload');assert.deepEqual(data.result,{fields:uploadFields});
  assert.deepEqual(Object.keys(data.result.fields).sort(),['title','purpose','subject','stage','audience','prior','outcome','setting'].sort());
  assert.equal(data.result.fields.subject,'综合实践活动');assert.equal(data.result.fields.stage,'小学','Classification values remain app enums even for an English response');
  assert.match(sent.messages[0].content,/title、purpose、subject、stage、audience、prior、outcome、setting/);
  assert.deepEqual(JSON.parse(sent.messages[1].content),input.context);assert.deepEqual(request,before);
  assert.deepEqual(f.mutations,[],'Analysis returns suggestions only; saving and publishing remain explicit flows');
});
test('upload analysis validates classifications and title length while allowing unknown empty classifications',async()=>{
  const accepted={...uploadFields,title:'名'.repeat(200),subject:'',stage:''};
  const f=fixture({fetchImpl:async()=>Response.json(output(accepted))});
  const response=await f.call({...input,task:'upload'});assert.equal(response.status,200);assert.deepEqual((await response.json()).result.fields,accepted);
  for(const changed of [{subject:'科学'},{subject:'Science'},{stage:'大学一年级'},{stage:'Primary school'},{subject:null},{title:'名'.repeat(201)},{title:'   '}]){
    const rejected=fixture({fetchImpl:async()=>Response.json(output({...uploadFields,...changed}))});
    const result=await rejected.call({...input,task:'upload'});assert.equal(result.status,502,JSON.stringify(changed));
    const data=await result.json();assert.equal(data.error.code,'AI_INVALID_RESPONSE');assert.equal(data.result,undefined);assert.deepEqual(rejected.mutations,[]);
  }
});
test('upload analysis rejects permission and verification fields atomically instead of accepting partial suggestions',async()=>{
  const protectedFields={license:'open',used:'yes',record:'模型虚构的已试教记录',verification:{status:'checked',classroomVerified:true}};
  const variants=[...Object.entries(protectedFields).map(([key,value])=>({...uploadFields,[key]:value})),{...uploadFields,...protectedFields}];
  const substituted={...uploadFields,license:'open'};delete substituted.prior;variants.push(substituted);
  for(const result of variants){
    const f=fixture({fetchImpl:async()=>Response.json(output(result))});
    const response=await f.call({...input,task:'upload'});assert.equal(response.status,502);
    const data=await response.json();assert.equal(data.error.code,'AI_INVALID_RESPONSE');assert.equal(data.result,undefined,'Invalid output cannot expose partial fields to apply');
    assert.deepEqual(f.mutations,[]);assert.ok(!JSON.stringify(data).includes('模型虚构'));
  }
});
test('guest, disabled, temporary-password and cross-origin requests never reach model',async()=>{
  const f=fixture();for(const[token,status]of[['',401],['disabled',401],['temporary',403]])assert.equal((await f.call(input,{token})).status,status);
  assert.equal((await f.call(input,{origin:'https://evil.test'})).status,403);assert.equal(f.calls.length,0);
});
test('server ignores no input limits: rejects unknown fields, URLs, oversized or empty context before spending quota',async()=>{
  const f=fixture();
  for(const data of [{...input,model:'other'},{...input,context:{...input.context,url:'https://evil.test'}},{...input,context:{core:'a'.repeat(6001)}},{...input,context:{core:'short'}},{...input,locale:'unknown'}])assert.equal((await f.call(data)).status,400);
  assert.equal((await f.call({...input,context:{core:'a'.repeat(6000),purpose:'a'.repeat(1500),audience:'a'.repeat(1500),prior:'a'.repeat(1500)}})).status,413);
  assert.equal((await f.call(null,{raw:' '.repeat(AI_LIMITS.requestBytes+1)})).status,413);
  assert.equal(f.calls.length,0);assert.equal(f.counts.size,0);
});
test('capabilities report configuration without secrets and require login',async()=>{
  const f=fixture();const r=await f.call(null,{path:'/ai/capabilities',method:'GET'});assert.equal(r.status,200);assert.equal((await r.json()).limits.perDay,30);assert.equal(f.calls.length,0);
  assert.equal((await f.call(null,{path:'/ai/capabilities',method:'GET',token:''})).status,401);
});
test('AI per-user and global quotas are persistent-provider checks before upstream fetch',async()=>{
  const f=fixture();for(let i=0;i<3;i++)assert.equal((await f.call()).status,200);
  const minute=await f.call();assert.equal(minute.status,429);assert.equal((await minute.json()).error.code,'AI_MINUTE_LIMIT');assert.equal(minute.headers.get('Retry-After'),'60');assert.equal(f.calls.length,3);
  f.counts.clear();f.counts.set('ai:day:member',30);
  const daily=await f.call();assert.equal(daily.status,429);assert.equal((await daily.json()).error.code,'AI_DAILY_LIMIT');assert.equal(daily.headers.get('Retry-After'),'86400');
  f.counts.clear();f.counts.set('ai:global:day',300);
  const global=await f.call();assert.equal(global.status,429);assert.equal((await global.json()).error.code,'AI_GLOBAL_LIMIT');assert.equal(global.headers.get('Retry-After'),'86400');assert.equal(f.calls.length,3);
});
test('missing key does not spend quota',async()=>{
  const f=fixture();f.aiProvider.status=()=>({configured:false});const r=await f.call();assert.equal(r.status,503);assert.equal((await r.json()).error.code,'AI_NOT_CONFIGURED');assert.equal(f.calls.length,0);assert.equal(f.counts.size,0);
});
test('Prompt generation returns plain editable text and does not execute embedded markup',async()=>{
  const text='<script>alert(1)</script>\n为初中生提供四季变化的预测与观察任务。';
  const f=fixture({fetchImpl:async()=>Response.json(output({text}))});const r=await f.call({...input,task:'prompt',locale:'en'});assert.equal(r.status,200);assert.equal((await r.json()).result.text,text);
});
test('upstream auth, balance, rate, transport errors are sanitized without response body or key',async()=>{
  for(const[status,code]of[[401,'AI_KEY_REJECTED'],[403,'AI_KEY_REJECTED'],[402,'AI_BALANCE_REQUIRED'],[429,'AI_UPSTREAM_BUSY'],[500,'AI_UPSTREAM_ERROR']]){
    const f=fixture({fetchImpl:async()=>new Response('private-test-key sensitive provider details',{status})});const r=await f.call();const data=await r.json();assert.equal(data.error.code,code);assert.ok(!JSON.stringify(data).includes('private-test-key'));
  }
  const f=fixture({fetchImpl:async()=>{throw new Error('private-test-key');}});assert.equal((await(await f.call()).json()).error.code,'AI_CONNECTION_FAILED');
});
test('manual redirect mode works on Workers and a redirect cannot forward the key elsewhere',async()=>{
  let calls=0;
  const f=fixture({fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(init.redirect,'manual');
    return new Response('do not expose upstream content',{status:307,headers:{Location:'https://untrusted.example/collect'}});
  }});
  const response=await f.call();assert.equal(response.status,502);
  const result=await response.json();assert.equal(result.error.code,'AI_UPSTREAM_ERROR');assert.equal(calls,1);
  assert(!JSON.stringify(result).includes('untrusted.example'));
});
test('incomplete JSON, unexpected fields and oversized upstream response are rejected',async()=>{
  for(const response of [()=>Response.json(output(fields,'length')),()=>Response.json(output({text:'wrong task'})),()=>new Response('x'.repeat(64*1024+1)),()=>Response.json({choices:[]})]){
    const f=fixture({fetchImpl:async()=>response()});assert.equal((await f.call()).status,502);
  }
});
test('timeout aborts upstream fetch and reports bounded failure',async()=>{
  let aborted=false;const f=fixture({timeoutMs:5,fetchImpl:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}))});
  const r=await f.call();assert.equal(r.status,504);assert.equal((await r.json()).error.code,'AI_TIMEOUT');assert.ok(aborted);
});
test('external request cancellation immediately aborts the upstream signal', {timeout:2000},async()=>{
  const controller=new AbortController();let started,upstreamSignal,aborted=false;
  const upstreamStarted=new Promise(resolve=>{started=resolve;});
  const f=fixture({timeoutMs:1000,fetchImpl:async(_,options)=>new Promise((resolve,reject)=>{
    upstreamSignal=options.signal;
    options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('cancelled','AbortError'));},{once:true});
    started();
  })});
  const pending=f.call(input,{signal:controller.signal});await upstreamStarted;
  assert.equal(upstreamSignal.aborted,false);
  controller.abort();
  assert.equal(upstreamSignal.aborted,true,'Caller cancellation must propagate immediately, before the provider timeout');
  assert.equal(aborted,true);
  const response=await pending;assert.equal(response.status,504);assert.equal((await response.json()).error.code,'AI_TIMEOUT');
});
test('timeout remains active after 200 headers while the JSON body stream stalls', {timeout:2000},async()=>{
  let upstream,bodyRead=false,aborted=false;
  const f=fixture({timeoutMs:15,fetchImpl:async(_,options)=>{
    const stream=new ReadableStream({
      start(controller){
        controller.enqueue(new TextEncoder().encode('{"choices":'));
        options.signal.addEventListener('abort',()=>{aborted=true;controller.error(new DOMException('body cancelled','AbortError'));},{once:true});
      },
      pull(){bodyRead=true;}
    });
    upstream=new Response(stream,{status:200,headers:{'Content-Type':'application/json'}});
    return upstream;
  }});
  const response=await f.call();
  assert.equal(upstream.status,200);assert.equal(upstream.bodyUsed,true);assert.equal(bodyRead,true);
  assert.equal(aborted,true,'Receiving headers must not clear the deadline while reading the response');
  assert.equal(response.status,504);const data=await response.json();assert.equal(data.error.code,'AI_TIMEOUT');assert.equal(data.result,undefined);
});
test('Worker wires server AI provider without calling AI for public session check',async()=>{
  const response=await worker.fetch(new Request('https://tashan.test/api/v1/status'),{DEEPSEEK_API_KEY:'private-test-key'});
  assert.equal(response.status,200);assert.ok(!(await response.text()).includes('private-test-key'));
});
test('valid boundary context remains accepted',()=>{
  const context={core:'a'.repeat(6000),purpose:'b'.repeat(1500),audience:'c'.repeat(1500),prior:'d'.repeat(1000)};
  assert.equal(Object.values(validateAiInput({...input,context}).context).join('').length,10000);
});
