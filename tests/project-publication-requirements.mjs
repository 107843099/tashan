import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {LocalProvider} from '../server/local-provider.mjs';
import {LocalProjectsProvider} from '../server/local-projects.mjs';
import {handleProjectRequest,normalizeProjectVersion} from '../server/projects-api.mjs';
import {ApiError} from '../server/api.mjs';
import {publicationMetadata} from './fixtures/project-publication.mjs';

const rules = globalThis.TashanProjectRequirements;
const origin = 'https://tashan.example.test',id = 'local-publication-requirements',versionId = 'version-publish-1';
const files = {attachment:{name:'project.html',type:'text/html',size:25},coverFile:{name:'output.gif',type:'image/gif',size:26}};
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=';
const fields = (metadata,attachments=files,phase='publish') => rules.errors(metadata,attachments,{phase}).map(error=>error.field);
const snapshot = (metadata,number=1) => ({version:{id:`version-publish-${number}`,number,createdAt:'2026-09-11T09:00:00Z'},metadata:{id,...metadata},files:{attachment:{name:'gravity.html',type:'text/html',base64:Buffer.from('<h1>Gravity experiment</h1>').toString('base64')},coverFile:{name:'actual-preview.png',type:'image/png',base64:png}}});

test('browser and server use identical requirements and Blob or committed file descriptors',async()=>{
  const window={},context=vm.createContext({window,URL});
  vm.runInContext(await readFile(new URL('../assets/js/project-requirements.js',import.meta.url),'utf8'),context);
  const browserRules=window.TashanProjectRequirements;
  assert.deepEqual(JSON.parse(JSON.stringify(browserRules.errors({},{}))),rules.errors({},{}));
  const browserFiles=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,{name:file.name,type:file.type,blob:new Blob(['preview fixture'],{type:file.type})}]));
  assert.deepEqual(fields(publicationMetadata(),browserFiles),[]);
  assert.equal(browserRules.errors(publicationMetadata(),browserFiles).length,0);
  for (const subject of ['音乐','美术','体育与健康','英语','科学','劳动']) assert.equal(fields({...publicationMetadata(),subject}).length,0,subject);
});

test('visualization needs an obtainable asset, real preview and each teaching judgment',()=>{
  const visual=publicationMetadata();
  assert.deepEqual(fields(visual),[]);
  assert(fields({...visual,core:'课堂项目成果说明'},{}).includes('projectUrl'));
  assert(!fields({...visual,projectUrl:'https://example.test/demo'},{coverFile:files.coverFile}).includes('projectUrl'));
  assert(!fields({...visual,core:'https://example.test/legacy-demo'},{coverFile:files.coverFile}).includes('projectUrl'));
  for(const value of ['javascript:alert(1)','file:///tmp/demo.html','/relative.html','https://user:password@example.test/']) assert(fields({...visual,projectUrl:value},{coverFile:files.coverFile}).includes('projectUrl'),value);
  assert(fields({...visual,source:'https://example.test/reference'},{coverFile:files.coverFile}).includes('projectUrl'),'A reference citation is not automatically a project download');
  assert(fields(visual,{...files,attachment:{...files.attachment,size:0}}).includes('projectUrl'));
  for(const field of ['title','purpose','subject','stage','audience','prior','outcome','setting','runtimeStatus','practiceStatus']) assert(fields({...visual,[field]:''},files,'details').includes(field),field);
  assert(fields({...visual,practiceStatus:'classroom',record:''}).includes('record'));
  assert.deepEqual(fields({...visual,practiceStatus:'classroom',record:'在初一课堂演示后讨论预测结果'}),[]);
  assert.deepEqual(fields({...visual,runtimeStatus:'issues',practiceStatus:'not-tested'}),[],'Reported issues remain explicit; this is not a platform verification badge');
  assert(!fields({...visual,grade:'',curriculum:''}).length,'Grade and curriculum are optional');
});

test('visual videos are allowed; Prompt requires actual image/GIF output and tested tool',()=>{
  const visual={...publicationMetadata(),previewUrl:'https://example.test/real-recording'},prompt=publicationMetadata('prompt');
  assert.deepEqual(fields(visual,{attachment:files.attachment}),[]);
  assert(fields({...visual,previewUrl:'javascript:bad'},{attachment:files.attachment}).includes('previewUrl'));
  assert(fields({...prompt,previewUrl:visual.previewUrl},{attachment:files.attachment}).includes('coverFile'));
  assert(fields(prompt,{coverFile:{...files.coverFile,type:'text/html'}}).includes('coverFile'));
  assert.deepEqual(fields(prompt,{coverFile:files.coverFile}),[],'Prompt subject, stage and teaching extensions are optional');
  for(const value of ['', '未测试','unknown','not tested']) assert(fields({...prompt,tested:value}).includes('tested'));
  assert(fields({...prompt,core:' '}).includes('core'));
  assert(fields({...prompt,promptStructure:''}).includes('promptStructure'));
  assert(fields({...prompt,promptStructure:'sequence',dependencies:''}).includes('dependencies'));
  assert.deepEqual(fields({...prompt,promptStructure:'sequence',dependencies:'先依次执行第一、二条；第二条在同一对话沿用第一条的画面描述。'}),[]);
});

test('AI suggestions and truthy values cannot silently confirm publication responsibilities',()=>{
  for(const kind of ['visual','prompt']) {
    const metadata=publicationMetadata(kind);
    for(const field of ['previewAuthentic','rightsConfirmed','privacyConfirmed','content',...(kind==='prompt'?['humanReviewConfirmed']:[])]) {
      for(const value of [undefined,false,'true',1,{},[]]) assert(fields({...metadata,[field]:value}).includes(field),`${kind} ${field} ${String(value)}`);
      assert(!fields({...metadata,[field]:false},files,'details').includes(field),'Teacher responsibility is confirmed on the final step');
    }
    assert(fields({...metadata,license:'unconfirmed'}).includes('license'));
  }
});

test('private snapshot accepts a project URL without an attachment or invented description',async()=>{
  const value=snapshot({...publicationMetadata(),projectUrl:'https://example.test/project'});delete value.files.attachment;
  const normalized=await normalizeProjectVersion(id,value);
  assert.equal(normalized.metadata.projectUrl,'https://example.test/project');
  assert.deepEqual(rules.errors(normalized.metadata,normalized.files),[]);
});

test('API blocks publish-request bypass, preserves private saving, ownership and legacy reading',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'tashan-publication-'));
  const accounts=new LocalProvider(join(directory,'accounts.sqlite')),provider=new LocalProjectsProvider(accounts,{filesDir:join(directory,'files')});
  const admin=await accounts.bootstrap({username:'admin',password:'12345678',displayName:'Fixture admin'});
  const member=await accounts.createUser(admin,{username:'teacher',password:'12345678',displayName:'Fixture teacher',role:'member'});
  async function call(path,{method='GET',data,user=member}={}) {
    const request=new Request(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:origin},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const response=await handleProjectRequest(request,{user,provider});return {status:response.status,data:await response.json()};
  }
  try {
    const incomplete={kind:'visual',title:'尚待教师确认',core:'一个重力实验'};
    assert.equal((await call(`/projects/${id}/versions`,{method:'POST',data:snapshot(incomplete)})).status,201,'Incomplete work can be stored privately');
    const publish={versionId,expectedVersionId:null,metadata:publicationMetadata(),files};
    const blocked=await call(`/projects/${id}/publish`,{method:'POST',data:publish});
    assert.equal(blocked.status,422);assert.equal(blocked.data.error.code,'PUBLICATION_INCOMPLETE');
    assert(blocked.data.error.fields.some(error=>error.field==='rightsConfirmed'));
    assert.equal((await call(`/projects/${id}`)).data.project.publishedVersionId,null);
    const foreign=await call(`/projects/${id}/publish`,{method:'POST',data:publish,user:admin});
    assert.equal(foreign.status,404);assert.equal(foreign.data.error.fields,undefined,'Validation does not disclose another owner’s private missing fields');
    await provider.publish(member,id,{versionId,expectedVersionId:null}); // Existing legacy publication fixture.
    assert.equal((await call(`/published/${id}/versions/${versionId}`,{user:null})).status,200,'Existing published snapshots stay readable');
    assert.equal((await call(`/projects/${id}/publish`,{method:'POST',data:{versionId,expectedVersionId:versionId}})).status,422,'Legacy reads do not become a new-publication bypass');
    assert.equal((await call(`/projects/${id}/versions`,{method:'POST',data:snapshot(publicationMetadata(),2)})).status,201);
    const completed=await call(`/projects/${id}/publish`,{method:'POST',data:{versionId:'version-publish-2',expectedVersionId:versionId}});
    assert.equal(completed.status,200,JSON.stringify(completed.data));
    const visible=await call(`/published/${id}/versions/version-publish-2`,{user:null});
    assert.equal(visible.status,200);assert.equal(visible.data.version.metadata.runtimeStatus,'works');
    assert.equal(visible.data.version.metadata.rightsConfirmed,true);
  } finally {accounts.close();await rm(directory,{recursive:true,force:true});}
});

test('an unfinished or unavailable owned version never reaches the publication write',async()=>{
  let writes=0;
  const provider={status:async()=>({configured:true}),getVersion:async()=>{throw new ApiError(409,'UPLOAD_INCOMPLETE','Files are not ready');},publish:async()=>{writes++;}};
  const request=new Request(origin+`/api/v1/projects/${id}/publish`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({versionId,expectedVersionId:null})});
  const response=await handleProjectRequest(request,{user:{id:'owner',status:'active'},provider});
  assert.equal(response.status,409);assert.equal(writes,0);
});
