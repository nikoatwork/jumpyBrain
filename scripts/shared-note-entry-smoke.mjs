// A hosted /?note=<id> link opened in a fresh browser offers Connect and then opens that note.
// Real HTTP server, access store and Chromium over disposable Markdown; no shared data or real keys.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'jb-shared-note-entry-'));
const id='mem_47777777-7777-4777-8777-777777777777';
const initial=`---\nid: ${id}\ntitle: Shared entry fixture\ntype: note\n---\nShared fixture body\n`;
let server,browser,access;
const errors=[],passed=[];
try {
  await initializeMemoryRoot(root);
  const file=path.join(root,'notes/shared-entry.md');
  await writeFile(file,initial);
  access=new AccessStore(root);
  const writer=await access.issue({name:'Entry writer fixture',role:'writer'});
  const reader=await access.issue({name:'Entry reader fixture',role:'reader'});
  server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const link=`${server.url}/?note=${id}`;

  async function freshPage(width=1280) {
    const context=await browser.newContext({viewport:{width,height:844}});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));
    return {context,page};
  }
  async function unavailable(page,message) {
    await page.waitForFunction(expected=>document.querySelector('#note-title')?.textContent==='Note unavailable'
      &&document.querySelector('#note-message')?.textContent===expected,message);
  }
  async function connect(page,key) {
    await page.locator('#note-connect').click();
    assert.equal(await page.locator('#connection').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'api-key');
    await page.locator('#api-key').fill(key);
    await page.locator('#connection-submit').click();
  }
  const opened=page=>page.waitForFunction(title=>document.querySelector('#note-title')?.textContent===title,'Shared entry fixture');

  for(const width of [1280,390]) {
    // 1. A fresh browser has no session: missing auth offers Connect, not Retry.
    const {context,page}=await freshPage(width);
    await page.goto(link);
    await unavailable(page,'Connect with an access key to open this note.');
    assert.equal(await page.locator('#note-connect').isVisible(),true);
    assert.equal(await page.locator('#note-connect').innerText(),'Connect');
    assert.equal(await page.locator('#note-load-retry').isVisible(),false);
    const box=await page.locator('#note-connect').boundingBox();
    assert.ok(box&&box.x>=0&&box.x+box.width<=width,'Connect stays within the viewport');

    // 2. Cancel leaves the error and CTA in place; nothing is opened.
    await page.locator('#note-connect').click();
    await page.locator('#close-connection').click();
    assert.equal(await page.locator('#note-connect').isVisible(),true);

    // 3. A rejected key reports that and keeps Connect available.
    await connect(page,'jb_not_a_real_key_fixture');
    await unavailable(page,'Your access key was not accepted. Connect again to open this note.');
    assert.equal(await page.locator('#note-connect').isVisible(),true);
    assert.equal(await page.locator('#note-load-retry').isVisible(),false);

    // 4. A reader key opens the original note in place, read-only.
    await connect(page,reader.token);
    await opened(page);
    assert.equal(new URL(page.url()).searchParams.get('note'),id);
    await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='readonly');
    assert.equal(await page.locator('#note-editor').getAttribute('contenteditable'),'false');
    assert.match(await page.locator('#note-editor').innerText(),/Shared fixture body/);
    assert.equal(await page.locator('#note-connect').isVisible(),false);
    assert.equal(await page.locator('#connection').isVisible(),false);
    const exposed=await page.evaluate(()=>JSON.stringify({cookie:document.cookie,local:{...localStorage},session:{...sessionStorage},inputs:[...document.querySelectorAll('input')].map(input=>input.value),url:location.href}));
    assert.ok(!exposed.includes(reader.token),'key stays outside DOM, URL and JavaScript storage');

    // 5. Remembered access is the existing per-browser HttpOnly session: another tab in this
    // browser opens the link directly; a different (fresh) browser is still asked to connect.
    const sibling=await context.newPage();
    await sibling.goto(link);
    await opened(sibling);
    const cookies=await context.cookies();
    const session=cookies.find(cookie=>cookie.name.startsWith('jumpybrain_session_v2_'));
    assert.ok(session&&session.httpOnly&&session.sameSite==='Strict','session cookie is HttpOnly SameSite=Strict');
    assert.ok(session.expires>0&&session.expires-Date.now()/1000<=86400+5,'session lasts at most 24 hours');
    const other=await freshPage(width);
    await other.page.goto(link);
    await unavailable(other.page,'Connect with an access key to open this note.');
    await other.context.close();

    // 6. A writer key from the same CTA opens the note editable.
    const writerBrowser=await freshPage(width);
    await writerBrowser.page.goto(link);
    await unavailable(writerBrowser.page,'Connect with an access key to open this note.');
    await connect(writerBrowser.page,writer.token);
    await opened(writerBrowser.page);
    await writerBrowser.page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    assert.equal(await writerBrowser.page.locator('#note-editor').getAttribute('contenteditable'),'true');
    await writerBrowser.context.close();
    await context.close();
    passed.push(width);
  }

  // 7. Other failures keep their own guidance: an unknown note is not an auth problem.
  {
    const {context,page}=await freshPage();
    await page.goto(link);
    await connect(page,reader.token);
    await opened(page);
    await page.goto(`${server.url}/?note=mem_48888888-8888-4888-8888-888888888888`);
    await unavailable(page,'This note is no longer available. Use Search to find another note.');
    assert.equal(await page.locator('#note-connect').isVisible(),false);
    assert.equal(await page.locator('#note-load-retry').isVisible(),true);
    // Hosted note GETs have no per-note authorization, so an accepted key refused with 403 is
    // injected at the browser boundary to check that it is not presented as missing sign-in.
    await page.route(`**/memories/**/${id}**`,route=>route.request().method()==='GET'
      ?route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'forbidden',message:'Refused fixture.'}})})
      :route.continue());
    await page.goto(link);
    await unavailable(page,'This access key cannot open this note. Ask the server admin for access, or connect with another key.');
    assert.equal(await page.locator('#note-connect').innerText(),'Use another key');
    assert.equal(await page.locator('#note-load-retry').isVisible(),false);
    await context.close();
  }

  assert.equal(await readFile(file,'utf8'),initial,'opening the link never writes the note');
  assert.deepEqual(errors,[]);
  console.log(`Shared note entry smoke: PASS (widths ${passed.join(', ')}: missing-auth Connect CTA, cancel, rejected key, reader read-only and writer editable in place, same-browser HttpOnly session reuse, fresh browser still asked; 404 and injected 403 keep distinct guidance; no key in JS-visible state).`);
} finally {
  await browser?.close();await server?.close();access?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}
