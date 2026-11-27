import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {WebSocket} from 'ws';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {AccessStore,BrowserSessionStore,browserDeviceLabel} from '../dist/adapters/access-control/index.js';
const id='mem_57777777-7777-4777-8777-777777777777';
const DAY=24*60*60*1000;
const cookieOf=response=>(response.headers.getSetCookie?.()??[response.headers.get('set-cookie')]).filter(Boolean);
const v3=response=>cookieOf(response).find(item=>item.startsWith('jumpybrain_session_v3_'));

async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-browser-session-'));await initializeMemoryRoot(root);
  await writeFile(path.join(root,'notes/session.md'),`---\nid: ${id}\ntitle: Browser session\ntype: note\n---\nSaved source\n`);
  const access=new AccessStore(root);
  const clock={now:Date.parse('2026-11-25T10:00:00Z')};
  const start=port=>startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port,autoIndex:false,now:()=>clock.now});
  const state={server:await start(0)};
  t.after(async()=>{access.close();await state.server.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const signIn=async token=>{const response=await fetch(state.server.url+'/session',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);return {response,cookie:v3(response).split(';')[0]};};
  const get=(pathname,cookie)=>fetch(state.server.url+pathname,{headers:{Cookie:cookie}});
  return {root,access,clock,state,start,signIn,get};
}

test('sign-in issues an opaque 400-day session cookie that never contains the key, and survives restart',async t=>{
  const {root,access,state,start,signIn,get}=await fixture(t);
  const issued=await access.issue({name:'Human session',role:'writer'});
  const {response,cookie}=await signIn(issued.token);
  const header=v3(response);
  assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Max-Age=34560000/);assert.match(header,/Path=\//);
  assert.doesNotMatch(header,/Secure/,'plain HTTP loopback cannot set Secure');
  assert.ok(!decodeURIComponent(header).includes(issued.token),'the cookie holds no access key');
  assert.match(decodeURIComponent(cookie.split('=')[1]),/^jbs_[A-Za-z0-9_-]{43}$/);
  const packet=await response.json();assert.equal(packet.principal.id,issued.credential.id);assert.equal(packet.session.keyId,issued.credential.id);
  assert.doesNotMatch(JSON.stringify(packet),new RegExp(issued.token));
  const stored=await readFile(path.join(root,'.jumpybrain/sessions.json'),'utf8');
  assert.ok(!stored.includes(issued.token)&&!stored.includes(decodeURIComponent(cookie.split('=')[1])),'only a hash of the session id is stored');
  assert.equal((await get('/session',cookie)).status,200);
  const behindProxy=await fetch(state.server.url+'/session',{headers:{Authorization:'Bearer '+issued.token,'X-Forwarded-Proto':'https'}});
  assert.match(v3(behindProxy),/Secure/);
  const port=new URL(state.server.url).port;await state.server.close();state.server=await start(Number(port));
  assert.equal((await get('/session',cookie)).status,200,'a session survives a backend restart');
  assert.equal((await fetch(state.server.url+'/session',{headers:{Authorization:'Bearer '+decodeURIComponent(cookie.split('=')[1])}})).status,401,'a session id is not a bearer credential');
  assert.equal(browserDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),'Safari on iPhone');
  assert.equal(browserDeviceLabel(undefined),'Browser');
});

test('use renews the session at most once a day; a year of inactivity ends it',async t=>{
  const {root,access,clock,signIn,get}=await fixture(t);
  const issued=await access.issue({name:'Reader',role:'reader'});
  const {cookie}=await signIn(issued.token);
  const sessions=new BrowserSessionStore(root,{now:()=>clock.now});
  const lastSeen=async()=>(await sessions.list())[0].lastSeenAt;
  const first=await lastSeen();
  clock.now+=12*60*60*1000;
  const early=await get('/memories/all/recent',cookie);assert.equal(early.status,200);assert.equal(v3(early),undefined,'no re-issue within a day');
  assert.equal(await lastSeen(),first,'last use is not written on every request');
  clock.now+=13*60*60*1000;
  const renewed=await get('/memories/all/recent',cookie);assert.equal(renewed.status,200);
  assert.match(v3(renewed),/Max-Age=34560000/);assert.equal(v3(renewed).split(';')[0],cookie,'the same session is re-issued');
  assert.notEqual(await lastSeen(),first);
  assert.equal(v3(await get('/memories/all/recent',cookie)),undefined,'renewed once, not on every request after');
  for(const days of [30,200,399]){clock.now+=days*DAY;assert.equal((await get('/session',cookie)).status,200,`still signed in after ${days} idle days`);}
  clock.now+=400*DAY+1;
  const expired=await get('/session',cookie);assert.equal(expired.status,401);
  assert.equal(v3(expired),undefined,'a 401 never clears the shared cookie: a late reply could erase a newer session');
  assert.deepEqual(await sessions.list(),[]);
});

test('revoking a key ends its sessions on HTTP and live sockets; sign-out and admin sign-out end sessions',async t=>{
  const {access,state,signIn,get}=await fixture(t);
  const issued=await access.issue({name:'Human session',role:'writer'}),admin=await access.issue({name:'Admin',role:'admin'});
  const {cookie}=await signIn(issued.token);
  const socket=new WebSocket(state.server.url.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:state.server.url}});await once(socket,'open');
  t.after(()=>socket.terminate());
  const reply=once(socket,'message');socket.send(JSON.stringify({id:'hello',method:'hello',params:{protocol:2,token:'browser-session'}}));
  const hello=JSON.parse(String((await reply)[0]));assert.equal(hello.ok,true);assert.equal(hello.result.principal.id,issued.credential.id);
  const closed=once(socket,'close');
  const adminHeaders={Authorization:'Bearer '+admin.token};
  assert.equal((await fetch(state.server.url+'/access/'+issued.credential.id,{method:'DELETE',headers:adminHeaders})).status,200);
  assert.equal((await get('/session',cookie)).status,401);
  const [code]=await closed;assert.equal(code,1008);
  // Sign-out ends the server-side session, so a copied cookie stops working too.
  const other=await access.issue({name:'Laptop',role:'reader'});
  const one=await signIn(other.token),two=await signIn(other.token),three=await signIn(other.token);
  const logout=await fetch(state.server.url+'/session',{method:'DELETE',headers:{Origin:state.server.url,Cookie:one.cookie}});assert.equal(logout.status,200);
  assert.ok(cookieOf(logout).some(item=>/^jumpybrain_session_v3_[^=]+=; Max-Age=0/.test(item)));
  assert.equal((await get('/session',one.cookie)).status,401,'a signed-out session cannot be replayed');
  assert.equal((await fetch(state.server.url+'/session',{method:'DELETE',headers:{Origin:'https://untrusted.example',Cookie:two.cookie}})).status,403);
  const listed=await (await fetch(state.server.url+'/access/sessions',{headers:adminHeaders})).json();
  const mine=listed.sessions.filter(item=>item.keyId===other.credential.id);assert.equal(mine.length,2);
  assert.ok(mine.every(item=>!('secretHash' in item)&&item.label==='Browser'));
  assert.equal((await fetch(state.server.url+'/access/sessions',{headers:{Authorization:'Bearer '+other.token}})).status,403,'readers cannot list sessions');
  assert.equal((await (await fetch(state.server.url+'/access/sessions/'+mine[0].id,{method:'DELETE',headers:adminHeaders})).json()).ended,true);
  const statuses=await Promise.all([two,three].map(item=>get('/session',item.cookie).then(r=>r.status)));
  assert.deepEqual(statuses.sort(),[200,401]);
  assert.equal((await (await fetch(state.server.url+'/access/'+other.credential.id+'/sessions',{method:'DELETE',headers:adminHeaders})).json()).ended,1);
  assert.deepEqual(await Promise.all([two,three].map(item=>get('/session',item.cookie).then(r=>r.status))),[401,401],'sign out everywhere');
  assert.equal((await signIn(other.token)).response.status,200,'the key itself keeps working');
});

test('invite links are single-use, expire after 7 days, are tied to one key and need the exact origin',async t=>{
  const {access,clock,state,get}=await fixture(t);
  const reader=await access.issue({name:'Viewer',role:'reader'}),admin=await access.issue({name:'Admin',role:'admin'});
  const adminHeaders={Authorization:'Bearer '+admin.token};
  const invite=async keyId=>{const response=await fetch(state.server.url+'/access/'+keyId+'/invites',{method:'POST',headers:adminHeaders});assert.equal(response.status,201);return response.json();};
  const redeem=(code,origin=state.server.url,cookie)=>fetch(state.server.url+'/session/invite',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({code})});
  const grant=await invite(reader.credential.id);
  assert.match(grant.code,/^jbi_[A-Za-z0-9_-]{43}$/);assert.ok(!grant.code.includes(reader.token));
  assert.equal(Date.parse(grant.expiresAt)-clock.now,7*DAY);
  assert.equal((await fetch(state.server.url+'/access/'+reader.credential.id+'/invites',{method:'POST',headers:{Authorization:'Bearer '+reader.token}})).status,403,'only admins create invites');
  assert.equal((await fetch(state.server.url+'/access/00000000-0000-4000-8000-000000000000/invites',{method:'POST',headers:adminHeaders})).status,404);
  assert.equal((await redeem(grant.code,'https://untrusted.example')).status,403,'another site cannot sign this browser in');
  assert.equal((await fetch(state.server.url+'/session/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:grant.code})})).status,403,'Origin is required');
  const used=await redeem(grant.code);assert.equal(used.status,200);
  const packet=await used.json();assert.equal(packet.principal.id,reader.credential.id);assert.equal(packet.principal.role,'reader');
  const cookie=v3(used).split(';')[0];assert.match(v3(used),/Max-Age=34560000/);
  assert.equal((await get('/session',cookie)).status,200);
  // Reader sessions are view-only and cookie writes still need the exact Origin.
  const write=(origin)=>fetch(state.server.url+'/memories/all/notes',{method:'POST',headers:{Cookie:cookie,...(origin?{Origin:origin}:{}),'content-type':'application/json'},body:JSON.stringify({type:'note',body:'must not publish'})});
  const readOnly=await write(state.server.url);assert.equal(readOnly.status,403);assert.equal((await readOnly.json()).error.code,'read_only');
  assert.equal((await (await write('https://untrusted.example')).json()).error.code,'untrusted_origin');
  assert.equal((await (await write()).json()).error.code,'untrusted_origin');
  const again=await redeem(grant.code);assert.equal(again.status,410);assert.equal((await again.json()).error.code,'invite_invalid');
  assert.equal((await redeem('jbi_'+'A'.repeat(43))).status,410);assert.equal((await redeem(42)).status,410);
  const late=await invite(reader.credential.id);clock.now+=7*DAY+1;
  assert.equal((await redeem(late.code)).status,410,'expired after 7 days');
  const revokedLater=await invite(reader.credential.id);
  await access.revoke(reader.credential.id);
  assert.equal((await redeem(revokedLater.code)).status,410,'an invite for a revoked key signs nobody in');
  assert.equal((await get('/session',cookie)).status,401);
  // An invite never replaces a live sign-in, and the refused code stays usable.
  const writer=await access.issue({name:'Writer',role:'writer'});
  const first=v3(await redeem((await invite(writer.credential.id)).code)).split(';')[0];
  const kept=(await invite(writer.credential.id)).code;
  const refused=await redeem(kept,state.server.url,first);assert.equal(refused.status,409);assert.equal((await refused.json()).error.code,'already_signed_in');
  assert.equal((await get('/session',first)).status,200);
  assert.equal((await redeem(kept)).status,200,'the refused code was not spent');
  assert.equal((await redeem(grant.code,state.server.url.replace('http://','https://'))).status,403,'the invite route compares the scheme too');
  // Signing in again with the same key keeps the browser's session (other tabs stay connected).
  const same=await fetch(state.server.url+'/session',{headers:{Authorization:'Bearer '+writer.token,Cookie:first}});
  assert.equal(v3(same),undefined,'no fresh 400 days without a recorded renewal');assert.equal((await same.json()).session.keyId,writer.credential.id);
  assert.equal((await get('/session',first)).status,200);
  clock.now+=DAY;
  const renewedSame=await fetch(state.server.url+'/session',{headers:{Authorization:'Bearer '+writer.token,Cookie:first}});
  assert.equal(v3(renewedSame).split(';')[0],first,'the same session, renewed once a day');
});

test('a v2 key cookie from the previous version is exchanged once for a session',async t=>{
  const {root,access,state,get}=await fixture(t);
  const issued=await access.issue({name:'Old tab',role:'writer'});
  const legacy='jumpybrain_session_v2_'+createHash('sha256').update(realpathSync(root)).digest('hex').slice(0,16)+'='+encodeURIComponent(issued.token);
  assert.equal((await get('/memories/all/recent',legacy)).status,200,'open tabs keep working until they reload');
  const grant=await new BrowserSessionStore(root).createInvite(issued.credential.id);
  const refused=await fetch(state.server.url+'/session/invite',{method:'POST',headers:{Origin:state.server.url,Cookie:legacy,'Content-Type':'application/json'},body:JSON.stringify({code:grant.code})});
  assert.equal(refused.status,409,'a v2 sign-in is a live sign-in too');
  const deadV3=legacy.replace('jumpybrain_session_v2_','jumpybrain_session_v3_').split('=')[0]+'=jbs_'+'D'.repeat(43);
  const both=await fetch(state.server.url+'/session/invite',{method:'POST',headers:{Origin:state.server.url,Cookie:deadV3+'; '+legacy,'Content-Type':'application/json'},body:JSON.stringify({code:grant.code})});
  assert.equal(both.status,409,'a dead v3 cookie does not hide a live v2 sign-in');
  assert.ok(await new BrowserSessionStore(root).redeemInvite(grant.code,{label:'x',principal:id=>access.authenticateId(id)}),'the refused code stays usable');
  const migrated=await get('/session',legacy);assert.equal(migrated.status,200);
  const cookies=cookieOf(migrated);
  assert.ok(cookies.some(item=>/^jumpybrain_session_v2_[^=]+=; Max-Age=0/.test(item)),'the key cookie is cleared');
  const cookie=v3(migrated).split(';')[0];assert.ok(!cookie.includes(issued.token));
  assert.equal((await get('/session',cookie)).status,200);
  const socket=new WebSocket(state.server.url.replace(/^http/,'ws')+'/ws',{headers:{Cookie:legacy,Origin:state.server.url}});await once(socket,'open');
  t.after(()=>socket.terminate());
  const reply=once(socket,'message');socket.send(JSON.stringify({id:'hello',method:'hello',params:{protocol:2,token:'browser-session'}}));
  assert.equal(JSON.parse(String((await reply)[0])).ok,true,'a v2 cookie still opens live editing until it expires');
  await access.revoke(issued.credential.id);
  assert.equal((await get('/memories/all/recent',legacy)).status,401);assert.equal((await get('/session',cookie)).status,401);
});

test('ending one browser session closes only its socket; other clients of the key keep their presence',async t=>{
  const {access,state,signIn}=await fixture(t);
  const issued=await access.issue({name:'Two browsers',role:'writer'});
  const a=await signIn(issued.token),b=await signIn(issued.token);
  const open=async cookie=>{
    const socket=new WebSocket(state.server.url.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:state.server.url}});await once(socket,'open');t.after(()=>socket.terminate());
    const reply=once(socket,'message');socket.send(JSON.stringify({id:'hello',method:'hello',params:{protocol:2,token:'browser-session'}}));assert.equal(JSON.parse(String((await reply)[0])).ok,true);
    return socket;
  };
  const first=await open(a.cookie),second=await open(b.cookie);
  const closed=once(first,'close');
  await fetch(state.server.url+'/session',{method:'DELETE',headers:{Origin:state.server.url,Cookie:a.cookie}});
  assert.equal((await closed)[0],1008);
  const reply=once(second,'message');second.send(JSON.stringify({id:'ping',method:'ping',params:{}}));
  assert.equal(JSON.parse(String((await reply)[0])).ok,true,'the other browser stays connected');
});

test('session store: renewal writes once, a key cannot evict other keys, replacing happens in one change',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-session-store-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let now=Date.parse('2026-11-25T10:00:00Z');const store=new BrowserSessionStore(root,{now:()=>now});
  const keyA='11111111-1111-4111-8111-111111111111',keyB='22222222-2222-4222-8222-222222222222';
  const other=await store.create({keyId:keyB,role:'admin',label:'Admin laptop'});
  const first=await store.create({keyId:keyA,role:'reader',label:'Browser'});
  now+=DAY;
  assert.deepEqual(await Promise.all([1,2,3].map(()=>store.touch(first.session.id))).then(r=>r.filter(Boolean).length),1,'only one parallel renewal wins');
  const replaced=await store.create({keyId:keyA,role:'reader',label:'Browser',replacing:first.secret});
  assert.equal(await store.resolve(first.secret),undefined);assert.ok(await store.resolve(replaced.secret));
  for(let i=0;i<40;i++) await store.create({keyId:keyA,role:'reader',label:'Browser'});
  const spent=await store.createInvite(keyB);
  assert.ok(await store.redeemInvite(spent.code,{label:'x',principal:async id=>({id,name:'Admin',role:'admin'})}));
  assert.equal(JSON.parse(await readFile(path.join(root,'.jumpybrain/sessions.json'),'utf8')).invites.length,0,'a spent invite leaves the open-invite count at once');
  const listed=await store.list();
  assert.equal(listed.filter(item=>item.keyId===keyA).length,32,'each key keeps at most 32 sessions');
  assert.ok(await store.resolve(other.secret),'another key’s session is never evicted');
  const file=path.join(root,'.jumpybrain/sessions.json'),before=(await import('node:fs/promises')).stat(file);
  const stamp=(await before).mtimeMs;
  assert.equal(await store.redeemInvite('jbi_'+'B'.repeat(43),{label:'x',principal:async()=>undefined}),undefined);
  assert.equal((await (await import('node:fs/promises')).stat(file)).mtimeMs,stamp,'an unknown code writes nothing');
});

test('a brain served under a path prefix scopes its session cookie to that prefix',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-browser-session-prefix-'));await initializeMemoryRoot(root);
  const server=await startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port:0,autoIndex:false,basePath:'/sherpa'});
  t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const signedIn=await fetch(server.url+'/session',{headers:{Authorization:'Bearer disposable-operator'}});
  assert.equal(signedIn.status,200);
  assert.match(v3(signedIn),/; Path=\/sherpa(;|$)/);
  const cookie=v3(signedIn).split(';')[0];
  const signedOut=await fetch(server.url+'/session',{method:'DELETE',headers:{Cookie:cookie,Origin:server.url}});
  assert.equal(signedOut.status,200);
  for (const cleared of cookieOf(signedOut)) assert.match(cleared,/Max-Age=0; HttpOnly; SameSite=Strict; Path=\/sherpa(;|$)/);
  // Containers on one host may share an internal root path; a prefixed brain's cookie name differs from the root brain's.
  const atRoot=await startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port:0,autoIndex:false});
  try {
    const rootSignIn=await fetch(atRoot.url+'/session',{headers:{Authorization:'Bearer disposable-operator'}});
    assert.notEqual(v3(rootSignIn).split('=')[0],cookie.split('=')[0]);
    assert.match(v3(rootSignIn),/; Path=\/(;|$)/);
  } finally { await atRoot.close(); }
  for (const basePath of ['sherpa/','/graph','/team;beta','/.team']) await assert.rejects(startJumpyBrainHttpServer({root,apiKeys:['x'],port:0,autoIndex:false,basePath}),/base path/);
});
