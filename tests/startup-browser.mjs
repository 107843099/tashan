// Performance-related behavior, using isolated accounts and browser storage.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LocalProvider} from '../server/local-provider.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=await mkdtemp(join(tmpdir(),'tashan-startup-'));
const provider=new LocalProvider(join(folder,'accounts.sqlite'));
await provider.bootstrap({username:'admin',password:'12345678',displayName:'管理员'});provider.close();
const origin='http://127.0.0.1:4188';
const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'4188',TASHAN_ACCOUNT_PROVIDER:'local',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'files')},stdio:['ignore','pipe','pipe']}),exited=once(server,'exit');
let browser;
try{
 await Promise.race([once(server.stdout,'data'),exited.then(()=>{throw new Error('Startup fixture did not start');})]);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],graphics=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/entry-stone-scene|three.*\.js/.test(request.url()))graphics.push(request.url());});
 assert.equal((await context.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin},data:{username:'admin',password:'12345678'}})).status(),200);
 let releaseSession;const sessionGate=new Promise(resolve=>{releaseSession=resolve;});
 await page.route('**/api/v1/auth/session',async route=>{await sessionGate;await route.continue();});
 await page.goto(origin+'/index.html#discover',{waitUntil:'domcontentloaded'});
 await page.locator('.session-loading').waitFor();assert.equal(await page.locator('.stone-entrance').count(),0);assert.deepEqual(graphics,[]);
 releaseSession();await page.locator('.project-card--discovery').first().waitFor();await page.unroute('**/api/v1/auth/session');await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('.stone-entrance').count(),0);assert.deepEqual(graphics,[],'Restored accounts do not load 3D');
 const search=page.locator('#search-form input, .search-form input').first();await search.fill('尚未提交的课堂想法');const original=await search.elementHandle();
 await page.locator('[data-action="theme"]').click();assert.equal(await search.inputValue(),'尚未提交的课堂想法');assert(await original.evaluate(node=>node.isConnected),'Theme changes preserve the active DOM');
 await page.reload();await page.locator('.project-card--discovery').first().waitFor();await page.waitForLoadState('networkidle');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(graphics,[]);
 const poetry=page.locator('[data-project="poetry"] img');await poetry.scrollIntoViewIfNeeded();await poetry.evaluate(image=>image.decode());assert.match(await poetry.evaluate(image=>image.currentSrc),/poetry-example-(320|640|960)\.webp/);
 await page.goto(origin+'/index.html#project/poetry');await page.locator('.image-preview-button').waitFor();assert(await page.locator('.image-preview-button img').getAttribute('srcset'));await page.locator('.image-preview-button').click();await page.locator('.image-dialog-body img').waitFor();assert.match(await page.locator('.image-dialog-body img').getAttribute('src'),/\.png$/,'The full image still uses the original');
 const guest=await browser.newContext({reducedMotion:'reduce'}),guestPage=await guest.newPage(),guestGraphics=[];
 guestPage.on('request',r=>{if(/entry-stone-scene|three.*\.js/.test(r.url()))guestGraphics.push(r.url());});
 await guestPage.goto(origin+'/index.html#login');await guestPage.locator('[data-account-form="login"]').waitFor();assert.deepEqual(guestGraphics,[],'Reduced motion uses the lightweight stone');
 await guestPage.locator('[data-account-action="guest"]').click();await guestPage.locator('.project-card--discovery').first().waitFor();await guestPage.reload();await guestPage.locator('.project-card--discovery').first().waitFor();assert.deepEqual(guestGraphics,[]);assert.equal(await guestPage.locator('.stone-entrance').count(),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({restoredSessionSkips3D:true,themePreservesInput:true,themePersists:true,responsivePreviews:true,originalImagePreserved:true,reducedMotionSkips3D:true,guestRefreshSkips3D:true}));
 await guest.close();await context.close();
}finally{await browser?.close();if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');await exited.catch(()=>{});await rm(folder,{recursive:true,force:true});}
