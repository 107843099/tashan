import { ApiError } from './api.mjs';

const error = (status, code, message) => new ApiError(status, code, message);
const incomplete = () => error(422, 'UPLOAD_INCOMPLETE', '文件传输未完成或校验失败，请重新上传；浏览器中的文件仍会保留。');
const unavailable = () => error(503, 'FILE_STORAGE_UNAVAILABLE', '文件存储暂时不可用，请稍后重试。');
const conflict = () => error(409, 'STORED_FILE_MISMATCH', '已保存的文件与当前版本不一致，请重新检查项目文件。');
const quietCancel = async stream => { try { if (stream && !stream.locked) await stream.cancel(); } catch {} };

function checksumHex(value) {
  // R2 checksums are ArrayBuffers. Do not accept a caller-controlled customMetadata digest.
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
  return bytes?.length === 32 ? [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') : null;
}

/** Verify actual R2 metadata; callers must authorize the DB descriptor/key first. */
export function verifyR2Object(object, file, expectedVersion) {
  if (!object || !Number.isSafeInteger(file?.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file?.sha256 || '') ||
      object.size !== file.size || checksumHex(object.checksums?.sha256) !== file.sha256 ||
      typeof object.version !== 'string' || !object.version ||
      expectedVersion !== undefined && object.version !== expectedVersion) throw conflict();
  return object;
}

function coverType(bytes, file) {
  const starts = values => values.every((value, index) => bytes[index] === value);
  let type = null;
  if (starts([137,80,78,71,13,10,26,10])) type = 'image/png';
  else if (starts([255,216,255])) type = 'image/jpeg';
  else if (starts([71,73,70,56,55,97]) || starts([71,73,70,56,57,97])) type = 'image/gif';
  else if (starts([82,73,70,70]) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) type = 'image/webp';
  const extension = file.name.split('.').pop().toLowerCase();
  const allowed = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp' };
  if (!type || type !== file.type || type !== allowed[extension]) throw error(415, 'INVALID_COVER_CONTENT', '封面内容与图片格式不一致，请选择 PNG、JPEG、GIF 或 WebP 图片。');
  return type;
}

async function readPrefix(stream, length) {
  if (!stream) throw incomplete();
  // Native request/R2 bodies support BYOB. Never fall back to an unbounded chunk read.
  let reader;
  try { reader = stream.getReader({ mode:'byob' }); }
  catch { throw unavailable(); }
  const prefix = new Uint8Array(length);
  try {
    let read = 0;
    while (read < length) {
      const { value, done } = await reader.read(new Uint8Array(length - read));
      if (value?.byteLength) { prefix.set(value, read); read += value.byteLength; }
      if (done) break;
    }
    if (read !== length) throw incomplete();
    return prefix;
  } finally { reader.releaseLock(); }
}

async function existingFile(bucket, key, file, field, object) {
  verifyR2Object(object, file);
  let imageType = null;
  if (field === 'coverFile') {
    let ranged;
    try {
      ranged = await bucket.get(key, { range:{ offset:0, length:Math.min(12, file.size) }, onlyIf:{ etagMatches:object.etag } });
      // A concurrent replacement must not turn a verified HEAD into a different body.
      verifyR2Object(ranged, file, object.version);
      if (!ranged.body) throw conflict();
      imageType = coverType(await readPrefix(ranged.body, Math.min(12, file.size)), file);
    } finally { await quietCancel(ranged?.body); }
  }
  return { objectVersion:object.version, imageType };
}

function validateRequest(file, request, field) {
  if (!['attachment', 'coverFile'].includes(field) || !Number.isSafeInteger(file?.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file?.sha256 || '') || typeof file.name !== 'string' || typeof file.type !== 'string') throw error(400, 'INVALID_FILE_DESCRIPTOR', '文件资料无效，请重新选择文件。');
  const length = request.headers.get('Content-Length');
  if (length === null) throw error(411, 'CONTENT_LENGTH_REQUIRED', '上传需要明确的文件大小，请从浏览器重新选择文件后重试。');
  if (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) !== file.size) throw error(400, 'FILE_SIZE_MISMATCH', '上传文件大小与项目版本不一致，请重新选择文件。');
  if (request.headers.get('Content-Encoding') && request.headers.get('Content-Encoding').toLowerCase() !== 'identity') throw error(415, 'ENCODED_UPLOAD_UNSUPPORTED', '请直接上传原始文件。');
  if (request.bodyUsed || request.body?.locked || !request.body && file.size > 0 || request.signal?.aborted) throw incomplete();
}

/** Raw binary upload only: no Base64, whole-file buffering or Worker-side hashing.
 * The DB owns authorization, quotas and the key. Mark the file ready only after this resolves.
 * https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
 */
export async function putProjectFile(bucket, key, file, request, field) {
  let body = request.body;
  try {
    validateRequest(file, request, field);
    if (!bucket || typeof bucket.put !== 'function' || typeof bucket.head !== 'function' || typeof globalThis.FixedLengthStream !== 'function') throw unavailable();
    const found = await bucket.head(key);
    if (request.signal?.aborted) throw incomplete();
    if (found) {
      const result = await existingFile(bucket, key, file, field, found);
      if (request.signal?.aborted) throw incomplete();
      return result;
    }
    body ||= new ReadableStream({ type:'bytes', start(controller) { controller.close(); } });
    const prefix = field === 'coverFile' ? await readPrefix(body, Math.min(12, file.size)) : null;
    const imageType = prefix ? coverType(prefix, file) : null;
    if (request.signal?.aborted) throw incomplete();
    const fixed = new FixedLengthStream(file.size);
    const stop = new AbortController();
    let prefixWriter;
    const cancel = () => {
      stop.abort(incomplete());
      // R2 may reject a condition before consuming the body. Unblock prefix writes too.
      void quietCancel(fixed.readable);
      if (prefixWriter) void prefixWriter.abort(incomplete()).catch(() => {});
    };
    request.signal?.addEventListener('abort', cancel, { once:true });
    const pump = (async () => {
      if (prefix?.length) {
        prefixWriter = fixed.writable.getWriter();
        try { await prefixWriter.write(prefix); }
        finally { prefixWriter.releaseLock(); prefixWriter = null; }
      }
      await body.pipeTo(fixed.writable, { signal:stop.signal });
    })();
    // Observe rejection immediately so a rejected put cannot leave an unhandled pump.
    const pumped = pump.then(() => ({ ok:true }), () => ({ ok:false }));
    let object;
    try {
      object = await bucket.put(key, fixed.readable, { sha256:file.sha256, onlyIf:new Headers({ 'If-None-Match':'*' }), httpMetadata:{ contentType:file.type } });
      if (object === null) {
        cancel();
        await pumped;
        // Another conditional writer won. Verify its real object, never overwrite/delete it.
        const result = await existingFile(bucket, key, file, field, await bucket.head(key));
        if (request.signal?.aborted) throw incomplete();
        return result;
      }
      if (!(await pumped).ok || request.signal?.aborted) throw incomplete();
      verifyR2Object(object, file);
      return { objectVersion:object.version, imageType };
    } catch (cause) {
      cancel();
      await pumped;
      if (cause instanceof ApiError) throw cause;
      throw incomplete();
    } finally { request.signal?.removeEventListener('abort', cancel); }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw unavailable();
  } finally { await quietCancel(body); }
}
