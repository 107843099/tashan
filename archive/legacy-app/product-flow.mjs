import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const checks = [
  ['six demo project types', ['AI互动网页', 'Micro:bit', 'ESP32', 'Arduino', '机器人', 'STEAM / 本土文化']],
  ['contribution flow', ['function newProjectPage', 'save-draft', 'publish-project']],
  ['reproduction flow', ['function reproductionPage', 'finish-reproduction', 'reflection.aiValue']],
  ['understanding flow', ['function learnPage', 'Understanding Check']],
  ['adaptation flow', ['function adaptationPage', 'function makePlan', '创建改编项目']],
  ['AI package flow', ['function aiPackagePage', 'AI 协作任务包', '教师审核']],
  ['transfer flow', ['function transferPage', '跨学科融合质量检查']],
  ['classroom flow', ['function classroomPage', '学生身份信息']],
  ['version and evidence flow', ['function versionsPage', 'function knowledgePage', '当前数据不足']]
];
for (const [name, markers] of checks) {
  const absent = markers.filter(marker => !app.includes(marker));
  if (absent.length) throw new Error(`${name} missing: ${absent.join(', ')}`);
}
console.log(`Product flow checks passed: ${checks.length} flows covered.`);
