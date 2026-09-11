/* Versioned local work and explicit publication share one UI, never one implicit save. */
(() => {
  'use strict';
  const store=window.PracticeStore;
  let hooks={},epoch=0,remoteGeneration=0,loaded=false,loading=false,busy=false,capabilities=null,error='',notice='';
  let owned=[],published=[],ownTotal=0,publicTotal=0,ownPage=1,publicPage=1;
  const histories=new Map(),remoteViews=new Map(),pending=new Set(),remotePending=new Set(),historyOpen=new Set();
  const routeVersion=()=>{try{return decodeURIComponent(location.hash.split('/')[2]||'');}catch{return '';}};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy={
    '上传并公开':['上傳並公開','Upload & publish'],'浏览器副本':['瀏覽器副本','Browser copy'],'查看云端项目':['查看雲端專案','View cloud project'],'发布最新版本':['發布最新版本','Publish latest version'],
    '上传并公开这个项目？':['上傳並公開這個專案？','Upload and publish this project?'],'将保存当前版本到云端，并公开给其他成员和游客查看、下载。之后的修改仍需重新发布。':['將目前版本儲存至雲端，並公開供其他成員和訪客查看、下載。之後的修改仍需重新發布。','This version will be saved to the cloud and made available for members and visitors to view and download. Later edits require a new publication.'],
    '已公开，其他成员和游客均可查看。':['已公開，其他成員和訪客均可查看。','Published. Other members and visitors can now view it.'],'版本已上传，公开状态保持不变。':['版本已上傳，公開狀態維持不變。','Version uploaded. Publication remains unchanged.'],'上传未完成，本地副本已保留，可重新上传。':['上傳未完成，本機副本已保留，可重新上傳。','Upload incomplete. Your local copy is safe; you can retry.'],'项目已上传，但公开未完成，请点击“发布此版本”重试。':['專案已上傳，但公開未完成，請點擊「發布此版本」重試。','Uploaded, but publication did not complete. Retry with “Publish this version”.'],
    '查看公开版本':['查看公開版本','View public version'],'复制公开链接':['複製公開連結','Copy public link'],'公开链接已复制。':['公開連結已複製。','Public link copied.'],'复制未完成，请打开公开版本并复制地址栏链接。':['複製未完成，請開啟公開版本並複製網址列連結。','Copy failed. Open the public version and copy its address.'],
    '版本与来源':['版本與來源','Versions & sources'],'固定编号':['固定編號','Project code'],'当前版本':['目前版本','Current version'],'尚未建立版本':['尚未建立版本','No saved version yet'],
    '保存一个版本':['儲存一個版本','Save a version'],'版本记录':['版本記錄','Version history'],'恢复为草稿':['恢復為草稿','Restore as draft'],'来源引用':['來源引用','Source references'],
    '每次完成保存都会留下版本；恢复旧版会生成可编辑草稿。':['每次完成儲存都會留下版本；還原舊版會產生可編輯草稿。','Completed saves keep a version. Restoring a version creates an editable draft.'],
    '未声明参考项目':['未聲明參考專案','No project references declared'],'本机服务存储':['本機服務儲存','Local server storage'],'云端项目':['雲端專案','Cloud projects'],
    '本机服务用于验证上传与发布；尚未连接云端。':['本機服務用於驗證上傳與發布；尚未連接雲端。','The local server exercises uploads and publication. Cloud storage is not connected.'],
    '文件与账号存储在云端，浏览器草稿仍由你选择上传。':['檔案與帳戶儲存在雲端，瀏覽器草稿仍由你選擇上傳。','Accounts and uploaded files are stored in the cloud. You choose which browser drafts to upload.'],
    '保存当前版本到云端':['將目前版本儲存至雲端','Save version to cloud'],'上传到本机服务':['上傳至本機服務','Upload to local server'],
    '正在处理…':['正在處理…','Working…'],'重新读取':['重新讀取','Refresh'],'服务暂不可用，请稍后重试。':['服務暫不可用，請稍後重試。','Service unavailable. Please try again.'],
    '云端尚未配置，当前资料仍可完整备份。':['雲端尚未設定，目前資料仍可完整備份。','Cloud storage is not configured. You can still back up your complete workspace.'],
    '线上上传暂未开放。你仍可保存到此浏览器或导出备份，已保存的版本仍可读取和发布。':['線上上傳暫未開放。你仍可儲存至此瀏覽器或匯出備份，已儲存的版本仍可讀取和發布。','Online uploads are not enabled yet. You can save in this browser or export a backup; saved versions can still be read and published.'],
    '当前上传限制':['目前上傳限制','Current upload limits'],'附件':['附件','Attachment'],'封面':['封面','Cover'],'文字资料':['文字資料','Version text'],'单次合计（含编码）':['單次合計（含編碼）','Total per upload (including encoding)'],
    '文件逐个上传。':['檔案逐一上傳。','Files upload separately.'],'提交资料':['提交資料','Upload manifest'],'上传响应无效，请重试。':['上傳回應無效，請重試。','Invalid upload response. Please try again.'],'请求超时，请重试。':['請求逾時，請重試。','The request timed out. Please try again.'],
    '超过当前上传限制，仍可保存在此浏览器或导出备份。':['超過目前上傳限制，仍可儲存至此瀏覽器或匯出備份。','Exceeds the current upload limit. You can still save in this browser or export a backup.'],
    '已上传的项目':['已上傳的專案','Uploaded projects'],'还没有上传项目。':['尚未上傳專案。','No uploaded projects yet.'],
    '公开作品':['公開作品','Published work'],'这些作品由平台成员选择固定版本公开。':['這些作品由平台成員選擇固定版本公開。','Members have published these specific versions.'],
    '仅自己可见':['僅自己可見','Private'],'已公开':['已公開','Published'],'发布此版本':['發布此版本','Publish this version'],'撤回公开':['撤回公開','Unpublish'],
    '发布选定版本？':['發布選定版本？','Publish the selected version?'],'公开后，游客可以查看和下载这一版内容。请确认你有分享文件与素材的权限。':['公開後，訪客可以查看及下載這一版內容。請確認你有分享檔案與素材的權限。','Visitors will be able to view and download this version. Confirm you have permission to share its files and materials.'],
    '确认发布':['確認發布','Publish'],'取消':['取消','Cancel'],'撤回后，新的公开访问将被阻止。已经被他人下载的副本无法收回。':['撤回後，新的公開存取將被阻止。已被他人下載的副本無法收回。','Unpublishing blocks new public access. Copies already downloaded by others cannot be recalled.'],
    '下载源文件':['下載原始檔案','Download source'],'运行固定版本':['執行固定版本','Run this version'],'保存到此浏览器':['儲存至此瀏覽器','Save to this browser'],
    '项目已上传，尚未公开。':['專案已上傳，尚未公開。','Version uploaded. Publication remains unchanged.'],'所选版本已公开。':['所選版本已公開。','The selected version is now public.'],'已撤回公开。':['已撤回公開。','Publication withdrawn.'],
    '旧版已恢复为草稿，保存后会产生新版本。':['舊版已還原為草稿，儲存後會產生新版本。','The old version is now a draft. Saving it creates a new version.'],'版本已保存。':['版本已儲存。','Version saved.'],
    '本地已有此项目，请先导出备份或在版本记录中继续编辑。':['本機已有此專案，請先匯出備份或在版本記錄中繼續編輯。','This project already exists locally. Back it up or continue from its version history.'],
    '已保存到当前账号的浏览器资料。':['已儲存至目前帳戶的瀏覽器資料。','Saved in this browser for the current account.'],
    '返回项目库':['返回專案庫','Back to projects'],'找不到该版本，或它已撤回公开。':['找不到該版本，或它已撤回公開。','This version is unavailable or is no longer published.'],
    '上一页':['上一頁','Previous'],'下一页':['下一頁','Next'],'登录后可保存与继续创作':['登入後可儲存及繼續創作','Sign in to save and continue creating'],
    '来源项目':['來源專案','Source project'],'未记录版本':['未記錄版本','Version unspecified'],'当前文件尚未上传。':['目前檔案尚未上傳。','These files have not been uploaded yet.'],'此版本已上传。':['此版本已上傳。','This version is uploaded.'],'上传仅保存所选版本，公开发布需另外确认。':['上傳僅儲存所選版本，公開發布需另外確認。','Uploading saves this version. Publishing requires a separate confirmation.'],'内容版本':['內容版本','Content revision'],'文件校验失败，请重试下载。':['檔案校驗失敗，請重新下載。','File verification failed. Please download again.'],'查看已上传版本':['查看已上傳版本','View an uploaded version'],'替换当前草稿？':['取代目前草稿？','Replace the current draft?'],'恢复旧版会替换尚未完成的草稿。如需保留，请先导出备份或完成保存。':['還原舊版會取代尚未完成的草稿。如需保留，請先匯出備份或完成儲存。','Restoring replaces your unfinished draft. Export a backup or finish saving it first if you want to keep it.'],'备份此项目全部版本':['備份此專案全部版本','Back up all project versions'],'完整备份上限 50 MB，按去重后的附件与版本资料计算。':['完整備份上限 50 MB，按去重後的附件與版本資料計算。','Full backups support up to 50 MB of deduplicated files and version data.'],'包含此项目所有已上传版本、源文件、封面和来源引用。':['包含此專案所有已上傳版本、原始檔案、封面和來源引用。','Includes every uploaded version of this project, its files, covers and source references.']
  };
  const language=()=>document.documentElement.lang||'zh-CN';
  const t=key=>copy[key]?.[language()==='en'?1:language()==='zh-Hant'?0:-1]||key;
  const text=key=>escape(t(key));
  const title=value=>typeof value==='object'?value?.[language()]||value?.['zh-CN']||value?.en||'':String(value||'');
  const user=()=>window.TashanAccounts?.user;
  const modeLabel=()=>capabilities?.mode==='supabase'?t('云端项目'):t('本机服务存储');
  const pausedUpload=()=>t('线上上传暂未开放。你仍可保存到此浏览器或导出备份，已保存的版本仍可读取和发布。');
  const byteLabel=bytes=>bytes>=1048576&&bytes%1048576===0?(bytes/1048576)+' MiB':bytes>=1024&&bytes%1024===0?(bytes/1024)+' KiB':Number(bytes).toLocaleString(language())+' B';
  const streamingUpload=()=>capabilities?.uploadTransport==='r2-stream-v1';
  function uploadLimits(stream){
    const limits=capabilities?.limits;
    if(!limits||['attachmentBytes','coverBytes','metadataBytes','requestBytes'].some(key=>!Number.isSafeInteger(limits[key])||limits[key]<=0))throw new Error(pausedUpload());
    return stream?{attachmentBytes:Math.min(limits.attachmentBytes,10*1048576),coverBytes:Math.min(limits.coverBytes,5*1048576),metadataBytes:Math.min(limits.metadataBytes,1048576),requestBytes:Math.min(limits.requestBytes,1048576)}:limits;
  }
  function uploadLimitsMarkup(){
    if(!capabilities?.configured)return '';
    if(!capabilities.canUpload)return `<p class="library-note">${escape(pausedUpload())}</p>`;
    const stream=streamingUpload();if(!stream&&capabilities.uploadPolicy?.mode!=='worker')return '';
    let limits;try{limits=uploadLimits(stream);}catch{return `<p class="library-note">${escape(pausedUpload())}</p>`;}
    const fields=[['attachmentBytes','附件'],['coverBytes','封面'],['metadataBytes','文字资料'],...(stream?[]:[['requestBytes','单次合计（含编码）']])];
    return `<p class="library-note">${text('当前上传限制')}：${fields.map(([key,label])=>`${text(label)} ${escape(byteLabel(limits[key]))}`).join(' · ')}${stream?' · '+text('文件逐个上传。'):''}</p>`;
  }
  const versionLabel=v=>'v'+(v?.number||v?.currentVersionNumber||1);
  function localActionsMarkup(p){
    const cloud=owned.find(item=>item.id===p.id);
    return `<small class="project-visibility">${text(cloud?(cloud.publishedVersionId?'已公开':'仅自己可见'):'浏览器副本')}${cloud?.publishedVersionId?' · v'+(cloud.publishedVersionNumber||1):''}</small><button data-project-action="share" data-id="${escape(p.id)}" ${busy||!capabilities?.canUpload?'disabled':''}>${text('上传并公开')}</button>${cloud?`<a class="btn subtle" href="#cloud/${encodeURIComponent(p.id)}">${text('查看云端项目')}</a>`:''}`;
  }
  function publicActionsMarkup(p){
    if(!p.publishedVersionId)return '';
    return `<div class="public-project-actions"><a class="btn" href="#cloud/${encodeURIComponent(p.id)}/${encodeURIComponent(p.publishedVersionId)}">${text('查看公开版本')}</a><button data-project-action="copy-public-link" data-id="${escape(p.id)}" data-version="${escape(p.publishedVersionId)}">${text('复制公开链接')}</button></div>`;
  }
  const date=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(language(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'';
  const assetURL=url=>typeof url==='string'&&/^\/api\/v1\/(projects|published)\//.test(url)?url:'';
  async function request(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);pending.add(controller);
    const check=()=>{options.guard?.();if(controller.signal.aborted)throw new Error(t('请求超时，请重试。'));};
    try{
      check();const raw=options.rawBody!==undefined,json=options.body!==undefined;
      const response=await fetch('/api/v1'+path,{credentials:'same-origin',cache:'no-store',method:options.method||'GET',headers:{Accept:'application/json',...(raw?{'Content-Type':options.rawBody.type||'application/octet-stream'}:json?{'Content-Type':'application/json'}:{}),...options.headers},...(raw?{body:options.rawBody}:json?{body:JSON.stringify(options.body)}:{}),signal:controller.signal});
      check();const payload=await response.json().catch(()=>({}));check();
      if(!response.ok){if(response.status===401)window.TashanAccounts?.refreshSession();throw new Error(payload.error?.message||t('服务暂不可用，请稍后重试。'));}
      return payload;
    }catch(reason){check();throw reason;
    }finally{clearTimeout(timer);pending.delete(controller);}
  }
  async function refresh(){
    if(loading)return;const ticket=epoch;loading=true;error='';
    try{
      const cap=await request('/projects/capabilities');if(ticket!==epoch)return;capabilities=cap;
      if(cap.configured){
        const result=await request('/published?page='+publicPage);if(ticket!==epoch)return;published=result.projects||[];publicTotal=result.total??published.length;
        if(user()){const mine=await request('/projects?page='+ownPage);if(ticket!==epoch)return;owned=mine.projects||[];ownTotal=mine.total??owned.length;}
      }
    }catch(reason){if(ticket===epoch){error=reason.message;capabilities??={configured:false};}}
    finally{if(ticket===epoch){loading=false;loaded=true;hooks.render?.();}}
  }
  function reset(){epoch++;remoteGeneration++;pending.forEach(controller=>controller.abort());pending.clear();loaded=false;loading=false;busy=false;capabilities=null;error='';notice='';owned=[];published=[];ownTotal=publicTotal=0;ownPage=publicPage=1;histories.clear();remoteViews.clear();remotePending.clear();historyOpen.clear();}
  function sourceMarkup(refs=[]){return refs.length?`<ul class="project-references">${refs.map(ref=>`<li><a href="#${String(ref.projectId).startsWith('local-')&&!hooks.record?.(ref.projectId)?'cloud':'project'}/${encodeURIComponent(ref.projectId)}${String(ref.projectId).startsWith('local-')&&!hooks.record?.(ref.projectId)&&/^version-/.test(ref.versionId)?'/'+encodeURIComponent(ref.versionId):''}">${escape(title(ref.title)||ref.projectCode||ref.projectId)}</a><small>${escape(ref.projectCode||ref.projectId)} · ${ref.versionNumber?'v'+escape(ref.versionNumber):text('未记录版本')}</small>${ref.versionId?`<code>${escape(ref.versionId)}</code>`:''}</li>`).join('')}</ul>`:`<p class="library-note">${text('未声明参考项目')}</p>`;}
  function detailMarkup(p){
    const record=hooks.record?.(p.id),versions=histories.get(p.id)||[];
    return `<section class="project-lifecycle" data-local-history="${escape(p.id)}"><div class="section-title"><div><span class="project-code">${escape(record?.projectCode||p.projectCode||p.id)}</span><h2>${text('版本与来源')}</h2></div><span class="status">${record?.currentVersionNumber?'v'+record.currentVersionNumber:p.currentVersionId?text('内容版本')+' '+escape(p.currentVersionId.slice(-8)):text('尚未建立版本')}</span></div>${messageMarkup()}${record?`<p class="library-note">${text('每次完成保存都会留下版本；恢复旧版会生成可编辑草稿。')}</p><div class="row"><button class="primary" data-project-action="share" data-id="${escape(p.id)}" ${busy||!capabilities?.canUpload?'disabled':''}>${text('上传并公开')}</button><button data-project-action="version" data-id="${escape(p.id)}" ${busy?'disabled':''}>${text('保存一个版本')}</button><button data-project-action="upload" data-id="${escape(p.id)}" ${busy||!capabilities?.canUpload?'disabled':''}>${text(capabilities?.mode==='supabase'?'保存当前版本到云端':'上传到本机服务')} ↑</button></div>${uploadLimitsMarkup()}${capabilities?.configured?`<p class="library-note">${escape(modeLabel())} · ${text(owned.some(item=>item.id===p.id&&item.latestVersionId===record.currentVersionId)?'此版本已上传。':'上传仅保存所选版本，公开发布需另外确认。')}</p>`:`<p class="library-note">${text('云端尚未配置，当前资料仍可完整备份。')}</p>`}<details class="version-history" data-history-id="${escape(p.id)}" ${historyOpen.has(p.id)?'open':''}><summary>${text('版本记录')} · ${versions.length}</summary>${versions.map(v=>`<div class="version-row"><div><strong>${versionLabel(v)}</strong><small>${escape(date(v.createdAt))}</small>${v.note?`<p>${escape(v.note)}</p>`:''}</div><button data-project-action="restore" data-id="${escape(p.id)}" data-version="${escape(v.id)}" ${busy?'disabled':''}>${text('恢复为草稿')}</button></div>`).join('')}</details>`:''}<h3>${text('来源引用')}</h3>${sourceMarkup(record?.sourceReferences||p.sourceReferences||[])}</section>`;
  }
  const messageMarkup=()=>`${notice?`<p class="account-message" role="status">${escape(notice)}</p>`:''}${error?`<p class="account-message account-message--error" role="alert">${escape(error)}</p>`:''}`;
  function pagination(kind,page,total){return total>24?`<div class="account-pagination"><button data-project-action="${kind}-previous" ${page===1||loading?'disabled':''}>${text('上一页')}</button><span>${page} / ${Math.ceil(total/24)}</span><button data-project-action="${kind}-next" ${page*24>=total||loading?'disabled':''}>${text('下一页')}</button></div>`:'';}
  function listMarkup(list,own=false){return `<div class="remote-project-list">${list.map(p=>`<article class="remote-project"><a href="#cloud/${encodeURIComponent(p.id)}">${assetURL(p.coverURL)?`<img src="${escape(assetURL(p.coverURL))}" alt="" loading="lazy">`:''}<span><small class="project-code">${escape(p.projectCode||p.id)}</small><strong>${escape(title(p.title))}</strong><small>${p.publishedVersionId?text('已公开')+' · v'+(p.publishedVersionNumber||p.latestVersionNumber||1):text('仅自己可见')}</small></span><span aria-hidden="true">↗</span></a>${own?`<div class="remote-project-actions">${p.latestVersionId!==p.publishedVersionId?`<button data-project-action="publish" data-id="${escape(p.id)}" data-version="${escape(p.latestVersionId)}" ${busy?'disabled':''}>${text('发布最新版本')}</button>`:''}${p.publishedVersionId?`<button class="subtle" data-project-action="unpublish" data-id="${escape(p.id)}" ${busy?'disabled':''}>${text('撤回公开')}</button>`:''}</div>${publicActionsMarkup(p)}`:''}</article>`).join('')}</div>`;}
  function workspaceMarkup(){return `<section class="cloud-workspace"><div class="section-title"><div><span class="project-code">${capabilities?.mode==='supabase'?'CLOUD':'SERVER'}</span><h2>${escape(modeLabel())}</h2></div><button class="subtle" data-project-action="refresh" ${loading?'disabled':''}>${text('重新读取')} ↻</button></div><p class="library-note">${text(capabilities?.configured?(capabilities.mode==='supabase'?'文件与账号存储在云端，浏览器草稿仍由你选择上传。':'本机服务用于验证上传与发布；尚未连接云端。'):'云端尚未配置，当前资料仍可完整备份。')}</p>${uploadLimitsMarkup()}${messageMarkup()}${loading?`<p role="status">${text('正在处理…')}</p>`:owned.length?listMarkup(owned,true):`<p class="library-note">${text('还没有上传项目。')}</p>`}${pagination('own',ownPage,ownTotal)}</section>`;}
  function discoveryMarkup(){return published.length?`<section class="cloud-workspace published-library"><div class="section-title"><div><h2>${text('公开作品')}</h2><p class="library-note">${text('这些作品由平台成员选择固定版本公开。')}${capabilities?.mode==='local'?' '+text('本机服务存储'):''}</p></div></div>${listMarkup(published)}${pagination('public',publicPage,publicTotal)}</section>`:'';}
  function remoteMarkup(id){
    const result=remoteViews.get(id);
    if(!result||result.routeVersion!==routeVersion())return `<section class="page-head" data-remote-project="${escape(id)}"><a href="#discover">← ${text('返回项目库')}</a><p role="status">${text('正在处理…')}</p></section>`;
    if(result.error)return `<section class="page-head"><a href="#discover">← ${text('返回项目库')}</a><p role="alert">${escape(result.error)}</p></section>`;
    const {project:p,version:v,own,versions=[]}=result,m=v.metadata||{},file=v.files?.attachment,cover=v.files?.coverFile;
    const preview=`./project-preview.html?remote=${encodeURIComponent(p.id)}&version=${encodeURIComponent(v.id)}${own?'':'&public=1'}`;
    return `<section class="page-head"><a class="back-link" href="#discover">← ${text('返回项目库')}</a><p class="project-code">${escape(p.projectCode)} · ${versionLabel(v)} · ${escape(modeLabel())}</p><h1>${escape(title(m.title||p.title))}</h1><p>${escape(title(m.purpose||m.summary))}</p></section>${messageMarkup()}<div class="remote-detail"><div>${assetURL(cover?.url)?`<img class="remote-cover" src="${escape(assetURL(cover.url))}" alt="${escape(title(m.title))}">`:''}<p class="preserve-lines">${escape(title(m.core||m.outcome))}</p><h3>${text('来源引用')}</h3>${sourceMarkup(v.sourceReferences||m.sourceReferences||[])}</div><aside class="side-panel"><p>${escape(p.projectCode)} · ${versionLabel(v)}</p><p>${escape(date(v.createdAt))}</p><div class="side-actions">${own?`<label class="field"><span>${text('查看已上传版本')}</span><select data-remote-version="${escape(p.id)}" ${busy?'disabled':''}>${versions.map(item=>`<option value="${escape(item.id)}" ${item.id===v.id?'selected':''}>v${item.number} · ${escape(date(item.createdAt))}</option>`).join('')}</select></label><button data-project-action="backup" data-id="${escape(p.id)}" ${busy?'disabled':''}>${text('备份此项目全部版本')} ↓</button><small class="library-note">${text('完整备份上限 50 MB，按去重后的附件与版本资料计算。')}</small>`:''}${file&&/\.html?$/i.test(file.name)?`<a class="btn primary" href="${preview}">${text('运行固定版本')} ↗</a>`:''}${assetURL(file?.url)?`<a class="btn" href="${escape(assetURL(file.url))}" download>${text('下载源文件')} ↓</a>`:''}${user()?`<button data-project-action="download" data-id="${escape(p.id)}" ${busy?'disabled':''}>${text('保存到此浏览器')}</button>`:`<a class="btn" href="#login">${text('登录后可保存与继续创作')}</a>`}${own?`${publicActionsMarkup(p)}<button class="primary" data-project-action="publish" data-id="${escape(p.id)}" data-version="${escape(v.id)}" ${busy||p.publishedVersionId===v.id?'disabled':''}>${text(p.publishedVersionId===v.id?'已公开':'发布此版本')}</button>${p.publishedVersionId?`<button class="subtle" data-project-action="unpublish" data-id="${escape(p.id)}">${text('撤回公开')}</button>`:''}`:''}</div></aside></div>`;
  }
  function invalidateRemote(id){remoteGeneration++;remoteViews.delete(id);}
  async function remote(id){
    const selected=routeVersion(),key=id+'/'+selected;if(remoteViews.get(id)?.routeVersion===selected||remotePending.has(key))return;remotePending.add(key);const ticket=epoch,generation=remoteGeneration;
    try{
      let mine=owned.find(p=>p.id===id);
      if(!mine&&user()){try{mine=(await request('/projects/'+encodeURIComponent(id))).project;}catch{}}
      const publicProject=published.find(p=>p.id===id);
      let p=mine||publicProject;
      if(!p){const results=await request('/published/'+encodeURIComponent(id));p=results.project;}
      if(!p)throw new Error(t('找不到该版本，或它已撤回公开。'));
      const own=Boolean(mine),vid=selected||(own?p.latestVersionId:p.publishedVersionId);
      const value=await request('/'+(own?'projects':'published')+'/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(vid));
      const history=own?await request('/projects/'+encodeURIComponent(id)+'/versions'):{versions:[]};
      if(ticket===epoch&&generation===remoteGeneration)remoteViews.set(id,{...value,own,versions:history.versions||[],routeVersion:selected});
    }catch(reason){if(ticket===epoch&&generation===remoteGeneration)remoteViews.set(id,{error:reason.message,routeVersion:selected});}
    finally{remotePending.delete(key);if(ticket===epoch)hooks.render?.();}
  }
  async function work(fn){if(busy)return;const ticket=epoch;busy=true;error='';notice='';hooks.render?.();try{await fn(ticket);}catch(reason){if(ticket===epoch&&reason.name!=='ProjectSessionChanged')error=reason.message;}finally{if(ticket===epoch){busy=false;hooks.render?.();}}}
  async function upload(id,ticket){
    const actorId=user()?.id,guard=()=>{if(ticket!==epoch||!actorId||user()?.id!==actorId||user()?.mustChangePassword||user()?.status==='disabled'){const reason=new Error('Session changed');reason.name='ProjectSessionChanged';throw reason;}};
    guard();
    if(!capabilities?.canUpload)throw new Error(capabilities?.configured?pausedUpload():t('云端尚未配置，当前资料仍可完整备份。'));
    const stream=streamingUpload();
    let record=await store.get(id);guard();
    if(!record.currentVersionId){await store.saveVersion(id);guard();record=await store.get(id);guard();}
    const version=await store.getVersion(id,record.currentVersionId);guard();
    const body=checkUploadSize(record,version,stream),path='/projects/'+encodeURIComponent(id);
    if(stream){
      for(const [field,file] of Object.entries(body.files)){
        const bytes=await version.snapshot[field].blob.arrayBuffer();guard();
        const hash=await crypto.subtle.digest('SHA-256',bytes);guard();
        file.sha256=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      }
      const prepared=await request(path+'/uploads',{method:'POST',body,guard});guard();
      if(typeof prepared.ready!=='boolean'||typeof prepared.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(prepared.fingerprint))throw new Error(t('上传响应无效，请重试。'));
      const versionPath=path+'/versions/'+encodeURIComponent(version.id);
      if(!prepared.ready)for(const field of Object.keys(body.files)){
        guard();await request(versionPath+'/files/'+encodeURIComponent(field),{method:'PUT',rawBody:version.snapshot[field].blob,headers:{'Content-Type':body.files[field].type,'X-Tashan-Fingerprint':prepared.fingerprint},guard});guard();
      }
      await request(versionPath+'/commit',{method:'POST',body:{fingerprint:prepared.fingerprint},guard});guard();
    }else{
      const {attachment,coverFile}=await store.encodeRecord(version.snapshot);guard();
      body.files={...(attachment?{attachment}:{}),...(coverFile?{coverFile}:{})};
      await request(path+'/versions',{method:'POST',body,guard});guard();
    }
    invalidateRemote(id);await hooks.reloadLocal?.();guard();await refresh();guard();notice=t('版本已上传，公开状态保持不变。');location.hash='cloud/'+id;
    return version.id;
  }
  // A local save is durable before sharing starts. Failed uploads/publication never discard it.
  async function share(id){
    if(busy||!user())return;
    const ticket=epoch,actor=user().id;
    const accepted=await hooks.confirm?.(t('上传并公开这个项目？'),t('将保存当前版本到云端，并公开给其他成员和游客查看、下载。之后的修改仍需重新发布。'),t('上传并公开'));
    if(!accepted||ticket!==epoch||user()?.id!==actor||busy)return;
    await work(async current=>{
      const guard=()=>{if(current!==epoch||user()?.id!==actor){const reason=new Error('Session changed');reason.name='ProjectSessionChanged';throw reason;}};
      let uploaded=false;
      try{
        const versionId=await upload(id,current);guard();uploaded=true;
        // Read the owner record directly: its project may not be on the current workspace page.
        const {project:p}=await request('/projects/'+encodeURIComponent(id),{guard});guard();
        if(p.publishedVersionId!==versionId)await request('/projects/'+encodeURIComponent(id)+'/publish',{method:'POST',body:{versionId,expectedVersionId:p.publishedVersionId||null},guard});
        guard();invalidateRemote(id);publicPage=1;await refresh();guard();invalidateRemote(id);notice=t('已公开，其他成员和游客均可查看。');location.hash='cloud/'+id;
      }catch(reason){guard();notice='';throw new Error(t(uploaded?'项目已上传，但公开未完成，请点击“发布此版本”重试。':'上传未完成，本地副本已保留，可重新上传。')+' '+reason.message);}
    });
  }
  function checkUploadSize(record,version,stream=false){
    const limits=uploadLimits(stream);
    const {attachment,coverFile,...metadata}=version.snapshot;
    const body={projectCode:record.projectCode,version:{id:version.id,number:version.number,createdAt:version.createdAt,note:version.note||'',sourceReferences:metadata.sourceReferences||[]},metadata,files:{}};
    const tooLarge=(label,maximum)=>{throw new Error(t(label)+' '+byteLabel(maximum)+'：'+t('超过当前上传限制，仍可保存在此浏览器或导出备份。'));};
    let encodedBytes=0;
    for(const [field,file,key,label] of [['attachment',attachment,'attachmentBytes','附件'],['coverFile',coverFile,'coverBytes','封面']])if(file){
      if(!(file.blob instanceof Blob))throw new Error(t('文件校验失败，请重试下载。'));
      if(file.blob.size>limits[key])tooLarge(label,limits[key]);
      body.files[field]=stream?{name:file.name,type:file.type||'application/octet-stream',size:file.blob.size,sha256:'0'.repeat(64)}:{name:file.name,type:file.type,base64:''};
      if(!stream)encodedBytes+=4*Math.ceil(file.blob.size/3);
    }
    const normalized={...body.version,createdAt:new Date(body.version.createdAt).toISOString(),note:typeof body.version.note==='string'?body.version.note.slice(0,2000):'',metadata};
    const size=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if(size(normalized)>limits.metadataBytes)tooLarge('文字资料',limits.metadataBytes);
    // Streaming sends only descriptors here. Legacy Base64 is ASCII and needs no JSON escaping.
    if(size(body)+encodedBytes>limits.requestBytes)tooLarge(stream?'提交资料':'单次合计（含编码）',limits.requestBytes);
    return body;
  }
  async function readSnapshot(p,v,ticket,cache=new Map()){
    const record={...v.metadata,id:p.id,projectCode:p.projectCode};
    for(const [field,file] of Object.entries(v.files||{})){
      const key=file.sha256+':'+file.size;if(file.sha256&&cache.has(key)){record[field]={name:file.name,type:file.type,blob:cache.get(key)};continue;}
      const url=assetURL(file.url);if(!url)throw new Error(t('服务暂不可用，请稍后重试。'));
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);pending.add(controller);
      try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(t('找不到该版本，或它已撤回公开。'));const blob=await response.blob();if(blob.size!==file.size)throw new Error(t('文件校验失败，请重试下载。'));if(file.sha256){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw new Error(t('文件校验失败，请重试下载。'));}record[field]={name:file.name,type:file.type,blob};if(file.sha256)cache.set(key,blob);}finally{clearTimeout(timer);pending.delete(controller);}
      if(ticket!==epoch)throw new Error('Session changed');
    }
    return record;
  }
  async function backup(id,ticket){
    const history=await request('/projects/'+encodeURIComponent(id)+'/versions'),versions=[],cache=new Map();
    for(const item of history.versions){
      const result=await request('/projects/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(item.id));if(ticket!==epoch)return;
      const snapshot=await readSnapshot(result.project,result.version,ticket,cache);if(ticket!==epoch)return;
      versions.push({...result.version,projectId:id,projectCode:result.project.projectCode,snapshot});
    }
    const blob=await store.exportProjectVersions(versions);if(ticket!==epoch)return;
    hooks.showBackup?.(blob,t('包含此项目所有已上传版本、源文件、封面和来源引用。'));
  }
  async function download(id,ticket){
    const view=remoteViews.get(id);if(!view?.version)return;
    const m=await readSnapshot(view.project,view.version,ticket);
    if(ticket!==epoch)return;
    let record;
    if(view.own){record=await store.adoptVersion(m,view.version);}
    else{
      delete m.id;delete m.projectCode;delete m.currentVersionId;delete m.currentVersionNumber;
      m.sourceReferences=[...(m.sourceReferences||[]),{projectId:id,projectCode:view.project.projectCode,versionId:view.version.id,versionNumber:view.version.number,title:title(m.title)}];
      record=await store.put(m,{saveVersion:true});
    }
    if(ticket!==epoch)return;await hooks.reloadLocal?.();notice=t('已保存到当前账号的浏览器资料。');location.hash='project/'+record.id;
  }
  async function click(event){
    const button=event.target.closest('[data-project-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
    const {projectAction:action,id,version}=button.dataset;
    if(busy)return;
    if(action==='refresh'){remoteGeneration++;remoteViews.clear();await refresh();return;}
    if(action.startsWith('own-')||action.startsWith('public-')){if(action.startsWith('own-'))ownPage=Math.max(1,ownPage+(action.endsWith('next')?1:-1));else publicPage=Math.max(1,publicPage+(action.endsWith('next')?1:-1));await refresh();return;}
    if(!user()){location.hash='login';return;}
    if(busy)return;
    if(action==='share'){await share(id);return;}
    if(action==='copy-public-link'){
      await work(async()=>{try{await navigator.clipboard.writeText(new URL('#cloud/'+encodeURIComponent(id)+'/'+encodeURIComponent(version),location.href).href);notice=t('公开链接已复制。');}catch{throw new Error(t('复制未完成，请打开公开版本并复制地址栏链接。'));}});return;
    }
    if(action==='restore'&&Object.keys(await store.getDraft()||{}).length){const accepted=await hooks.confirm?.(t('替换当前草稿？'),t('恢复旧版会替换尚未完成的草稿。如需保留，请先导出备份或完成保存。'),t('恢复为草稿'));if(!accepted)return;}
    const actionEpoch=epoch,actorId=user()?.id;
    if(action==='publish'||action==='unpublish'){
      const accepted=await hooks.confirm?.(t(action==='publish'?'发布选定版本？':'撤回公开'),t(action==='publish'?'公开后，游客可以查看和下载这一版内容。请确认你有分享文件与素材的权限。':'撤回后，新的公开访问将被阻止。已经被他人下载的副本无法收回。'),t(action==='publish'?'确认发布':'撤回公开'));
      if(!accepted)return;
    }
    if(actionEpoch!==epoch||user()?.id!==actorId)return;
    await work(async ticket=>{
      if(action==='version'){await store.saveVersion(id);if(ticket!==epoch)return;histories.delete(id);await hooks.reloadLocal?.();notice=t('版本已保存。');}
      if(action==='restore'){await store.restoreVersion(id,version);if(ticket!==epoch)return;await hooks.reloadLocal?.();notice=t('旧版已恢复为草稿，保存后会产生新版本。');location.hash='upload';}
      if(action==='upload')await upload(id,ticket);
      if(action==='download')await download(id,ticket);
      if(action==='backup')await backup(id,ticket);
      if(action==='publish'||action==='unpublish'){
        const p=owned.find(item=>item.id===id)||remoteViews.get(id)?.project;
        await request('/projects/'+encodeURIComponent(id)+(action==='publish'?'/publish':'/publication'),{method:action==='publish'?'POST':'DELETE',body:{...(action==='publish'?{versionId:version}:{}),expectedVersionId:p?.publishedVersionId||null}});
        if(ticket!==epoch)return;notice=t(action==='publish'?'所选版本已公开。':'已撤回公开。');invalidateRemote(id);await refresh();if(ticket!==epoch)return;invalidateRemote(id);
      }
    });
  }
  const bound=new WeakSet();
  function mount(root){
    if(!bound.has(root)){root.addEventListener('toggle',event=>{const node=event.target;if(node.matches?.('[data-history-id]'))node.open?historyOpen.add(node.dataset.historyId):historyOpen.delete(node.dataset.historyId);},true);root.addEventListener('click',event=>{click(event).catch(reason=>{error=reason.message;hooks.render?.();});},true);root.addEventListener('change',event=>{const select=event.target.closest('[data-remote-version]');if(!select)return;event.stopImmediatePropagation();const id=select.dataset.remoteVersion,versionId=select.value;location.hash='cloud/'+encodeURIComponent(id)+'/'+encodeURIComponent(versionId);},true);bound.add(root);}
    if(!loaded&&!loading&&window.TashanAccounts?.initialized)queueMicrotask(refresh);
    root.querySelectorAll('[data-local-history]').forEach(node=>{const id=node.dataset.localHistory;if(histories.has(id)||!hooks.record?.(id))return;histories.set(id,[]);const ticket=epoch;store.listVersions(id).then(list=>{if(ticket===epoch){histories.set(id,list);hooks.render?.();}}).catch(()=>{});});
    const view=root.querySelector('[data-remote-project]');if(view&&loaded&&!loading)queueMicrotask(()=>remote(view.dataset.remoteProject));
  }
  window.TashanProjects={init:options=>{hooks=options;},reset,invalidate:id=>{if(id)histories.delete(id);else histories.clear();},mount,detailMarkup,localActionsMarkup,workspaceMarkup,discoveryMarkup,remoteMarkup,refresh,share,get canShare(){return !!capabilities?.canUpload;},get busy(){return busy;}};
})();
