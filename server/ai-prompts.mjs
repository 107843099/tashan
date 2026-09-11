// Editable teaching guidance only. Output schemas, locale, privacy and the
// treatment of untrusted project text remain fixed in ai-provider.mjs.
export const AI_PROMPT_TASKS = Object.freeze(['upload','teaching','prompt']);
export const AI_PROMPT_LIMITS = Object.freeze({characters:4000,requestBytes:20*1024});
export const DEFAULT_AI_PROMPTS = Object.freeze({
  upload:'分析上传项目的教学文字，提供教师可以直接修改的表单建议。给出简洁具体的项目名称，不沿用文件扩展名或作者日期后缀；说明帮助理解什么（Prompt 项目说明帮助教师完成什么）、谁操作与面向哪些学习者、自然语言描述的前置知识、预期学习结果和学习深度，以及基本使用方式、活动和设备要求。根据内容建议学科与学段，支持语言、理科、音乐、美术、体育与健康和劳动等领域。依据不足时明确待教师确认，给出建议而不伪造事实。',
  teaching:'根据项目资料提出教学建议，分别说明教学用途、适用学生与差异化支持、先备知识、可观察的学习目标，以及课堂活动与设备条件。活动应有合理次序；依据不足时明确待教师确认。',
  prompt:'为教师生成可复制使用的创作 Prompt，涵盖角色与任务、学生及先备知识、教学目标、使用条件、交互或活动步骤、交付格式、验收检查和已提供的参考项目编号。保持既有目标与范围，以可检查的要求取代模糊形容。'
});
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const promptStorageError=()=>error(503,'AI_PROMPT_STORAGE_UNAVAILABLE','AI 指令配置暂时无法读取或保存，请稍后重试。');
export function validatePromptTask(task){
  if(!AI_PROMPT_TASKS.includes(task))throw error(400,'AI_PROMPT_INVALID_TASK','请选择有效的 AI 任务。');
  return task;
}
export function validatePromptUpdate(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['prompt','expectedRevision'].includes(key))||!Object.hasOwn(input,'prompt')||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw error(400,'AI_PROMPT_INVALID','请提交指令内容和当前版本号。');
  let prompt=input.prompt;
  if(prompt!==null){
    if(typeof prompt!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(prompt))throw error(400,'AI_PROMPT_INVALID','请输入纯文本指令；仅允许换行和制表符，不支持其他控制字符。');
    prompt=prompt.replace(/\r\n?/g,'\n').trim();
    if(!prompt||Array.from(prompt).length>AI_PROMPT_LIMITS.characters)throw error(400,'AI_PROMPT_INVALID','AI 指令需为 1–4000 个字符。恢复默认请使用恢复操作。');
  }
  return {prompt,expectedRevision:input.expectedRevision};
}
export function resolvePromptConfig(task,row=null){
  validatePromptTask(task);
  if(row===null)return {task,prompt:DEFAULT_AI_PROMPTS[task],defaultPrompt:DEFAULT_AI_PROMPTS[task],revision:0,isDefault:true,updatedAt:null,updatedBy:null};
  try{
    if(!row||row.task!==task||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))throw new Error();
    if(row.prompt!==null&&validatePromptUpdate({prompt:row.prompt,expectedRevision:0}).prompt!==row.prompt)throw new Error();
    if(row.updatedBy!==null&&(!row.updatedBy||typeof row.updatedBy.id!=='string'||typeof row.updatedBy.username!=='string'||typeof row.updatedBy.displayName!=='string'))throw new Error();
    return {task,prompt:row.prompt===null?DEFAULT_AI_PROMPTS[task]:row.prompt,defaultPrompt:DEFAULT_AI_PROMPTS[task],revision:row.revision,isDefault:row.prompt===null,updatedAt:row.updatedAt,updatedBy:row.updatedBy===null?null:{id:row.updatedBy.id,username:row.updatedBy.username,displayName:row.updatedBy.displayName}};
  }catch{throw promptStorageError();}
}
