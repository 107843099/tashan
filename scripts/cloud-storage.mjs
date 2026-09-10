#!/usr/bin/env node
// Operator-only setup. Storage metadata is managed through its API, never SQL.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudToolError, loadCloudEnvironment, validateCloudEnvironment, PROJECT_BUCKET, PROJECT_BUCKET_LIMIT } from './cloud-check.mjs';

export const BUCKET_LIMIT = PROJECT_BUCKET_LIMIT;
const fail = (code, message) => { throw new CloudToolError(code, message); };

export async function provisionStorage(env, { apply = false, updateLimit = false, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (apply && updateLimit) fail('ARGUMENTS', '--apply 与 --update-limit 不能同时使用。');
  const config = validateCloudEnvironment(env);
  const headers = { apikey: config.key, 'Content-Type': 'application/json' };
  if (!config.key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + config.key;
  async function request(path, method = 'GET', body) {
    try {
      const response = await fetchImpl(config.endpoint + '/storage/v1/' + path, {
        method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      let data;
      try { data = await response.json(); } catch { fail('STORAGE_RESPONSE', '存储接口返回格式异常，请检查控制台；未自动重试。'); }
      // Storage versions may encode Not Found as HTTP 400 with statusCode 404.
      if (method === 'GET' && !response.ok && (response.status === 404 || response.status === 400 && String(data?.statusCode) === '404')) return null;
      if (!response.ok) fail('STORAGE_HTTP', `存储配置请求未通过（HTTP ${response.status}），请检查控制台；未自动重试。`);
      return data;
    } catch (error) {
      if (error instanceof CloudToolError) throw error;
      fail('STORAGE_NETWORK', '存储接口连接未完成；如写入请求已经发出，先重新执行只读检查，不要直接重复操作。');
    }
  }
  function verify(bucket) {
    if (bucket?.id !== PROJECT_BUCKET || bucket.name !== PROJECT_BUCKET || bucket.public !== false || Number(bucket.file_size_limit) !== BUCKET_LIMIT || bucket.allowed_mime_types != null || bucket.type && bucket.type !== 'STANDARD') {
      fail('STORAGE_CONFLICT', '同名存储桶的配置与本项目不一致。请先核对用途、私有状态、10 MiB 文件限制与 MIME 限制；旧的较大文件上限须显式使用 --update-limit 调低。');
    }
  }
  const existing = await request('bucket/' + PROJECT_BUCKET);
  if (existing) {
    if (updateLimit) {
      // Never turn another bucket public/private or raise a stricter limit.
      // Requiring an explicit STANDARD type makes ambiguous legacy responses
      // read-only. The PUT body changes one field, leaving all other settings.
      if (existing.id !== PROJECT_BUCKET || existing.name !== PROJECT_BUCKET || existing.public !== false || existing.type !== 'STANDARD' || existing.allowed_mime_types != null || !Number.isSafeInteger(Number(existing.file_size_limit)) || Number(existing.file_size_limit) < BUCKET_LIMIT) {
        fail('STORAGE_CONFLICT', '仅可调低既有同名、私有、STANDARD、无 MIME 限制且上限不低于 10 MiB 的项目桶。未发送修改请求。');
      }
      if (Number(existing.file_size_limit) > BUCKET_LIMIT) {
        await request('bucket/' + PROJECT_BUCKET, 'PUT', { file_size_limit: BUCKET_LIMIT });
        const updated = await request('bucket/' + PROJECT_BUCKET);
        verify(updated);
        if (updated.type !== existing.type || updated.allowed_mime_types !== existing.allowed_mime_types) fail('STORAGE_READBACK', '文件上限修改后的回读配置不一致，请核对控制台；未自动重试。');
        return { ready: true, created: false, updated: true, message: '已仅将私有项目桶的单文件上限调低为 10 MiB，并回读核验；已有文件未删除或改写。' };
      }
    }
    verify(existing);
    return { ready: true, created: false, updated: false, message: '私有项目桶配置一致，未修改已有桶和文件。' };
  }
  if (updateLimit) fail('STORAGE_MISSING', '项目桶尚不存在，--update-limit 不会创建桶。请先核对目标项目。');
  if (!apply) return { ready: false, created: false, updated: false, message: '项目桶尚不存在；应用配置将新建私有 tashan-projects 桶，单文件上限 10 MiB。' };
  await request('bucket', 'POST', { id: PROJECT_BUCKET, name: PROJECT_BUCKET, public: false, file_size_limit: BUCKET_LIMIT });
  verify(await request('bucket/' + PROJECT_BUCKET));
  return { ready: true, created: true, updated: false, message: '已创建并回读核验私有项目桶，单文件上限 10 MiB。全局文件限制与 Storage RLS 仍需核对。' };
}

async function selfTest() {
  const { strict: assert } = await import('node:assert');
  const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_PRIVATE_TEST_VALUE' };
  const bucket = { id: PROJECT_BUCKET, name: PROJECT_BUCKET, public: false, type: 'STANDARD', file_size_limit: BUCKET_LIMIT, allowed_mime_types: null };
  assert.equal(BUCKET_LIMIT, 10 * 1024 * 1024);
  let calls = [], present = false;
  const fetch = async (url, options) => {
    calls.push(options.method);
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    if (options.method === 'POST') { assert.equal(JSON.parse(options.body).public, false); present = true; return Response.json({ name: PROJECT_BUCKET }); }
    return present ? Response.json(bucket) : Response.json({ statusCode: '404' }, { status: 400 });
  };
  assert.equal((await provisionStorage(env, { fetch })).ready, false);
  assert.deepEqual(calls, ['GET']);
  calls = [];
  assert.equal((await provisionStorage(env, { apply: true, fetch })).created, true);
  assert.deepEqual(calls, ['GET', 'POST', 'GET']);
  calls = [];
  assert.equal((await provisionStorage(env, { apply: true, fetch })).created, false);
  assert.deepEqual(calls, ['GET']);
  for (const patch of [{ public: true }, { file_size_limit: null }, { file_size_limit: 20 * 1024 * 1024 }, { allowed_mime_types: ['image/png'] }]) {
    await assert.rejects(provisionStorage(env, { apply: true, fetch: async (url, options) => {
      assert.equal(options.method, 'GET'); return Response.json({ ...bucket, ...patch });
    } }), error => error.code === 'STORAGE_CONFLICT');
  }
  // The explicit update path never creates/replaces objects or changes ACLs.
  let current = { ...bucket, file_size_limit: 20 * 1024 * 1024 };
  const updateFetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/storage/v1/bucket/' + PROJECT_BUCKET);
    calls.push(options.method);
    if (options.method === 'PUT') {
      assert.deepEqual(JSON.parse(options.body), { file_size_limit: BUCKET_LIMIT });
      current = { ...current, ...JSON.parse(options.body) };
      return Response.json({ message: 'Successfully updated' });
    }
    assert.equal(options.method, 'GET'); return Response.json(current);
  };
  calls = [];
  const updated = await provisionStorage(env, { updateLimit: true, fetch: updateFetch });
  assert.equal(updated.updated, true); assert.equal(updated.created, false);
  assert.deepEqual(calls, ['GET', 'PUT', 'GET']); assert.deepEqual(current, bucket);
  calls = [];
  assert.equal((await provisionStorage(env, { updateLimit: true, fetch: updateFetch })).updated, false);
  assert.deepEqual(calls, ['GET'], 'An already correct limit causes no write');
  for (const patch of [{ public: true }, { type: 'ANALYTICS' }, { type: undefined }, { id: 'foreign' }, { name: 'foreign' }, { allowed_mime_types: ['image/png'] }, { file_size_limit: null }, { file_size_limit: 5 * 1024 * 1024 }]) {
    await assert.rejects(provisionStorage(env, { updateLimit: true, fetch: async (url, options) => {
      assert.equal(options.method, 'GET'); return Response.json({ ...bucket, ...patch });
    } }), error => error.code === 'STORAGE_CONFLICT');
  }
  await assert.rejects(provisionStorage(env, { updateLimit: true, fetch: async (url, options) => {
    assert.equal(options.method, 'GET'); return Response.json({ statusCode: '404' }, { status: 404 });
  } }), error => error.code === 'STORAGE_MISSING');
  await assert.rejects(provisionStorage(env, { apply: true, updateLimit: true, fetch: () => assert.fail('Conflicting options must not make a request') }), error => error.code === 'ARGUMENTS');
  calls = [];
  await assert.rejects(provisionStorage(env, { updateLimit: true, fetch: async (url, options) => {
    calls.push(options.method);
    return Response.json(options.method === 'PUT' ? { message: 'Successfully updated' } : { ...bucket, file_size_limit: 20 * 1024 * 1024 });
  } }), error => error.code === 'STORAGE_CONFLICT');
  assert.deepEqual(calls, ['GET', 'PUT', 'GET'], 'Failed readback stops without retrying a write');
  calls = [];
  await assert.rejects(provisionStorage(env, { updateLimit: true, fetch: async (url, options) => {
    calls.push(options.method);
    if (options.method === 'PUT') throw new Error(env.SUPABASE_SECRET_KEY);
    return Response.json({ ...bucket, file_size_limit: 20 * 1024 * 1024 });
  } }), error => error.code === 'STORAGE_NETWORK' && !error.message.includes(env.SUPABASE_SECRET_KEY));
  assert.deepEqual(calls, ['GET', 'PUT'], 'Uncertain updates are not retried');
  await assert.rejects(provisionStorage(env, { apply: true, fetch: async () => Response.json({ statusCode: '403' }, { status: 403 }) }), error => error.code === 'STORAGE_HTTP');
  await assert.rejects(provisionStorage(env, { fetch: async () => { throw new Error(env.SUPABASE_SECRET_KEY); } }), error => error.code === 'STORAGE_NETWORK' && !error.message.includes(env.SUPABASE_SECRET_KEY));
  console.log('cloud-storage self-test passed: read-only default, private creation, explicit 10 MiB limit-only update, readback, conflict protection and redacted errors.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  if (args.some(arg => !['--apply', '--update-limit', '--help'].includes(arg)) || args.includes('--apply') && args.includes('--update-limit')) fail('ARGUMENTS', '用法：node scripts/cloud-storage.mjs [--apply | --update-limit]；默认只检查，两种写入模式不能同时使用。');
  if (args.includes('--help')) { console.log('默认只检查私有桶配置。--apply 仅创建缺少的私有桶；--update-limit 仅将既有同名私有 STANDARD 桶的文件上限调低至 10 MiB 并回读核验，不删除或改写文件。读取 .dev.vars，不输出密钥。'); return; }
  const result = await provisionStorage(loadCloudEnvironment(), { apply: args.includes('--apply'), updateLimit: args.includes('--update-limit') });
  console.log(result.message);
  if (!result.ready) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof CloudToolError ? error.message : '存储配置未完成，请检查控制台。'); process.exitCode = 1;
});
