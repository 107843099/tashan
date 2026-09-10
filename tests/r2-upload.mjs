import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { putProjectFile, verifyR2Object } from '../server/r2-upload.mjs';
import { ApiError } from '../server/api.mjs';

// Unit-only stand-in; the separate workerd test below checks the native implementation.
globalThis.FixedLengthStream = class extends TransformStream {
  constructor(size) {
    let count = 0;
    super({ transform(chunk, controller) {
      count += chunk.byteLength;
      if (count > size) throw new Error('too many bytes');
      controller.enqueue(chunk);
    }, flush() { if (count !== size) throw new Error('too few bytes'); } });
  }
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const fileFor = (bytes, name='lesson.html', type='text/html') => ({ name, type, size:bytes.length, sha256:digest(bytes) });
const meta = (bytes, version='object-v1') => ({ size:bytes.length, version, etag:'fixture-etag', checksums:{ sha256:Uint8Array.from(Buffer.from(digest(bytes), 'hex')).buffer } });
function byteStream(bytes, { chunkSize=65536, failAt=Infinity, counters={} }={}) {
  let offset = 0;
  return new ReadableStream({ type:'bytes', pull(controller) {
    if (offset >= failAt) { controller.error(new Error('fixture private upstream detail')); return; }
    if (offset === bytes.length) { controller.close(); controller.byobRequest?.respond(0); return; }
    const byob = controller.byobRequest;
    const count = Math.min(bytes.length-offset, chunkSize, byob?.view.byteLength ?? Infinity);
    if (byob) {
      counters.byobBytes = (counters.byobBytes || 0) + count;
      byob.view.set(bytes.subarray(offset,offset+count)); offset += count; byob.respond(count);
    } else { const next=bytes.slice(offset,offset+count); offset += count; controller.enqueue(next); }
  }, cancel() { counters.cancelled = true; } });
}
function request(bytes, options={}) {
  const headers = new Headers({ 'Content-Length':String(options.length ?? bytes.length), 'Content-Type':'application/octet-stream' });
  if (options.missingLength) headers.delete('Content-Length');
  if (options.encoding) headers.set('Content-Encoding',options.encoding);
  return { headers, body:options.noBody?null:byteStream(bytes,options), bodyUsed:false, signal:options.signal ?? new AbortController().signal,
    arrayBuffer() { throw new Error('whole-body read forbidden'); }, text() { throw new Error('whole-body read forbidden'); }, json() { throw new Error('whole-body read forbidden'); } };
}
function bucketFixture({ existing, existingBytes, onPut, rangedOverride, headError }={}) {
  const calls = { head:0, put:0, get:0, delete:0 }, objects = new Map();
  if (existing) objects.set('owner/hash', { object:existing, bytes:existingBytes });
  return { calls, objects,
    async head(key) { calls.head++; if (headError) throw headError; return objects.get(key)?.object ?? null; },
    async get(key, options) {
      calls.get++; assert.deepEqual(options.range,{offset:0,length:Math.min(12,existingBytes?.length ?? objects.get(key)?.bytes.length)});
      if (rangedOverride) return rangedOverride();
      const entry = objects.get(key); if (!entry) return null;
      assert.equal(options.onlyIf.etagMatches,entry.object.etag);
      return { ...entry.object, body:byteStream(entry.bytes.slice(0,options.range.length)) };
    },
    async put(key, stream, options) {
      calls.put++; assert.ok(stream instanceof ReadableStream); assert.equal(options.onlyIf.get('If-None-Match'),'*');
      if (onPut) return onPut({key,stream,options,objects});
      const reader = stream.getReader(), chunks=[];
      try { while (true) { const {value,done}=await reader.read(); if (done) break; chunks.push(Buffer.from(value)); } }
      finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks);
      if (digest(bytes) !== options.sha256) throw new Error('fixture checksum mismatch with private detail');
      if (objects.has(key)) return null;
      const object=meta(bytes); objects.set(key,{object,bytes}); return object;
    },
    async delete() { calls.delete++; throw new Error('Deletion is forbidden'); },
  };
}
const rejects = (operation, code) => assert.rejects(operation, cause => cause instanceof ApiError && cause.code === code && !cause.message.includes('private'));

test('raw upload preserves all bytes and forwards checksum/conditional metadata', async () => {
  const bytes = new TextEncoder().encode('<h1>他山 🌱</h1>'), file=fileFor(bytes), bucket=bucketFixture();
  const result = await putProjectFile(bucket,'owner/hash',file,request(bytes,{chunkSize:3}),'attachment');
  assert.deepEqual(result,{objectVersion:'object-v1',imageType:null});
  assert.deepEqual([...bucket.objects.get('owner/hash').bytes],[...bytes]);
  assert.equal(bucket.calls.delete,0);
});

test('cover sniffs exactly the first 12 BYOB bytes then forwards the full unmodified stream', async () => {
  const bytes = new Uint8Array(128*1024); bytes.set(png); const counters={}, bucket=bucketFixture();
  const result=await putProjectFile(bucket,'owner/hash',fileFor(bytes,'cover.png','image/png'),request(bytes,{counters,chunkSize:7}),'coverFile');
  assert.equal(result.imageType,'image/png'); assert.equal(counters.byobBytes,12);
  assert.equal(digest(bucket.objects.get('owner/hash').bytes),digest(bytes));
});

test('PNG JPEG GIF WebP signatures must match the declared type and extension', async () => {
  const cases = [ [png,'png','image/png'], [Uint8Array.from([255,216,255,0,1]),'jpg','image/jpeg'], [new TextEncoder().encode('GIF89a fixture'),'gif','image/gif'], [new TextEncoder().encode('RIFF1234WEBPfixture'),'webp','image/webp'] ];
  for (const [bytes,extension,type] of cases) {
    const result=await putProjectFile(bucketFixture(),'owner/hash',fileFor(bytes,'cover.'+extension,type),request(bytes),'coverFile');
    assert.equal(result.imageType,type);
  }
  for (const bytes of [new Uint8Array(16),new Uint8Array(0),new TextEncoder().encode('<svg>not an image')]) {
    const bucket=bucketFixture(); await rejects(putProjectFile(bucket,'owner/hash',fileFor(bytes,'cover.png','image/png'),request(bytes),'coverFile'),'INVALID_COVER_CONTENT'); assert.equal(bucket.calls.put,0);
  }
  await rejects(putProjectFile(bucketFixture(),'owner/hash',fileFor(png,'cover.jpg','image/jpeg'),request(png),'coverFile'),'INVALID_COVER_CONTENT');
});

test('missing/malformed/mismatched length and content encoding fail before storage or body reads', async () => {
  const bytes=png,file=fileFor(bytes),cases=[{missingLength:true}, ...['-1','1e1','16.0','0016','1,16','9007199254740993','15'].map(length=>({length})),{encoding:'gzip'}];
  for (const options of cases) {
    const counters={},bucket=bucketFixture(),req=request(bytes,{...options,counters});
    await assert.rejects(putProjectFile(bucket,'owner/hash',file,req,'attachment'), cause=>cause instanceof ApiError && [400,411,415].includes(cause.status));
    assert.equal(bucket.calls.head,0); assert.equal(bucket.calls.put,0); assert.equal(counters.byobBytes,undefined);
  }
});

test('exact-length enforcement rejects excess, short, interrupted and wrong-digest uploads', async () => {
  const bytes=new Uint8Array(64),file=fileFor(bytes);
  for (const [actual,options,descriptor] of [[new Uint8Array(65),{},file],[new Uint8Array(63),{},file],[bytes,{failAt:32,chunkSize:8},file],[bytes,{}, {...file,sha256:'f'.repeat(64)}]]) {
    const bucket=bucketFixture();
    await rejects(putProjectFile(bucket,'owner/hash',descriptor,request(actual,{...options,length:file.size}),'attachment'),'UPLOAD_INCOMPLETE');
    assert.equal(bucket.objects.size,0); assert.equal(bucket.calls.delete,0);
  }
});

test('zero-byte attachment is streamed with length zero', async () => {
  const bytes=new Uint8Array(0),bucket=bucketFixture();
  assert.equal((await putProjectFile(bucket,'owner/hash',fileFor(bytes),request(bytes,{noBody:true}),'attachment')).objectVersion,'object-v1');
  assert.equal(bucket.objects.get('owner/hash').bytes.length,0);
});

test('verifyR2Object rejects custom metadata, missing checksums, wrong length and replaced versions', () => {
  const file=fileFor(png),object=meta(png); assert.equal(verifyR2Object(object,file,'object-v1'),object);
  for(const bad of [null,{...object,size:15},{...object,version:''},{...object,checksums:{}},{...object,checksums:{sha256:file.sha256}},{...object,checksums:{},customMetadata:{sha256:file.sha256}},{...object,checksums:{sha256:new Uint8Array(32)}}]) assert.throws(()=>verifyR2Object(bad,file),cause=>cause.code==='STORED_FILE_MISMATCH');
  assert.throws(()=>verifyR2Object(object,file,'replaced-version'),cause=>cause.code==='STORED_FILE_MISMATCH');
});

test('an existing object is idempotent without reading/replacing/deleting the submitted body', async () => {
  const file=fileFor(png),bucket=bucketFixture({existing:meta(png),existingBytes:png}),counters={};
  assert.deepEqual(await putProjectFile(bucket,'owner/hash',file,request(png,{counters}),'attachment'),{objectVersion:'object-v1',imageType:null});
  assert.equal(bucket.calls.put,0);assert.equal(bucket.calls.delete,0);assert.equal(counters.cancelled,true);
});

test('existing cover uses real range bytes and checks the same object version', async () => {
  const file=fileFor(png,'cover.png','image/png');
  const bucket=bucketFixture({existing:meta(png),existingBytes:png});
  assert.equal((await putProjectFile(bucket,'owner/hash',file,request(png),'coverFile')).imageType,'image/png');assert.equal(bucket.calls.get,1);
  const fake=new Uint8Array(png.length), fakeFile=fileFor(fake,'cover.png','image/png'),fakeBucket=bucketFixture({existing:{...meta(fake),customMetadata:{imageType:'image/png'}},existingBytes:fake});
  await rejects(putProjectFile(fakeBucket,'owner/hash',fakeFile,request(fake),'coverFile'),'INVALID_COVER_CONTENT');assert.equal(fakeBucket.calls.put,0);
  const replaced=bucketFixture({existing:meta(png),existingBytes:png,rangedOverride:()=>({...meta(png,'different-version'),body:byteStream(png.slice(0,12))})});
  await rejects(putProjectFile(replaced,'owner/hash',file,request(png),'coverFile'),'STORED_FILE_MISMATCH');
});

test('a conditional writer returning null before consuming the stream does not hang or overwrite', {timeout:5000}, async () => {
  for (const field of ['attachment','coverFile']) {
    const file=fileFor(png,field==='coverFile'?'cover.png':'lesson.html',field==='coverFile'?'image/png':'text/html');
    const bucket=bucketFixture({onPut:async({objects})=>{objects.set('owner/hash',{object:meta(png,'winner'),bytes:png});return null;}});
    const result=await putProjectFile(bucket,'owner/hash',file,request(png),field);
    assert.equal(result.objectVersion,'winner'); assert.equal(bucket.calls.delete,0);
  }
  const bucket=bucketFixture({onPut:async({objects})=>{objects.set('owner/hash',{object:meta(new Uint8Array(16)),bytes:new Uint8Array(16)});return null;}});
  await rejects(putProjectFile(bucket,'owner/hash',fileFor(png),request(png),'attachment'),'STORED_FILE_MISMATCH');
});

test('storage errors and a pre-aborted request return safe errors without secret details', {timeout:5000}, async () => {
  const bytes=png,file=fileFor(bytes);
  await rejects(putProjectFile(bucketFixture({headError:new Error('private credentials fixture')}),'owner/hash',file,request(bytes),'attachment'),'FILE_STORAGE_UNAVAILABLE');
  for(const field of ['attachment','coverFile']) {
    const descriptor=fileFor(bytes,field==='coverFile'?'cover.png':'file.html',field==='coverFile'?'image/png':'text/html');
    await rejects(putProjectFile(bucketFixture({onPut:async()=>{throw new Error('private credentials fixture');}}),'owner/hash',descriptor,request(bytes),field),'UPLOAD_INCOMPLETE');
  }
  const controller=new AbortController();controller.abort();const bucket=bucketFixture();
  await rejects(putProjectFile(bucket,'owner/hash',file,request(bytes,{signal:controller.signal}),'attachment'),'UPLOAD_INCOMPLETE');assert.equal(bucket.calls.head,0);
});

test('aborting an active stream rejects without storing or deleting an object', {timeout:5000}, async () => {
  const bytes=new Uint8Array(1024),controller=new AbortController();
  const bucket=bucketFixture({onPut:async({stream})=>{
    const reader=stream.getReader();
    try { await reader.read();controller.abort();while (!(await reader.read()).done) {} }
    finally { reader.releaseLock(); }
    throw new Error('Should have aborted');
  }});
  await rejects(putProjectFile(bucket,'owner/hash',fileFor(bytes),request(bytes,{chunkSize:8,signal:controller.signal}),'attachment'),'UPLOAD_INCOMPLETE');
  assert.equal(bucket.objects.size,0);assert.equal(bucket.calls.delete,0);
});

test('simultaneous full uploads keep one version even when null arrives after the stream finished', async () => {
  const bucket=bucketFixture(),bytes=new Uint8Array(256),file=fileFor(bytes);
  const results=await Promise.all(Array.from({length:4},()=>putProjectFile(bucket,'owner/hash',file,request(bytes,{chunkSize:16}),'attachment')));
  assert.equal(new Set(results.map(result=>result.objectVersion)).size,1);
  assert.equal(bucket.objects.size,1);assert.equal(bucket.calls.delete,0);
});

test('production upload implementation never buffers or hashes whole files', async () => {
  const source=await readFile(new URL('../server/r2-upload.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.arrayBuffer\s*\(|\.text\s*\(|\.json\s*\(|subtle\s*\.\s*digest|\batob\s*\(|\bbtoa\s*\(|\.tee\s*\(/);
});
