(() => {
  'use strict';

  const ids = ['earth', 'dynasty', 'lens', 'poetry', 'cpp'];
  const interval = 8000;
  // Tabler Icons (MIT), bundled with this component to keep controls self-contained.
  const icons = {"chevron-left":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M15 6l-6 6l6 6\" /> </svg>","chevron-right":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M9 6l6 6l-6 6\" /> </svg>","arrow-up-right":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M17 7l-10 10\" /> <path d=\"M8 7l9 0l0 9\" /> </svg>","player-play":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M7 4v16l13 -8l-13 -8\" /> </svg>","player-pause":"<svg aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12\" /> <path d=\"M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12\" /> </svg>"};
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let index = 0, featured = [], context, element, timer, controller, observer;
  let playing = !motion?.matches, hovered = false, inView = false, pointer;
  let suppressClickUntil = 0, playIntent;
  const label = (key, vars) => context.e(context.t(key, vars));
  const title = project => context.local(project.title);
  const current = () => featured[index];
  const nextIndex = () => (index + 1) % featured.length;
  const number = value => String(value).padStart(2, '0');

  function slides() {
    const p = current(), next = featured[nextIndex()];
    return `<a class="showcase-main" data-kind="${p.kind}" href="${context.projectURL(p.id)}" aria-label="${label('查看项目')} · ${context.e(title(p))}"><img src="${context.e(p.cover)}" alt="${context.e(title(p))}" width="1280" height="960" fetchpriority="high" draggable="false"></a>
      <button type="button" class="showcase-preview" data-kind="${next.kind}" data-showcase="next" aria-label="${label('下一件作品')} · ${context.e(title(next))}">
        <span class="showcase-preview-label">${label('下一件作品')} ${icons['arrow-up-right']}</span>
        <img src="${context.e(next.cover)}" alt="" width="640" height="960" draggable="false">
        <span class="showcase-preview-title">${context.e(title(next))}</span>
      </button>`;
  }

  function caption() {
    const p = current();
    return `<div><small class="showcase-category">${label(p.subject)} · ${label(p.kind === 'prompt' ? 'Prompt 工具' : '教学可视化')}</small><a class="showcase-title" href="${context.projectURL(p.id)}">${context.e(title(p))}</a></div>
      <a class="showcase-open" href="${context.projectURL(p.id)}" aria-label="${label('查看项目')} · ${context.e(title(p))}" title="${label('查看项目')}">${icons['arrow-up-right']}</a>`;
  }

  function slideLabel() {
    return context.t('第 {index} 个项目，共 {count} 个：{title}', {index: index + 1, count: featured.length, title: title(current())});
  }

  function markup(projects, helpers) {
    context = helpers;
    featured = ids.map(id => projects.find(p => p.id === id && p.cover)).filter(Boolean);
    if (!featured.length) return '';
    index %= featured.length;
    return `<section class="project-showcase" aria-roledescription="${label('轮播')}" aria-label="${label('精选项目')}">
      <div class="showcase-stage">
        <div class="showcase-content" role="group" aria-roledescription="${label('幻灯片')}" aria-label="${context.e(slideLabel())}">${slides()}</div>
        <button type="button" class="showcase-arrow showcase-prev" data-showcase="prev" aria-label="${label('上一件作品')}" title="${label('上一件作品')}">${icons['chevron-left']}</button>
        <button type="button" class="showcase-arrow showcase-next" data-showcase="next" aria-label="${label('下一件作品')}" title="${label('下一件作品')}">${icons['chevron-right']}</button>
      </div>
      <div class="showcase-caption">${caption()}</div>
      <div class="showcase-footer">
        <span class="showcase-count"><span>${number(index + 1)}</span> / ${number(featured.length)}</span>
        <div class="showcase-dots" role="group" aria-label="${label('选择精选项目')}">${featured.map((p, i) => `<button type="button" class="showcase-dot" data-showcase-index="${i}" aria-pressed="${index === i}" aria-label="${label('查看第 {index} 件作品：{title}', {index: i + 1, title: title(p)})}" title="${context.e(title(p))}"><span></span></button>`).join('')}</div>
        <button type="button" class="showcase-play" data-showcase="play" aria-label="${label(playing ? '暂停自动轮播' : '开启自动轮播')}" title="${label(playing ? '暂停自动轮播' : '开启自动轮播')}">${icons[playing ? 'player-pause' : 'player-play']}</button>
      </div>
      <span class="showcase-announcement sr-only" role="status" aria-live="polite" aria-atomic="true"></span>
    </section>`;
  }

  function syncPlayback() {
    clearTimeout(timer);
    if (!element) return;
    const button = element.querySelector('.showcase-play');
    const name = context.t(playing ? '暂停自动轮播' : '开启自动轮播');
    button.innerHTML = icons[playing ? 'player-pause' : 'player-play'];
    button.setAttribute('aria-label', name);
    button.title = name;
    const canAdvance = playing && !hovered && inView && !document.hidden && !document.querySelector('.stone-entrance') && featured.length > 1;
    if (canAdvance) timer = setTimeout(() => move(nextIndex(), false), interval);
    else if (playing && !hovered && inView && !document.hidden && document.querySelector('.stone-entrance')) {
      // The opening ceremony can hide the showcase without changing its intersection.
      timer = setTimeout(syncPlayback, interval);
    }
  }

  function move(next, manual = true) {
    if (!element || !featured.length) return;
    index = ((next % featured.length) + featured.length) % featured.length;
    if (manual) playing = false;
    const previewFocused = document.activeElement === element.querySelector('.showcase-preview');
    const content = element.querySelector('.showcase-content');
    content.innerHTML = slides();
    content.setAttribute('aria-label', slideLabel());
    content.classList.remove('is-entering');
    if (!motion?.matches) {
      // A new content node allows repeat transitions without forcing a layout read.
      const animated = content.cloneNode(true);
      animated.classList.add('is-entering');
      content.replaceWith(animated);
    }
    element.querySelector('.showcase-caption').innerHTML = caption();
    element.querySelector('.showcase-count').innerHTML = `<span>${number(index + 1)}</span> / ${number(featured.length)}`;
    element.querySelectorAll('.showcase-dot').forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === index)));
    if (manual) element.querySelector('.showcase-announcement').textContent = slideLabel();
    if (previewFocused) element.querySelector('.showcase-preview').focus({preventScroll: true});
    syncPlayback();
  }

  function destroy() {
    clearTimeout(timer);
    controller?.abort();
    observer?.disconnect();
    controller = observer = element = pointer = playIntent = undefined;
  }

  function mount(container) {
    destroy();
    element = container.querySelector('.project-showcase');
    if (!element) return;
    controller = new AbortController();
    const options = {signal: controller.signal};
    hovered = element.matches(':hover');
    inView = false;
    element.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) {event.preventDefault();event.stopPropagation();return;}
      const dot = event.target.closest('[data-showcase-index]');
      if (dot) {move(Number(dot.dataset.showcaseIndex));return;}
      const button = event.target.closest('[data-showcase]');
      if (!button) return;
      if (button.dataset.showcase === 'play') {playing = playIntent ?? !playing;playIntent = undefined;syncPlayback();}
      else move(index + (button.dataset.showcase === 'prev' ? -1 : 1));
    }, options);
    element.addEventListener('pointerenter', event => {if(event.pointerType !== 'touch') {hovered = true;syncPlayback();}}, options);
    element.addEventListener('pointerleave', event => {if(event.pointerType !== 'touch') {hovered = false;syncPlayback();}}, options);
    element.addEventListener('focusin', event => {
      // Like a pause action, keyboard interaction stops rotation until explicitly resumed.
      if (!element.contains(event.relatedTarget)) {playing = false;syncPlayback();}
    }, options);
    element.addEventListener('keydown', event => {
      playIntent = undefined;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? featured.length - 1 : index + (event.key === 'ArrowLeft' ? -1 : 1);
      const mainFocused = document.activeElement?.classList.contains('showcase-main');
      const captionFocused = document.activeElement?.classList.contains('showcase-title');
      const openFocused = document.activeElement?.classList.contains('showcase-open');
      move(next);
      if (mainFocused || captionFocused || openFocused) element.querySelector(mainFocused ? '.showcase-main' : captionFocused ? '.showcase-title' : '.showcase-open').focus({preventScroll: true});
      else if (event.target.closest('.showcase-dot')) element.querySelectorAll('.showcase-dot')[index].focus({preventScroll: true});
    }, options);
    element.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-showcase="play"]')) {playIntent = !playing;return;}
      playIntent = undefined;
      if (event.pointerType !== 'touch' || !event.isPrimary || !event.target.closest('.showcase-content')) return;
      playing = false;syncPlayback();
      pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }, options);
    element.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer = undefined;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        suppressClickUntil = Date.now() + 450;
        move(index + (dx < 0 ? 1 : -1));
      }
    }, options);
    element.addEventListener('pointercancel', () => {pointer = playIntent = undefined;}, options);
    document.addEventListener('visibilitychange', syncPlayback, options);
    window.addEventListener('pagehide', () => clearTimeout(timer), options);
    window.addEventListener('pageshow', syncPlayback, options);
    motion?.addEventListener('change', () => {if(motion.matches) playing = false;syncPlayback();}, options);
    observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio >= .4;
      syncPlayback();
    }, {threshold: [0, .4]});
    observer.observe(element);
    syncPlayback();
  }

  window.PracticeShowcase = {markup, mount, destroy};
})();
