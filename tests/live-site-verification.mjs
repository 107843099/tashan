import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyLiveSite} from '../scripts/verify-live-site.mjs';

test('encoded API paths accept anonymous 401 JSON while rejecting HTML fallback and unavailable services',async()=>{
  const origin='https://fixture.account.workers.dev';
  const path='/api/v1/%73tatus';
  for(const [status,type,expected] of [
    [401,'application/json',true],
    [200,'application/json',true],
    [401,'text/html',false],
    [200,'text/html',false],
    [503,'application/json',false],
  ]) {
    const report=await verifyLiveSite(origin,{fetch:async(url,options)=>{
      assert.equal(new URL(url).origin,origin);
      assert(['GET','HEAD'].includes(options.method));
      assert.equal(options.credentials,'omit');
      assert.equal(options.headers.Cookie,undefined);
      assert.equal(options.headers.Authorization,undefined);
      // Other probes are deliberately unavailable: this fixture isolates the
      // observed encoded API response without connecting to any live host.
      if(new URL(url).pathname!==path)return new Response(null,{status:404});
      return new Response(type==='application/json'?JSON.stringify({error:{code:'UNAUTHENTICATED'}}):'<html>fallback</html>',{status,headers:{'Content-Type':type}});
    }});
    const result=report.checks.find(check=>check.name==='API 编码路由 '+path);
    assert(result);
    assert.equal(result.ok,expected,`${status} ${type}`);
  }
});
