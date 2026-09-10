// Validate the deliverable, not the developer checkout. Build the release first.
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const digest = data => createHash('sha256').update(data).digest('hex');
const read = relative => readFileSync(path.join(dist, relative));
const json = relative => JSON.parse(read(relative));
const manifest = json('release-manifest.json');
assert.equal(manifest.generatedBy, 'scripts/build-release.py');
assert.equal(manifest.entrypoint, 'index.html');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${file}`);
    return entry.isDirectory() ? walk(file) : [path.relative(dist, file).split(path.sep).join('/')];
  });
}
const files = walk(dist);
const forbidden = /(?:^|\/)(?:node_modules|\.git|\.codex|\.agents|\.env(?:\.[^/]*)?|backups|archives?|tests|scripts|docs|vibe coding库|__MACOSX|\.DS_Store)(?:\/|$)/;
for (const file of files) {
  assert(!forbidden.test(file), `Development/private content included: ${file}`);
  assert(/^[\x20-\x7e]+$/.test(file), `Non-ASCII release filename: ${file}`);
  assert(!file.startsWith('/') && !file.split('/').includes('..'), `Unsafe path: ${file}`);
}
assert.deepEqual(files.filter(file => !file.includes('/')).sort(), ['index.html', 'local-project-preview.html', 'project-preview.html', 'release-manifest.json', 'teacher-practice-demo-v3.html']);

// Manifest hashes cover every payload file, with no stale or undocumented files.
assert.deepEqual(manifest.files.map(file => file.path).sort(), files.filter(file => file !== 'release-manifest.json').sort());
for (const record of manifest.files) {
  const bytes = read(record.path);
  assert.equal(bytes.length, record.bytes, `${record.path}: size`);
  assert.equal(digest(bytes), record.sha256, `${record.path}: hash`);
}

const context = { window: {} };
vm.runInNewContext(read('assets/data/catalog.js').toString(), context);
const catalog = JSON.parse(JSON.stringify(context.window.PRACTICE_LIBRARY));
const original = JSON.parse(readFileSync(path.join(root, 'data/generated/catalog.json')));
assert.equal(catalog.projects.length, 14, 'The release must contain the 14 curated projects');
assert.deepEqual(catalog.projects.map(project => project.id), original.projects.map(project => project.id));

// Resolve every local link both at the root and beneath an arbitrary subpath.
function resolveLocal(value, owner = 'index.html', { allowExternal = false, module = false } = {}) {
  if (!value || value.startsWith('#') || /^(?:data|blob|mailto|tel|javascript):/i.test(value)) return;
  if (/^(?:https?:)?\/\//i.test(value)) {
    assert(allowExternal, `${owner}: unexpected external URL ${value}`);
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return;
  assert(!value.startsWith('/'), `${owner}: absolute path breaks subdirectory hosting: ${value}`);
  if (module) assert(value.startsWith('.'), `${owner}: unresolved bare module ${value}`);
  const base = new URL(owner, 'https://example.invalid/classroom/tashan/');
  const url = new URL(value, base);
  assert(url.pathname.startsWith('/classroom/tashan/'), `${owner}: URL escapes deployed subdirectory: ${value}`);
  let relative = decodeURIComponent(url.pathname.slice('/classroom/tashan/'.length));
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const target = path.join(dist, relative);
  assert(existsSync(target), `${owner}: missing ${value} -> ${relative}`);
  assert(statSync(target).isFile(), `${owner}: expected a file at ${relative}`);
  return relative;
}

for (const project of catalog.projects) {
  const prior = original.projects.find(item => item.id === project.id);
  for (const field of ['title', 'summary', 'teaching', 'verification', 'contributors']) {
    assert.deepEqual(project[field], prior[field], `${project.id}: preserved ${field}`);
  }
  for (const href of [project.sourceHref, project.packageHref, project.cover, project.document?.download, project.example?.cover, project.example?.imageHref]) resolveLocal(href);
  assert(project.sourceHref.startsWith('./projects/'), `${project.id}: canonical entry path`);
  if (project.kind === 'visual') assert.equal(digest(read(resolveLocal(project.sourceHref))), prior.sha256, `${project.id}: source HTML must be unmodified`);
  if (project.document) {
    assert.equal(digest(read(resolveLocal(project.document.download))), prior.document.sha256, `${project.id}: prompt bytes preserved`);
    assert.equal(project.document.content, prior.document.content, `${project.id}: prompt content preserved`);
  }
  if (project.example) {
    assert.equal(project.example.imageHref, project.cover, `${project.id}: cover and example share one file`);
    assert.equal(digest(read(resolveLocal(project.example.imageHref))), project.example.sha256);
  }
  assert(!JSON.stringify([project.sourceHref, project.packageHref, project.document?.download, project.example?.imageHref]).includes('vibe%20coding'), `${project.id}: no source-folder URLs`);
}

const lens = catalog.projects.find(project => project.id === 'lens');
const pinhole = catalog.projects.find(project => project.id === 'pinhole');
assert.equal(lens.sourceHref, './projects/optics/index.html');
assert.equal(pinhole.sourceHref, './projects/optics/pinhole.html');
assert.equal(lens.packageHref, pinhole.packageHref, 'Optics projects must share one download');
assert(read('projects/mendel/index.html').toString().includes('./src/app.js'));
assert(existsSync(path.join(dist, 'projects/mendel/src/app.js')));
assert(existsSync(path.join(dist, 'projects/optics/assets/pinhole.bundle.js')));

// Check concrete markup resources, relative ES module imports (including lazy
// import), CSS URLs and literal fetches. Dynamic runtime strings cannot be
// exhaustively proven by a static test; browser flow checks remain complementary.
let dependencyCount = 0;
for (const file of files.filter(file => /\.(?:html|js|mjs|css)$/.test(file))) {
  if (file.startsWith('assets/data/')) continue; // Stored prompt examples are data.
  const text = read(file).toString();
  const refs = [];
  if (/\.html$/.test(file)) {
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/g)) {
      const value = match[2];
      if (!value.includes('${') && !value.includes('xmlns=') && !/^\s*$/.test(value)) refs.push([value, false]);
    }
  }
  for (const match of text.matchAll(/\b(?:import|export)\s+(?:(?:[^;\n]*?\s+from\s*)?)(["'])(\.{1,2}\/[^"']+)\1/g)) refs.push([match[2], true]);
  for (const match of text.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g)) refs.push([match[2], true]);
  for (const match of text.matchAll(/\bfetch\s*\(\s*(["'])(\.{1,2}\/[^"']+)\1/g)) refs.push([match[2], false]);
  for (const match of text.matchAll(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/g)) {
    const value = match[2];
    if (/^(?:\.{1,2}\/|https?:\/\/|\/)/.test(value)) refs.push([value, false]);
  }
  for (const [value, isModule] of refs) {
    resolveLocal(value, file, { allowExternal: true, module: isModule });
    dependencyCount++;
  }
}

// The entry is the actual application. Old URLs only redirect and keep route
// fragments/query parameters, so bookmarks remain useful after the rename.
const entry = read('index.html').toString();
assert(entry.includes('id="practice-ui"'));
assert(!/http-equiv=["']refresh/i.test(entry));
for (const [alias, canonical] of [['teacher-practice-demo-v3.html', 'index.html'], ['local-project-preview.html', 'project-preview.html']]) {
  const html = read(alias).toString();
  assert(html.includes(canonical) && html.includes('location.search') && html.includes('location.hash'), `${alias}: preserve query and fragment`);
}
for (const match of entry.matchAll(/\.\/(assets\/[^"?]+)\?v=([a-f0-9]{10})/g)) assert.equal(digest(read(match[1])).slice(0, 10), match[2], `${match[1]}: cache hash`);

// No two standalone ZIPs or bitmap assets contain the same bytes. Original
// downloadable ZIP contents are deliberately preserved and may contain images.
for (const extension of ['zip', 'image']) {
  const hashes = new Map();
  for (const file of files.filter(file => extension === 'zip' ? file.endsWith('.zip') : /\.(png|webp|jpg|jpeg|gif)$/.test(file))) {
    const hash = digest(read(file));
    assert(!hashes.has(hash), `Duplicate ${extension}: ${hashes.get(hash)} and ${file}`);
    hashes.set(hash, file);
  }
}
for (const item of manifest.originalArchives) assert.equal(digest(read(resolveLocal(item.href))), item.sha256, `${item.source}: original ZIP preserved`);
assert.equal(manifest.deduplication.exampleCopiesAvoided, 5);
assert(manifest.deduplication.archiveCopiesAvoided >= 1);
assert.equal(manifest.network.offlineGuaranteed, false);
assert(manifest.network.runtimeUrls.some(item => item.url.includes('miaoda.feishu.cn/fonts/')), 'Original external font dependency must be disclosed');

const zipCheck = execFileSync('python3', ['-c', `
import hashlib,json,pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1]); dist=root/'dist'
with zipfile.ZipFile(root/'releases/tashan-site.zip') as z:
    assert z.testzip() is None, 'Corrupt ZIP member'
    names=z.namelist()
    assert 'index.html' in names and not any(n.startswith('dist/') for n in names), 'ZIP must open at site root'
    expected=sorted(str(p.relative_to(dist)) for p in dist.rglob('*') if p.is_file())
    assert sorted(names)==expected, 'ZIP/dist file mismatch'
    for name in names:
        assert z.read(name)==(dist/name).read_bytes(), 'ZIP differs: '+name
print(len(names))
`, root], { encoding: 'utf8' }).trim();
// A rebuild must not silently delete unrelated work or edits to an old release.
// Exercise the guard against temporary fixtures, never against the real output.
execFileSync('python3', ['-c', `
import hashlib,importlib.util,json,pathlib,sys,tempfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('release_builder',pathlib.Path(sys.argv[1])/'scripts/build-release.py')
builder=importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
with tempfile.TemporaryDirectory(prefix='tashan-release-guard-') as directory:
    builder.DIST=pathlib.Path(directory)/'dist'; builder.DIST.mkdir()
    builder.ARCHIVE=pathlib.Path(directory)/'releases/site.zip'
    def refuses():
        try: builder.managed_outputs_only()
        except ValueError: return
        raise AssertionError('Output ownership guard accepted user changes')
    refuses()
    content=b'generated'
    (builder.DIST/'index.html').write_bytes(content)
    manifest={'generatedBy':builder.GENERATOR,'files':[{'path':'index.html','sha256':hashlib.sha256(content).hexdigest()}]}
    (builder.DIST/'release-manifest.json').write_text(json.dumps(manifest))
    builder.managed_outputs_only()
    (builder.DIST/'user-notes.txt').write_text('Keep this file'); refuses()
    (builder.DIST/'user-notes.txt').unlink()
    (builder.DIST/'index.html').write_text('A user edit'); refuses()
`, root], { encoding: 'utf8' });
console.log(`Release package OK: 14 projects, ${files.length} files, ${dependencyCount} dependency references, ${zipCheck} ZIP members; root and subpath URLs verified.`);
