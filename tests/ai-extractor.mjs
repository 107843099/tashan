import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({window:{},DOMException});
vm.runInContext(readFileSync(new URL('../assets/js/ai-extractor.js',import.meta.url),'utf8'),context);
const extract=context.window.TashanAIExtract.extract;
test('HTML extracts teaching text without scripts, styles, attributes or resource loads',async()=>{
 const source='<html><head><title>地球公转</title><style>secret-style</style></head><body><h1>四季与昼夜</h1><script>fetch("https://secret.test")</script><img src="https://image.test" onerror="private()"><!--hidden--><p>预测 &amp; 观察 &#x56DB;&#23395;</p><svg><text>internal</text></svg></body></html>';
 const result=await extract(new File([source],'project.html'));assert.match(result.text,/地球公转.*四季与昼夜.*预测 & 观察 四季/);assert.doesNotMatch(result.text,/secret|https|private|hidden|internal/);assert.equal(result.supported,true);
});
test('unclosed scripts never become teaching context',async()=>{assert.equal((await extract(new File(['<h1>课堂</h1><script>secret'], 'broken.html'))).text,'课堂');});
test('quoted angle brackets and lookalike closing tags cannot leak attributes or script text',async()=>{
 const source='<div title="label > PRIVATE-ATTRIBUTE">课堂目标</div><script>const marker="</scripture>"; const value="PRIVATE-SCRIPT";</script><p>观察并解释</p>';
 const result=await extract(new File([source],'quoted.html'));assert.equal(result.text,'课堂目标 观察并解释');assert.doesNotMatch(result.text,/PRIVATE|marker|const/);
});
test('large text is bounded and marked as partial, unsupported binary is never read',async()=>{
 const result=await extract(new File(['a'.repeat(10000)],'prompt.md'));assert.equal(result.text.length,6000);assert.equal(result.truncated,true);
 const binary={name:'project.zip',size:100,slice(){assert.fail('Unsupported binary must not be read');}};assert.equal((await extract(binary)).supported,false);
});
test('cancellation before and after reading cannot produce context for replacement file',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(extract(new File(['abc'],'file.txt'),{signal:controller.signal}),{name:'AbortError'});
 const next=new AbortController();const file={size:10,name:'file.txt',slice:()=>({text:async()=>{next.abort();return 'abc';}})};await assert.rejects(extract(file,{signal:next.signal}),{name:'AbortError'});
});
test('10 MiB max is enforced before reading and binary controls are removed',async()=>{
 await assert.rejects(extract({size:10485761,name:'large.html',slice(){assert.fail('Oversized file read');}}),{code:'FILE_TOO_LARGE'});
 assert.equal((await extract(new File(['a\0b\u0005c'],'data.json'))).text,'a b c');
});
