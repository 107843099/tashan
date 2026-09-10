// Isolated local acceptance. No production browser, cloud account or AI generation calls.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LocalProvider} from '../server/local-provider.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=await mkdtemp(join(tmpdir(),'tashan-admin-ai-')),screenshots=join(tmpdir(),'tashan-admin-ai-polish');await mkdir(screenshots,{recursive:true});
const screenshotPath=name=>fileURLToPath(new URL(name+'.png',pathToFileURL(screenshots+'/')));
const provider=new LocalProvider(join(folder,'accounts.sqlite'));
const admin=await provider.bootstrap({username:'admin',password:'12345678',displayName:'他山管理员'});
const member=await provider.createUser(admin,{username:'teacher',password:'87654321',displayName:'陈老师 · 跨学科教学与课堂实践',role:'member',affiliationType:'school',organizationName:'山海学校 · School of Interdisciplinary Teaching'});
await provider.createUser(admin,{username:'partner',password:'23456789',displayName:'教师发展伙伴',role:'member',affiliationType:'organization',organizationName:'课程研究机构'});provider.close();
const origin='http://127.0.0.1:4187',server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'4187',TASHAN_ACCOUNT_PROVIDER:'local',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'files')},stdio:['ignore','pipe','pipe']}),exited=once(server,'exit');
let browser,page,layouts=0;const errors=[],writes=[];
try{
 await Promise.race([once(server.stdout,'data'),exited.then(()=>{throw new Error('Admin AI browser fixture server did not start');})]);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 assert.equal((await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{username:'admin',password:'12345678'}})).status(),200);
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='PATCH'&&request.url().includes('/admin/ai-prompts/'))writes.push(JSON.parse(request.postData()));});
 const taskButton=task=>page.locator('[data-account-action="ai-task"][data-task="'+task+'"]'),editor=()=>page.locator('[data-account-ai-editor]');
 async function setLanguage(locale){await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="'+locale+'"]').click();}
 async function readConfig(task){const response=await context.request.get(origin+'/api/v1/admin/ai-prompts');assert.equal(response.status(),200);return (await response.json()).prompts.find(item=>item.task===task);}
 await page.goto(origin+'/index.html#admin');await page.bringToFront();await page.locator('[data-account-action="ai-tab"]').click();await editor().waitFor();
 const uploadDraft='明确面向学生说明教学目标。\n保留课堂条件和来源。';await editor().fill(uploadDraft);await taskButton('teaching').click();await editor().fill('教学建议草稿');await taskButton('upload').click();assert.equal(await editor().inputValue(),uploadDraft);
 await setLanguage('en');assert.equal(await editor().inputValue(),uploadDraft);await page.locator('[data-action="theme"]').click();assert.equal(await editor().inputValue(),uploadDraft);await setLanguage('zh-CN');
 await page.locator('[data-ai-save]').click();await page.locator('[data-ai-feedback]').filter({hasText:'提示词已保存，下次调用生效。'}).waitFor();assert.equal((await readConfig('upload')).prompt,uploadDraft);
 const latest=await readConfig('upload');const external=await context.request.patch(origin+'/api/v1/admin/ai-prompts/upload',{headers:{Origin:origin},data:{prompt:'另一个会话保存的课堂说明',expectedRevision:latest.revision}});assert.equal(external.status(),200);
 const mine='本人保留的修订草稿';await editor().fill(mine);await page.locator('[data-ai-save]').click();await page.locator('.account-ai-conflict').waitFor();assert.equal(await editor().inputValue(),mine);assert.equal(await page.locator('[data-ai-save]').isDisabled(),true);
 await page.locator('[data-account-action="reload-ai-prompts"]').click();await page.locator('.account-ai-conflict pre').filter({hasText:'另一个会话保存的课堂说明'}).waitFor();assert.equal(await editor().inputValue(),mine);assert.equal(await page.locator('[data-ai-save]').isDisabled(),true);
 await page.locator('[data-account-action="rebase-ai-prompt"]').click();await page.locator('[data-ai-save]').click();await page.locator('[data-ai-feedback]').filter({hasText:'提示词已保存，下次调用生效。'}).waitFor();assert.equal((await readConfig('upload')).prompt,mine);
 await editor().fill('尚未保存的恢复前草稿');const before=writes.length;await page.locator('[data-account-action="reset-ai-prompt"]').click();await page.locator('.account-ai-confirm [value="cancel"]').click();assert.equal(writes.length,before);assert.equal(await editor().inputValue(),'尚未保存的恢复前草稿');
 await page.locator('[data-account-action="reset-ai-prompt"]').click();await page.locator('.account-ai-confirm [value="confirm"]').click();await page.locator('[data-ai-feedback]').filter({hasText:'已恢复默认，下次调用生效。'}).waitFor();assert.equal(writes.at(-1).prompt,null);const restored=await readConfig('upload');assert.equal(restored.isDefault,true);assert.equal(await editor().inputValue(),restored.defaultPrompt,'Restoring defaults also replaces the visible editor text');
 await editor().fill('</textarea><img src=x onerror=alert(1)>');await taskButton('teaching').click();await taskButton('upload').click();assert.equal(await editor().inputValue(),'</textarea><img src=x onerror=alert(1)>');assert.equal(await page.locator('.account-ai-editor img').count(),0);
 for(const view of ['users','ai'])for(const width of [1440,390])for(const locale of ['zh-CN','zh-Hant','en'])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===390?844:1000});await page.bringToFront();await setLanguage(locale);
  if((await page.locator('html').getAttribute('data-theme')||'light')!==theme)await page.locator('[data-action="theme"]').click();
  await page.locator('[data-account-action="'+(view==='users'?'users-tab':'ai-tab')+'"]').click();
  if(view==='users'){
   await page.locator('[data-account-action="edit-user"][data-user-id="'+member.id+'"]').click();
   assert.equal(await page.locator('.account-people-table tr.is-selected').count(),1);assert.equal(await page.locator('[name=organizationName]').inputValue(),'山海学校 · School of Interdisciplinary Teaching');
   if(width===390){const box=await page.locator('.account-editor').boundingBox();assert(box.y>=0&&box.y<200,'Mobile selection scrolls to the editor');await page.locator('[data-account-action="close-editor"]').click();const listBox=await page.locator('.account-list').boundingBox();assert(listBox.y>=0&&listBox.y<200,'Back to list restores the list position');await page.locator('[data-account-action="edit-user"][data-user-id="'+member.id+'"]').click();}
  }else{await taskButton('upload').click();assert.equal(await editor().inputValue(),'</textarea><img src=x onerror=alert(1)>');}
  const label=[view,width,locale,theme].join('-');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' does not overflow');
  const unnamed=await page.locator('.account-admin button').evaluateAll(buttons=>buttons.filter(button=>!((button.getAttribute('aria-label')||button.textContent||'').trim())).length);assert.equal(unnamed,0,label+' controls have names');
  if(locale==='zh-CN'||locale==='en'&&width===390)await page.screenshot({path:screenshotPath(label),fullPage:true});layouts++;
 }
 await page.locator('[data-account-ai-editor]').focus();assert.notEqual(await editor().evaluate(node=>getComputedStyle(node).outlineStyle),'none','Editor keyboard focus is visible');
 const memberContext=await browser.newContext();assert.equal((await memberContext.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{username:'teacher',password:'87654321'}})).status(),200);assert.equal((await memberContext.request.get(origin+'/api/v1/admin/ai-prompts')).status(),403);const memberPage=await memberContext.newPage();await memberPage.goto(origin+'/index.html#admin');assert.equal(await memberPage.locator('[data-account-action="ai-tab"]').count(),0);await memberContext.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({layouts,features:3,draftPersistence:true,save:true,conflictReview:true,resetConfirmation:true,mobileEditorNavigation:true,memberDenied:true,screenshots}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:screenshotPath('failure'),fullPage:true}).catch(()=>{});throw error;}
finally{await browser?.close();if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');await exited.catch(()=>{});await rm(folder,{recursive:true,force:true});}
