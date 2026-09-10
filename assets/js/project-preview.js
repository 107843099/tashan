(function () {
  'use strict';
  const words = {
    'zh-CN': { brand: '他山', back: '返回项目', download: '下载源文件', title: '正在读取本地作品', status: '本地预览', loading: '正在打开浏览器中的项目文件…', description: '单文件 HTML 会在隔离环境中运行；远程资源、联网请求与跨窗口跳转已停用。包含配套文件的项目，请下载后在本地运行。', missing: '未找到这个本地项目。请回到平台，在保存项目的同一浏览器中打开预览。', noFile: '这个项目还没有源文件。返回项目补充 HTML 或项目包后，即可继续预览。', package: '这个文件需要下载后打开。若为 ZIP 项目包，请先解压，并按照项目中的使用说明在本地运行。', failed: '无法读取此项目，请返回平台后重试。', frame: '隔离的本地作品预览' },
    'zh-Hant': { brand: '他山', back: '返回項目', download: '下載原始檔案', title: '正在讀取本地作品', status: '本地預覽', loading: '正在開啟瀏覽器中的項目檔案…', description: '單檔案 HTML 會在隔離環境中執行；遠端資源、網絡請求與跨視窗跳轉已停用。包含配套檔案的項目，請下載後在本地執行。', missing: '找不到這個本地項目。請返回平台，在儲存項目的同一瀏覽器中開啟預覽。', noFile: '這個項目尚未有原始檔案。返回項目補充 HTML 或項目套件後，即可繼續預覽。', package: '這個檔案需要下載後開啟。若為 ZIP 項目套件，請先解壓縮，並按照項目中的使用說明在本地執行。', failed: '無法讀取此項目，請返回平台後重試。', frame: '隔離的本地作品預覽' },
    en: { brand: '他山', back: 'Back to project', download: 'Download source', title: 'Opening your local project', status: 'Local preview', loading: 'Reading the project file from this browser…', description: 'Self-contained HTML runs in an isolated frame. Remote assets, network requests and cross-window navigation are disabled. Download projects with companion files and run them locally.', missing: 'This local project was not found. Return to the platform using the browser where you saved it.', noFile: 'This project has no source file yet. Add an HTML file or project package to continue.', package: 'Download this file to open it. For a ZIP package, extract the files and follow the included instructions to run it locally.', failed: 'The project could not be read. Return to the platform and try again.', frame: 'Isolated local project preview' }
  };
  let locale = 'zh-CN';
  try { const saved = localStorage.getItem('practice-language'); if (words[saved]) locale = saved; } catch (_) {}
  const t = words[locale];
  const loginMessage=locale==='en'?'Sign in to preview your own saved projects.':locale==='zh-Hant'?'請先登入，再預覽自己儲存的作品。':'请先登录，再预览自己保存的作品。';
  document.documentElement.lang = locale;
  for (const key of ['brand', 'back', 'download', 'title', 'status', 'description']) document.getElementById('preview-' + key).textContent = t[key];
  document.getElementById('preview-message').textContent = t.loading;
  let frame = document.getElementById('preview-frame');
  frame.title = t.frame;
  const message = value => { document.getElementById('preview-message').textContent = value; };
  let downloadURL, loadedScope, epoch=0, sessionRequest;
  const download = document.getElementById('preview-download');
  function replaceFrame(source) {
    // A new browsing context starts with its final visibility and size. Reusing a
    // display:none srcdoc frame can preserve a zero-size child layout in Chromium.
    // Detaching the previous frame also stops its scripts before identity changes.
    const next = document.createElement('iframe');
    next.id = 'preview-frame';
    next.className = 'preview-frame';
    next.title = t.frame;
    next.setAttribute('sandbox', 'allow-scripts');
    next.referrerPolicy = 'no-referrer';
    next.hidden = source === undefined;
    if (source !== undefined) next.srcdoc = source;
    frame.replaceWith(next);
    frame = next;
  }
  function clearPreview() {
    epoch++;
    if(sessionRequest){sessionRequest.abort();sessionRequest=null;}
    replaceFrame();
    document.getElementById('preview-empty').hidden=false;
    document.getElementById('preview-title').textContent=t.title;
    document.title=t.title+' · '+t.brand;
    download.disabled=true;download.onclick=null;
    if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
  }
  window.addEventListener('pagehide', clearPreview);
  async function openProject() {
    clearPreview();const ticket=epoch;message(t.loading);
    // Hidden pages contain no running private artwork. Becoming visible triggers
    // a fresh session check rather than completing an earlier background render.
    if(document.visibilityState!=='visible')return;
    const params=new URLSearchParams(location.search),remoteId=params.get('remote'),versionId=params.get('version'),isPublic=Boolean(remoteId&&params.get('public')==='1');
    const id=remoteId||params.get('project');
    if (!id || !/^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id) || (remoteId&&!versionId)) { message(t.missing); return; }
    // The host verifies identity; the iframe below cannot access the API or cookies.
    sessionRequest = new AbortController();
    const response = !isPublic&&await fetch('/api/v1/auth/session', { credentials: 'same-origin', cache: 'no-store', signal:sessionRequest.signal });
    let user = null;
    if (response&&response.ok && (response.headers.get('content-type') || '').includes('application/json')) user = (await response.json()).user;
    else if(response&&response.status!==404)throw new Error(t.failed);
    if(ticket!==epoch)return;
    if(!user&&!isPublic){message(loginMessage);document.getElementById('preview-back').href='./index.html#login';return;}
    const scope=user?.id||null;
    if(loadedScope!==undefined&&loadedScope!==scope){message(t.missing);return;}
    if(user?.mustChangePassword){location.replace('./index.html#account');return;}
    loadedScope=scope;
    let project;
    if(remoteId){
      const api='/api/v1/'+(isPublic?'published':'projects')+'/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(versionId);
      const response=await fetch(api,{credentials:'same-origin',cache:'no-store',signal:sessionRequest.signal});
      if(!response.ok)throw new Error(t.failed);
      const result=await response.json();if(ticket!==epoch)return;
      project={...result.version.metadata};const attachment=result.version.files?.attachment;
      if(attachment){
        const expected=api+'/files/attachment';if(attachment.url!==expected)throw new Error(t.failed);
        const fileResponse=await fetch(expected,{credentials:'same-origin',cache:'no-store',signal:sessionRequest.signal});
        if(!fileResponse.ok)throw new Error(t.failed);
        project.attachment={name:attachment.name,type:attachment.type,blob:await fileResponse.blob()};
      }
      document.getElementById('preview-status').textContent=(locale==='en'?'Version ':locale==='zh-Hant'?'固定版本 ':'固定版本 ')+'v'+result.version.number;
    }else{
      await window.PracticeStore.setScope(scope);if(ticket!==epoch)return;
      project=await window.PracticeStore.get(id);
    }
    if(ticket!==epoch)return;
    if(!project){message(t.missing);return;}
    const name = typeof project.title === 'string' ? project.title : project.title && (project.title[locale] || project.title['zh-CN'] || project.title.en);
    document.getElementById('preview-title').textContent = name || t.status;
    document.title = (name || t.status) + ' · ' + t.brand;
    document.getElementById('preview-back').href = (remoteId?'./index.html#cloud/':'./index.html#project/') + encodeURIComponent(id);
    const file = project.attachment;
    if (!file || !(file.blob instanceof Blob)) { message(t.noFile); return; }
    download.disabled = false;
    download.onclick = () => {
      if (!downloadURL) downloadURL = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    if (!/\.html?$/i.test(file.name)) { message(t.package); return; }
    const source = await file.blob.text();
    if(ticket!==epoch)return;
    // The first parsed policy constrains even HTML that declares its own looser CSP.
    // The unique sandbox origin prevents access to the host's storage and document.
    const policy = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
    document.getElementById('preview-empty').hidden = true;
    replaceFrame('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '">' + source);
  }
  function reload(){const pending=openProject(),ticket=epoch;pending.catch(()=>{if(ticket!==epoch)return;clearPreview();message(t.failed);});}
  if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('tashan-account-sync');channel.onmessage=event=>{if(event.data==='session-changed'){clearPreview();reload();}};}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reload();else clearPreview();});
  window.addEventListener('pageshow',event=>{if(event.persisted)reload();});
  reload();
})();
