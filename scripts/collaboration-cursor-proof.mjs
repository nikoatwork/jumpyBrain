// Assertions shared by the production browser gate. No fake editor or server.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { selectEditorText, editorSelection, appendEditorText } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";

async function selectLeaf(page, selector, anchor, focus = anchor) {
  await page.locator(selector).evaluate((element, {anchor,focus}) => {
    const editor = document.querySelector("#note-editor"); editor.focus({preventScroll:true});
    const walker = document.createTreeWalker(element,NodeFilter.SHOW_TEXT), text = walker.nextNode();
    if (!text) throw new Error("Expected actual editable text");
    getSelection().setBaseAndExtent(text,anchor,text,focus);
  },{anchor,focus});
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function geometry(page, selector, position) {
  return page.locator(selector).evaluate((element,position) => {
    const walker = document.createTreeWalker(element,NodeFilter.SHOW_TEXT), text = walker.nextNode();
    const range = document.createRange(); range.setStart(text,position); range.collapse(true);
    const r = [...range.getClientRects()].find(rect=>rect.height>0);
    return r && {left:r.left,top:r.top,bottom:r.bottom};
  },position);
}
async function assertCursor(page, rawOffset, selector, visibleOffset) {
  await page.evaluate(rawOffset=>richEditor.setCollaborativePresence([{actor:'["alice","one-tab"]',principalId:"alice",clientId:"one-tab",name:"Alice",kind:"human",anchor:rawOffset,focus:rawOffset}]),rawOffset);
  // Source hydration can still settle selection/scroll layout on the next frame.
  // Wait for its actual cursor before comparing the exact coordinates.
  await page.locator('[data-collaboration-actor]').first().waitFor({state:"visible"});
  const expected = await geometry(page,selector,visibleOffset);
  const mark = await page.locator('[data-collaboration-actor]').first().boundingBox();
  assert.ok(expected && mark, `visible marker for ${selector} at source ${rawOffset}`);
  assert.ok(Math.abs(expected.left-mark.x)<2, `exact horizontal caret: ${JSON.stringify({selector,expected,mark})}`);
  assert.ok(Math.abs(expected.top-mark.y)<2, `exact vertical caret: ${JSON.stringify({selector,expected,mark})}`);
  assert.equal(await page.locator('[data-collaboration-label]').count(),1);
}
async function runInactiveSelectionProof(page) {
  await page.evaluate(()=>{
    const surface=document.createElement('div');surface.id='inactive-selection-editor';document.body.append(surface);
    const dialog=document.createElement('dialog'),field=document.createElement('textarea');dialog.id='inactive-selection-dialog';field.id='inactive-comparison-field';field.readOnly=true;field.value='Comparison text stays selected';dialog.append(field);document.body.append(dialog);
    window.inactiveErrors=[];window.inactiveEditor=ProductionCollaboration.createNoteEditor(surface,{onChange(){},onError(error){inactiveErrors.push(error.message)}});
  });
  const select=async(body,offset)=>{
    await page.evaluate(body=>inactiveEditor.setMarkdown(body,true),body);
    await page.locator('#inactive-selection-editor').evaluate((surface,offset)=>{surface.focus();const text=document.createTreeWalker(surface,NodeFilter.SHOW_TEXT).nextNode();getSelection().setBaseAndExtent(text,offset,text,offset)},offset);
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  };
  try{
    // A caret stays before text inserted at its position, so one resting
    // before the whole uncertain range has the same place in every alignment.
    await select('aaaa',0);
    const before=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('aaaaa',{operationSequence:[[{start:0,deleteCount:4,insert:'aaaaa',ambiguous:true}]]}));
    assert.equal(before.status,'applied',before.reason);assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'aaaaa');
    assert.notEqual(await page.evaluate(()=>inactiveEditor.captureSelection()),null,'a caret before the uncertain range keeps its proven position');
    for(const offset of [2]){
      await select('aaaa',offset);
      const result=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('aaaaa',{operationSequence:[[{start:0,deleteCount:4,insert:'aaaaa',ambiguous:true}]]}));
      assert.equal(result.status,'recovery');assert.match(result.reason,/raw-file alignment/);assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'aaaa');assert.equal(await page.evaluate(()=>inactiveErrors.length),0,'expected active ambiguity never escapes to a nonthrowing production error handler');
    }
    for(const offset of [2]){
      await select('aaaa',offset);
      const result=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('aaaaa',{retireUnprovenSelection:true,operationSequence:[[{start:0,deleteCount:4,insert:'aaaaa',ambiguous:true}]]}));
      assert.equal(result.status,'applied',result.reason);assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'aaaaa');
      assert.equal(await page.evaluate(()=>inactiveEditor.captureSelection()),null,'clean ambiguous anchors retire instead of inventing an insertion position');
      assert.equal(await page.evaluate(()=>document.activeElement.id==='inactive-selection-editor'),false,'fresh input needs a newly selected position');
      assert.equal(await page.evaluate(()=>{const surface=document.getElementById('inactive-selection-editor'),selection=getSelection();return surface.contains(selection.anchorNode)||surface.contains(selection.focusNode)}),false,'the browser range retires with the Lexical selection');
    }
    await select('aaaa',2);
    await page.locator('#inactive-selection-editor').evaluate(surface=>surface.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'X'})));
    const pending=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('aaaaa',{retireUnprovenSelection:true,operationSequence:[[{start:0,deleteCount:4,insert:'aaaaa',ambiguous:true}]]}));
    assert.equal(pending.status,'recovery','an input range already captured by beforeinput is not a clean caret');assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'aaaa');
    await select('aaaa',2);
    const malformed=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('different',{retireUnprovenSelection:true,operationSequence:[[{start:0,deleteCount:4,insert:'aaaaa',ambiguous:true}]]}));
    assert.equal(malformed.status,'recovery','clean selection retirement never bypasses exact source replay');assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'aaaa');
    await select('Observed external replacement.\n',3);
    await page.evaluate(()=>{document.getElementById('inactive-selection-dialog').showModal();const field=document.getElementById('inactive-comparison-field');field.focus();field.setSelectionRange(1,7)});
    const result=await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('Newer human save after comparison.\n',{operationSequence:[[{start:0,deleteCount:27,insert:'Newer human save after compariso',ambiguous:true},{start:28,deleteCount:1,insert:''}],[]]}));
    assert.equal(result.status,'applied',result.reason);assert.equal(await page.evaluate(()=>inactiveEditor.getMarkdown()),'Newer human save after comparison.\n','a stale inactive anchor cannot roll canonical hydration back to the old source');
    assert.equal(await page.evaluate(()=>inactiveEditor.captureSelection()),null,'unprovable inactive selection is retired before a later input');
    assert.deepEqual(await page.evaluate(()=>{const field=document.getElementById('inactive-comparison-field');return {focused:document.activeElement===field,start:field.selectionStart,end:field.selectionEnd,value:field.value}}),{focused:true,start:1,end:7,value:'Comparison text stays selected'});
    await page.evaluate(()=>document.getElementById('inactive-selection-dialog').close());
    await select('hello',2);await page.evaluate(()=>{document.getElementById('inactive-selection-dialog').showModal();document.getElementById('inactive-comparison-field').focus()});
    assert.equal(await page.evaluate(()=>inactiveEditor.applyCollaborativeMarkdown('Xhello',{operationSequence:[[{start:0,deleteCount:0,insert:'X'}]]}).status),'applied');
    assert.deepEqual(await page.evaluate(()=>{const selected=inactiveEditor.captureSelection();return [selected?.anchor.offset,selected?.focus.offset]}),[3,3],'a provable inactive caret still follows exact remote operations');assert.equal(await page.evaluate(()=>document.activeElement.id),'inactive-comparison-field');assert.deepEqual(await page.evaluate(()=>inactiveErrors),[]);
  }finally{await page.evaluate(()=>{document.getElementById('inactive-selection-dialog').close();inactiveEditor.destroy();document.getElementById('inactive-selection-editor').remove();document.getElementById('inactive-selection-dialog').remove()})}
}
export async function runStructuralCursorProof(page) {
  await page.addStyleTag({content:'#note-panel {height:150px;overflow:auto;width:440px}#note-editor {min-height:120px;white-space:pre-wrap;font:16px/20px monospace}#note-editor p {margin:0;min-height:20px}'});
  for(const [start,end,expected] of [[2,2,[3,3]],[1,4,[2,5]],[4,1,[5,2]]]) {
    await page.evaluate(()=>richEditor.setMarkdown('```js\njs abc\n```',true));
    await selectLeaf(page,'#note-editor pre',start,end);
    assert.deepEqual(await editorSelection(page),[start,end]);
    assert.equal(await page.evaluate(()=>richEditor.applyCollaborativeMarkdown('```js\nXjs abc\n```',{operationSequence:[[{start:6,deleteCount:0,insert:'X'}]]}).status),'applied');
    assert.deepEqual(await editorSelection(page),expected,'fence language never steals a code-body anchor');
    assert.deepEqual(await page.evaluate(()=>richEditor.collaborativeSelection()),{anchor:6+expected[0],focus:6+expected[1]});
  }
  const cases = [
    ['## Heading',5,'#note-editor h2',2],
    ['hello **world**',2,'#note-editor p',2],
    ['hello **world**',10,'#note-editor .editor-bold',2],
    ['a *italic* b',5,'#note-editor .editor-italic',2],
    ['a `literal` b',5,'#note-editor .editor-inline-code',2],
    ['a [[Literal ** title]] b',8,'#note-editor .markdown-reference',6],
    ['- [ ] hello **world**',8,'#note-editor .markdown-task > span',2],
    ['```js\njs abc\n```',8,'#note-editor pre',2],
  ];
  for (const [body,raw,selector,visible] of cases) {
    await page.evaluate(body=>{richEditor.setMarkdown(body,true);document.querySelector('#note-panel').scrollTop=0},body);
    await assertCursor(page,raw,selector,visible);
    await selectLeaf(page,selector,visible);
    assert.deepEqual(await page.evaluate(()=>richEditor.collaborativeSelection()),{anchor:raw,focus:raw},`local and remote use the same exact map for ${body}`);
  }
  await page.evaluate(()=>richEditor.setMarkdown('```js\n```',true));
  await page.locator('#note-editor pre').evaluate(element=>{document.querySelector('#note-editor').focus();getSelection().setBaseAndExtent(element,0,element,0)});await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.deepEqual(await page.evaluate(()=>richEditor.collaborativeSelection()),{anchor:6,focus:6},'empty fenced code has a precise insertion anchor before its closing fence');
  await page.evaluate(()=>richEditor.setCollaborativePresence([{actor:'alice',name:'Alice',kind:'human',anchor:6,focus:6}]));
  assert.ok(await page.locator('[data-collaboration-actor]').count()>0,'empty code has a visible insertion caret');
  const table='| A | B |\n| --- | --- |\n| x | y |';
  await page.evaluate(body=>richEditor.setMarkdown(body,true),table);
  await page.locator('.markdown-table details').evaluate(details=>{details.open=true});
  await assertCursor(page,table.indexOf('x'),'.markdown-table details pre > :last-child',2);
  await selectLeaf(page,'.markdown-table details pre > :last-child',2);
  assert.deepEqual(await page.evaluate(()=>richEditor.collaborativeSelection()),{anchor:table.indexOf('x'),focus:table.indexOf('x')});
  await page.locator('.markdown-table details').evaluate(details=>{details.open=false});
  await page.evaluate(()=>richEditor.setCollaborativePresence([{actor:'alice',name:'Alice',kind:'human',anchor:26,focus:26}]));
  assert.equal(await page.locator('[data-collaboration-actor]').count(),0,'inert table preview is not projected as editable source');
  await page.evaluate(()=>richEditor.setMarkdown('hello\n\nworld',true));
  await page.evaluate(()=>richEditor.setCollaborativePresence([{actor:'alice',name:'Alice',kind:'human',anchor:6,focus:6}]));
  const empty = await page.locator('#note-editor p').nth(1).boundingBox(), marker = await page.locator('[data-collaboration-actor]').boundingBox();
  assert.ok(empty&&marker); assert.ok(Math.abs(empty.y-marker.y)<2); assert.ok(Math.abs(empty.x-marker.x)<2);
  // A real backward range spans plain and formatted leaves, without selecting
  // the hidden Markdown delimiters or a whole paragraph fallback.
  await page.evaluate(()=>richEditor.setMarkdown('hello **world**',true));
  await page.evaluate(()=>richEditor.setCollaborativePresence([{actor:'alice',name:'Alice',kind:'human',anchor:13,focus:2}]));
  const rangeExpected = await page.evaluate(()=>{
    const root=document.querySelector('#note-editor'), walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), first=walker.nextNode(),second=walker.nextNode();
    const range=document.createRange();range.setStart(first,2);range.setEnd(second,5);const r=range.getBoundingClientRect();return {x:r.x,width:r.width};
  });
  const rangeMarks = await page.locator('[data-collaboration-actor]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right}}));
  assert.ok(rangeMarks.length); assert.ok(Math.abs(Math.min(...rangeMarks.map(r=>r.x))-rangeExpected.x)<2); assert.ok(Math.abs(Math.max(...rangeMarks.map(r=>r.right))-(rangeExpected.x+rangeExpected.width))<3);
  const long=Array.from({length:25},(_,i)=>'line'+i).join('\n');
  await page.evaluate(body=>{richEditor.setMarkdown(body,true);document.querySelector('#note-panel').scrollTop=0},long);
  await page.evaluate(offset=>richEditor.setCollaborativePresence([{actor:'alice',name:'Alice',kind:'human',anchor:offset,focus:offset}]),long.indexOf('line20')+2);
  assert.equal(await page.locator('[data-collaboration-actor]').count(),0,'offscreen caret is clipped by actual scrolling viewport');
  await page.evaluate(()=>{document.querySelector('#note-panel').scrollTop=300});await page.evaluate(()=>new Promise(requestAnimationFrame));
  const panel=await page.locator('#note-panel').boundingBox(), scrolled=await page.locator('[data-collaboration-actor]').boundingBox();
  assert.ok(panel&&scrolled);assert.ok(scrolled.y>=panel.y&&scrolled.y+scrolled.height<=panel.y+panel.height);
  await page.evaluate(()=>richEditor.setCollaborativePresence([])); assert.equal(await page.locator('[data-collaboration-actor]').count(),0);
  await runInactiveSelectionProof(page);
}

export async function runLiveCursorProof({browser,serverUrl,token,root,bundle,errors}) {
  const id='mem_91111111-1111-4111-8111-111111111112', original='first alpha\n\nhello **world**\n\nmiddle beta\n\nlast omega\n';
  const file=path.join(root,'notes/cursor-proof.md');await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Cursor proof\n---\n`+original);
  const contexts=[await browser.newContext({bypassCSP:true}),await browser.newContext({bypassCSP:true})],pages=await Promise.all(contexts.map(c=>c.newPage()));
  let agentSocket;
  try {
    const wire=await installCollaborationSmokeTransport(pages[0]);
    for(const [index,page] of pages.entries()){
      page.setDefaultTimeout(12_000);page.on('pageerror',e=>errors.push(e.message));await page.goto(serverUrl+'/health');
      await page.setContent('<style>#note-panel{height:300px;overflow:auto;width:700px}#note-editor{font:18px/26px monospace;white-space:pre-wrap}p{min-height:26px;margin:0}</style><div id="note-panel"><div id="note-editor"></div></div>');await page.addScriptTag({content:bundle});
      await page.evaluate(({url,token,id,index})=>{
        window.richEditor=ProductionCollaboration.createNoteEditor(document.querySelector('#note-editor'),{onChange(body){live.input(body)},onError(e){throw e}});
        window.live=ProductionCollaboration.createCollaborationEditor({url:url.replace(/^http/,'ws')+'/ws',token,scope:'visible-cursor-proof',documentId:id,clientId:'cursor-human-'+index,editor:richEditor});live.connect();
      },{url:serverUrl,token,id,index});await page.waitForFunction(()=>live.state.status==='saved');
    }
    // Context B's actual formatted caret is visibly at its matching text in A.
    await selectLeaf(pages[1],'#note-editor .editor-bold',2);
    const boldRaw=original.indexOf('world')+2;
    await pages[0].waitForFunction(offset=>live.snapshot.presence.some(p=>p.anchor===offset&&p.focus===offset),boldRaw);
    const expected=await geometry(pages[0],'#note-editor .editor-bold',2),mark=await pages[0].locator('[data-collaboration-actor]').boundingBox();
    assert.ok(expected&&mark);assert.ok(Math.abs(expected.left-mark.x)<2&&Math.abs(expected.top-mark.y)<2,'another context sees an exact formatted caret');
    // Keep one accepted A operation unacknowledged while A edits two separate
    // source islands and B changes the unchanged middle. The old outer-envelope
    // diff falsely rejected this ordinary multi-user sequence.
    const ack=wire.holdNextReply('edit');await appendEditorText(pages[0],' flight');await ack.arrived;
    await selectLeaf(pages[0],'#note-editor > p:first-child',0,5);await pages[0].keyboard.insertText('FIRST');
    await selectLeaf(pages[0],'#note-editor > p:nth-child(7)',0,4);await pages[0].keyboard.insertText('LAST');
    assert.equal(await pages[0].evaluate(()=>live.state.dirty),true);
    assert.ok(await pages[0].locator('[data-collaboration-actor]').count()>0,'remote caret remains visible during unpublished local typing');
    await selectLeaf(pages[1],'#note-editor > p:nth-child(5)',0,6);await pages[1].keyboard.insertText('MIDDLE');await pages[1].waitForFunction(()=>live.state.status==='saved');
    ack.release();await Promise.all(pages.map(p=>p.waitForFunction(()=>live.state.status==='saved')));
    const expectedBody=original.replace('first','FIRST').replace('middle','MIDDLE').replace('last','LAST')+' flight';
    for(const page of pages)assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),expectedBody,'three independent source regions converge exactly');
    assert.ok(wire.observed.some(frame=>frame.method==='edit'&&frame.params.operations?.length>=2),'one atomic batch preserves independent first/last intent');
    assert.ok((await readFile(file,'utf8')).endsWith(expectedBody));
    await pages[0].evaluate(()=>live.undo());await pages[1].waitForFunction(()=>!richEditor.getMarkdown().includes('FIRST')&&richEditor.getMarkdown().includes('MIDDLE'));
    assert.equal(await pages[1].evaluate(()=>richEditor.getMarkdown()),original.replace('middle','MIDDLE')+' flight','actor undo reverts both local source islands, preserving another user');
    await pages[0].evaluate(()=>live.redo());await pages[1].waitForFunction(()=>richEditor.getMarkdown().includes('FIRST')&&richEditor.getMarkdown().includes('LAST'));
    // Ordinary repeated replacements and their inverse history must work with
    // no intervening foreign edit, while the existing peer text is retained.
    for(const replacement of ['ONE','TWO']){await selectLeaf(pages[0],'#note-editor > p:first-child',0,replacement==='ONE'?5:3);await pages[0].keyboard.insertText(replacement);await pages[0].waitForFunction(()=>live.state.status==='saved')}
    await pages[0].evaluate(()=>live.undo());await pages[0].waitForFunction(()=>richEditor.getMarkdown().startsWith('ONE'));
    await pages[0].evaluate(()=>live.undo());await pages[0].waitForFunction(()=>richEditor.getMarkdown().startsWith('FIRST'));
    await pages[0].evaluate(()=>live.redo());await pages[0].waitForFunction(()=>richEditor.getMarkdown().startsWith('ONE'));
    await pages[0].evaluate(()=>live.redo());await pages[0].waitForFunction(()=>richEditor.getMarkdown().startsWith('TWO'));
    assert.ok((await pages[0].evaluate(()=>richEditor.getMarkdown())).includes('MIDDLE beta'),'multi-step local history retains the other actor');
    wire.rejectNext('undo',{code:'overlapping_edit',message:'Another writer changed the selected history range.'});await pages[0].evaluate(()=>live.undo());
    assert.equal(await pages[0].evaluate(()=>live.state.status),'conflict','failed Undo must never claim Saved');assert.match(await pages[0].evaluate(()=>live.state.message),/Another writer/);
    assert.equal(await pages[0].evaluate(()=>live.flush()),false);assert.equal(await pages[0].evaluate(()=>live.resolveConflict('saved')),true);
    await selectLeaf(pages[1],'#note-editor .editor-bold',2);await pages[0].waitForFunction(()=>live.snapshot.presence.some(peer=>peer.clientId==='cursor-human-1'&&peer.anchor===live.snapshot.body.indexOf('world')+2));
    await pages[0].waitForFunction(()=>document.querySelectorAll('[data-collaboration-actor]').length>0);
    const pending=new Map();agentSocket=new WebSocket(serverUrl.replace(/^http/,'ws')+'/ws');
    agentSocket.on('message',data=>{const reply=JSON.parse(data.toString()),request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);reply.ok?request.resolve(reply.result):request.reject(new Error(JSON.stringify(reply.error)))});
    await new Promise((resolve,reject)=>{agentSocket.once('open',resolve);agentSocket.once('error',reject)});
    const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();pending.set(id,{resolve,reject});agentSocket.send(JSON.stringify({id,method,params:{clientId:'proof-agent',actorKind:'agent',...params}}))});
    await rpc('hello',{token,protocol:2});let agent=await rpc('open',{documentId:id});const streamId=crypto.randomUUID();
    await rpc('stream.start',{documentId:id,epoch:agent.epoch,baseRevision:agent.revision,streamId,start:agent.body.length});
    await pages[0].waitForFunction(()=>live.snapshot.presence.some(p=>p.kind==='agent'&&p.activity==='streaming'&&p.anchor!==undefined));
    await pages[0].waitForFunction(()=>document.querySelectorAll('[data-collaboration-actor][data-collaboration-kind="agent"]').length>0);
    assert.match(await pages[0].locator('[data-collaboration-label][data-collaboration-kind="agent"]').innerText(),/Agent .*generating/,'stream insertion is visible as agent activity');
    agent=await rpc('stream.chunk',{documentId:id,epoch:agent.epoch,streamId,sequence:0,insert:' agent-visible'});
    await pages[0].waitForFunction(body=>richEditor.getMarkdown()===body,agent.body);
    assert.ok(await pages[0].locator('[data-collaboration-actor][data-collaboration-kind="agent"]').count()>0);
    if(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR){await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,{recursive:true});await pages[0].screenshot({path:path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,'visible-two-context-cursor.png')});}
    await rpc('stream.finish',{documentId:id,epoch:agent.epoch,streamId});
    wire.disconnect();await pages[0].waitForFunction(()=>live.state.status==='offline');assert.equal(await pages[0].locator('[data-collaboration-actor]').count(),0,'disconnect clears stale cursor overlays immediately');
  }finally{agentSocket?.close();for(const context of contexts)await context.close()}
}
