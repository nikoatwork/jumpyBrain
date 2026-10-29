import assert from 'node:assert/strict';
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
 await page.getByText('+ Add page',{exact:true}).first().click();await page.locator('#board-dialog-input').fill('Write the first chapter');await page.locator('#board-dialog-submit').click();
 await page.locator('.board-card').filter({hasText:'Write the first chapter'}).waitFor();
 await page.locator('.board-card select').selectOption('1');await page.locator('.board-column').nth(1).locator('.board-card').waitFor();
 await page.getByText('+ Add page',{exact:true}).first().click();await page.locator('#board-dialog-input').fill('Launch checklist');await page.locator('#board-dialog-results').getByRole('button',{name:'Launch checklist',exact:true}).click();await page.locator('.board-card').filter({hasText:'Launch checklist'}).waitFor();
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
 assert.equal(await readFile(path.join(root,'notes/checklist.md'),'utf8'),original);
 assert.deepEqual(errors,[]);console.log('Boards smoke PASS: create page, move, editor/back, settle, settings restore, reload, 1280/390 light/dark');
}finally{await browser?.close();await gateway?.close();await rm(temp,{recursive:true,force:true});}
