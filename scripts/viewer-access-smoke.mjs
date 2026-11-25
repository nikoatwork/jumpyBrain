// A reader opens a one-click invite link, reads, stays signed in while the server clock moves
// past 24 hours and 30 days, and sees Connect after an admin revokes the key.
// Real HTTP server, access store and Chromium over disposable Markdown; no shared data or real keys.
// Optional: --out <dir> keeps 390 px screenshots of the viewer path.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';

const outIndex=process.argv.indexOf('--out'),out=outIndex>0?path.resolve(process.argv[outIndex+1]):undefined;
const root=await mkdtemp(path.join(os.tmpdir(),'jb-viewer-access-'));
const id='mem_48888888-8888-4888-8888-888888888888',other='mem_49999999-9999-4999-8999-999999999999';
const DAY=24*60*60*1000;
const clock={now:Date.now()};
let server,browser,access;
const errors=[],passed=[];
const check=async(name,run)=>{await run();passed.push(name);};
try {
  await initializeMemoryRoot(root);
  await writeFile(path.join(root,'notes/viewer.md'),`---\nid: ${id}\ntitle: Viewer fixture\ntype: note\n---\nA note for readers. See [[Second fixture]].\n`);
  await writeFile(path.join(root,'notes/second.md'),`---\nid: ${other}\ntitle: Second fixture\ntype: note\n---\nLinked reading.\n`);
  access=new AccessStore(root);
  const admin=await access.issue({name:'Owner fixture',role:'admin'});
  const viewer=await access.issue({name:'Viewer fixture',role:'reader'});
  server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:0,autoIndex:false,now:()=>clock.now});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  if(out) await mkdir(out,{recursive:true});
  const shot=async(page,name)=>{if(out) await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});};
  async function freshPage(width=1280) {
    const context=await browser.newContext({viewport:{width,height:844}});
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.url});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));
    return {context,page};
  }
  const connected=page=>page.waitForFunction(()=>connectionStatus==='connected'&&activeApiKey==='browser-session');
  const noOverflow=async(page,where)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),where+' has no horizontal scroll');

  // The admin copies an invite link for the reader's key from the Access keys dialog.
  const owner=await freshPage();
  await owner.page.goto(`${server.url}/#apiKey=${admin.token}`);await connected(owner.page);
  const inviteFor=async name=>{
    await owner.page.locator('#open-connection').click();await owner.page.locator('#open-access-keys').click();
    await owner.page.locator('#access-keys-dialog[open]').waitFor();
    const button=owner.page.getByRole('button',{name:'Copy invite link for '+name});await button.waitFor();await button.click();
    await owner.page.waitForFunction(()=>!document.getElementById('access-keys-link').hidden&&document.getElementById('access-keys-link-url').value);
    const link=await owner.page.locator('#access-keys-link-url').inputValue();
    assert.equal(await owner.page.evaluate(()=>navigator.clipboard.readText()),link,'the link is copied');
    assert.match(await owner.page.locator('#access-keys-link-expiry').innerText(),/Works once, until/);
    await owner.page.locator('#access-keys-link-done').click();await owner.page.locator('#access-keys-close').click();
    return link;
  };
  let link;
  await check('admin copies a one-click invite link that carries a code, never the key',async()=>{
    link=await inviteFor('Viewer fixture');
    assert.match(link,new RegExp('^'+server.url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/#invite=jbi_[A-Za-z0-9_-]{43}$'));
    assert.ok(!link.includes(viewer.token));
  });

  const {context,page}=await freshPage(390);
  const writes=[];page.on('request',request=>{if(!['GET','HEAD'].includes(request.method())&&!/^\/(session(\/invite)?|memories\/all\/(search|recall|recall\/compact|expand|resolve-title))$/.test(new URL(request.url()).pathname))writes.push(request.method()+' '+new URL(request.url()).pathname);});
  let cookie;
  await check('opening the invite link signs in once and lands on Home',async()=>{
    await page.goto(link);await connected(page);
    assert.equal(new URL(page.url()).hash,'','the code leaves the address bar');
    await page.locator('#home').waitFor();
    await shot(page,'01-invite-landing-home-390');await noOverflow(page,'Home');
    const cookies=await context.cookies(server.url);
    cookie=cookies.find(item=>item.name.startsWith('jumpybrain_session_v3_'));
    assert.ok(cookie&&cookie.httpOnly&&cookie.sameSite==='Strict','an HttpOnly SameSite=Strict session cookie');
    assert.ok(!cookie.value.includes(viewer.token)&&!decodeURIComponent(cookie.value).includes(viewer.token),'the cookie holds no key');
    const days=(cookie.expires*1000-Date.now())/DAY;assert.ok(days>399&&days<=400,'the cookie lasts as long as browsers allow ('+days+' days)');
    const exposed=await page.evaluate(()=>JSON.stringify({cookie:document.cookie,local:{...localStorage},session:{...sessionStorage},url:location.href}));
    assert.ok(!exposed.includes('jbs_')&&!exposed.includes(viewer.token),'no credential is readable by page script');
  });
  await check('a reader sees who they are, View only, and an explained New note instead of a 403',async()=>{
    await page.locator('#open-connection').click();
    assert.equal(await page.locator('#connection-message').innerText(),'Signed in as “Viewer fixture” · Reader, view only.');
    assert.equal(await page.locator('#disconnect').innerText(),'Sign out');
    await shot(page,'02-signed-in-as-390');
    await page.locator('#close-connection').click();
    await page.locator('#home-new').click();
    await page.waitForFunction(()=>/needs a writer or admin key.*reader access/.test(document.body.innerText));
    assert.deepEqual(writes,[],'nothing was sent');
  });
  const openNote=async()=>{
    await page.evaluate(id=>navigation.navigate('/?note='+id),id);
    await page.waitForFunction(()=>document.querySelector('#note-title')?.textContent==='Viewer fixture'&&state.editor?.collaboration?.state.status==='readonly');
  };
  await check('the reader opens and follows notes in view-only mode at 390 px',async()=>{
    await openNote();
    await page.waitForFunction(()=>document.getElementById('note-save-state').textContent==='View only');
    assert.equal(await page.locator('#note-editor').getAttribute('contenteditable'),'false');
    await shot(page,'03-note-reading-390');await noOverflow(page,'Note');
    await page.keyboard.press('Control+k');await page.locator('#note-search[open]').waitFor();
    await page.locator('#note-search-input').fill('Second');
    await shot(page,'04-search-390');await noOverflow(page,'Search');
    await page.keyboard.press('Escape');
    assert.deepEqual(writes,[]);
  });
  await check('after 25 hours and after 30 more days the reader is still signed in, and use renews the session',async()=>{
    clock.now+=25*60*60*1000;
    const renewal=page.waitForResponse(response=>new URL(response.url()).pathname==='/session');
    await page.reload();
    const renewed=(await (await renewal).headersArray()).filter(item=>item.name.toLowerCase()==='set-cookie').map(item=>item.value);
    assert.ok(renewed.some(item=>/^jumpybrain_session_v3_[^;]+; Max-Age=34560000/.test(item)),'the cookie is re-issued after a day');
    await connected(page);await openNote();
    clock.now+=30*DAY;
    await page.reload();await connected(page);await openNote();
    const sessions=await (await fetch(server.url+'/access/sessions',{headers:{Authorization:'Bearer '+admin.token}})).json();
    const mine=sessions.sessions.filter(item=>item.keyId===viewer.credential.id);
    assert.equal(mine.length,1);assert.equal(Date.parse(mine[0].lastSeenAt),clock.now,'last use moved with the clock');
    assert.match(mine[0].label,/Chrome|Browser/);
  });
  await check('used and expired invite links show a friendly ask-for-a-new-link page',async()=>{
    const used=await freshPage(390);
    await used.page.goto(link);
    await used.page.locator('#invite-problem[open]').waitFor();
    assert.match(await used.page.locator('#invite-problem-message').innerText(),/work once and expire after 7 days\. Ask the person who shared this brain for a new link\./);
    await shot(used.page,'05-used-invite-390');await noOverflow(used.page,'Used invite');
    await used.page.locator('#invite-problem-key').click();await used.page.locator('#connection[open]').waitFor();
    await used.context.close();
    const later=await inviteFor('Viewer fixture');clock.now+=7*DAY+60_000;
    const expired=await freshPage();
    await expired.page.goto(later);await expired.page.locator('#invite-problem[open]').waitFor();
    await expired.context.close();
    // A signed-in browser never switches identity from a link: it stays put, says why and leaves the code unused.
    const unused=await inviteFor('Viewer fixture');
    await page.goto(unused);await connected(page);
    await page.waitForFunction(()=>/already signed in as “Viewer fixture”, so the invite link was not used/.test(document.getElementById('app-toast')?.textContent||''));
    assert.equal(await page.locator('#invite-problem').evaluate(element=>element.open),false);
    // A tab already showing the brain gets the link as a fragment-only change and still uses it.
    const tab=await freshPage();
    await tab.page.goto(server.url+'/');await tab.page.waitForFunction(()=>connectionStatus==='disconnected');
    await tab.page.evaluate(hash=>{location.hash=hash;},new URL(unused).hash);
    await connected(tab.page);
    await tab.context.close();
  });
  await check('an invite link that points at a note lands on that note',async()=>{
    const fresh=await freshPage();
    const code=new URL(await inviteFor('Viewer fixture')).hash;
    await fresh.page.goto(`${server.url}/?note=${id}${code}`);
    await fresh.page.waitForFunction(()=>document.querySelector('#note-title')?.textContent==='Viewer fixture'&&connectionStatus==='connected');
    await fresh.context.close();
  });
  await check('revoking the key in the admin UI: the reader’s next action shows Connect',async()=>{
    await openNote();
    await owner.page.locator('#open-connection').click();await owner.page.locator('#open-access-keys').click();
    await owner.page.locator('#access-keys-dialog[open]').waitFor();
    await owner.page.getByRole('list',{name:'Browsers signed in with Viewer fixture'}).waitFor();
    owner.page.once('dialog',dialog=>dialog.accept());
    await owner.page.getByRole('button',{name:'Revoke key Viewer fixture'}).click();
    await owner.page.waitForFunction(()=>/Revoked “Viewer fixture”/.test(document.getElementById('access-keys-message').textContent));
    assert.equal(await owner.page.getByRole('list',{name:'Browsers signed in with Viewer fixture'}).count(),0,'its sessions are gone');
    await page.waitForFunction(()=>state.editor?.state.liveStatus==='blocked'||state.editor?.collaboration?.state.status==='blocked',undefined,{timeout:10000}).catch(()=>{});
    await page.evaluate(id=>navigation.navigate('/?note='+id),other);
    await page.waitForFunction(()=>document.querySelector('#note-message')?.textContent?.startsWith('Connect')||document.querySelector('#note-message')?.textContent?.includes('not accepted'));
    assert.equal(await page.locator('#note-connect').isVisible(),true,'Connect is offered');
    await page.reload();
    await page.waitForFunction(()=>connectionStatus!=='checking');
    assert.notEqual(await page.evaluate(()=>connectionStatus),'connected');
    const dead=(await context.cookies(server.url)).find(item=>item.name.startsWith('jumpybrain_session_v3_'));
    if(dead) assert.equal((await fetch(server.url+'/session',{headers:{Cookie:dead.name+'='+dead.value}})).status,401,'what is left of the cookie is dead');
  });
  await check('Sign out ends the server session, so a copied cookie stops working',async()=>{
    const writer=await access.issue({name:'Second reader',role:'reader'});
    const fresh=await freshPage();
    await fresh.page.goto(`${server.url}/#apiKey=${writer.token}`);await connected(fresh.page);
    const copied=(await fresh.context.cookies(server.url)).find(item=>item.name.startsWith('jumpybrain_session_v3_'));
    await fresh.page.locator('#open-connection').click();await fresh.page.locator('#disconnect').click();
    await fresh.page.waitForFunction(()=>connectionStatus==='disconnected');
    const replay=await fetch(server.url+'/session',{headers:{Cookie:copied.name+'='+copied.value}});
    assert.equal(replay.status,401);
    await fresh.context.close();
  });
  assert.deepEqual(errors,[]);
  console.log('Viewer access smoke: PASS\n- '+passed.join('\n- '));
} finally {
  await browser?.close();await server?.close();access?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}
