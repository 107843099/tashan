/* User-facing instructions, kept separate from project and account workflows. */
(() => {
  'use strict';
  const chapters = [
    ['start', '开始使用'], ['discover', '发现与改编'], ['create', '保存作品与 AI'],
    ['publish', '上传与发布'], ['backup', '备份与换设备'], ['account', '账号与权限'], ['questions', '常见问题']
  ];

  function render({txt, isAdmin = false}) {
    const p = value => `<p>${txt(value)}</p>`;
    const item = (title, description) => `<li><h3>${txt(title)}</h3>${p(description)}</li>`;
    const section = (id, intro, body) => {
      const index = chapters.findIndex(chapter => chapter[0] === id);
      return `<section class="guide-chapter" aria-labelledby="guide-${id}"><header><span class="guide-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><h2 id="guide-${id}" tabindex="-1">${txt(chapters[index][1])}</h2>${p(intro)}</div></header>${body}</section>`;
    };
    return `<div class="guide-page">
      <header class="guide-hero">
        <span class="guide-kicker">TASHAN / ${txt('使用指南')}</span>
        <h1>${txt('从一个好想法，到你的课堂。')}</h1>
        <p>${txt('先体验，再改编；把作品保存好，再分享给更多人。')}</p>
        <div class="guide-hero-actions"><a class="btn primary" href="#discover">${txt('去发现项目')} <span aria-hidden="true">↗</span></a><a class="guide-text-link" href="#desk">${txt('打开我的工作台')} <span aria-hidden="true">→</span></a></div>
      </header>
      <div class="guide-layout">
        <aside class="guide-sidebar"><nav aria-label="${txt('使用指南目录')}"><p class="guide-nav-label">${txt('按你需要的步骤阅读')}</p>${chapters.map(([id, title], index) => `<button type="button" data-action="guide-jump" data-id="${id}" aria-controls="guide-${id}"><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${txt(title)}</button>`).join('')}</nav><p class="guide-nav-note">${txt('第一次来？先浏览一个作品，熟悉后再上传自己的项目。')}</p></aside>
        <div class="guide-content">
          ${section('start', '有账号就登录，也可以先以游客身份体验。', `<ol class="guide-steps">
            ${item('登录平台', '在原石页面输入管理员分配的用户名和密码。验证通过后，碎玉动效会带你进入首页顶部。新账号无需先修改密码。')}
            ${item('暂时没有账号', '点击登录框下方的“游客模式”，浏览公开项目和使用指南。需要收藏、创作或上传时，再向管理员获取账号。')}
          </ol><p class="guide-footnote">${txt('右上角的语言图标可切换简体、繁体和英文；太阳或月亮图标用于切换深浅色。')}</p>`)}

          ${section('discover', '先确认适合谁、怎样用，再带进课堂。', `<ol class="guide-steps">
            ${item('找到合适的作品', '在“发现项目”搜索知识点或用途，再按学科、学段和验证状态筛选项目库。下方的“公开作品”是独立列表。')}
            ${item('阅读介绍并体验', '打开项目详情，查看适用学生、前置知识、学习目标和教学方式，再使用项目的打开或预览入口。课前亲自试一遍关键操作。')}
            ${item('把思路改成自己的', '在项目中选择“基于它继续创作”，填写学生背景、目标与课堂条件，生成并保存任务说明。可用 AI 优化文字，或复制到外部工具继续制作。')}
          </ol><div class="guide-note"><h3>${txt('使用 Prompt 与生成图片')}</h3>${p('在 Prompt 项目中展开原始内容并复制，按自己的课题修改。平台 AI 提供文字分析与优化，生成图片请使用支持生图的工具。分享 Prompt 时，须保留这条 Prompt 的实际输出截图或动图；装饰性示意图不能替代效果证明。')}</div>`)}

          ${section('create', '从“我的工作台 → 分享项目”开始，两步完成整理与发布。', `<ol class="guide-steps">
            ${item('作品与教学信息', '选择项目类型，上传文件或填写 Prompt。在同一页查看 AI 建议、修改用途与教学信息，再补充真实预览和测试情况，不用切换到另一页填写。项目附件最大 10 MB，预览图片最大 5 MB，图片支持 PNG、JPEG、WebP 或 GIF。')}
            ${item('确认与发布', '核对内容，选择使用授权，并亲自确认真实预览、隐私与版权；Prompt 还需确认人工核查 AI 输出。选择“直接公开发布”后点击“上传并公开”，其他成员和游客即可查看；暂不公开可选“先存到云端，仅自己可见”，也可仅保存到此浏览器。')}
          </ol><div class="guide-backup-options"><section><h3>${txt('教学可视化需要准备什么？')}</h3>${p('必须提供项目文件或可获取项目的完整链接，以及至少一种真实效果预览：截图、动图或视频链接。单独填写成果说明不能代替项目本体。')}${p('名称、核心用途、学科、建议学段、操作者与学习对象、前置知识、预期学习结果、基本使用方式均需填写。没有前置要求可写“无需基础”；建议年级和课程关联可以留空。')}${p('如实选择当前运行状态和实践状态；已用于课堂时补充课堂记录。音乐、美术、体育与健康等学科已可选择。作者提供的测试说明不等于平台或课堂成效认证。')}</section><section><h3>${txt('Prompt 项目需要准备什么？')}</h3>${p('填写名称、用途和至少一条完整 Prompt，上传真实输出截图或动图，并写明实际测试过的 AI 工具。仅有视频链接不能代替 Prompt 的截图或动图。')}${p('选择单条 Prompt 或多步骤组合。组合需写清完整正文、先后顺序，以及后一步是否依赖同一对话中的前一步输出。面向学生的学科、学段与教学建议可按需补充。')}</section></div><p class="guide-footnote">${txt('暂时没填完可点击“保存草稿”，下次从工作台“继续填写”。不再需要时可“删除草稿”，确认后只清除未完成内容，不影响已保存的项目或云端版本。每个账号在此浏览器中保留一份进行中的草稿。')}</p><div class="guide-ai-note"><div class="guide-note-title"><span class="guide-ai-badge" aria-label="${txt('此功能调用 AI')}">AI</span><h3>${txt('让 AI 帮你补齐必填信息')}</h3></div>${p('“上传后自动分析教学信息”默认开启，添加可读取文件后自动分析。只填写文字时，请点击“分析并补全”。AI 尝试补充空白项，保留你手动填写的内容；无法判断的项目仍需补填，也可关闭自动分析。')}${p('AI 面板与教学信息在第一步的同一页。带 AI 标识的功能会调用 DeepSeek，可先查看将发送的文字。已有内容不会被自动覆盖；需要替换时，展开“查看 AI 建议，按需替换”，勾选条目，再点击“采用选中的建议”。')}${p('AI 建议需要教师核对。真实预览、实际测试工具、运行与课堂记录、授权、隐私和人工核查确认由本人提供；AI 不会代为勾选，也不会自动公开项目。')}</div>`)}

          ${section('publish', '记住这三个状态，就不会弄混作品保存到了哪里。', `<ol class="guide-states">
            ${item('保存到本机', '保存在当前浏览器，供你继续编辑。其他设备和游客看不到这份本地内容。')}
            ${item('上传到云端', '分享项目的最后一步选择“先存到云端，仅自己可见”，或在项目详情中保存当前版本到云端。成功后可在工作台“云端项目”中找到，并在其他设备登录读取。这次保存不会替换已公开的旧版本。')}
            ${item('公开发布', '本地项目可在工作台点击“上传并公开”。已经上传的私有项目，可在云端列表点击“发布最新版本”；也可进入详情选择固定版本发布。成功后点击“复制公开链接”，其他成员和游客就能查看。')}
          </ol><div class="guide-note"><h3>${txt('修改、版本与来源')}</h3>${p('保存修改会产生新版本，项目编号保持不变。旧版已发布时，新修改不会自动替换它；上传新版后，再明确发布新版。引用其他项目时，可一并记录项目编号与版本，方便追溯。')}${p('如果旧项目缺少真实预览、教学说明或责任确认，发布时会提示补全。编辑并保存新版本后再发布，已有公开内容仍可阅读。使用权限是作者的授权声明，不代表技术上阻止下载。')}${p('不想继续公开时，使用“撤回公开”。删除本地项目不会撤回已经发布的云端版本。')}</div>`)}

          ${section('backup', '换设备前，分别保留浏览器资料和云端版本。', `<div class="guide-backup-options">
            <section><span class="guide-small-label">${txt('此浏览器中的资料')}</span><h3>${txt('导出本地备份')}</h3>${p('在工作台点击“导出本地备份”，下载 JSON 文件。它包含此账号在此浏览器中的项目、附件、封面、草稿、收藏、任务和版本历史。')}${p('换设备后登录同一账号，使用“导入备份”，先检查新增、相同与冲突项目，再确认导入。')}</section>
            <section><span class="guide-small-label">${txt('云端保存的版本')}</span><h3>${txt('备份此项目全部版本')}</h3>${p('在云端项目详情中使用“备份此项目全部版本”，下载这个项目已上传的版本与文件。浏览器里的未上传草稿、收藏和其他项目需另外导出本地备份。')}${p('登录新设备能读取已上传的云端项目，但不会自动同步旧设备的草稿和收藏。')}</section>
          </div><p class="guide-footnote">${txt('在清理浏览器数据或更换站点地址前先导出备份。个人项目备份不包含账号密码或登录会话。')}</p>`)}

          ${section('account', '自己的密码自己修改，账号由管理员统一维护。', `<div class="guide-account-options"><section><h3>${txt('我是普通成员')}</h3>${p('点击右上角的个人入口，先进入“我的工作台”，再点击“个人资料”。在这里查看个人及所属信息，需要改密时点击“修改密码”展开表单。取消或修改成功后表单会收起。新密码至少 8 位，允许纯数字；修改显示名称或所属学校、机构请联系管理员。')}<a class="guide-text-link" href="#account">${txt('前往个人资料')} <span aria-hidden="true">↗</span></a></section><section><h3>${txt('我是管理员')}</h3>${p('从“个人资料”进入“账户管理”，点击“新建账户”，填写用户名、显示名称、角色和初始密码，再选择所属类型。学校、机构需填写名称，个人不用填写。选中已有账户可编辑资料、重置密码或启停用。')}${p('搜索可查询全部账户，角色和状态筛选只作用于当前页。新建账户不要求首次改密；管理员重置密码后，用户需要设置新密码。')}${p('在“AI 提示词”中分别调整上传信息分析、教学建议和创作 Prompt。保存后从下一次 AI 调用生效，可查看默认内容并恢复；遇到保存冲突时，先读取最新内容，再核对自己的草稿。')}${isAdmin ? `<a class="guide-text-link" href="#admin">${txt('打开账户管理')} <span aria-hidden="true">↗</span></a>` : ''}</section></div>`)}

          ${section('questions', '遇到问题，先检查这里。', [
            ['为什么保存了，别人却看不到？', '先看工作台中的“云端项目”。只在下方浏览器资料里的项目尚未完成云端分享，点击“上传并公开”；云端显示“仅自己可见”时，点击“发布最新版本”。发布后可在发现页下方的“公开作品”找到，也可复制公开链接分享。'],
            ['上传的网页为什么不能完整运行？', '上传 HTML 的预览使用隔离环境，不允许联网加载资源。建议使用自带脚本、样式和内嵌资源的单文件 HTML。ZIP、PDF 和 Office 文档可以保存和下载，当前不支持在线解包运行或完整文档预览。'],
            ['AI 没有补全，或者建议不合适怎么办？', '先检查自动分析是否开启、服务是否可用。HTML、Markdown、TXT、JSON 可提取文字，长文件只读取部分内容；ZIP、PDF、Office 需补充至少 10 个字符的说明，再点“分析并补全”。失败时可重试或手动填写。不要在发送给 AI 的文字中放入密码、密钥或学生个人信息。'],
            ['“运行已检查”就代表适合课堂吗？', '“运行已检查”仅代表记录中的基础交互已测试；“待验证”表示尚未完成检查；“内容待修订”表示发现了具体问题。这些状态都不等于课堂成效认证，请结合学生情况判断。'],
            ['可以直接下载、改编和分享所有作品吗？', '先查看项目的开放权限与参考来源，并确认原作者及第三方素材的授权。平台精选库来自原有本地资料，部分教学建议和示例图为展示补充；原文、来源和检查记录可在项目详情核对。'],
            ['忘记密码，或账号被停用了怎么办？', '请联系管理员重置密码或重新启用账号。被停用后无法继续使用受保护功能；停用账号不会删除项目资料。']
          ].map(([question, answer]) => `<details class="guide-faq"><summary>${txt(question)}</summary>${p(answer)}</details>`).join(''))}
        </div>
      </div>
      <footer class="guide-finish"><div><h2>${txt('现在，把想法用起来。')}</h2><p>${txt('从一个小作品开始，留下清楚的教学说明。')}</p></div><a class="btn" href="#desk">${txt('打开我的工作台')} <span aria-hidden="true">→</span></a></footer>
    </div>`;
  }

  function jump(id) {
    if (!chapters.some(chapter => chapter[0] === id)) return;
    const heading = document.getElementById('guide-' + id);
    heading?.scrollIntoView({behavior: 'instant', block: 'start'});
    heading?.focus({preventScroll: true});
  }
  window.TashanGuide = {render, jump};
})();
