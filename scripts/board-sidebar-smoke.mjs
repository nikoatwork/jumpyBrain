// Real gateway and disposable canonical files: optional navigation must not write to a brain.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { initializeMemoryRoot, saveBoard } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
const temp=await mkdtemp(path.join(os.tmpdir(),'jb-board-tree-')),root=path.join(temp,'memory');
const captures='/tmp/jumpybrain-board-sidebar-qa',id=n=>'mem_ab000000-0000-4000-8000-'+String(n).padStart(12,'0');
let gateway,browser;
try {
  await initializeMemoryRoot(root);await mkdir(captures,{recursive:true});await mkdir(path.join(temp,'support'),{mode:0o700});
  const originals=new Map();
  for(let i=1;i<=22;i++){
    const content=`---\nid: ${id(i)}\ntitle: ${i===1?'Project overview':i===2?'A very long page title that must truncate without covering disclosure controls':'Project page '+i}\ntype: note\nattention_at: ${i===1?'null':'2026-10-31T12:00:00Z'}\n---\n\nProject evidence ${i}.\n`,file=path.join(root,'notes',i+'.md');
    await writeFile(file,content);originals.set(file,content);
  }
  const first={schemaVersion:1,id:randomUUID(),name:'Website redesign',archived:false,columns:[{name:'Ideas & decisions',pages:[id(1),id(2)]},{name:'In progress',pages:[id(3)]},{name:'Ready to share',pages:[]}]};
  const second={...first,id:randomUUID(),name:'A second project with an unusually long name',columns:[{name:'An unusually long column title for layout checks',pages:[id(1),id(999)]},{name:'Working through',pages:Array.from({length:19},(_,i)=>id(i+4))},{name:'Done',pages:[]}]};
  await saveBoard(root,first);await saveBoard(root,second);
  for(const b of [first,second]){const file=path.join(root,'boards',b.id+'.json');originals.set(file,await readFile(file,'utf8'));}
  gateway=await startCompanionGateway({runtimeRoot:path.resolve('.'),directory:path.join(temp,'support'),initialRoot:root,port:0,controlKey:'b'.repeat(64),credentials:{get:async()=>null,set:async()=>{},delete:async()=>{}}});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(gateway.url+'/#companion='+'b'.repeat(64));
  const tree=page.locator('#sidebar-boards'),board=tree.locator('[data-sidebar-board="'+first.id+'"]'),other=tree.locator('[data-sidebar-board="'+second.id+'"]');
  await board.waitFor();assert.equal(await tree.locator('.board-nav-disclosure:visible').count(),0);
  assert.equal(await page.locator('.sidebar-section-heading').count(),0);
  await page.evaluate(()=>navigation.navigate('/settings?section=boards'));
  const checkbox=page.getByRole('checkbox',{name:'Show pages in sidebar for '+first.name,exact:true});
  await checkbox.check();await page.getByRole('checkbox',{name:'Show pages in sidebar for '+second.name,exact:true}).check();
  await page.screenshot({path:captures+'/settings-light.png'});
  await page.evaluate(()=>navigation.navigate('/'));
  const arrow=board.locator('.board-nav-head > .board-nav-disclosure');
  const column=board.locator('.board-nav-column').first(),columnArrow=column.locator('.board-nav-disclosure');
  const member=column.locator('[data-sidebar-page="'+id(1)+'"] button');
  await member.filter({hasText:'Project overview'}).waitFor();await other.getByRole('button',{name:'Page missing',exact:true}).waitFor();
  await board.getByText('Empty column',{exact:true}).waitFor();
  // Shared-origin tabs observe the same personal preference without a brain write.
  const peer=await page.context().newPage();await peer.goto(gateway.url+'/#companion='+'b'.repeat(64));
  const peerArrow=peer.locator('[data-sidebar-board="'+first.id+'"] .board-nav-head > .board-nav-disclosure');
  await peerArrow.waitFor();await arrow.click();await peer.waitForFunction(id=>document.querySelector('[data-sidebar-board="'+id+'"] .board-nav-disclosure')?.getAttribute('aria-expanded')==='false',first.id);
  await peerArrow.click();await page.waitForFunction(id=>document.querySelector('[data-sidebar-board="'+id+'"] .board-nav-disclosure')?.getAttribute('aria-expanded')==='true',first.id);
  await arrow.focus();await peer.evaluate(()=>navigation.navigate('/settings?section=boards'));
  const peerSetting=peer.getByRole('checkbox',{name:'Show pages in sidebar for '+first.name,exact:true});await peerSetting.uncheck();
  await arrow.waitFor({state:'hidden'});assert.equal(await board.locator('.board-nav-head > .sidebar-page-link').evaluate(el=>el===document.activeElement),true,'external opt-out returns focus to board navigation');
  await peerSetting.check();await arrow.waitFor();await peer.close();
  // Stable nodes and disclosure state through a full canonical refresh.
  await columnArrow.focus();await columnArrow.evaluate(el=>window.originalDisclosure=el);await page.evaluate(()=>boardsUI.refresh());
  assert.equal(await columnArrow.evaluate(el=>el===window.originalDisclosure&&el===document.activeElement),true);
  await columnArrow.press('ArrowLeft');assert.equal(await columnArrow.getAttribute('aria-expanded'),'false');
  await columnArrow.press('ArrowRight');await columnArrow.press('ArrowRight');assert.equal(await member.evaluate(el=>el===document.activeElement),true);
  await member.press('Enter');await page.waitForFunction(()=>state.editor?.state.loaded);
  assert.equal(new URL(page.url()).searchParams.get('note'),id(1));assert.equal(await member.getAttribute('aria-current'),'page');
  assert.equal(await other.locator('[data-sidebar-page="'+id(1)+'"] button').getAttribute('aria-current'),'page');
  // Collapse never navigates, persists through reload, and does not force-reveal the selected page.
  const url=page.url();await arrow.click();assert.equal(page.url(),url);
  const reads=[];const record=req=>{if(req.method()==='GET')reads.push(req.url());};page.on('request',record);await page.evaluate(()=>boardsUI.refresh());page.off('request',record);
  assert.equal(reads.some(url=>url.includes(id(2))),false,'collapsed columns do not fetch their titles');
  assert.equal(await board.locator('.board-nav-column').count(),0,'collapsed descendants are not rendered');await page.reload();await arrow.waitFor();assert.equal(await arrow.getAttribute('aria-expanded'),'false');
  await arrow.click();await columnArrow.click();await page.reload();await columnArrow.waitFor();assert.equal(await columnArrow.getAttribute('aria-expanded'),'false');
  await columnArrow.click();await member.filter({hasText:'Project overview'}).waitFor();
  for(const [width,height,sidebarWidth] of [[1280,850,224],[1280,850,280],[1440,900,480],[900,480,224],[390,850,280],[320,650,280]])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height});await page.evaluate(theme=>colorTheme.setPreference(theme),theme);
    if(width>680)await page.locator('#sidebar-resize').evaluate((el,width)=>el.dispatchEvent(width===280?new MouseEvent('dblclick',{bubbles:true}):new KeyboardEvent('keydown',{key:width===224?'Home':'End',bubbles:true})),sidebarWidth);
    await page.locator('.sidebar-attention-scroll').evaluate(el=>el.scrollTop=0);await page.mouse.move(width-5,5);await page.evaluate(()=>document.activeElement.blur());
    const geometry=await page.evaluate(()=>{
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width};};
      const host=document.getElementById('sidebar-boards');return {fits:document.documentElement.scrollWidth<=innerWidth,sidebar:box(document.getElementById('app-sidebar')),footer:box(document.querySelector('.nav-footer')),tree:box(host),rows:[...host.querySelectorAll('.board-nav-target')].filter(el=>el.getClientRects().length).map(box)};
    });
    assert.ok(geometry.fits);assert.ok(geometry.footer.bottom<=height,'footer reachable');
    for(const row of geometry.rows){assert.ok(row.x>=geometry.tree.x&&row.right<=geometry.tree.right+1,'tree row contained');assert.ok(row.width>=32,'targets usable');}
    const parentBox=await board.locator('.board-nav-head > .sidebar-page-link').boundingBox(),colBox=await column.locator('.sidebar-page-link').first().boundingBox(),pageBox=await member.boundingBox();
    assert.ok(parentBox.x<colBox.x&&colBox.x<pageBox.x,'three visibly indented levels');
    await page.screenshot({path:`${captures}/${width}-${height}-${sidebarWidth}-${theme}.png`});
    const footerY=geometry.footer.y;await page.locator('.sidebar-attention-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.equal((await page.locator('.nav-footer').boundingBox()).y,footerY,'scroll does not move footer');
  }
  await page.setViewportSize({width:1280,height:850});await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.sidebar-attention-scroll').evaluate(el=>el.scrollTop=0);
  await arrow.click();assert.equal(await arrow.getAttribute('aria-expanded'),'false');await page.screenshot({path:captures+'/collapsed-dark.png'});await arrow.click();
  for(const [file,content] of originals)assert.equal(await readFile(file,'utf8'),content,'navigation/preferences do not write canonical files');
  // Board links still open Kanban; external membership changes keep disclosure focus and update the tree.
  await board.locator('.board-nav-head > .sidebar-page-link').click();await page.locator('.board-card-title').first().waitFor();assert.equal(new URL(page.url()).searchParams.get('board'),first.id);
  await columnArrow.focus();await page.evaluate(async({boardId,pageId})=>{const p=await graphJson('/memories/all/boards');const b=p.boards.find(b=>b.id===boardId);b.columns[0].pages=b.columns[0].pages.filter(id=>id!==pageId);b.columns[1].pages.push(pageId);b.columns[0].name='Decisions';await graphJson('/memories/all/boards/'+boardId,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':p.hashes[boardId]},body:JSON.stringify(b)});await boardsUI.refresh();},{boardId:first.id,pageId:id(1)});
  assert.equal(await columnArrow.evaluate(el=>el===document.activeElement),true);assert.equal(await column.locator('[data-sidebar-page="'+id(1)+'"]').count(),0);
  await board.locator('.board-nav-column').nth(1).getByRole('button',{name:'Project overview',exact:true}).waitFor();
  await page.evaluate(()=>navigation.navigate('/settings?section=boards'));await checkbox.uncheck();await page.evaluate(()=>navigation.navigate('/'));assert.equal(await arrow.isVisible(),false);assert.equal(await board.locator('.board-nav-column').count(),0);
  assert.equal(await other.locator('.board-nav-head > .board-nav-disclosure').getAttribute('aria-expanded'),'true');
  // Simulated storage denial still keeps in-tab preferences across navigation.
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Fixture storage unavailable');};});
  await page.evaluate(()=>navigation.navigate('/settings?section=boards'));await checkbox.check();await page.evaluate(()=>navigation.navigate('/'));assert.equal(await arrow.isVisible(),true);
  assert.deepEqual(errors,[]);console.log('PASS board sidebar: defaults, preference/expansion persistence, canonical preservation, keyed focus, keyboard and direct navigation, multiple memberships, missing/empty columns, external moves, opt-out, storage denial, cross-tab synchronization, lazy collapsed trees and responsive light/dark visuals. Captures: '+captures);
}finally{await browser?.close();await gateway?.close();await rm(temp,{recursive:true,force:true});}
