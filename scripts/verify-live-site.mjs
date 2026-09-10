#!/usr/bin/env node
// Read-only acceptance. No environment files, cookies, credentials, login or AI generation.
import {pathToFileURL} from 'node:url';

const REDIRECTS = new Set([301,302,303,307,308]);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const REQUIRED_ASSETS = ['/assets/js/app.js','/assets/js/accounts.js','/assets/js/storage.js','/assets/js/project-lifecycle.js','/assets/data/catalog.js','/assets/data/translations.js','/assets/css/app.css'];
const PRIVATE_PATHS = ['/.dev.vars','/.env','/.local/','/.local/accounts.sqlite','/.local/project-files/','/server/worker.mjs','/server/api.mjs','/scripts/dev-server.mjs','/supabase/migrations/202609100001_accounts.sql','/.git/config','/%2Edev.vars','/%2Elocal/accounts.sqlite','/%73erver/worker.mjs'];
const ENCODED_PROJECT_PATHS = ['/projects/earth/','/projects/earth/index.html','/projects%2Fearth%2Findex.html','/%70rojects/earth/','/pr%6fjects/earth/index.html','/projects/ear%74h/','/%2570rojects/earth/','/projects%252Fearth%252Findex.html','//projects/earth/','/%2Fprojects/earth/','/projects/earth/index%2Ehtml','/projects/earth/%69ndex.html','/projects/optics/pinhole.html','/%70rojects/optics/pinhole.html','/%70rojects/optics/pinhole/','/projects%2Foptics%2Fpinhole'];
const ENCODED_API_PATHS = ['/%61pi/v1/status','/api%2Fv1%2Fstatus','/api/v1/%73tatus','/%2561pi/v1/status'];
class VerificationError extends Error {}
const fail = message => {throw new VerificationError(message);};
const ensure = (condition,message) => {if(!condition)fail(message);};

export function validateOrigin(value) {
  let url;
  try {url = new URL(value);} catch {fail('请明确提供 HTTPS 站点 origin。');}
  ensure(url.protocol === 'https:' && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash,'origin 只允许 HTTPS 根地址，不含端口、路径、账号或查询参数。');
  ensure(url.hostname === 'tashan.dev' || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/.test(url.hostname),'只允许 tashan.dev 或明确传入的 workers.dev 子域名。');
  return url.origin;
}

function isIsolated(response) {
  const policy=response.headers.get('Content-Security-Policy')||'';
  const sandbox=policy.split(';').map(part=>part.trim()).find(part=>/^sandbox(?:\s|$)/i.test(part));
  return !!sandbox && /\ballow-scripts\b/.test(sandbox) && !/\ballow-same-origin\b/.test(sandbox) && response.headers.get('X-Content-Type-Options')==='nosniff';
}
function resourceRefs(text,kind) {
  const refs=[];
  if(kind==='html')for(const match of text.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi))refs.push(match[2]);
  if(kind==='js') {
    for(const match of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?(["'])(\.{1,2}\/[^"']+)\1/g))refs.push(match[2]);
    for(const match of text.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g))refs.push(match[2]);
    for(const match of text.matchAll(/\bnew\s+URL\(\s*(["'])(\.{1,2}\/[^"']+)\1/g))refs.push(match[2]);
  }
  if(kind==='css')for(const match of text.matchAll(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/g))refs.push(match[2]);
  return refs;
}

export async function verifyLiveSite(value,{fetch:fetchImpl=globalThis.fetch}={}) {
  const origin=validateOrigin(value),checks=[],resources=new Map();
  let requests=0,externalDependencies=0,textBytes=0;
  const check=async(name,operation)=>{
    try {const detail=await operation();checks.push({name,ok:true,...(detail?{detail}:{})});}
    catch(error){checks.push({name,ok:false,message:error instanceof VerificationError?error.message:'检查未完成；未输出服务端响应或底层错误内容。'});}
  };
  async function request(path,{method='GET',accept='text/html',navigation=false}={}) {
    let url=origin+path;
    for(let step=0;step<6;step++) {
      ensure(++requests<=250,'检查请求数超过上限，请检查资源引用循环。');
      let response;
      try {response=await fetchImpl(url,{method,redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',headers:{Accept:accept,...(navigation?{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}:{})},signal:AbortSignal.timeout(12000)});}
      catch {fail('请求失败或超时；请核对 DNS、TLS 与部署状态。');}
      if(!REDIRECTS.has(response.status))return {response,url};
      const location=response.headers.get('Location');
      await response.body?.cancel();
      ensure(location,'重定向缺少目标地址。');
      let next;
      try {next=new URL(location,url);} catch {fail('重定向地址无效。');}
      ensure(next.origin===origin&&!next.username&&!next.password,'重定向离开本站或包含身份信息，已停止。');
      // Query values are never printed and no redirect can add an Authorization header.
      url=next.href;
    }
    fail('同站重定向次数过多。');
  }
  async function readText(response) {
    const reader=response.body?.getReader();if(!reader)return '';
    const decoder=new TextDecoder();let content='',size=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;textBytes+=value.byteLength;
        ensure(size<=MAX_TEXT_BYTES&&textBytes<=32*1024*1024,'公开文本体积超过验收脚本上限。');content+=decoder.decode(value,{stream:true});}
      return content+decoder.decode();
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
  }
  async function api(path,expected,verify) {
    const {response}=await request(path,{accept:'application/json'});
    ensure(response.status===expected,`接口状态应为 ${expected}，实际 ${response.status}。`);
    ensure((response.headers.get('Content-Type')||'').includes('application/json'),'API 返回了非 JSON 内容，可能存在首页回退。');
    let data;try {data=JSON.parse(await readText(response));}catch {fail('API 未返回有效 JSON。');}
    ensure(verify(data),'接口响应不符合预期的匿名访问或云端配置状态。');
  }
  function addResource(ref,owner,role='dependency') {
    if(!ref||/^(?:#|%23|data:|blob:)/i.test(ref)||ref.includes('${'))return;
    let url;try {url=new URL(ref.replaceAll('&amp;','&'),owner);}catch {fail('公开资源地址格式无效。');}
    if(url.origin!==origin){externalDependencies++;return;}
    ensure(!url.username&&!url.password&&/^\/(?:assets|projects|downloads)\/[A-Za-z0-9_./-]+$/.test(url.pathname)&&!url.pathname.split('/').some(part=>part.startsWith('.')),'公开资源引用越出了 assets/projects/downloads 发布目录。');
    const key=url.pathname+url.search;
    if(!resources.has(key))resources.set(key,{key,role});
    else if(role==='runtime')resources.get(key).role='runtime';
    ensure(resources.size<=150,'公开资源数量超出本次验收范围。');
  }

  let homepage;
  await check('首页',async()=>{
    const {response,url}=await request('/');
    ensure(response.status===200,'首页不是 HTTP 200。');
    ensure((response.headers.get('Content-Type')||'').includes('text/html'),'首页不是 HTML。');
    homepage=await readText(response);
    ensure(homepage.includes('id="practice-ui"')&&homepage.includes('他山'),'首页不是预期的他山平台。');
    for(const ref of resourceRefs(homepage,'html'))addResource(ref,url);
    for(const required of REQUIRED_ASSETS)ensure([...resources.values()].some(resource=>resource.key.split('?')[0]===required),'首页缺少必要的应用脚本或样式。');
  });
  await check('云端账号状态',()=>api('/api/v1/status',200,data=>data.configured===true&&data.mode==='supabase'&&data.signupEnabled===false));
  await check('匿名会话',()=>api('/api/v1/auth/session',200,data=>data.user===null));
  for(const path of ['/admin/users','/projects','/ai/capabilities'])await check('匿名保护 '+path,()=>api('/api/v1'+path,401,data=>data.error?.code==='UNAUTHENTICATED'));
  await check('云端项目状态',()=>api('/api/v1/projects/capabilities',200,data=>data.configured===true&&data.mode==='supabase'));
  await check('公开项目读取',()=>api('/api/v1/published?page=1',200,data=>Array.isArray(data.projects)&&Number.isFinite(data.total)));
  await check('API 根路径无首页回退',()=>api('/api',404,data=>!!data.error));
  await check('无效 API 路径无首页回退',()=>api('/api/not-a-route',404,data=>!!data.error));

  let projectCount=0;
  const queued=[];
  // Map iteration also visits dependencies added during traversal. No remote code is executed.
  for(const resource of resources.values()) {
    queued.push(resource);
    await check('资源 '+resource.key.split('?')[0],async()=>{
      const path=resource.key.split('?')[0];
      const kind=path.endsWith('.html')||path.endsWith('/')?'html':/\.m?js$/.test(path)?'js':path.endsWith('.css')?'css':null;
      const {response,url}=await request(resource.key,{method:kind?'GET':'HEAD',accept:kind==='html'?'text/html':'*/*'});
      try {
        ensure(response.status===200,`公开资源应为 HTTP 200，实际 ${response.status}。`);
        const type=response.headers.get('Content-Type')||'';
        if(kind==='html')ensure(type.includes('text/html'),'项目入口未返回 HTML。');
        else ensure(!type.includes('text/html'),'资源错误地返回了 HTML，可能存在首页回退。');
        if(kind==='js')ensure(/(?:javascript|ecmascript)/.test(type),'脚本 Content-Type 不正确。');
        if(kind==='css')ensure(type.includes('text/css'),'样式 Content-Type 不正确。');
        if(kind==='html'&&path.startsWith('/projects/'))ensure(isIsolated(response),'可执行项目缺少隔离 sandbox/nosniff 响应头。');
        if(!kind)return;
        const content=await readText(response);
        if(path==='/assets/data/catalog.js') {
          const match=content.match(/\bwindow\.PRACTICE_LIBRARY\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
          ensure(match,'项目目录不是可读取的静态 JSON 数据。');
          let catalog;try {catalog=JSON.parse(match[1]);}catch {fail('项目目录 JSON 无效。');}
          ensure(Array.isArray(catalog.projects)&&catalog.projects.length>0&&catalog.projects.length<=100,'公开目录没有项目或超过验收范围。');
          projectCount=catalog.projects.length;
          for(const project of catalog.projects) {
            ensure(['visual','prompt'].includes(project.kind)&&typeof project.sourceHref==='string','项目缺少类型或发布入口。');
            const entry=new URL(project.sourceHref,origin+'/');
            ensure(entry.origin===origin&&entry.pathname.startsWith('/projects/'),'项目目录仍引用源文件目录或外部地址。');
            addResource(project.sourceHref,origin+'/',project.kind==='visual'?'runtime':'document');
            for(const ref of [project.cover,project.packageHref,project.document?.download,project.example?.imageHref,...(project.coverVariants||[]).map(variant=>variant.src)])if(ref)addResource(ref,origin+'/');
          }
          return;
        }
        if(!path.startsWith('/assets/data/'))for(const ref of resourceRefs(content,kind))addResource(ref,url);
      }finally{if(!response.bodyUsed)await response.body?.cancel();}
    });
  }
  await check('公开目录完整',async()=>{ensure(projectCount>0,'未成功读取公开项目目录。');return `${projectCount} 个项目，${queued.length} 个资源`;});

  // Navigation headers also exercise Cloudflare's static navigation preference.
  for(const path of ENCODED_PROJECT_PATHS)await check('项目路由 '+path,async()=>{
    const {response}=await request(path,{navigation:true});
    try {
      if([400,403,404].includes(response.status)) {
        ensure(!['/projects/earth/','/projects/earth/index.html','/projects/optics/pinhole.html'].includes(path),'标准项目入口不可访问。');return '安全拒绝';
      }
      ensure(response.status===200&&(response.headers.get('Content-Type')||'').includes('text/html'),'项目路由既未返回项目页面，也未安全拒绝。');
      ensure(isIsolated(response),'编码路径绕过了项目 sandbox/nosniff。');
    }finally{await response.body?.cancel();}
  });
  for(const path of ENCODED_API_PATHS)await check('API 编码路由 '+path,async()=>{
    const {response}=await request(path,{accept:'application/json',navigation:true});
    try {
      ensure([200,400,401,403,404].includes(response.status),'API 编码路径返回异常状态。');
      if([200,401].includes(response.status))ensure((response.headers.get('Content-Type')||'').includes('application/json'),'API 编码路径返回了非 JSON 内容。');
    }finally{await response.body?.cancel();}
  });
  for(const path of PRIVATE_PATHS)await check('私有路径 '+path,async()=>{
    const {response}=await request(path);
    // Do not read or print the body, including when a server accidentally exposes it.
    await response.body?.cancel();
    ensure([403,404].includes(response.status),`私有路径没有被禁止访问（HTTP ${response.status}）。`);
  });
  return {origin,ok:checks.every(check=>check.ok),checks,requests,externalDependencies,note:'仅验证公开资源和匿名访问；未登录、上传、调用 AI 生成，也不代替浏览器交互或真实账号验收。'};
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){console.log('只读验收：node scripts/verify-live-site.mjs --origin https://tashan.dev\n也接受明确传入的 HTTPS workers.dev 子域名。不读取配置或凭据，不登录、不上传、不调用 AI 生成。');return;}
  ensure(args.length===2&&args[0]==='--origin','用法：node scripts/verify-live-site.mjs --origin <HTTPS origin>');
  const report=await verifyLiveSite(args[1]);
  const failures=report.checks.filter(check=>!check.ok);
  console.log(`${report.ok?'通过':'未通过'} ${report.origin}：${report.checks.length-failures.length}/${report.checks.length} 项；${report.requests} 次只读请求。`);
  for(const check of failures)console.log(`- ${check.name}：${check.message}`);
  if(report.externalDependencies)console.log(`另有 ${report.externalDependencies} 处外部依赖未主动请求。`);
  console.log(report.note);
  if(!report.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('验收未完成；请使用 --help 核对目标与参数。未输出响应内容或凭据。');process.exitCode=1;});
