import assert from 'node:assert/strict';
import { appendEditorText, editorMarkdown } from './editor-smoke-helpers.mjs';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot, indexMemory } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium,launchPlaywrightChromium } from './playwright-runtime.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),temp=await mkdtemp(path.join(os.tmpdir(),'jb-boards-ui-')),root=path.join(temp,'memory'),support=path.join(temp,'support');
let gateway,browser;
try{
 await initializeMemoryRoot(root);
 const existingId='mem_12345678-1234-1234-1234-123456789012', original='---\nid: '+existingId+'\ntitle: Launch checklist\ntype: note\n---\n\nKeep the release small.\n';
 await writeFile(path.join(root,'notes/checklist.md'),original);await indexMemory(root,{indexing:{mode:'lexical'}});await mkdir(support,{mode:0o700});await mkdir('/tmp/jumpybrain-boards-qa',{recursive:true});
 gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey:'b'.repeat(64),credentials:{get:async()=>null,set:async()=>{},delete:async()=>{}}});
 browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(gateway.url+'/#companion='+'b'.repeat(64));await page.locator('#new-board').waitFor({state:'visible'});
 await page.locator('#new-board').click();await page.locator('#board-dialog-input').fill('A quieter launch');await page.locator('#board-dialog-submit').click();
 await page.locator('#board-title').filter({hasText:'A quieter launch'}).waitFor();
 await page.getByText('+ Add note',{exact:true}).first().click();await page.locator('#board-dialog-input').fill('Write the first chapter');await page.locator('#board-dialog-submit').click();
 await page.locator('.board-card').filter({hasText:'Write the first chapter'}).waitFor();
 await page.locator('.board-card select').selectOption('1');await page.locator('.board-column').nth(1).locator('.board-card').waitFor();
 await page.getByText('+ Add note',{exact:true}).first().click();await page.locator('#board-dialog-input').fill('Launch checklist');await page.locator('#board-dialog-results').getByRole('button',{name:'Launch checklist',exact:true}).click();await page.locator('.board-card').filter({hasText:'Launch checklist'}).waitFor();
 await page.locator('.board-card').filter({hasText:'Launch checklist'}).dragTo(page.locator('.board-column').nth(2));await page.locator('.board-column').nth(2).locator('.board-card').waitFor();
 for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light'],[390,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({path:`/tmp/jumpybrain-boards-qa/${width}-${theme}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:1280,height:900});
 const cardId=await page.locator('.board-column').nth(1).locator('.board-card').getAttribute('data-board-page');
 await page.locator('.board-column').nth(1).locator('.board-card > button').click();await page.locator('#note-editor').waitFor({state:'visible'});
 await page.locator('#navigate-back').click();await page.locator('#board-title').filter({hasText:'A quieter launch'}).waitFor();await page.locator('.board-card').first().waitFor();
 await page.getByRole('button',{name:'Settle A quieter launch',exact:true}).first().click();await page.locator('#sidebar-boards li').waitFor({state:'hidden'});
 await page.locator('#open-connection').click();await page.locator('[data-settings-section="boards"]').click();await page.getByRole('button',{name:'Restore A quieter launch',exact:true}).click();await page.locator('#settings-boards-list').getByRole('button',{name:'A quieter launch',exact:true}).click();await page.locator('.board-card').first().waitFor();assert.equal(await page.locator('.board-column').nth(1).locator('.board-card').getAttribute('data-board-page'),cardId);
 await page.reload();await page.locator('.board-card').first().waitFor();
 const saved=JSON.parse(await readFile(path.join(support,'collections.json'),'utf8'));assert.equal(Object.values(saved.scopes)[0].boards[0].columns[1].pages[0],cardId);
 // A second board receives an existing note through the note action card.
 await page.locator('#new-board').click();await page.locator('#board-dialog-input').fill('Next chapter');await page.locator('#board-dialog-submit').click();
 await page.locator('#board-title').filter({hasText:'Next chapter'}).waitFor();
 await page.locator('[data-page-link="'+existingId+'"]').click();await page.locator('#note-editor').waitFor({state:'visible'});
 const noteUrl=page.url();
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-select').locator('option').filter({hasText:'Next chapter'}).waitFor({state:'attached'});
 await page.waitForFunction(()=>!document.getElementById('note-board-add').disabled);
 assert.equal(await page.locator('#note-board-select option').filter({hasText:'A quieter launch'}).evaluate(o=>o.disabled),true);
 await page.locator('#note-board-column').selectOption('2');
 for(const [width,theme] of [[1280,'light'],[390,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({path:'/tmp/jumpybrain-boards-qa/add-to-board-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:1280,height:900});
 // A rejected save must leave the chooser open; retry adds exactly once.
 let rejected=false;
 await page.route('**/companion/collections',async route=>{if(route.request().method()==='POST'&&!rejected){rejected=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture conflict'}})});}else await route.continue();});
 await page.locator('#note-board-add').click();await page.locator('#note-board-message').filter({hasText:'Not added'}).waitFor();assert.equal(await page.locator('#note-board-dialog').isVisible(),true);
 await page.locator('#note-board-column').selectOption('2');await page.locator('#note-board-add').click();await page.locator('#note-board-dialog').waitFor({state:'hidden'});await page.unroute('**/companion/collections');
 assert.equal(page.url(),noteUrl);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'note-add-to-board');
 const after=JSON.parse(await readFile(path.join(support,'collections.json'),'utf8'));const second=Object.values(after.scopes)[0].boards.find(b=>b.name==='Next chapter');assert.deepEqual(second.columns.map(c=>c.pages),[[],[],[existingId]]);
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-message').filter({hasText:'already on your boards'}).waitFor();assert.equal(await page.locator('#note-board-add').isDisabled(),true);await page.locator('#note-board-cancel').click();
 await page.locator('#sidebar-boards').getByRole('button',{name:'Settle A quieter launch',exact:true}).click();await page.locator('#sidebar-boards').getByRole('button',{name:'A quieter launch',exact:true}).waitFor({state:'hidden'});
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-message').filter({hasText:'already on your boards'}).waitFor();assert.equal(await page.locator('#note-board-select option').count(),1);await page.locator('#note-board-cancel').click();
 await page.screenshot({path:'/tmp/jumpybrain-boards-qa/note-action-card.png',fullPage:true});
 assert.equal(await readFile(path.join(root,'notes/checklist.md'),'utf8'),original);
 // Adding membership does not flush or discard an unsaved note draft.
 await page.locator('[data-page-link="'+cardId+'"]').click();await page.locator('#note-editor').waitFor({state:'visible'});
 await page.route('**/memories/all/documents/**',async route=>{if(route.request().method()==='PUT')await route.abort();else await route.continue();});
 await appendEditorText(page,'Keep this unsaved thought.');const draft=await editorMarkdown(page);
 await page.locator('#note-add-to-board').click();await page.waitForFunction(()=>!document.getElementById('note-board-add').disabled);await page.locator('#note-board-add').click();await page.locator('#note-board-dialog').waitFor({state:'hidden'});
 assert.equal(await editorMarkdown(page),draft);assert.equal(await page.evaluate(()=>state.editor.hasPending()),true);
 assert.deepEqual(errors,[]);console.log('Boards smoke PASS: note action/column/conflict retry/duplicates/archive filtering, create page, move, editor/back, settle, settings restore, reload, 1280/390 light/dark');
}finally{await browser?.close();await gateway?.close();await rm(temp,{recursive:true,force:true});}
