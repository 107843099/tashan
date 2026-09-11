import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { strict as assert } from 'assert';

// Exercise the actual record-to-page pipeline without browser automation.
const catalog = JSON.parse(readFileSync('data/generated/catalog.json', 'utf8'));
const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; } };
const nodes = new Map([['practice-ui', root]]);
const document = { documentElement: { dataset: { theme: 'light' } },
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', focus() {} }); return nodes.get(id); },
  querySelectorAll() { return []; } };
class LocalBlob { constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; } }
let nextURL = 0;
class LocalURL extends URL {
  static createObjectURL() { return 'blob:unit-test-' + (++nextURL); }
  static revokeObjectURL() {}
}
const context = createContext({ document, Blob: LocalBlob, URL: LocalURL, location: { hash: '#discover' },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout, clearTimeout,
  PRACTICE_LIBRARY: catalog, PRACTICE_TRANSLATIONS: { en: {}, 'zh-Hant': {} }, PRACTICE_ICONS: {},
  PracticeStore: { list: async () => [], getDraft: async () => null }, addEventListener() {}, scrollTo() {} });
runInContext('window = globalThis', context);
runInContext(readFileSync('assets/js/project-requirements.js', 'utf8'), context);
runInContext(readFileSync('assets/js/project-showcase.js', 'utf8'), context);
let source = readFileSync('assets/js/app.js', 'utf8');
const end = source.lastIndexOf('})();');
assert(end > 0);
source = source.slice(0, end) + '\nwindow.flowChecks = {runtimeProject, defaultAdapt, sourceDetail, teaching, local, safeLink, normalizeDraft};\n' + source.slice(end);
runInContext(source, context);
await new Promise(resolve => setTimeout(resolve, 0));
// A missing or stale optional icon bundle must not make the primary controls invisible.
const primaryControls = [...root.innerHTML.matchAll(/<button[^>]*class="header-icon"[^>]*>([\s\S]*?)<\/button>/g)];
assert.equal(primaryControls.length, 2, 'Both language and theme controls must be present');
for (const [, content] of primaryControls) assert(content.includes('<svg'), 'Primary controls retain their icons without PRACTICE_ICONS');
assert.equal((root.innerHTML.match(/class="showcase-dot"/g) || []).length, 5, 'The homepage includes five curated projects');
for (const name of ['showcase-prev', 'showcase-next', 'showcase-play']) {
  const control = root.innerHTML.match(new RegExp('<button[^>]*class="[^"\\n]*' + name + '[^"\\n]*"[^>]*>([\\s\\S]*?)<\\/button>'));
  assert(control?.[1].includes('<svg'), 'Carousel controls remain visible without the optional icon bundle');
}
const flow = context.flowChecks;
const archivedPrompt = catalog.projects.find(p => p.kind === 'prompt' && p.packageHref);
assert(archivedPrompt, 'The catalog retains the original ZIP for an extracted Prompt');
const archivedPromptDetail = flow.sourceDetail(archivedPrompt);
assert(archivedPromptDetail.includes(archivedPrompt.packageHref), 'The original Prompt archive remains downloadable');
assert(archivedPromptDetail.includes(archivedPrompt.document.download), 'The extracted Prompt remains separately downloadable');
const record = {
  id: 'local-flow-check', kind: 'visual', title: '我的光学实验', purpose: '预测光路的变化', subject: '物理', stage: '初中',
  audience: '已认识直线传播的学生', prior: '能识别入射光线', outcome: '用图解释观察', setting: '教师投屏后两人讨论',
  core: '这是成果说明，包含 <script> 字样也应作为文字展示。',
  tested: '教师在本地运行一次', used: 'yes', record: '初二一次小组观察；未开展效果比较。',
  attachment: { name: 'optics.html', type: 'text/html', blob: new LocalBlob(['html']) },
  coverFile: { name: 'cover.png', type: 'image/png', blob: new LocalBlob(['image']) }
};
const runtime = flow.runtimeProject(record);
assert.equal(runtime.title['zh-CN'], record.title);
assert.equal(runtime.verification.classroomVerified, false, 'Uploader statements do not become verified classroom evidence');
assert.equal(runtime.attachmentName, 'optics.html');
const adapted = flow.defaultAdapt(runtime);
for (const key of ['audience', 'goal', 'setting', 'boundary']) assert.equal(typeof adapted[key], 'string');
assert(adapted.setting.includes(record.setting), 'A local project with no optional duration can start a creation task');
assert.equal(flow.local(undefined), '', 'Optional metadata must not break localized pages');
assert.equal(flow.local(null), '');
const detail = flow.teaching(runtime) + flow.sourceDetail(runtime);
assert(detail.includes('这是成果说明'), 'The uploaded result description remains visible after saving');
assert(detail.includes('&lt;script&gt;'), 'Result descriptions must be escaped');
assert(detail.includes(record.record), 'Classroom statements remain available with their source context');

const prompt = flow.runtimeProject({ ...record, id: 'local-prompt-check', kind: 'prompt', core: '请设计一份课堂提问清单。',
  attachment: { name: '原始教案.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob: new LocalBlob(['docx']) } });
const promptSource = flow.sourceDetail(prompt);
assert(promptSource.includes(prompt.sourceHref), 'Prompt projects retain a download for their uploaded original attachment');
assert(promptSource.includes(prompt.document.download), 'Edited prompt text has a separate text download');
assert.equal(flow.safeLink('javascript:alert(1)'), '');
assert.equal(flow.safeLink('data:text/html,<script>alert(1)</script>'), '');
assert.equal(flow.safeLink('file:///private/file'), '');
assert.equal(flow.safeLink('https://example.org/project'), 'https://example.org/project');
const restored = flow.normalizeDraft({ id: 'local-imported', title: { unexpected: true }, core: ['invalid shape'], purpose: 45, stage: null, prior: '保留文字' });
for (const key of ['title', 'core', 'purpose', 'stage']) assert.equal(restored[key], '', 'Imported non-text form fields are normalized before .trim() validation');
assert.equal(restored.id, 'local-imported');
assert.equal(restored.prior, '保留文字');
assert.equal(flow.normalizeDraft({title:{'zh-CN':'保留中文标题',en:'English title'}}).title,'保留中文标题');
console.log('Local project flow checks passed: record mapping, optional teaching fields, retained descriptions, original downloads, safe links and imported form normalization.');
