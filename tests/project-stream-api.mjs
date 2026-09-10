import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handleApi,ApiError} from '../server/api.mjs';
import {handleProjectRequest,workerUploadPolicy,normalizeProjectVersion,sha256} from '../server/projects-api.mjs';
import {createSupabaseProjectsProvider} from '../server/supabase-projects.mjs';
const origin='https://tashan.test',id='local-01234567-89ab-4cde-8fab-0123456789ab',vid='version-stream-test';
const user={id:'01234567-89ab-4cde-8fab-0123456789ab',status:'active',role:'member',mustChangePassword:false};
const settings={TASHAN_UPLOAD_TRANSPORT:'r2-stream-v1',TASHAN_UPLOAD_REQUEST_BYTES:'98304',TASHAN_UPLOAD_METADATA_BYTES:'65536',TASHAN_UPLOAD_ATTACHMENT_BYTES:'10485760',TASHAN_UPLOAD_COVER_BYTES:'5242880'};
const policy=workerUploadPolicy(settings),fingerprint='a'.repeat(64);
const payload=()=>({projectCode:'TS-L-0123456789AB4CDE',version:{id:vid,number:1,createdAt:'2026-09-11T00:00:00Z'},metadata:{id,title:'重力课堂',kind:'visual'},files:{attachment:{name:'gravity.html',type:'text/html',size:10485760,sha256:'b'.repeat(64)}}});
function fixture({stream=true,rateLimited=false,actor=user,uploadPolicy=policy}={}){
 const calls=[],rateCounts=new Map();
 const provider={status:async()=>({configured:true,mode:'supabase',...(stream?{uploadTransport:'r2-stream-v1'}:{})}),rateLimit:async()=>{},
  prepareUpload:async(actor,snapshot)=>{calls.push({action:'prepare',actor,snapshot});return {ready:false,fingerprint:snapshot.fingerprint};},
  uploadFile:async(actor,p,v,f,hash,request,limits)=>{calls.push({action:'file',actor,p,v,f,hash,request,limits});return {uploaded:true};},
  commitUpload:async(actor,p,v,hash)=>{calls.push({action:'commit',actor,p,v,hash});return {created:true,project:{id:p},version:{id:v,number:1,createdAt:'2026-09-11T00:00:00Z',metadata:{},files:{}}};},
  unpublish:async(actor,p)=>{calls.push({action:'unpublish',actor,p});return {id:p,publishedVersionId:null};}};
 const accounts={status:async()=>({configured:true}),authenticate:async()=>({user:actor}),rateLimit:async(key,{limit,windowSeconds})=>{
  if(!rateLimited)return;assert.equal(windowSeconds,60);const count=(rateCounts.get(key)||0)+1;rateCounts.set(key,count);
  if(count>limit)throw new ApiError(429,'RATE_LIMITED','Fixture rate limit exceeded');
 }};
 const request=(path,{method='POST',data,body,headers={},guest=false}={})=>new Request(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(!guest?{Cookie:'tashan_access=fixture'}:{}),...headers},body:body??(data===undefined?undefined:JSON.stringify(data))});
 const run=async(req)=>{const response=await handleApi(req,accounts,{projectsProvider:provider,projectUploadPolicy:uploadPolicy});return {status:response.status,data:await response.json()};};
 return {calls,provider,request,run,rateCounts};
}
test('R2 capability fails closed without its binding and rejects the large JSON alternate before reading',async()=>{
 for(const stream of [true,false]){const f=fixture({stream});const cap=await f.run(f.request('/projects/capabilities',{method:'GET'}));assert.equal(cap.data.canUpload,stream);assert.equal(cap.data.uploadTransport,'r2-stream-v1');}
 const f=fixture(),req=f.request(`/projects/${id}/versions`,{body:'unread bytes'});
 const r=await f.run(req);assert.equal(r.status,415);assert.equal(r.data.error.code,'STREAM_UPLOAD_REQUIRED');assert.equal(req.bodyUsed,false);assert.equal(f.calls.length,0);
});
test('small manifest reserves a 10 MiB attachment without decoding or trusting a supplied fingerprint',async()=>{
 const f=fixture(),r=await f.run(f.request(`/projects/${id}/uploads`,{data:payload()}));assert.equal(r.status,200);assert.match(r.data.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(f.calls[0].snapshot.files.attachment.size,10485760);assert.equal(f.calls[0].snapshot.files.attachment.bytes,undefined);
 const extra={...payload(),fingerprint};assert.equal((await f.run(f.request(`/projects/${id}/uploads`,{data:extra}))).status,400);
 const tooLarge=payload();tooLarge.files.attachment.size++;assert.equal((await f.run(f.request(`/projects/${id}/uploads`,{data:tooLarge}))).status,413);assert.equal(f.calls.length,1);
});
test('manifest validation rejects missing hash, encoded content, invalid extension and oversized text',async()=>{
 const variants=[p=>delete p.files.attachment.sha256,p=>p.files.attachment.base64='AAAA',p=>p.files.attachment.name='escape.exe',p=>p.files.attachment.size=-1];
 for(const mutate of variants){const p=payload();mutate(p);await assert.rejects(normalizeProjectVersion(id,p,policy.limits,{manifest:true}),e=>e.status===400);}
 const large=payload();large.metadata.core='教'.repeat(22000);await assert.rejects(normalizeProjectVersion(id,large,policy.limits,{manifest:true}),e=>e.status===413);
});
test('raw PUT traverses account auth and Origin checks, keeps body unread for native R2, requires fingerprint',async()=>{
 const f=fixture(),path=`/projects/${id}/versions/${vid}/files/attachment`;
 const req=f.request(path,{method:'PUT',body:'raw',headers:{'Content-Type':'text/html','X-Tashan-Fingerprint':fingerprint}});
 assert.equal((await f.run(req)).status,200);assert.equal(req.bodyUsed,false);assert.equal(f.calls[0].request,req);assert.equal(f.calls[0].hash,fingerprint);
 for(const [options,status]of [[{guest:true},401],[{headers:{Origin:'https://evil.test','X-Tashan-Fingerprint':fingerprint}},403],[{},400]]){assert.equal((await f.run(f.request(path,{method:'PUT',body:'raw',...options}))).status,status);}
 assert.equal(f.calls.length,1);
});
test('commit accepts only an owner-authenticated canonical fingerprint and returns immutable version response',async()=>{
 const f=fixture(),path=`/projects/${id}/versions/${vid}/commit`;
 assert.equal((await f.run(f.request(path,{data:{fingerprint}}))).status,201);
 for(const data of [{fingerprint:'x'},{fingerprint,ready:true},null,[]])assert.equal((await f.run(f.request(path,{data}))).status,400);
 assert.equal(f.calls.length,1);
});

test('four complete uploads with covers do not spend their commit allowance on file requests',async()=>{
 const f=fixture({rateLimited:true});
 for(let number=1;number<=4;number++){
  const input=payload(),versionId=vid+'-'+number;input.version={...input.version,id:versionId,number};
  input.files.coverFile={name:'cover.png',type:'image/png',size:12,sha256:'c'.repeat(64)};
  const prepare=await f.run(f.request(`/projects/${id}/uploads`,{data:input}));assert.equal(prepare.status,200,'prepare v'+number);
  for(const field of ['attachment','coverFile']){
   const file=await f.run(f.request(`/projects/${id}/versions/${versionId}/files/${field}`,{method:'PUT',body:'isolated file fixture',headers:{'Content-Type':'application/octet-stream','X-Tashan-Fingerprint':prepare.data.fingerprint}}));
   assert.equal(file.status,200,field+' v'+number);
  }
  const commit=await f.run(f.request(`/projects/${id}/versions/${versionId}/commit`,{data:{fingerprint:prepare.data.fingerprint}}));
  assert.equal(commit.status,201,'commit v'+number+' after all files uploaded');
 }
 assert.equal(f.calls.filter(call=>call.action==='prepare').length,4);assert.equal(f.calls.filter(call=>call.action==='file').length,8);assert.equal(f.calls.filter(call=>call.action==='commit').length,4);
});

test('stream start, file and commit quotas are independently bounded at 15, 30 and 15 requests',async()=>{
 const stages=[
  {name:'prepare',limit:15,status:200,request:f=>f.request(`/projects/${id}/uploads`,{data:payload()})},
  {name:'file',limit:30,status:200,request:f=>f.request(`/projects/${id}/versions/${vid}/files/attachment`,{method:'PUT',body:'raw fixture',headers:{'Content-Type':'text/html','X-Tashan-Fingerprint':fingerprint}})},
  {name:'commit',limit:15,status:201,request:f=>f.request(`/projects/${id}/versions/${vid}/commit`,{data:{fingerprint}})}
 ];
 for(const stage of stages){
  const f=fixture({rateLimited:true});
  for(let i=0;i<stage.limit;i++)assert.equal((await f.run(stage.request(f))).status,stage.status,stage.name+' #'+(i+1));
  const before=f.calls.length,limited=await f.run(stage.request(f));assert.equal(limited.status,429,stage.name);assert.equal(limited.data.error.code,'RATE_LIMITED');assert.equal(f.calls.length,before,'Limited requests must not reach the project provider');
  for(const other of stages.filter(item=>item!==stage))assert.equal((await f.run(other.request(f))).status,other.status,stage.name+' quota must not exhaust '+other.name);
 }
});

test('dedicated stream quotas preserve Origin, guest, disabled-account and reset-password checks',async()=>{
 const stages=f=>[
  options=>f.request(`/projects/${id}/uploads`,{data:payload(),...options}),
  options=>f.request(`/projects/${id}/versions/${vid}/files/attachment`,{method:'PUT',body:'raw fixture',headers:{'Content-Type':'text/html','X-Tashan-Fingerprint':fingerprint},...options}),
  options=>f.request(`/projects/${id}/versions/${vid}/commit`,{data:{fingerprint},...options})
 ];
 const guest=fixture({rateLimited:true});for(const build of stages(guest)){const request=build({guest:true});assert.equal((await guest.run(request)).status,401);assert.equal(request.bodyUsed,false);}assert.equal(guest.calls.length,0);
 const cross=fixture({rateLimited:true});for(const build of stages(cross)){const request=build({headers:{Origin:'https://other.test','X-Tashan-Fingerprint':fingerprint}});assert.equal((await cross.run(request)).status,403);assert.equal(request.bodyUsed,false);}assert.equal(cross.calls.length,0);assert.equal(cross.rateCounts.size,0,'Origin rejects before any authenticated quota');
 for(const [actor,status] of [[{...user,status:'disabled'},401],[{...user,mustChangePassword:true},403]]){
  const f=fixture({rateLimited:true,actor});for(const build of stages(f)){const request=build();assert.equal((await f.run(request)).status,status);assert.equal(request.bodyUsed,false);}assert.equal(f.calls.length,0);
 }
});

test('ordinary writes keep their existing quota and do not consume stream-stage allowances',async()=>{
 for(const uploadPolicy of [policy,{...policy,transport:'json-inline-v1'}]){
  const f=fixture({rateLimited:true,uploadPolicy});
  const request=()=>f.request(`/projects/${id}/publication`,{method:'DELETE',data:{expectedVersionId:null}});
  for(let i=0;i<15;i++)assert.equal((await f.run(request())).status,200);
  assert.equal((await f.run(request())).status,429);assert.equal(f.calls.filter(call=>call.action==='unpublish').length,15);
  if(uploadPolicy.transport==='r2-stream-v1')assert.equal((await f.run(f.request(`/projects/${id}/uploads`,{data:payload()}))).status,200);
 }
});
test('R2 downloads verify stored digest, size and immutable object version; legacy Supabase downloads remain available',async()=>{
 const bytes=new TextEncoder().encode('stored source'),hash=await sha256(bytes),digest=await crypto.subtle.digest('SHA-256',bytes);
 let backend='r2',objectVersion='r2-version',actualVersion='r2-version',requests=[];
 const file={name:'source.html',type:'text/html',size:bytes.length,sha256:hash,objectKey:user.id+'/'+hash};
 const provider=createSupabaseProjectsProvider({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',TASHAN_PROJECT_FILES:{get:async()=>({size:bytes.length,version:actualVersion,checksums:{sha256:digest},body:new Response(bytes).body})}},{fetch:async(url)=>{requests.push(url);return url.includes('/rpc/')?Response.json({...file,storageBackend:backend,objectVersion}):new Response(bytes);}});
 assert.equal(await new Response((await provider.getFile(user,id,vid,'attachment')).body).text(),'stored source');assert.equal(requests.length,1);
 actualVersion='changed';await assert.rejects(provider.getFile(user,id,vid,'attachment'),e=>e.code==='STORED_FILE_MISMATCH');
 backend='supabase';requests=[];assert.equal(await new Response((await provider.getFile(user,id,vid,'attachment')).body).text(),'stored source');assert.match(requests[1],/storage\/v1\/object\/authenticated/);
});
