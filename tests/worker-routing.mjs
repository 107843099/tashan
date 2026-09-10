import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// HTTP acceptance against a separate, unconfigured local workerd instance.
// No account requests, cookies or credentials are used. Encoded paths are sent
// unchanged by fetch; same-origin redirects are followed explicitly for evidence.
export const routingCases = [
  ['runtime','/projects/earth/'],
  ['runtime','/projects/earth/index.html'],
  ['runtime','/projects%2Fearth%2Findex.html'],
  ['runtime','/%70rojects/earth/'],
  ['runtime','/pr%6fjects/earth/index.html'],
  ['runtime','/projects/ear%74h/'],
  ['runtime','/%2570rojects/earth/'],
  ['runtime','/projects%252Fearth%252Findex.html'],
  ['runtime','//projects/earth/'],
  ['runtime','/%2Fprojects/earth/'],
  ['runtime','/projects/earth/index%2Ehtml'],
  ['runtime','/projects/earth/%69ndex.html'],
  ['runtime','/projects/optics/pinhole.html'],
  ['runtime','/%70rojects/optics/pinhole.html'],
  ['runtime','/%70rojects/optics/pinhole/'],
  ['runtime','/projects%2Foptics%2Fpinhole'],
  ['api','/api'],
  ['api','/api/v1/status'],
  ['api','/%61pi/v1/status'],
  ['api','/api%2Fv1%2Fstatus'],
  ['api','/api/v1/%73tatus'],
  ['api','/%2561pi/v1/status'],
];
export async function probeWorkerRouting(origin,{navigation=false}={}) {
  const base = new URL(origin);
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Routing smoke only accepts a loopback origin.');
  const results=[];
  for(const [kind,path] of routingCases){
    let url=base.origin+path;const redirects=[];let response;
    for(let step=0;step<6;step++){
      response=await fetch(url,{redirect:'manual',headers:{Accept:kind==='api'?'application/json':'text/html',...(navigation?{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}:{})},signal:AbortSignal.timeout(10000)});
      if(![301,302,303,307,308].includes(response.status)||!response.headers.get('location'))break;
      const next=new URL(response.headers.get('location'),url);
      if(next.origin!==base.origin)throw new Error('Unexpected off-origin redirect.');
      redirects.push({status:response.status,path:next.pathname});await response.arrayBuffer();url=next.href;
    }
    const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type')||'';
    const policy=response.headers.get('content-security-policy')||'';
    const html=response.status>=200&&response.status<300&&type.includes('text/html');
    const isolated=/\bsandbox\b/.test(policy)&&/\ballow-scripts\b/.test(policy)&&!/\ballow-same-origin\b/.test(policy);
    results.push({kind,path,status:response.status,type,redirects,finalPath:new URL(url).pathname,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sandbox:isolated,nosniff:response.headers.get('x-content-type-options')==='nosniff',apiJSON:type.includes('application/json'),...(html&&kind==='runtime'&&!isolated?{failure:'Executable project HTML was served without its sandbox policy'}:{}),...(html&&kind==='api'?{failure:'An API path unexpectedly served successful HTML'}:{})});
  }
  const canonical=results.find(result=>result.path==='/projects/earth/');
  if(canonical.status!==200||!canonical.sandbox)canonical.failure??='Canonical project route is not available and sandboxed';
  const status=results.find(result=>result.path==='/api/v1/status');
  if(status.status!==200||!status.apiJSON)status.failure??='Canonical status route did not reach the API';
  return {origin:base.origin,navigation,results,failures:results.filter(result=>result.failure).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const index=process.argv.indexOf('--origin');
 if(index<0)throw new Error('Start an unconfigured Worker separately, then pass --origin http://127.0.0.1:4186');
 const report=await probeWorkerRouting(process.argv[index+1],{navigation:process.argv.includes('--navigation')});
 console.log(JSON.stringify(report,null,2));
 if(report.failures&&!process.argv.includes('--observe'))process.exitCode=1;
}
