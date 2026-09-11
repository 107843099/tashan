// Actual two-step teacher workflow against isolated account/file storage.
// Only AI is stubbed; no real users, cloud projects or paid calls are created.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LocalProvider} from '../server/local-provider.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=await mkdtemp(join(tmpdir(),'tashan-upload-'));
const screenshots=join(tmpdir(),'tashan-upload-qa');await mkdir(screenshots,{recursive:true});
const provider=new LocalProvider(join(folder,'accounts.sqlite'));
const admin=await provider.bootstrap({username:'admin',password:'12345678',displayName:'管理员'});
await provider.createUser(admin,{username:'teacher',password:'12345678',displayName:'音乐教师',role:'member',affiliationType:'school',organizationName:'测试学校'});provider.close();
const origin='http://127.0.0.1:4187';
const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'4187',TASHAN_ACCOUNT_PROVIDER:'local',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'files')},stdio:['ignore','pipe','pipe']});
let browser,page;const errors=[];let aiCalls=0,layouts=0;
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server startup failed');})]);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const signed=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{username:'teacher',password:'12345678'}});assert.equal(signed.status(),200);
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 const suggestions={title:'节奏与重力实验',purpose:'观察运动中的节拍与节奏变化。',subject:'音乐',stage:'小学',audience:'教师操作，面向小学高年级学生。',prior:'理解节奏与节拍。',outcome:'通过观察和比较描述节拍变化。',setting:'教师投屏，学生拍手跟随节奏。'};
 await page.route('**/api/v1/ai/**',async route=>{
  const data=route.request().method()==='POST'?{task:'upload',result:{fields:suggestions},model:'test-fixture'}:{configured:true,model:'test-fixture',limits:{perMinute:3,perDay:30}};
  if(route.request().method()==='POST')aiCalls++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const source='<html><meta charset="utf-8"><body><h1>节奏与重力</h1><p>学生观察下落物体的位置，比较均匀节拍与运动加速的关系。</p><button>开始观察</button></body></html>';
 const capture=await context.newPage();await capture.setContent(source);const actualPreview=await capture.screenshot();await capture.close();
 const field=key=>page.locator('[data-draft="'+key+'"]');
 const next=()=>page.locator('[data-save-mode="cloud"]').click();
 const idle=()=>page.waitForFunction(()=>!window.TashanProjects.busy);
 await page.goto(origin+'/index.html#upload');await field('purpose').waitFor();
 assert.equal(await page.locator('.step-nav li').count(),2);
 await next();await page.locator('.upload-errors').waitFor();assert.equal(await page.locator('.upload-errors').evaluate(node=>node===document.activeElement),true);
 await page.locator('[data-error-field="title"]').click();assert.equal(await field('title').evaluate(node=>node===document.activeElement),true);
 await field('purpose').fill('教师自己填写的用途，AI 不应覆盖。');
 await page.locator('#upload-file').setInputFiles({name:'rhythm.html',mimeType:'text/html',buffer:Buffer.from(source)});
 await page.waitForFunction(()=>document.querySelector('[data-draft=title]')?.value==='节奏与重力实验');
 assert.equal(aiCalls,1);assert.equal(await field('purpose').inputValue(),'教师自己填写的用途，AI 不应覆盖。');
 for(const subject of ['音乐','美术','体育与健康'])assert.equal(await field('subject').locator('option[value="'+subject+'"]').count(),1);
 assert.equal(await field('runtimeStatus').inputValue(),'','AI must not claim it tested the project');
 await field('title').fill('教师修改后的节奏实验');
 await page.locator('#upload-image').setInputFiles({name:'actual-output.png',mimeType:'image/png',buffer:actualPreview});
 await field('runtimeStatus').selectOption('works');await field('practiceStatus').selectOption('author-tested');
 await page.getByText('补充年级、课程与参考来源（选填）',{exact:true}).click();
 await field('grade').fill('小学五年级');await field('curriculum').fill('音乐与科学跨学科活动');
 assert.equal(await page.locator('.upload-errors').count(),0,'Resolved validation errors disappear while editing');
 for(const width of [1440,390])for(const locale of ['zh-CN','zh-Hant','en'])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="'+locale+'"]').click();
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('[data-action="theme"]').click();
  assert.equal(await field('title').inputValue(),'教师修改后的节奏实验','Language/theme retains entered content');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),[width,locale,theme].join(' ')+' nooverflow');
  if(locale==='zh-CN'||locale==='en'&&width===390)await page.screenshot({path:join(screenshots,`details-${width}-${locale}-${theme}.png`),fullPage:true});layouts++;
 }
 await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="zh-CN"]').click();
 await next();await page.locator('.publication-choices').waitFor();assert.equal(await page.locator('[data-ai-slot]').count(),0);
 await next();await page.locator('.upload-errors').waitFor();assert.equal((await (await context.request.get(origin+'/api/v1/projects')).json()).total,0,'Missing attestations cause no upload');
 await field('license').selectOption('teach');for(const key of ['previewAuthentic','rightsConfirmed','privacyConfirmed','content'])await page.locator('[data-confirm="'+key+'"]').check();
 assert.equal(await page.locator('.upload-errors').count(),0,'Confirmed obligations clear their inline errors');
 await page.screenshot({path:join(screenshots,'review-mobile.png'),fullPage:true});
 await next();await page.waitForURL('**#cloud/local-**');await idle();
 assert.equal(await page.getByRole('dialog').count(),0,'Explicit final public selection skips redundant modal');
 const projectId=page.url().split('#cloud/')[1].split('/')[0];
 const publicList=await (await context.request.get(origin+'/api/v1/published')).json();assert.equal(publicList.total,1);
 const project=await (await context.request.get(origin+'/api/v1/projects/'+projectId)).json();
 const version=await (await context.request.get(origin+'/api/v1/projects/'+projectId+'/versions/'+project.project.publishedVersionId)).json();
 assert.equal(version.version.metadata.title,'教师修改后的节奏实验');assert.equal(version.version.metadata.grade,'小学五年级');assert.equal(version.version.metadata.runtimeStatus,'works');
 const guest=await browser.newContext();const publicRead=await guest.request.get(origin+'/api/v1/published/'+projectId+'/versions/'+project.project.publishedVersionId);assert.equal(publicRead.status(),200);assert.equal((await guest.request.get(origin+'/api/v1/projects/'+projectId)).status(),401);await guest.close();
 // Prompt workflow: educational extras are optional; actual output/tool/sequence are not.
 await page.goto(origin+'/index.html#desk');await page.locator('[data-action="new-project"]').click();await page.locator('[data-draft-kind="prompt"]').click();
 await field('title').fill('古诗画面描述 Prompt');await field('purpose').fill('帮助教师把古诗的意象整理为画面描述。');await field('core').fill('根据教师提供的古诗，先逐句识别意象，再生成一段画面描述，不添加原诗不存在的情节。');
 await page.locator('#upload-image').setInputFiles({name:'prompt-output-fixture.png',mimeType:'image/png',buffer:actualPreview});
 await next();assert.equal(await page.locator('[data-error-field="tested"]').count(),1);assert.equal(await page.locator('[data-error-field="stage"]').count(),0,'Prompt teaching extras areoptional');
 await field('tested').fill('Local AI fixture used for automated workflow test');await field('promptStructure').selectOption('sequence');await next();assert.equal(await page.locator('[data-error-field="dependencies"]').count(),1);
 await field('dependencies').fill('1. 提取意象；2. 在同一对话中引用上一步意象，生成画面描述。');await next();await page.locator('.publication-choices').waitFor();
 assert.equal(await page.locator('[data-confirm="humanReviewConfirmed"]').count(),1);
 await page.locator('[data-draft="publication"][value="private"]').check();await next();await page.waitForURL('**#cloud/local-**');await idle();
 const privateId=page.url().split('#cloud/')[1].split('/')[0];assert.notEqual(privateId,projectId);
 const privateProject=await (await context.request.get(origin+'/api/v1/projects/'+privateId)).json();assert.equal(privateProject.project.publishedVersionId,null);
 assert.equal((await (await context.request.get(origin+'/api/v1/published')).json()).total,1);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',layouts,aiCalls,verified:'Two steps, editable AI autofill, genuine-preview requirement, required-field focus, added subjects, metadata persistence, direct publication, anonymous access, Prompt dependencies, private cloud save',screenshots}));
}catch(error){if(page){console.error((await page.locator('#main').innerText()).slice(-2500));await page.screenshot({path:join(screenshots,'failure.png'),fullPage:true}).catch(()=>{});}throw error;
}finally{await browser?.close();server.kill();await rm(folder,{recursive:true,force:true});}
