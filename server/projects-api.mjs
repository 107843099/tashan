import { ApiError } from './api.mjs';

const MB = 1024 * 1024;
export const PROJECT_LIMITS = Object.freeze({ requestBytes: 36 * MB, attachmentBytes: 10 * MB, coverBytes: 5 * MB, metadataBytes: MB, ownerBytes: 200 * MB, projectsPerOwner: 100, versionsPerProject: 100, pageSize: 24 });
const UPLOAD_VARIABLES = Object.freeze({ requestBytes:'TASHAN_UPLOAD_REQUEST_BYTES', attachmentBytes:'TASHAN_UPLOAD_ATTACHMENT_BYTES', coverBytes:'TASHAN_UPLOAD_COVER_BYTES', metadataBytes:'TASHAN_UPLOAD_METADATA_BYTES' });
const DEFAULT_UPLOAD_POLICY = Object.freeze({ enabled:true, mode:'standard', reason:null, limits:PROJECT_LIMITS });
/** Worker-only operator policy. Missing/invalid settings never inherit large Node limits. */
export function workerUploadPolicy(env = {}) {
  const limits = { ...PROJECT_LIMITS };
  let reason = null;
  for (const [field, variable] of Object.entries(UPLOAD_VARIABLES)) {
    const raw = env[variable], value = String(raw ?? '').trim();
    if (!value) reason ||= 'UPLOAD_LIMITS_REQUIRED';
    else if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > PROJECT_LIMITS[field]) reason = 'UPLOAD_LIMITS_INVALID';
    else limits[field] = Number(value);
  }
  if (reason) for (const field of Object.keys(UPLOAD_VARIABLES)) limits[field] = 0;
  const transport = env.TASHAN_UPLOAD_TRANSPORT || 'json-inline-v1';
  if (!['json-inline-v1','r2-stream-v1'].includes(transport)) reason = 'UPLOAD_TRANSPORT_INVALID';
  return Object.freeze({ enabled:!reason, mode:'worker', reason, transport, limits:Object.freeze(limits) });
}
const FIELDS = ['attachment', 'coverFile'];
const TYPES = { html:'text/html', htm:'text/html', zip:'application/zip', md:'text/markdown', markdown:'text/markdown', txt:'text/plain', json:'application/json', pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif' };
export const projectError = (status, code, message) => new ApiError(status, code, message);
const invalid = message => { throw projectError(400, 'INVALID_PROJECT', message); };
export function requireProjectUser(user) {
  if (!user || user.status !== 'active') throw projectError(401, 'UNAUTHENTICATED', '请先登录。');
  if (user.mustChangePassword) throw projectError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改管理员重置的密码。');
  return user;
}
export function validProjectId(value) { return typeof value === 'string' && /^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value); }
export function validVersionId(value) { return typeof value === 'string' && /^version-[A-Za-z0-9][A-Za-z0-9_-]{0,91}$/.test(value); }
function plain(value, depth = 0) {
  if (depth > 32) invalid('项目资料层级过多。');
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => plain(item, depth + 1));
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('项目资料格式无效。');
  const result = {};
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('项目包含不支持的字段。');
    result[key] = plain(value[key], depth + 1);
  }
  return result;
}
export function canonicalJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function checkImage(bytes, extension) {
  const starts = signature => signature.every((byte, i) => bytes[i] === byte);
  if (extension === 'png') return starts([137,80,78,71,13,10,26,10]);
  if (['jpg','jpeg'].includes(extension)) return starts([255,216,255]);
  if (extension === 'gif') return new TextDecoder().decode(bytes.subarray(0,6)).match(/^GIF8[79]a$/);
  return extension === 'webp' && new TextDecoder().decode(bytes.subarray(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8,12)) === 'WEBP';
}
function checkFileSize(file, field, limits) {
  const encoded = file?.base64;
  if (typeof encoded !== 'string') return;
  const maximum = field === 'coverFile' ? limits.coverBytes : limits.attachmentBytes;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (encoded.length > Math.ceil(maximum / 3) * 4 || encoded.length / 4 * 3 - padding > maximum) throw projectError(413,'FILE_TOO_LARGE','附件超过当前部署的上传限制，仍可保存在此浏览器或导出备份。');
}
async function decodeFile(file, field, limits) {
  if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) invalid('附件文件名无效。');
  const extension = file.name.split('.').pop().toLowerCase(), type = TYPES[extension];
  if (!type || field === 'coverFile' && !['png','jpg','jpeg','webp','gif'].includes(extension)) invalid('不支持此附件格式。');
  if (file.type && typeof file.type !== 'string') invalid('附件类型无效。');
  const maximum = field === 'coverFile' ? limits.coverBytes : limits.attachmentBytes;
  const encoded = file.base64;
  checkFileSize(file, field, limits);
  // A repeated four-character group over a multi-MB string exhausts V8's regexp
  // stack. Check the alphabet and trailing padding without grouped repetition.
  if (typeof encoded !== 'string' || encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded)) invalid('附件编码无效或超过大小限制。');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (encoded.indexOf('=') !== (padding ? encoded.length - padding : -1)) invalid('附件编码无效或超过大小限制。');
  const size = encoded.length / 4 * 3 - padding;
  if (size > maximum) throw projectError(413,'FILE_TOO_LARGE','附件超过当前部署的上传限制，仍可保存在此浏览器或导出备份。');
  const bytes = new Uint8Array(size);
  // Decode in small chunks instead of keeping a second full-size binary string.
  for (let offset = 0, written = 0; offset < encoded.length; offset += 65536) {
    const chunk = atob(encoded.slice(offset, offset + 65536));
    for (let i = 0; i < chunk.length; i++) bytes[written++] = chunk.charCodeAt(i);
  }
  if (field === 'coverFile' && !checkImage(bytes, extension)) invalid('封面内容与图片格式不一致。');
  return { name: file.name, type, size, sha256: await sha256(bytes), bytes };
}
function describeFile(file, field, limits) {
  if (!file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key=>!['name','type','size','sha256'].includes(key))) invalid('附件描述格式无效。');
  if (typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) invalid('附件文件名无效。');
  const extension=file.name.split('.').pop().toLowerCase(),type=TYPES[extension];
  if (!type || field==='coverFile' && !['png','jpg','jpeg','webp','gif'].includes(extension)) invalid('不支持此附件格式。');
  if (!Number.isSafeInteger(file.size) || file.size<0 || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) invalid('附件大小或校验值无效。');
  if (file.size > (field==='coverFile'?limits.coverBytes:limits.attachmentBytes)) throw projectError(413,'FILE_TOO_LARGE','附件超过当前部署的上传限制。');
  if (file.type != null && typeof file.type !== 'string') invalid('附件类型无效。');
  return {name:file.name,type,size:file.size,sha256:file.sha256};
}
export async function normalizeProjectVersion(id, input, limits = PROJECT_LIMITS, {manifest=false} = {}) {
  if (!validProjectId(id)) invalid('项目 ID 无效。');
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('版本资料格式无效。');
  if (Object.keys(input).some(key => !['projectCode','version','metadata','files'].includes(key))) invalid('版本资料包含不支持的字段。');
  const v = input.version;
  if (!v || !validVersionId(v.id) || !Number.isSafeInteger(v.number) || v.number < 1 || v.number > 1000000) invalid('版本 ID 或版本序号无效。');
  if (typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt))) invalid('版本时间无效。');
  const uuidHex=id.slice(6).replace(/-/g,'');
  const projectCode = input.projectCode || 'TS-L-' + (/^[a-f0-9]{32}$/i.test(uuidHex)?uuidHex.slice(0,16):(await sha256(id)).slice(0,16)).toUpperCase();
  if (!/^TS-L-[A-F0-9]{16}$/.test(projectCode)) invalid('项目编号格式无效。');
  const metadata = plain(input.metadata);
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || Object.hasOwn(metadata, 'attachment') || Object.hasOwn(metadata, 'coverFile')) invalid('项目文字资料不能包含附件内容。');
  const title = typeof metadata.title === 'string' ? metadata.title : metadata.title?.['zh-CN'] || metadata.title?.en;
  if (typeof title !== 'string' || !title.trim() || title.length > 300) invalid('请填写有效的项目标题。');
  if (!['visual', 'prompt'].includes(metadata.kind)) invalid('请选择项目类型。');
  if (metadata.id && metadata.id !== id) invalid('项目 ID 与快照不一致。');
  if (metadata.projectCode && metadata.projectCode !== projectCode) invalid('项目编号与快照不一致。');
  const references = plain(v.sourceReferences || []);
  if (!Array.isArray(references) || references.length > 50 || references.some(ref => !ref || typeof ref !== 'object' || typeof ref.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(ref.projectId))) invalid('项目参考来源格式无效。');
  for (const ref of references) {
    if (ref.projectCode != null && (typeof ref.projectCode !== 'string' || !/^TS-[A-Z0-9-]{1,80}$/.test(ref.projectCode))) invalid('来源项目编号格式无效。');
    if (ref.versionId != null && !validVersionId(ref.versionId) && !(typeof ref.versionId === 'string' && /^catalog-[a-f0-9]{32,64}$/.test(ref.versionId))) invalid('来源版本 ID 无效。');
    if (ref.versionNumber != null && (!Number.isSafeInteger(ref.versionNumber) || ref.versionNumber < 1)) invalid('来源版本序号无效。');
  }
  const version = { id: v.id, number: v.number, createdAt: new Date(v.createdAt).toISOString(), note: typeof v.note === 'string' ? v.note.slice(0,2000) : '', sourceReferences: references, metadata };
  if (new TextEncoder().encode(canonicalJSON(version)).byteLength > limits.metadataBytes) throw projectError(413,'METADATA_TOO_LARGE','文字资料超过当前部署的上传限制，仍可保存在此浏览器或导出备份。');
  const fileInput = input.files || {};
  if (typeof fileInput !== 'object' || Array.isArray(fileInput) || Object.keys(fileInput).some(key => !FIELDS.includes(key))) invalid('附件字段无效。');
  // Reject either oversized attachment before decoding the other attachment.
  for (const field of FIELDS) if (fileInput[field] && !manifest) checkFileSize(fileInput[field], field, limits);
  const files = {};
  for (const field of FIELDS) if (fileInput[field]) files[field] = manifest ? describeFile(fileInput[field], field, limits) : await decodeFile(fileInput[field], field, limits);
  if (!files.attachment && !String(metadata.core || metadata.resultDescription || metadata.source || '').trim()) invalid('项目需要附件、Prompt 正文或成果说明。');
  const fileManifest = Object.fromEntries(Object.entries(files).map(([field, { bytes, ...info }]) => [field, info]));
  return { projectId: id, projectCode, ...version, files, fingerprint: await sha256(canonicalJSON({ projectId:id,projectCode,...version,files:fileManifest })) };
}
export function versionResponse(record, published = false) {
  const { project, version } = record;
  const base = `/api/v1/${published ? 'published' : 'projects'}/${encodeURIComponent(project.id)}/versions/${encodeURIComponent(version.id)}`;
  return { project, version: { id:version.id, number:version.number, createdAt:new Date(version.createdAt).toISOString(), note:version.note || '', sourceReferences:version.sourceReferences || [], metadata:version.metadata, files:Object.fromEntries(Object.entries(version.files || {}).map(([field, file]) => [field, {name:file.name,type:file.type,size:file.size,sha256:file.sha256,url:`${base}/files/${field}`}])) } };
}
async function readJSON(request, maximum) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw projectError(415,'JSON_REQUIRED','请使用 JSON 格式提交。');
  if (Number(request.headers.get('Content-Length')) > maximum) throw projectError(413,'BODY_TOO_LARGE','提交内容超过当前部署的单次上传限制，仍可保存在此浏览器或导出备份。');
  const reader = request.body?.getReader();
  let text = '', size = 0;
  const decoder = new TextDecoder();
  if (reader) while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw projectError(413,'BODY_TOO_LARGE','提交内容超过当前部署的单次上传限制，仍可保存在此浏览器或导出备份。'); }
    text += decoder.decode(value,{stream:true});
  }
  text += decoder.decode();
  try { return JSON.parse(text || '{}'); } catch { invalid('提交内容不是有效的 JSON。'); }
}
export async function handleProjectRequest(request, {user, provider, clientIp, uploadPolicy = DEFAULT_UPLOAD_POLICY} = {}) {
  const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',Vary:'Cookie, Origin'});
  const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
  try {
    const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
    const capabilities = await provider.status();
    const limits = uploadPolicy.limits;
    const streamUpload = uploadPolicy.transport === 'r2-stream-v1';
    const transportReady = !streamUpload || capabilities.uploadTransport === 'r2-stream-v1';
    const uploadReady = uploadPolicy.enabled && transportReady;
    if (path === '/api/v1/projects/capabilities' && method === 'GET') return response({configured:!!capabilities.configured,mode:capabilities.mode,canUpload:!!capabilities.configured&&uploadReady,canPublish:!!capabilities.configured,limits,uploadTransport:streamUpload?'r2-stream-v1':'json-inline-v1',uploadPolicy:{mode:uploadPolicy.mode,reason:uploadPolicy.reason||(!transportReady?'UPLOAD_STORAGE_REQUIRED':null)}});
    if (!capabilities.configured) throw projectError(503,'PROJECT_SERVICE_UNAVAILABLE','项目服务尚未配置。');
    const published = path === '/api/v1/published' || path.startsWith('/api/v1/published/');
    if (!published) requireProjectUser(user);
    if (method !== 'GET') {
      if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw projectError(403,'INVALID_ORIGIN','请从本站页面提交操作。');
      requireProjectUser(user);
    }
    const page = Number(url.searchParams.get('page') || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) invalid('页码无效。');
    if (method === 'GET' && path === '/api/v1/projects') return response(await provider.listProjects(user,{page}));
    if (method === 'GET' && path === '/api/v1/published') return response(await provider.listPublished({page}));
    const uploadMatch=path.match(/^\/api\/v1\/projects\/(local-[A-Za-z0-9_-]+)\/uploads$/);
    const commitMatch=path.match(/^\/api\/v1\/projects\/(local-[A-Za-z0-9_-]+)\/versions\/(version-[A-Za-z0-9_-]+)\/commit$/);
    const assertStreaming=()=>{if(!streamUpload || !uploadReady)throw projectError(503,'UPLOADS_PAUSED','流式上传服务尚未准备好，请稍后重试。');};
    if(method==='POST' && uploadMatch && validProjectId(uploadMatch[1])) {
      assertStreaming();
      await provider.rateLimit?.(user,{clientIp,operation:'upload'});
      const snapshot=await normalizeProjectVersion(uploadMatch[1],await readJSON(request,limits.requestBytes),limits,{manifest:true});
      return response(await provider.prepareUpload(user,snapshot));
    }
    if(method==='POST' && commitMatch && validProjectId(commitMatch[1]) && validVersionId(commitMatch[2])) {
      assertStreaming();
      const input=await readJSON(request,256);
      if(!input || Object.keys(input).length!==1 || !/^[a-f0-9]{64}$/.test(input.fingerprint||''))invalid('版本校验值无效。');
      const result=await provider.commitUpload(user,commitMatch[1],commitMatch[2],input.fingerprint);
      return response(versionResponse(result),result.created?201:200);
    }
    const projectMatch=path.match(/^\/api\/v1\/(projects|published)\/(local-[A-Za-z0-9_-]+)$/);
    if(method==='GET'&&projectMatch&&validProjectId(projectMatch[2]))return response({project:await provider.getProject(published?null:user,projectMatch[2],{published})});
    const match = path.match(/^\/api\/v1\/(projects|published)\/(local-[A-Za-z0-9_-]+)\/(versions(?:\/(version-[A-Za-z0-9_-]+)(?:\/files\/(attachment|coverFile))?)?|publish|publication)$/);
    if (!match || !validProjectId(match[2]) || match[4] && !validVersionId(match[4])) throw projectError(404,'NOT_FOUND','项目接口不存在。');
    const [,area,id,action,versionId,field] = match;
    if (area === 'published' && (!versionId || method !== 'GET')) throw projectError(404,'NOT_FOUND','项目接口不存在。');
    if(method==='PUT' && field) {
      assertStreaming();
      const fingerprint=request.headers.get('X-Tashan-Fingerprint');
      if(!/^[a-f0-9]{64}$/.test(fingerprint||''))invalid('版本校验值无效。');
      return response(await provider.uploadFile(user,id,versionId,field,fingerprint,request,limits));
    }
    if (method === 'GET' && field) {
      const file = await provider.getFile(published ? null : user,id,versionId,field,{published});
      return new Response(file.body,{headers:{'Content-Type':file.type,'Content-Length':String(file.size),'Content-Disposition':`${field==='coverFile'?'inline':'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
    }
    if (method === 'GET' && versionId) return response(versionResponse(await provider.getVersion(published ? null : user,id,versionId,{published}),published));
    if (method === 'GET' && action === 'versions') {
      const result = await provider.listVersions(user,id);
      // PostgreSQL JSON timestamps may use +00:00; keep snapshot identity stable
      // across cloud downloads and existing browser copies created with ISO Z.
      return response({...result,versions:result.versions.map(version=>({...version,createdAt:new Date(version.createdAt).toISOString()}))});
    }
    if (method === 'POST' && action === 'versions') {
      if (!uploadPolicy.enabled) throw projectError(503,'UPLOADS_PAUSED','线上上传暂未开放。你仍可保存到此浏览器或导出备份，已保存的版本仍可读取和发布。');
      // Large Base64 JSON must never remain an alternate path around the Free
      // Worker streaming transport; reject without reading the request body.
      if (streamUpload) throw projectError(415,'STREAM_UPLOAD_REQUIRED','请刷新页面，使用分文件上传。浏览器草稿和备份仍可保留。');
      await provider.rateLimit?.(user,{clientIp,operation:'upload'});
      const snapshot = await normalizeProjectVersion(id,await readJSON(request,limits.requestBytes),limits);
      const result = await provider.saveVersion(user,snapshot);
      return response(versionResponse(result),result.created ? 201 : 200);
    }
    if ((method === 'POST' && action === 'publish') || (method === 'DELETE' && action === 'publication')) {
      await provider.rateLimit?.(user,{clientIp,operation:'publication'});
      const input = await readJSON(request,4096);
      if (!input || Array.isArray(input) || !Object.hasOwn(input,'expectedVersionId') || input.expectedVersionId !== null && !validVersionId(input.expectedVersionId)) invalid('请提供当前公开版本，用于防止覆盖另一处更新。');
      if (method === 'POST') {
        if (!validVersionId(input.versionId)) invalid('请选择要发布的版本。');
        return response({project:await provider.publish(user,id,input)});
      }
      return response({project:await provider.unpublish(user,id,input)});
    }
    throw projectError(405,'METHOD_NOT_ALLOWED','项目接口不支持此操作。');
  } catch (error) {
    const safe = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 && typeof error.code === 'string';
    return response({error:{code:safe ? error.code : 'PROJECT_ERROR',message:safe ? error.message : '项目操作未完成，请稍后重试。'}},safe ? error.status : 500);
  }
}
