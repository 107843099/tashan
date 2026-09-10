import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';

// Isolated local workerd + Miniflare R2 only. No .dev.vars, credentials, deployed
// Worker, external fetch or persistent bucket is loaded by this harness.
test('native workerd streams and R2 enforce checksums, lengths, signatures and conditional retries', {timeout:60000}, async t => {
  const bundle=await build({stdin:{contents:`
    import {putProjectFile} from './server/r2-upload.mjs';
    export default { async fetch(request,env) {
      const url=new URL(request.url),key=url.searchParams.get('key')||'fixture';
      try {
        if(url.pathname==='/head') { const o=await env.BUCKET.head(key);return Response.json({exists:!!o,size:o?.size,version:o?.version}); }
        const file=JSON.parse(request.headers.get('X-Fixture-Descriptor'));
        if(url.pathname==='/seed') { await env.BUCKET.put(key,request.body,{customMetadata:{sha256:file.sha256}});return Response.json({seeded:true}); }
        const headers=new Headers(request.headers);
        if(headers.has('X-Fixture-Declared'))headers.set('Content-Length',headers.get('X-Fixture-Declared'));
        const input={headers,body:request.body,bodyUsed:request.bodyUsed,signal:request.signal};
        return Response.json(await putProjectFile(env.BUCKET,key,file,input,url.searchParams.get('field')||'attachment'));
      } catch(error) {return Response.json({code:error.code||'UNEXPECTED',message:error.code?error.message:'Unexpected fixture error'}, {status:error.status||500});}
    }};`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'fixture.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  const mf=new Miniflare({host:'127.0.0.1',cf:false,telemetry:{enabled:false},log:new Log(LogLevel.ERROR),workers:[{config:{name:'r2-upload-fixture',type:'worker',compatibilityDate:'2026-09-10',manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:bundle.outputFiles[0].text}}},env:{BUCKET:{type:'r2',name:'r2-upload-fixture'}}}}]});
  try {
    const descriptor=(bytes,name='lesson.html',type='text/html')=>({name,type,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    const upload=async(key,bytes,file=descriptor(bytes),field='attachment',extra={},route='/upload')=>{
      const response=await mf.dispatchFetch('http://fixture.test'+route+'?key='+key+'&field='+field,{method:'PUT',headers:{'Content-Length':String(bytes.length),'X-Fixture-Descriptor':JSON.stringify(file),...extra},body:bytes});
      return {status:response.status,data:await response.json()};
    };
    const head=async key=>(await mf.dispatchFetch('http://fixture.test/head?key='+key)).json();
    await t.test('10 MiB raw attachment and 5 MiB cover survive native streams',async()=>{
      const attachment=new Uint8Array(10*1024*1024);attachment.fill(65);
      assert.equal((await upload('maximum-attachment',attachment)).status,200);
      assert.equal((await head('maximum-attachment')).size,attachment.length);
      const cover=new Uint8Array(5*1024*1024);cover.set([137,80,78,71,13,10,26,10,0,0,0,13]);
      const result=await upload('maximum-cover',cover,descriptor(cover,'cover.png','image/png'),'coverFile');
      assert.equal(result.status,200);assert.equal(result.data.imageType,'image/png');
      assert.equal((await head('maximum-cover')).size,cover.length);
    });
    await t.test('R2 service verifies supplied SHA-256',async()=>{
      const bytes=new Uint8Array(32),file={...descriptor(bytes),sha256:'f'.repeat(64)};
      const result=await upload('bad-sha',bytes,file);
      assert.equal(result.status,422);assert.equal(result.data.code,'UPLOAD_INCOMPLETE');assert.equal((await head('bad-sha')).exists,false);
    });
    await t.test('native fixed length rejects actual short and long streams',async()=>{
      for(const actual of [15,17]) {
        const bytes=new Uint8Array(actual),file=descriptor(new Uint8Array(16));
        const result=await upload('length-'+actual,bytes,file,'attachment',{'X-Fixture-Declared':'16'});
        assert.equal(result.status,422);assert.equal((await head('length-'+actual)).exists,false);
      }
    });
    await t.test('retries preserve the existing version and reread cover signatures',async()=>{
      const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13]);
      const file=descriptor(bytes,'cover.png','image/png');
      const one=await upload('cover-retry',bytes,file,'coverFile'),two=await upload('cover-retry',bytes,file,'coverFile');
      assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(one.data.objectVersion,two.data.objectVersion);assert.equal(two.data.imageType,'image/png');
    });
    await t.test('concurrent conditional writers reuse a single unchanged object',async()=>{
      const bytes=new Uint8Array(128*1024);bytes.fill(71);
      const attempts=await Promise.all(Array.from({length:4},()=>upload('race',bytes)));
      for(const result of attempts)assert.equal(result.status,200);
      assert.equal(new Set(attempts.map(result=>result.data.objectVersion)).size,1);
    });
    await t.test('custom metadata SHA cannot substitute for an R2-verified checksum',async()=>{
      const bytes=new Uint8Array(12),file=descriptor(bytes);
      assert.equal((await upload('custom-only',bytes,file,'attachment',{},'/seed')).status,200);
      const before=await head('custom-only');
      const result=await upload('custom-only',bytes,file);
      assert.equal(result.status,409);assert.equal(result.data.code,'STORED_FILE_MISMATCH');
      assert.equal((await head('custom-only')).version,before.version);
    });
  } finally { await mf.dispose(); }
});
