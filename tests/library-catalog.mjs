import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { strict as assert } from 'assert';
const data = JSON.parse(readFileSync('data/generated/catalog.json', 'utf8'));
const context = { window: {} };
runInNewContext(readFileSync('assets/data/catalog.js', 'utf8'), context);
assert.deepEqual(JSON.parse(JSON.stringify(context.window.PRACTICE_LIBRARY)), data, 'Browser catalog must match source manifest');
const ids = new Set(data.projects.map(p => p.id));
assert.equal(ids.size, data.projects.length, 'Unique project IDs');
const digest = data => createHash('sha256').update(data).digest('hex');
for (const p of data.projects) {
  const source = resolve(p.source);
  assert(!relative(resolve('vibe coding库'), source).startsWith('..'), 'Source must be inside local library');
  assert.equal(digest(readFileSync(source)), p.sha256, `Source freshness: ${p.id}`);
  assert.equal(decodeURIComponent(p.sourceHref.slice(2)), p.source);
  for (const field of ['title', 'summary', 'prior']) for (const lang of ['zh-CN', 'zh-Hant', 'en']) assert(p[field][lang]?.trim(), `${p.id}: ${field} ${lang}`);
  for (const link of [p.cover, p.packageHref, p.document?.download].filter(Boolean)) assert(existsSync(decodeURIComponent(link)), `Missing local link: ${link}`);
  if(p.coverVariants){
    assert.deepEqual(p.coverVariants.map(image=>image.width),[320,640,960], `${p.id}: responsive display widths`);
    const defaultCover=p.coverVariants.find(image=>image.width===640);
    assert.equal(p.cover,defaultCover.src);assert.equal(p.coverWidth,defaultCover.width);assert.equal(p.coverHeight,defaultCover.height);
    for(const image of p.coverVariants){
      const bytes=readFileSync(decodeURIComponent(image.src));
      assert.equal(bytes.length,image.bytes);assert.equal(digest(bytes),image.sha256, `${p.id}: display image hash`);
      assert.equal(bytes.subarray(8,12).toString(),'WEBP', `${p.id}: display format`);
      assert(Math.abs(image.height-p.example.height*image.width/p.example.width)<=1, `${p.id}: uncropped aspect ratio`);
    }
  }
  if (p.kind === 'visual') assert(p.cover, `Missing real screenshot: ${p.id}`);
  if (p.document) {
    assert.equal(digest(readFileSync(decodeURIComponent(p.document.download))), p.document.sha256, `Original prompt integrity: ${p.id}`);
    assert(p.document.blocks.every(b => p.document.content.includes(b.text)), 'Prompt excerpts must be verbatim');
  }
  const advice=p.teaching;
  assert(advice && advice.activities.length>=3 && advice.sources.length, `Teaching coverage: ${p.id}`);
  for (const field of ['audience','prior','method','duration','objective','evidence','limitation']) for (const lang of ['zh-CN','zh-Hant','en']) assert(advice[field][lang]?.trim(), `${p.id}: teaching ${field} ${lang}`);
  assert(advice.sources.every(ref=>ref.url.startsWith('https://')), 'Teaching references must link to sources');
  if(p.kind==='prompt'){
    assert(p.example && p.cover===p.example.cover, `Generated example required: ${p.id}`);
    const original=readFileSync(decodeURIComponent(p.example.imageHref));
    const web=readFileSync(decodeURIComponent(p.example.cover));
    assert.equal(digest(original),p.example.sha256, 'Download remains the original image beside the source document');
    if(p.coverVariants){assert.notEqual(digest(original),digest(web));assert(web.length<original.length*.12,'Display image should be substantially smaller than the original');}
    else assert.equal(digest(original),digest(web), 'Unoptimized example preserves its original display file');
    assert(original.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Image is an actual PNG');
    assert.equal(resolve(decodeURIComponent(p.example.imageHref),'..'),resolve(p.source,'..'), 'Generated image must be next to source prompt');
    assert(p.example.prompt && p.example.generatedAt, 'Image generation provenance retained');
  }
  assert(p.related.every(id => ids.has(id)), `Broken related link: ${p.id}`);
  assert(['checked', 'pending', 'needs-review'].includes(p.verification.status));
  assert.equal(p.verification.classroomVerified, false);
  if (p.verification.status !== 'pending') assert(p.verification.date && p.verification.evidence, 'Checks need dated evidence');
}
console.log(`Catalog integrity passed: ${data.projects.length} local projects, multilingual metadata, original prompts, downloads and evidence.`);
