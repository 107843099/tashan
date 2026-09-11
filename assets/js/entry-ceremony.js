/* Original Tashan interaction; inspired by material showreels and React Bits micro-motion. */
(() => {
  'use strict';
  const ui=document.getElementById('practice-ui');
  let overlay=null, scene=null, sceneAbort=null, opening=0, timers=[], previousFocus=null, locale='zh-CN', paused=false;
  let completeOpening=null, transitionPromise=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const copy={
    'zh-CN':{brand:'他山',label:'他山 · 入场体验',overline:'以他山之石，琢教学之玉',first:'他山之石，',second:'可以攻玉。',description:'借鉴彼此的灵感与实践，\n琢出属于自己的教学可能。',meaning:'BORROW AN IDEA. MAKE IT YOUR OWN.',skip:'直接进入',carve:'点击原石，凿开新知',hint:'一凿见玉 · 进入教学创作平台',chapter:'序章',raw:'灵感，尚待雕琢',pause:'暂停动效',resume:'继续动效',revealed:'让每一次借鉴，都成为新的创造。',busy:'正在凿开原石…',close:'跳过动效，进入平台'},
    'zh-Hant':{brand:'他山',label:'他山 · 入場體驗',overline:'以他山之石，琢教學之玉',first:'他山之石，',second:'可以攻玉。',description:'借鑑彼此的靈感與實踐，\n琢出屬於自己的教學可能。',meaning:'BORROW AN IDEA. MAKE IT YOUR OWN.',skip:'直接進入',carve:'點擊原石，鑿開新知',hint:'一鑿見玉 · 進入教學創作平台',chapter:'序章',raw:'靈感，尚待雕琢',pause:'暫停動效',resume:'繼續動效',revealed:'讓每一次借鑑，都成為新的創造。',busy:'正在鑿開原石…',close:'跳過動效，進入平台'},
    en:{brand:'他山',label:'Tashan · An opening experience',overline:'IDEAS, WAITING TO BE REVEALED',first:'From rough stone,',second:'new possibilities.',description:'Learn from each other’s practice.\nCreate something of your own.',meaning:'BORROW AN IDEA. MAKE IT YOUR OWN.',skip:'Enter directly',carve:'Tap the stone. Reveal the jade.',hint:'One spark of inspiration. A new place to begin.',chapter:'PROLOGUE',raw:'An idea, ready to take shape',pause:'Pause motion',resume:'Resume motion',revealed:'Let every shared idea become a new creation.',busy:'Revealing the jade…',close:'Skip the opening and enter'}
  };
  const logo='<img src="./assets/brand/tashan-logo.webp?v=9e7e73ba10" width="192" height="192" alt="" decoding="async">';
  const fallback='<svg viewBox="0 0 360 430" aria-hidden="true"><defs><radialGradient id="jadeCore"><stop stop-color="#c8ead1"/><stop offset=".5" stop-color="#70b293"/><stop offset="1" stop-color="#23624d"/></radialGradient><linearGradient id="stoneShell" x2=".9" y2="1"><stop stop-color="#827d69"/><stop offset=".5" stop-color="#474c40"/><stop offset="1" stop-color="#17281e"/></linearGradient></defs><path class="fallback-jade" fill-rule="evenodd" d="M180 103a112 112 0 1 0 0 224a112 112 0 1 0 0-224M180 177a38 38 0 1 1 0 76a38 38 0 1 1 0-76" fill="url(#jadeCore)"/><g class="fallback-shell"><path d="M85 65 208 33 281 102 309 227 257 341 173 378 70 314 41 193Z" fill="url(#stoneShell)"/><path d="m85 65 77 82 46-114 27 177 74 17-105 25 53 89-117-59 33 96-78-126-54-59 91-32-47-96Z" fill="none" stroke="#acbe9a" stroke-opacity=".24" stroke-width="1.3"/><path d="m208 33-46 114 42 105-31 126" fill="none" stroke="#b6e3b7" stroke-width="2"/></g></svg>';
  function currentLanguage(){try{const l=localStorage.getItem('practice-language');return copy[l]?l:'zh-CN';}catch{return 'zh-CN';}}
  function later(fn,delay){timers.push(setTimeout(fn,delay));}
  function clearTimers(){timers.forEach(clearTimeout);timers=[];}
  function text(){return copy[locale];}
  function updateText(){if(!overlay)return;const words=text();overlay.lang=locale;overlay.setAttribute('aria-label',words.label);overlay.querySelectorAll('[data-intro-text]').forEach(node=>node.textContent=words[node.dataset.introText]);overlay.querySelectorAll('[data-intro-language]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.introLanguage===locale)));overlay.querySelector('.stone-hit').setAttribute('aria-label',words.carve);overlay.querySelector('.entrance-pause').textContent=words[paused?'resume':'pause'];}
  function finish(animate=true){
    if(!overlay)return;
    clearTimers();const closing=overlay;overlay=null;opening++;
    sceneAbort?.abort();sceneAbort=null;scene?.dispose();scene=null;
    closing.inert=true;closing.setAttribute('aria-hidden','true');closing.removeAttribute('aria-modal');
    closing.querySelectorAll('input').forEach(input=>input.value='');
    ui.inert=false;ui.removeAttribute('aria-hidden');
    document.documentElement.classList.remove('entrance-open');
    document.getElementById('toast')?.removeAttribute('aria-hidden');
    // Leave no transformed containing block or old entrance controls on the page.
    ui.classList.remove('entrance-arrival');
    if(animate&&!reduced.matches){ui.classList.add('entrance-arrival');setTimeout(()=>ui.classList.remove('entrance-arrival'),700);}
    document.getElementById('main')?.focus({preventScroll:true});
    window.scrollTo({top:0,left:0,behavior:'instant'});
    const complete=completeOpening;completeOpening=null;transitionPromise=null;
    if(animate&&!reduced.matches){closing.classList.add('is-leaving');setTimeout(()=>closing.remove(),650);}else closing.remove();
    complete?.();
  }
  function carve(){if(!overlay||overlay.dataset.phase!=='waiting'||(overlay.dataset.mode==='auth'&&overlay.dataset.automatic!=='true'))return;overlay.dataset.phase='carving';overlay.querySelector('.entrance-chapter b').textContent='02 / 03';overlay.querySelector('.entrance-pause').disabled=true;overlay.querySelector('.entrance-live').textContent=text().busy;overlay.querySelectorAll('[data-carve]').forEach(b=>{b.disabled=true;});if(reduced.matches){overlay.dataset.phase='revealed';later(finish,120);return;}scene?.carve();later(()=>{if(overlay){overlay.dataset.phase='revealed';overlay.querySelector('.entrance-reveal-label').removeAttribute('aria-hidden');overlay.querySelector('.entrance-chapter b').textContent='03 / 03';}},900);later(finish,2200);}
  function keyHandler(event){
    if(!overlay)return;
    if(event.key==='Enter'&&document.activeElement===overlay&&overlay.dataset.mode!=='auth'){event.preventDefault();carve();return;}
    if(event.key==='Escape'&&overlay.dataset.mode!=='auth'){event.preventDefault();finish();return;}
    if(event.key==='Tab'){
      const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')].filter(el=>!el.closest('[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
      const first=focusable[0],last=focusable.at(-1);if(!first)return;
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  }
  // Paint the usable login form before importing and preparing the optional 3D scene.
  function afterPaint(signal){return new Promise(resolve=>{
    let frame=0,timeout=0;
    const done=()=>{cancelAnimationFrame(frame);clearTimeout(timeout);signal.removeEventListener('abort',done);resolve();};
    signal.addEventListener('abort',done,{once:true});
    timeout=setTimeout(done,150);
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(done);});
  });}
  async function show(automatic=false,mode='replay'){if(overlay)return;const ticket=++opening;locale=currentLanguage();paused=reduced.matches;previousFocus=document.activeElement;overlay=document.createElement('section');overlay.className='stone-entrance';overlay.dataset.phase='waiting';overlay.dataset.mode=mode;overlay.setAttribute('role','dialog');overlay.tabIndex=-1;overlay.setAttribute('aria-modal','true');overlay.innerHTML=`<div class="entrance-canvas" aria-hidden="true"></div><div class="entrance-fallback">${fallback}</div><div class="entrance-stage-ring" aria-hidden="true"></div><header class="entrance-top"><div class="entrance-brand">${logo}<div><strong data-intro-text="brand"></strong><small>TASHAN</small></div></div><div class="entrance-controls"><div class="entrance-languages" role="group" aria-label="Language"><button data-intro-language="zh-CN" aria-label="简体中文">简</button><button data-intro-language="zh-Hant" aria-label="繁體中文">繁</button><button data-intro-language="en" aria-label="English">EN</button></div><button class="entrance-skip" data-skip><span data-intro-text="skip"></span><span aria-hidden="true">↗</span></button></div></header><div class="entrance-copy"><div class="entrance-overline" data-intro-text="overline"></div><h1><span data-intro-text="first"></span><span data-intro-text="second"></span></h1><p class="entrance-description" data-intro-text="description"></p><small class="entrance-meaning" data-intro-text="meaning"></small><div class="entrance-auth"></div></div><button class="stone-hit" data-carve><span class="stone-crosshair" aria-hidden="true"></span></button><div class="stone-invitation"><button data-carve><span data-intro-text="carve"></span><span aria-hidden="true">↗</span></button><p data-intro-text="hint"></p></div><div class="entrance-reveal-label" aria-hidden="true"><strong data-intro-text="brand"></strong><small data-intro-text="revealed"></small></div><footer class="entrance-footer"><div class="entrance-chapter"><b>01 / 03</b><span data-intro-text="chapter"></span></div><span class="entrance-footer-line" data-intro-text="raw"></span><button class="entrance-pause" data-pause></button></footer><span class="entrance-live" role="status" aria-live="polite"></span>`;
    document.body.append(overlay);ui.inert=true;ui.setAttribute('aria-hidden','true');document.getElementById('toast')?.setAttribute('aria-hidden','true');document.documentElement.classList.add('entrance-open');updateText();if(automatic){overlay.dataset.automatic='true';later(carve,reduced.matches?80:900);}
    overlay.addEventListener('click',event=>{if(event.target.closest('[data-carve]'))carve();if(event.target.closest('[data-skip]')&&overlay?.dataset.mode!=='auth')finish();if(event.target.closest('[data-pause]')&&overlay){paused=!paused;overlay.dataset.paused=String(paused);scene?.setPaused(paused);updateText();}const lang=event.target.closest('[data-intro-language]');if(lang&&overlay){locale=lang.dataset.introLanguage;try{localStorage.setItem('practice-language',locale);}catch{}document.querySelector(`#practice-ui [data-language="${locale}"]`)?.click();updateText();}});
    overlay.addEventListener('pointermove',event=>{if(!paused)scene?.pointer(event.clientX/window.innerWidth-.5,event.clientY/window.innerHeight-.5);});
    const host=overlay,controller=new AbortController();sceneAbort=controller;
    const current=()=>ticket===opening&&overlay===host&&!controller.signal.aborted&&host.dataset.phase!=='revealed';
    try{
      await afterPaint(controller.signal);if(!current())return;
      // Auth mounts synchronously after show starts; avoid laying out the empty
      // scene first, and never steal focus from someone already typing.
      if(!host.contains(document.activeElement))host.focus({preventScroll:true});
      if(reduced.matches)return;
      const module=await import('./entry-stone-scene.js?v=2837c00e1a');if(!current())return;
      const ready=await module.createStoneScene(host.querySelector('.entrance-canvas'),{reduced:reduced.matches,authLayout:mode==='auth',signal:controller.signal,onLost:()=>host.classList.remove('has-webgl')});
      if(!current()){ready.dispose();return;}
      scene=ready;host.classList.add('has-webgl');scene.setPaused(document.hidden||paused);
      if(host.dataset.phase==='carving')scene.carve();
    }catch(error){
      controller.abort();
      if(error.name!=='AbortError')console.info('Tashan entrance: using the lightweight stone illustration.',error.message);
    }

  }
  document.addEventListener('keydown',keyHandler);
  document.addEventListener('visibilitychange',()=>{scene?.setPaused(document.hidden||paused);});
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;scene?.setPaused(true);if(overlay?.dataset.phase==='carving')finish();else updateText();}});
  window.addEventListener('hashchange',()=>{if(overlay?.dataset.mode==='replay'&&location.hash&&location.hash!=='#discover')finish();});
  function mountAuth(node){
    if(overlay?.dataset.automatic==='true')return;
    if(!overlay)show(false,'auth').catch(()=>finish(false));
    if(!overlay)return;
    overlay.dataset.mode='auth';overlay.dataset.layout='auth';
    const host=overlay.querySelector('.entrance-auth'),old=host.querySelector('[data-account-form]'),next=node.querySelector('[data-account-form]');
    const keep=old&&next&&old.dataset.accountForm===next.dataset.accountForm;
    const values=keep?[...old.elements].filter(field=>field.name).map(field=>({name:field.name,value:field.value,focused:field===document.activeElement})):[];
    host.replaceChildren(node);
    for(const field of values){const input=next.elements[field.name];if(input){input.value=field.value;if(field.focused)input.focus({preventScroll:true});}}
    locale=currentLanguage();updateText();
  }
  window.TashanEntrance={
    mountAuth,
    dismissAuth:()=>{if(overlay?.dataset.mode==='auth'&&overlay.dataset.automatic!=='true')finish(false);},
    replay:()=>show(false),
    skip:()=>{if(overlay?.dataset.mode!=='auth')finish();},
    playAfterLogin:()=>{
      if(transitionPromise)return transitionPromise;
      transitionPromise=new Promise(resolve=>{completeOpening=resolve;});
      const completion=transitionPromise;
      if(overlay){
        overlay.dataset.automatic='true';overlay.dataset.mode='entry';
        const auth=overlay.querySelector('.entrance-auth');auth.inert=true;
        auth.querySelectorAll('input').forEach(input=>input.value='');
        overlay.scrollTo({top:0,behavior:'instant'});
        later(carve,reduced.matches?30:180);
      }else show(true,'entry').catch(()=>finish());
      return completion;
    }
  };
})();
