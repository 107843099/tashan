(() => {
'use strict';
if(typeof history!=='undefined'&&'scrollRestoration' in history)history.scrollRestoration='manual';
const root=document.getElementById('practice-ui');
const catalog=window.PRACTICE_LIBRARY;
if(!catalog?.projects){root.textContent='本地项目目录未生成，请运行 npm run catalog 后刷新。';return;}
let projects=[...catalog.projects];
const store=window.PracticeStore;
const accounts=window.TashanAccounts;
const lifecycle=window.TashanProjects;
const ai=window.TashanAI;
let workspaceScope=null,workspaceEpoch=0;
let guestSession=false;try{guestSession=sessionStorage.getItem('tashan-guest-entry')==='1';}catch{}
function requireAccount(){if(!accounts||accounts.user)return true;location.hash='login';render();window.dispatchEvent(new CustomEvent('tashan:login-request',{detail:{reason:'guest-action'}}));return false;}
function guestNotice(){if(!accounts||accounts.user||!guestSession)return '';const labels=locale==='en'?['Guest browsing','Explore public projects. Sign in to save work.','Sign in']:locale==='zh-Hant'?['訪客瀏覽','可體驗公開作品；登入後即可儲存與創作。','登入']:['访客浏览','可体验公开作品；登录后即可保存与创作。','登录'];return `<p class="library-note guest-session-note">${e(labels[0])} · ${e(labels[1])} <a href="#login">${e(labels[2])} ↗</a></p>`;}
const workspaceKey=key=>workspaceScope&&key.startsWith('practice-library-')?key+':account:'+workspaceScope:key;
let localRecords=[], objectURLs=[];
const dictionaries=window.PRACTICE_TRANSLATIONS;
const icons=window.PRACTICE_ICONS||{};
// Critical controls ship with the UI so an older optional icon bundle cannot blank them.
// Tabler Icons (MIT), copied from assets/icons/{language,sun,moon}.svg.
const headerIcons={"language":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M9 6.371c0 4.418 -2.239 6.629 -5 6.629\" /> <path d=\"M4 6.371h7\" /> <path d=\"M5 9c0 2.144 2.252 3.908 6 4\" /> <path d=\"M12 20l4 -9l4 9\" /> <path d=\"M19.1 18h-6.2\" /> <path d=\"M6.694 3l.793 .582\" /> </svg>","sun":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" /> <path d=\"M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7\" /> </svg>","moon":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008\" /> </svg>"};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(workspaceKey(key)))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(workspaceKey(key),JSON.stringify(value));return true;}catch{return false;}};
let locale='zh-CN';try{const l=localStorage.getItem('practice-language');if(['zh-CN','zh-Hant','en'].includes(l))locale=l;}catch{}
const saved=read('practice-library-bookmarks',[]);
const state={type:'all',search:'',subject:'',stage:'',region:'',grade:'',ungraded:true,verification:'',filtersOpen:false,saved:new Set(Array.isArray(saved)?saved:[]),tasks:read('practice-library-tasks',{}),draft:{},step:1,error:'',preview:'',fileName:'',busy:false,storageReady:false,storageError:'',detailTab:'teaching',deskTab:'projects',adapt:{},briefs:{},scroll:0,languageOpen:false};
const subjects=['语文','历史','数学','地理','物理','化学','生物','信息技术','综合实践活动'];
const stages=['学前教育','小学','初中','高中','高等教育','教师专业发展'];
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(key,vars={})=>{let text=locale==='zh-CN'?key:(dictionaries[locale]?.[key]??key);return text.replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??''));};
const e=value=>escapeHTML(value), txt=(key,vars)=>e(t(key,vars));
const local=value=>value==null?'':typeof value==='object'?(value[locale]||value['zh-CN']||''):t(String(value));
const icon=name=>icons[name]||'';
const brandSymbol='<svg class="brand-symbol" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 23.5 8.5 10.5 16 5 24.5 10 27 23.5 17 28Z" fill="currentColor" opacity=".13"/><path d="m6 23.5 2.5-13L16 5l8.5 5 2.5 13.5L17 28Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="m9 21 5.5-9 3.5 6 3-4 3 7" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/><path d="m16 5-1.5 7M27 23.5 24 21M6 23.5 9 21" stroke="currentColor" stroke-width="1.15" opacity=".55"/><path d="m18 18 3-4 3 7-7 2Z" fill="#cde6b7" opacity=".8"/></svg>';
const project=id=>projects.find(p=>p.id===id)||state.tasks[id]?.reference;
const projectURL=id=>'#project/'+encodeURIComponent(id);
function route(){let hash='';try{hash=decodeURIComponent(location.hash.slice(1));}catch{}const [requested,id]=hash.split('/'),view=requested==='publish'?'upload':requested;return {view:['discover','project','adapt','guide','desk','upload','login','account','admin','cloud'].includes(view)?view:'discover',id};}
function toast(message){const node=document.getElementById('toast');node.textContent=t(message);clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.textContent='',3500);}
async function persistWorkspace(value){
 const epoch=workspaceEpoch,next=await store.updateWorkspaceState(value);if(epoch!==workspaceEpoch)return false;
 state.saved=new Set(next.bookmarks);state.tasks=next.tasks;return true;
}
async function bookmark(id){
 const epoch=workspaceEpoch,next=new Set(state.saved);next.has(id)?next.delete(id):next.add(id);state.busy=true;
 try{if(!await persistWorkspace({toggleBookmark:id}))return;
 document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach(b=>{b.classList.toggle('saved',state.saved.has(id));b.setAttribute('aria-pressed',String(state.saved.has(id)));b.setAttribute('aria-label',t(state.saved.has(id)?'取消收藏':'收藏')+' '+local(project(id).title));if(b.classList.contains('bookmark-wide'))b.innerHTML=icon('bookmark')+txt(state.saved.has(id)?'已收藏':'收藏');});
 }catch(error){if(epoch===workspaceEpoch)toast(storageFailure(error));}finally{if(epoch===workspaceEpoch)state.busy=false;}
}
function bookmarkButton(p,wide=false,overlay=false){const active=state.saved.has(p.id);return `<button type="button" class="${wide?'bookmark-wide':'icon-btn'} ${overlay?'card-bookmark':''} ${active?'saved':''}" data-save="${p.id}" aria-label="${e(t(active?'取消收藏':'收藏')+' '+local(p.title))}" aria-pressed="${active}">${icon('bookmark')}${wide?txt(active?'已收藏':'收藏'):''}</button>`;}
function status(p){const key=p.verification.status==='checked'?'运行已检查':p.verification.status==='needs-review'?'内容待修订':'待验证';return `<span class="status ${p.verification.status}">${p.verification.status==='checked'?'✓ ':''}${txt(key)}</span>`;}
function header(){
 const current=route().view, dark=document.documentElement.dataset.theme==='dark';
 const languages=[['zh-CN','简体中文'],['zh-Hant','繁體中文'],['en','English']];
 const languageLabel=t('切换语言')+' · '+languages.find(([code])=>code===locale)[1];
 const themeLabel=t(dark?'切换浅色':'切换深色');
 return `<a class="skip" href="#main">${txt('跳至主要内容')}</a>
 <header class="site-header"><div class="wrap header-inner">
  <a class="wordmark" href="#discover" aria-label="${txt('他山首页')}"><span class="brand-mark">${brandSymbol}</span><span class="brand-name"><strong>${txt('他山')}</strong><small>TASHAN</small></span></a>
  <nav class="main-nav" aria-label="${txt('主导航')}">
   <a class="nav-link" href="#discover" ${['discover','project','adapt'].includes(current)?'aria-current="page"':''}>${txt('发现项目')}</a>
   <a class="nav-link" href="#guide" ${current==='guide'?'aria-current="page"':''}>${txt('使用指南')}</a>
   <a class="nav-link" href="#desk" ${['desk','upload'].includes(current)?'aria-current="page"':''}>${txt('我的工作台')}</a>
  </nav>
  <div class="header-tools">
   ${accounts?.header()||''}
   <div class="language-control">
    <button type="button" class="header-icon" data-action="language-menu" aria-label="${e(languageLabel)}" title="${e(languageLabel)}" aria-expanded="${state.languageOpen}" aria-controls="language-options">${headerIcons.language}</button>
    <div class="language-options" id="language-options" role="group" aria-label="${txt('选择语言')}" ${state.languageOpen?'':'hidden'}>
     <p>${txt('选择语言')}</p>
     ${languages.map(([code,label])=>`<button type="button" class="language-option" data-language="${code}" lang="${code}" aria-pressed="${locale===code}"><span>${label}</span>${locale===code?icon('check'):''}</button>`).join('')}
    </div>
   </div>
   <button type="button" class="header-icon" data-action="theme" aria-label="${e(themeLabel)}" title="${e(themeLabel)}">${headerIcons[dark?'sun':'moon']}</button>
  </div>
 </div></header>`;
}
function setLanguageMenu(open,restoreFocus=false){
 state.languageOpen=open;
 const trigger=root.querySelector('[data-action="language-menu"]');
 const options=document.getElementById('language-options');
 trigger?.setAttribute('aria-expanded',String(open));
 if(options)options.hidden=!open;
 if(restoreFocus)trigger?.focus({preventScroll:true});
}
function footer(){return `<footer class="site-footer"><div class="wrap footer-inner"><p>${txt('他山')} · ${txt('让好的教学想法继续生长。')} ${!accounts||accounts.user?`<button class="subtle brand-replay" type="button" data-action="replay-intro"><span aria-hidden="true">↻</span>${txt('重播开场')}</button>`:''}</p><p>${txt('本地内容库')} · ${projects.length} ${txt('个项目')} <a href="#guide">${txt('来源与验证说明')} ↗</a></p></div></footer>`;}
function promptCover(p){const excerpt=p.document?.blocks[0]?.text||p.document?.content||'';return `<div class="prompt-cover ${p.id}"><small>PROMPT / TEACHING RESOURCES</small><strong>${e(local(p.title).replace(/\s*Prompt$/,''))}</strong><p lang="zh-CN">${e(excerpt.replace(/[#*`]/g,'').slice(0,105))}</p><div class="prompt-line"><span>${p.document?.blocks.length||1} ${txt('段原始内容')}</span><span>↗</span></div></div>`;}
function card(p){
 const method=p.teaching?.method,discovery=route().view==='discover';
 return `<article class="project-card ${discovery?'project-card--discovery':''} ${p.kind==='prompt'?'has-artwork':''}" data-project="${e(p.id)}">
 ${discovery?'<div class="card-media">':''}
 <a class="card-visual" href="${projectURL(p.id)}" aria-label="${e(local(p.title))}">${p.cover?`<img src="${e(p.cover)}" width="1280" height="720" loading="lazy" alt="${e(local(p.title))} · ${txt(p.example?'AI 生成示例':p.isLocal?'上传的预览图':'实际页面截图')}">`:promptCover(p)}</a>
 ${discovery?bookmarkButton(p,false,true)+'</div>':''}
 <div class="card-content"><div class="card-meta"><span class="subject-label">${txt(p.subject)} · ${txt(p.kind==='visual'?'教学可视化':'Prompt 工具')}</span>${status(p)}</div>
 <h3><a href="${projectURL(p.id)}">${e(local(p.title))}</a></h3><p class="card-summary">${e(local(p.summary))}</p>
 <div class="card-tags">${p.stages.map(s=>`<span>${txt(s)}</span>`).join('')}${p.example?`<span>${txt('附生成示例')}</span>`:''}</div>
 ${method?`<p class="card-method">${e(local(method))}</p>`:''}
 ${discovery?'':`<div class="card-footer"><span class="avatar" aria-hidden="true">${e(p.contributors[0].slice(-1))}</span><span class="source-name">${p.isLocal?txt('我的本地项目'):e(p.contributors.join(' / '))}</span>${bookmarkButton(p)}</div>`}</div></article>`;
}

function gradeOptions(){if(!state.region)return [];const results=[];const names=state.stage?[state.stage]:['学前教育','小学','初中','高中'];const nums=['一','二','三','四','五','六'];for(const stage of names){if(stage==='学前教育'){['K1','K2','K3'].forEach(v=>results.push({value:'学前教育:'+v,label:v}));}else if(['小学','初中','高中'].includes(stage)){const count=stage==='小学'?6:3;for(let i=1;i<=count;i++){const grade=stage==='小学'?i:state.region==='中国香港'&&stage==='高中'?i+3:i;const label=locale==='en'?t(stage)+' '+grade:state.region==='中国香港'?(stage==='小学'?'小':'中')+nums[grade-1]:t(stage)+nums[i-1]+t('年级');results.push({value:stage+':'+i,label});}}}return results;}
function selectFilter(key,label,values){return `<label class="field"><span>${txt(label)}</span><select data-filter="${key}" id="filter-${key}">${values.map(v=>{const [value,name]=Array.isArray(v)?v:[v,t(v)];return `<option value="${e(value)}" ${state[key]===value?'selected':''}>${e(name)}</option>`;}).join('')}</select></label>`;}
function filters(){return `<div class="filter-panel" id="filter-panel" ${state.filtersOpen?'':'hidden'}><div class="filter-grid">${selectFilter('subject','学科',[['',t('全部学科')],...subjects])}${selectFilter('stage','适用学段',[['',t('全部学段')],...stages])}${selectFilter('verification','验证状态',[['',t('全部状态')],['checked',t('运行已检查')],['pending',t('待验证')],['needs-review',t('内容待修订')]])}${selectFilter('region','年级所属地区',[['',t('选择地区后筛选年级')],'中国内地','中国香港'])}<label class="field"><span>${txt('建议年级')}</span><select data-filter="grade" id="filter-grade" ${state.region?'':'disabled'}><option value="">${txt('不限具体年级')}</option>${gradeOptions().map(g=>`<option value="${e(g.value)}" ${g.value===state.grade?'selected':''}>${e(g.label)}</option>`).join('')}</select></label></div><div class="filter-bottom"><label class="checkline"><input type="checkbox" data-filter="ungraded" ${state.ungraded?'checked':''}>${txt('同时查看未限定年级的项目，根据前置知识判断')}</label><button class="subtle" data-action="reset-filters">${txt('清除筛选')}</button></div></div>`;}
function filtered(){
 const term=state.search.trim().toLowerCase();
 return projects.filter(p=>{
 const hay=[...Object.values(p.title),...Object.values(p.summary),...p.contributors,p.subject,t(p.subject),p.id,p.teaching?JSON.stringify(p.teaching):''].join(' ').toLowerCase();
 return (!term||hay.includes(term))&&(state.type==='all'||p.kind===state.type)&&(!state.subject||p.subject===state.subject)&&(!state.stage||p.stages.includes(state.stage))&&(!state.verification||p.verification.status===state.verification)&&(!state.grade||(state.ungraded&&p.stages.includes(state.grade.split(':')[0])));
 });
}

function resultMarkup(){const items=filtered();return `<div class="result-line" role="status" aria-live="polite"><span>${txt('找到 {count} 个项目',{count:items.length})}${state.grade?' · '+txt('建议年级仅作参考'):''}</span><span>${txt('来源于本地文件')}</span></div>${items.length?`<div class="project-grid">${items.map(card).join('')}</div>`:`<div class="empty"><h3>${txt('没有找到匹配的项目')}</h3><p>${txt('试试其他关键词，或清除筛选条件。')}</p><button data-action="reset-filters">${txt('查看全部项目')}</button></div>`}`;}
function tabs(){return `<div class="tabs-and-filter"><div class="type-tabs" role="group" aria-label="${txt('项目类别')}">${[['all','全部项目'],['visual','可视化项目'],['prompt','Prompt 工具']].map(([type,label])=>`<button data-type="${type}" aria-pressed="${state.type===type}">${txt(label)} <span class="count">${type==='all'?projects.length:projects.filter(p=>p.kind===type).length}</span></button>`).join('')}</div><button class="filter-toggle" data-action="filters" aria-expanded="${state.filtersOpen}" aria-controls="filter-panel">${icon('adjustments-horizontal')}${txt('筛选')}</button></div>`;}
function discover(){
 return `<section class="hero"><div class="hero-copy"><div class="eyebrow">${txt('教师创作，课堂共用')}</div><h1>${txt('为下一节课，')}<br><span>${txt('琢出新的可能。')}</span></h1><p>${txt('把抽象知识变成看得见的体验，让彼此的教学灵感，在你的课堂继续生长。')}</p><div class="hero-actions"><button class="primary" data-action="browse">${txt('浏览项目库')} <span aria-hidden="true">→</span></button><a class="btn subtle" href="#desk">${txt('我的工作台')} ↗</a></div></div>
 ${window.PracticeShowcase?.markup(projects,{t,local,e,projectURL})||''}</section>
 <div class="library-overview"><p>${txt('一个持续生长的教学作品集')}</p><div><span><strong>${projects.filter(p=>p.kind==='visual').length}</strong> ${txt('可视化项目')}</span><span><strong>${projects.filter(p=>p.kind==='prompt').length}</strong> ${txt('Prompt 工具')}</span><span><strong>${projects.filter(p=>p.example).length}</strong> ${txt('生成示例')}</span></div></div>
 <section class="collection" id="collection"><div class="collection-heading"><div><h2>${txt('发现值得带进课堂的创作')}</h2><p>${txt('先看作品，再找到适合学生的教学方式。')}</p></div><form class="search-form" id="library-search" role="search">${icon('search')}<input name="search" aria-label="${txt('搜索项目')}" placeholder="${txt('搜索知识点、项目或创作者')}" value="${e(state.search)}"><button type="submit">${txt('搜索')}</button></form></div><div id="catalog-tools">${tabs()}${filters()}</div><div id="catalog-results">${resultMarkup()}</div><p class="library-note">${txt('教学建议依据项目内容与课程资料整理；生成示例和运行检查均不代表课堂成效验证。')}</p></section>`;
}

function missing(){return `<div class="empty"><h1>${txt('项目未找到')}</h1><a class="btn" href="#discover">${txt('返回项目库')}</a></div>`;}
function detail(p){
 if(!p)return missing();
 const available=['teaching',...(p.example?['example']:[]),...(p.document?['prompts']:[]),'source'];
 const active=available.includes(state.detailTab)?state.detailTab:'teaching';
 return `<div class="page-head detail-head"><a class="back-link" href="#discover">← ${txt('返回项目库')}</a><div class="row"><span class="subject-label">${txt(p.subject)} / ${txt(p.kind==='visual'?'教学可视化':'Prompt与AI工作流')}</span>${status(p)}${p.id==='conics'?`<span class="status needs-review">${txt('概念表述待修订')}</span>`:''}</div><h1>${e(local(p.title))}</h1><p>${e(local(p.summary))}</p></div>
 <div class="detail-layout"><div class="detail-main"><div class="detail-preview ${p.example?'artwork-preview':''}">${p.cover?`<button class="image-preview-button" data-action="view-image" data-id="${e(p.id)}" aria-label="${txt('查看完整预览图')}"><img src="${e(p.cover)}" width="1280" height="720" alt="${e(local(p.example?.title||p.title))}"><span>${txt('查看大图')} ↗</span></button>`:`<div class="card-visual">${promptCover(p)}</div>`}<div class="preview-caption"><span>${txt(p.example?'AI 生成示例':p.isLocal?'上传的预览图':'实际页面截图')}</span><span>${p.example?e(local(p.example.title)):txt('先观察，再动手体验')}</span></div></div>
 <nav class="detail-tabs" aria-label="${txt('项目详情导航')}">${available.map(key=>`<button data-detail-tab="${key}" aria-pressed="${active===key}">${txt({teaching:'教学设计',example:'示例作品',prompts:'Prompt 原文',source:'来源与验证'}[key])}</button>`).join('')}</nav>
 <div class="detail-tab-content" id="detail-tab-content">${active==='teaching'?teaching(p):active==='example'?exampleDetail(p):active==='prompts'?prompts(p):sourceDetail(p)}</div></div>
 <aside class="side-panel project-aside"><div class="aside-heading"><span class="subject-label">${txt('带进你的下一节课')}</span><h2>${txt(p.kind==='visual'?'体验一个好想法':'把灵感变成作品')}</h2></div><dl class="facts"><dt>${txt('建议学段')}</dt><dd>${p.stages.map(s=>txt(s)).join(' / ')}</dd><dt>${txt('适用学生')}</dt><dd>${e(local(p.teaching?.audience||p.prior))}</dd><dt>${txt('教学方式')}</dt><dd>${e(local(p.teaching?.method|| (p.kind==='visual'?'浏览器打开，教师引导观察':'复制原始 Prompt 到外部 AI 工具')))}</dd>${p.teaching?.duration?`<dt>${txt('建议时长')}</dt><dd>${e(local(p.teaching.duration))}</dd>`:''}</dl>
 <div class="side-actions">${p.kind==='visual'?projectLaunch(p):`<button class="primary" data-action="show-prompts">${txt('查看与复制 Prompt')} →</button>`}<a class="btn" href="#adapt/${e(p.id)}">${txt('基于它继续创作')}</a>${bookmarkButton(p,true)}${p.isLocal?`<button class="subtle" data-action="edit-project" data-id="${e(p.id)}">${txt('编辑这个项目')}</button>`:''}</div><div class="aside-source"><span class="avatar">${e(p.contributors[0].slice(-1))}</span><div><strong>${p.isLocal?txt('我的本地项目'):e(p.contributors.join(' / '))}</strong><small>${txt(p.isLocal?'保存在此浏览器':'来自本地教学作品库')}</small></div></div></aside></div>
 ${lifecycle?.detailMarkup(p)||''}
 ${p.related.length?`<section class="detail-section"><h2>${txt('沿着这个思路，继续探索')}</h2><div class="related-list">${p.related.map(id=>project(id)).filter(Boolean).map(item=>`<a href="${projectURL(item.id)}">${item.cover?`<img src="${e(item.cover)}" alt="" width="90" height="60" loading="lazy">`:''}<div><span class="subject-label">${txt(item.subject)}</span><strong>${e(local(item.title))}</strong></div><span>→</span></a>`).join('')}</div></section>`:''}`;
}
function projectLaunch(p){
 if(!p.isLocal)return `<a class="btn primary" href="${e(p.sourceHref)}" target="_blank" rel="noopener">${txt('打开本地项目')} ↗</a>`;
 if(p.attachmentName&&/\.html?$/i.test(p.attachmentName))return `<a class="btn primary" href="./project-preview.html?project=${encodeURIComponent(p.id)}">${txt('运行上传的作品')} ↗</a>`;
 if(p.userLink)return `<a class="btn primary" href="${e(p.userLink)}" target="_blank" rel="noopener">${txt('打开项目链接')} ↗</a>`;
 return p.sourceHref?`<a class="btn primary" href="${e(p.sourceHref)}" download="${e(p.attachmentName)}">${txt('下载项目文件')} ↓</a>`:`<p class="library-note">${txt('这个条目目前保存了成果说明，可编辑补充项目文件。')}</p>`;
}
function teaching(p){
 const a=p.teaching;
 if(!a)return `<section class="teaching-section"><h2>${txt('适用学生与课堂安排')}</h2><p>${e(local(p.prior))}</p><p>${txt('可在继续创作中补充学生背景与教学目标。')}</p></section>`;
 return `<section class="teaching-section"><div class="section-title"><h2>${txt('让作品服务于学习')}</h2><span class="subject-label">${txt(p.isLocal?'上传者填写的教学说明':'根据项目与课程资料整理')}</span></div><p class="learning-goal">${e(local(a.objective))}</p><div class="teaching-foundations"><div><h3>${txt('学生准备')}</h3><p>${e(local(a.audience))}</p></div><div><h3>${txt('先备知识')}</h3><p>${e(local(a.prior))}</p></div></div>
 ${a.activities?.length?`<h3 class="activity-title">${txt('一节课，可以这样展开')}</h3><ol class="activity-timeline">${a.activities.map((step,i)=>`<li><span class="step-number">${String(i+1).padStart(2,'0')}</span><p>${e(local(step))}</p></li>`).join('')}</ol>`:''}
 <div class="evidence-note"><h3>${txt('看见学生学会了什么')}</h3><p>${e(local(a.evidence||a.objective))}</p></div>${a.limitation?`<details class="teaching-boundary" ${['conics','chemistry','dynasty'].includes(p.id)?'open':''}><summary>${txt('教学边界与使用提醒')}</summary><p>${e(local(a.limitation))}</p></details>`:''}
 ${a.sources?.length?`<details class="reference-notes"><summary>${txt('课程与教学参考')} <span>${a.sources.length}</span></summary><p>${txt('以下资料支持教学建议的整理，项目的具体适配仍需教师判断。')}</p>${a.sources.map(ref=>`<a href="${e(ref.url)}" target="_blank" rel="noopener"><strong>${e(ref.title)} ↗</strong><span>${e(local(ref.note))}</span></a>`).join('')}</details>`:''}</section>`;
}
function exampleDetail(p){
 const a=p.example;
 return `<section class="teaching-section"><h2>${e(local(a.title))}</h2><p>${e(local(a.caption))}</p><div class="row"><button class="primary" data-action="view-image" data-id="${e(p.id)}">${txt('查看完整作品')} ↗</button><a class="btn" href="${e(a.imageHref||a.cover)}" download>${txt('下载示例图片')} ↓</a></div><div class="info-strip">${txt('按原始模板填入具体主题生成；这是本次制作的示例，尚未进行课堂试教。')}</div><details class="reference-notes"><summary>${txt('示例参数与改写说明（原文）')}</summary><p lang="zh-CN">${e(a.parameters)}</p><p lang="zh-CN">${e(a.adaptation)}</p></details><details class="prompt-block"><summary>${txt('本次生图使用的 Prompt')}</summary><div class="prompt-block-content"><textarea readonly aria-label="${txt('本次生图使用的 Prompt')}">${e(a.prompt)}</textarea><button data-action="copy-image-prompt" data-id="${e(p.id)}">${txt('复制生图 Prompt')}</button></div></details>${(a.editPrompts||[]).map((edit,i)=>`<details class="prompt-block"><summary>${txt('图片修订记录')} ${i+1}</summary><div class="prompt-block-content"><textarea readonly lang="en" aria-label="${txt('图片修订记录')} ${i+1}">${e(edit)}</textarea></div></details>`).join('')}</section>`;
}
function sourceDetail(p){
 const v=p.verification;
 return `<section class="teaching-section"><h2>${txt('验证记录')}</h2><div class="row">${status(p)}<span class="subject-label">${v.date||txt('尚未安排验证')}</span></div><p class="evidence">${txt(v.scope)}</p><p>${txt(v.evidence)}</p><div class="info-strip">${txt('运行检查与示例生成不等于课堂验证。课堂成效需要实际试教记录支持。')}</div>${p.classroomRecord?`<h3>${txt('上传者提供的课堂记录')}</h3><p>${e(p.classroomRecord)}</p>`:''}
 ${p.isLocal&&p.kind==='visual'&&p.resultDescription?`<h3>${txt('成果说明')}</h3><p class="preserve-lines">${e(p.resultDescription)}</p>`:''}${p.tested?`<h3>${txt('上传者填写的 AI 测试记录')}</h3><p>${e(p.tested)}</p>`:''}<h3>${txt('本地来源')}</h3><div class="source-path">${e(p.source)}</div><div class="row source-actions">${p.document?`<a class="btn" href="${e(p.document.download)}" download="${p.isLocal?'prompt.md':''}">${txt('下载原始文档')} ↓</a>`:''}${(p.packageHref||((p.kind==='visual'||p.isLocal)&&p.sourceHref))?`<a class="btn" href="${e(p.packageHref||p.sourceHref)}" download="${e(p.attachmentName||'')}">${txt(p.isLocal?'下载上传的原文件':p.packageHref?'下载完整项目包':'下载项目文件')} ↓</a>`:''}</div>${p.hasCompanionFiles?`<p>${txt('此项目包含配套文件，请保留原目录结构；单个 HTML 下载不包含全部资源。')}</p>`:''}
 <h3>${txt('开放权限')}</h3><p>${txt(p.licenseLabel||'未提供授权说明，复用前请确认')}</p>${p.duplicates.length?`<details class="reference-notes"><summary>${txt('已合并 {count} 份重复文件',{count:p.duplicates.length})}</summary>${p.duplicates.map(path=>`<p class="source-path">${e(path)}</p>`).join('')}</details>`:''}</section>`;
}

function prompts(p){return `<section class="detail-section" id="original-prompts"><h2>${txt(p.kind==='prompt'?'原始 Prompt 与模板':'随项目附带的创作 Prompt')}</h2><p>${txt('下方内容直接读取本地文档，保留原文。可以逐段复制，也可以下载完整文件。')}</p>${p.id==='chemistry'?`<div class="info-strip">${txt('原文区分“原文 Prompt”与“还原 Prompt”；还原内容不代表历史对话逐字记录。')}</div>`:''}${p.document.blocks.map((b,i)=>`<details class="prompt-block" ${i===0?'open':''}><summary>${e(b.title)}</summary><div class="prompt-block-content"><textarea readonly lang="zh-CN" id="prompt-${i}" aria-label="${txt('原始 Prompt')} ${i+1}">${e(b.text)}</textarea><button data-copy="${p.id}:${i}">${txt('复制这段 Prompt')}</button></div></details>`).join('')}<details class="prompt-block"><summary>${txt('查看完整原始文档')}</summary><div class="prompt-block-content"><textarea readonly lang="zh-CN" aria-label="${txt('完整原始文档')}">${e(p.document.content)}</textarea><button data-copy="${p.id}:full">${txt('复制完整文档')}</button></div></details></section>`;}
function defaultAdapt(p){
 const a=p.teaching;
 return {audience:a?local(a.audience)+'\n'+local(a.prior):local(p.prior),goal:a?local(a.objective):'',setting:a?[local(a.method),local(a.duration)].filter(Boolean).join(' · '):'',boundary:t('先完成一个可检查的核心演示。'),mechanisms:[]};
}

function inputField(name,label,value,placeholder='',area=true){return `<label class="field"><span>${txt(label)}</span>${area?`<textarea data-edit="${name}" placeholder="${txt(placeholder)}">${e(value||'')}</textarea>`:`<input data-edit="${name}" value="${e(value||'')}" placeholder="${txt(placeholder)}">`}</label>`;}
function adapt(p){
 if(!p)return missing();
 const form=state.adapt[p.id]||(state.adapt[p.id]=state.tasks[p.id]?.form||defaultAdapt(p));
 const brief=state.briefs[p.id]??state.tasks[p.id]?.text??'';state.briefs[p.id]=brief;
 return `<div class="page-head"><a class="back-link" href="${projectURL(p.id)}">← ${txt('返回原项目')}</a><h1>${txt('把这个思路，用到你的课堂')}</h1><p>${txt('已带入项目的教学建议，调整后整理成可复制的创作任务。')}</p></div><div class="creation-layout"><section class="editor creation-form"><div class="creation-source">${p.cover?`<img src="${e(p.cover)}" width="80" height="60" alt="">`:''}<div><small>${txt('参考项目')}</small><strong>${e(local(p.title))}</strong></div></div><form id="adapt-form" data-project-id="${e(p.id)}">${inputField('audience','你准备教什么？学生已经会什么？',form.audience,'填写学科、学生背景与前置知识')}${inputField('goal','学生哪里不容易理解？你希望怎样改？',form.goal,'描述一个具体的教学困难')}${inputField('setting','课堂怎样使用？有什么条件？',form.setting,'例如：教师投屏、浏览器运行、无需登录')}${inputField('boundary','第一版必须做到什么？哪些先不做？',form.boundary,'明确第一版范围')}<fieldset><legend>${txt('你希望保留哪些设计？')}</legend><div class="row">${['逐步呈现','当前步骤高亮','暂停预测'].map(m=>`<label class="checkline"><input type="checkbox" data-mechanism="${e(m)}" ${form.mechanisms.includes(m)?'checked':''}>${txt(m)}</label>`).join('')}</div></fieldset>${errorMarkup()}<button class="primary" type="submit">${txt(brief?'更新任务说明':'整理任务说明')} →</button></form></section>
 <aside class="brief-panel"><div class="section-title"><h2>${txt('你的创作任务')}</h2><span class="status">${txt(brief?'可编辑':'待整理')}</span></div>${brief?`<label class="field"><span>${txt('确认并编辑给外部 AI 的任务说明')}</span><textarea id="task-brief" rows="18" data-brief="${e(p.id)}">${e(brief)}</textarea></label><div class="brief-actions"><button class="primary" data-action="copy-brief" data-id="${e(p.id)}">${txt('复制任务说明')}</button><button data-action="save-brief" data-id="${e(p.id)}">${txt('保存到工作台')}</button><button class="subtle" data-action="brief-to-draft" data-id="${e(p.id)}">${txt('作为新项目继续整理')} →</button></div>`:`<div class="brief-empty"><span>${icon('book-2')}</span><h3>${txt('好问题，是好作品的起点。')}</h3><p>${txt('确认左侧四项信息，这里会生成一份包含学生、目标、使用条件与交付要求的任务说明。')}</p></div>`}${ai?.markup('prompt',p.id)||''}</aside></div>`;
}

function makeBrief(p,form){return [t('教学创作任务说明'),t('参考项目')+': '+local(p.title),t('本地来源')+': '+p.source,'',t('学生与前置基础')+'\n'+form.audience,t('教学问题与目标')+'\n'+form.goal,t('使用条件')+'\n'+form.setting,t('保留的设计')+'\n'+(form.mechanisms.map(value=>t(value)).join(', ')||t('请先提出适合当前目标的设计建议。')),t('第一版范围')+'\n'+(form.boundary||t('先完成一个可检查的核心演示。')),t('交付与核对')+'\n'+t('提供可运行的成果、使用说明和教师检查要点。不要虚构课堂效果。保留参考来源，复用代码与素材前确认权限。')].join('\n\n');}
function workspace(){
 const bookmarks=projects.filter(p=>state.saved.has(p.id)), tasks=Object.entries(state.tasks);
 return `<div class="page-head workspace-head"><div><h1>${txt('我的工作台')}</h1><p>${txt('收藏灵感，打磨作品，留下每一次教学创作。')}</p></div><button class="primary" data-action="new-project">${icon('plus')}${txt('分享项目')}</button></div>
 ${accounts?.workspaceNotice()||''}${lifecycle?.workspaceMarkup()||''}
 <div class="desk-overview">${[['projects','我的项目',localRecords.length],['tasks','创作任务',tasks.length],['bookmarks','我的收藏',bookmarks.length]].map(([key,label,count])=>`<button data-desk-tab="${key}" aria-pressed="${state.deskTab===key}"><span>${txt(label)}</span><strong>${count}</strong><span aria-hidden="true">↗</span></button>`).join('')}</div>
 <div class="desk-layout"><section class="desk-main"><div class="section-title"><h2>${txt({projects:'我的项目与草稿',tasks:'正在创作',bookmarks:'我的收藏'}[state.deskTab])}</h2><span class="subject-label">${txt('保存在此浏览器')}</span></div>
 ${state.deskTab==='projects'?`${Object.keys(state.draft).length?`<div class="draft-row"><span class="draft-icon">${icon('book-2')}</span><div><small>${txt('未完成的草稿')}</small><strong>${e(state.draft.title||t('未命名实践'))}</strong><p>${txt(state.draft.coverFile?'文字、附件与预览图已保留':'可以随时补充内容和预览图')}</p></div><a class="btn" href="#upload">${txt('继续填写')} →</a></div>`:''}
 ${localRecords.length?`<div class="local-project-list">${localRecords.map(r=>project(r.id)).filter(Boolean).map(p=>`<article class="local-project-row"><a href="${projectURL(p.id)}">${p.cover?`<img src="${e(p.cover)}" alt="" width="124" height="84">`:''}</a><div><span class="subject-label">${txt(p.subject)} · ${txt(p.kind==='prompt'?'Prompt 工具':'教学可视化')}</span><h3><a href="${projectURL(p.id)}">${e(local(p.title))}</a></h3><p><span class="project-code">${e(p.projectCode||p.id)}</span> · ${p.currentVersionNumber?'v'+p.currentVersionNumber+' · ':''}${txt('更新于')} ${e(formatDate(p.updatedAt))}</p></div><div class="local-row-actions"><button data-action="edit-project" data-id="${e(p.id)}">${txt('编辑')}</button><button class="subtle" data-action="delete-project" data-id="${e(p.id)}">${txt('删除')}</button></div></article>`).join('')}</div>`:`<div class="empty work-empty"><h3>${txt('让下一次好课，从你的作品开始。')}</h3><p>${txt('上传一个可视化文件，或保存一段好用的 Prompt。')}</p><button class="primary" data-action="new-project">${txt('添加第一个项目')}</button></div>`}`
 :state.deskTab==='tasks'?(tasks.length?tasks.map(([id,task])=>`<div class="workspace-row"><div><strong>${e(local(project(id)?.title||id))}</strong><p>${e(task.form?.goal||t('任务说明已保存'))}</p></div><div class="row">${project(id)?`<a class="btn" href="#adapt/${e(id)}" data-resume="${e(id)}">${txt('继续编辑任务')}</a>`:''}<button data-action="copy-saved-task" data-id="${e(id)}">${txt('复制任务说明')}</button><button class="subtle" data-action="delete-task" data-id="${e(id)}">${txt('删除')}</button></div></div>`).join(''):`<div class="empty"><p>${txt('还没有保存创作任务。打开一个项目，点击“基于它继续创作”即可开始。')}</p><a class="btn" href="#discover">${txt('发现项目')}</a></div>`)
 :(bookmarks.length?`<div class="project-grid">${bookmarks.map(card).join('')}</div>`:`<div class="empty"><p>${txt('收藏项目，留给下一次备课。')}</p><a class="btn" href="#discover">${txt('发现项目')}</a></div>`)}</section>
 <aside class="desk-sidebar"><h3>${txt('把作品留在手边')}</h3><p>${txt('浏览器草稿与服务端文件分别保存。导出完整备份，便于保留或迁移到另一台设备。')}</p><button data-action="export-backup" ${state.busy?'disabled':''}>${txt('导出本地备份')} ↓</button><label class="btn file-label">${txt('导入备份')} ↑<input type="file" id="import-backup" accept="application/json,.json"></label><small>${txt('完整备份包含项目、文件、草稿、收藏、创作任务和版本历史。')}</small><a href="#guide">${txt('查看使用指南')} ↗</a>${accounts?.user&&store?.exportGuest?accounts.guestExportMarkup():''}${Object.keys(read('practice-library-draft',{})).length?`<button class="subtle" data-action="restore-legacy-draft">${txt('恢复旧版文字草稿')}</button>`:''}</aside></div>`;
}

function upload(){
 const d=state.draft;
 return `<div class="page-head"><a class="back-link" href="#desk">← ${txt('返回工作台')}</a><h1>${txt(d.id?'继续打磨你的作品':'分享你的教学实践')}</h1><p>${txt('作品先落地，教学思路再展开。所有内容保存到本地，随时可以调整。')}</p></div><div class="upload-layout"><section class="editor upload-editor"><div class="upload-toolbar"><span class="subject-label">${txt(d.id?'编辑本地项目':'新项目')} · ${state.step} / 3</span><button class="subtle" data-action="save-draft" ${state.busy?'disabled':''}>${txt(state.busy?'正在保存…':'保存草稿')}</button></div><ol class="step-nav">${['提交成果','补充教学信息','确认并保存'].map((name,i)=>`<li ${state.step===i+1?'aria-current="step"':''}><b>${i+1}</b>${txt(name)}</li>`).join('')}</ol><form id="upload-form">
 ${state.step===1?`<h2>${txt('先让我们看见你的作品')}</h2><div class="kind-choices" role="group" aria-label="${txt('项目类别')}">${[['visual','教学可视化','可运行的网页、互动实验或演示'],['prompt','Prompt 工具','可复用的提示词、模板与生成示例']].map(([value,label,note])=>`<button type="button" data-draft-kind="${value}" aria-pressed="${(d.kind||'visual')===value}"><strong>${txt(label)}</strong><span>${txt(note)}</span></button>`).join('')}</div>${draftField('core',d.kind==='prompt'?'Prompt 正文':'项目链接或成果说明',d.kind==='prompt'?'粘贴可复用的完整提示词':'粘贴链接或描述你准备分享的成果')}
 <div class="file-drop"><label class="field"><span>${txt('添加项目文件')}</span><input id="upload-file" type="file" accept=".html,.htm,.zip,.md,.markdown,.txt,.json,.pdf,.docx,.pptx"><small>${e(d.attachment?.name||t('HTML、ZIP、Markdown 或文档，最大 10 MB。'))}</small></label>${d.attachment?`<button type="button" class="subtle" data-action="remove-attachment">${txt('移除文件')}</button>`:''}</div>
 ${ai?.markup('upload','draft')||''}
 <div class="file-drop"><label class="field"><span>${txt('添加封面或生成示例')}</span><input id="upload-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><small>${txt('PNG、JPEG、WebP 或 GIF，最大 5 MB；会随项目保存。')}</small></label>${d.coverFile?`<button type="button" class="subtle" data-action="remove-cover">${txt('更换前可移除当前图片')}</button>`:''}</div><button type="button" class="subtle" data-action="load-example">${txt('用一个示例试试流程')} ↗</button>`
 :state.step===2?`<h2>${txt('让另一位教师知道，怎样用它')}</h2>${draftField('title','项目名称','让另一位教师一眼知道这是什么',false)}${draftField('purpose','它能帮助教师或学生完成什么？')}<div class="form-columns"><label class="field"><span>${txt('学科')}</span><select data-draft="subject"><option value="">${txt('请选择')}</option>${subjects.map(x=>`<option value="${e(x)}" ${d.subject===x?'selected':''}>${txt(x)}</option>`).join('')}</select></label><label class="field"><span>${txt('建议学段')}</span><select data-draft="stage"><option value="">${txt('请选择')}</option>${stages.map(x=>`<option value="${e(x)}" ${d.stage===x?'selected':''}>${txt(x)}</option>`).join('')}</select></label></div>${ai?.markup('teaching','draft')||''}${draftField('audience','谁会操作？最终帮助谁？')}${draftField('prior','使用前需要具备什么基础？')}${draftField('outcome','希望达到什么结果？')}${draftField('setting','准备怎样使用？有什么设备或环境要求？')}<details class="optional-fields"><summary>${txt('补充测试、课堂记录与来源')}</summary>${d.kind==='prompt'?draftField('tested','实际测试过的 AI 工具','未测试请如实填写'):''}<label class="field"><span>${txt('实际课堂使用记录')}</span><select data-draft="used"><option value="no" ${d.used!=='yes'?'selected':''}>${txt('尚无课堂使用记录')}</option><option value="yes" ${d.used==='yes'?'selected':''}>${txt('已有课堂使用记录')}</option></select></label>${draftField('record','实际在哪些学生中使用过？')}${draftField('source','参考来源','填写参考项目或材料来源')}${referenceEditor()}</details>`
 :`<h2>${txt('准备好，加入你的作品库')}</h2><div class="review-title"><strong>${e(d.title)}</strong><span class="status">${txt('待验证')}</span></div><p>${e(d.purpose)}</p><dl class="facts review-facts"><dt>${txt('适用学生')}</dt><dd>${e(d.audience)}</dd><dt>${txt('前置知识')}</dt><dd>${e(d.prior)}</dd><dt>${txt('学习目标')}</dt><dd>${e(d.outcome)}</dd><dt>${txt('教学方式')}</dt><dd>${e(d.setting)}</dd><dt>${txt('项目文件')}</dt><dd>${e(d.attachment?.name||t('使用填写的文字内容'))}</dd></dl><button type="button" class="subtle" data-action="previous-step">${txt('返回调整教学信息')}</button><label class="field"><span>${txt('开放权限')}</span><select data-draft="license">${[['unconfirmed','待确认'],['open','开放再创作'],['teach','仅限教学使用'],['show','仅供展示体验']].map(([v,l])=>`<option value="${v}" ${(d.license||'unconfirmed')===v?'selected':''}>${txt(l)}</option>`).join('')}</select></label><label class="checkline"><input data-confirm="content" type="checkbox" ${d.content?'checked':''}>${txt('我已检查预览、教学信息和实际使用状态。')}</label><p class="library-note">${txt('保存后会出现在项目库和工作台；不会公开发布。')}</p>`}
 ${errorMarkup()}<div class="upload-next">${state.step>1?`<button type="button" data-action="previous-step">← ${txt('上一步')}</button>`:''}<button type="submit" class="primary" ${state.busy||!state.storageReady?'disabled':''}>${txt(state.busy?'正在保存…':state.step===1?'下一步：教学信息':state.step===2?'下一步：确认保存':d.id?'保存修改':'保存到本地项目库')} →</button></div></form></section>
 <aside class="upload-side"><div class="section-title"><h2>${txt('项目卡片预览')}</h2><span class="subject-label">${txt('实时预览')}</span></div><div id="draft-card-preview">${draftPreview()}</div><div class="upload-hint"><h3>${txt('一个好项目，也讲得清楚')}</h3><p>${txt('清晰的作品图、适合的学生，以及一个具体的课堂用法，会让好想法更容易被理解。')}</p><small>${txt('项目文件与图片保存在此浏览器，可在工作台导出备份。')}</small></div></aside></div>`;
}
function referenceEditor(){
 const refs=state.draft.sourceReferences||[];
 return `<label class="field"><span>${txt('引用平台项目与当前版本')}</span><select id="reference-project"><option value="">${txt('请选择参考项目')}</option>${projects.filter(p=>p.id!==state.draft.id).map(p=>`<option value="${e(p.id)}">${e(p.projectCode||p.id)} · ${e(local(p.title))}</option>`).join('')}</select></label><button type="button" class="subtle" data-action="reference-add">${txt('添加引用')} ＋</button><ul class="project-references">${refs.map((ref,i)=>`<li><span>${e(local(ref.title)||ref.projectCode||ref.projectId)}</span><small>${e(ref.projectCode||ref.projectId)} · ${ref.versionNumber?'v'+ref.versionNumber:e(ref.versionId||t('未记录版本'))}</small><button type="button" class="subtle" data-action="reference-remove" data-index="${i}">${txt('移除引用')}</button></li>`).join('')}</ul>`;
}
function draftPreview(){
 const d=state.draft;
 return `<article class="draft-card">${state.preview?`<img src="${e(state.preview)}" alt="${txt('项目卡片预览')}" width="640" height="400">`:`<div class="preview-placeholder"><span>${icon('book-2')}</span><p>${txt('添加一张能说明作品的图片')}</p></div>`}<div><span class="subject-label">${txt(d.subject||'学科待填写')} · ${txt(d.kind==='prompt'?'Prompt 工具':'教学可视化')}</span><h3>${e(d.title||t('你的作品名称'))}</h3><p>${e(d.purpose||t('它将如何帮助学生理解一个知识点？'))}</p><span class="status">${txt(d.stage||'学段待填写')}</span></div></article>`;
}
function errorMarkup(){return state.error?`<p class="error" role="alert" tabindex="-1">${txt(state.error)}</p>`:'';}

function draftField(key,label,placeholder='',area=true){return inputField(key,label,state.draft[key],placeholder,area).replace('data-edit=','data-draft=');}
function guide(){return `<section class="guide"><div class="page-head"><h1>${txt('第一次使用，从这里开始')}</h1><p>${txt('发现、体验、改造，再分享。')}</p></div>${[
['我只是想找到一个能用的项目','选择学科、学段或关键词，打开项目介绍，再点击“打开本地项目”。项目在独立标签页运行，原目录中的配套文件保持可用。'],
['我想使用这些 Prompt','打开 Prompt 条目，展开原始内容并复制。界面可切换语言，原文保持不变；请在外部 AI 工具中使用，并人工检查生成结果。'],
['验证状态代表什么？','“运行已检查”代表记录中列出的基础交互已经测试；“待验证”代表尚未完成该检查；“内容待修订”代表发现了具体问题。它们都不代表课堂成效认证。'],
['这些内容来自哪里？','项目和文档来自本地 vibe coding库。相同文件合并展示，压缩包中的 Prompt 读取为原始文档。卡片中的姓名来自目录名；不据此推断实际作者或课堂使用记录。'],
['哪些内容是为展示补充的？','教学建议依据本地项目与课程参考资料整理。5 个 Prompt 项目附本次生成的示例图，保存在源资料同目录；它们不代表历史作品或课堂成效。原文与参考来源可在详情中核对。'],
['我想把一个好思路用到自己的课堂','选择“基于它继续创作”，填写学生背景、目标、使用条件和第一版范围。确认任务说明后复制到外部 AI 工具，成果完成后可回来保存分享草稿。'],
['可以下载和重新分享吗？','本地拥有文件不代表已获得公开再分发授权。当前材料未统一附带开放许可，下载和再创作前请确认原作者及第三方素材的权限。'],
['如何更新本地项目库？','页面读取由本地文件生成的目录。修改文件后运行 npm run catalog 更新；新增展示条目可在 data/catalog-curation.json 中登记，检查记录在 data/verification.json 中维护。'],
['工作台数据保存在哪里？',ai?.guide()||'收藏、任务、草稿和项目版本按账号保存在此浏览器，可完整导出备份。上传到服务端后可在其他设备登录读取；公开发布需选择固定版本并确认。']
].map(([q,a],i)=>`<details ${i===0?'open':''}><summary>${txt(q)}</summary><p>${txt(a)}</p></details>`).join('')}</section>`;}
function render(){
 let {view,id}=route();document.documentElement.lang=locale;
 if(accounts){
  if(!accounts.initialized)view='login';
  else if(accounts.user?.mustChangePassword)view='account';
  else if(!accounts.user&&!(guestSession&&view==='discover')&&!(view==='project'&&catalog.projects.some(p=>p.id===id))&&view!=='guide'&&view!=='cloud')view='login';
  if(accounts.initialized&&view!==route().view)history.replaceState(null,'',location.pathname+location.search+'#'+view);
 }
 state.renderedView=view;
 const content=['login','account','admin'].includes(view)&&accounts?accounts.render(view):view==='cloud'?lifecycle?.remoteMarkup(id)||'':view==='discover'?discover()+(lifecycle?.discoveryMarkup()||''):view==='project'?detail(project(id)):view==='adapt'?adapt(project(id)):view==='desk'?workspace():view==='upload'?upload():guide();
 document.title=t('他山 · 教学创作与分享');
 root.innerHTML=header()+`${state.storageError?`<div class="storage-alert wrap" role="alert">${txt(state.storageError)}</div>`:''}<main class="wrap main-content" id="main" tabindex="-1">${view==='discover'?guestNotice():''}${content}</main>`+footer();
 window.PracticeShowcase?.mount(root);accounts?.bind(root);lifecycle?.mount(root);ai?.mount(root);
}
function updateCatalog(){document.getElementById('catalog-tools').innerHTML=tabs()+filters();document.getElementById('catalog-results').innerHTML=resultMarkup();}
async function copy(text,field){try{await navigator.clipboard.writeText(text);toast('已复制，可以粘贴使用。');}catch{if(field){field.focus();field.select();}toast('自动复制不可用，请选中文字后按 Ctrl+C 或 ⌘C。');}}
function sourceReference(p){return {projectId:p.id,projectCode:p.projectCode||p.id,versionId:p.currentVersionId||null,versionNumber:p.currentVersionNumber||null,title:local(p.title)};}
function taskReference(p){const r={};for(const key of ['id','projectCode','currentVersionId','currentVersionNumber','sourceReferences','kind','title','summary','prior','subject','stages','teaching','source','contributors','verification'])r[key]=p[key];return {...r,related:[],duplicates:[],cover:p.isLocal?null:p.cover,sourceHref:p.isLocal?null:p.sourceHref};}
function normalizeDraft(input){const d=input&&typeof input==='object'?{...input}:{};for(const key of ['title','purpose','audience','prior','outcome','setting','stage','subject','core','source','tested','record','kind','used','license'])if(key in d)d[key]=typeof d[key]==='string'?d[key]:d[key]&&!Array.isArray(d[key])&&typeof d[key]==='object'?plain(d[key][locale]||d[key]['zh-CN']||d[key].en):'';return d;}
function formatDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(locale,{year:'numeric',month:'2-digit',day:'2-digit'}).format(date):t('待确认');}
function plain(value,fallback=''){if(typeof value==='string')return value;if(value&&!Array.isArray(value)&&typeof value==='object'){const text=value[locale]||value['zh-CN']||value.en;if(typeof text==='string')return text;}return fallback;}
function languageValue(value){return {'zh-CN':value,'zh-Hant':value,en:value};}
function objectURL(blob){const url=URL.createObjectURL(blob);objectURLs.push(url);return url;}
function safeLink(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function runtimeProject(record){
 const r=record, kind=r.kind==='prompt'?'prompt':'visual', content=plain(r.core), title=plain(r.title).trim()||t('未命名实践');
 const file=r.attachment, fileURL=file?.blob?objectURL(file.blob):'';
 const docURL=kind==='prompt'?objectURL(new Blob([content],{type:'text/markdown;charset=utf-8'})):'';
 return {id:r.id,projectCode:r.projectCode,currentVersionId:r.currentVersionId,currentVersionNumber:r.currentVersionNumber,sourceReferences:r.sourceReferences||[],kind,title:languageValue(title),summary:languageValue(plain(r.purpose)),prior:languageValue(plain(r.prior)),subject:subjects.includes(r.subject)?r.subject:'综合实践活动',stages:[stages.includes(r.stage)?r.stage:'教师专业发展'],contributors:[t('我')],cover:r.coverFile?.blob?objectURL(r.coverFile.blob):null,source:plain(r.source)||file?.name||t('浏览器本地项目'),sourceHref:fileURL,attachmentName:file?.name||'',userLink:safeLink(content.trim()),resultDescription:content,tested:plain(r.tested),isLocal:true,updatedAt:plain(r.updatedAt),licenseLabel:({unconfirmed:'待确认',open:'开放再创作',teach:'仅限教学使用',show:'仅供展示体验'})[r.license]||'待确认',classroomRecord:r.used==='yes'?plain(r.record):'',duplicates:[],related:[],packageHref:null,hasCompanionFiles:/\.zip$/i.test(file?.name||''),verification:{status:'pending',scope:'本地上传，尚未完成独立运行与内容检查',evidence:'教学说明与使用记录由上传者提供，待核对。',classroomVerified:false,date:null},document:kind==='prompt'?{content,blocks:[{title:t('Prompt 正文'),text:content}],download:docURL}:null,teaching:{audience:languageValue(plain(r.audience)),prior:languageValue(plain(r.prior)),method:languageValue(plain(r.setting)),objective:languageValue(plain(r.outcome)),activities:[],evidence:languageValue(plain(r.outcome)),sources:[]}};
}
function rebuildProjects(){
 objectURLs.forEach(url=>URL.revokeObjectURL(url));objectURLs=[];
 const order=['earth','poetry','pbl','conics','dynasty','lens','mendel','history','gcd','lesson','cpp','pinhole','recursion','chemistry'];
 projects=[...localRecords.map(runtimeProject),...catalog.projects.slice().sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id))];
 refreshDraftPreview();
}
function refreshDraftPreview(){
 if(state.preview?.startsWith('blob:'))URL.revokeObjectURL(state.preview);
 state.preview=state.draft.coverFile?.blob?URL.createObjectURL(state.draft.coverFile.blob):'';
 state.fileName=state.draft.attachment?.name||'';
}
function storageFailure(error){return error?.name==='QuotaExceededError'?'浏览器存储空间不足，请导出备份并清理部分项目后再试。':error?.message||'本地存储暂时不可用，请导出或复制内容后重试。';}

async function saveDraft(quiet=false){
 if(!state.storageReady){if(!quiet)toast('本地存储尚未就绪，请稍后再试。');return false;}
 try{await store.putDraft(state.draft);if(!quiet)toast('草稿、文件与封面已保存在此浏览器。');return true;}catch(error){if(!quiet)toast(storageFailure(error));return false;}
}
async function prepareNewDraft(next={}){
 const epoch=workspaceEpoch;
 if(Object.keys(state.draft).length){
  const accepted=await confirmAction('开始新的项目？','当前草稿会被替换；如需保留，请先完成保存或导出备份。','开始新项目');
  if(!accepted||epoch!==workspaceEpoch)return;
 }
 state.draft=next;state.step=1;state.error='';refreshDraftPreview();await store.putDraft(next);if(epoch!==workspaceEpoch)return;
 if(route().view==='upload')render();else location.hash='upload';
}
async function editProject(id){
 const epoch=workspaceEpoch;
 const record=localRecords.find(r=>r.id===id);if(!record)return;
 if(Object.keys(state.draft).length&&state.draft.id!==id){const accepted=await confirmAction('编辑另一个项目？','当前草稿会被替换；如需保留，请先完成保存或导出备份。','继续编辑');if(!accepted||epoch!==workspaceEpoch)return;}
 state.draft=normalizeDraft(record);state.step=1;refreshDraftPreview();await store.putDraft(state.draft);if(epoch!==workspaceEpoch)return;location.hash='upload';
}
function confirmAction(title,body,label){
 return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-label',t(title));
 dialog.innerHTML=`<h2>${txt(title)}</h2><p>${txt(body)}</p><form method="dialog"><button value="cancel">${txt('取消')}</button><button class="primary" value="confirm">${txt(label)}</button></form>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm');dialog.remove();},{once:true});dialog.showModal();
 });
}
function showBackup(blob,description='包含当前账号在此浏览器中的项目、附件、封面、草稿、收藏、创作任务和版本历史。云端独有文件请先保存到此浏览器。'){
 const url=URL.createObjectURL(blob),dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-label',t('本地备份已准备好'));
 dialog.innerHTML=`<h2>${txt('本地备份已准备好')}</h2><p>${txt(description)}</p><p class="subject-label">${(blob.size/1024/1024).toFixed(2)} MB · JSON</p><div class="row"><a class="btn primary" href="${url}" download="tashan-library-${new Date().toISOString().slice(0,10)}.json">${txt('下载备份文件')} ↓</a><button type="button" data-backup-copy>${txt('复制备份内容')}</button></div><details class="backup-data"><summary>${txt('查看可复制的备份内容')}</summary><label class="field"><span>${txt('备份 JSON')}</span><textarea readonly aria-label="${txt('备份 JSON')}"></textarea></label></details><form method="dialog"><button>${txt('完成')}</button></form>`;
 dialog.querySelector('.backup-data').addEventListener('toggle',async event=>{if(event.target.open){const field=dialog.querySelector('.backup-data textarea');field.value=await blob.text();}});
 dialog.querySelector('[data-backup-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(await blob.text());toast('备份内容已复制，可粘贴保存为 JSON 文件。');}catch{toast('复制失败，请使用下载备份文件。');}});
 document.body.append(dialog);dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();},{once:true});dialog.showModal();
}
function showImage(p){
 if(!p?.cover)return;
 const dialog=document.createElement('dialog');dialog.className='image-dialog';dialog.setAttribute('aria-label',local(p.example?.title||p.title));
 dialog.innerHTML=`<div class="image-dialog-bar"><strong>${e(local(p.example?.title||p.title))}</strong><form method="dialog"><button aria-label="${txt('关闭预览')}">${txt('关闭')} ×</button></form></div><div class="image-dialog-body"><img src="${e(p.example?.imageHref||p.cover)}" alt="${e(local(p.example?.caption||p.title))}"></div><div class="image-dialog-footer"><span>${txt(p.example?'AI 生成示例':'项目预览')}</span><a class="btn" href="${e(p.example?.imageHref||p.cover)}" download="${e(p.id+'-preview.png')}">${txt('下载图片')} ↓</a></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.showModal();
}
async function loadExample(){
 const epoch=workspaceEpoch;
 const p=project('poetry'), res=await fetch(p.cover||'./assets/covers/gcd.webp');if(!res.ok)throw new Error(t('示例读取失败，请刷新后重试。'));
 const blob=await res.blob();if(epoch!==workspaceEpoch)return;
 Object.assign(state.draft,{kind:'prompt',title:t('我的古诗课堂海报'),core:p.document.blocks[0].text,purpose:t('用诗句与画面建立联系，引导学生说出自己的理解。'),subject:'语文',stage:'小学',audience:local(p.teaching?.audience||p.prior),prior:local(p.teaching?.prior||p.prior),outcome:local(p.teaching?.objective||p.summary),setting:local(p.teaching?.method||'教师引导阅读与观察'),source:p.source,tested:t('本次示例由平台制作，尚未课堂试教'),used:'no',coverFile:{name:'poetry-example.png',type:blob.type,blob},sample:true,sourceReferences:[sourceReference(p)]});
 refreshDraftPreview();state.error='';await saveDraft(true);render();toast('已载入示例，可修改内容后保存到本地。');
}
root.addEventListener('click',async event=>{
 const interactionEpoch=workspaceEpoch;
 if(state.busy||accounts?.busy||lifecycle?.busy){event.preventDefault();return;}
 const language=event.target.closest('[data-language]');if(language){const restoreFocus=state.languageOpen;locale=language.dataset.language;state.languageOpen=false;try{localStorage.setItem('practice-language',locale);}catch{}render();if(restoreFocus)root.querySelector('[data-action="language-menu"]')?.focus({preventScroll:true});return;}
 const save=event.target.closest('[data-save]');if(save){if(!requireAccount())return;await bookmark(save.dataset.save);if(route().view==='desk')render();return;}
 const type=event.target.closest('[data-type]');if(type){state.type=type.dataset.type;updateCatalog();return;}
 const detailTab=event.target.closest('[data-detail-tab]');if(detailTab){const y=scrollY;state.detailTab=detailTab.dataset.detailTab;render();window.scrollTo(0,y);root.querySelector(`[data-detail-tab="${state.detailTab}"]`)?.focus({preventScroll:true});return;}
 const deskTab=event.target.closest('[data-desk-tab]');if(deskTab){state.deskTab=deskTab.dataset.deskTab;render();root.querySelector(`[data-desk-tab="${state.deskTab}"]`)?.focus({preventScroll:true});return;}
 const kind=event.target.closest('[data-draft-kind]');if(kind){state.draft.kind=kind.dataset.draftKind;render();return;}
 const cp=event.target.closest('[data-copy]');if(cp){const [id,index]=cp.dataset.copy.split(':');const doc=project(id)?.document;if(doc)copy(index==='full'?doc.content:doc.blocks[Number(index)].text,cp.closest('.prompt-block-content').querySelector('textarea'));return;}
 const resume=event.target.closest('[data-resume]');if(resume){const id=resume.dataset.resume;state.briefs[id]=state.tasks[id].text;state.adapt[id]=state.tasks[id].form||defaultAdapt(project(id));}
 const b=event.target.closest('[data-action]');if(!b)return;const id=b.dataset.id;
 const privateActions=['save-brief','brief-to-draft','save-draft','previous-step','load-example','remove-attachment','remove-cover','restore-legacy-draft','new-project','edit-project','delete-project','delete-task','export-backup','export-guest-backup','reference-add','reference-remove','copy-saved-task','copy-brief'];
 if(privateActions.includes(b.dataset.action)&&!requireAccount())return;
 try{
 switch(b.dataset.action){
 case 'replay-intro':window.TashanEntrance?.replay();break;
 case 'language-menu':setLanguageMenu(!state.languageOpen);break;
 case 'theme':state.languageOpen=false;document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';render();root.querySelector('[data-action="theme"]')?.focus({preventScroll:true});break;
 case 'browse':document.getElementById('collection').scrollIntoView({behavior:'instant'});document.querySelector('#library-search input').focus({preventScroll:true});break;
 case 'filters':state.filtersOpen=!state.filtersOpen;updateCatalog();document.querySelector('[data-action="filters"]').focus({preventScroll:true});break;
 case 'reset-filters':Object.assign(state,{search:'',subject:'',stage:'',region:'',grade:'',verification:'',type:'all',ungraded:true});document.querySelector('#library-search input').value='';updateCatalog();break;
 case 'show-prompts':state.detailTab='prompts';render();document.getElementById('original-prompts')?.scrollIntoView({behavior:'instant'});document.querySelector('#original-prompts summary')?.focus({preventScroll:true});break;
 case 'copy-image-prompt':copy(project(id).example.prompt,b.parentElement.querySelector('textarea'));break;
 case 'view-image':showImage(project(id));break;
 case 'reference-add':{const p=project(document.getElementById('reference-project')?.value);if(p){const ref=sourceReference(p);state.draft.sourceReferences=[...(state.draft.sourceReferences||[]).filter(r=>r.projectId!==ref.projectId||r.versionId!==ref.versionId),ref];render();root.querySelector('.optional-fields')?.setAttribute('open','');}break;}
 case 'reference-remove':state.draft.sourceReferences=(state.draft.sourceReferences||[]).filter((_,i)=>i!==Number(b.dataset.index));render();root.querySelector('.optional-fields')?.setAttribute('open','');break;
 case 'copy-saved-task':copy(state.tasks[id].text);break;
 case 'copy-brief':copy(state.briefs[id],document.getElementById('task-brief'));break;
 case 'save-brief':state.busy=true;await persistWorkspace({taskUpserts:{[id]:{text:state.briefs[id],form:state.adapt[id],reference:taskReference(project(id))}}});if(interactionEpoch!==workspaceEpoch)return;state.busy=false;toast('任务说明已保存');break;
 case 'brief-to-draft':await prepareNewDraft({kind:'prompt',title:local(project(id).title)+' · '+t('课堂改编'),core:state.briefs[id],subject:project(id).subject,stage:project(id).stages[0],audience:state.adapt[id].audience,prior:local(project(id).prior),purpose:state.adapt[id].goal,outcome:state.adapt[id].goal,setting:state.adapt[id].setting,source:project(id).source,sourceReferences:[sourceReference(project(id))]});break;
 case 'save-draft':b.disabled=true;await saveDraft();b.disabled=false;break;
 case 'previous-step':state.step=Math.max(1,state.step-1);state.error='';render();document.querySelector('.upload-editor')?.scrollIntoView({behavior:'instant'});break;
 case 'load-example':b.disabled=true;state.busy=true;await loadExample();if(interactionEpoch!==workspaceEpoch)return;state.busy=false;render();break;
 case 'remove-attachment':ai?.fileRemoved();delete state.draft.attachment;refreshDraftPreview();render();break;
 case 'remove-cover':delete state.draft.coverFile;refreshDraftPreview();render();break;
 case 'restore-legacy-draft':state.busy=true;await prepareNewDraft(normalizeDraft(read('practice-library-draft',{})));if(interactionEpoch!==workspaceEpoch)return;state.busy=false;render();break;
 case 'new-project':state.busy=true;await prepareNewDraft();if(interactionEpoch!==workspaceEpoch)return;state.busy=false;render();break;
 case 'edit-project':state.busy=true;await editProject(id);if(interactionEpoch!==workspaceEpoch)return;state.busy=false;render();break;
 case 'delete-project':if(await confirmAction('删除这个本地项目？','只删除这个上传条目及其附件，原始教学作品库保持可用。','删除项目')){state.busy=true;await store.remove(id);if(interactionEpoch!==workspaceEpoch)return;localRecords=await store.list();if(interactionEpoch!==workspaceEpoch)return;const updatedWorkspace=await store.getWorkspaceState();state.saved=new Set(updatedWorkspace.bookmarks);state.tasks=updatedWorkspace.tasks;if(interactionEpoch!==workspaceEpoch)return;if(state.draft.id===id){await store.clearDraft();if(interactionEpoch!==workspaceEpoch)return;state.draft={};}state.busy=false;rebuildProjects();render();toast('本地项目已删除。');}break;
 case 'delete-task':if(await confirmAction('删除这份创作任务？','这会移除工作台保存的任务说明。','删除任务')){state.busy=true;const tasks={...state.tasks};delete tasks[id];await persistWorkspace({taskDeletes:[id]});if(interactionEpoch!==workspaceEpoch)return;delete state.adapt[id];delete state.briefs[id];state.busy=false;render();}break;
 case 'export-guest-backup':state.busy=true;const guestBackup=await store.exportGuest({workspace:legacyGuestWorkspace()});if(interactionEpoch!==workspaceEpoch)return;showBackup(guestBackup,t('包含旧访客资料中的项目、文件、草稿、收藏、任务和版本记录；不会改动当前账号。'));state.busy=false;break;
 case 'export-backup':b.disabled=true;state.busy=true;if(Object.keys(state.draft).length&&!await saveDraft(true))throw new Error(t('草稿未能保存，请点击保存草稿重试。'));if(interactionEpoch!==workspaceEpoch)return;const accountBackup=await store.exportAll();if(interactionEpoch!==workspaceEpoch)return;showBackup(accountBackup);state.busy=false;b.disabled=false;toast('本地备份已准备好');break;
 }
 }catch(error){if(interactionEpoch!==workspaceEpoch)return;state.busy=false;b.disabled=false;toast(storageFailure(error));}
});
// Disclosure controls retain keyboard focus without re-rendering the page.
window.addEventListener('click',event=>{if(state.languageOpen&&!event.target.closest('.language-control'))setLanguageMenu(false);});
window.addEventListener('focusin',event=>{if(state.languageOpen&&!event.target.closest('.language-control'))setLanguageMenu(false);});
root.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&state.languageOpen){event.preventDefault();setLanguageMenu(false,true);return;}
 if(!event.target.closest('.language-control'))return;
 const keys=['ArrowDown','ArrowUp','Home','End'];
 if(!keys.includes(event.key))return;
 event.preventDefault();setLanguageMenu(true);
 const choices=[...root.querySelectorAll('[data-language]')];
 const index=choices.indexOf(event.target.closest('[data-language]'));
 const next=event.key==='Home'?0:event.key==='End'?choices.length-1:index<0?(event.key==='ArrowUp'?choices.length-1:0):(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
 choices[next]?.focus();
});
root.addEventListener('input',event=>{
 if(state.busy||accounts?.busy||lifecycle?.busy){event.preventDefault();return;}
 const node=event.target;
 if(node.name==='search'){state.search=node.value;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{if(route().view==='discover')document.getElementById('catalog-results').innerHTML=resultMarkup();},180);}
 if(node.dataset.edit){const id=route().id;state.adapt[id][node.dataset.edit]=node.value;}
 if(node.dataset.draft){state.draft[node.dataset.draft]=node.value;const preview=document.getElementById('draft-card-preview');if(preview)preview.innerHTML=draftPreview();}
 if(node.dataset.brief)state.briefs[node.dataset.brief]=node.value;
});
root.addEventListener('change',async event=>{
 const interactionEpoch=workspaceEpoch;
 if(state.busy||accounts?.busy||lifecycle?.busy){event.preventDefault();return;}
 const node=event.target;
 if((node.dataset.draft||node.dataset.confirm||['upload-file','upload-image','import-backup'].includes(node.id))&&!requireAccount())return;
 if(node.dataset.filter){const key=node.dataset.filter;state[key]=node.type==='checkbox'?node.checked:node.value;if(['region','stage'].includes(key))state.grade='';updateCatalog();document.querySelector(`[data-filter="${key}"]`)?.focus({preventScroll:true});}
 if(node.dataset.mechanism)state.adapt[route().id].mechanisms=[...root.querySelectorAll('[data-mechanism]:checked')].map(n=>n.dataset.mechanism);
 if(node.dataset.draft){state.draft[node.dataset.draft]=node.value;const preview=document.getElementById('draft-card-preview');if(preview)preview.innerHTML=draftPreview();}
 if(node.dataset.confirm)state.draft[node.dataset.confirm]=node.checked;
 try{
 if(node.id==='upload-file'){
  const file=node.files[0];if(!file)return;state.busy=true;
  if(file.size>10*1024*1024)throw new Error(t('项目文件不能超过 10 MB。'));
  if(!/\.(html?|zip|md|markdown|txt|json|pdf|docx|pptx)$/i.test(file.name))throw new Error(t('请选择 HTML、ZIP、Markdown 或支持的文档。'));
  state.draft.attachment={name:file.name,type:file.type,blob:file};
  if(/\.(md|markdown|txt)$/i.test(file.name)&&file.size<=1000000){const content=await file.text();if(interactionEpoch!==workspaceEpoch||state.draft.attachment?.blob!==file)return;state.draft.kind='prompt';state.draft.core=content;}
  const generatedTitle=!state.draft.title;
  if(generatedTitle)state.draft.title=file.name.replace(/\.[^.]+$/,'');
  state.busy=false;state.error='';refreshDraftPreview();render();ai?.fileChanged(file,{generatedTitle});
 }
 if(node.id==='upload-image'){
  const file=node.files[0];if(!file)return;state.busy=true;
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw new Error(t('请选择 5 MB 以内的 PNG、JPEG、WebP 或 GIF。'));
  const image=new Image(),url=URL.createObjectURL(file);
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(t('图片无法显示，请换一张图片。')));image.src=url;});}finally{URL.revokeObjectURL(url);}
  if(interactionEpoch!==workspaceEpoch)return;state.draft.coverFile={name:file.name,type:file.type,blob:file};state.busy=false;state.error='';refreshDraftPreview();render();
 }
 if(node.id==='import-backup'){
  const file=node.files[0];if(!file)return;state.busy=true;
  if(Object.keys(state.draft).length&&!await saveDraft(true))throw new Error(t('草稿未能保存，请点击保存草稿重试。'));
  const plan=await store.inspectBackup(file);if(interactionEpoch!==workspaceEpoch)return;
  const conflict=await confirmBackupImport(plan);if(interactionEpoch!==workspaceEpoch)return;
  if(!conflict){state.busy=false;node.value='';return;}
  const result=await store.importBackup(file,{conflict});if(interactionEpoch!==workspaceEpoch)return;
  await reloadLocalWorkspace();if(interactionEpoch!==workspaceEpoch)return;state.busy=false;render();
  toast(t('已导入 {count} 个项目，补回 {versions} 个版本；现有冲突资料已保留。',{count:result.count,versions:result.restoredVersions||0}));
 }
 }catch(error){if(interactionEpoch!==workspaceEpoch)return;state.busy=false;state.error=storageFailure(error);if(route().view==='upload'){render();root.querySelector('.error')?.focus();}else toast(state.error);}
});
root.addEventListener('submit',async event=>{
 event.preventDefault();if(state.busy||accounts?.busy||lifecycle?.busy)return;const interactionEpoch=workspaceEpoch,form=event.target;
 if(form.id==='library-search'){state.search=form.elements.search.value;updateCatalog();return;}
 if(['adapt-form','upload-form'].includes(form.id)&&!requireAccount())return;
 if(form.id==='adapt-form'){
  const id=form.dataset.projectId,data=state.adapt[id];
  if(['audience','goal','setting'].some(key=>!data[key].trim()))state.error='请先补充学生背景、改造目标和使用条件。';
  else{state.error='';state.briefs[id]=makeBrief(project(id),data);}
  render();root.querySelector(state.error?'.error':'#task-brief')?.focus();return;
 }
 if(form.id!=='upload-form'||state.busy)return;
 const d=state.draft;state.error='';
 if(state.step===1){
  if(!d.core?.trim()&&!d.attachment)state.error='请提供成果说明、链接或项目文件。';
  else if(d.kind==='prompt'&&!d.core?.trim())state.error='请粘贴 Prompt 正文，或上传 Markdown / TXT 文件。';
  else if(!d.coverFile)state.error='请选择一张项目封面，或载入示例资料。';else state.step=2;
 }else if(state.step===2){
  if(['title','purpose','audience','prior','outcome','setting','stage','subject'].some(key=>!d[key]?.trim()))state.error='请补充名称、学科、学段、用途、对象、基础、目标与使用方式。';
  else if(d.used==='yes'&&!d.record?.trim())state.error='请说明实际在哪些学生中使用过。';else state.step=3;
 }else{
  if(!d.content)state.error='请先确认已检查预览与教学信息。';
  else{
   state.busy=true;render();
   try{
    const record=await store.put({...d,kind:d.kind||'visual'},{clearDraft:true,saveVersion:true});if(interactionEpoch!==workspaceEpoch)return;
    
    state.draft={};state.busy=false;state.step=1;lifecycle?.invalidate(record.id);localRecords=await store.list();rebuildProjects();state.detailTab='teaching';location.hash='project/'+record.id;toast('项目已保存，可以在工作台继续调整。');return;
   }catch(error){if(interactionEpoch!==workspaceEpoch)return;state.busy=false;state.error=storageFailure(error);}
  }
 }
 if(!state.error){state.busy=true;const saved=await saveDraft(true);if(interactionEpoch!==workspaceEpoch)return;state.busy=false;if(!saved)state.error='草稿未能保存，请点击保存草稿重试。';}
 render();if(state.error)root.querySelector('.error')?.focus();else document.querySelector('.upload-editor').scrollIntoView({behavior:'instant'});
});
window.addEventListener('hashchange',async()=>{
 ai?.reset();
 if(!accounts?.busy&&state.renderedView==='upload'&&Object.keys(state.draft).length&&state.storageReady){state.busy=true;const saved=await saveDraft(true);state.busy=false;if(!saved)toast('草稿未能保存，请点击保存草稿重试。');}
 clearTimeout(state.searchTimer);state.languageOpen=false;state.error='';state.detailTab='teaching';render();document.getElementById('main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
});
window.addEventListener('tashan:guest-entry',()=>{
 if(!accounts?.user){guestSession=true;try{sessionStorage.setItem('tashan-guest-entry','1');}catch{}}
 location.hash='discover';render();window.scrollTo({top:0,left:0,behavior:'instant'});
});
window.addEventListener('pagehide',()=>{objectURLs.forEach(url=>URL.revokeObjectURL(url));if(state.preview?.startsWith('blob:'))URL.revokeObjectURL(state.preview);});
function legacyGuestWorkspace(){try{return {bookmarks:JSON.parse(localStorage.getItem('practice-library-bookmarks')||'[]'),tasks:JSON.parse(localStorage.getItem('practice-library-tasks')||'{}')};}catch{return {bookmarks:[],tasks:{}};}}
async function reloadLocalWorkspace(){
 const epoch=workspaceEpoch,[records,draft,workspace]=await Promise.all([store.list(),store.getDraft(),store.getWorkspaceState()]);
 if(epoch!==workspaceEpoch)return;
 lifecycle?.invalidate();localRecords=records;state.draft=normalizeDraft(draft||{});state.saved=new Set(workspace.bookmarks);state.tasks=workspace.tasks;
 state.adapt={};state.briefs={};refreshDraftPreview();rebuildProjects();
}
function confirmBackupImport(plan){
 return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-label',t('确认导入完整备份'));
 dialog.innerHTML=`<h2>${txt('确认导入完整备份')}</h2><p>${txt('将新增 {count} 个项目，识别到 {same} 个相同项目、{conflicts} 个冲突项目。',{count:plan.newProjects,same:plan.identical,conflicts:plan.conflicts.length})}</p><p>${txt('文件 {files} 个 · 版本 {versions} 个',{files:plan.files,versions:plan.versions})}</p><p>${txt('收藏会合并；已有草稿和冲突任务保留。相同项目只补回缺失的历史版本。')}</p>${plan.conflicts.length?`<details class="backup-summary"><summary>${txt('查看冲突项目')}</summary><ul>${plan.conflicts.map(p=>`<li>${e(local(p.title))} <small>${e(p.projectCode||p.id)}</small></li>`).join('')}</ul></details><label class="field"><span>${txt('如何处理冲突项目')}</span><select name="conflict"><option value="skip">${txt('保留现有项目，跳过冲突')}</option><option value="copy">${txt('将冲突项目另存为新副本')}</option></select></label>`:''}<form method="dialog"><button value="cancel">${txt('取消')}</button><button class="primary" value="confirm">${txt('确认导入')}</button></form>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm'?(dialog.querySelector('[name=conflict]')?.value||'skip'):null);dialog.remove();},{once:true});dialog.showModal();
 });
}
async function loadWorkspace(user=null){
 ai?.reset({account:true});
 const epoch=++workspaceEpoch;lifecycle?.reset();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close('cancel'));state.storageReady=false;state.storageError='';state.busy=true;
 localRecords=[];state.draft={};state.tasks={};state.saved=new Set();state.adapt={};state.briefs={};state.step=1;state.error='';
 rebuildProjects();render();
 try{
  if(!store)throw new Error('本地存储暂时不可用，请导出或复制内容后重试。');
  if(store.setScope)await store.setScope(user?.id||null);
  if(epoch!==workspaceEpoch)return;
  workspaceScope=user?.id||null;
  if(user){guestSession=false;try{sessionStorage.removeItem('tashan-guest-entry');}catch{}}
  if(accounts&&!user){state.storageReady=true;return;}
  const [records,draft,workspace]=await Promise.all([store.list(),store.getDraft(),store.getWorkspaceState()]);
  if(epoch!==workspaceEpoch)return;
  localRecords=records;let personal=workspace;if(!workspace.initialized){const bookmarks=read('practice-library-bookmarks',[]);personal=await store.putWorkspaceState({bookmarks:Array.isArray(bookmarks)?bookmarks:[],tasks:read('practice-library-tasks',{})},{ifUninitialized:true});if(epoch!==workspaceEpoch)return;}state.saved=new Set(personal.bookmarks);state.tasks=personal.tasks;
  if(draft)state.draft=normalizeDraft(draft);
  else if(!workspaceScope&&!read('practice-library-migrated-v2',false)){const previous=read('practice-library-draft',{});if(Object.keys(previous).length){state.draft=normalizeDraft(previous);await store.putDraft(state.draft);}}
  if(!workspaceScope)write('practice-library-migrated-v2',true);
  state.storageReady=true;rebuildProjects();
 }catch(error){if(epoch===workspaceEpoch){state.storageError=storageFailure(error);localRecords=[];state.draft={};rebuildProjects();}}
 finally{if(epoch===workspaceEpoch){state.busy=false;render();}}
}
function aiCapture(task,key){
 const current=route();
 if(['upload','teaching'].includes(task)){
  if(current.view!=='upload'||state.step!==(task==='upload'?1:2))return null;
  const d=state.draft,context=Object.fromEntries(['title','kind','subject','stage','core','purpose','audience','prior','outcome','setting'].map(name=>[name,typeof d[name]==='string'?d[name]:'']));
  context.kind=d.kind==='prompt'?'prompt':'visual';
  context.reference=(d.sourceReferences||[]).map(ref=>[ref.projectCode||ref.projectId,local(ref.title)].filter(Boolean).join(' · ')).join('\n');
  return {epoch:workspaceEpoch,target:d,file:d.attachment?.blob,context};
 }
 if(task!=='prompt'||current.view!=='adapt'||current.id!==key)return null;
 const p=project(key),form=state.adapt[key];if(!p||!form)return null;
 return {epoch:workspaceEpoch,target:form,context:{title:local(p.title),kind:p.kind,subject:p.subject||'',stage:p.stages?.[0]||'',core:state.briefs[key]||p.document?.content||p.document?.blocks?.map(block=>block.text).join('\n\n')||local(p.summary),purpose:form.goal,audience:form.audience,prior:local(p.teaching?.prior||p.prior),outcome:form.goal,setting:form.setting,boundary:[form.boundary,...(form.mechanisms||[]).map(value=>t(value))].filter(Boolean).join('\n'),reference:[p.projectCode||p.id,local(p.title)].filter(Boolean).join(' · ')}};
}
function aiApply(task,key,result){
 if(task==='prompt')state.briefs[key]=result.text;
 else for(const [name,value] of Object.entries(result.fields||{})){
  if(name==='subject'&&!subjects.includes(value)||name==='stage'&&!stages.includes(value))continue;
  if(['title','purpose','subject','stage','audience','prior','outcome','setting'].includes(name))state.draft[name]=value;
 }
 render();
 if(task==='prompt')root.querySelector('#task-brief')?.focus({preventScroll:true});
 else if(task==='teaching'){const first=Object.keys(result.fields||{})[0];if(first)root.querySelector(`[data-draft="${first}"]`)?.focus({preventScroll:true});}
}
ai?.init({capture:aiCapture,apply:aiApply,busy:()=>state.busy||lifecycle?.busy});
lifecycle?.init({render,record:id=>localRecords.find(p=>p.id===id),confirm:confirmAction,reloadLocal:reloadLocalWorkspace,showBackup});
render();
if(accounts){
 accounts.init({
  onRender:render,
  async onBeforeChange({forced,reason}){
   if(forced||reason==='initial')return;
   if(state.busy||lifecycle?.busy)throw new Error('正在保存工作台，请稍后再试。');
   if(state.storageReady&&Object.keys(state.draft).length&&!await saveDraft(true))throw new Error('草稿未能保存，请点击保存草稿重试。');
  },
  onChange:loadWorkspace
 });
}else loadWorkspace();
})();
