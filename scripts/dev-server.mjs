// Real local account server. Binds to loopback only; never use as an Internet host.
import http from 'node:http';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { LocalProvider } from '../server/local-provider.mjs';
import { createSupabaseProvider } from '../server/supabase-provider.mjs';
import { LocalProjectsProvider } from '../server/local-projects.mjs';
import { createSupabaseProjectsProvider } from '../server/supabase-projects.mjs';
import { handleApi } from '../server/api.mjs';
import { createAiProvider, AI_LIMITS } from '../server/ai-provider.mjs';
import { applyRuntimePolicy } from '../server/runtime-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const origin = `http://127.0.0.1:${port}`;
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.zip':'application/zip', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.woff':'font/woff', '.woff2':'font/woff2', '.pdf':'application/pdf', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const useCloud = process.env.TASHAN_ACCOUNT_PROVIDER === 'supabase';
const provider = useCloud ? createSupabaseProvider(process.env) : new LocalProvider(process.env.TASHAN_LOCAL_DB || resolve(root, '.local/accounts.sqlite'));
const projectsProvider = useCloud ? createSupabaseProjectsProvider(process.env) : new LocalProjectsProvider(provider, {filesDir:process.env.TASHAN_LOCAL_FILES || resolve(root,'.local/project-files')});
const aiProvider = createAiProvider(process.env,{getPrompt:(task,options)=>provider.getAiPrompt(task,options)});
const publicEntries = new Set(['index.html', 'project-preview.html', 'teacher-practice-demo-v3.html', 'local-project-preview.html']);
function allowed(path) {
  if (path.split('/').some(part => part.startsWith('.') || ['node_modules','server','supabase','archive','backups'].includes(part))) return false;
  if (!types[extname(path).toLowerCase()]) return false;
  return publicEntries.has(path) || ['assets/', 'vibe coding库/', 'data/generated/'].some(prefix => path.startsWith(prefix));
}
async function staticResponse(request) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { return new Response('Not found', { status:404 }); }
  if (path.endsWith('/')) path += 'index.html';
  if (!allowed(path) || path.includes('\\') || path.includes('\0')) return new Response('Not found', { status:404 });
  const full = await realpath(resolve(root, path)).catch(() => null);
  if (!full || relative(root, full).startsWith('..') || !allowed(relative(root, full))) return new Response('Not found', { status:404 });
  const info = await stat(full);
  if (!info.isFile()) return new Response('Not found', { status:404 });
  const headers = { 'Content-Type': types[extname(full).toLowerCase()], 'Content-Length': String(info.size), 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' };
  return applyRuntimePolicy(request, new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(full)), { headers }));
}
const server = http.createServer(async (req, res) => {
  const disconnected = new AbortController();
  res.on('close', () => { if (!res.writableFinished) disconnected.abort(); });
  try {
    // Reject DNS rebinding / unexpected Host before any credentials or files are handled.
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) { res.writeHead(403); res.end('Invalid host'); return; }
    const requestURL = new URL(req.url, `http://${req.headers.host}`);
    if (requestURL.origin !== `http://${req.headers.host}`) { res.writeHead(400); res.end('Invalid URL'); return; }
    let body;
    if (!['GET','HEAD'].includes(req.method)) {
      const chunks = []; let size = 0;
      const limit=/^\/api\/v1\/projects\/[^/]+\/versions$/.test(requestURL.pathname)?36*1024*1024:requestURL.pathname==='/api/v1/ai/assist'?AI_LIMITS.requestBytes:32768;
      for await (const chunk of req) { size += chunk.length; if (size > limit) { res.writeHead(413); res.end('Request too large'); return; } chunks.push(chunk); }
      body = Buffer.concat(chunks);
    }
    const request = new Request(requestURL, { method:req.method, headers:req.headers, body, signal:disconnected.signal });
    let response;
    if (requestURL.pathname === '/api' || requestURL.pathname.startsWith('/api/')) response = await handleApi(request, provider, { clientIp:req.socket.remoteAddress || 'loopback', projectsProvider, aiProvider });
    else if (!['GET','HEAD'].includes(req.method)) response = new Response('Method not allowed', { status:405 });
    else response = await staticResponse(request);
    const headers = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(response.status, headers);
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch { if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json'}); res.end('{"error":{"code":"INTERNAL_ERROR","message":"请求未完成，请重试。"}}'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请先停止旧预览服务或设置 PORT。` : '本地服务启动失败。'); provider.close?.(); process.exitCode = 1; });
server.listen(port, '127.0.0.1', async () => { console.log(`他山${useCloud?'云端账号':'本机账号'}开发版：${origin}/index.html#login`); if ((await provider.status()).needsSetup) console.log('尚未创建管理员。请先运行 npm run dev:setup。'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { provider.close?.(); process.exit(0); }));
