// Excluded fixture entrypoint. Uses the production sandboxed welcome and gateway.
import { app, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createOnboardingWindow } from './onboarding.mjs';
import { suggestLocalBrain, companionControl } from './setup.mjs';
const f = JSON.parse(await readFile(process.env.JUMPYBRAIN_SIMPLE_ONBOARDING, 'utf8'));
app.setPath('userData', f.userData); app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
const js = script => window.webContents.executeJavaScript(script, true);
async function until(script) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await js(script)) return; await pause(30); }
  throw new Error('Timed out: ' + script);
}
async function close() { const closed = new Promise(resolve => window.once('closed', resolve)); window.close(); await closed; }
async function capture(mode) {
  for (const theme of ['light', 'dark']) for (const size of [[960, 720], [680, 620]]) {
    nativeTheme.themeSource = theme; window.setSize(...size); await pause(100);
    const action = mode === 'remote' ? 'connect' : 'remote-choice';
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await js(`document.getElementById('${action}').getBoundingClientRect().bottom <= innerHeight`), true, mode + ' actions fit');
    await writeFile(path.join(f.screenshots, `${mode}-${theme}-${size[0]}.png`), (await window.webContents.capturePage()).toPNG());
  }
}
void (async () => {
try {
  await app.whenReady();
  console.log('Simple onboarding: ready');
  const root = path.join(f.home, '.jumpybrain/memory');
  let choice = { canceled: true }, helperUnavailable = true;
  const options = { suggest: state => suggestLocalBrain(state, { home: f.home }), chooseFolder: async () => choice,
    control: async (...args) => { if (helperUnavailable) throw new Error('Fixture unavailable'); return companionControl(...args); } };
  let welcome = createOnboardingWindow(f, options); window = welcome.window; await welcome.loaded;
  console.log('Simple onboarding: welcome loaded');
  await until('!document.getElementById("retry").hidden && !document.getElementById("retry").disabled');
  assert.equal(await js('document.getElementById("open").hidden'), true);
  helperUnavailable = false;
  await js('document.getElementById("retry").click()');
  await until('!document.getElementById("open").disabled');
  assert.equal(await js('document.getElementById("retry").hidden'), true);
  assert.equal(await js('document.activeElement.id'), 'open');
  await assert.rejects(access(root));
  assert.equal(await js('document.getElementById("folder-path").textContent'), root);
  assert.equal(await js('document.getElementById("folder-help").open'), false);
  assert.equal(await js('typeof require'), 'undefined');
  await js('document.getElementById("choose").click()'); await until('!document.getElementById("choose").disabled');
  assert.equal(await js('document.getElementById("open").disabled'), false);
  await capture('local');
  await js('document.getElementById("choose").focus()');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await until('document.activeElement.id === "open"');
  await js('document.getElementById("open").click()'); assert.equal(await welcome.completed, true);
  assert.ok(welcome.starterPage); await access(path.join(root, 'pages/today.md')); await close();
  welcome = createOnboardingWindow(f, options); window = welcome.window; await welcome.loaded;
  console.log('Simple onboarding: welcome loaded');
  await until('!document.getElementById("open").disabled');
  assert.match(await js('document.getElementById("open").textContent'), /Open my notes/);
  await js('document.getElementById("remote-choice").click()');
  assert.equal(await js('document.activeElement.id'), 'remote-url');
  await capture('remote');
  await js('document.getElementById("remote-key").value = "discard-me"; document.getElementById("back").click()');
  assert.equal(await js('document.getElementById("remote-key").value'), '');
  assert.equal(await js('document.activeElement.id'), 'remote-choice');
  await js('document.getElementById("remote-choice").click()');
  await js(`document.getElementById('remote-url').value = ${JSON.stringify(f.remoteUrl)}; document.getElementById('remote-key').value = 'wrong-key'; document.getElementById('connect').click()`);
  await until('document.getElementById("message").dataset.error === "true" && !document.getElementById("connect").disabled');
  assert.match(await js('document.getElementById("message").textContent'), /key didn’t work/);
  assert.equal(await js('document.getElementById("remote-key").type'), 'password');
  assert.equal((await companionControl(f)).active.root, root);
  await js('document.getElementById("remote-key").value = "fictional-access-key"; document.getElementById("connect").click()');
  assert.equal(await welcome.completed, true);
  await until('document.getElementById("remote-key").value === ""');
  const state = await companionControl(f);
  assert.equal(state.active.kind, 'remote'); assert.equal(state.active.allowWrites, false);
  assert.equal(state.profiles.filter(p => p.kind === 'remote').length, 1);
  assert.equal(await js('JSON.stringify({...localStorage,...sessionStorage}).includes("fictional-access-key")'), false);
  await close();
  const missing = path.join(f.home, 'Unavailable saved folder');
  welcome = createOnboardingWindow(f, { ...options, suggest: () => suggestLocalBrain({ activeId: 'missing', profiles: [{ id: 'missing', kind: 'local', root: missing }] }) });
  window = welcome.window; await welcome.loaded;
  await until('document.getElementById("message").textContent.includes("saved folder") && !document.getElementById("choose").disabled');
  assert.equal(await js('document.getElementById("open").disabled'), true);
  await assert.rejects(access(missing));
  choice = { canceled: false, filePaths: [root] };
  await js('document.getElementById("choose").click()');
  await until('!document.getElementById("open").disabled && document.activeElement.id === "open"');
  await close(); await writeFile(f.result, JSON.stringify({ ok: true })); app.quit();
} catch (error) { console.error(error); app.exit(1); }

})();
