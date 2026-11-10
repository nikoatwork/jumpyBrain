// Two real writers editing the same passage, name and position at once, on a
// disposable brain. Overlap must merge without a review mode; see
// docs/testing.md#live-editing-and-websocket-scenarios.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'jb-overlap-'));
const id='mem_47777777-7777-4777-8777-777777777777',file=path.join(root,'notes/overlap.md');
const access=new AccessStore(root),errors=[],results=[];
let server,browser;
const saved=page=>page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
const markdown=page=>page.evaluate(()=>richEditor.getMarkdown());
const body=async()=>(await readFile(file,'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
const title=async()=>JSON.parse(/^title: (.*)$/m.exec(await readFile(file,'utf8'))[1]);
/** Place a caret in the block containing `text`: at its start, end, or after `where`. */
async function caret(page,text,where='end'){
  await page.evaluate(([text,where])=>{
    const editor=document.querySelector('#note-editor');editor.focus();
    const block=[...editor.children].find(element=>element.textContent.includes(text));if(!block)throw new Error('Missing block: '+text);
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT),nodes=[];let node;while((node=walker.nextNode()))nodes.push(node);
    const range=document.createRange();
    if(where==='start')range.setStart(nodes[0],0);
    else if(where==='end')range.setStart(nodes.at(-1),nodes.at(-1).length);
    else if(where==='all'){range.selectNodeContents(block);getSelection().removeAllRanges();getSelection().addRange(range);return}
    else{const target=nodes.find(candidate=>candidate.data.includes(where));range.setStart(target,target.data.indexOf(where)+where.length)}
    range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);
  },[text,where]);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
}
/** Everyone converges on the saved file and nobody is asked to review anything. */
async function settled(pages,label){
  await Promise.all(pages.map(saved));
  const expected=await body();
  await Promise.all(pages.map(page=>page.waitForFunction(value=>richEditor.getMarkdown().trim()===value.trim()&&state.editor.collaboration.state.status==='saved',expected)));
  for(const page of pages){
    assert.equal(await page.locator('#note-recover').isVisible(),false,label+': no review mode');
    assert.equal(await page.locator('#note-save-state').innerText(),'Saved',label);
  }
  results.push(label);return expected;
}
try {
  await initializeMemoryRoot(root);
  await writeFile(file,`---\nid: ${id}\ntitle: Overlap fixture\ntype: note\n---\nFirst paragraph alpha.\n\nSecond paragraph beta.\n\nThird paragraph gamma.\n`);
  const alice=await access.issue({name:'Alice',role:'writer'}),bob=await access.issue({name:'Bob',role:'writer'});
  server=await startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const pages=[];
  for(const writer of [alice,bob]){
    const page=await (await browser.newContext({viewport:{width:1100,height:700}})).newPage();
    page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${server.url}/?note=${id}#apiKey=${writer.token}`);await saved(page);pages.push(page);
  }
  const [a,b]=pages;

  // Both type at one position: each run stays whole instead of interleaving.
  await caret(a,'Third paragraph');await caret(b,'Third paragraph');
  await Promise.all([a.keyboard.type(' 1111 1111 1111',{delay:40}),b.keyboard.type(' 2222 2222 2222',{delay:40})]);
  let current=await settled(pages,'same-position typing keeps each run contiguous');
  assert.match(current,/ 1111 1111 1111/);assert.match(current,/ 2222 2222 2222/);

  // Both delete the same characters: removed once, nobody reviews.
  await caret(a,'Second paragraph');await caret(b,'Second paragraph');
  const erase=async page=>{for(let index=0;index<6;index++){await page.keyboard.press('Backspace');await page.waitForTimeout(40)}};
  await Promise.all([erase(a),erase(b)]);
  current=await settled(pages,'concurrent deletion of the same text merges');
  assert.match(current,/^Second paragraph ?$/m,'the shared tail is removed once');

  // One replaces a paragraph while the other types inside it.
  await caret(a,'First paragraph','all');await caret(b,'First paragraph','alpha');
  await Promise.all([a.keyboard.type('Replaced by Alice',{delay:40}),b.keyboard.type(' bob-inside',{delay:40})]);
  current=await settled(pages,'replacement and typing inside it both survive');
  assert.match(current,/Replaced by Alice/);assert.match(current,/ bob-inside/);assert.doesNotMatch(current,/First paragraph/);

  // Offline typing in a passage another writer rewrites merges on reconnect.
  await b.context().setOffline(true);
  // Inside the range: the offline text lands whole before the replacement.
  // (Exactly at the range end it stays after the first replaced chunk; that
  // keeps a live caret beside a replaced word from jumping, and loses nothing.)
  await caret(b,'Second paragraph','Second');await b.keyboard.type(' OFFLINE',{delay:30});
  await caret(a,'Second paragraph','all');await a.keyboard.type('Rewritten online',{delay:30});await saved(a);
  await b.context().setOffline(false);
  current=await settled(pages,'offline overlap merges on reconnect');
  assert.match(current,/ OFFLINE/);assert.match(current,/Rewritten online/);

  // Renames are last-writer-wins and independent of body revisions.
  const name=page=>page.locator('#note-name');
  for(const page of pages){await name(page).click();await page.keyboard.press(process.platform==='darwin'?'Meta+a':'Control+a')}
  await Promise.all([a.keyboard.type('Alice name',{delay:40}),b.keyboard.type('Bob name',{delay:55})]);
  await Promise.all(pages.map(saved));
  assert.equal(await name(a).inputValue(),'Alice name','a name being typed is never replaced by another writer');
  assert.equal(await name(b).inputValue(),'Bob name');
  await a.locator('#note-editor').click();await b.locator('#note-editor').click();
  const winner=await title();assert.ok(['Alice name','Bob name'].includes(winner));
  await Promise.all(pages.map(page=>page.waitForFunction(value=>document.querySelector('#note-name').value===value,winner)));
  await settled(pages,'concurrent renames converge without review');
  await caret(b,'Third paragraph');await name(a).click();await a.keyboard.press(process.platform==='darwin'?'Meta+a':'Control+a');
  await Promise.all([a.keyboard.type('Renamed while typing',{delay:50}),b.keyboard.type(' body keeps moving the whole time',{delay:30})]);
  await a.locator('#note-editor').click();
  await settled(pages,'rename while another writer types');assert.equal(await title(),'Renamed while typing');

  // A pause after a space must not eat the space.
  await name(a).click();await a.keyboard.press(process.platform==='darwin'?'Meta+a':'Control+a');
  await a.keyboard.type('Hello ',{delay:40});await saved(a);await a.waitForTimeout(600);await a.keyboard.type('world',{delay:40});
  await a.locator('#note-editor').click();await saved(a);
  assert.equal(await title(),'Hello world');results.push('title keeps a space typed before a pause');

  // The open note's sidebar preview comes from the live snapshot, not one
  // whole-document HTTP read per keystroke in every connected window.
  const reads=[];b.on('request',request=>{if(request.method()==='GET'&&request.url().includes('/documents/'))reads.push(request.url())});
  await caret(a,'Third paragraph');await a.keyboard.type(' twenty more characters',{delay:40});
  await settled(pages,'typing settles');await b.waitForTimeout(2500);
  assert.ok(reads.length<=1,'an observing window re-read the note '+reads.length+' times for 23 keystrokes');
  results.push('no per-keystroke document reads in observing windows');

  assert.equal((await markdown(a)).trim(),(await markdown(b)).trim());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,results,limits:['Localhost Chromium, two writers; no native-client or remote-brain claim.']}));
} finally {
  await browser?.close();await server?.close();access.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}
