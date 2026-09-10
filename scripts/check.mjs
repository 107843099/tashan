import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(resolve(root, name), 'utf8');
const main = read('index.html');
assert(main.includes('id="practice-ui"'), 'index.html must contain the actual application');
assert(!main.includes('location.replace'), 'The canonical entry must not redirect');
assert(main.includes('data-theme="light"'), 'The application defaults to light mode');

for (const name of ['index.html', 'project-preview.html']) {
  for (const [, reference] of read(name).matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) {
    const [source, query] = reference.split('?');
    assert(existsSync(resolve(root, source)), `${name}: missing asset ${source}`);
    if (/\.(js|css)$/.test(source)) {
      const digest = createHash('sha256').update(readFileSync(resolve(root, source))).digest('hex').slice(0, 10);
      assert.equal(new URLSearchParams(query).get('v'), digest, `${name}: stale asset version ${source}; run npm run catalog`);
    }
  }
}

// Bookmarked legacy URLs preserve query parameters and the current hash route.
for (const [old, current] of [['teacher-practice-demo-v3.html', 'index.html'], ['local-project-preview.html', 'project-preview.html']]) {
  const html = read(old);
  assert(!html.includes('id="practice-ui"'), 'Compatibility entries must not duplicate the app');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(script, `${old}: missing redirect`);
  for (const [search, hash] of [['', ''], ['?intro=1', '#discover'], ['?project=local-test', '#project/poetry']]) {
    let target;
    runInNewContext(script, { window: { location: { search, hash, replace: value => { target = value; } } } });
    assert.equal(target, './' + current + search + hash);
  }
}

for (const directory of ['assets/js', 'assets/data']) {
  for (const name of readdirSync(resolve(root, directory)).filter(name => name.endsWith('.js'))) {
    const path = `${directory}/${name}`;
    if (name === 'entry-stone-scene.js') {
      execFileSync(process.execPath, ['--input-type=module', '--check'], { input: read(path) });
    } else new Script(read(path), { filename: path });
    // Static and dynamic relative imports resolve beside their module, not the HTML.
    for (const [, dependency] of read(path).matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const target = resolve(root, dirname(path), dependency.split('?')[0]);
      assert(!relative(root, target).startsWith('..'), `${path}: import escapes the project`);
      assert(existsSync(target), `${path}: missing import ${dependency}`);
    }
  }
}
for (const source of ['assets/vendor/three.module.js', 'tests/entrance-scene.js']) {
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: read(source) });
}
assert(!read('assets/js/app.js').includes('./local-project-preview.html'), 'App links to the canonical preview');
assert(read('assets/js/project-preview.js').includes('./index.html#project/'), 'Preview returns to the canonical app');
console.log('App checks passed: canonical entry, compatibility redirects, current asset versions, imports and JavaScript syntax.');
