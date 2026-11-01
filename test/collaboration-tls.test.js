import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto';
import { createServer as httpsServer, request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { initializeMemoryRoot } from '../dist/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { AccessStore } from '../dist/adapters/access-control/index.js';

const documentId='mem_12345678-1234-1234-1234-123456789abc';
// Ephemeral self-signed local CA/server certificate: no openssl dependency,
// checked into neither fixtures nor evidence, and never disable TLS verification.
function certificate() {
  const der=(tag,...parts)=>{const body=Buffer.concat(parts.map(part=>Buffer.isBuffer(part)?part:Buffer.from(part)));const length=body.length<128?Buffer.from([body.length]):(()=>{let hex=body.length.toString(16);if(hex.length%2)hex='0'+hex;const bytes=Buffer.from(hex,'hex');return Buffer.concat([Buffer.from([0x80|bytes.length]),bytes]);})();return Buffer.concat([Buffer.from([tag]),length,body]);};
  const seq=(...parts)=>der(0x30,...parts),oid=hex=>der(0x06,Buffer.from(hex,'hex')),integer=bytes=>der(0x02,bytes),bool=der(0x01,Buffer.from([0xff]));
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const algorithm=seq(oid('2a864886f70d01010b'),der(0x05));
  const name=seq(der(0x31,seq(oid('550403'),der(0x0c,Buffer.from('jumpyBrain disposable test CA')))));
  const time=offset=>der(0x17,Buffer.from(new Date(Date.now()+offset).toISOString().slice(2,19).replace(/[-:T]/g,'')+'Z'));
  const extensions=der(0xa3,seq(seq(oid('551d13'),bool,der(0x04,seq(bool))),seq(oid('551d11'),der(0x04,seq(der(0x82,Buffer.from('localhost')),der(0x87,Buffer.from([127,0,0,1])))))));
  const serial=randomBytes(16);serial[0]|=0x80;
  const tbs=seq(der(0xa0,integer(Buffer.from([2]))),integer(Buffer.concat([Buffer.from([0]),serial])),algorithm,name,seq(time(-86400000),time(86400000)),name,publicKey.export({type:'spki',format:'der'}),extensions);
  const bytes=seq(tbs,algorithm,der(0x03,Buffer.from([0]),sign('RSA-SHA256',tbs,privateKey)));
  const cert='-----BEGIN CERTIFICATE-----\n'+bytes.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n';
  const parsed=new X509Certificate(cert);assert.equal(parsed.verify(publicKey),true);assert.equal(parsed.checkIP('127.0.0.1'),'127.0.0.1');
  return {cert,key:privateKey.export({type:'pkcs8',format:'pem'})};
}
async function fixture(t) {
  const tls=certificate();
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jumpybrain-tls-')));await initializeMemoryRoot(root);
  const file=path.join(root,'notes','live.md');await writeFile(file,`---\nid: ${documentId}\ntype: note\ntitle: TLS\n---\nbase\n`);
  const access=new AccessStore(root),reader=await access.issue({name:'TLS reader',role:'reader'}),writer=await access.issue({name:'TLS writer',role:'writer'});
  let backend=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,autoIndex:false,port:0});
  const sockets=new Set(),clients=[];
  const proxy=httpsServer(tls,(request,response)=>{
    const upstream=httpRequest(new URL(request.url,backend.url),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
    upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end();});request.on('aborted',()=>upstream.destroy());request.pipe(upstream);
  });
  proxy.on('tlsClientError',()=>{});
  proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  proxy.on('upgrade',(request,downstream,head)=>{
    const target=new URL(backend.url),upstream=tcpConnect(Number(target.port),target.hostname,()=>{
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${request.rawHeaders.map((value,index)=>index%2?value+'\r\n':value+': ').join('')}\r\n`);
      if(head.length)upstream.write(head);downstream.pipe(upstream);upstream.pipe(downstream);
    });upstream.on('error',()=>downstream.destroy());downstream.on('error',()=>upstream.destroy());downstream.on('close',()=>upstream.destroy());
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');const origin=`https://127.0.0.1:${proxy.address().port}`;
  t.after(async()=>{clients.forEach(client=>client.terminate());sockets.forEach(socket=>socket.destroy());await new Promise(resolve=>proxy.close(resolve));await backend.close();access.close();await rm(root,{recursive:true,force:true});});
  function https(route,token,{method='GET',body,trust=true}={}) {return new Promise((resolve,reject)=>{const request=httpsRequest(origin+route,{method,ca:trust?tls.cert:undefined,rejectUnauthorized:true,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})}},response=>{let bytes='';response.on('data',chunk=>{bytes+=chunk;});response.on('end',()=>resolve({status:response.statusCode,body:bytes?JSON.parse(bytes):null}));});request.setTimeout(3000,()=>request.destroy(new Error('HTTPS request timed out.')));request.on('error',reject);request.end(body?JSON.stringify(body):undefined);});}
  async function client(token) {
    const socket=new WebSocket(origin.replace(/^https:/,'wss:')+'/ws',{ca:tls.cert,rejectUnauthorized:true,headers:{Origin:origin}});clients.push(socket);await once(socket,'open');
    let serial=0;const pending=new Map(),events=[];
    socket.on('message',data=>{const packet=JSON.parse(data.toString());if(packet.event){events.push(packet);return;}const waiter=pending.get(packet.id);if(waiter){pending.delete(packet.id);clearTimeout(waiter.timer);waiter.resolve(packet);}});
    socket.on('close',()=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(new Error('TLS connection lost.'));}pending.clear();});
    const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=String(++serial),timer=setTimeout(()=>{pending.delete(id);reject(new Error('TLS RPC timed out.'));},3000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    assert.equal((await rpc('hello',{token,protocol:2})).ok,true);return {socket,rpc,events};
  }
  return {root,file,reader,writer,access,origin,https,client,async restart(){await backend.close();backend=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,autoIndex:false,port:0});},drop(){sockets.forEach(socket=>socket.destroy());}};
}
const opening=clientId=>({documentId,clientId});
const patch=(snapshot,clientId,id,insert)=>({...opening(clientId),epoch:snapshot.epoch,baseRevision:snapshot.revision,operationId:id,start:0,deleteCount:0,insert});
test('HTTPS/WSS proxy verifies explicit CA, enforces reader/writer roles and revocation across both transports',{timeout:15000},async t=>{
  const f=await fixture(t);
  await assert.rejects(f.https('/capabilities',f.reader.token,{trust:false}),error=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code));
  assert.equal((await f.https('/capabilities',f.reader.token)).body.principal.role,'reader');
  assert.equal((await f.https('/memories/all/notes',f.reader.token,{method:'POST',body:{title:'Forbidden'}})).status,403);
  const reader=await f.client(f.reader.token),writer=await f.client(f.writer.token),snapshot=(await reader.rpc('open',opening('reader'))).result;
  assert.equal((await reader.rpc('edit',patch(snapshot,'reader','blocked','R'))).error.code,'forbidden');
  const base=(await writer.rpc('open',opening('writer'))).result,saved=await writer.rpc('edit',patch(base,'writer','writer-edit','W'));
  assert.equal(saved.ok,true);assert.equal(saved.result.saved,true);assert.ok((await readFile(f.file,'utf8')).endsWith('Wbase\n'));
  const closed=once(reader.socket,'close');await new AccessStore(f.root).revoke(f.reader.credential.id);assert.equal((await closed)[0],1008);
  assert.equal((await f.https('/capabilities',f.reader.token)).status,401);assert.equal((await f.https('/capabilities',f.writer.token)).status,200);
  assert.equal((await readFile(path.join(f.root,'.jumpybrain/access.json'),'utf8')).includes(f.writer.token),false);
});
test('TLS network loss and backend restart retain acknowledged streams and reject stale epoch replay',{timeout:15000},async t=>{
  const f=await fixture(t),first=await f.client(f.writer.token),initial=(await first.rpc('open',opening('agent'))).result;
  assert.equal((await first.rpc('stream.start',{...opening('agent'),epoch:initial.epoch,baseRevision:initial.revision,streamId:'tls-stream',start:4})).ok,true);
  const chunk=await first.rpc('stream.chunk',{...opening('agent'),epoch:initial.epoch,streamId:'tls-stream',sequence:0,insert:' streamed'});assert.equal(chunk.ok,true);assert.equal(chunk.result.saved,true);
  const durable=await readFile(f.file,'utf8'),closed=once(first.socket,'close');f.drop();await closed;
  const reconnected=await f.client(f.writer.token),opened=(await reconnected.rpc('open',opening('new-agent'))).result;assert.equal(opened.body,'base streamed\n');
  await f.restart();
  const after=await f.client(f.writer.token),reopened=(await after.rpc('open',opening('after-restart'))).result;assert.notEqual(reopened.epoch,initial.epoch);assert.equal(reopened.body,'base streamed\n');
  const stale=await after.rpc('stream.chunk',{...opening('after-restart'),epoch:initial.epoch,streamId:'tls-stream',sequence:1,insert:' must not replay'});assert.equal(stale.error.code,'epoch_changed');
  assert.equal(await readFile(f.file,'utf8'),durable);assert.equal((await f.https('/capabilities',f.writer.token)).status,200);
});
