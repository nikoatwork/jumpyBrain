// Test-only main process. Real packaged application/native host/browser bundle;
// Chromium CDP input and AX APIs, not synthetic DOM composition events.
import { app, BrowserWindow, dialog } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const fixture = JSON.parse(await readFile(process.env.JUMPYBRAIN_NATIVE_INPUT_FIXTURE, 'utf8'));
const { startDesktopApplication } = await import(pathToFileURL(fixture.application));
let failure, window, completed = false, stage = 'startup';
const evidence = { ok: false, launch: 'Isolated matching Electron test entry imports the supplied packaged app.asar application module; no user installation is changed.', scope: 'Programmatic macOS Electron webContents IME composition/commit and exposed Chromium accessibility tree using supplied packaged application/runtime/native host resources. No physical keyboard IME, VoiceOver usability, notarization or publisher identity claim.', artifact: fixture.artifact, versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, checks: [], accessibility: {} };
dialog.showMessageBox = async () => ({ response: 0 });
const application = startDesktopApplication({ resourceDirectory: fixture.resources, userData: fixture.userData, background: true,
  updaterOptions: { home: fixture.home, appVersion: fixture.installedVersion, discover: async () => null, spawnWorker: () => assert.fail('An input proof must not start an updater.') } });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = source => window.webContents.executeJavaScript(source, true);
const cdp = (method, params = {}) => window.webContents.debugger.sendCommand(method, params);
async function until(check, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (application.getStartupError()) throw application.getStartupError(); if (await check()) return; await pause(30); } throw new Error('Native input condition timed out at ' + stage); }
function mark(next) { stage = next; console.log('Native input: ' + stage); }
async function agentEdit(text, rangeForRead = () => ({ start: 0, deleteCount: 0 })) {
  const run = (operation, flags = [], input = '') => new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(fixture.node, [fixture.cli, 'collaborate', operation, '--root', fixture.root, '--id', fixture.id, '--client-id', 'native-proof-agent', '--json', ...flags], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error('Packaged agent CLI failed at ' + stage + ' (exit ' + code + ')'))); child.stdin.end(input);
  });
  const read = await run('open');
  const { start, deleteCount } = rangeForRead(read.body);
  return run('edit', ['--start', String(start), '--delete', String(deleteCount), '--epoch', read.epoch, '--base-revision', String(read.revision)], text);
}
async function axNode(selector) {
  const { root } = await cdp('DOM.getDocument'); const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert.ok(nodeId, 'Missing production control ' + selector);
  const { node } = await cdp('DOM.describeNode', { nodeId }); const { nodes } = await cdp('Accessibility.getFullAXTree');
  const found = nodes.find(entry => entry.backendDOMNodeId === node.backendNodeId && !entry.ignored);
  assert.ok(found, 'Control is not exposed in the native Chromium AX tree: ' + selector);
  const summary = { role: found.role?.value, name: found.name?.value, properties: Object.fromEntries((found.properties ?? []).map(prop => [prop.name, prop.value?.value])) };
  evidence.accessibility[selector] = summary; return summary;
}
async function click(selector) {
  const point = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
app.on('will-quit', () => { writeFileSync(fixture.result, JSON.stringify({ ...evidence, ok: completed && !failure, error: failure?.message ?? (completed ? undefined : 'Native input proof stopped before completion at ' + stage) })); });
void (async () => {
  try {
    mark('host startup'); await until(() => application.getHost()?.isAlive()); mark('open desktop'); await application.openEditor(); window = BrowserWindow.getAllWindows()[0];
    await until(() => js('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen'));
    mark('open fixture note');
    await js(`navigation.navigate('/?note=' + ${JSON.stringify(fixture.id)})`);
    await until(() => js(`state.editor?.state.documentId === ${JSON.stringify(fixture.id)} && state.editor.collaboration?.state.status === 'saved'`));
    window.show(); window.focus(); window.webContents.focus();
    app.setAccessibilitySupportEnabled(true); assert.equal(app.isAccessibilitySupportEnabled(), true); evidence.nativeAccessibilityEnabled = true;
    assert.equal(process.versions.electron, fixture.packagedElectronVersion);
    window.webContents.debugger.attach('1.3'); await cdp('Accessibility.enable');
    mark('exposed editor/status semantics');
    const bodyAX = await axNode('#note-editor'); assert.equal(bodyAX.role, 'textbox'); assert.equal(bodyAX.name, 'Markdown note body'); assert.equal(bodyAX.properties.multiline, true);
    const titleAX = await axNode('#note-name'); assert.equal(titleAX.role, 'textbox'); assert.equal(titleAX.name, 'Page name');
    const saveAX = await axNode('#note-save-state'); assert.equal(saveAX.role, 'status'); assert.equal(saveAX.name, 'Saved'); assert.equal(saveAX.properties.live, 'polite'); evidence.accessibility.savedStatus = saveAX;
    evidence.checks.push('native AX editor/title labels and multiline/status live semantics');
    mark('native preedit with concurrent packaged CLI agent');
    await js(`(()=>{const e=document.getElementById('note-editor');e.focus();const r=document.createRange();r.selectNodeContents(e.lastElementChild);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
    await until(() => js('(()=>{const s=richEditor.collaborativeSelection();const end=state.editor.collaboration.snapshot.body.length;return s?.anchor===end&&s.focus===end})()')); 
    await cdp('Input.imeSetComposition', { text: 'にほんご', selectionStart: 4, selectionEnd: 4 });
    await until(() => js('richEditor.isComposing() && document.getElementById("note-editor").textContent.includes("にほんご")'));
    assert.equal(await js('state.editor.flush()'), false, 'preedit cannot pass a canonical publication barrier');
    await agentEdit('AGENT prefix\n');
    const during = await readFile(fixture.root + '/notes/native-input.md', 'utf8');
    const bodyOf = content => content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
    assert.equal(bodyOf(during), 'AGENT prefix\nNative editor anchor.\n\n', 'only the admitted agent edit reaches disk during native preedit');
    assert.equal(during.includes('にほんご'), false, 'uncommitted native preedit never enters canonical Markdown');
    await cdp('Input.insertText', { text: '日本語' });
    await until(() => js('!richEditor.isComposing() && state.editor.collaboration.state.status === "saved" && richEditor.getMarkdown().includes("日本語") && richEditor.getMarkdown().includes("AGENT prefix")'));
    assert.equal(await js('state.editor.flush()'), true);
    const saved = await readFile(fixture.root + '/notes/native-input.md', 'utf8');
    assert.equal(bodyOf(saved), 'AGENT prefix\nNative editor anchor.\n\n日本語', 'native commit and remote edit retain all intended and unrelated source');
    assert.equal(await js('richEditor.getMarkdown()'), bodyOf(saved)); assert.equal(saved.includes('にほんご'), false);
    evidence.checks.push('CDP native IME preedit blocks flush; remote packaged CLI edit survives Japanese commit and canonical Saved');
    mark('native overlapping preedit and recovery AX controls');
    await js(`(()=>{const e=document.getElementById('note-editor');e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
    await until(() => js('richEditor.captureSelection()?.isCollapsed() === false'));
    await cdp('Input.imeSetComposition', { text: 'きょうごう', selectionStart: 5, selectionEnd: 5 });
    await until(() => js('richEditor.isComposing()'));
    await agentEdit('Agent conflicting replacement.\n', body => ({ start: 0, deleteCount: body.length }));
    await cdp('Input.insertText', { text: '競合' });
    await until(() => js('!richEditor.isComposing() && state.editor.collaboration.state.status === "conflict"'));
    assert.equal(await js('state.editor.flush()'), false); assert.equal(await js('richEditor.getMarkdown()'), '競合');
    assert.equal(bodyOf(await readFile(fixture.root + '/notes/native-input.md', 'utf8')), 'Agent conflicting replacement.\n');
    const reviewAX = await axNode('#note-save-state'); assert.match(reviewAX.name, /^Changes need review: .+/, 'the accessible live status includes both the review state and its reason'); assert.equal(reviewAX.properties.live, 'polite'); evidence.accessibility.reviewStatus = reviewAX;
    await click('#note-recover'); await until(() => js('document.getElementById("document-recovery").open && document.getElementById("recovery-saved").value.includes("Agent conflicting replacement")'));
    const recoveryAX = await axNode('#document-recovery'); assert.equal(recoveryAX.role, 'dialog'); assert.equal(recoveryAX.name, 'Recover your draft');
    for (const [selector, name] of [['#recovery-draft', 'Your draft'], ['#recovery-saved', 'Current saved note']]) { const field = await axNode(selector); assert.equal(field.role, 'textbox'); assert.equal(field.name, name); assert.equal(field.properties.readonly, true); }
    for (const [selector, name] of [['#recovery-copy', 'Copy draft'], ['#recovery-publish', 'Publish reviewed draft'], ['#recovery-reload', 'Discard draft and load saved note'], ['#recovery-close', 'Keep editing']]) { const control = await axNode(selector); assert.equal(control.role, 'button'); assert.equal(control.name, name); }
    assert.ok((await js('document.getElementById("recovery-draft").value')).includes('競合'));
    evidence.checks.push('overlapping native IME retains both versions, blocks flush, exposes labeled readonly recovery fields and actions in AX tree');
    await click('#recovery-reload'); await until(() => js('!document.getElementById("document-recovery").open && state.editor.collaboration.state.status === "saved"'));
    mark('clean quit'); completed = true; app.quit();
  } catch (error) {
    failure = error;
    let stateSummary; try { stateSummary = window && !window.isDestroyed() ? await js('({path:location.pathname,view:state?.view,documentId:state?.editor?.state.documentId,loaded:state?.editor?.state.loaded,live:state?.editor?.collaboration?.state,status:document.getElementById("note-message")?.textContent,saveError:document.getElementById("note-save-error")?.textContent})') : undefined; } catch {}
    await writeFile(fixture.result, JSON.stringify({ ...evidence, ok: false, stage, stateSummary, error: error.message }));
    await application.getHost()?.stop(); app.exit(1);
  }
})();
