import assert from 'node:assert/strict';
import test from 'node:test';
import {createCollaborationEditor} from '../dist/adapters/http-server/collaboration-editor.js';
import {createCollaborationDraftStore} from '../dist/adapters/http-server/collaboration-drafts.js';

// A server may coalesce revisions. The latest actor alone cannot classify the
// whole change; this fixture supplies the actual source-operation history.
test('external feedback uses complete actor history and ignores content-free checkpoints',async()=>{
  const previous=globalThis.WebSocket,events=[],history=[],frames=[];let socket,body='base';
  const own=JSON.stringify(['principal','this-tab']),otherTab=JSON.stringify(['principal','other-tab']);
  let canonical={documentId:'note',epoch:'epoch',revision:0,body,title:'Title',prefix:'',contentHash:'hash-0',saved:true};
  class Socket{
    static CONNECTING=0;static OPEN=1;readyState=0;bufferedAmount=0;
    constructor(){socket=this;queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
    send(raw){const frame=JSON.parse(raw);frames.push(frame);
      const result=frame.method==='hello'?{protocol:2,principal:{id:'principal',role:'writer'}}:frame.method==='history.read'?{...frame.params,operations:history.filter(operation=>operation.revision>frame.params.fromRevision&&operation.revision<=frame.params.toRevision)}:canonical;
      queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:frame.id,ok:true,result})}));
    }
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  globalThis.WebSocket=Socket;let editor;
  function revise(actor,{title=canonical.title,insert=''}={}){
    const revision=canonical.revision+1,splices=insert?[{start:canonical.body.length,deleteCount:0,insert}]:[];
    const operation={revision,actor,operationId:'operation-'+revision,splices,start:canonical.body.length,deleteCount:0};history.push(operation);
    canonical={...canonical,revision,title,body:canonical.body+insert,contentHash:'hash-'+revision,operation};
  }
  async function publish(expected,label){socket.onmessage?.({data:JSON.stringify({event:'document',documentId:'note',snapshot:canonical})});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(editor.state.status,'saved',label);assert.equal(body,canonical.body,label);assert.equal(events.at(-1).remote,expected,label);}
  try{
    editor=createCollaborationEditor({url:'ws://localhost/ws',scope:'origin-feedback',documentId:'note',clientId:'this-tab',drafts:createCollaborationDraftStore({length:0,getItem(){return null;},setItem(){},removeItem(){},key(){return null;}}),editor:{getMarkdown:()=>body,applyCollaborativeMarkdown(next){body=next;return{status:'applied'};}},onSnapshot:(_snapshot,view)=>events.push(view)});
    editor.connect();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(events.at(-1).remote,false,'initial hydration');
    revise(own,{title:'My rename'});await publish(false,'own title checkpoint');
    revise(otherTab,{title:'Other tab rename'});await publish(true,'same principal in another tab');
    revise(otherTab);await publish(false,'unchanged title/body checkpoint');
    revise(otherTab,{insert:' foreign'});revise(own,{insert:' own'});await publish(true,'foreign revision followed by own receipt');
    assert.ok(frames.some(frame=>frame.method==='history.read'),'coalesced history is validated');
    revise(own,{insert:' first'});revise(own,{title:'My second rename'});await publish(false,'coalesced own history');
    revise('',{insert:' unknown writer'});await publish(true,'unknown actor is not assumed to be our edit');
    await publish(false,'repeated snapshot');
  }finally{editor?.dispose();globalThis.WebSocket=previous;}
});
