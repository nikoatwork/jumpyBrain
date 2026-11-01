// Real keyboard/IME transactions against the shipped source binding and live
// protocol. Repeated bytes deliberately make a snapshot text diff insufficient.
import assert from 'node:assert/strict';
import {writeFile,readFile}from'node:fs/promises';
import path from'node:path';
import WebSocket from'ws';
import {selectEditorText,editorSelection}from'./editor-smoke-helpers.mjs';
import {installCollaborationSmokeTransport}from'./collaboration-smoke-transport.mjs';
export async function runIntentProof({browser,serverUrl,token,root,bundle,errors,shipped=false}){
  const id=shipped?'mem_91111111-1111-4111-8111-111111111114':'mem_91111111-1111-4111-8111-111111111113',file=path.join(root,shipped?'notes/intent-proof-shipped.md':'notes/intent-proof.md');
  await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Positional intent\n---\naaaa`);
  const context=await browser.newContext({bypassCSP:!shipped}),page=await context.newPage();let socket;
  try{
    page.setDefaultTimeout(12_000);page.on('pageerror',error=>errors.push(error.message));const wire=await installCollaborationSmokeTransport(page);
    if(shipped){await page.goto(`${serverUrl}/?note=${id}#apiKey=${token}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');await page.evaluate(()=>{window.live=state.editor.collaboration})}
    else {
    await page.goto(serverUrl+'/health');await page.setContent('<style>#note-panel{height:300px;width:700px;overflow:auto}#note-editor{font:18px/26px monospace;white-space:pre-wrap;min-height:260px}p{margin:0;min-height:26px}</style><div id="note-panel"><div id="note-editor"></div></div>');await page.addScriptTag({content:bundle});
    await page.evaluate(({url,token,id})=>{window.richEditor=ProductionCollaboration.createNoteEditor(document.querySelector('#note-editor'),{onChange(body,intent){live.input(body,intent)},onError(error){throw error}});window.live=ProductionCollaboration.createCollaborationEditor({url:url.replace(/^http/,'ws')+'/ws',token,scope:'actual-positional-intent',documentId:id,clientId:'intent-human',editor:richEditor});live.connect()},{url:serverUrl,token,id});await page.waitForFunction(()=>live.state.status==='saved');
    }
    socket=new WebSocket(serverUrl.replace(/^http/,'ws')+'/ws');const pending=new Map();socket.on('message',data=>{const reply=JSON.parse(data.toString()),request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);reply.ok?request.resolve(reply.result):request.reject(new Error(JSON.stringify(reply.error)))});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
    const rpc=(method,params={})=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params:{documentId:id,clientId:'intent-peer',...params}}))});await rpc('hello',{token,protocol:2});
    const read=()=>rpc('open'),edit=(base,operations,operationId=crypto.randomUUID())=>rpc('edit',{epoch:base.epoch,baseRevision:base.revision,operationId,operations});
    const ready=async snapshot=>{await page.waitForFunction(({revision,body})=>live.state.status==='saved'&&live.snapshot.revision>=revision&&richEditor.getMarkdown()===body,{revision:snapshot.revision,body:snapshot.body})};
    const flush=()=>page.evaluate(()=>Promise.race([live.flush(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Publication barrier timed out: '+JSON.stringify({state:live.state,body:live.body,snapshot:live.snapshot,composing:richEditor.isComposing()}))),5000))]));
    const receipt=async promise=>{let timer;try{const result=await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000)})]);assert.ok(result,'Expected live operation: '+JSON.stringify(await page.evaluate(()=>({body:live.body,state:live.state,source:richEditor.getMarkdown()}))));return result}finally{clearTimeout(timer)}};
    const canonical=async expected=>{assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),expected);assert.equal(await page.evaluate(()=>live.body),expected);assert.equal((await readFile(file,'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,''),expected,'the full canonical body matches positional intent');assert.equal(await page.evaluate(()=>live.state.status),'saved')};
    const reset=async body=>{const before=await read();const changed=await edit(before,[{start:0,deleteCount:before.body.length,insert:body}]);await ready(changed);return changed};
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'first-character deletion');
    // The original P1: actual first-character deletion must not migrate to the
    // last identical byte while the request is held and another actor edits.
    let base=await read();const held=wire.holdNextRequest('edit');await selectEditorText(page,0,1);await page.keyboard.press('Backspace');
    const request=await receipt(held.arrived);assert.deepEqual(request.params.operations,[{start:0,deleteCount:1,insert:''}]);assert.equal(await page.evaluate(()=>live.body),'aaa');await edit(base,[{start:2,deleteCount:0,insert:'X'}]);held.release();await page.waitForFunction(()=>live.state.status==='saved'&&live.snapshot.revision>=2);await canonical('aXaa');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'authoritative prefix/ranges');
    base=await reset('aaaa');const identical=wire.holdNextRequest('edit');await selectEditorText(page,0,1);await page.keyboard.insertText('a');const identicalRequest=await receipt(identical.arrived);assert.deepEqual(identicalRequest.params.operations,[{start:0,deleteCount:1,insert:'a'}],'same-byte human replacement retains its actual origin');await edit(base,[{start:2,deleteCount:0,insert:'X'}]);identical.release();assert.equal(await flush(),true);await canonical('aaXaa');
    // Authoritative prefix insertion moves both caret and range through actual
    // source positions, including the following real input operation.
    base=await reset('aaaa');await selectEditorText(page,2);let changed=await edit(base,[{start:0,deleteCount:0,insert:'a'}]);await ready(changed);assert.deepEqual(await editorSelection(page),[3,3]);await page.keyboard.insertText('Q');assert.equal(await flush(),true);await canonical('aaaQaa');
    for(const backward of[false,true]){
      base=await reset('aaaa');await selectEditorText(page,1,3);if(backward){await page.evaluate(()=>{const selection=getSelection();selection.setBaseAndExtent(selection.focusNode,selection.focusOffset,selection.anchorNode,selection.anchorOffset)});await page.evaluate(()=>new Promise(requestAnimationFrame))}
      changed=await edit(base,[{start:0,deleteCount:0,insert:'a'}]);await ready(changed);assert.deepEqual(await editorSelection(page),backward?[4,2]:[2,4]);await page.keyboard.insertText('R');assert.equal(await flush(),true);await canonical('aaRa');
    }
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'logical equal-byte edit');
    // Equal final bytes do not make the source operation an identity. Removing
    // the first original character and adding a new equal character at the end
    // still moves this caret left by one before the next keystroke.
    base=await reset('aaaa');await selectEditorText(page,2);changed=await edit(base,[{start:0,deleteCount:1,insert:''},{start:4,deleteCount:0,insert:'a'}]);await ready(changed);assert.deepEqual(await editorSelection(page),[1,1]);await page.keyboard.insertText('Q');assert.equal(await flush(),true);await canonical('aQaaa');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'repeated paragraphs');
    // Identical neighboring paragraphs cannot steal the selected occurrence.
    base=await reset('a\n\na\n\na');const paragraph=wire.holdNextRequest('edit');await selectEditorText(page,0,1);await page.keyboard.press('Backspace');const paragraphRequest=await receipt(paragraph.arrived);assert.deepEqual(paragraphRequest.params.operations,[{start:0,deleteCount:2,insert:''}],'the actual removed first paragraph owns its following serialized separator');await edit(base,[{start:3,deleteCount:0,insert:'X'}]);paragraph.release();await page.waitForFunction(()=>live.state.status==='saved'&&live.body.includes('X'));await canonical('\nXa\n\na');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'buffered intent after ACK');
    // Keep an accepted deletion unconfirmed while another actual local input
    // is buffered. Both explicit positions must survive peer rebasing and ACK.
    base=await reset('aaaa');const ack=wire.holdNextReply('edit');await selectEditorText(page,0,1);await page.keyboard.press('Backspace');await receipt(ack.arrived);await selectEditorText(page,1);await page.keyboard.insertText('Q');await edit(base,[{start:2,deleteCount:0,insert:'X'}]);ack.release();assert.equal(await flush(),true);await canonical('aXQaa');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'verified inverse before own ACK');
    // A genuine backend-verified inverse pair can be retired before our held
    // edit arrives. Equal-byte ordinary replacements never get this privilege.
    base=await reset('aaaa');const inverse=wire.holdNextRequest('edit');await selectEditorText(page,0,1);await page.keyboard.press('Backspace');await receipt(inverse.arrived);const replaced=await edit(base,[{start:0,deleteCount:1,insert:'b'}]);await rpc('undo',{epoch:replaced.epoch,operationId:crypto.randomUUID()});inverse.release();assert.equal(await flush(),true);await canonical('aaa');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'stacked IME');
    // Native Chromium IME produces two preedit revisions while a peer inserts
    // an identical prefix. Only committed Japanese text can reach Markdown.
    base=await reset('aaaa');await selectEditorText(page,2);const cdp=await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'に',selectionStart:1,selectionEnd:1});await cdp.send('Input.imeSetComposition',{text:'日本',selectionStart:2,selectionEnd:2});await page.waitForFunction(()=>richEditor.isComposing()&&live.body==='aa日本aa');assert.equal(await flush(),false);
    await edit(base,[{start:0,deleteCount:0,insert:'a'}]);assert.ok(!(await readFile(file,'utf8')).includes('日本'),'stacked preedit stays private');await cdp.send('Input.insertText',{text:'日本語'});await page.waitForFunction(()=>!richEditor.isComposing());assert.equal(await flush(),true);await canonical('aaa日本語aa');await cdp.detach();
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'Markdown shortcuts, task editing, slash command and paste');
    await reset('');await page.locator('#note-editor').click();await page.keyboard.type('# Heading');await page.keyboard.press('Enter');await page.keyboard.type('- [ ] Task');await page.keyboard.press('Enter');await page.keyboard.type('Second');assert.equal(await flush(),true);await canonical('# Heading\n- [ ] Task\n- [ ] Second');
    await page.keyboard.press('Enter');await page.keyboard.press('Backspace');await page.keyboard.type('Tail');assert.equal(await flush(),true);await canonical('# Heading\n- [ ] Task\n- [ ] SecondTail');
    await page.locator('#note-editor').evaluate(element=>{const target=element.querySelector('.markdown-task > span'),text=document.createTreeWalker(target,NodeFilter.SHOW_TEXT).nextNode();element.focus();getSelection().setBaseAndExtent(text,0,text,4)});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>richEditor.format('bold'));assert.equal(await flush(),true);await canonical('# Heading\n- [ ] **Task**\n- [ ] SecondTail');
    await reset('');await page.locator('#note-editor').click();await page.evaluate(()=>richEditor.format('bold'));await page.keyboard.type('/h1');await page.getByRole('listbox',{name:'Formatting commands'}).waitFor({state:'visible'});await page.keyboard.press('Enter');await page.keyboard.type('Chosen');assert.equal(await flush(),true);await canonical('# Chosen');
    await page.locator('#note-editor').evaluate(element=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain','\n\nPasted **bold**');element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}))});assert.equal(await flush(),true);await canonical('# Chosen\n\nPasted **bold**');
    await reset('');await page.locator('#note-editor').click();await page.keyboard.type('*');assert.equal(await flush(),true);await canonical('\\*');
    const escaped=wire.holdNextRequest('edit');await selectEditorText(page,0);await page.keyboard.insertText('*');const escapedRequest=await receipt(escaped.arrived);assert.deepEqual(escapedRequest.params.operations,[{start:0,deleteCount:0,insert:'\\*'}],'an escaped glyph owns its escape prefix; insertion never splits that origin');escaped.release();assert.equal(await flush(),true);await canonical('\\*\\*');
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'missing history');
    // A gap with unavailable exact history cannot become a guessed caret or a
    // silently published edit. Retain the private source and require recovery.
    base=await reset('aaaa');await selectEditorText(page,2);wire.rejectNext('history.read',{code:'history_expired',message:'The exact source history expired.'});const missedId=crypto.randomUUID(),missed=wire.holdNextEvent(id,snapshot=>snapshot.operation?.operationId===missedId);changed=await edit(base,[{start:0,deleteCount:0,insert:'a'}],missedId);await receipt(missed.arrived);const latest=await edit(changed,[{start:0,deleteCount:0,insert:'a'}]);await page.waitForFunction(()=>live.state.status==='conflict');missed.release();await page.keyboard.insertText('Private Q');assert.equal(await flush(),false);assert.equal((await readFile(file,'utf8')).endsWith('\n---\n'+latest.body),true);assert.match(await page.evaluate(()=>live.state.message),/history expired/);assert.equal(await page.evaluate(()=>live.resolveConflict('saved')),true);
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'ambiguous raw position and recovery presence');
    for(const position of [2,0]){
      base=await reset('aaaa');await selectEditorText(page,position);const beforePresence=wire.observed.length;
      const raw=(await readFile(file,'utf8')).replace(/^(---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$))[\s\S]*$/,'$1'+'aaaaa');await writeFile(file,raw);
      await page.waitForFunction(()=>live.state.status==='conflict');await page.keyboard.insertText('Private Q');assert.equal(await flush(),false);assert.equal((await readFile(file,'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,''),'aaaaa','unprovable raw-origin caret never publishes its next private keystroke');
      const revision=await page.evaluate(()=>live.snapshot.revision),deadline=Date.now()+5000;
      while(!wire.observed.slice(beforePresence).some(frame=>frame.method==='presence'&&frame.params.baseRevision===revision)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
      const reported=wire.observed.slice(beforePresence).findLast(frame=>frame.method==='presence'&&frame.params.baseRevision===revision);assert.ok(reported,'recovery reports its new read revision');assert.equal(reported.params.selection,undefined,'private old-source coordinates cannot be relabeled as the canonical revision');
      await page.waitForFunction(()=>live.snapshot.presence?.find(peer=>peer.clientId===live.clientId)?.anchor===undefined);assert.equal(await page.evaluate(()=>live.resolveConflict('saved')),true);
    }
    console.log((shipped?'Shipped positional intent: ':'Positional intent: ')+ 'eight labels');
    // Eight names at one source coordinate remain individually legible and
    // clipped. Marker rectangles themselves stay at the actual caret.
    // Finish the live transport cases before installing this fixed geometry
    // fixture. A late real presence packet must not replace its synthetic peers.
    await page.evaluate(()=>{live.dispose();richEditor.setCollaborativePresence(Array.from({length:8},(_,index)=>({actor:JSON.stringify(['person-'+index,'tab-'+index]),principalId:'person-'+index,clientId:'tab-'+index,name:'Person '+index,kind:index===7?'agent':'human',activity:'editing',anchor:2,focus:2}))) });
    const measureLabels=async()=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      // Resolve current elements and the clipping viewport atomically: retained
      // locator handles may refer to labels replaced by a layout-frame render.
      const captured=await page.evaluate(()=>{const box=document.querySelector('#note-panel').getBoundingClientRect();return {panel:{x:box.x,y:box.y,width:box.width,height:box.height},labels:[...document.querySelectorAll('[data-collaboration-label]')].filter(node=>node.getClientRects().length&&getComputedStyle(node).display!=='none').map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})}});
      const {labels,panel:bounds}=captured;assert.equal(labels.length,8,JSON.stringify({shipped,captured}));
      for(const label of labels){assert.ok(label.right>label.x&&label.bottom>label.y,'each participant label has positive geometry');assert.ok(label.x>=bounds.x&&label.right<=bounds.x+bounds.width&&label.y>=bounds.y&&label.bottom<=bounds.y+bounds.height,JSON.stringify({shipped,label,captured}));for(const other of labels)if(label!==other)assert.ok(label.right<=other.x||other.right<=label.x||label.bottom<=other.y||other.bottom<=label.y,'co-located labels do not overlap')}
    };
    await measureLabels();const viewport=page.viewportSize();await page.setViewportSize({width:viewport.width,height:viewport.height+40});await measureLabels();await page.setViewportSize(viewport);

  }finally{socket?.close();await context.close()}
}

export async function runRestartIntentProof({browser,root,token,startServer,errors}){
  const id='mem_91111111-1111-4111-8111-111111111115',file=path.join(root,'notes/epoch-proof.md'),prefix=`---\nid: ${id}\ntype: note\ntitle: Restarted source\n---\n`;
  await writeFile(file,prefix+'aaaa');const context=await browser.newContext(),page=await context.newPage();let backend;
  try{
    page.setDefaultTimeout(15_000);page.on('pageerror',error=>errors.push(error.message));backend=await startServer(0);const url=backend.url,port=Number(new URL(url).port);
    await page.goto(`${url}/?note=${id}#apiKey=${token}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');await selectEditorText(page,2);
    const beforeEpoch=await page.evaluate(()=>state.editor.collaboration.snapshot.epoch);await backend.close();backend=undefined;
    await page.waitForFunction(()=>['offline','connecting'].includes(state.editor.collaboration.state.status));await writeFile(file,prefix+'aaaaa');backend=await startServer(port);
    await page.waitForFunction(()=>state.editor.collaboration.state.status==='conflict');assert.notEqual(await page.evaluate(()=>state.editor.collaboration.snapshot.epoch),beforeEpoch);
    assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),'aaaa','unknown restart history cannot retarget the old active caret');assert.deepEqual(await editorSelection(page),[2,2]);
    await page.keyboard.insertText('Q');assert.equal(await page.evaluate(()=>state.editor.flush()),false);assert.equal(await readFile(file,'utf8'),prefix+'aaaaa','the first post-restart private keystroke never reaches the new canonical source');
    assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),'aaQaa');assert.equal(await page.evaluate(()=>state.editor.collaboration.state.durableDraft),true);
    await page.locator('#note-recover').click();await page.waitForFunction(()=>document.getElementById('recovery-saved').value.endsWith('aaaaa'));assert.ok((await page.locator('#recovery-draft').inputValue()).endsWith('aaQaa'));
    await page.locator('#recovery-reload').click();await page.waitForFunction(()=>!document.getElementById('document-recovery').open&&state.editor.collaboration.state.status==='saved');assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),'aaaaa');assert.equal(await readFile(file,'utf8'),prefix+'aaaaa');
    console.log('Shipped positional intent: changed-source restart requires explicit recovery');
  }finally{await context.close();await backend?.close()}
}
