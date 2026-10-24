// Test-only entrypoint for connection usability; excluded from distribution.
import { app } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createEditorWindow } from './window.mjs';
const config = JSON.parse(await readFile(process.env.JUMPYBRAIN_CONNECTION_FIXTURE, 'utf8'));
app.setPath('userData', config.userData); app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window, stage = 'startup'; const checks = [], errors = [];
const js = source => window.webContents.executeJavaScript(source, true);
async function until(source) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { if (await js("(() => { try { return (" + source + "); } catch { return false; } })()")) return; } catch { /* Scope changes replace the renderer. */ } await pause(40); }
  throw new Error('Timed out at ' + stage + ': ' + source);
}
const mark = value => { stage = value; console.log('Connection flow: ' + value); };
const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function input(selector, value) {
  await js(`{ const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); }`);
}
async function ready() { await until('typeof companionRegistered !== "undefined" && companionRegistered && !companionFrozen && !companionActionBusy'); }
async function settings() { await js('navigation.navigate("/settings")'); await until('state.view === "settings" && !navigation.isBusy()'); }
async function save() { await js('document.getElementById("companion-form").requestSubmit()'); await ready(); }
async function add() { await js('document.getElementById("companion-add").open = true'); }
async function select(id) {
  await input('#companion-brain-switch', id);
  await until(`companionState.activeId === ${JSON.stringify(id)}`); await ready();
}
async function action(id, name) {
  await js(`document.querySelector('[data-profile-id="${id}"] button[aria-label="${name}"]').click()`); await ready();
}
async function capture(name) { await writeFile(path.join(config.screenshots, name + '.png'), (await window.webContents.capturePage()).toPNG()); }
void (async () => {
try {
  await app.whenReady(); const editor = createEditorWindow(config, { confirmClose: () => false }); window = editor.window; await editor.loaded;
  window.webContents.on('console-message', (_event, ...details) => { if (String(details[1]).includes('Uncaught')) errors.push(String(details[1])); });
  await ready(); await settings();
  const personal = await js('companionState.activeId');
  mark('single brain');
  assert.equal(await js('document.getElementById("companion-brain-switch").hidden'), true);
  assert.equal(await js('document.querySelector(".companion-profile button[aria-label=Remove]").disabled'), true);
  await capture('one-brain');
  if (config.gate) {
    mark('manual inspection ready; create ' + config.gate + ' to continue');
    while (true) { try { await access(config.gate); break; } catch { await pause(250); } }
  }
  mark('add, validation and duplicate');
  await settings(); await add(); await save();
  assert.equal(await js('document.getElementById("companion-root").validity.valueMissing'), true);
  await input('#companion-root', path.join(config.roots.Work, 'missing')); await save();
  await until('!document.getElementById("companion-form-error").hidden');
  assert.equal(await js('companionState.profiles.length'), 1);
  assert.equal(await js('document.getElementById("companion-add").open'), true);
  await input('#companion-root', config.roots.Personal); await save();
  await until('document.getElementById("companion-form-error").textContent.includes("already uses")');
  await click('#companion-folder'); await ready();
  assert.equal(await js('document.getElementById("companion-root").value'), config.roots.Work);
  await save(); await until('companionState.profiles.length === 2');
  const work = await js('companionState.profiles.find(p=>p.name==="Work").id');
  assert.equal(await js('companionState.activeId'), personal, 'adding alone never switches the active brain');
  await until('!document.getElementById("toast-action").hidden');
  assert.equal(await js('document.getElementById("toast-action").textContent'), 'Switch');
  await capture('two-brains');
  await click('#toast-action'); await until(`companionState.activeId === ${JSON.stringify(work)}`); await ready();
  checks.push('empty/invalid/duplicate folders, inferred name, save then explicit Switch');
  mark('rename, connectivity and quick switching');
  await action(work, 'Edit'); await input('#companion-name', 'Work renamed'); await save();
  await until('document.getElementById("companion-brain-switch").selectedOptions[0].textContent === "Work renamed"');
  await action(work, 'Test connection');
  await until('document.getElementById("toast-message").textContent.includes("connected")');
  await js('navigation.navigate("/")'); await until('state.view === "home" && !navigation.isBusy()');
  await select(personal); assert.equal(await js('location.pathname'), '/', 'quick switch stays out of Settings');
  await select(work);
  // Change a real note and immediately switch through the same selector: the existing barrier must save it to Work.
  await js(`navigation.navigate('/?note=${config.id}')`); await until('state.editor?.state.loaded && !navigation.isBusy()');
  await js('richEditor.setMarkdown("Only in Work.\\nSaved before switching.\\n"); state.editor.input(richEditor.getMarkdown())');
  await select(personal);
  assert.equal(await js('state.view'), 'home');
  checks.push('rename/test, selector on Home, dirty Work note flushed before switching');
  mark('local and remote'); await settings(); await add();
  await input('#companion-kind', 'remote'); await input('#companion-url', config.remote + '/wrong-path'); await input('#companion-key', config.remoteKey);
  await save(); await until('!document.getElementById("companion-form-error").hidden');
  assert.equal(await js('document.getElementById("companion-key").value'), config.remoteKey, 'failed validation retains the entered key for correction');
  await input('#companion-url', config.remote);
  assert.equal(await js('document.getElementById("companion-writes").checked'), false);
  await save(); await until('companionState.profiles.length === 3');
  const remote = await js('companionState.profiles.find(p=>p.kind==="remote").id');
  await select(remote);
  assert.equal(await js('companionReadOnly()'), true);
  await settings(); assert.equal(await js('document.getElementById("companion-refresh-index").disabled'), true);
  await action(remote, 'Edit'); assert.equal(await js('document.getElementById("companion-key").value'), '');
  await input('#companion-name', 'Team'); await save(); await until('companionState.active.name === "Team"');
  await action(remote, 'Test connection'); await until('document.getElementById("toast-message").textContent.includes("connected")');
  await capture('remote-read-only');
  checks.push('real loopback remote, read-only default, blank-key rename and connectivity');
  mark('remove cancel, confirm and return to one brain');
  await select(personal); await settings();
  await js('window.confirm = () => false; undefined'); await action(remote, 'Remove');
  assert.equal(await js('companionState.profiles.length'), 3);
  await js('window.confirm = () => true; undefined'); await action(remote, 'Remove'); await until('companionState.profiles.length === 2');
  await action(work, 'Remove'); await until('companionState.profiles.length === 1');
  assert.equal(await js('document.getElementById("companion-brain-switch").hidden'), true);
  assert.equal(await js('document.querySelector(".companion-profile button[aria-label=Remove]").disabled'), true);
  // Native Mac minimum size, both palettes; mobile widths are covered in the browser smoke.
  for (const theme of ['light', 'dark']) {
    await js(`colorTheme.setPreference(${JSON.stringify(theme)})`);
    for (const width of [1200, 480]) { window.setSize(width, 860); await pause(100); assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true); await capture(theme + '-' + width); }
  }
  checks.push('cancel/confirm removal keeps notes, returns to single-brain UI, both themes at 1200/480px');
  assert.deepEqual(errors, []);
  await writeFile(config.result, JSON.stringify({ ok: true, checks }));
  window.destroy(); app.exit(0);
} catch (error) {
  if (window && !window.isDestroyed()) await capture('failure').catch(() => {});
  await writeFile(config.result, JSON.stringify({ ok: false, error: stage + ': ' + error.message }));
  console.error(stage + ': ' + error.stack); app.exit(1);
}

})();
