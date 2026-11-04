import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import{createServer}from'node:http';
import{WebSocket}from'ws';import{initializeMemoryRoot}from'../dist/runtime/index.js';
import{createCollaborationHub}from'../dist/app/collaboration/index.js';import{createLiveServer}from'../dist/adapters/live/index.js';
import{createCollaborationEditor}from'../dist/adapters/http-server/collaboration-editor.js';import{createCollaborationDraftStore}from'../dist/adapters/http-server/collaboration-drafts.js';
const documentId='mem_47770000-1111-4111-8111-111111111111';
async function until(check){const deadline=Date.now()+5000;while(!check()){assert.ok(Date.now()<deadline,'wire evidence did not arrive');await new Promise(resolve=>setTimeout(resolve,5));}}
async function connect(url,token,clientId){const socket=new WebSocket(url),events=[],pending=new Map();let next=0;socket.on('message',raw=>{const packet=JSON.parse(String(raw));if(packet.id&&pending.has(packet.id)){const{resolve,reject}=pending.get(packet.id);pending.delete(packet.id);packet.ok?resolve(packet.result):reject(Object.assign(new Error(packet.error.message),packet.error));}else events.push(packet);});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=String(++next);pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params:{documentId,clientId,...params}}));});await rpc('hello',{token,protocol:2});return{socket,events,rpc};}

test('retiring 32 streams sends one source snapshot plus bounded scoped notices to readers',{timeout:15000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'jb-stream-notices-'));await initializeMemoryRoot(root);
 const body='Retained canonical text.\n'+'x'.repeat(64000),file=path.join(root,'notes/fixture.md'),content=`---\nid: ${documentId}\ntype: note\ntitle: Retirement notices\n---\n${body}`;await writeFile(file,content);
 const owner={id:'producer-principal',name:'Producer',role:'writer'},reader={id:'reader-principal',name:'Reader',role:'reader'};
 const hub=createCollaborationHub({root,observeIntervalMs:0,quietMs:0}),server=createServer((_request,response)=>response.end('fixture'));
 const live=createLiveServer({server,hub,authenticate:async token=>token==='producer'?owner:token==='reader'?reader:undefined});
 const sockets=[];t.after(async()=>{for(const socket of sockets)socket.terminate();await live.close();await hub.close();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`ws://127.0.0.1:${server.address().port}/ws`;
 const view=await connect(url,'reader','reader-tab'),producer=await connect(url,'producer','producer');sockets.push(view.socket,producer.socket);
 const base=await view.rpc('open');await producer.rpc('open');
 for(let i=0;i<32;i++)await producer.rpc('stream.start',{epoch:base.epoch,baseRevision:base.revision,streamId:'stream-'+i,start:body.length,actorKind:'agent'});
 await until(()=>view.events.filter(event=>event.snapshot?.stream?.state==='active').length===32);view.events.length=0;
 owner.role='reader';await hub.revokePrincipal(owner.id);
 await until(()=>view.events.filter(event=>event.event==='stream').length===32);
 const documents=view.events.filter(event=>event.event==='document'),notices=view.events.filter(event=>event.event==='stream');
 assert.equal(documents.length,1,'the large canonical source is not copied for every retired stream');assert.equal(documents[0].snapshot.body,body);
 assert.equal(new Set(notices.map(event=>event.stream.streamId)).size,32);
 for(const event of notices){assert.equal(event.documentId,documentId);assert.equal(event.epoch,base.epoch);assert.equal(event.saved,true);assert.equal(event.stream.actor,JSON.stringify([owner.id,'producer']));assert.equal(event.stream.state,'cancelled');assert.equal(event.stream.reason,'authorization_revoked');assert.ok(Buffer.byteLength(JSON.stringify(event))<1024);assert.deepEqual(Object.keys(event.stream).sort(),['actor','reason','sequence','state','streamId']);}
 assert.equal(await readFile(file,'utf8'),content,'retirement does not republish Markdown');
 await hub.revokePrincipal(owner.id);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(view.events.filter(event=>event.event==='stream').length,32,'retired notices do not replay');
 await assert.rejects(view.rpc('stream.cancel',{epoch:base.epoch,streamId:'stream-0'}),error=>error.code==='forbidden');
});

test('metadata stream notices are scoped and never become canonical snapshots',async()=>{
 const previous=globalThis.WebSocket;let socket,body='Saved body',role='reader';const streams=[],snapshots=[];
 const canonical={documentId,epoch:'epoch',revision:0,title:'Note',body,contentHash:'hash',saved:true};
 class Socket{static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;constructor(){socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}send(raw){const frame=JSON.parse(raw),result=frame.method==='hello'?{protocol:2,principal:{id:'reader',role}}:canonical;queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result})}));}close(){this.readyState=3;this.onclose?.({code:1000});}}
 globalThis.WebSocket=Socket;let editor;const send=value=>socket.onmessage?.({data:JSON.stringify(value)});
 try{
  const options={url:'ws://localhost/ws',scope:'stream-notice-scope',documentId,clientId:'viewer',drafts:createCollaborationDraftStore({length:0,getItem(){return null;},setItem(){},removeItem(){},key(){return null;}}),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(value){body=value;return{status:'applied'};}},onStream:event=>streams.push(event),onSnapshot:event=>snapshots.push(event)};editor=createCollaborationEditor(options);editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
  const count=snapshots.length,notice={event:'stream',documentId,epoch:'epoch',saved:true,stream:{actor:'agent',streamId:'s',sequence:1,state:'cancelled',reason:'lease_expired'}};
  for(const invalid of [{...notice,documentId:'other'},{...notice,epoch:'other'},{...notice,saved:'true'}])send(invalid);
  assert.equal(streams.length,0);send(notice);assert.equal(streams.length,1);assert.equal(snapshots.length,count);assert.equal(body,'Saved body');assert.equal(editor.state.status,'readonly');assert.equal(editor.state.dirty,false);
  editor.dispose();send(notice);assert.equal(streams.length,1);
  role='writer';editor=createCollaborationEditor({...options,scope:'stream-notice-private-draft',clientId:'writer'});editor.connect();await new Promise(resolve=>setTimeout(resolve,0));
  body='Saved body plus private';editor.input(body,{before:'Saved body',after:body,operations:[{start:10,deleteCount:0,insert:' plus private'}]});
  const beforeNotice=snapshots.length;send(notice);assert.equal(editor.body,'Saved body plus private');assert.equal(editor.snapshot.body,'Saved body');assert.equal(editor.state.dirty,true,'a saved stream notice cannot confirm a private human draft');assert.equal(snapshots.length,beforeNotice);
 }finally{editor?.dispose();globalThis.WebSocket=previous;}
});
