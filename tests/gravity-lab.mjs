import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file=new URL('../examples/gravity-lab/gravity-lab.html',import.meta.url);
const html=readFileSync(file,'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'The standalone project includes its own controller');
function fixture({reduced=false}={}){
 const nodes=new Map(),documentEvents={},windowEvents={},frames=new Map();let frameId=0;
 function node(id,attrs=''){
  const classes=new Set((attrs.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/).filter(Boolean)),attributes={};
  const element={id,value:attrs.match(/value="([^"]*)"/)?.[1]||'',checked:false,disabled:false,textContent:'',style:{},dataset:{},listeners:{},attributes,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},setAttribute(name,value){attributes[name]=String(value);},removeAttribute(name){delete attributes[name];},addEventListener(type,fn){this.listeners[type]=fn;},emit(type,value){if(value!==undefined)this.value=String(value);this.listeners[type]?.({target:this});}};
  return element;
 }
 for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))nodes.set(tag[1],node(tag[1],tag[0]));
 const buttons=['earth','moon','mars'].map(key=>{const button=node('button-'+key);button.dataset.planet=key;return button;});
 const document={documentElement:{dataset:{}},activeElement:null,hidden:false,getElementById:id=>{assert.ok(nodes.has(id),'Referenced DOM node exists: '+id);return nodes.get(id);},querySelectorAll:selector=>selector==='[data-planet]'?buttons:[],addEventListener:(name,fn)=>{documentEvents[name]=fn;}};
 const window={matchMedia:()=>({matches:reduced}),addEventListener:(name,fn)=>{windowEvents[name]=fn;}};
 vm.runInNewContext(source,{window,document,requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 return {api:window.GravityLab,get:id=>nodes.get(id),buttons,document,documentEvents,windowEvents,frames,frame(timestamp){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(timestamp);},click(id){nodes.get(id).emit('click');},input(id,value){nodes.get(id).emit('input',value);},change(id,value){nodes.get(id).emit('change',value);}};
}
const close=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<=epsilon*Math.max(1,Math.abs(expected)),`${actual} differs from expected ${expected}`);

test('known 19.6 m Earth fall reaches ground in 2 s with the expected intermediate state',()=>{
 const {stateAt}=fixture().api;
 const halfway=stateAt({height:19.6,mass:2,g:9.8,time:1});close(halfway.height,14.7);close(halfway.velocity,9.8);close(halfway.force,19.6);assert.equal(halfway.finished,false);
 const ground=stateAt({height:19.6,mass:2,g:9.8,time:2});close(ground.landingTime,2);close(ground.height,0);close(ground.velocity,19.6);assert.equal(ground.finished,true);
});

test('mass affects force and energy, but not position, speed or landing time',()=>{
 const {stateAt}=fixture().api,conditions={height:20,g:3.71,time:1.2};
 const light=stateAt({...conditions,mass:.1}),heavy=stateAt({...conditions,mass:10});
 for(const key of ['landingTime','elapsed','height','velocity'])close(light[key],heavy[key]);
 for(const key of ['force','potential','kinetic','total'])close(heavy[key],100*light[key]);
});

test('height and gravity scaling agree with independent ratios',()=>{
 const {stateAt,planets}=fixture().api,fall=(height,g)=>stateAt({height,mass:1,g,time:0}).landingTime;
 close(fall(80,planets.earth.g),2*fall(20,planets.earth.g));
 assert.ok(fall(20,planets.earth.g)<fall(20,planets.mars.g));assert.ok(fall(20,planets.mars.g)<fall(20,planets.moon.g));
 close(fall(20,planets.moon.g)/fall(20,planets.earth.g),Math.sqrt(9.8/1.62));
});

test('mechanical energy and the speed-height invariant hold across the complete parameter range',()=>{
 const {stateAt,planets}=fixture().api;
 for(const {g} of Object.values(planets))for(const height of [1,20,100])for(const mass of [.1,1,10])for(const fraction of [0,.1,.37,.75,1]){
  const point=stateAt({height,mass,g,time:fraction*Math.sqrt(2*height/g)});
  close(point.potential+point.kinetic,mass*g*height);
  close(point.height+point.velocity**2/(2*g),height);
  assert.ok(point.height>=0&&point.kinetic>=0&&point.potential>=0);
 }
});

test('zero-height and post-impact requests are bounded; invalid physics inputs fail explicitly',()=>{
 const {stateAt}=fixture().api;
 const zero=stateAt({height:0,mass:1,g:9.8,time:0});assert.equal(zero.height,0);assert.equal(zero.velocity,0);assert.equal(zero.total,0);assert.equal(zero.finished,true);
 const later=stateAt({height:19.6,mass:1,g:9.8,time:100});close(later.elapsed,2);close(later.velocity,19.6);close(later.height,0);
 for(const bad of [{height:-1},{mass:0},{g:0},{time:-1},{time:Infinity},{g:NaN}])assert.throws(()=>stateAt({height:20,mass:1,g:9.8,time:1,...bad}),error=>error.name==='RangeError');
});

test('actual controls support pause/resume, slower playback and single-step without clock jumps',()=>{
 const f=fixture();assert.equal(f.api.inspect().time,0);assert.equal(f.frames.size,0,'There is no autoplay');
 f.click('step');close(f.api.inspect().time,.1);f.click('play');f.frame(1000);f.frame(2000);close(f.api.inspect().time,1.1);
 f.click('play');assert.equal(f.api.inspect().playing,false);assert.equal(f.frames.size,0);
 f.click('play');f.frame(5000);f.frame(6000);close(f.api.inspect().time,2.1); // Resuming excludes the paused interval.
 f.change('speed',.5);f.frame(7000);f.frame(8000);close(f.api.inspect().time,2.6);
 f.click('step');close(f.api.inspect().time,2.7);assert.equal(f.api.inspect().playing,false);assert.equal(f.frames.size,0);
});

test('changing parameters resets the experiment; invalid input and in-progress typing are preserved',()=>{
 const f=fixture();f.click('step');f.change('height-number',40);assert.equal(f.api.inspect().time,0);assert.equal(f.api.inspect().height,40);assert.equal(f.get('height-range').value,'40');
 f.change('mass-number',2);assert.equal(f.api.inspect().mass,2);assert.equal(f.get('force-value').textContent,'19.60');
 f.change('height-number',0);assert.equal(f.api.inspect().height,40);assert.equal(f.get('height-number').attributes['aria-invalid'],'true');assert.match(f.get('input-error').textContent,/1 至 100/);
 f.change('height-number',21.5);assert.equal(f.api.inspect().height,40);f.change('height-number',100);assert.equal(f.api.inspect().height,100);assert.equal(f.get('input-error').textContent,'');
 f.change('mass-number',.11);assert.equal(f.api.inspect().mass,2);
 f.document.activeElement=f.get('mass-number');f.get('mass-number').value='3.';f.click('play');f.frame(0);f.frame(100);assert.equal(f.get('mass-number').value,'3.','Animation must not replace a number being typed');
});

test('timeline endpoint, planet selection and impact labels remain physically consistent',()=>{
 const f=fixture();f.input('timeline',1000);close(f.api.inspect().time,f.api.inspect().duration);assert.equal(f.api.inspect().playing,false);assert.equal(f.get('step').disabled,true);
 assert.match(f.get('reading-note').textContent,/触地前/);assert.match(f.get('velocity-label').textContent,/触地前速度/);assert.equal(f.get('height-value').textContent,'0.00');assert.equal(f.get('potential-value').textContent,'0.00');
 const globalTime=f.api.inspect().time;f.buttons[1].emit('click');assert.equal(f.api.inspect().selected,'moon');close(f.api.inspect().time,globalTime);assert.equal(f.buttons[1].attributes['aria-pressed'],'true');assert.equal(f.get('time-value').textContent,globalTime.toFixed(2));
 f.input('timeline',0);assert.equal(f.api.inspect().time,0);assert.equal(f.get('velocity-value').textContent,'0.00');assert.equal(f.get('kinetic-value').textContent,'0.00');assert.equal(f.get('potential-value').textContent,f.get('total-value').textContent);
});

test('continuous playback stops exactly at the last landing and reset releases animation work',()=>{
 const f=fixture();f.click('play');f.frame(0);f.frame(100000);close(f.api.inspect().time,f.api.inspect().duration);assert.equal(f.api.inspect().playing,false);assert.equal(f.frames.size,0);assert.match(f.get('status').textContent,/三组均已到达/);
 f.click('play');assert.equal(f.api.inspect().time,0);f.click('reset');assert.equal(f.api.inspect().time,0);assert.equal(f.frames.size,0);
});

test('reduced-motion starts in usable step mode; hidden pages and pagehide stop animation',()=>{
 const f=fixture({reduced:true});assert.equal(f.get('step-mode').checked,true);assert.equal(f.get('play').disabled,true);f.click('play');assert.equal(f.frames.size,0);f.click('step');close(f.api.inspect().time,.1);
 f.get('step-mode').checked=false;f.change('step-mode');f.click('play');assert.equal(f.frames.size,1);f.document.hidden=true;f.documentEvents.visibilitychange();assert.equal(f.api.inspect().playing,false);assert.equal(f.frames.size,0);
 f.click('play');f.windowEvents.pagehide();assert.equal(f.frames.size,0);
});

test('standalone package is small, has no network/storage dependencies and has keyboard labels',()=>{
 assert.ok(Buffer.byteLength(html)<10*1024*1024);assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+(?:stylesheet|preload)|@import\b/i);
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/);
 assert.match(html,/id="timeline"[^>]+type="range"/);assert.match(html,/<label[^>]+for="height-number"/);assert.match(html,/<label[^>]+for="mass-number"/);assert.match(html,/prefers-reduced-motion/);assert.match(html,/MIT License/);
 const f=fixture();f.click('theme');assert.equal(f.document.documentElement.dataset.theme,'dark');assert.equal(f.get('theme').attributes['aria-pressed'],'true');f.click('theme');assert.equal(f.document.documentElement.dataset.theme,'light');
});
