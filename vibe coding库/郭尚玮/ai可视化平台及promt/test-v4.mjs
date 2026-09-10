import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {projectPoint,rayEnd,onScreen,clampDistance,apertureEffect,imageFileError} from './optics.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const small=apertureEffect(.5,30,24),large=apertureEffect(5,30,24);
near(large.blurMM/small.blurMM,10);near(large.relativeLight/small.relativeLight,100);
near(apertureEffect(1,30,48).relativeLight,.25);
near(apertureEffect(1,30,24).blurMM,1.8);
assert.throws(()=>apertureEffect(0,30,24),RangeError);
assert.equal(imageFileError({type:'image/png',size:8000}),'');
assert.ok(imageFileError({type:'image/svg+xml',size:500}).includes('PNG'));
assert.ok(imageFileError({type:'image/jpeg',size:9*1024*1024}).includes('8 MB'));
// Independent geometric invariants: collinearity through the hole, inversion,
// magnification, screen clipping, and rays stopping at opaque side walls.
for(const u of [12,30,60])for(const v of [10,24,48])for(const p of [{x:0,y:0},{x:-3,y:4},{x:5,y:-6}]){
  const q=projectPoint(p,u,v),end=rayEnd(p,u,v);
  near(p.x*q.z-u*q.x,0);near(p.y*q.z-u*q.y,0);
  near(Math.hypot(q.x,q.y),Math.hypot(p.x,p.y)*v/u);
  assert.ok(p.x*q.x<=0&&p.y*q.y<=0);
  assert.ok(onScreen(end));assert.ok(end.z>=-v&&end.z<=0);
  if(onScreen(q)){near(end.z,-v);}else{near(Math.max(Math.abs(end.x),Math.abs(end.y)),9);assert.ok(end.z>-v);}
}
assert.deepEqual(projectPoint({x:3,y:6},30,15),{x:-1.5,y:-3,z:-15});
near(projectPoint({x:1,y:1},30,30).y,-1);
near(projectPoint({x:1,y:1},30,48).y,2*projectPoint({x:1,y:1},30,24).y);
assert.equal(onScreen({x:9,y:9}),true);assert.equal(onScreen({x:9.01,y:0}),false);
assert.throws(()=>projectPoint({x:0,y:0},0,12),RangeError);
for(const [value,want] of [['',30],['oops',30],[Infinity,30],[1,12],[99,60],[24.8,25]])assert.equal(clampDistance(value,12,60,30),want);

// Static routes and local assets must be complete in the offline output.
for(const file of ['pinhole.html','pinhole.css','index.html'])assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync('dist/'+file,'utf8'));
const html=fs.readFileSync('dist/pinhole.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  assert.ok(!/^https?:/.test(match[1]),'Runtime network dependency');
  assert.ok(fs.existsSync('dist/'+match[1].split('?')[0]),'Missing asset '+match[1]);
}
for(const id of ['scene','diagram','objectRange','screenRange','objectNumber','screenNumber','sourcePreview','screenPreview'])assert.ok(html.includes(`id="${id}"`));
assert.ok(fs.readFileSync('dist/index.html','utf8').includes('href="pinhole.html"'));
assert.ok(fs.readFileSync('dist/assets/pinhole.bundle.js','utf8').includes('data:image/png;base64,'),'Offline candle must be embedded');

// Run the shipped page in a minimal no-WebGL environment, exercising the
// fallback and user event handlers without a browser or a GPU.
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},handlers:{},width:384,height:384,clientWidth:390,clientHeight:370,
    attributes:new Map(id==='diagram'?[['hidden','']]:[]),
    setAttribute(k,v){this.attributes.set(k,String(v));},hasAttribute(k){return this.attributes.has(k);},
    toggleAttribute(k,force){if(force)this.attributes.set(k,'');else this.attributes.delete(k);},
    addEventListener(k,fn){this.handlers[k]=fn;},append(){},
    getContext(type){return type==='2d'?new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({data:new Uint8ClampedArray(256*256*4)}):k==='measureText'?()=>({width:180}):()=>{}}):null;}});
  return elements.get(id);
}
const groups={view:['apparatus','rays','screen'],object:['letter','candle','text','plane','pawn','upload'],point:['0','1','2'],trace:['one','two','all'],aperture:['0.5','1','3','5']};
const buttons={};
for(const [key,values] of Object.entries(groups))buttons['[data-'+key+']']=values.map(value=>Object.assign(element(key+value),{dataset:{[key]:value}}));
const document={getElementById:element,createElement:tag=>element(tag),querySelectorAll:selector=>buttons[selector]||[],querySelector:()=>element('objectcandle')};
const context=vm.createContext({document,console:{log(){},warn(){},error(){}},devicePixelRatio:1,Image:class{},ResizeObserver:class{observe(){}},setTimeout,clearTimeout,performance});
vm.runInContext(fs.readFileSync('dist/assets/pinhole.bundle.js','utf8'),context);
// SVG does not reflect a .hidden property into its HTML hidden attribute.
// Test the attribute that actually controls CSS visibility, not an expando.
assert.equal(element('diagram').hasAttribute('hidden'),false,'2D diagram remains hidden');
assert.ok(element('diagram').innerHTML.includes('<line'),'2D rays were not generated');
assert.equal(element('fallbackNotice').hidden,false);
assert.equal(element('ratio').textContent,'0.80 倍');
element('objectNumber').value='12';element('objectNumber').handlers.blur();
element('screenNumber').value='48';element('screenNumber').handlers.change();
assert.equal(element('ratio').textContent,'4.00 倍');assert.ok(element('cropNote').textContent.includes('截去'));
element('point0').handlers.click();assert.ok(element('pointExplanation').textContent.includes('侧壁'));
element('screenRange').value='10';element('screenRange').handlers.input();
assert.ok(element('pointExplanation').textContent.includes('A 点'));
element('reset').handlers.click();assert.equal(element('objectNumber').value,30);assert.equal(element('screenNumber').value,24);
element('aperture5').handlers.click();assert.equal(element('blurValue').textContent,'9.0 mm');assert.equal(element('ratio').textContent,'0.80 倍');
element('customText').value='123456789';element('applyText').handlers.click();assert.equal(element('customText').value,'12345678');
element('objectplane').handlers.click();assert.equal(element('objectDescription').textContent,'飞机图标');
element('reset').handlers.click();assert.equal(element('apertureValue').textContent,'1.0');assert.equal(element('uploadedChoice').disabled,true);
console.log('PASS V4.1: optics, aperture scaling, upload validation, text limits, reset, offline assets, SVG visibility and no-WebGL fallback.');
