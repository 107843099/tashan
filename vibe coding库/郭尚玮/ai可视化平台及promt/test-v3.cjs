// Minimal regression check: node test-v3.cjs (browser layout is checked separately).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: id === 'distance' ? 22 : 10, clientWidth: 1000, style: {},
    innerHTML: '', textContent: '', dataset: {}, handlers: {}, attributes: {},
    setAttribute(k,v) { this.attributes[k] = v; },
    addEventListener(type,fn) { this.handlers[type] = fn; }
  });
  return elements.get(id);
}
const presets = [2.2,2,1.5,1,.7].map(ratio => Object.assign(element('preset'+ratio),{dataset:{ratio}}));
const document = {getElementById:element,querySelectorAll:s=>s==='[data-ratio]'?presets:[],addEventListener(){}};
const context = vm.createContext({document,console,assert});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
vm.runInContext(`
  assert.equal(imageDistance(10,30),15);
  assert.equal(imageDistance(10,5),-10);
  for(const [u,c] of [[22,0],[15,1],[7,2],[20,3],[10,4],[9.9,2],[10.1,1]]) assert.equal(category(u,10),c);
  // Every selectable distance/focal pair: finite images and candle bounds stay on canvas.
  for(const width of [280,360,600,1030]) for(let ui=50;ui<=360;ui++) for(let fi=60;fi<=160;fi++) {
    const u=ui/10,f=fi/10,g=geometry(u,f,width), ih=Math.abs(g.m)*g.height;
    assert.ok(g.objX-g.height/3>=0 && g.objX+g.height/3<=g.w);
    if(Number.isFinite(g.v)) {
      assert.ok(g.imgX-ih/3>=0 && g.imgX+ih/3<=g.w, 'image clipped horizontally');
      assert.ok(g.y-ih>=0 && g.y+ih<g.h-100, 'image clipped vertically');
      assert.ok(Math.abs(1/f-1/u-1/g.v)<1e-12);
    }
  }
  slider.value=7;render();
  assert.equal(el('vValue').textContent,'-23.3 cm');
  assert.ok(stage.innerHTML.includes('虚像'));
  assert.ok(stage.innerHTML.includes('stroke-dasharray="5 5"'));
  assert.ok(!stage.innerHTML.includes('NaN'));
  slider.value=10;render();
  assert.equal(el('vValue').textContent,'无有限值');
  assert.ok(!stage.innerHTML.includes('Infinity'));
  setMode('guide');
  assert.equal(el('vValue').textContent,'待验证');
  assert.ok(slider.disabled && focalSlider.disabled && el('guideAction').disabled);
  assert.ok(!stage.innerHTML.includes('#bb8000'));
  el('guideAction').handlers.click();assert.equal(guidePhase,'predict');
  for(let i=0;i<tasks.length;i++) {
    assert.equal(guideIndex,i);
    selectedAnswer=i===0?'1':String(tasks[i].answer);syncGuide();
    el('guideAction').handlers.click();assert.equal(guidePhase,'operate');
    assert.ok(!slider.disabled && focalSlider.disabled);
    assert.equal(el('vValue').textContent,'待验证');
    assert.ok(el('guideAction').disabled);
    el('guideAction').handlers.click();assert.equal(guidePhase,'operate');
    slider.value=tasks[i].u;updateInput();
    assert.ok(!el('guideAction').disabled);
    el('guideAction').handlers.click();assert.equal(guidePhase,'result');
    assert.equal(el('caseTitle').textContent,answers[tasks[i].answer]);
    assert.ok(el('guideFeedback').textContent.includes(i===0?'需要修正':'回答正确'));
    assert.ok(slider.disabled);
    el('guideAction').handlers.click();
  }
  assert.equal(guideIndex,0);assert.equal(guidePhase,'predict');
  setMode('free');assert.equal(slider.disabled,false);assert.equal(focalSlider.disabled,false);
  for(const [id,val,want,input] of [['distanceValue',50,36,slider],['distanceValue',1,5,slider],['focalValue',30,16,focalSlider],['focalValue',8.24,8.2,focalSlider]]) {
    el(id).value=val;el(id).handlers.change();assert.equal(Number(input.value),want);
  }
  const before=slider.value;el('distanceValue').value='';el('distanceValue').handlers.change();assert.equal(slider.value,before);
  el('resetButton').handlers.click();assert.equal(Number(slider.value),22);assert.equal(Number(focalSlider.value),10);
  assert.ok(stage.innerHTML.includes('id="stageTitle"'));
`,context);
console.log('PASS V3.1: 125644 geometry cases, signed optics, five prediction/operation/verification tasks, gating, input limits and reset.');
