import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { fetchIndexTarget } from '../integrations/macos-companion/gateway.mjs';

async function server(t,handler) {
  const instance=createServer(handler);
  await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{instance.closeAllConnections();await new Promise(resolve=>instance.close(resolve));});
  return 'http://127.0.0.1:'+instance.address().port;
}

test('index transport preserves JSON/status/auth and decodes supported compressed responses',async t=>{
  const requests=[];
  const origin=await server(t,(request,response)=>{
    requests.push({headers:request.headers,method:request.method});
    const encoding=request.url.slice(1),body=Buffer.from('{"indexed":true}');
    response.writeHead(201,{'Content-Type':'application/json',...(encoding?{'Content-Encoding':encoding}:{})});
    response.end(encoding==='gzip'?gzipSync(body):encoding==='deflate'?deflateSync(body):encoding==='br'?brotliCompressSync(body):body);
  });
  for(const encoding of ['','gzip','deflate','br']) {
    const response=await fetchIndexTarget(origin+'/'+encoding,{method:'POST',body:'{}',headers:{Authorization:'Bearer fixture-index-key','Content-Type':'application/json'}});
    assert.equal(response.status,201);assert.equal(response.headers.get('content-type'),'application/json');
    assert.deepEqual(await response.json(),{indexed:true});
  }
  assert.ok(requests.every(r=>r.method==='POST'&&r.headers.authorization==='Bearer fixture-index-key'&&r.headers['accept-encoding']==='identity'));
});

test('index transport uses the enclosing abort signal while waiting for headers and consuming a body',async t=>{
  let bodyClosed;
  const closed=new Promise(resolve=>{bodyClosed=resolve;});
  const origin=await server(t,(request,response)=>{
    if(request.url==='/headers')return;
    response.writeHead(200,{'Content-Type':'application/json'});response.write('{');
    response.once('close',bodyClosed);
  });
  await assert.rejects(fetchIndexTarget(origin+'/headers',{signal:AbortSignal.timeout(30)}),{name:'AbortError'});
  const controller=new AbortController(),response=await fetchIndexTarget(origin+'/body',{signal:controller.signal});
  controller.abort();await assert.rejects(response.text());await closed;
});

test('index transport leaves redirects unfollowed and supports bodyless responses',async t=>{
  let trap=0;
  const origin=await server(t,(request,response)=>{
    if(request.url==='/redirect'){response.writeHead(302,{Location:'/trap'});response.end();}
    else if(request.url==='/empty'){response.writeHead(204);response.end();}
    else {trap++;response.end('{}');}
  });
  const redirect=await fetchIndexTarget(origin+'/redirect');
  assert.equal(redirect.status,302);await redirect.body.cancel();assert.equal(trap,0);
  const empty=await fetchIndexTarget(origin+'/empty');assert.equal(empty.status,204);assert.equal(empty.body,null);
});
