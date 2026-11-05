import assert from 'node:assert/strict';
import {observeContract} from './contract-observations.mjs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,realpath,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeMemoryRoot} from '../dist/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {startJumpyBrainHttpServer} from '../dist/adapters/http-server/index.js';
import {parseFrontmatter} from '../dist/core/canonical/markdown-store.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';

const id='mem_49999999-9999-4999-8999-999999999999',largeId='mem_49999999-9999-4999-8999-999999999998';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const build=JSON.parse(await readFile(new URL('../dist/adapters/diagnostics/build-info.json',import.meta.url),'utf8')).build;
const scriptSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jb-retained-browser-'))),file=path.join(root,'notes','retained.md');
const content=(body,noteId=id)=>`---\nid: ${noteId}\ntype: note\ntitle: Retained review\ncustom: protected\n---\n${body}`;
const initial='Acknowledged human text.\n',external='Observed external replacement.\n';
let server,browser,access;const contexts=[],issued=[],errors=[],scenarios=[];
const pass=id=>scenarios.push({id,passed:true});
async function until(check,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Deadline: '+label);}
async function openPage(credential,noteId=id,context){context??=await browser.newContext({permissions:['clipboard-read','clipboard-write']});if(!contexts.includes(context))contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.goto(`${server.url}/?note=${noteId}#apiKey=${credential.token}`);await page.waitForFunction(()=>['saved','readonly'].includes(state.editor?.collaboration?.state.status));return {page,context};}
async function review(page){if(await page.locator('#toggle-page-details').getAttribute('aria-expanded')!=='true')await page.locator('#toggle-page-details').click();assert.equal(await page.locator('#review-retained-version').innerText(),'Earlier versions');await page.locator('#review-retained-version').click();await page.waitForFunction(()=>document.querySelector('#retained-version-review')?.open&&document.querySelector('#retained-version-text')?.value.length>0);assert.equal(await page.locator('#retained-options').evaluate(element=>element.open),false,'full copies and copy controls start collapsed');assert.equal(await page.locator('#retained-changes').isVisible(),true,'changes are visible without opening options');assert.equal(await page.locator('#retained-close').innerText(),'Keep current note');assert.equal(await page.locator('#retained-restore').innerText(),'Use earlier version');}
async function options(page){if(!await page.locator('#retained-options').evaluate(element=>element.open))await page.locator('#retained-options > summary').click();}
async function currentBody(){return (await readFile(file,'utf8')).split('---\n').slice(2).join('---\n');}
async function update(credential,body){const url=server.url+'/memories/all/documents/'+id,headers={Authorization:'Bearer '+credential.token,'content-type':'application/json'};const before=await fetch(url,{headers});assert.equal(before.status,200);const read=await before.json();const response=await fetch(url,{method:'PUT',headers:{...headers,'If-Match':read.contentHash},body:JSON.stringify({content:content(body)})});assert.equal(response.status,200,await response.text());}
try{
  await initializeMemoryRoot(root);await writeFile(file,content(initial));access=new AccessStore(root);
  for(const role of ['writer','reader','reader'])issued.push(await access.issue({name:'Retained review '+role+' '+issued.length,role}));
  server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const writer=await openPage(issued[0]),page=writer.page;
  await writeFile(file,content(external));await page.waitForFunction(()=>Boolean(state.editor?.collaboration?.snapshot?.recovery));
  assert.equal(await page.evaluate(()=>state.editor.collaboration.state.status),'saved');assert.equal(await page.evaluate(()=>state.editor.collaboration.state.dirty),false);
  assert.equal(await page.locator('#note-retained-version').isVisible(),false,'complete retained copies do not require review');
  assert.equal(await page.locator('#review-retained-version').isVisible(),false,'retained copies stay under closed More info');
  assert.equal(await page.locator('#retained-version-review').evaluate(dialog=>dialog.open),false,'raw updates do not open a comparison');pass('optional-versions');
  await review(page);
  assert.equal(await page.locator('#retained-version-review > .dialog-actions > button').count(),2,'the main comparison has two choices');
  assert.equal(await page.locator('#retained-version-text').isVisible(),false,'full earlier copy stays in More options');assert.equal(await page.locator('#retained-copy').isVisible(),false,'copy is an optional action');
  const passages=await page.locator('#retained-changes').innerText();assert.match(passages,/Removed/);assert.match(passages,/Added/);assert.match(passages,/Acknowledged human text/);assert.match(passages,/Observed external replacement/);
  await options(page);assert.equal(await page.locator('#retained-version-text').inputValue(),'Retained review\n\n'+initial);assert.equal(await page.locator('#retained-current-text').inputValue(),'Retained review\n\n'+external);
  await page.locator('#retained-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Retained review\n\n'+initial);
  await page.locator('#retained-copy-current').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Retained review\n\n'+external);
  const beforeChoice=await readFile(file,'utf8');await page.locator('#retained-version-choice').selectOption('external');assert.equal(await page.locator('#retained-version-text').inputValue(),'Retained review\n\n'+external);await page.locator('#retained-version-choice').selectOption('base');assert.equal(await page.locator('#retained-version-text').inputValue(),'Retained review\n\n'+initial);assert.equal(await readFile(file,'utf8'),beforeChoice,'choosing an earlier copy for comparison does not publish it');
  assert.doesNotMatch(await page.locator('#retained-version-review').innerText(),/sha256:|\.jumpybrain|recoveryId/);pass('compare-copy');
  const comparisonFocus=await page.evaluate(()=>document.activeElement.id);assert.match(comparisonFocus,/^retained-/);
  await update(issued[0],'Newer human save after comparison.\n');await page.waitForFunction(()=>state.editor.collaboration.body.includes('Newer human save'));
  assert.equal(await page.evaluate(()=>richEditor.getMarkdown()),'Newer human save after comparison.\n');assert.equal(await page.evaluate(()=>state.editor.collaboration.state.status),'saved');assert.equal(await page.evaluate(()=>document.activeElement.id),comparisonFocus,'peer updates do not steal focus from the retained comparison');assert.equal(await page.locator('#retained-current-text').inputValue(),'Retained review\n\n'+external,'the reviewed comparison stays frozen until refresh');
  await page.locator('#retained-restore').click();await page.waitForFunction(()=>/Could not confirm this change/.test(document.querySelector('#retained-version-message').textContent));assert.equal(await page.locator('#retained-version-review').evaluate(dialog=>dialog.open),true,'failed restore keeps the comparison open');assert.equal(await currentBody(),'Newer human save after comparison.\n');assert.equal(await page.locator('#retained-restore').isDisabled(),true);pass('stale-comparison');
  await page.locator('#retained-refresh').click();await page.waitForFunction(()=>!document.querySelector('#retained-restore').disabled);
  await options(page);const reviewed=await page.locator('#retained-version-text').inputValue();await page.locator('#retained-restore').click();await page.waitForFunction(()=>!document.querySelector('#retained-version-review').open&&state.editor.collaboration.state.status==='saved');
  assert.equal('Retained review\n\n'+await currentBody(),reviewed);const restoredMetadata=parseFrontmatter(await readFile(file,'utf8')).frontmatter;assert.equal(restoredMetadata.custom,'protected');assert.equal(restoredMetadata.id,id);pass('writer-restore');
  observeContract('retained-restore',{body:await currentBody(),custom:restoredMetadata.custom,idPreserved:restoredMetadata.id===id,status:await page.evaluate(()=>state.editor.collaboration.state.status),comparisonClosed:await page.locator('#retained-version-review').evaluate(dialog=>!dialog.open)});
  const readOnly=await openPage(issued[1]);await review(readOnly.page);assert.equal(await readOnly.page.locator('#retained-restore').isHidden(),true);assert.match(await readOnly.page.locator('#retained-version-message').innerText(),/requires write access/);await options(readOnly.page);await readOnly.page.locator('#retained-copy').click();assert.ok((await readOnly.page.evaluate(()=>navigator.clipboard.readText())).includes('Retained review'));pass('reader-readonly');
  await access.revoke(issued[1].credential.id);await readOnly.page.waitForFunction(()=>state.editor.collaboration.state.status==='blocked');await readOnly.page.locator('#retained-refresh').click();await readOnly.page.waitForFunction(()=>/Could not load the earlier text/.test(document.querySelector('#retained-version-message').textContent));assert.equal(await readOnly.page.locator('#retained-restore').isHidden(),true);pass('revocation');
  const unique=await openPage(issued[0]);await review(unique.page);
  // Deliberately declare a complete local replacement to isolate draft retention.
  // Actual keyboard range capture is exercised by the production editor proof.
  const adopted=await unique.page.evaluate(async()=>{const prior='Unique private draft A',before=state.editor.collaboration.body;richEditor.setMarkdown(prior);state.editor.input(prior,{before,after:prior,operations:[{start:0,deleteCount:before.length,insert:prior}]});document.querySelector('#retained-restore').click();await new Promise(resolve=>setTimeout(resolve,0));return {prior};});
  await unique.page.waitForFunction(()=>!document.querySelector('#retained-version-review').open&&state.editor.collaboration.state.status==='saved');
  assert.equal(await unique.page.evaluate(prior=>Object.keys(localStorage).filter(key=>key.startsWith('jumpybrain.collaboration.draft.v2:')).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).some(record=>record?.clientId?.startsWith('archive:')&&record.body===prior),adopted.prior),true);pass('unique-draft');
  const denied=await openPage(issued[0]);await review(denied.page);
  const retained=await denied.page.evaluate(async()=>{const original=Storage.prototype.setItem,before=state.editor.collaboration.body,after='Private draft retained during storage failure';richEditor.setMarkdown(after);state.editor.input(after,{before,after,operations:[{start:0,deleteCount:before.length,insert:after}]});Storage.prototype.setItem=function(key,value){if(key.startsWith('jumpybrain.collaboration.draft.v2:'))throw new DOMException('Injected storage denial','QuotaExceededError');return original.call(this,key,value);};document.querySelector('#retained-restore').click();await new Promise(resolve=>setTimeout(resolve,0));const result={body:state.editor.collaboration.body,visible:document.querySelector('#note-editor').textContent,message:document.querySelector('#retained-version-message').textContent};state.editor.collaboration.dispose();Storage.prototype.setItem=original;return result;});
  assert.equal(retained.body,'Private draft retained during storage failure');assert.equal(retained.visible,retained.body);assert.match(retained.message,/Could not confirm this change/);assert.equal(await denied.page.locator('#retained-version-review').evaluate(dialog=>dialog.open),true,'storage failure leaves the draft comparison open');pass('storage-failure');await denied.context.close();
  // A second same-origin tab changes the credential through the real connection UI.
  await review(page);
  const switcher=await openPage(issued[0],id,writer.context);await switcher.page.locator('#open-connection').click();await switcher.page.locator('#api-key').fill(issued[2].token);await switcher.page.locator('#connection-submit').click();
  await page.waitForFunction(()=>!document.querySelector('#retained-version-review').open&&document.querySelector('#retained-version-text').value===''&&document.querySelector('#retained-changes').textContent==='');pass('scope-switch');
  const largeFile=path.join(root,'notes','large.md'),largeBefore='a'.repeat(1_600_000),largeAfter='b'.repeat(1_600_000);await writeFile(largeFile,content(largeBefore,largeId));
  const large=await openPage(issued[0],largeId),copies=[];large.page.on('websocket',socket=>socket.on('framesent',event=>{try{const packet=JSON.parse(event.payload);if(packet.method==='recovery.read')copies.push(packet.params.copy??'both');}catch{}}));
  // Existing socket was opened before observation; monitor it via the browser's public event stream.
  await large.page.reload();await large.page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
  await writeFile(largeFile,content(largeAfter,largeId));await large.page.waitForFunction(()=>Boolean(state.editor?.collaboration?.snapshot?.recovery));await review(large.page);
  await options(large.page);
  assert.equal((await large.page.locator('#retained-version-text').inputValue()).length,'Retained review\n\n'.length+largeBefore.length);assert.equal((await large.page.locator('#retained-current-text').inputValue()).length,'Retained review\n\n'.length+largeAfter.length);assert.deepEqual(copies.slice(-3),['both','base','external']);pass('large-copy-fallback');await large.context.close();
  for(const context of contexts)await context.close().catch(()=>{});
  const pointer=path.join(root,'.jumpybrain','recovery',id,'latest.json');await writeFile(pointer,'{"version":1,"recoveryId":"../outside"}\n');const port=new URL(server.url).port;await server.close();server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:Number(port),autoIndex:false});
  const incomplete=await openPage(issued[0]);await incomplete.page.waitForFunction(()=>state.editor?.collaboration?.snapshot?.recoveryDiscovery==='incomplete');assert.equal(await incomplete.page.locator('#note-retained-version').isVisible(),true,'incomplete discovery still warns outside More info');assert.match(await incomplete.page.locator('#note-retained-version').innerText(),/Some retained versions could not be verified/);assert.equal(await incomplete.page.locator('#toggle-page-details').getAttribute('aria-expanded'),'false');assert.equal(await currentBody(),(await incomplete.page.evaluate(()=>state.editor.collaboration.body)));pass('discovery-incomplete');
  assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({version:1,passed:true,realBrowser:true,authenticatedAPI:true,head,build,scriptSha256,scenarios,limitations:['Localhost shipped-shell proof; not a public VPS deployment or physical accessibility audit.']},null,2)+'\n');
}catch(error){let detail=error?.stack??String(error);for(const credential of issued)detail=detail.split(credential.token).join('[redacted]');process.stderr.write(detail+'\n');process.exitCode=1;}
finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{});access?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
