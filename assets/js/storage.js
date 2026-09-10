/* Browser-scoped workspace, immutable project versions, and portable backups. */
(function (global) {
  'use strict';
  const DB_NAME = 'tashan-practice-library';
  const FORMAT = 'tashan-practice-library';
  const BACKUP_VERSION = 2;
  const MB = 1024 * 1024;
  const LIMITS = { attachment: 10 * MB, coverFile: 5 * MB, total: 50 * MB, projects: 100 };
  const FILE_TYPES = {
    html: 'text/html', htm: 'text/html', zip: 'application/zip', md: 'text/markdown', markdown: 'text/markdown',
    txt: 'text/plain', json: 'application/json', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'
  };
  // Keep the pre-account database intact as the guest workspace. Account scopes
  // are a local convenience, not a substitute for server-side project ownership.
  let scope = null, scopeGeneration = 0;
  const activeTransactions = new Set();
  const connections = new Map();
  const error = message => new Error(message);
  const validId = id => typeof id === 'string' && /^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id);
  function requireId(id) {
    if (!validId(id)) throw error('本地项目 ID 无效，请重新保存项目。');
    return id;
  }
  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return 'local-' + global.crypto.randomUUID();
    const random = new Uint32Array(3);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(random);
    else for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 0xffffffff);
    return 'local-' + Date.now().toString(36) + '-' + Array.from(random, n => n.toString(36)).join('-');
  }
  function plain(value, depth, seen) {
    if (depth > 32) throw error('项目资料层级过多，无法保存。');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || seen.has(value)) throw error('项目资料包含不支持的类型或循环引用。');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw error('项目资料需要使用普通对象、数组和文字。');
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = value.map(item => plain(item, depth + 1, seen));
    else {
      result = {};
      for (const key of Object.keys(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw error('项目资料包含不支持的字段。');
        if (value[key] !== undefined) result[key] = plain(value[key], depth + 1, seen);
      }
    }
    seen.delete(value);
    return result;
  }
  function fileInfo(file, field) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\\/\u0000-\u001f]/.test(file.name)) throw error('附件名称无效，请重新选择文件。');
    const match = /\.([a-z0-9]+)$/i.exec(file.name);
    const extension = match ? match[1].toLowerCase() : '';
    const type = FILE_TYPES[extension];
    if (!type || (field === 'coverFile' && !['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension))) throw error(field === 'coverFile' ? '封面仅支持 PNG、JPEG、WebP 或 GIF。' : '不支持此附件类型，请使用 HTML、ZIP、Markdown、文本、PDF、Office 文档或图片。');
    if (file.type !== undefined && typeof file.type !== 'string') throw error('附件格式信息无效。');
    // File choosers may report empty, text/plain or application/octet-stream for valid extensions.
    if (field === 'coverFile' && file.type && file.type !== type) throw error('封面格式与文件扩展名不一致。');
    return { name: file.name, type };
  }
  function normalize(record, isDraft) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw error('项目资料格式无效。');
    const metadata = {};
    for (const key of Object.keys(record)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw error('项目资料包含不支持的字段。');
      if (!['attachment', 'coverFile'].includes(key)) metadata[key] = record[key];
    }
    const result = plain(metadata, 0, new Set());
    if (new Blob([JSON.stringify(result)]).size > MB) throw error('单个项目的文字资料不能超过 1 MB。');
    if (!isDraft && result.id !== undefined) requireId(result.id);
    if (isDraft && result.id !== undefined && result.id !== '') requireId(result.id);
    for (const field of ['attachment', 'coverFile']) {
      if (record[field] === undefined || record[field] === null) continue;
      const info = fileInfo(record[field], field);
      const blob = record[field].blob;
      if (!(blob instanceof Blob)) throw error('附件内容无效，请重新选择文件。');
      if (field === 'coverFile' && blob.type && blob.type !== info.type) throw error('封面内容的格式与文件扩展名不一致。');
      if (blob.size > LIMITS[field]) throw error(field === 'coverFile' ? '封面不能超过 5 MB。' : '单个附件不能超过 10 MB。');
      result[field] = { ...info, blob };
      if(typeof record[field].sha256==='string'&&/^[a-f0-9]{64}$/.test(record[field].sha256))result[field].sha256=record[field].sha256;
    }
    return result;
  }
  const changedScope = () => error('账号已切换，请在当前账号下重新执行此操作。');
  const token = () => ({ key: scope, generation: scopeGeneration });
  function checkToken(actor) { if (actor.generation !== scopeGeneration || actor.key !== scope) throw changedScope(); }
  const validCode = code => typeof code === 'string' && /^TS-L-[A-F0-9]{16}$/.test(code);
  const validVersionId = id => typeof id === 'string' && /^version-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id);
  function newCode(used) {
    let code;
    do {
      const random = new Uint32Array(2);
      if (global.crypto?.getRandomValues) global.crypto.getRandomValues(random);
      else for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 0x100000000);
      code = 'TS-L-' + Array.from(random, value => value.toString(16).padStart(8, '0')).join('').toUpperCase();
    } while (used.has(code));
    used.add(code);return code;
  }
  function references(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 1000) throw error('项目来源引用格式无效。');
    return value.map(reference => {
      const result = plain(reference, 0, new Set());
      if (!result || Array.isArray(result) || typeof result.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(result.projectId)) throw error('项目来源引用 ID 无效。');
      if (result.projectCode !== undefined && (typeof result.projectCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(result.projectCode))) throw error('项目来源编号无效。');
      if(result.versionId===null)delete result.versionId;
      if(result.versionNumber===null)delete result.versionNumber;
      if (result.versionId !== undefined && !validVersionId(result.versionId) && !/^catalog-[a-f0-9]{32,64}$/.test(result.versionId)) throw error('项目来源版本 ID 无效。');
      if (result.versionNumber !== undefined && (!Number.isSafeInteger(result.versionNumber) || result.versionNumber < 1)) throw error('项目来源版本号无效。');
      return result;
    });
  }
  async function sha256(blob) {
    if (!global.crypto?.subtle?.digest) throw error('此浏览器不支持文件校验，请使用新版浏览器并通过 HTTPS 或本机服务打开平台。');
    return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), value => value.toString(16).padStart(2, '0')).join('');
  }
  async function prepared(record, isDraft = false) {
    const result = normalize(record, isDraft);
    result.sourceReferences = references(result.sourceReferences);
    if (result.projectCode !== undefined && !validCode(result.projectCode)) throw error('项目编号格式无效。');
    for (const field of ['attachment', 'coverFile']) if (result[field]) result[field].sha256 = await sha256(result[field].blob);
    return result;
  }
  function workspace(value = {}, initialized = true) {
    const source = plain(value, 0, new Set());
    if (!source || Array.isArray(source)) throw error('工作台资料格式无效。');
    const bookmarks = source.bookmarks === undefined ? [] : source.bookmarks;
    const tasks = source.tasks === undefined ? {} : source.tasks;
    if (!Array.isArray(bookmarks) || bookmarks.length > 10000 || bookmarks.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))) throw error('收藏列表格式无效。');
    if (!tasks || Array.isArray(tasks) || typeof tasks !== 'object' || Object.keys(tasks).some(id => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))) throw error('创作任务格式无效。');
    const result = { bookmarks: [...new Set(bookmarks)], tasks, initialized };
    if (new Blob([JSON.stringify(result)]).size > 5 * MB) throw error('收藏与创作任务不能超过 5 MB。');
    return result;
  }
  function metadataBytes(record) {
    if (!record) return 0;
    const metadata = { ...record };delete metadata.attachment;delete metadata.coverFile;
    return new Blob([JSON.stringify(metadata)]).size;
  }
  function capacity(projects, draft, versions = [], state = workspace({}, false)) {
    if (projects.length > LIMITS.projects) throw error('本地最多保存 100 个项目，请先导出备份并整理项目。');
    if (versions.length > 1000) throw error('本地最多保存 1000 个版本快照，请导出备份后整理项目。');
    const seen = new Set();let total = new Blob([JSON.stringify(state)]).size;
    for (const version of versions) { const metadata = { ...version };delete metadata.snapshot;total += new Blob([JSON.stringify(metadata)]).size; }
    for (const record of [...projects, draft, ...versions.map(version => version.snapshot)]) {
      if (!record) continue;total += metadataBytes(record);
      for (const field of ['attachment', 'coverFile']) if (record[field]) {
        const file = record[field], hash = file.sha256;
        if (!hash || !seen.has(hash)) { total += file.blob.size;if (hash) seen.add(hash); }
      }
    }
    if (total > LIMITS.total) throw error('本地资料总量不能超过 50 MB，请先导出备份并整理附件。');
    return total;
  }
  function open(key = scope) {
    if (!global.indexedDB) return Promise.reject(error('此浏览器暂不支持本地文件保存，请使用支持 IndexedDB 的浏览器。'));
    if (!connections.has(key)) connections.set(key, new Promise((resolve, reject) => {
      const request = global.indexedDB.open(key ? DB_NAME + '-account-' + key : DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onerror = () => { connections.delete(key);reject(request.error || error('无法打开本地资料库。')); };
      request.onblocked = () => { connections.delete(key);reject(error('另一个页面正在更新资料库，请关闭其他平台页面后重试。')); };
      request.onsuccess = () => { const db = request.result;db.onversionchange = () => { db.close();connections.delete(key); };resolve(db); };
    }));
    return connections.get(key);
  }
  async function transaction(mode, operation, key = scope, actor = token()) {
    const db = await open(key);checkToken(actor);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'meta'], mode);
      const stores = { projects: tx.objectStore('projects'), meta: tx.objectStore('meta') };
      let result, failure;
      const active = { abort(reason) { failure = reason;try {tx.abort();} catch (_) {reject(reason);} } };
      activeTransactions.add(active);
      tx.oncomplete = () => {activeTransactions.delete(active);try {checkToken(actor);resolve(result);} catch(reason) {reject(reason);} };
      tx.onabort = () => {activeTransactions.delete(active);reject(failure || tx.error || error('本地资料保存未完成，请重试。'));};
      tx.onerror = event => {failure = failure || event.target.error || tx.error;};
      try {operation(stores,value=>{result=value;},reason=>active.abort(reason));} catch(reason) {active.abort(reason);}
    });
  }
  function snapshot(mode, operation, key = scope, actor = token()) {
    return transaction(mode,(stores,done,fail)=>{
      const projectRequest = stores.projects.getAll(), metaRequest = stores.meta.getAll();let pending = 2;
      const loaded = () => {
        if (--pending) return;
        try {
          checkToken(actor);const meta = new Map(metaRequest.result.map(item=>[item.key,item.value]));
          done(operation({projects:projectRequest.result,draft:meta.get('draft') || null,workspace:workspace(meta.get('workspace') || {},meta.has('workspace')),versions:meta.get('versions') || [],revision:meta.get('revision') || 0},stores));
        } catch(reason) {fail(reason);}
      };
      projectRequest.onsuccess=loaded;metaRequest.onsuccess=loaded;
    },key,actor);
  }
  function bump(data, stores) {stores.meta.put({key:'revision',value:data.revision+1});}
  function migrateCodes(data, stores) {
    const used = new Set();let changed = false;
    for (const project of data.projects) {
      if (!validCode(project.projectCode) || used.has(project.projectCode)) {project.projectCode=newCode(used);stores.projects.put(project);changed=true;}
      else used.add(project.projectCode);
    }
    if (changed) bump(data,stores);
    return changed;
  }
  async function readAll(key = scope, actor = token()) {
    await snapshot('readwrite',(data,stores)=>migrateCodes(data,stores),key,actor);
    return snapshot('readonly',data=>data,key,actor);
  }
  function canonical(value) {
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  async function describe(record) {
    if (!record) return null;
    const result = { ...record };
    for (const field of ['attachment','coverFile']) if (record[field]) {const file=record[field];result[field]={name:file.name,type:file.type,sha256:await sha256(file.blob),bytes:file.blob.size};}
    return result;
  }
  async function fingerprint(record) {
    const result=await describe(record);
    for (const key of ['id','projectCode','createdAt','updatedAt','currentVersionId','currentVersionNumber']) delete result[key];
    if (!result.sourceReferences?.length) delete result.sourceReferences;
    return canonical(result);
  }
  async function encodeRecord(record) {
    if (!record) return null;
    const result = { ...record };
    for (const field of ['attachment','coverFile']) {
      if (!record[field]) continue;
      const file=record[field], array=new Uint8Array(await file.blob.arrayBuffer());let binary='';
      for(let index=0;index<array.length;index+=0x4000)binary+=String.fromCharCode.apply(null,array.subarray(index,index+0x4000));
      result[field]={name:file.name,type:file.type,base64:global.btoa(binary)};
    }
    return result;
  }
  function decodeFile(file, field) {
    const info=fileInfo(file,field);
    const encoded=file.base64;
    if(typeof encoded!=='string'||encoded.length>Math.ceil(LIMITS[field]/3)*4||encoded.length%4!==0)throw error('备份中的附件内容无效或超过大小限制。');
    const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
    // A repeated regex group over large Base64 input can overflow V8's regexp stack.
    // Scan the alphabet once; only the last one or two characters may be padding.
    if(/[^A-Za-z0-9+/]/.test(padding?encoded.slice(0,-padding):encoded))throw error('备份中的附件内容无效或超过大小限制。');
    let binary;try{binary=global.atob(encoded);}catch(_){throw error('备份中的附件编码无效。');}
    if(binary.length>LIMITS[field])throw error('备份中的附件内容无效或超过大小限制。');
    const array=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)array[index]=binary.charCodeAt(index);
    return {...info,blob:new Blob([array],{type:info.type})};
  }
  async function decodeRecord(record, options = {}) {
    if(!record||typeof record!=='object'||Array.isArray(record))throw error('备份中的项目格式无效。');
    const result={...record};if(!options.draft)requireId(result.id);
    for(const field of ['attachment','coverFile'])if(record[field]!=null)result[field]=decodeFile(record[field],field);
    return prepared(result,Boolean(options.draft));
  }
  async function packRecord(record, files) {
    if (!record) return null;
    const result={...record};
    for(const field of ['attachment','coverFile'])if(record[field]) {
      const file=record[field],hash=await sha256(file.blob);
      if(!files[hash]){const encoded=await encodeRecord({[field]:file});files[hash]={bytes:file.blob.size,base64:encoded[field].base64};}
      result[field]={name:file.name,type:file.type,sha256:hash};
    }
    return result;
  }
  async function serializeLibrary(data) {
    const files={},projects=[],versions=[];
    capacity(data.projects,data.draft,data.versions,data.workspace);
    for(const record of data.projects)projects.push(await packRecord(record,files));
    const draft=await packRecord(data.draft,files);
    for(const version of data.versions)versions.push({...version,snapshot:await packRecord(version.snapshot,files)});
    return new Blob([JSON.stringify({format:FORMAT,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),projects,draft,workspace:{bookmarks:data.workspace.bookmarks,tasks:data.workspace.tasks},versions,files},null,2)],{type:'application/json'});
  }
  async function exportLibrary(key, actor = token(), legacyWorkspace) {
    const data=await readAll(key,actor);
    if(legacyWorkspace!==undefined){const supplied=workspace(legacyWorkspace);data.workspace=workspace({bookmarks:[...supplied.bookmarks,...data.workspace.bookmarks],tasks:{...supplied.tasks,...data.workspace.tasks}});}
    const result=await serializeLibrary(data);checkToken(actor);return result;
  }
  async function exportProjectVersions(input) {
    const actor=token();
    if(!Array.isArray(input)||!input.length||input.length>1000)throw error('请选择 1 至 1000 个完整项目版本进行备份。');
    const versions=[],projects=new Map();
    for(const item of input){
      const {snapshot:record,...value}=item||{},metadata=plain(value,0,new Set());
      if(!validId(metadata.projectId)||!validCode(metadata.projectCode)||!validVersionId(metadata.id)||!Number.isSafeInteger(metadata.number)||metadata.number<1||!Number.isFinite(Date.parse(metadata.createdAt))||(metadata.note!==undefined&&(typeof metadata.note!=='string'||metadata.note.length>2000)))throw error('项目版本资料无效，无法创建备份。');
      if(!record||record.id!==metadata.projectId||record.projectCode!==metadata.projectCode)throw error('版本快照与项目编号不一致。');
      const snapshot=await prepared({...record,currentVersionId:metadata.id,currentVersionNumber:metadata.number,sourceReferences:metadata.sourceReferences===undefined?record.sourceReferences:metadata.sourceReferences});
      const version={id:metadata.id,projectId:metadata.projectId,projectCode:metadata.projectCode,number:metadata.number,createdAt:metadata.createdAt,note:metadata.note||'',snapshot};
      versions.push(version);if(!projects.has(snapshot.id)||projects.get(snapshot.id).currentVersionNumber<metadata.number)projects.set(snapshot.id,snapshot);
    }
    checkToken(actor);
    let result;
    try{result=await serializeLibrary({projects:[...projects.values()],draft:null,versions,workspace:workspace({})});}
    catch(reason){
      if(reason.message?.includes('50 MB'))throw error('单个项目的完整历史备份上限为 50 MB（附件去重后，含版本文字资料）。超出上限的历史暂不能合并成一个可导入的备份文件。');
      throw reason;
    }
    // Reuse the import validator so the portable file is self-contained and restorable.
    await parseBackup(result);checkToken(actor);return result;
  }
  async function parseBackup(file) {
    if(!(file instanceof Blob)||file.size>70*MB)throw error('请选择小于 70 MB 的平台 JSON 备份文件。');
    let data;try{data=JSON.parse(await file.text());}catch(_){throw error('备份不是有效的 JSON 文件。');}
    if(!data||data.format!==FORMAT||![1,2].includes(data.version)||!Array.isArray(data.projects)||data.projects.length>LIMITS.projects)throw error('此文件不是受支持的平台备份（版本 1 或 2）。');
    if(new Set(data.projects.map(project=>project?.id)).size!==data.projects.length)throw error('备份中存在重复的项目 ID，请检查备份文件。');
    const presentCodes=data.projects.map(project=>project?.projectCode).filter(Boolean);
    if(new Set(presentCodes).size!==presentCodes.length)throw error('备份中存在重复的项目编号，请检查备份文件。');
    const files=new Map();
    if(data.version===2){
      if(!data.files||typeof data.files!=='object'||Array.isArray(data.files)||Object.keys(data.files).length>5000)throw error('备份文件表格式无效。');
      for(const [hash,file] of Object.entries(data.files)){
        if(!/^[a-f0-9]{64}$/.test(hash)||!file||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>LIMITS.attachment)throw error('备份文件校验信息无效。');
        const decoded=decodeFile({name:'content.txt',base64:file.base64},'attachment');
        if(decoded.blob.size!==file.bytes||await sha256(decoded.blob)!==hash)throw error('备份附件校验失败，文件内容可能已损坏。');
        files.set(hash,decoded.blob);
      }
    }
    async function unpack(record,isDraft){
      if(!record||typeof record!=='object'||Array.isArray(record))throw error('备份中的项目格式无效。');
      if(!isDraft)requireId(record.id);
      if(data.version===1){const decoded=await decodeRecord(record,{draft:isDraft});delete decoded.currentVersionId;delete decoded.currentVersionNumber;return decoded;}
      const result={...record};
      for(const field of ['attachment','coverFile'])if(record[field]!=null){
        const descriptor=record[field],info=fileInfo(descriptor,field),blob=files.get(descriptor.sha256);
        if(!blob)throw error('备份缺少项目引用的附件。');
        result[field]={...info,blob:new Blob([blob],{type:info.type}),sha256:descriptor.sha256};
      }
      return prepared(result,isDraft);
    }
    const projects=[];for(const item of data.projects){const project=await unpack(item,false);const now=new Date().toISOString();if(!Number.isFinite(Date.parse(project.createdAt)))project.createdAt=now;if(!Number.isFinite(Date.parse(project.updatedAt)))project.updatedAt=project.createdAt;projects.push(project);}
    const draft=data.draft==null?null:await unpack(data.draft,true),versions=[];
    if(data.version===2){
      if(!Array.isArray(data.versions)||data.versions.length>1000)throw error('备份版本列表格式无效。');
      const ids=new Set(),numbers=new Set();
      for(const item of data.versions){
        const {snapshot:record,...metadata}=item||{},version=plain(metadata,0,new Set());
        if(!validVersionId(version.id)||ids.has(version.id)||!validId(version.projectId)||!validCode(version.projectCode)||!Number.isSafeInteger(version.number)||version.number<1||!Number.isFinite(Date.parse(version.createdAt)))throw error('备份中的版本信息无效。');
        const project=projects.find(project=>project.id===version.projectId);
        if(!project||project.projectCode!==version.projectCode||numbers.has(version.projectId+':'+version.number))throw error('备份版本与项目对应关系无效。');
        version.snapshot=await unpack(record,false);
        if(version.snapshot.id!==version.projectId||version.snapshot.projectCode!==version.projectCode)throw error('备份版本快照的项目编号不一致。');
        if(version.snapshot.currentVersionId!==version.id||version.snapshot.currentVersionNumber!==version.number)throw error('备份快照的版本编号不一致。');
        ids.add(version.id);numbers.add(version.projectId+':'+version.number);versions.push(version);
      }
    }
    if(data.version===2)for(const project of projects){
      if(project.currentVersionId!==undefined&&!versions.some(version=>version.projectId===project.id&&version.id===project.currentVersionId&&version.number===project.currentVersionNumber))throw error('备份缺少项目的当前版本快照。');
    }
    const state=data.version===2?workspace(data.workspace):workspace({},false);
    capacity(projects,draft,versions,state);
    return {version:data.version,projects,draft,versions,workspace:state,files:files.size};
  }
  function remap(value, ids, codes, versionIds) {
    if(value instanceof Blob||value===null||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(item=>remap(item,ids,codes,versionIds));
    const result={};
    for(const [key,entry] of Object.entries(value)) {
      if(typeof entry==='string'&&['id','projectId','sourceProjectId','parentProjectId','derivedFromProjectId'].includes(key)&&ids.has(entry))result[key]=ids.get(entry);
      else if(typeof entry==='string'&&key==='projectCode'&&codes.has(entry))result[key]=codes.get(entry);
      else if(typeof entry==='string'&&['versionId','currentVersionId','restoredFromVersionId'].includes(key)&&versionIds.has(entry))result[key]=versionIds.get(entry);
      else result[key]=remap(entry,ids,codes,versionIds);
    }
    return result;
  }
  async function versionFingerprint(version) {
    const metadata={...version};delete metadata.snapshot;delete metadata.projectId;delete metadata.projectCode;
    const snapshot=await describe(version.snapshot);delete snapshot.id;delete snapshot.projectCode;
    return canonical({...metadata,snapshot});
  }
  async function planImport(incoming, current, conflict) {
    const currentHashes=new Map();for(const project of current.projects)currentHashes.set(project.id,await fingerprint(project));
    const entries=[],ids=new Map(),codes=new Map(),versionIds=new Map(),usedIds=new Set(current.projects.map(project=>project.id)),usedCodes=new Set(current.projects.map(project=>project.projectCode));
    const conflicts=[];let identical=0,copied=0;
    for(const source of incoming.projects){
      const existing=current.projects.find(project=>project.id===source.id)||(source.projectCode&&current.projects.find(project=>project.projectCode===source.projectCode));
      let historyConflict=false;
      if(existing)for(const version of incoming.versions.filter(item=>item.projectId===source.id)){
        const previous=current.versions.find(item=>item.id===version.id||(item.projectId===existing.id&&item.number===version.number));
        if(previous&&(previous.projectId!==existing.id||await versionFingerprint(previous)!==await versionFingerprint(version))){historyConflict=true;break;}
      }
      const equal=existing&&!historyConflict&&currentHashes.get(existing.id)===await fingerprint(source);
      if(equal){identical++;ids.set(source.id,existing.id);if(source.projectCode)codes.set(source.projectCode,existing.projectCode);entries.push({source,existing,kind:'identical'});continue;}
      if(existing){conflicts.push({id:source.id,projectCode:source.projectCode||existing.projectCode,title:source.title||'',existingId:existing.id});if(conflict==='skip'){ids.set(source.id,existing.id);if(source.projectCode)codes.set(source.projectCode,existing.projectCode);entries.push({source,existing,kind:'skip'});continue;}}
      let id=source.id,code=source.projectCode;
      if(usedIds.has(id)){do{id=newId();}while(usedIds.has(id));}
      usedIds.add(id);
      if(!validCode(code)||usedCodes.has(code))code=newCode(usedCodes);else usedCodes.add(code);
      ids.set(source.id,id);if(source.projectCode)codes.set(source.projectCode,code);
      entries.push({source,id,code,kind:existing?'copy':'new'});if(existing)copied++;
    }
    const usedVersions=new Set(current.versions.map(version=>version.id)),includedVersions=[];
    for(const version of incoming.versions){
      const entry=entries.find(item=>item.source.id===version.projectId);if(!entry||entry.kind==='skip')continue;
      if(entry.kind==='identical'&&current.versions.some(item=>item.id===version.id)){versionIds.set(version.id,version.id);continue;}
      let id=version.id;
      if(usedVersions.has(id)||entry.kind==='copy'){do{id='version-'+newId().slice(6);}while(usedVersions.has(id));}
      usedVersions.add(id);versionIds.set(version.id,id);includedVersions.push(version);
    }
    const projects=entries.filter(entry=>['new','copy'].includes(entry.kind)).map(entry=>({...remap(entry.source,ids,codes,versionIds),id:entry.id,projectCode:entry.code}));
    const updatedProjects=entries.filter(entry=>entry.kind==='identical'&&entry.source.currentVersionId&&(!entry.existing.currentVersionNumber||entry.source.currentVersionNumber>entry.existing.currentVersionNumber)).map(entry=>({...entry.existing,currentVersionId:versionIds.get(entry.source.currentVersionId)||entry.source.currentVersionId,currentVersionNumber:entry.source.currentVersionNumber}));
    const versions=includedVersions.map(version=>({...remap(version,ids,codes,versionIds),id:versionIds.get(version.id)}));
    // The imported graph follows copied IDs; existing projects and history are never rewritten.
    const draft=current.draft|| (incoming.draft?remap(incoming.draft,ids,codes,versionIds):null);
    const tasks={...current.workspace.tasks};let skippedTasks=0;const taskConflicts=[];
    for(const [key,value] of Object.entries(incoming.workspace.tasks)){
      const id=ids.get(key)||key,task=remap(value,ids,codes,versionIds);
      if(tasks[id]===undefined)tasks[id]=task;else if(canonical(tasks[id])!==canonical(task)){skippedTasks++;taskConflicts.push(id);}
    }
    const nextWorkspace=workspace({bookmarks:[...current.workspace.bookmarks,...incoming.workspace.bookmarks.map(id=>ids.get(id)||id)],tasks},current.workspace.initialized||incoming.workspace.initialized);
    const nextProjects=current.projects.map(project=>updatedProjects.find(item=>item.id===project.id)||project).concat(projects),nextVersions=current.versions.concat(versions);
    capacity(nextProjects,draft,nextVersions,nextWorkspace);
    return {projects,updatedProjects,versions,draft,workspace:nextWorkspace,revision:current.revision,result:{count:projects.length,skipped:entries.filter(entry=>entry.kind==='skip').length+identical,identical,conflicts:conflicts.length,copied,idMap:Object.fromEntries(ids),codeMap:Object.fromEntries(codes),restoredDraft:!current.draft&&Boolean(incoming.draft),workspaceMerged:incoming.workspace.initialized,restoredVersions:versions.length,skippedTasks,taskConflicts},conflicts,newProjects:entries.filter(entry=>entry.kind==='new').length};
  }
  function createVersion(project, versions, options = {}) {
    if(options.note!==undefined&&(typeof options.note!=='string'||options.note.length>2000))throw error('版本说明不能超过 2000 个字符。');
    const numbers=versions.filter(version=>version.projectId===project.id).map(version=>version.number);let id;
    do{id='version-'+newId().slice(6);}while(versions.some(version=>version.id===id));
    const number=Math.max(0,...numbers)+1,createdAt=new Date().toISOString();
    if(!Number.isSafeInteger(number))throw error('项目版本号已达到上限，无法继续添加版本。');
    const snapshot={...project,currentVersionId:id,currentVersionNumber:number,sourceReferences:references(project.sourceReferences)};
    return {id,projectId:project.id,projectCode:project.projectCode,number,createdAt,note:options.note||'',snapshot};
  }
  global.PracticeStore=Object.freeze({
    setScope:async id=>{
      if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)))throw error('账号资料范围无效。');
      if(scope!==id){scope=id;scopeGeneration++;for(const active of activeTransactions)active.abort(changedScope());}
    },
    get scope(){return scope;},
    list:async()=>{const data=await readAll();return data.projects.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));},
    get:async id=>{requireId(id);return (await readAll()).projects.find(project=>project.id===id)||null;},
    put:async(record,options={})=>{
      if(!options||typeof options!=='object'||['clearDraft','saveVersion'].some(key=>options[key]!==undefined&&typeof options[key]!=='boolean'))throw error('项目保存选项无效。');
      const actor=token(),project=await prepared(record);checkToken(actor);
      return snapshot('readwrite',(data,stores)=>{
        migrateCodes(data,stores);const used=new Set(data.projects.map(item=>item.projectCode));
        if(!project.id){do{project.id=newId();}while(data.projects.some(item=>item.id===project.id));}
        const previous=data.projects.find(item=>item.id===project.id),now=new Date().toISOString();
        project.projectCode=previous?.projectCode||(validCode(project.projectCode)&&!used.has(project.projectCode)?project.projectCode:newCode(used));
        project.createdAt=previous?.createdAt||project.createdAt||now;project.updatedAt=now;
        if(record.sourceReferences===undefined&&previous?.sourceReferences)project.sourceReferences=references(previous.sourceReferences);
        delete project.currentVersionId;delete project.currentVersionNumber;
        if(previous?.currentVersionId){project.currentVersionId=previous.currentVersionId;project.currentVersionNumber=previous.currentVersionNumber;}
        const versions=[...data.versions];
        if(options.saveVersion){const version=createVersion(project,versions,options);versions.push(version);project.currentVersionId=version.id;project.currentVersionNumber=version.number;}
        capacity(data.projects.filter(item=>item.id!==project.id).concat(project),options.clearDraft?null:data.draft,versions,data.workspace);
        stores.projects.put(project);if(options.clearDraft)stores.meta.delete('draft');if(options.saveVersion)stores.meta.put({key:'versions',value:versions});bump(data,stores);return project;
      },actor.key,actor);
    },
    remove:async id=>{requireId(id);return snapshot('readwrite',(data,stores)=>{stores.projects.delete(id);stores.meta.put({key:'versions',value:data.versions.filter(version=>version.projectId!==id)});if(data.workspace.initialized)stores.meta.put({key:'workspace',value:workspace({...data.workspace,bookmarks:data.workspace.bookmarks.filter(item=>item!==id)})});bump(data,stores);});},
    getDraft:()=>snapshot('readonly',data=>data.draft),
    putDraft:async record=>{const actor=token(),draft=await prepared(record,true);checkToken(actor);return snapshot('readwrite',(data,stores)=>{capacity(data.projects,draft,data.versions,data.workspace);stores.meta.put({key:'draft',value:draft});bump(data,stores);return draft;},actor.key,actor);},
    clearDraft:()=>snapshot('readwrite',(data,stores)=>{stores.meta.delete('draft');bump(data,stores);}),
    getWorkspaceState:()=>snapshot('readonly',data=>data.workspace),
    putWorkspaceState:async(value,options={})=>{
      const input=plain(value,0,new Set());
      if(!options||typeof options!=='object'||(options.ifUninitialized!==undefined&&typeof options.ifUninitialized!=='boolean'))throw error('工作台保存选项无效。');
      return snapshot('readwrite',(data,stores)=>{
        if(options.ifUninitialized&&data.workspace.initialized)return data.workspace;
        const next=workspace({bookmarks:input.bookmarks===undefined?data.workspace.bookmarks:input.bookmarks,tasks:input.tasks===undefined?data.workspace.tasks:input.tasks});
        capacity(data.projects,data.draft,data.versions,next);stores.meta.put({key:'workspace',value:next});bump(data,stores);return next;
      });
    },
    updateWorkspaceState:async value=>{
      const input=plain(value,0,new Set());
      if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['toggleBookmark','taskUpserts','taskDeletes'].includes(key)))throw error('工作台更新选项无效。');
      if(input.toggleBookmark!==undefined)workspace({bookmarks:[input.toggleBookmark]});
      const upserts=workspace({tasks:input.taskUpserts===undefined?{}:input.taskUpserts}).tasks;
      const deletes=workspace({bookmarks:input.taskDeletes===undefined?[]:input.taskDeletes}).bookmarks;
      return snapshot('readwrite',(data,stores)=>{
        const bookmarks=new Set(data.workspace.bookmarks),tasks={...data.workspace.tasks,...upserts};
        if(input.toggleBookmark!==undefined){if(bookmarks.has(input.toggleBookmark))bookmarks.delete(input.toggleBookmark);else bookmarks.add(input.toggleBookmark);}
        for(const id of deletes)delete tasks[id];
        const next=workspace({bookmarks:[...bookmarks],tasks});capacity(data.projects,data.draft,data.versions,next);
        stores.meta.put({key:'workspace',value:next});bump(data,stores);return next;
      });
    },
    saveVersion:async(id,options={})=>{
      requireId(id);const actor=token(),current=await (async()=>{const data=await readAll(actor.key,actor);return {data,project:data.projects.find(item=>item.id===id)};})();
      if(!current.project)throw error('未找到需要保存版本的项目。');
      const project=await prepared(current.project);checkToken(actor);
      return snapshot('readwrite',(data,stores)=>{if(data.revision!==current.data.revision)throw error('项目已更新，请重新保存版本。');const version=createVersion(project,data.versions,options),versions=data.versions.concat(version);capacity(data.projects,data.draft,versions,data.workspace);stores.meta.put({key:'versions',value:versions});stores.projects.put({...project,currentVersionId:version.id,currentVersionNumber:version.number});bump(data,stores);return version;},actor.key,actor);
    },
    adoptVersion:async(record, supplied)=>{
      const actor=token(),project=await prepared(record);requireId(project.id);
      if(!validCode(project.projectCode))throw error('云端项目缺少有效的稳定编号。');
      const metadata=plain(supplied,0,new Set());
      if(!metadata||!validVersionId(metadata.id)||!Number.isSafeInteger(metadata.number)||metadata.number<1||!Number.isFinite(Date.parse(metadata.createdAt))|| (metadata.note!==undefined&&(typeof metadata.note!=='string'||metadata.note.length>2000)))throw error('云端版本资料无效。');
      if(metadata.sourceReferences!==undefined)project.sourceReferences=references(metadata.sourceReferences);
      project.currentVersionId=metadata.id;project.currentVersionNumber=metadata.number;
      project.createdAt=project.createdAt||metadata.createdAt;project.updatedAt=project.updatedAt||metadata.createdAt;
      const version={id:metadata.id,projectId:project.id,projectCode:project.projectCode,number:metadata.number,createdAt:metadata.createdAt,note:metadata.note||'',snapshot:{...project}};
      checkToken(actor);const current=await readAll(actor.key,actor),existing=current.projects.find(item=>item.id===project.id);
      if(current.projects.some(item=>item.projectCode===project.projectCode&&item.id!==project.id))throw error('项目编号已由另一个本地项目使用，请先备份并整理本地资料。');
      if(existing&&(existing.projectCode!==project.projectCode||await fingerprint(existing)!==await fingerprint(project)))throw error('本地项目与云端版本内容不同，请先备份本地项目再还原。');
      const previous=current.versions.find(item=>item.id===version.id||(item.projectId===project.id&&item.number===version.number));
      if(previous&&(previous.projectId!==project.id||await versionFingerprint(previous)!==await versionFingerprint(version)))throw error('这个版本已经存在且内容不同，不能覆盖不可变快照。');
      checkToken(actor);
      return snapshot('readwrite',(data,stores)=>{
        if(data.revision!==current.revision)throw error('工作台已更新，请重新下载云端版本。');
        const versions=previous?data.versions:data.versions.concat(version);
        // An older identical download may add history, but cannot move the current pointer backwards.
        const next=existing&&existing.currentVersionNumber>version.number?existing:project;
        capacity(data.projects.filter(item=>item.id!==project.id).concat(next),data.draft,versions,data.workspace);
        stores.projects.put(next);if(!previous)stores.meta.put({key:'versions',value:versions});bump(data,stores);return next;
      },actor.key,actor);
    },
    listVersions:async id=>{requireId(id);return snapshot('readonly',data=>data.versions.filter(version=>version.projectId===id).sort((a,b)=>b.number-a.number));},
    getVersion:async(id,versionId)=>{requireId(id);if(!validVersionId(versionId))throw error('版本 ID 无效。');return snapshot('readonly',data=>data.versions.find(version=>version.projectId===id&&version.id===versionId)||null);},
    restoreVersion:async(id,versionId)=>{
      requireId(id);if(!validVersionId(versionId))throw error('版本 ID 无效。');
      return snapshot('readwrite',(data,stores)=>{
        const version=data.versions.find(item=>item.projectId===id&&item.id===versionId);if(!version)throw error('未找到这个项目版本。');
        const source={projectId:id,projectCode:version.projectCode,versionId:version.id,versionNumber:version.number,title:version.snapshot.title||''};
        const draft={...version.snapshot,restoredFromVersionId:version.id,restoredFromVersionNumber:version.number,sourceReferences:references([...(version.snapshot.sourceReferences||[]),source])};
        capacity(data.projects,draft,data.versions,data.workspace);stores.meta.put({key:'draft',value:draft});bump(data,stores);return draft;
      });
    },
    encodeRecord,
    decodeRecord,
    exportProjectVersions,
    exportAll:()=>exportLibrary(scope),
    exportGuest:(options={})=>exportLibrary(null,token(),options.workspace),
    inspectBackup:async file=>{const actor=token(),incoming=await parseBackup(file);checkToken(actor);const current=await readAll(actor.key,actor),plan=await planImport(incoming,current,'skip');checkToken(actor);return {version:incoming.version,projects:incoming.projects.length,versions:incoming.versions.length,files:incoming.files,identical:plan.result.identical,conflicts:plan.conflicts,newProjects:plan.newProjects,hasDraft:Boolean(incoming.draft),hasWorkspace:incoming.workspace.initialized,taskConflicts:plan.result.taskConflicts,skippedTasks:plan.result.skippedTasks};},
    importBackup:async(file,options={})=>{
      if(!options||typeof options!=='object'||(options.conflict!==undefined&&!['skip','copy'].includes(options.conflict)))throw error('请选择跳过冲突或另存副本。');
      const actor=token(),incoming=await parseBackup(file);checkToken(actor);const current=await readAll(actor.key,actor),plan=await planImport(incoming,current,options.conflict||'skip');checkToken(actor);
      return snapshot('readwrite',(data,stores)=>{
        checkToken(actor);if(data.revision!==plan.revision)throw error('工作台已更新，请重新检查并导入备份。');
        for(const project of [...plan.projects,...plan.updatedProjects])stores.projects.put(project);
        if(plan.result.restoredDraft)stores.meta.put({key:'draft',value:plan.draft});
        if(plan.versions.length)stores.meta.put({key:'versions',value:data.versions.concat(plan.versions)});
        if(plan.workspace.initialized)stores.meta.put({key:'workspace',value:plan.workspace});
        bump(data,stores);return plan.result;
      },actor.key,actor);
    }
  });
})(window);
