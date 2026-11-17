// Benchmark-only Electron entrypoint; production imports none of this instrumentation.
import { app, BrowserWindow, dialog, screen } from 'electron';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_RAM_RUN, 'utf8'));
const { startDesktopApplication } = await import(pathToFileURL(config.application));
const errors = [];
dialog.showMessageBox = async (options) => { errors.push(options.message); return { response: 0 }; };
const application = startDesktopApplication({ resourceDirectory: config.resources, userData: config.userData, background: true });
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const emit = async (type, data = {}) => appendFile(config.events, JSON.stringify({ timeMs: Date.now(), type, ...data }) + '\n');
let window;
const js = (source) => window.webContents.executeJavaScript(source, true);
async function until(check, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; if (errors.length) throw new Error(errors.join('; ')); await pause(100); }
  throw new Error('RAM workload condition timed out');
}
async function telemetry() {
  let renderer = null;
  if (window && !window.isDestroyed()) {
    renderer = await js(`({view:state.view,graphNodes:state.graph?.nodes?.length||0,graphEdges:state.graph?.edges?.length||0,
      graphDom:document.querySelectorAll('[data-testid="graph-node"]').length,layoutTimer:!!state.layoutTimer,
      editor:!!state.editor,heap:performance.memory?.usedJSHeapSize,scale:devicePixelRatio,
      viewport:[innerWidth,innerHeight],canvases:[...document.querySelectorAll('canvas')].map(c=>[c.width,c.height])})`);
    if (!window.webContents.debugger.isAttached()) window.webContents.debugger.attach('1.3');
    renderer.dom = await window.webContents.debugger.sendCommand('Memory.getDOMCounters');
  }
  return { windows: BrowserWindow.getAllWindows().length, renderer,
    mainHeap: process.memoryUsage(), processes: app.getAppMetrics().map(p => ({ pid:p.pid,type:p.type,memory:p.memory,cpu:p.cpu })) };
}
async function stage(name, operation, { settle = true } = {}) {
  await emit('start', { name }); const started = performance.now();
  const detail = await operation();
  await emit('operation-end', { name, latencyMs: performance.now()-started, detail });
  if (settle) { await emit('settle-start', { name }); await pause(config.settleSeconds*1000); }
  await emit('end', { name, telemetry: await telemetry() });
  console.log(name + ': complete');
}
async function open() {
  await application.openEditor(); window = BrowserWindow.getAllWindows()[0];
  assert.ok(window); window.setContentSize(1280, 820);
  await until(() => js('typeof companionRegistered!=="undefined" && companionRegistered && !companionFrozen && !document.getElementById("recent-refresh").disabled'));
}
async function navigate(destination, view) {
  await js(`navigation.navigate(${JSON.stringify(destination)})`);
  await until(() => js(`state.view===${JSON.stringify(view)} && ${view === 'note' ? '!!state.editor && document.getElementById("note-editor").isContentEditable' : view === 'graph' ? '!!state.graph && !document.getElementById("ready").hidden' : '!document.getElementById("recent-refresh").disabled'}`));
}
async function request(route, body) {
  const c = application.getHost().connection;
  const state = await (await fetch(c.origin+'/companion/state', {headers:{Authorization:'Bearer '+c.key}})).json();
  const response = await fetch(c.origin + '/memories/all/' + route, { method: body === undefined ? 'GET':'POST',
    headers: { Authorization:'Bearer '+c.key, 'Content-Type':'application/json', 'X-Companion-Generation':String(state.generation) },
    ...(body === undefined ? {} : { body:JSON.stringify(body) }), signal:AbortSignal.timeout(650000) });
  const packet = await response.json();
  if (!response.ok) throw new Error('Fixture request '+route+': '+JSON.stringify(packet));
  return packet;
}
async function edit(marker) {
  await navigate('/?note=mem_a0000000-0000-4000-8000-000000000001', 'note');
  await js(`(()=>{const el=document.getElementById('note-editor');el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await pause(100); await window.webContents.insertText('\n'+marker);
  await until(() => js(`richEditor.getMarkdown().includes(${JSON.stringify(marker)})`));
  assert.equal(await js('state.editor.flush()'), true, 'save must be confirmed');
  assert.ok((await readFile(config.root+'/notes/ram-00000.md','utf8')).includes(marker));
  await navigate('/', 'home');
  await navigate('/?note=mem_a0000000-0000-4000-8000-000000000001','note');
  assert.ok(await js(`richEditor.getMarkdown().includes(${JSON.stringify(marker)})`));
}
async function graph() {
  await navigate('/graph','graph');
  await js(`(()=>{document.getElementById('zoom-in').click();document.getElementById('zoom-out').click()})()`);
  const target=await js(`(()=>{const r=document.getElementById('graph').getBoundingClientRect();return {x:Math.round(r.x+r.width*.4),y:Math.round(r.y+r.height*.5),pan:{...state.pan}}})()`);
  window.webContents.sendInputEvent({type:'mouseDown',x:target.x,y:target.y,button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:target.x+80,y:target.y+40});
  window.webContents.sendInputEvent({type:'mouseUp',x:target.x+80,y:target.y+40,button:'left',clickCount:1});
  await until(async()=>{const pan=await js('state.pan');return pan.x!==target.pan.x||pan.y!==target.pan.y;});
  for (const size of [[1600,1000],[800,600],[1280,820]]) { window.setContentSize(...size); await pause(300); }
  return js('({nodes:state.graph.nodes.length,edges:state.graph.edges.length,stats:state.graph.stats,warnings:state.graph.warnings})');
}
app.on('will-quit', () => console.log('guarded quit complete'));
void (async () => {
  try {
    await stage('cold-background', async()=> {
      await until(() => { if(application.getStartupError()) throw application.getStartupError(); return application.getHost()?.isAlive(); });
      assert.equal(BrowserWindow.getAllWindows().length,0);
      return { display:screen.getPrimaryDisplay(), electron:process.versions.electron };
    });
    await stage('home', open);
    if (config.count) await stage('note-edit-save', () => edit('ram-save-'+config.label));
    await stage('graph-pan-zoom-resize', graph);
    await stage('graph-exit', () => navigate('/','home'));
    for (const mode of config.semantic ? ['lexical','semantic'] : ['lexical']) {
      if (mode === 'semantic') {
        const file=config.root+'/jumpybrain.json', settings=JSON.parse(await readFile(file,'utf8'));
        settings.indexing={mode:'semantic',model:config.model,modelHash:config.modelHash};
        await writeFile(file,JSON.stringify(settings,null,2)+'\n');
      }
      await stage(mode+'-index', async()=>{const p=await request('index',{});return {work:p.work,readiness:p.readiness};});
      await stage(mode+'-search', async()=>{const p=await request('search',{query:mode==='lexical'?'ramneedle00000':'How are telescope sensors aligned before observations?',limit:5});
        if(config.count) assert.ok(p.results.length,'expected fixture search hits');
        if(mode==='semantic' && config.count) assert.ok(p.readiness.modes.includes('semantic'),'semantic mode must be ready');
        return {results:p.results.length,readiness:p.readiness,retrieval:p.retrieval};});
    }
    if(config.soakSeconds) {
      await emit('start',{name:'soak'});const deadline=Date.now()+config.soakSeconds*1000;let cycle=0;
      while(Date.now()<deadline) {
        if(config.count) await edit('ram-soak-'+config.label+'-'+cycle);
        await graph();await navigate('/','home');
        const result=await request('search',{query:'ramneedle00000',limit:5});
        await emit('soak-cycle',{cycle:cycle++,results:result.results.length,telemetry:await telemetry()});
        await pause(5000);
      }
      await emit('end',{name:'soak',cycles:cycle,telemetry:await telemetry()});
    }
    await stage('minimized',async()=>{window.minimize();await until(()=>window.isMinimized());});
    await stage('restored',async()=>{window.restore();await until(()=>!window.isMinimized());});
    await stage('closed-window',async()=>{window.close();await until(()=>window.isDestroyed());assert.ok(application.getHost().isAlive());});
    await stage('reopen',open);
    await stage('recovery',()=>pause(config.recoverySeconds*1000),{settle:false});
    await writeFile(config.result,JSON.stringify({ok:true,errors},null,2));
    await emit('start',{name:'explicit-quit'});application.quit();
  } catch(error) {
    await emit('failure',{error:error.stack});await writeFile(config.result,JSON.stringify({ok:false,error:error.stack,errors},null,2));
    await application.getHost()?.stop();app.exit(1);
  }
})();
