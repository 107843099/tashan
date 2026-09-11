import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LocalProvider} from '../server/local-provider.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder=await mkdtemp(join(tmpdir(),'tashan-project-browser-'));
const provider=new LocalProvider(join(folder,'accounts.sqlite'));
const administrator=await provider.bootstrap({username:'admin',password:'12345678',displayName:'管理员'});
await provider.createUser(administrator,{username:'reader',password:'12345678',displayName:'其他成员',role:'member'});provider.close();
const origin='http://127.0.0.1:4182';
const server=spawn(process.execPath,['scripts/dev-server.mjs'],{env:{...process.env,PORT:'4182',TASHAN_ACCOUNT_PROVIDER:'local',TASHAN_LOCAL_DB:join(folder,'accounts.sqlite'),TASHAN_LOCAL_FILES:join(folder,'files')},stdio:['ignore','pipe','pipe']});
let browser,page;
try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Test server failed to start');})]);
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const owner=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  page=await owner.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function login(target,username='admin'){
    await target.goto(origin+'/index.html#login');
    const form=target.locator('.stone-entrance [data-account-form="login"]');
    await form.locator('[name=username]').fill(username);await form.locator('[name=password]').fill('12345678');await form.locator('[type=submit]').click();
    await target.waitForURL('**#discover');await target.waitForFunction(()=>!document.querySelector('.stone-entrance')&&!window.TashanProjects.busy);
  }
  async function idle(target=page){await target.waitForFunction(()=>!window.TashanProjects.busy);}
  async function publish(target=page){await target.locator('[data-project-action="publish"]').click();await Promise.all([target.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST'&&r.status()===200),target.getByRole('dialog').getByRole('button',{name:'确认发布',exact:true}).click()]);await idle(target);await target.locator('[data-project-action="unpublish"]').waitFor();}
  await login(page);
  const record=await page.evaluate(async()=>{
    const cover=await (await fetch('./assets/covers/earth.webp')).blob();
    const p=await window.PracticeStore.put({title:'课堂版本一',kind:'visual',core:'可复现的课堂演示',purpose:'展示固定版本',subject:'地理',stage:'初中',audience:'初中学生',prior:'基础地理',outcome:'理解版本',setting:'教师演示',content:true,license:'open',sourceReferences:[{projectId:'earth',projectCode:'TS-0001',versionId:window.PRACTICE_LIBRARY.projects.find(p=>p.id==='earth').currentVersionId,title:'地球公转'}],coverFile:{name:'cover.webp',type:'image/webp',blob:cover},attachment:{name:'classroom.html',type:'text/html',blob:new Blob(['<h1>Published version one</h1><script>document.body.dataset.ready="yes"</script>'],{type:'text/html'})}},{saveVersion:true});
    await window.PracticeStore.putWorkspaceState({bookmarks:['earth'],tasks:{earth:{text:'备课任务',form:{goal:'课堂目标'}}}});return p;
  });
  assert.match(record.projectCode,/^TS-L-[A-F0-9]{16}$/);
  await page.goto(origin+'/index.html#project/'+record.id);await page.reload();
  await page.locator('.project-lifecycle').filter({hasText:record.projectCode}).waitFor();
  await page.locator('[data-project-action="upload"]:enabled').click();await page.waitForURL('**#cloud/'+record.id);await idle();
  await page.locator('.remote-detail').waitFor();
  assert.equal(await page.locator('.remote-detail select option').count(),1);
  assert.equal(await page.getByRole('heading',{name:'课堂版本一',exact:true}).count(),1);
  assert.equal((await page.request.get(origin+'/api/v1/published')).status(),200);
  assert.equal((await (await page.request.get(origin+'/api/v1/published')).json()).total,0,'Uploads stay private');
  await publish();
  const memberContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),member=await memberContext.newPage();
  await login(member,'reader');await member.locator('.published-library a[href="#cloud/'+record.id+'"]').waitFor();
  await member.locator('.published-library a[href="#cloud/'+record.id+'"]').click();await member.getByRole('heading',{name:'课堂版本一',exact:true}).waitFor();
  assert.equal(await member.locator('[data-project-action="publish"]').count(),0,'Other members cannot publish the owner’s project');
  assert.equal((await member.request.get(origin+'/api/v1/projects/'+record.id)).status(),404);
  await memberContext.close();

  const visitor=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const guest=await visitor.newPage();guest.on('pageerror',error=>errors.push(error.message));
  await guest.goto(origin+'/index.html#cloud/'+record.id);
  await guest.getByRole('heading',{name:'课堂版本一',exact:true}).waitFor();
  assert.equal(await guest.locator('[data-project-action="publish"]').count(),0);
  assert.equal(await guest.locator('.stone-entrance').count(),0,'Public links do not force login');
  assert.equal((await guest.request.get(origin+'/api/v1/projects/'+record.id)).status(),401);
  const previewHref=await guest.getByRole('link',{name:/运行固定版本/}).getAttribute('href');
  const preview=await visitor.newPage();await preview.bringToFront();
  await preview.goto(new URL(previewHref,origin).href);
  await preview.frameLocator('#preview-frame').getByRole('heading',{name:'Published version one'}).waitFor();
  assert.equal(await preview.locator('#preview-frame').getAttribute('sandbox'),'allow-scripts');
  await preview.close();

  await page.bringToFront();
  // Edit the real wizard. Completing a save creates a new immutable version.
  await page.goto(origin+'/index.html#desk');
  await page.locator('[data-action="edit-project"][data-id="'+record.id+'"]').click();
  await page.getByRole('button',{name:/下一步：教学信息/}).click();
  await page.locator('[data-draft="title"]').fill('课堂版本二');
  await page.getByRole('button',{name:/下一步：确认保存/}).click();
  await page.getByRole('button',{name:/保存修改/}).click();
  await page.waitForURL('**#project/'+record.id);
  await page.locator('.project-lifecycle').filter({hasText:'v2'}).waitFor();
  await page.locator('[data-project-action="upload"]:enabled').click();await page.waitForURL('**#cloud/'+record.id);await idle();
  await page.getByRole('heading',{name:'课堂版本二',exact:true}).waitFor();
  const second=await page.evaluate(async id=>window.PracticeStore.get(id),record.id);
  assert.equal(second.projectCode,record.projectCode);assert.equal(second.currentVersionNumber,2);
  await guest.reload();await guest.getByRole('heading',{name:'课堂版本一',exact:true}).waitFor();
  assert.equal((await guest.request.get(origin+'/api/v1/published/'+record.id+'/versions/'+second.currentVersionId)).status(),404,'New private versions stay private');
  await page.locator('[data-remote-version]').selectOption(record.currentVersionId);await idle();
  await page.getByRole('heading',{name:'课堂版本一',exact:true}).waitFor();
  assert.equal(page.url().split('/').at(-1),record.currentVersionId,'Version links preserve the selected immutable version');
  await page.reload();await page.getByRole('heading',{name:'课堂版本一',exact:true}).waitFor();
  await page.locator('[data-remote-version]').selectOption(second.currentVersionId);await idle();await publish();
  await guest.reload();await guest.getByRole('heading',{name:'课堂版本二',exact:true}).waitFor();

  // Server-only history produces a portable backup without writing over local work.
  await page.locator('[data-project-action="backup"]').click();
  await page.getByRole('dialog').waitFor();
  const remoteDownload=page.waitForEvent('download');await page.getByRole('dialog').getByRole('link',{name:/下载备份文件/}).click();
  const remoteFile=await remoteDownload,remoteData=JSON.parse(await readFile(await remoteFile.path(),'utf8'));
  assert.equal(remoteData.versions.length,2);assert.equal(remoteData.projects[0].id,record.id);
  assert.equal(Object.keys(remoteData.files).length,2,'Two versions share their unchanged binary files');
  await page.getByRole('dialog').getByRole('button',{name:'完成',exact:true}).click();

  const fresh=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),freshPage=await fresh.newPage();
  await login(freshPage);await freshPage.goto(origin+'/index.html#cloud/'+record.id);
  await freshPage.locator('[data-project-action="download"]').click();await freshPage.waitForURL('**#project/'+record.id);await idle(freshPage);
  const adopted=await freshPage.evaluate(async id=>window.PracticeStore.get(id),record.id);
  assert.equal(adopted.currentVersionNumber,2);assert.equal(adopted.currentVersionId,second.currentVersionId);assert.equal(adopted.projectCode,record.projectCode);
  await freshPage.locator('[data-project-action="upload"]:enabled').click();await freshPage.waitForURL('**#cloud/'+record.id);await idle(freshPage);
  assert.equal(await freshPage.locator('.account-message--error').count(),0,'Adopt and upload is idempotent');
  await fresh.close();

  await page.bringToFront();await page.goto(origin+'/index.html#desk');
  await page.locator('[data-action="export-backup"]').click();
  const localDownload=page.waitForEvent('download');await page.getByRole('dialog').getByRole('link',{name:/下载备份文件/}).click();
  const localFile=await localDownload,localPath=await localFile.path(),data=JSON.parse(await readFile(localPath,'utf8'));
  assert.deepEqual(data.workspace.bookmarks,['earth']);assert.equal(data.workspace.tasks.earth.text,'备课任务');assert.equal(data.versions.length,2);
  await page.getByRole('dialog').getByRole('button',{name:'完成',exact:true}).click();
  await page.locator('#import-backup').setInputFiles(localPath);
  await page.getByRole('dialog',{name:'确认导入完整备份'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'确认导入',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  assert.equal(await page.evaluate(async()=> (await window.PracticeStore.list()).length),1,'Importing the same complete backup does not duplicate projects');
  await page.goto(origin+'/index.html#project/'+record.id);
  await page.locator('.version-history summary').click();
  await page.locator('[data-project-action="restore"][data-version="'+record.currentVersionId+'"]').click();
  await page.waitForURL('**#upload');
  assert.equal(await page.evaluate(async()=> (await window.PracticeStore.getDraft()).title),'课堂版本一');
  assert.equal(await page.evaluate(async id=>(await window.PracticeStore.get(id)).currentVersionNumber,record.id),2,'Restoration does not overwrite current history');
  await page.goto(origin+'/index.html#cloud/'+record.id);
  await page.locator('[data-project-action="unpublish"]').click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/publication')&&r.request().method()==='DELETE'&&r.status()===200),page.getByRole('dialog').getByRole('button',{name:'撤回公开',exact:true}).click()]);await idle();
  assert.equal((await guest.request.get(origin+'/api/v1/published/'+record.id)).status(),404);
  assert.equal((await guest.request.get(origin+'/api/v1/published/'+record.id+'/versions/'+second.currentVersionId+'/files/attachment')).status(),404);

  // Discarding an editing draft must never remove its saved project or cloud version.
  await page.goto(origin+'/index.html#desk');await page.locator('[data-action="delete-draft"]').waitFor();
  await page.locator('[data-action="delete-draft"]').click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.PracticeStore.getDraft()));
  await page.locator('[data-action="delete-draft"]').click();await page.getByRole('dialog').getByRole('button',{name:'删除草稿',exact:true}).click();
  await page.locator('[data-action="delete-draft"]').waitFor({state:'detached'});await page.reload();
  assert.equal(await page.locator('[data-action="delete-draft"]').count(),0,'Deleted drafts stay deleted after reload');
  assert.equal(await page.evaluate(()=>window.PracticeStore.getDraft()),null);
  assert.equal((await page.evaluate(id=>window.PracticeStore.get(id),record.id)).currentVersionNumber,2);
  assert.equal((await page.request.get(origin+'/api/v1/projects/'+record.id)).status(),200,'Cloud project survives draft deletion');

  // Exercise the new final-step sharing button with actual browser storage and server requests.
  await page.evaluate(async()=>{
    const cover=await (await fetch('./assets/covers/earth.webp')).blob();
    await window.PracticeStore.putDraft({title:'一步分享的教学提示词',kind:'prompt',core:'请引导学生观察月相并记录形状。',purpose:'观察与记录',subject:'地理',stage:'初中',audience:'初中学生',prior:'认识月球',outcome:'记录月相',setting:'小组讨论',content:true,license:'teach',coverFile:{name:'cover.webp',type:'image/webp',blob:cover}});
  });
  await page.reload();await page.locator('.draft-row a[href="#upload"]').click();
  await page.getByRole('button',{name:/下一步：教学信息/}).click();await page.getByRole('button',{name:/下一步：确认保存/}).click();
  await page.locator('[data-save-mode="share"]').click();await page.getByRole('dialog',{name:'上传并公开这个项目？'}).waitFor();
  // Cancel retains the saved project. Retry is available on the local detail page.
  await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
  const sharedId=page.url().split('/').at(-1);assert.ok(sharedId.startsWith('local-'));
  assert.equal((await guest.request.get(origin+'/api/v1/published/'+sharedId)).status(),404);
  await page.locator('[data-project-action="share"]:enabled').click();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST'&&r.status()===200),page.getByRole('dialog').getByRole('button',{name:'上传并公开',exact:true}).click()]);await idle();
  await guest.goto(origin+'/index.html#cloud/'+sharedId);await guest.getByRole('heading',{name:'一步分享的教学提示词',exact:true}).waitFor();
  await page.locator('[data-project-action="copy-public-link"]').waitFor();
  await page.goto(origin+'/index.html#desk');await page.locator('.cloud-workspace').waitFor();
  await page.locator('[data-action="edit-project"][data-id="'+record.id+'"]').click();await page.waitForURL('**#upload');await page.locator('#upload-form').waitFor();await page.goto(origin+'/index.html#desk');
  await page.locator('[data-action="delete-draft"]').waitFor();
  await page.screenshot({path:'/tmp/tashan-v34-workspace.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile workspace has no horizontal overflow');
  await page.screenshot({path:'/tmp/tashan-v34-workspace-mobile.png',fullPage:true});
  await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="en"]').click();
  await page.locator('[data-action="theme"]').click();
  assert.equal(await page.locator('[data-action="delete-draft"]').innerText(),'Delete draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'English dark workspace has no horizontal overflow');
  await page.screenshot({path:'/tmp/tashan-sharing-workspace-en-dark.png',fullPage:true});
  await page.locator('[data-action="language-menu"]').click();await page.locator('[data-language="zh-Hant"]').click();
  assert.equal(await page.locator('[data-action="delete-draft"]').innerText(),'刪除草稿');
  await page.setViewportSize({width:812,height:375});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Landscape workspace has no horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log('Project browser checks passed: real upload/publication, anonymous frozen-version preview, private edits, version selection, full cloud/local backups, cross-device identity, idempotent reupload, deduplicated import, draft restoration/deletion, sharing cancellation/retry, member/guest access, withdrawal and three-language responsive workspace.');
}catch(error){if(page)console.log('Browser failure state:',await page.evaluate(async()=>({url:location.href,user:window.TashanAccounts?.user?.username,scope:window.PracticeStore?.scope,projects:(await window.PracticeStore?.list())?.map(p=>({id:p.id,title:p.title})),body:document.body.innerText.slice(0,2200)})).catch(()=>null));if(page)await page.screenshot({path:'/tmp/tashan-v34-browser-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{if(browser)await browser.close();server.kill('SIGTERM');await once(server,'exit').catch(()=>{});await rm(folder,{recursive:true,force:true});}
