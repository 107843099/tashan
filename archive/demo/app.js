function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function tagList(tags) {
  return `<ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
}

function publisherBadge(project) {
  return `<span class="publisher-badge"><span aria-hidden="true">⌂</span> 来自：${escapeHtml(project.publisher)}</span>`;
}

function projectCover(type) {
  if (type === "recursion") {
    return `
      <div class="cover cover-recursion" aria-hidden="true">
        <span class="code-line active">gcd(84, 36)</span>
        <span class="down-arrow">↓</span>
        <span class="code-line">gcd(36, 12)</span>
        <span class="down-arrow">↓</span>
        <span class="code-line final">gcd(12, 0)</span>
      </div>`;
  }

  return `
    <div class="cover cover-euclid" aria-hidden="true">
      <div class="rectangle-diagram">
        <span class="diagram-label top">84</span>
        <span class="diagram-label side">36</span>
        <i class="cut-square first"></i><i class="cut-square second"></i><i class="remaining-rectangle"></i>
      </div>
      <div class="cover-legend"><span><b class="legend-cut"></b>处理掉</span><span><b class="legend-rest"></b>继续处理</span></div>
    </div>`;
}

function projectCard(project) {
  const viewLink = `project.html?id=${project.id}`;
  const source = project.sourceProject
    ? '<p class="source-note"><span aria-hidden="true">↗</span> 衍生自：矩形里的最大公因数</p>'
    : "";

  return `
    <article class="project-card">
      ${projectCover(project.cover)}
      <div class="card-content">
        <div class="card-meta"><p class="subject">${escapeHtml(project.subject)}</p>${publisherBadge(project)}</div>
        <h3>${escapeHtml(project.title)}</h3>
        <p class="summary">${escapeHtml(project.summary)}</p>
        ${tagList(project.tags)}
        ${source}
        <div class="difficulty-note"><span class="difficulty-icon" aria-hidden="true">?</span><span><b>学生困难：</b>${escapeHtml(project.problem)}</span></div>
        <div class="card-actions">
          <a class="button button-primary" href="${viewLink}">查看实践 <span aria-hidden="true">→</span></a>
          <a class="text-link" href="${project.demoUrl}" target="_blank" rel="noopener">直接体验 <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </article>`;
}

function renderHome() {
  const target = document.getElementById("projectList");
  if (target) target.innerHTML = projects.map(projectCard).join("");
}

function quickInfo(project) {
  const entries = [
    ["适合", project.audience],
    ["使用方式", project.use],
    ["建议时间", project.duration],
    ["需要设备", project.equipment],
    ["交互", project.interaction]
  ];
  return `<dl class="quick-info">${entries.map(([term, definition]) => `
    <div><dt>${term}</dt><dd>${definition}</dd></div>`).join("")}
  </dl>`;
}

function processDiagram() {
  return `
    <div class="takeaway-flow" aria-label="抽象过程转化为可观察步骤的流程">
      <span>抽象过程</span><b>↓</b><span>拆成步骤</span><b>↓</b><span class="highlight-state">当前状态高亮</span><b>↓</b><span>下一状态明确</span><b>↓</b><span>重复，直到结束</span>
    </div>`;
}

function renderDetail() {
  const target = document.querySelector(".project-shell");
  if (!target) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const project = getProject(id);
  if (!project || !project.detail) {
    target.innerHTML = `
      <a class="back-link" href="index.html">← 返回发现</a>
      <section class="not-found"><p class="eyebrow">未找到项目</p><h1>这个实践暂时不可查看</h1><a class="button button-primary" href="index.html">回到项目列表</a></section>`;
    return;
  }

  const isEuclid = project.id === "euclid-visual";
  const derivative = getProject("gcd-recursion");
  const sourceProject = project.sourceProject ? getProject(project.sourceProject) : null;
  const mechanismIntro = project.detail.mechanismIntro || "不是多加动画，而是让学生在每一步都知道：当前发生了什么，下一步为什么继续。";
  const continuation = isEuclid ? `
    <section class="takeaway-section" aria-labelledby="takeaway-title">
      <div>
        <p class="eyebrow">可迁移的教学方法</p>
        <h2 id="takeaway-title">这个项目真正值得带走的是什么？</h2>
        <p class="takeaway-statement">不是矩形本身，而是“把一个不断重复、状态持续变化的抽象过程，变成可以一步一步观察的过程”。</p>
      </div>
      ${processDiagram()}
    </section>

    <section class="continue-section" aria-labelledby="continue-title">
      <p class="eyebrow">下一步</p>
      <h2 id="continue-title">基于这个实践继续创作</h2>
      <p>不复制这个数学网页，而是看看它背后的教学方法能不能帮助解决你的教学问题。</p>
      <a class="button button-secondary" href="remix.html?source=euclid-visual">基于这个实践继续创作 <span aria-hidden="true">→</span></a>
    </section>

    <section class="derivative-section" aria-labelledby="derivative-title">
      <div class="derivative-heading"><p class="eyebrow">真实迁移结果</p><h2 id="derivative-title">基于这个实践产生的新作品</h2></div>
      <article class="derivative-card">
        ${projectCover("recursion")}
        <div>
          <p class="derivative-meta">数学 → 信息科技　·　教学机制迁移</p>
          <h3>${derivative.title}</h3>
          <p>${derivative.summary}</p>
          <p class="derivative-note">保留“状态变化、下一状态、重复结构、终止条件”的教学方式，用来帮助学生理解递归调用过程。</p>
          <a class="text-link text-link-strong" href="project.html?id=${derivative.id}">查看项目详情 <span aria-hidden="true">→</span></a>
        </div>
      </article>
    </section>` : `
    <section class="origin-section" aria-labelledby="origin-title">
      <p class="eyebrow">实践来源</p>
      <h2 id="origin-title">从数学经验迁移而来</h2>
      <p>这个项目保留“状态变化、下一状态、重复结构、终止条件”的教学方式，用它来解释递归调用过程。</p>
      <a class="text-link text-link-strong" href="project.html?id=${sourceProject.id}">查看原始数学实践 <span aria-hidden="true">→</span></a>
    </section>`;
  document.title = `${project.title} · 教师实践实验室`;
  target.innerHTML = `
    <header class="detail-header">
      <a class="brand" href="index.html" aria-label="教师实践实验室首页">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>教师实践实验室</span>
      </a>
      <span class="demo-label">项目详情</span>
    </header>
    <a class="back-link" href="index.html">← 返回发现</a>

    <section class="detail-hero" aria-labelledby="project-title">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(project.subject)}教学实践</p>
        <h1 id="project-title">${project.title}</h1>
        <p class="lead">${project.detail.intro}</p>
        ${publisherBadge(project)}
        ${tagList(project.tags)}
        <a class="button button-primary button-experience" href="${project.demoUrl}" target="_blank" rel="noopener"><span aria-hidden="true">▶</span> 直接体验</a>
        <p class="open-note">将在新标签页打开，体验后可回到这里继续了解。</p>
      </div>
      <div class="hero-visual">${projectCover(project.cover)}</div>
    </section>

    <section class="problem-section content-section" aria-labelledby="problem-title">
      <div class="section-kicker"><span>教学问题</span></div>
      <div class="section-copy">
        <h2 id="problem-title">它解决什么问题？</h2>
        ${project.detail.problemDetail.map((paragraph) => `<p>${paragraph}</p>`).join("")}
      </div>
    </section>

    <section class="quick-section" aria-labelledby="quick-title">
      <p class="eyebrow">快速判断</p>
      <h2 id="quick-title">我能不能直接用？</h2>
      ${quickInfo(project)}
    </section>

    <section class="mechanisms-section content-section" aria-labelledby="mechanisms-title">
      <div class="section-kicker"><span>教学机制</span></div>
      <div class="section-copy">
        <h2 id="mechanisms-title">为什么这样设计？</h2>
        <p class="section-intro">${mechanismIntro}</p>
        <ol class="mechanism-list">${project.detail.mechanisms.map(([number, title, description]) => `
          <li><span class="mechanism-number">${number}</span><div><h3>${title}</h3><p>${description}</p></div></li>`).join("")}
        </ol>
      </div>
    </section>

    ${continuation}
  `;
}

renderHome();
renderDetail();
