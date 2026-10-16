// Real app + disposable Markdown/QMD root. Never uses installed app or personal memory.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, indexMemory, readMemoryDocument, searchMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { replaceEditorText, appendEditorText } from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-lifecycle-smoke-'));
const key='disposable-lifecycle-key', targetId='mem_f0000000-0000-4000-8000-000000000001';
let server,browser;
try {
  await initializeMemoryRoot(root);
  const target=`---\nid: "${targetId}"\ntitle: "QA lifecycle target"\ntype: "note"\n---\n[[QA lifecycle created]]\n`;
  await writeFile(path.join(root,'notes/hashed-target.md'),target);
  await indexMemory(root,{indexing:{mode:'lexical'}});
  server=await startJumpyBrainHttpServer({root,apiKeys:[key],port:0,autoIndex:false});
  const chromium=await loadPlaywrightChromium();browser=await launchPlaywrightChromium({chromium});
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+'/#apiKey='+key);console.log('step: capture');
  await page.locator('#home-new').click();
  await page.locator('#note-name').waitFor({state:'visible'});
  await page.locator('#note-name').fill('QA lifecycle created');
  await replaceEditorText(page,'A saved note with [[QA lifecycle target]].');
  await page.locator('#note-name').click();
  await page.getByTestId('graph-note-save-state').filter({hasText:'Saved'}).waitFor();
  const noteUrl=page.url(), id=new URL(noteUrl).searchParams.get('note');
  assert.match((await readMemoryDocument(root,id)).content,/QA lifecycle created/);
  // Before indexing, both global search and inline suggestions use confirmed writes.
  await page.locator('#open-search').click();
  await page.locator('#note-search-input').fill('QA lifecycle created');
  await page.locator('#search-results [role=option]').filter({has:page.locator('strong',{hasText:'QA lifecycle created'})}).waitFor();
  assert.equal(await page.locator('#search-refresh-index').isVisible(),true);
  await page.locator('#close-search').click();
  console.log('step: graph');await page.locator('#graph-link').click();
  await page.locator('#query').fill('QA lifecycle');await page.locator('#query').press('Enter');
  await page.getByTestId('graph-node-count').filter({hasText:'2'}).waitFor();
  assert.equal(await page.locator('.node.unresolved').count(),0,'editor title references must match the map');
  await page.getByRole('button',{name:'QA lifecycle created, memory note',exact:true}).click();
  await page.locator('#note-name').waitFor({state:'visible'});
  console.log('step: conflict');const second=await context.newPage();second.setDefaultTimeout(15000);await second.goto(noteUrl);await second.locator('#note-name').waitFor({state:'visible'});
  await appendEditorText(page,'\nWinning edit.');await page.locator('#note-name').click();
  await page.getByTestId('graph-note-save-state').filter({hasText:'Saved'}).waitFor();
  await replaceEditorText(second,'Losing draft retained for comparison.');await second.locator('#note-name').click();
  await second.getByTestId('graph-note-save-state').filter({hasText:'Save failed'}).waitFor();
  await second.locator('#note-recover').click();
  await second.locator('#recovery-saved').filter({visible:true}).waitFor();
  await second.waitForFunction(()=>document.getElementById('recovery-saved').value.includes('Winning edit.'));
  assert.match(await second.locator('#recovery-draft').inputValue(),/Losing draft/);
  await second.locator('#recovery-reload').click();
  await second.locator('#document-recovery').waitFor({state:'hidden'});
  assert.match((await readMemoryDocument(root,id)).content,/Winning edit/);
  assert.doesNotMatch((await readMemoryDocument(root,id)).content,/Losing draft/);
  await second.close();console.log('step: narrow map');
  // Narrow map controls occupy a full usable row; visible featured labels cannot overlap.
  await page.locator('#graph-link').click();
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(150); // existing map's resize debounce
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,filter:document.getElementById('query').getBoundingClientRect().width,
      boxes:[...document.querySelectorAll('.node.show-label text')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})}));
    assert.equal(layout.width,layout.scroll);assert.ok(layout.filter>=width-40,JSON.stringify(layout));
    for(let a=0;a<layout.boxes.length;a++)for(let b=a+1;b<layout.boxes.length;b++) {
      const x=layout.boxes[a],y=layout.boxes[b];assert.equal(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top,false);
    }
  }
  await page.setViewportSize({width:1280,height:850});
  await page.getByRole('button',{name:'QA lifecycle created, memory note',exact:true}).click();await page.locator('#note-name').waitFor({state:'visible'});
  console.log('step: delete');await page.locator('#delete-note').click();
  await page.locator('#delete-confirm').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('delete-confirm').disabled);
  assert.match(await page.locator('#delete-references').innerText(),/inbound links: 1/);
  assert.match(await page.locator('#document-delete').innerText(),/no Trash or Undo/);
  if(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR){await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,'delete-preview.png')});}
  await page.locator('#delete-cancel').click();assert.ok(await readMemoryDocument(root,id));
  await page.locator('#delete-note').click();await page.waitForFunction(()=>!document.getElementById('delete-confirm').disabled);
  await page.locator('#delete-confirm').click();await page.locator('#home').waitFor({state:'visible'});
  assert.match(await page.locator('#capture-message').innerText(),/Note deleted/);
  await assert.rejects(readMemoryDocument(root,id),e=>e.code==='missing_id');
  assert.equal(await readFile(path.join(root,'notes/hashed-target.md'),'utf8'),target);
  await page.locator('#home-search').click();await page.locator('#note-search-input').fill('QA lifecycle created');
  await page.waitForFunction(()=>document.getElementById('search-results').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#search-results [role=option]').filter({has:page.locator('strong',{hasText:'QA lifecycle created'})}).count(),0);
  // Explicit refresh reconciles deletion with indexed search, without repeating deletion.
  await page.locator('#search-refresh-index').click();
  await page.waitForFunction(()=>!document.getElementById('search-refresh-index').disabled);
  const indexed = await searchMemory(root, 'Winning edit', 5, {refresh:false});
  assert.equal(indexed.results.some(hit=>hit.provenance?.metadata?.id===id), false);
  assert.deepEqual(errors,[]);
  console.log('PASS: real note capture, immediate search, canonical title graph, guarded two-tab recovery, 390/320 layouts, delete cancel/apply, preserved backlinks and index refresh.');
} finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
