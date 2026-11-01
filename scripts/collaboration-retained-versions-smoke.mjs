import assert from 'node:assert/strict';
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
async function review(page){await page.locator('#review-retained-version').click();await page.waitForFunction(()=>document.querySelector('#retained-version-review')?.open&&document.querySelector('#retained-version-text')?.value.length>0);}
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
  assert.match(await page.locator('#note-retained-version').innerText(),/External file replaced saved text/);pass('notification');
  await review(page);assert.equal(await page.locator('#retained-version-text').inputValue(),'Retained review\n\n'+initial);assert.equal(await page.locator('#retained-current-text').inputValue(),'Retained review\n\n'+external);
  await page.getByText('Show changed passages',{exact:true}).click();const passages=await page.locator('#retained-changes').innerText();assert.match(passages,/Retained passage:/);assert.match(passages,/Current saved passage:/);assert.match(passages,/Acknowledged human text/);assert.match(passages,/Observed external replacement/);
  await page.locator('#retained-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Retained review\n\n'+initial);
  await page.locator('#retained-copy-current').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Retained review\n\n'+external);
  assert.doesNotMatch(await page.locator('#retained-version-review').innerText(),/sha256:|\.jumpybrain|recoveryId/);pass('compare-copy');
  await update(issued[0],'Newer human save after comparison.\n');await page.waitForFunction(()=>state.editor.collaboration.body.includes('Newer human save'));
  await page.locator('#retained-restore').click();await page.waitForFunction(()=>/Could not preserve or confirm/.test(document.querySelector('#retained-version-message').textContent));assert.equal(await currentBody(),'Newer human save after comparison.\n');assert.equal(await page.locator('#retained-restore').isDisabled(),true);pass('stale-comparison');
  await page.locator('#retained-refresh').click();await page.waitForFunction(()=>!document.querySelector('#retained-restore').disabled);
  const reviewed=await page.locator('#retained-version-text').inputValue();await page.locator('#retained-restore').click();await page.waitForFunction(()=>/Reviewed text restored/.test(document.querySelector('#retained-version-message').textContent));
  assert.equal('Retained review\n\n'+await currentBody(),reviewed);const restoredMetadata=parseFrontmatter(await readFile(file,'utf8')).frontmatter;assert.equal(restoredMetadata.custom,'protected');assert.equal(restoredMetadata.id,id);pass('writer-restore');
  await page.locator('#retained-close').click();
  const readOnly=await openPage(issued[1]);await review(readOnly.page);assert.equal(await readOnly.page.locator('#retained-restore').isHidden(),true);assert.match(await readOnly.page.locator('#retained-version-message').innerText(),/requires write access/);await readOnly.page.locator('#retained-copy').click();assert.ok((await readOnly.page.evaluate(()=>navigator.clipboard.readText())).includes('Retained review'));pass('reader-readonly');
  await access.revoke(issued[1].credential.id);await readOnly.page.waitForFunction(()=>state.editor.collaboration.state.status==='blocked');await readOnly.page.locator('#retained-refresh').click();await readOnly.page.waitForFunction(()=>/Could not verify retained text/.test(document.querySelector('#retained-version-message').textContent));assert.equal(await readOnly.page.locator('#retained-restore').isHidden(),true);pass('revocation');
  const unique=await openPage(issued[0]);await review(unique.page);
  // Deliberately declare a complete local replacement to isolate draft retention.
  // Actual keyboard range capture is exercised by the production editor proof.
  const adopted=await unique.page.evaluate(async()=>{const prior='Unique private draft A',before=state.editor.collaboration.body;richEditor.setMarkdown(prior);state.editor.input(prior,{before,after:prior,operations:[{start:0,deleteCount:before.length,insert:prior}]});document.querySelector('#retained-restore').click();await new Promise(resolve=>setTimeout(resolve,0));return {prior};});
  await unique.page.waitForFunction(()=>/Reviewed text restored/.test(document.querySelector('#retained-version-message').textContent));
  assert.equal(await unique.page.evaluate(prior=>Object.keys(localStorage).filter(key=>key.startsWith('jumpybrain.collaboration.draft.v2:')).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).some(record=>record?.clientId?.startsWith('archive:')&&record.body===prior),adopted.prior),true);pass('unique-draft');
  const denied=await openPage(issued[0]);await review(denied.page);
  const retained=await denied.page.evaluate(async()=>{const original=Storage.prototype.setItem,before=state.editor.collaboration.body,after='Private draft retained during storage failure';richEditor.setMarkdown(after);state.editor.input(after,{before,after,operations:[{start:0,deleteCount:before.length,insert:after}]});Storage.prototype.setItem=function(key,value){if(key.startsWith('jumpybrain.collaboration.draft.v2:'))throw new DOMException('Injected storage denial','QuotaExceededError');return original.call(this,key,value);};document.querySelector('#retained-restore').click();await new Promise(resolve=>setTimeout(resolve,0));const result={body:state.editor.collaboration.body,visible:document.querySelector('#note-editor').textContent,message:document.querySelector('#retained-version-message').textContent};state.editor.collaboration.dispose();Storage.prototype.setItem=original;return result;});
  assert.equal(retained.body,'Private draft retained during storage failure');assert.equal(retained.visible,retained.body);assert.match(retained.message,/Could not preserve or confirm/);pass('storage-failure');await denied.context.close();
  // A second same-origin tab changes the credential through the real connection UI.
  await page.locator('#review-retained-version').click();await page.waitForFunction(()=>document.querySelector('#retained-version-review').open);
  const switcher=await openPage(issued[0],id,writer.context);await switcher.page.locator('#open-connection').click();await switcher.page.locator('#api-key').fill(issued[2].token);await switcher.page.locator('#connection-submit').click();
  await page.waitForFunction(()=>!document.querySelector('#retained-version-review').open&&document.querySelector('#retained-version-text').value===''&&document.querySelector('#retained-changes').textContent==='');pass('scope-switch');
  const largeFile=path.join(root,'notes','large.md'),largeBefore='a'.repeat(1_600_000),largeAfter='b'.repeat(1_600_000);await writeFile(largeFile,content(largeBefore,largeId));
  const large=await openPage(issued[0],largeId),copies=[];large.page.on('websocket',socket=>socket.on('framesent',event=>{try{const packet=JSON.parse(event.payload);if(packet.method==='recovery.read')copies.push(packet.params.copy??'both');}catch{}}));
  // Existing socket was opened before observation; monitor it via the browser's public event stream.
  await large.page.reload();await large.page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
  await writeFile(largeFile,content(largeAfter,largeId));await large.page.waitForFunction(()=>Boolean(state.editor?.collaboration?.snapshot?.recovery));await review(large.page);
  assert.equal((await large.page.locator('#retained-version-text').inputValue()).length,'Retained review\n\n'.length+largeBefore.length);assert.equal((await large.page.locator('#retained-current-text').inputValue()).length,'Retained review\n\n'.length+largeAfter.length);assert.deepEqual(copies.slice(-3),['both','base','external']);pass('large-copy-fallback');await large.context.close();
  for(const context of contexts)await context.close().catch(()=>{});
  const pointer=path.join(root,'.jumpybrain','recovery',id,'latest.json');await writeFile(pointer,'{"version":1,"recoveryId":"../outside"}\n');const port=new URL(server.url).port;await server.close();server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:Number(port),autoIndex:false});
  const incomplete=await openPage(issued[0]);await incomplete.page.waitForFunction(()=>state.editor?.collaboration?.snapshot?.recoveryDiscovery==='incomplete');assert.match(await incomplete.page.locator('#note-retained-version').innerText(),/Some retained versions could not be verified/);assert.equal(await currentBody(),(await incomplete.page.evaluate(()=>state.editor.collaboration.body)));pass('discovery-incomplete');
  assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({version:1,passed:true,realBrowser:true,authenticatedAPI:true,head,build,scriptSha256,scenarios,limitations:['Localhost shipped-shell proof; not a public VPS deployment or physical accessibility audit.']},null,2)+'\n');
}catch(error){let detail=error?.stack??String(error);for(const credential of issued)detail=detail.split(credential.token).join('[redacted]');process.stderr.write(detail+'\n');process.exitCode=1;}
finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{});access?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
