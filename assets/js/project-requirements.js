/* Shared by the upload form and the server publication boundary. */
(function (global) {
  'use strict';
  const subjects = Object.freeze(['语文','数学','英语','科学','物理','化学','生物','历史','地理','道德与法治','信息技术','音乐','美术','体育与健康','劳动','综合实践活动']);
  const stages = Object.freeze(['学前教育','小学','初中','高中','高等教育','教师专业发展']);
  const text = value => typeof value === 'string' ? value.trim() : value && typeof value === 'object' && !Array.isArray(value) ? text(value['zh-CN'] || value.en || value['zh-Hant']) : '';
  function validURL(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const url = new URL(value.trim());
      return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
    } catch { return false; }
  }
  function hasFile(file, image = false) {
    if (!file || typeof file !== 'object') return false;
    const size = file.size ?? file.blob?.size;
    return typeof file.name === 'string' && !!file.name.trim() && Number.isFinite(size) && size > 0 && (!image || /^image\/(png|jpeg|webp|gif)$/i.test(file.type || file.blob?.type || ''));
  }
  function errors(metadata = {}, files = {}, {phase = 'publish'} = {}) {
    const d = metadata && typeof metadata === 'object' ? metadata : {};
    const f = files && typeof files === 'object' ? files : {};
    const result = [];
    const add = (field, message) => result.push({field, message});
    const required = (field, message) => { if (!text(d[field])) add(field, message); };
    const confirmed = (field, message) => { if (d[field] !== true) add(field, message); };
    if (!['visual','prompt'].includes(d.kind)) add('kind', '请选择项目类型。');
    required('title', '请填写项目名称。');
    required('purpose', d.kind === 'prompt' ? '请说明这个 Prompt 能帮助教师完成什么。' : '请说明项目主要帮助理解什么。');
    const preview = hasFile(f.coverFile, true);
    if (d.kind === 'visual') {
      if (!hasFile(f.attachment) && !validURL(d.projectUrl) && !validURL(d.core)) add('projectUrl', '请上传项目文件，或填写可获取项目的完整网页链接。');
      if (text(d.projectUrl) && !validURL(d.projectUrl)) add('projectUrl', '项目链接须为有效的 http 或 https 地址。');
      if (!preview && !validURL(d.previewUrl)) add('coverFile', '请上传真实运行截图或动图，或填写真实效果视频链接。');
      if (text(d.previewUrl) && !validURL(d.previewUrl)) add('previewUrl', '视频预览链接须为有效的 http 或 https 地址。');
      if (!subjects.includes(d.subject)) add('subject', '请选择项目学科。');
      if (!stages.includes(d.stage)) add('stage', '请选择建议学段。');
      required('audience', '请说明主要操作者和学习对象。');
      required('prior', '请说明学生所需的前置知识；无需基础时请明确填写。');
      required('outcome', '请说明预期学习结果与学习深度。');
      required('setting', '请填写基本使用方式。');
    } else if (d.kind === 'prompt') {
      required('core', '请填写至少一条完整的 Prompt 正文。');
      if (!preview) add('coverFile', '请上传实际测试输出的截图或动图。');
      if (text(d.subject) && !subjects.includes(d.subject)) add('subject', '请选择有效的项目学科，或留空。');
      if (text(d.stage) && !stages.includes(d.stage)) add('stage', '请选择有效的建议学段，或留空。');
    }
    if (d.kind === 'visual') {
      if (!['works','issues','not-tested'].includes(d.runtimeStatus)) add('runtimeStatus', '请确认项目当前运行状态。');
      if (!['not-tested','author-tested','classroom'].includes(d.practiceStatus)) add('practiceStatus', '请确认项目实践状态。');
      if (d.practiceStatus === 'classroom') required('record', '请简要说明课堂使用情况。');
    } else if (d.kind === 'prompt') {
      if (!text(d.tested) || /^(?:未测试|未測試|待测试|待測試|unknown|not tested|none|n\/a)$/i.test(text(d.tested))) add('tested', '请填写实际测试过的 AI 工具。');
      if (!['single','sequence'].includes(d.promptStructure)) add('promptStructure', '请选择单条 Prompt 或按顺序使用的 Prompt 组合。');
      if (d.promptStructure === 'sequence') required('dependencies', '请确认 Prompt 组合的使用顺序，以及是否依赖前一步输出。');
    }
    if (phase === 'details') return result;
    if (d.kind === 'prompt') confirmed('humanReviewConfirmed', '请确认 AI 输出须由教师人工核查。');
    if (!['open','teach','show'].includes(d.license)) add('license', '请选择明确的使用授权。');
    confirmed('previewAuthentic', '请确认预览来自项目的真实运行或 Prompt 的实际输出。');
    confirmed('rightsConfirmed', '请确认拥有项目、预览和所用内容的上传及授权权利。');
    confirmed('privacyConfirmed', '请确认已处理学生及其他个人隐私信息。');
    confirmed('content', '请检查并确认项目内容、教学信息和实际使用情况。');
    return result;
  }
  global.TashanProjectRequirements = Object.freeze({subjects, stages, errors});
})(typeof window !== 'undefined' ? window : globalThis);
