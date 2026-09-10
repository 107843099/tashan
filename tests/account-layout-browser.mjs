// Isolated local browser acceptance: never connects to the user's browser or cloud.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LocalProvider} from '../server/local-provider.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=await mkdtemp(join(tmpdir(),'tashan-account-layout-'));
const screenshots=join(tmpdir(),'tashan-account-polish');await mkdir(screenshots,{recursive:true});
const provider=new LocalProvider(join(folder,'accounts.sqlite'));
const admin=await provider.bootstrap({username:'admin',password:'12345678',displayName:'他山管理员'});
const member=await provider.createUser(admin,{username:'classroom_teacher',password:'87654321',displayName:'陈老师 · 跨学科教学与课堂可视化实践',role:'member'});
const disabled=await provider.createUser(admin,{username:'disabled_teacher',password:'23456789',displayName:'已停用的测试教师',role:'member'});
await provider.updateUser(admin,disabled.id,{status:'disabled'});provider.close();
const origin='http://127.0.0.1:4183';
const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'4183',TASHAN_ACCOUNT_PROVIDER:'local',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'files')},stdio:['ignore','pipe','pipe']});
let browser,activePage;let layouts=0;const errors=[],network=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Local layout server did not start');})]);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 for(const view of ['admin','account']){
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/api/v1/'))network.push({path:new URL(response.url()).pathname,status:response.status()});});
  const signed=await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{username:view==='admin'?'admin':'classroom_teacher',password:view==='admin'?'12345678':'87654321'}});assert.equal(signed.status(),200);
  for(const width of [1440,390])for(const locale of ['zh-CN','zh-Hant','en'])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:width===390?844:1000});await page.goto(origin+'/index.html#'+view);await page.bringToFront();
   await page.locator('.account-page-heading h1').waitFor();
   await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="'+locale+'"]').click();
   if((await page.locator('html').getAttribute('data-theme')||'light')!==theme)await page.locator('[data-action="theme"]').click();
   if(view==='admin'){
    await page.locator('[data-account-action="edit-user"][data-user-id="'+member.id+'"]').click();
    await page.locator('[data-account-form="edit-user"]').waitFor();
   }
   const label=[view,width,locale,theme].join('-');
   await page.locator('#main').focus();
   assert.equal(await page.locator('#main').evaluate(node=>getComputedStyle(node).outlineStyle),'none',label+' programmatic main focus has no side lines');
   assert.equal(await page.locator('html').getAttribute('lang'),locale,label+' locale');
   const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert(bounds.scroll<=bounds.width+1,label+' must not overflow horizontally');
   const unnamed=await page.locator('.account-surface button').evaluateAll(buttons=>buttons.filter(button=>!button.hidden&&getComputedStyle(button).display!=='none'&&!((button.getAttribute('aria-label')||button.textContent||'').trim())).length);
   assert.equal(unnamed,0,label+' buttons have accessible names');
   if(view==='account'){
    assert.equal(await page.locator('a[href="#admin"]').count(),0,label+' member has no admin link');
    assert.equal(await page.locator('[data-account-action="logout"]').count(),1,label+' has one sign-out action');
    assert.equal(await page.locator('[name=newPassword]').getAttribute('minlength'),'8',label+' new password uses eight-character minimum');
   }
   await page.evaluate(()=>scrollTo(0,0));
   if(locale==='zh-CN'||(locale==='en'&&width===390))await page.screenshot({path:join(screenshots,label+'.png'),fullPage:true});
   layouts++;
  }
  if(view==='admin'){
   await page.locator('#account-status-filter').selectOption('disabled');
   assert.equal(await page.locator('[data-account-action="edit-user"][data-user-id="'+member.id+'"]').count(),0);
   assert.equal(await page.locator('[data-account-action="edit-user"][data-user-id="'+disabled.id+'"]').count(),1);
   await page.locator('#account-status-filter').selectOption('');
   assert.equal(await page.locator('[data-account-action="edit-user"][data-user-id="'+member.id+'"]').count(),1);
   await page.locator('.account-page-heading [data-account-action="new-user"]').click();
   const form=page.locator('[data-account-form="create-user"]');await form.locator('[name=username]').focus();await page.keyboard.press('Tab');
   assert.equal(await page.locator(':focus').getAttribute('name'),'displayName','keyboard tab proceeds through visible form fields');
   assert.notEqual(await page.locator(':focus').evaluate(node=>getComputedStyle(node).outlineStyle),'none','keyboard input retains a visible focus outline');
  }
  await context.close();
 }
 assert.deepEqual(errors,[],'No account-page runtime errors');
 console.log(JSON.stringify({layouts,locales:3,themes:2,widths:[390,1440],filters:true,keyboard:true,screenshots}));
}catch(error){
 if(activePage&&!activePage.isClosed()){
  await activePage.screenshot({path:join(screenshots,'failure.png'),fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({layouts,url:activePage.url(),network:network.slice(-16),ui:await activePage.evaluate(()=>({ready:window.TashanAccounts?.initialized,user:window.TashanAccounts?.user?.role,overlays:document.querySelectorAll('.stone-entrance').length,header:getComputedStyle(document.querySelector('.site-header')).visibility})).catch(()=>null)}));
 }
 throw error;
}finally{await browser?.close();server.kill('SIGTERM');await once(server,'exit').catch(()=>{});await rm(folder,{recursive:true,force:true});}
