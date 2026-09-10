import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function showcase(){
  const window={matchMedia:()=>({matches:false})};
  vm.runInNewContext(readFileSync(new URL('../assets/js/project-showcase.js',import.meta.url),'utf8'),{window});
  return window.PracticeShowcase;
}
const helpers={e:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),t:value=>value,local:value=>value['zh-CN']||value,projectURL:id=>'#project/'+id};

test('showcase prioritizes its main image and gives the small preview responsive display files',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../data/generated/catalog.json',import.meta.url),'utf8'));
  const html=showcase().markup(catalog.projects,helpers),images=[...html.matchAll(/<img\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(images.length,2);assert.match(images[0],/fetchpriority="high"/);assert.match(images[1],/fetchpriority="low"/);
  for(const image of images)assert.match(image,/decoding="async"/);
  for(const width of [320,640,960])assert(images[1].includes(`dynasty-example-${width}.webp ${width}w`));
  assert.match(images[1],/sizes="\(max-width: 640px\) 22vw/);
  assert.doesNotMatch(images[1],/dynasty-example\.png/,'The initial small preview must not fetch the multi-megabyte download');
});

test('projects without generated variants keep their existing cover URL',()=>{
  const projects=['earth','dynasty'].map(id=>({id,kind:'visual',cover:'blob:'+id,title:id,subject:'Test'}));
  const html=showcase().markup(projects,helpers);
  assert.match(html,/src="blob:earth"/);assert.match(html,/src="blob:dynasty"/);
  assert.doesNotMatch(html,/srcset=|undefined/);
});
