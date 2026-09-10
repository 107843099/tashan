import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { strict as assert } from 'assert';

// A small transaction adapter exercises rollback and serialization on Node 14.
// The platform also uses the real browser IndexedDB for the UI acceptance check.
class TestBlob {
  constructor(parts = [], options = {}) {
    this.data = Buffer.concat(parts.map(part => part instanceof TestBlob ? part.data : typeof part === 'string' ? Buffer.from(part) : Buffer.from(part)));
    this.size = this.data.length;
    this.type = options.type || '';
  }
  async text() { return this.data.toString('utf8'); }
  async arrayBuffer() { return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.length); }
}
const clone = value => {
  if (!value || typeof value !== 'object' || value instanceof TestBlob) return value;
  if (Array.isArray(value)) return value.map(clone);
  const result = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) result[key] = clone(value[key]);
  return result;
};
function memoryIndexedDB() {
  const state = { projects: new Map(), meta: new Map(), opens: 0, failAfter: -1 };
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(names, mode) {
      const working = Object.fromEntries(names.map(name => [name, new Map(Array.from(state[name], ([key, value]) => [key, clone(value)]))]));
      let pending = 0, finished = false, writes = 0;
      const tx = {
        error: null,
        abort() {
          if (finished) return;
          finished = true;
          setTimeout(() => tx.onabort && tx.onabort(), 0);
        },
        objectStore(name) {
          const request = operation => {
            const req = {};
            pending++;
            setTimeout(() => {
              if (finished) return;
              try {
                req.result = operation();
                if (req.onsuccess) req.onsuccess();
              } catch (reason) {
                tx.error = req.error = reason;
                if (tx.onerror) tx.onerror({ target: req });
                tx.abort();
              }
              pending--;
              finish();
            }, 0);
            return req;
          };
          return {
            getAll: () => request(() => Array.from(working[name].values(), clone)),
            get: key => request(() => clone(working[name].get(key))),
            put: value => {
              const copy = clone(value);
              return request(() => {
                if (state.failAfter >= 0 && writes++ >= state.failAfter) {
                  const reason = new Error('Simulated quota failure');
                  reason.name = 'QuotaExceededError';
                  throw reason;
                }
                working[name].set(name === 'projects' ? copy.id : copy.key, copy);
              });
            },
            delete: key => request(() => working[name].delete(key))
          };
        }
      };
      const finish = () => {
        if (pending || finished) return;
        finished = true;
        if (mode === 'readwrite') for (const name of names) state[name] = working[name];
        if (tx.oncomplete) tx.oncomplete();
      };
      setTimeout(finish, 0);
      return tx;
    }
  };
  return {
    state,
    open() {
      state.opens++;
      const request = { result: database };
      setTimeout(() => request.onsuccess(), 0);
      return request;
    }
  };
}
const indexedDB = memoryIndexedDB();
const context = createContext({ Blob: TestBlob, indexedDB, setTimeout, Uint8Array, Uint32Array,
  btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') });
runInContext('window = globalThis', context);
runInContext(readFileSync('assets/js/storage.js', 'utf8'), context);
const store = context.PracticeStore;
const object = value => { context.inputJSON = JSON.stringify(value); return runInContext('JSON.parse(inputJSON)', context); };
const blob = (value, type = 'text/plain') => new TestBlob([value], { type });
const backup = (projects, draft = null) => blob(JSON.stringify({ format: 'tashan-practice-library', version: 1, projects, draft }), 'application/json');

await assert.rejects(store.get('../local-no'), /ID/);
await assert.rejects(store.put(object({ id: 'remote-one' })), /ID/);
assert.equal(indexedDB.state.opens, 0, 'Invalid input must be rejected before any transaction');
await assert.rejects(store.put(runInContext('({title: () => 1})', context)), /不支持/);
await assert.rejects(store.put(runInContext('(() => { const p = {}; p.loop = p; return p; })()', context)), /循环/);
const badType = object({ attachment: { name: 'program.exe' } });
badType.attachment.blob = blob('content');
await assert.rejects(store.put(badType), /不支持此附件类型/);
const tooBig = object({ coverFile: { name: 'large.png', type: 'image/png' } });
tooBig.coverFile.blob = blob(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png');
await assert.rejects(store.put(tooBig), /5 MB/);

const original = object({ title: { 'zh-CN': '圆的探索' }, kind: 'visual', attachment: { name: '课堂.html' }, coverFile: { name: 'cover.png', type: 'image/png' } });
original.attachment.blob = blob('<!doctype html><h1>圆的探索</h1>', 'text/html');
original.coverFile.blob = blob(new Uint8Array([137, 80, 78, 71]), 'image/png');
const saved = await store.put(original);
assert(saved.id.startsWith('local-'));
assert(saved.createdAt && saved.updatedAt);
assert.equal(saved.attachment.type, 'text/html');
original.title['zh-CN'] = 'mutated after save';
assert.equal((await store.get(saved.id)).title['zh-CN'], '圆的探索', 'Stored metadata must not alias the caller');
const edited = await store.get(saved.id);
edited.title['zh-CN'] = '圆的探索 · 修改';
await store.put(edited);
assert.equal((await store.list()).length, 1, 'Editing keeps the same project ID');
assert.equal((await store.get(saved.id)).createdAt, saved.createdAt);

const draft = object({ title: '未完成的草稿', attachment: { name: 'prompt.md' } });
draft.attachment.blob = blob('从观察开始。', 'text/markdown');
await store.putDraft(draft);
assert.equal(await (await store.getDraft()).attachment.blob.text(), '从观察开始。');
const exported = JSON.parse(await (await store.exportAll()).text());
assert.equal(exported.format, 'tashan-practice-library');
assert.equal(exported.version, 1);
assert.equal(exported.projects.length, 1);
assert(!('blob' in exported.projects[0].attachment));
assert.equal(Buffer.from(exported.projects[0].attachment.base64, 'base64').toString('utf8'), '<!doctype html><h1>圆的探索</h1>');
assert.deepEqual(Array.from(Buffer.from(exported.projects[0].coverFile.base64, 'base64')), [137, 80, 78, 71]);
await store.putDraft(object({ title: '当前草稿不能被备份覆盖' }));
assert.equal((await store.importBackup(blob(JSON.stringify(exported)))).count, 1);
assert.equal((await store.list()).length, 2);
assert.equal(new Set((await store.list()).map(p => p.id)).size, 2, 'Import collisions get a fresh ID');
assert.equal((await store.getDraft()).title, '当前草稿不能被备份覆盖');

const count = (await store.list()).length;
await assert.rejects(store.importBackup(backup([{ id: 'local-valid' }, { id: 'bad' }])), /ID/);
await assert.rejects(store.importBackup(backup([{ title: 'Missing ID' }])), /ID/);
assert.equal((await store.list()).length, count, 'An invalid later record must prevent all writes');
await assert.rejects(store.importBackup(backup([{ id: 'local-duplicate' }, { id: 'local-duplicate' }])), /重复/);
await assert.rejects(store.importBackup(backup([{ id: 'local-invalid64', attachment: { name: 'notes.md', base64: '@bad' } }])), /附件内容/);
await assert.rejects(store.importBackup(backup([{ id: 'local-too-deep', detail: JSON.parse('{"__proto__":{"polluted":true}}') }])), /字段/);
await assert.rejects(store.importBackup(blob('{"format":"other","version":1,"projects":[]}')), /受支持/);
await assert.rejects(store.importBackup(blob('{')), /有效的 JSON/);

indexedDB.state.failAfter = 1;
await assert.rejects(store.importBackup(backup([{ id: 'local-first' }, { id: 'local-second' }], { title: 'Imported' })), reason => reason.name === 'QuotaExceededError');
indexedDB.state.failAfter = -1;
assert.equal(await store.get('local-first'), null, 'Failure of a later write rolls back earlier writes');
assert.equal((await store.list()).length, count);
assert.equal((await store.getDraft()).title, '当前草稿不能被备份覆盖');

await assert.rejects(store.importBackup(backup(Array.from({ length: 100 }, (_, index) => ({ id: 'local-import-' + index })))), /100 个项目/);
assert.equal((await store.list()).length, count, 'Combined capacity is checked before writes');
await store.remove(saved.id);
assert.equal(await store.get(saved.id), null);
await store.clearDraft();
assert.equal(await store.getDraft(), null);
await store.importBackup(backup([], { title: '可恢复的草稿' }));
assert.equal((await store.getDraft()).title, '可恢复的草稿');
const beforeCommit = (await store.list()).length;
indexedDB.state.failAfter = 0;
await assert.rejects(store.put(object({ title: '事务失败的作品' }), { clearDraft: true }), reason => reason.name === 'QuotaExceededError');
indexedDB.state.failAfter = -1;
assert.equal((await store.getDraft()).title, '可恢复的草稿', 'A failed project commit must retain its draft');
assert.equal((await store.list()).length, beforeCommit);
await store.put(object({ title: '已完成的作品' }), { clearDraft: true });
assert.equal(await store.getDraft(), null, 'Completing a project removes its draft in the same transaction');
assert.equal((await store.list()).length, beforeCommit + 1);
for (const project of await store.list()) await store.remove(project.id);
const maximumFiles = object({ title: '最大单件附件与封面', attachment: { name: 'project.html', type: 'text/html' }, coverFile: { name: 'cover.png', type: 'image/png' } });
maximumFiles.attachment.blob = blob(Buffer.alloc(20 * 1024 * 1024), 'text/html');
maximumFiles.coverFile.blob = blob(Buffer.alloc(5 * 1024 * 1024), 'image/png');
await store.putDraft(maximumFiles);
await assert.rejects(store.put(maximumFiles), /50 MB/, 'Keeping both a maximum-size draft and a project exceeds total capacity');
assert((await store.getDraft()).attachment.blob.size === 20 * 1024 * 1024);
const maximumSaved = await store.put(maximumFiles, { clearDraft: true });
assert.equal((await store.get(maximumSaved.id)).coverFile.blob.size, 5 * 1024 * 1024);
assert.equal(await store.getDraft(), null, 'Atomic completion counts the files once');
await store.remove(maximumSaved.id);

const previewPage = readFileSync('project-preview.html', 'utf8');
assert(/sandbox="allow-scripts"/.test(previewPage), 'Uploaded scripts only receive the isolated sandbox capability');
assert(!/allow-same-origin|allow-top-navigation|allow-popups/.test(previewPage), 'The preview must not grant host origin or navigation access');
assert(previewPage.includes("connect-src 'none'") && previewPage.includes("form-action 'none'"));
const previewScript = readFileSync('assets/js/project-preview.js', 'utf8');
async function preview(record, id = 'local-preview') {
  const elements = new Map();
  const element = name => {
    if (!elements.has(name)) elements.set(name, { hidden: name === 'preview-frame', addEventListener() {}, remove() {}, click() {} });
    return elements.get(name);
  };
  const environment = createContext({ Blob: TestBlob, URLSearchParams, location: { search: '?project=' + encodeURIComponent(id) },
    localStorage: { getItem: () => 'en' },
    document: { documentElement: {}, getElementById: element },
    window: { addEventListener() {}, PracticeStore: { get: async () => record } } });
  runInContext(previewScript, environment);
  await new Promise(resolve => setTimeout(resolve, 0));
  return elements;
}
const source = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><script>parent.document.body.innerHTML="bad"</script></body></html>';
const htmlPreview = await preview({ title: '<script>Not a heading</script>', attachment: { name: 'uploaded.html', blob: blob(source, 'text/html') } });
const documentSource = htmlPreview.get('preview-frame').srcdoc;
assert(documentSource.indexOf("connect-src 'none'") < documentSource.indexOf(source), 'Strict policy is parsed before any uploaded markup');
assert(documentSource.includes("script-src 'unsafe-inline' blob:") && documentSource.includes("frame-src 'none'"));
assert.equal(htmlPreview.get('preview-title').textContent, '<script>Not a heading</script>', 'Metadata is rendered as text');
assert.equal(htmlPreview.get('preview-frame').hidden, false);
assert.equal(htmlPreview.get('preview-back').href, './index.html#project/local-preview');
const zipPreview = await preview({ attachment: { name: 'project.zip', blob: blob('zip') } });
assert.equal(zipPreview.get('preview-frame').srcdoc, undefined, 'ZIP and other files are offered as downloads, never interpreted as HTML');
assert.equal(zipPreview.get('preview-download').disabled, false);
const invalidPreview = await preview(null, '../bad');
assert.equal(invalidPreview.get('preview-frame').srcdoc, undefined);
console.log('Local storage checks passed: files, edits, drafts, backup round trip, validation, conflict handling, capacity, atomic rollback and preview isolation invariants.');
