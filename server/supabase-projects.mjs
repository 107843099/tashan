import { projectError, sha256 } from './projects-api.mjs';
import { putProjectFile, verifyR2Object } from './r2-upload.mjs';
const BUCKET='tashan-projects';
const errors={
 E_FORBIDDEN:[403,'FORBIDDEN','没有执行此项目操作的权限。'],E_PROJECT_NOT_FOUND:[404,'PROJECT_NOT_FOUND','项目或版本不存在。'],
 E_PROJECT_CODE_CONFLICT:[409,'PROJECT_CODE_CONFLICT','项目编号已存在或与已保存项目不一致。'],E_VERSION_CONFLICT:[409,'VERSION_CONFLICT','这个版本已存在，内容不同。请保存为新版本。'],
 E_VERSION_NUMBER_CONFLICT:[409,'VERSION_NUMBER_CONFLICT','这个版本序号已经存在。'],E_PROJECT_LIMIT:[409,'PROJECT_LIMIT','已达到项目数量上限。'],
 E_VERSION_LIMIT:[409,'VERSION_LIMIT','已达到此项目的版本数量上限。'],E_STORAGE_QUOTA:[413,'STORAGE_QUOTA','账号资料已达到 200 MB 上限。'],
 E_PUBLICATION_CONFLICT:[409,'PUBLICATION_CONFLICT','公开版本已在另一处更新，请刷新后再操作。'],E_PROJECT_FILE_MISSING:[409,'UPLOAD_INCOMPLETE','附件尚未完整上传，请重试保存同一版本。'],
 E_INVALID_INPUT:[400,'INVALID_PROJECT','项目资料格式无效或超过限制。'],
 E_UPLOAD_TRANSPORT:[409,'UPLOAD_TRANSPORT_CONFLICT','这个未完成版本使用旧上传方式，请保存为新版本后重试。'],
 E_UPLOAD_PROTOCOL_CONFLICT:[409,'UPLOAD_TRANSPORT_CONFLICT','这个未完成版本使用旧上传方式，请保存为新版本后重试。'],
 E_ASSET_SIZE_CONFLICT:[409,'FILE_VERIFICATION_FAILED','同一文件校验值对应的大小不一致，请重新选择文件。'],
 E_UPLOAD_VERIFICATION_FAILED:[409,'FILE_VERIFICATION_FAILED','文件校验未通过，请重新上传。'],
 E_UPLOAD_VERIFICATION_CONFLICT:[409,'FILE_VERIFICATION_FAILED','文件的已验证版本不一致，请保存为新版本后重试。'],
 E_FILE_VERIFICATION:[409,'FILE_VERIFICATION_FAILED','文件校验未通过，请重新上传。']
};
const unavailable=()=>projectError(503,'PROJECT_SERVICE_UNAVAILABLE','项目服务暂时不可用，请稍后重试。');
export function createSupabaseProjectsProvider(env,{fetch:fetchImpl=globalThis.fetch}={}){
 const endpoint=String(env?.SUPABASE_URL||'').replace(/\/$/,''),key=String(env?.SUPABASE_SECRET_KEY||env?.SUPABASE_SERVICE_ROLE_KEY||'');
 const r2=env?.TASHAN_PROJECT_FILES;
 let configured=!!(endpoint&&key);
 try{const url=new URL(endpoint);configured=configured&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));}catch{configured=false;}
 async function request(path,{method='GET',body,contentType='application/json',raw=false,duplicateOK=false}={}){
  if(!configured)throw projectError(503,'PROJECT_SERVICE_UNAVAILABLE','项目服务尚未配置。');
  const headers={apikey:key,'Content-Type':contentType};if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  if(duplicateOK)headers['x-upsert']='false';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  let response;
  try{response=await fetchImpl(endpoint+path,{method,headers,signal:controller.signal,...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});}catch{throw unavailable();}finally{clearTimeout(timer);}
  if(response.ok&&raw)return response;
  let data=null;try{data=await response.json();}catch{if(response.ok&&response.status!==204)throw unavailable();}
  if(!response.ok){
   if(duplicateOK&&[400,409].includes(response.status)&&(data?.error==='Duplicate'||data?.statusCode==='409'||/already exists/i.test(data?.message||'')))return {duplicate:true};
   if(errors[data?.message])throw projectError(...errors[data.message]);
   if(response.status===429)throw projectError(429,'RATE_LIMITED','项目操作过于频繁，请稍后重试。');
   if(data?.code==='23505')throw projectError(409,'VERSION_CONFLICT','项目编号或版本已存在，请刷新后重试。');
   if(response.status===404&&raw)throw projectError(503,'PROJECT_FILE_UNAVAILABLE','项目文件暂时不可用。');
   throw unavailable();
  }
  return data;
 }
 const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',body});
 const provider={
  status:async()=>({configured,mode:'supabase',...(r2?{uploadTransport:'r2-stream-v1'}:{})}),
  rateLimit:async(user,{operation})=>{if(!await rpc('tashan_rate_limit',{p_key_hash:await sha256(`projects:${operation}:${user.id}`),p_limit:operation==='upload'?20:30,p_window_seconds:60}))throw projectError(429,'RATE_LIMITED','项目操作过于频繁，请稍后重试。');},
  listProjects:(user,{page=1}={})=>rpc('tashan_project_list',{p_actor:user.id,p_page:page}),
  listPublished:({page=1}={})=>rpc('tashan_project_published',{p_page:page}),
  getProject:(user,id,{published=false}={})=>rpc('tashan_project_get',{p_actor:user?.id||null,p_id:id,p_public:published}),
  listVersions:(user,id)=>rpc('tashan_project_versions',{p_actor:user.id,p_id:id}),
  getVersion:(user,id,versionId,{published=false}={})=>rpc('tashan_project_version',{p_actor:user?.id||null,p_id:id,p_version:versionId,p_public:published}),
  saveVersion:async(user,snapshot)=>{
   const manifest={...snapshot,files:Object.fromEntries(Object.entries(snapshot.files).map(([field,{bytes,...file}])=>[field,file]))};
   const prepared=await rpc('tashan_project_prepare',{p_actor:user.id,p_snapshot:manifest});
   if(prepared.ready)return {...await provider.getVersion(user,snapshot.projectId,snapshot.id),created:false};
   const unique=new Map(Object.values(snapshot.files).map(file=>[file.sha256,file]));
   // Bounded sequential uploads avoid doubling memory while handling a large JSON version.
   for(const file of unique.values())await request(`/storage/v1/object/${BUCKET}/${encodeURIComponent(user.id)}/${file.sha256}`,{method:'POST',body:file.bytes,contentType:file.type,duplicateOK:true});
   return rpc('tashan_project_commit',{p_actor:user.id,p_id:snapshot.projectId,p_version:snapshot.id,p_fingerprint:snapshot.fingerprint});
  },
  prepareUpload:async(user,snapshot)=>{
   if(!r2)throw unavailable();
   return rpc('tashan_project_prepare_r2',{p_actor:user.id,p_snapshot:snapshot});
  },
  uploadFile:async(user,id,versionId,field,fingerprint,uploadRequest,limits)=>{
   if(!r2)throw unavailable();
   const file=await rpc('tashan_project_upload_file',{p_actor:user.id,p_id:id,p_version:versionId,p_field:field,p_fingerprint:fingerprint});
   if(file.storageBackend!=='r2'||file.objectKey!==`${user.id}/${file.sha256}`||!/^[a-f0-9]{64}$/.test(file.sha256))throw unavailable();
   if(!Number.isSafeInteger(file.size)||file.size<0||file.size>(field==='coverFile'?limits.coverBytes:limits.attachmentBytes))throw projectError(413,'FILE_TOO_LARGE','附件超过当前部署的上传限制。');
   const stored=await putProjectFile(r2,file.objectKey,file,uploadRequest,field);
   await rpc('tashan_project_mark_verified',{p_actor:user.id,p_id:id,p_version:versionId,p_field:field,p_fingerprint:fingerprint,p_sha256:file.sha256,p_size:file.size,p_object_version:stored.objectVersion,p_image_type:stored.imageType});
   return {uploaded:true,sha256:file.sha256,size:file.size};
  },
  commitUpload:async(user,id,versionId,fingerprint)=>{
   if(!r2)throw unavailable();
   return rpc('tashan_project_commit_r2',{p_actor:user.id,p_id:id,p_version:versionId,p_fingerprint:fingerprint});
  },
  publish:(user,id,{versionId,expectedVersionId})=>rpc('tashan_project_publish',{p_actor:user.id,p_id:id,p_version:versionId,p_expected:expectedVersionId}),
  unpublish:(user,id,{expectedVersionId})=>rpc('tashan_project_unpublish',{p_actor:user.id,p_id:id,p_expected:expectedVersionId}),
  getFile:async(user,id,versionId,field,{published=false}={})=>{
   const file=await rpc('tashan_project_file',{p_actor:user?.id||null,p_id:id,p_version:versionId,p_field:field,p_public:published});
   if(typeof file?.objectKey!=='string'||!/^[A-Za-z0-9_-]+\/[a-f0-9]{64}$/.test(file.objectKey))throw unavailable();
   if(file.storageBackend==='r2'){
    if(!r2)throw projectError(503,'PROJECT_FILE_UNAVAILABLE','此文件保存在云端 R2，请在正式站点打开。');
    const object=await r2.get(file.objectKey);
    try{verifyR2Object(object,file,file.objectVersion);}catch(error){await object?.body?.cancel().catch(()=>{});throw error;}
    if(!object?.body)throw unavailable();
    return {name:file.name,type:file.type,size:file.size,sha256:file.sha256,body:object.body};
   }
   const response=await request(`/storage/v1/object/authenticated/${BUCKET}/${file.objectKey}`,{raw:true});
   return {name:file.name,type:file.type,size:file.size,sha256:file.sha256,body:response.body};
  }
 };
 return Object.freeze(provider);
}
