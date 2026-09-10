// Optional end-to-end check: install Playwright, or set PLAYWRIGHT_MODULE to its entry module.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { LocalProvider } from '../server/local-provider.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const folder = await mkdtemp(join(tmpdir(), 'tashan-browser-'));
const provider = new LocalProvider(join(folder, 'accounts.sqlite'));
await provider.bootstrap({ username:'admin', password:'12345678', displayName:'管理员' });
provider.close();
const origin = 'http://127.0.0.1:4181';
const server = spawn(process.execPath, ['scripts/dev-server.mjs'], { env:{...process.env,PORT:'4181',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'project-files')}, stdio:['ignore','pipe','pipe'] });
const serverExited=once(server,'exit');
let browser;
try {
  await Promise.race([once(server.stdout, 'data'), serverExited.then(() => { throw new Error('Browser test server failed to start.'); })]);
  browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {}) });
  const context = await browser.newContext({ viewport:{width:1440,height:900}, reducedMotion:'no-preference' });
  const page = await context.newPage(), errors=[];
  page.on('pageerror', error => errors.push(error.message));
  const scene = () => page.locator('.stone-entrance[data-mode="auth"]');
  const form = () => scene().locator('[data-account-form="login"]');
  const loginButton = () => form().getByRole('button', {name:'登录，凿开新知',exact:true});
  async function captureEntryMotion(target) {
    await target.evaluate(() => {
      const nativeTimeout=window.setTimeout,overlay=document.querySelector('.stone-entrance'),ui=document.getElementById('practice-ui');
      const report={reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,schedules:[],phases:[],arrival:false,leaving:false};let running='';
      // Observe requested delays; original callbacks, real time and authentication still run.
      window.setTimeout=function(callback,delay,...args){
        const name=typeof callback==='function'?callback.name:'',entryCallback=name==='carve'||name==='finish';
        if(entryCallback||running)report.schedules.push({callback:name,owner:running,delay:Number(delay)});
        const original=callback;
        if(entryCallback)callback=function(...params){const previous=running;running=name;try{return original.apply(this,params);}finally{running=previous;}};
        return nativeTimeout.call(window,callback,delay,...args);
      };
      const observer=new MutationObserver(()=>{
        const phase=overlay.dataset.phase;if(!report.phases.includes(phase))report.phases.push(phase);
        report.arrival ||= ui.classList.contains('entrance-arrival');report.leaving ||= overlay.classList.contains('is-leaving');
      });
      observer.observe(overlay,{attributes:true,attributeFilter:['data-phase','class']});observer.observe(ui,{attributes:true,attributeFilter:['class']});
      window.__finishEntryMotionCapture=()=>{window.setTimeout=nativeTimeout;observer.disconnect();delete window.__finishEntryMotionCapture;return report;};
    });
  }
  const finishEntryMotionCapture=target=>target.evaluate(()=>window.__finishEntryMotionCapture());
  async function waitForEntry() {
    await page.waitForURL('**#discover');
    await page.waitForFunction(() => !document.querySelector('.stone-entrance') && !document.documentElement.classList.contains('entrance-open') && !document.getElementById('practice-ui').classList.contains('entrance-arrival'));
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'Successful entry starts at the top');
  }
  async function expectLoginScene() {
    await scene().getByRole('heading', {name:'欢迎回到他山',exact:true}).waitFor();
    assert.equal(await scene().getAttribute('data-phase'), 'waiting', 'Authentication waits inside the stone scene');
    assert.equal(await form().count(), 1, 'There is one login form, embedded in the entrance');
    assert.equal(await page.locator('#practice-ui [data-account-form="login"]').count(), 0, 'No duplicate login card behind the scene');
  }
  await page.goto(origin + '/index.html#discover');
  await expectLoginScene();
  await page.screenshot({path:'/tmp/tashan-stone-login.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile login must not overflow horizontally');
  assert.equal(await loginButton().isVisible(), true, 'The mobile sign-in action remains visible');
  await page.screenshot({path:'/tmp/tashan-stone-login-mobile.png'});
  await page.setViewportSize({width:1440,height:900});

  // Guest access is explicit and read-only, and survives a refresh in this tab.
  await scene().locator('[data-account-action="guest"]').click();
  await waitForEntry();
  assert.equal(await page.locator('.project-card--discovery').count(), 14);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('tashan-guest-entry')), '1');
  await page.reload();
  await page.locator('.project-card--discovery').first().waitFor();
  assert.equal(await page.locator('.stone-entrance[data-mode="auth"]').count(), 0, 'Refreshing a guest session must not reopen login');
  const guestBookmarks = await page.evaluate(() => localStorage.getItem('practice-library-bookmarks'));
  await page.locator('.project-card--discovery .card-bookmark').first().click();
  await expectLoginScene();
  assert.equal(await page.evaluate(() => localStorage.getItem('practice-library-bookmarks')), guestBookmarks, 'Guest bookmark attempts do not write personal state');
  await scene().locator('[data-account-action="guest"]').click();
  await waitForEntry();
  await page.locator('.main-nav a[href="#desk"]').click();
  await expectLoginScene();
  assert.equal(await page.locator('.desk-layout').count(), 0, 'Private workbench content stays behind login');

  // Wrong passwords leave the same visible scene waiting, without carving.
  const waitingScene = await scene().elementHandle();
  await form().locator('[name=username]').fill('admin');
  await form().locator('[name=password]').fill('wrong');
  await loginButton().click();
  await form().getByRole('alert').filter({hasText:'请检查用户名和密码'}).waitFor();
  assert.equal(await scene().getAttribute('data-phase'), 'waiting', 'Invalid passwords never carve the stone');
  assert.equal(await scene().getAttribute('data-automatic'), null, 'Invalid passwords do not start automatic entry');
  assert.equal(await waitingScene.evaluate(node => node.isConnected && node === document.querySelector('.stone-entrance')), true, 'An error updates the form without replacing the scene');
  const waitingCanvas = await scene().locator('canvas').elementHandle();
  await captureEntryMotion(page);
  await form().locator('[name=password]').fill('12345678');
  await loginButton().click();
  await page.locator('.stone-entrance[data-automatic=true]').waitFor();
  assert.equal(await waitingScene.evaluate(node => node.isConnected && node === document.querySelector('.stone-entrance')), true, 'Successful verification reuses the authentication scene');
  // A WebGL-capable browser keeps its rendered canvas; the SVG fallback is also supported.
  if (waitingCanvas) assert.equal(await waitingCanvas.evaluate(node => node.isConnected && node === document.querySelector('.stone-entrance canvas')), true, 'Successful verification keeps the existing canvas');
  await waitForEntry();
  const normalMotion=await finishEntryMotionCapture(page);
  assert.equal(normalMotion.reduced,false);
  assert.deepEqual(normalMotion.schedules.filter(item=>['carve','finish'].includes(item.callback)).map(item=>item.delay),[180,2200],'Normal entry takes the full carving path');
  assert(normalMotion.schedules.some(item=>item.owner==='finish'&&item.delay===700),'Normal entry schedules its arrival cleanup');
  assert(normalMotion.phases.includes('carving')&&normalMotion.arrival&&normalMotion.leaving,'The normal-path observer detects the full motion states');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('tashan-guest-entry')), null, 'Verified authentication clears guest mode');
  assert.equal(await page.locator('.project-card--discovery').count(), 14);
  await page.screenshot({path:'/tmp/tashan-after-stone-entry.png'});
  await page.goto(origin + '/index.html#admin');
  await page.getByRole('heading', {name:'账户管理',exact:true}).waitFor();
  await page.locator('.account-page-heading [data-account-action="new-user"]').click();
  const editor = page.locator('[data-account-form="create-user"]');

  // Failed account creation reports errors at the form instead of silently doing nothing.
  await editor.locator('[name=username]').fill('teacher_demo');
  await editor.locator('[name=displayName]').fill('测试教师');
  await editor.locator('[name=password]').fill('weak');
  await editor.getByRole('button', {name:'创建账户',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:/8|密码|password/i}).waitFor();
  assert.equal(await page.locator('tr').filter({hasText:'@teacher_demo'}).count(), 0, 'Weak passwords do not create accounts');
  await editor.locator('[name=username]').fill('教师甲');
  await editor.locator('[name=password]').fill('TeacherInitial123');
  await editor.getByRole('button', {name:'创建账户',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:/用户名|username/i}).waitFor();

  await editor.locator('[data-account-action="generate-password"]').click();
  const generated = await editor.locator('[name=password]').inputValue();
  assert(/^[0-9]{8}$/.test(generated), 'Generated passwords contain exactly eight cryptographically random digits');
  assert.equal(await editor.locator('[name=confirmPassword]').inputValue(),generated,'Generation also fills the confirmation');
  await editor.locator('[data-account-action="toggle-password"][data-field="account-password"]').click();
  assert.equal(await editor.locator('[name=password]').getAttribute('type'),'text','The generated password can be explicitly revealed');
  await editor.locator('[data-account-action="toggle-password"][data-field="account-password"]').click();
  assert.equal(await editor.locator('[name=password]').getAttribute('type'),'password','The password can be hidden again');
  assert.equal(await page.evaluate(value => Object.values(localStorage).some(item => item.includes(value)), generated), false, 'Generated passwords never enter persistent browser storage');

  // Affiliation changes update only their own fields and preserve unfinished input.
  assert.equal(await editor.locator('[name=affiliationType]').inputValue(),'personal');
  assert.equal(await editor.locator('[name=organizationName]').isVisible(),false);
  assert.equal(await editor.locator('[name=organizationName]').isDisabled(),true);
  await editor.locator('[name=username]').fill('teacher_demo');
  const originalForm=await editor.elementHandle();
  await editor.locator('[name=affiliationType]').selectOption('school');
  assert.equal(await originalForm.evaluate(node=>node.isConnected),true,'Changing affiliation does not replace the form');
  assert.equal(await editor.locator('[name=organizationName]').isVisible(),true);
  assert.equal(await editor.locator('[name=organizationName]').getAttribute('required'),'');
  await editor.getByRole('button',{name:'创建账户',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:'请填写学校名称。'}).waitFor();
  await editor.locator('[name=organizationName]').fill('山海实验学校');
  await editor.locator('[name=affiliationType]').selectOption('organization');
  assert.equal(await editor.locator('[data-account-organization-label]').textContent(),'机构名称');
  await editor.locator('[name=affiliationType]').selectOption('personal');
  assert.equal(await editor.locator('[name=organizationName]').isVisible(),false);
  assert.equal(await editor.locator('[name=organizationName]').isDisabled(),true);
  await editor.locator('[name=affiliationType]').selectOption('school');
  assert.equal(await editor.locator('[name=organizationName]').inputValue(),'山海实验学校','The unfinished name survives switching back');
  assert.equal(await editor.locator('[name=password]').inputValue(),generated,'Switching affiliation preserves the password');
  assert.equal(await editor.locator('[name=displayName]').inputValue(),'测试教师');
  await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="en"]').click();
  assert.equal(await editor.locator('[name=organizationName]').inputValue(),'山海实验学校');
  assert.equal(await editor.locator('[name=affiliationType]').inputValue(),'school');
  assert.equal(await editor.locator('[data-account-organization-label]').textContent(),'School name');
  assert.equal(await editor.locator('[name=password]').inputValue(),generated,'Language switching preserves the password in memory');
  assert.equal(await editor.locator('[name=confirmPassword]').inputValue(),generated);
  assert.equal(await editor.locator('[name=displayName]').inputValue(),'测试教师');
  await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="zh-CN"]').click();

  // Creating an account resets stale filters and permits a blank display name.
  const search = page.locator('[data-account-form="search-users"]');
  await search.locator('[name=query]').fill('no-matching-account');
  await search.getByRole('button', {name:'搜索',exact:true}).click();
  await page.getByText('没有找到匹配的账户。',{exact:true}).waitFor();
  await editor.locator('[name=username]').fill('teacher_demo');
  await editor.locator('[name=displayName]').fill('');
  await editor.locator('[name=password]').fill('TeacherInitial123');
  await editor.locator('[name=confirmPassword]').fill('Mismatch123');
  await editor.getByRole('button', {name:'创建账户',exact:true}).click();
  await editor.getByRole('alert').filter({hasText:'两次输入的密码不一致。'}).waitFor();
  assert.equal(await editor.locator('[name=confirmPassword]').getAttribute('aria-invalid'),'true','Confirmation error is attached to its input');
  assert.equal(await editor.locator('[name=confirmPassword]').evaluate(node=>node===document.activeElement),true,'Invalid confirmation receives keyboard focus');
  await editor.locator('[name=confirmPassword]').fill('TeacherInitial123');
  await editor.getByRole('button', {name:'创建账户',exact:true}).click();
  const teacherRow = page.locator('tr').filter({hasText:'@teacher_demo'});
  await teacherRow.waitFor();
  assert.equal(await teacherRow.count(), 1);
  assert.equal(await teacherRow.locator('strong').textContent(), 'teacher_demo', 'Blank display names fall back to the username');
  assert.equal(await teacherRow.locator('.account-person-affiliation').textContent(),'学校 · 山海实验学校');
  assert.equal(await page.locator('[data-account-form="edit-user"] [name=organizationName]').inputValue(),'山海实验学校','The saved affiliation is returned by the account API');
  assert.equal(await search.locator('[name=query]').inputValue(), '', 'New accounts remain visible after creation clears the search');
  assert.equal(await page.locator('.account-editor input[name=password]').evaluateAll(fields => fields.every(field => !field.value)), true, 'Initial passwords are cleared after a successful creation');
  const createdPassword=page.locator('.account-created #account-created-password');
  assert.equal(await createdPassword.inputValue(),'TeacherInitial123','The newly created initial password remains available for an explicit handoff');
  assert.equal(await createdPassword.getAttribute('type'),'password','The handoff password starts masked');
  assert.equal(await createdPassword.getAttribute('readonly'),'','The handoff password is read-only');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/tashan-account-admin.png',fullPage:true});
  await page.locator('.account-header[href="#account"]').click();
  await page.getByRole('heading',{name:'我的账户',exact:true}).waitFor();
  await page.locator('.account-profile-links a[href="#admin"]').click();
  await page.getByRole('heading',{name:'账户管理',exact:true}).waitFor();
  assert.equal(await page.locator('.account-created').count(),0,'Leaving account management clears the temporary handoff card without a reload');
  await page.locator('.account-people-table tr').filter({hasText:'@teacher_demo'}).locator('[data-account-action="edit-user"]').click();
  await page.locator('.account-reset summary').click();
  const reset=page.locator('[data-account-form="reset-password"]');
  await reset.locator('[name=password]').fill('23456789');
  await reset.locator('[name=confirmPassword]').fill('23456788');
  await reset.getByRole('button',{name:'重置密码',exact:true}).click();
  await reset.getByRole('alert').filter({hasText:'两次输入的密码不一致。'}).waitFor();
  await page.locator('.account-people-table tr').filter({hasText:'@admin'}).locator('[data-account-action="edit-user"]').click();
  assert.equal(await page.locator('.account-editor [name=username]').inputValue(),'admin');
  assert.equal(await page.locator('.account-editor input[type=password]').evaluateAll(fields=>fields.every(field=>field.value==='')),true,'Changing selected accounts removes unfinished password fields');
  // Real IndexedDB operations exercise account isolation using the shipped storage adapter.
  const record = await page.evaluate(async () => window.PracticeStore.put({title:'Admin private project',kind:'visual',attachment:{name:'private.html',type:'text/html',blob:new Blob(['<h1>Private preview</h1>'],{type:'text/html'})}}));
  const preview = await context.newPage();
  await preview.bringToFront();
  preview.on('pageerror',error=>console.log('Preview script:',error.message));
  await preview.goto(origin + '/project-preview.html?project=' + record.id);
  try { await preview.frameLocator('#preview-frame').getByRole('heading',{name:'Private preview'}).waitFor({timeout:10000}); } catch(error) {
    await preview.screenshot({path:'/tmp/tashan-preview-regression-failure.png'});
    console.log('Preview diagnostics:',await preview.locator('body').innerText(),await preview.evaluate(()=>{const frame=document.getElementById('preview-frame'),rect=frame.getBoundingClientRect(),css=getComputedStyle(frame);return{scope:window.PracticeStore?.scope,visibility:document.visibilityState,frame:frame.srcdoc,hidden:frame.hidden,bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},display:css.display,cssVisibility:css.visibility};}));
    console.log('Preview frame documents:',await Promise.all(preview.frames().map(async frame=>({url:frame.url(),document:await frame.evaluate(()=>({body:document.body?.innerText,width:innerWidth,height:innerHeight,ready:document.readyState})).catch(()=>null)}))));
    throw error;
  }
  await page.bringToFront();
  await page.goto(origin + '/index.html#account');
  await page.getByRole('button', {name:'退出登录',exact:true}).click();
  await expectLoginScene();
  await preview.waitForFunction(() => document.getElementById('preview-frame').hidden && document.getElementById('preview-download').disabled);
  await form().locator('[name=username]').fill('teacher_demo');
  await form().locator('[name=password]').fill('TeacherInitial123');
  const teacherScene = await scene().elementHandle();
  await loginButton().click();
  await page.locator('.stone-entrance[data-automatic=true]').waitFor();
  assert.equal(await page.evaluate(() => window.TashanAccounts.user.mustChangePassword), false, 'A newly created member can sign in with the initial password');
  assert.equal(await teacherScene.evaluate(node => node.isConnected && node === document.querySelector('.stone-entrance')), true, 'A new member enters through the existing stone scene');
  assert.equal(await page.getByRole('heading', {name:'请先设置你的新密码'}).count(), 0, 'New accounts are not redirected to mandatory password setup');
  await waitForEntry();

  // Password changes are available voluntarily in the member's personal account page.
  await page.goto(origin + '/index.html#account');
  await page.getByRole('heading', {name:'我的账户',exact:true}).waitFor();
  const change = page.locator('.account-page [data-account-form="password"]');
  await change.locator('[name=currentPassword]').fill('TeacherInitial123');
  await change.locator('[name=newPassword]').fill('TeacherChanged234');
  await change.locator('[name=confirmPassword]').fill('TeacherChanged234');
  await change.getByRole('button',{name:'保存新密码'}).click();
  await change.getByRole('status').filter({hasText:'密码已更新。'}).waitFor();
  assert.equal(new URL(page.url()).hash, '#account', 'Voluntary password changes stay on the personal account page');
  assert.equal(await scene().count(), 0, 'Voluntary password changes do not restart the entrance');
  assert.equal(await page.evaluate(async id => await window.PracticeStore.get(id), record.id),null);
  await page.goto(origin + '/index.html#admin');
  await page.getByText('此页面仅供管理员使用。',{exact:true}).waitFor();
  const forbidden = await page.evaluate(async () => (await fetch('/api/v1/admin/users')).status);
  assert.equal(forbidden,403,'Direct requests cannot bypass hidden admin controls');
  await page.goto(origin + '/index.html#account');
  await page.getByRole('button',{name:'切换语言 · 简体中文'}).click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByRole('heading',{name:'My account',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Mobile account page must not overflow');
  await page.getByRole('button',{name:'Dark mode'}).click();
  await page.screenshot({path:'/tmp/tashan-account-mobile-dark.png'});
  assert.equal((await page.request.get(origin+'/.dev.vars')).status(),404);
  assert.equal((await page.request.get(origin+'/.local/accounts.sqlite')).status(),404);
  assert.equal((await page.request.get(origin+'/server/api.mjs')).status(),404);
  const project = await page.request.get(origin+'/vibe%20coding%E5%BA%93/%E5%82%85%E5%8F%AF%E6%99%97/C%2B%2B%E5%8F%98%E9%87%8F%E6%95%B0%E7%BB%84%E5%8A%A8%E7%94%BB%E6%A8%A1%E6%8B%9F%E5%99%A8_fu_0910.html');
  assert(project.headers()['content-security-policy']?.includes('sandbox allow-scripts'));

  // Every additional scenario uses a fresh browser profile: no production or other-test data.
  async function openAuthContext(options={}, initScript) {
    const isolated = await browser.newContext({viewport:{width:1440,height:900},...options});
    if(initScript) await isolated.addInitScript(initScript);
    const isolatedPage = await isolated.newPage();
    isolatedPage.on('pageerror',error=>errors.push(error.message));
    await isolatedPage.goto(origin+'/index.html#discover');
    await isolatedPage.locator('.stone-entrance[data-mode="auth"] [data-account-form="login"]').waitFor();
    return {isolated,isolatedPage};
  }
  async function expectCleanEntry(target) {
    await target.waitForURL('**#discover');
    await target.waitForFunction(() => !document.querySelector('.stone-entrance') && !document.documentElement.classList.contains('entrance-open') && !document.getElementById('practice-ui').classList.contains('entrance-arrival'));
    assert.equal(await target.evaluate(()=>window.scrollY),0);
    assert.equal(await target.locator('.project-card--discovery').count(),14);
  }
  async function enterGuest(target) {
    const button=target.locator('.stone-entrance [data-account-action="guest"]');
    await button.scrollIntoViewIfNeeded();
    const box=await button.boundingBox(),viewport=target.viewportSize();
    assert(box && box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width+1 && box.y+box.height<=viewport.height+1,'Guest entry must be reachable within the viewport');
    await button.click();
    await expectCleanEntry(target);
    assert.equal(await target.evaluate(()=>window.TashanAccounts.user),null,'Guest entry never creates an authenticated identity');
  }

  const languageCase=await openAuthContext({viewport:{width:390,height:844}});
  try {
    const mobile=languageCase.isolatedPage;
    const mobileForm=()=>mobile.locator('.stone-entrance [data-account-form="login"]');
    const draft={username:'unfinished_teacher',password:'UnsubmittedDraft123'};
    await mobileForm().locator('[name=username]').fill(draft.username);
    await mobileForm().locator('[name=password]').fill(draft.password);
    for(const language of ['zh-Hant','en','zh-CN','en']) {
      await mobile.locator(`.stone-entrance [data-intro-language="${language}"]`).click();
      await mobile.waitForFunction(expected=>document.querySelector('.stone-entrance')?.lang===expected,language);
      assert.equal(await mobileForm().locator('[name=username]').inputValue(),draft.username,'Changing language preserves the unfinished username');
      assert.equal(await mobileForm().locator('[name=password]').inputValue(),draft.password,'Changing language preserves the unfinished password in the form only');
    }
    await mobile.locator('.stone-entrance').getByRole('heading',{name:'Welcome to Tashan',exact:true}).waitFor();
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px English entrance must not overflow');
    assert.equal(await mobile.evaluate(password=>Object.values(localStorage).some(value=>value.includes(password)),draft.password),false,'Unsubmitted passwords never enter persistent storage');
    await mobile.screenshot({path:'/tmp/tashan-stone-login-mobile-en.png'});
    await enterGuest(mobile);
  } finally {await languageCase.isolated.close();}

  for(const viewport of [{width:375,height:667},{width:844,height:390}]) {
    const layoutCase=await openAuthContext({viewport});
    try {
      const small=layoutCase.isolatedPage;
      await small.locator('.stone-entrance [data-intro-language="en"]').click();
      await small.locator('.stone-entrance').getByRole('heading',{name:'Welcome to Tashan',exact:true}).waitFor();
      assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${viewport.width}×${viewport.height} entrance must not overflow horizontally`);
      await small.screenshot({path:`/tmp/tashan-entrance-${viewport.width}x${viewport.height}.png`});
      if(!await small.locator('.stone-entrance').evaluate(node=>node.scrollWidth<=node.clientWidth)) console.log('Entrance horizontal bounds:',viewport,await small.locator('.stone-entrance').evaluate(node=>({scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,overflowX:getComputedStyle(node).overflowX,outside:[...node.querySelectorAll('*')].map(element=>({tag:element.tagName,class:typeof element.className==='string'?element.className:'svg',left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right})).filter(element=>element.left<0||element.right>innerWidth+1)})));
      assert.equal(await small.locator('.stone-entrance').evaluate(node=>node.scrollWidth<=node.clientWidth),true,'The entrance itself must not create horizontal scrolling');
      await enterGuest(small);
      if(viewport.width===375) {
        // Simulate a pre-account anonymous record in this isolated profile only.
        const oldAnonymous=await small.evaluate(async()=>{
          await window.PracticeStore.setScope(null);
          return window.PracticeStore.put({title:'Old anonymous preview fixture',kind:'visual',attachment:{name:'anonymous.html',type:'text/html',blob:new Blob(['<h1>Anonymous private fixture</h1>'],{type:'text/html'})}});
        });
        await small.goto(origin+'/project-preview.html?project='+oldAnonymous.id);
        await small.locator('#preview-empty').filter({hasText:/登录|登入|sign in/i}).waitFor();
        assert.equal(await small.locator('#preview-frame').isHidden(),true,'An unauthenticated preview cannot open old anonymous IDs');
        assert.equal(await small.locator('#preview-download').isDisabled(),true,'An unauthenticated preview cannot download old anonymous attachments');
      }
    } finally {await layoutCase.isolated.close();}
  }

  const reducedCase=await openAuthContext({reducedMotion:'reduce'});
  try {
    const reducedPage=reducedCase.isolatedPage;
    const reducedForm=reducedPage.locator('.stone-entrance [data-account-form="login"]');
    await reducedForm.locator('[name=username]').fill('admin');
    await reducedForm.locator('[name=password]').fill('12345678');
    await reducedPage.bringToFront();
    await captureEntryMotion(reducedPage);
    const start=Date.now();
    await reducedForm.locator('[type=submit]').click();
    await expectCleanEntry(reducedPage);
    const reducedMotion=await finishEntryMotionCapture(reducedPage);
    assert.equal(reducedMotion.reduced,true);
    assert.deepEqual(reducedMotion.schedules.filter(item=>['carve','finish'].includes(item.callback)).map(item=>item.delay),[30,120],'Reduced motion schedules the short entry path regardless of authentication or machine latency');
    assert.equal(reducedMotion.schedules.some(item=>item.owner==='finish'&&item.delay===700),false,'Reduced motion does not schedule animated arrival cleanup');
    assert(reducedMotion.phases.includes('revealed')&&!reducedMotion.phases.includes('carving'),'Reduced motion skips the observable carving phase');
    assert.equal(reducedMotion.arrival||reducedMotion.leaving,false,'Reduced motion does not add arrival or leaving animations');
    console.log(JSON.stringify({reducedMotionLoginWallMs:Date.now()-start,entryScheduledDelaysMs:[30,120]}));
    assert.equal(await reducedPage.evaluate(()=>window.TashanAccounts.user?.username),'admin');
  } finally {await reducedCase.isolated.close();}

  const fallbackCase=await openAuthContext({},()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    window.__testWebGLAttempts=0;
    HTMLCanvasElement.prototype.getContext=function(type,...options){
      if(/webgl/i.test(type)){window.__testWebGLAttempts++;return null;}
      return getContext.call(this,type,...options);
    };
  });
  try {
    const fallbackPage=fallbackCase.isolatedPage;
    await fallbackPage.waitForFunction(()=>window.__testWebGLAttempts>0);
    await fallbackPage.locator('.stone-entrance .entrance-fallback svg').waitFor({state:'visible'});
    assert.equal(await fallbackPage.locator('.stone-entrance.has-webgl').count(),0,'Failed WebGL creation uses the SVG stone');
    const fallbackForm=fallbackPage.locator('.stone-entrance [data-account-form="login"]');
    await fallbackForm.locator('[name=username]').fill('admin');
    await fallbackForm.locator('[name=password]').fill('12345678');
    await fallbackForm.locator('[type=submit]').click();
    await expectCleanEntry(fallbackPage);
    assert.equal(await fallbackPage.evaluate(()=>window.TashanAccounts.user?.username),'admin','SVG fallback preserves the real login flow');
  } finally {await fallbackCase.isolated.close();}

  assert.deepEqual(errors,[], 'No application JavaScript errors');
  console.log('Browser checks passed: integrated stone login, waiting/error states, scene/canvas reuse, animation cleanup, guest refresh and write gates, password generation, inline account errors, visible new accounts, direct member entry, voluntary password change, separate workspaces, preview invalidation, RBAC, three-language draft retention, small/landscape English layouts, reduced motion, WebGL fallback and private file boundaries.');
} finally {
  if(browser)await browser.close();
  if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');await serverExited.catch(()=>{});
  await rm(folder,{recursive:true,force:true});
}
