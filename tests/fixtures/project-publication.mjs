// Test-only teacher-confirmed examples. Never inserted into the public catalog.
export function publicationMetadata(kind = 'visual') {
  const common = {kind,title:'重力探索',purpose:'比较不同重力下的自由落体',license:'teach',previewAuthentic:true,rightsConfirmed:true,privacyConfirmed:true,content:true};
  return kind === 'prompt'
    ? {...common,title:'古诗画面提示词',purpose:'将古诗意境整理为绘图提示',core:'请根据这首古诗描述画面、构图和色彩。',tested:'DeepSeek',promptStructure:'single',humanReviewConfirmed:true}
    : {...common,subject:'物理',stage:'初中',audience:'教师投屏，面向初中学生',prior:'认识距离与时间',outcome:'解释重力如何影响下落速度',setting:'教师演示，学生预测并讨论',runtimeStatus:'works',practiceStatus:'author-tested'};
}
