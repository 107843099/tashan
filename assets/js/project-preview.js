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
  document.documentElement.lang = locale;
  for (const key of ['brand', 'back', 'download', 'title', 'status', 'description']) document.getElementById('preview-' + key).textContent = t[key];
  document.getElementById('preview-message').textContent = t.loading;
  const frame = document.getElementById('preview-frame');
  frame.title = t.frame;
  const message = value => { document.getElementById('preview-message').textContent = value; };
  let downloadURL;
  window.addEventListener('pagehide', () => { if (downloadURL) URL.revokeObjectURL(downloadURL); });
  async function openProject() {
    const id = new URLSearchParams(location.search).get('project');
    if (!id || !/^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id)) { message(t.missing); return; }
    const project = await window.PracticeStore.get(id);
    if (!project) { message(t.missing); return; }
    const name = typeof project.title === 'string' ? project.title : project.title && (project.title[locale] || project.title['zh-CN'] || project.title.en);
    document.getElementById('preview-title').textContent = name || t.status;
    document.title = (name || t.status) + ' · ' + t.brand;
    document.getElementById('preview-back').href = './index.html#project/' + encodeURIComponent(id);
    const file = project.attachment;
    if (!file || !(file.blob instanceof Blob)) { message(t.noFile); return; }
    const download = document.getElementById('preview-download');
    download.disabled = false;
    download.addEventListener('click', () => {
      if (!downloadURL) downloadURL = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    if (!/\.html?$/i.test(file.name)) { message(t.package); return; }
    const source = await file.blob.text();
    // The first parsed policy constrains even HTML that declares its own looser CSP.
    // The unique sandbox origin prevents access to the host's storage and document.
    const policy = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '">' + source;
    frame.hidden = false;
    document.getElementById('preview-empty').hidden = true;
  }
  openProject().catch(reason => { message(t.failed + ' ' + (reason && reason.message || '')); });
})();
