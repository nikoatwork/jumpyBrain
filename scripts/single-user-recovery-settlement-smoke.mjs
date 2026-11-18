// Real shared live shell; disposable Markdown only. Build once before running.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { AccessStore } from '../dist/adapters/access-control/index.js';
import { splitEditableDocument } from '../dist/adapters/http-server/document-controller.js';
import { parseFrontmatter } from '../dist/core/frontmatter.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';
import { appendEditorText, editorMarkdown, editorSelection, selectEditorText, undoEditor, showSidebar } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jb-single-user-recovery-'));
let token, readerToken, access;
const id = n => `mem_94222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const prefix = documentId => `---\nid: ${documentId}\ntype: note\ntitle: Single user note\ncustom: preserved\n---\n`;
let server, browser;
const results = [], errors = [];
const start = (port = 0) => startJumpyBrainHttpServer({ root, apiKeys: [], accessStore: access, port, autoIndex: false });
const saved = page => page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved' && !state.editor.state.dirty);
const idle = page => page.waitForFunction(() => !noteAttention.isBusy());
async function exact(page, file, expected) {
  await saved(page);
  const snapshot = await page.evaluate(() => state.editor.collaboration.snapshot);
  assert.equal(await editorMarkdown(page), expected);
  assert.equal(snapshot.body, expected);
  assert.equal(await readFile(file, 'utf8'), snapshot.prefix + expected, 'canonical bytes match the acknowledged live source');
  assert.equal(parseFrontmatter(snapshot.prefix).frontmatter.custom, 'preserved');
  assert.equal(await page.locator('#note-recover').isVisible(), false, 'clean saved work needs no draft review');
  return snapshot;
}
async function attention(page, action) {
  await page.evaluate(action => noteAttention.act(action, { id: state.editor.state.documentId, title: state.editor.state.title }, document.querySelector('#note-name')), action);
}
const act = (page, action, target) => page.evaluate(([action, target]) => noteAttention.act(action, target ?? { id: state.editor.state.documentId, title: state.editor.state.title }, document.querySelector('#note-name')), [action, target]);
const toastText = page => page.locator('#toast-message').innerText();
// Commit the PATCH on the real server, run `between`, then hand the browser its reply (or lose it).
async function interceptPatch(page, between, lose = false) {
  await page.route('**/memories/all/documents/**', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    if (lose === 'conflict') return route.fulfill({ status: 409, json: { error: { code: 'source_conflict', message: 'The open note has an unresolved conflict.' } } });
    const response = await route.fetch(), packet = await response.json();
    await between?.(packet);
    if (lose === 'replaced') await route.fulfill({ status: 409, json: { error: { code: 'backend_replaced', message: 'The backend changed during this request. Retry after reviewing any unconfirmed write.' } } });
    else if (lose) await route.abort('failed'); else await route.fulfill({ response, json: packet });
  });
  return () => page.unroute('**/memories/all/documents/**');
}
async function undoAttention(page) {
  await page.locator('#toast-action').click();
  await idle(page);
  assert.equal(await page.locator('#toast-message').innerText(), 'Attention change undone.');
}
try {
  await mkdir(path.join(root, 'notes'));
  access = new AccessStore(root);
  token = (await access.issue({ name: 'Disposable writer', role: 'writer' })).token;
  readerToken = (await access.issue({ name: 'Disposable reader', role: 'reader' })).token;
  server = await start();
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const [index, width] of [1280, 390].entries()) {
    const documentId = id(index + 1), file = path.join(root, 'notes', `${index + 1}.md`);
    await writeFile(file, prefix(documentId) + 'Original saved note.\n');
    const otherId = id(index + 11), otherFile = path.join(root, 'notes', `${index + 11}.md`);
    await writeFile(otherFile, prefix(otherId) + 'Another sidebar note.\n');
    const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const transport = await installCollaborationSmokeTransport(page);
    let patchRequests = 0; const patchUrls = [];
    page.on('request', request => { if (request.method() === 'PATCH' && request.url().includes('/memories/all/documents/')) { patchRequests++; patchUrls.push(request.url()); } });
    await page.goto(`${server.url}/?note=${documentId}#apiKey=${token}`);
    await exact(page, file, 'Original saved note.\n');
    await appendEditorText(page, ' Edited by me.');
    await saved(page);
    let expected = await editorMarkdown(page);
    assert.match(expected, /Edited by me/);

    // This exact shipped-live path used to fail before sending any PATCH.
    await showSidebar(page);
    await page.locator(`#sidebar-recent [data-page-link="${documentId}"]`).waitFor();
    await page.locator(`#sidebar-recent [data-page-link="${documentId}"]`).focus();
    await page.locator(`#sidebar-recent li:has([data-page-link="${documentId}"]) [data-attention-action="settle"]`).focus();
    await page.keyboard.press('Enter');
    await idle(page);
    assert.equal(await page.locator('#toast-message').innerText(), 'Settled.', 'a clean active live note settles without an external-change prompt');
    assert.equal(patchRequests, 1);
    await exact(page, file, expected);
    assert.match(await readFile(file, 'utf8'), /attention_at: null/);
    await undoAttention(page);
    await exact(page, file, expected);
    assert.doesNotMatch(await readFile(file, 'utf8'), /attention_at:/);
    results.push(`${width}: edited active note settles and Undo preserves its writing`);

    // HTTP returns before its broadcast checkpoint; open must confirm real live state.
    const heldCheckpoint = transport.holdNextEvent(documentId, snapshot => /attention_at: null/.test(snapshot.prefix));
    await attention(page, 'settle');
    await heldCheckpoint.arrived;
    await idle(page);
    assert.equal(await page.locator('#toast-message').innerText(), 'Settled.');
    await exact(page, file, expected);
    heldCheckpoint.release();
    await undoAttention(page);
    await exact(page, file, expected);

    // Broadcast arrives before HTTP receipt; an already-adopted hash is valid.
    await page.route('**/memories/all/documents/**', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch(), packet = await response.json();
      await page.waitForFunction(hash => state.editor.state.contentHash === hash, packet.contentHash);
      await route.fulfill({ response });
    });
    await attention(page, 'settle'); await idle(page);
    assert.equal(await page.locator('#toast-message').innerText(), 'Settled.');
    await page.unroute('**/memories/all/documents/**');
    await undoAttention(page);
    await exact(page, file, expected);
    results.push(`${width}: both metadata receipt/checkpoint orders preserve the live baseline`);

    await attention(page, 'snooze');
    await page.locator('#note-snooze').waitFor({ state: 'visible' });
    await page.locator('#snooze-options button').first().click(); await idle(page);
    assert.match(await page.locator('#toast-message').innerText(), /Snoozed until/);
    await exact(page, file, expected);
    await attention(page, 'reactivate'); await idle(page);
    assert.equal(await page.locator('#toast-message').innerText(), 'Note brought back.');
    await exact(page, file, expected);
    await appendEditorText(page, ' Continued.'); await saved(page);
    expected = await editorMarkdown(page);
    await exact(page, file, expected);
    await undoEditor(page); await saved(page);
    expected = await editorMarkdown(page);
    assert.doesNotMatch(expected, /Continued/);
    await exact(page, file, expected);
    results.push(`${width}: snooze, Bring back and continued typing/Undo preserve source`);

    // Metadata-only publication keeps the caret and the writer's own body Undo.
    await appendEditorText(page, ' Undo me.'); await saved(page);
    const undoable = await editorMarkdown(page);
    await selectEditorText(page, 4);
    const caret = await editorSelection(page);
    await act(page, 'settle'); await idle(page);
    assert.equal(await toastText(page), 'Settled.');
    assert.deepEqual(await editorSelection(page), caret, 'metadata publication keeps the caret');
    await exact(page, file, undoable);
    assert.match(await readFile(file, 'utf8'), /attention_at: null/);
    await undoEditor(page);
    await page.waitForFunction(() => !richEditor.getMarkdown().includes('Undo me.'));
    await exact(page, file, expected);
    assert.doesNotMatch(await readFile(file, 'utf8'), /attention_at:/, 'an Undo edit after settlement resurfaces the note by policy');
    results.push(`${width}: edit, Settle and own body Undo across the metadata checkpoint keep caret and exact source`);

    // Another sidebar note changes alone; the open writing surface is untouched.
    await selectEditorText(page, 6);
    const openCaret = await editorSelection(page), openBefore = await readFile(file, 'utf8'), otherPatch = patchRequests;
    await act(page, 'settle', { id: otherId, title: 'Single user note' }); await idle(page);
    assert.equal(await toastText(page), 'Settled.');
    assert.equal(patchRequests, otherPatch + 1); assert.match(patchUrls.at(-1), new RegExp(otherId));
    assert.match(await readFile(otherFile, 'utf8'), /attention_at: null/);
    assert.equal(await readFile(file, 'utf8'), openBefore, 'the open note is not rewritten');
    assert.deepEqual(await editorSelection(page), openCaret);
    await undoAttention(page);
    assert.doesNotMatch(await readFile(otherFile, 'utf8'), /attention_at:/);
    await exact(page, file, expected);
    results.push(`${width}: another note's Settle/Undo leaves the open note, caret and source untouched`);

    // A peer edit lands after the PATCH committed but before its reply: the write is
    // saved, the live owner already shows the newer revision, and nothing is retried.
    const peerPatch = patchRequests;
    let unroute = await interceptPatch(page, async packet => {
      const peer = await fetch(server.url + `/memories/all/documents/${documentId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': packet.contentHash }, body: JSON.stringify({ content: packet.content + ' Peer.' }) });
      assert.equal(peer.status, 200);
      await page.waitForFunction(() => state.editor.state.savedBody.includes('Peer.'));
    });
    await act(page, 'settle'); await idle(page); await unroute();
    assert.match(await toastText(page), /^Attention saved, but the open note changed afterwards/);
    assert.equal(await page.locator('#toast-action').isVisible(), false, 'no Undo for an unconfirmed outcome');
    assert.equal(patchRequests, peerPatch + 1);
    expected = await editorMarkdown(page);
    assert.match(expected, /Peer\.$/);
    await exact(page, file, expected);
    results.push(`${width}: a peer revision racing the receipt reports a saved change without error, retry or reopen`);

    // Lost reply: the outcome stays uncertain, the sidebar is reread, nothing is retried.
    const lostPatch = patchRequests;
    unroute = await interceptPatch(page, undefined, true);
    await act(page, 'settle'); await idle(page); await unroute();
    assert.match(await toastText(page), /^Could not confirm whether the attention change was saved/);
    assert.equal(await page.locator('#toast-action').isVisible(), false);
    await page.waitForTimeout(300);
    assert.equal(patchRequests, lostPatch + 1, 'a possibly committed PATCH is never retried');
    assert.match(await readFile(file, 'utf8'), /attention_at: null/, 'the lost reply had committed');
    await exact(page, file, expected);
    await act(page, 'reactivate'); await idle(page);
    assert.equal(await toastText(page), 'Note brought back.');
    await exact(page, file, expected);
    results.push(`${width}: a lost PATCH reply stays uncertain and is not retried`);

    // A committed write answered by a gateway 409 (backend replaced) is uncertain, never "not saved".
    const replacedPatch = patchRequests;
    unroute = await interceptPatch(page, undefined, 'replaced');
    await act(page, 'settle'); await idle(page); await unroute();
    assert.match(await toastText(page), /^Could not confirm whether the attention change was saved/);
    assert.equal(await page.locator('#toast-action').isVisible(), false);
    await page.waitForTimeout(300);
    assert.equal(patchRequests, replacedPatch + 1, 'a possibly committed PATCH is never retried');
    assert.match(await readFile(file, 'utf8'), /attention_at: null/, 'the 409 reply followed a committed write');
    await exact(page, file, expected);
    await act(page, 'reactivate'); await idle(page);
    assert.equal(await toastText(page), 'Note brought back.');
    await exact(page, file, expected);
    results.push(`${width}: a committed write answered by 409 stays uncertain and is not retried`);

    // A definitive pre-publication rejection (live write guard) still says "not saved".
    const conflictPatch = patchRequests;
    unroute = await interceptPatch(page, undefined, 'conflict');
    await act(page, 'settle'); await idle(page); await unroute();
    assert.match(await toastText(page), /^The attention change was not saved\./);
    assert.equal(patchRequests, conflictPatch + 1);
    assert.doesNotMatch(await readFile(file, 'utf8'), /attention_at: null/, 'nothing was published');
    await exact(page, file, expected);
    results.push(`${width}: a live-guard 409 before publication reports not saved`);

    // Permission: a reader can open the note but publish nothing, here or elsewhere.
    const readerContext = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const reader = await readerContext.newPage(); reader.setDefaultTimeout(15000);
    reader.on('pageerror', error => errors.push(error.message));
    let readerPatches = 0;
    reader.on('request', request => { if (request.method() === 'PATCH') readerPatches++; });
    await reader.goto(`${server.url}/?note=${documentId}#apiKey=${readerToken}`);
    await reader.waitForFunction(() => state.editor?.collaboration?.state.status === 'readonly');
    const beforeReader = await readFile(file, 'utf8');
    await act(reader, 'settle'); await idle(reader);
    assert.match(await toastText(reader), /reader access/);
    assert.equal(readerPatches, 0, 'the open note is refused before any PATCH');
    await act(reader, 'settle', { id: otherId, title: 'Single user note' }); await idle(reader);
    assert.match(await toastText(reader), /^The attention change was not saved\. .*reader access/);
    assert.equal(await readFile(file, 'utf8'), beforeReader);
    assert.doesNotMatch(await readFile(otherFile, 'utf8'), /attention_at:/);
    await readerContext.close();
    results.push(`${width}: a reader cannot change attention on the open or another note`);

    // Scope: a credential/brain transition while the reply is outstanding suppresses
    // the old scope's feedback and Undo; the canonical write is not repeated. The
    // synthetic scope bump retires that tab's editor, so it runs in its own tab.
    const scopeContext = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const scoped = await scopeContext.newPage(); scoped.setDefaultTimeout(15000);
    scoped.on('pageerror', error => errors.push(error.message));
    let scopedPatches = 0;
    scoped.on('request', request => { if (request.method() === 'PATCH') scopedPatches++; });
    await scoped.goto(`${server.url}/?note=${otherId}#apiKey=${token}`); await saved(scoped);
    const restoreScope = await interceptPatch(scoped, async () => { await scoped.evaluate(() => { credentialRevision++; }); });
    await act(scoped, 'settle'); await idle(scoped); await restoreScope();
    assert.notEqual(await toastText(scoped).catch(() => ''), 'Settled.');
    assert.equal(await scoped.locator('#toast-action').isVisible(), false, 'no Undo is offered in a later scope');
    assert.equal(scopedPatches, 1);
    const authorization = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const scopedNote = await (await fetch(server.url + `/memories/all/documents/${otherId}`, { headers: authorization })).json();
    assert.equal(scopedNote.frontmatter.attention_at, null, 'canonical state, not a repeated write, holds the committed change');
    await scopeContext.close();
    const reset = await fetch(server.url + `/memories/all/documents/${otherId}`, { method: 'PATCH', headers: { ...authorization, 'If-Match': scopedNote.contentHash }, body: JSON.stringify({ action: 'reactivate' }) });
    assert.equal(reset.status, 200);
    await exact(page, file, expected);
    results.push(`${width}: a scope change during the PATCH reply suppresses stale feedback and Undo`);

    // A current pending edit must be confirmed before attention PATCH is admitted.
    const heldBodyEvent = transport.holdNextEvent(documentId, snapshot => snapshot.body.includes('Pending edit.'));
    const heldEdit = transport.holdNextReply('edit');
    await appendEditorText(page, ' Pending edit.'); await Promise.all([heldEdit.arrived, heldBodyEvent.arrived]);
    const beforePending = patchRequests;
    await attention(page, 'settle');
    assert.equal(patchRequests, beforePending, 'pending body confirmation cannot be skipped');
    assert.equal(await page.evaluate(() => state.editor.state.dirty || state.editor.state.saveStatus === 'saving'), true);
    heldBodyEvent.release(); heldEdit.release(); await idle(page);
    assert.equal(await page.locator('#toast-message').innerText(), 'Settled.');
    expected = await editorMarkdown(page);
    assert.match(expected, /Pending edit/);
    await exact(page, file, expected);
    await undoAttention(page);

    // A real HTTP conflict stays actionable and does not mutate attention/content.
    const beforeRejected = await readFile(file, 'utf8');
    await page.route('**/memories/all/documents/**', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 412, contentType: 'application/json', body: '{"error":{"code":"precondition_failed"}}' }) : route.continue());
    await attention(page, 'settle'); await idle(page);
    assert.match(await page.locator('#toast-message').innerText(), /note changed/i);
    assert.equal(await readFile(file, 'utf8'), beforeRejected);
    await page.unroute('**/memories/all/documents/**');
    await exact(page, file, expected);
    results.push(`${width}: pending receipt is awaited and rejected metadata writes preserve source`);

    // Clean saved source can change across backend lifetime without becoming a private draft.
    await selectEditorText(page, width === 390 ? await page.locator('#note-editor').evaluate(element => element.textContent.length) : 5);
    const beforeRestart = await page.evaluate(() => state.editor.collaboration.snapshot);
    const writesBeforeRestart = transport.observed.filter(message => ['edit', 'title', 'undo', 'redo'].includes(message.method)).length;
    const port = Number(new URL(server.url).port);
    await server.close(); server = undefined;
    await page.waitForFunction(() => ['offline', 'connecting'].includes(state.editor.collaboration.state.status));
    const restartedBody = 'A wholly different saved source after restart.\n';
    const currentPrefix = splitEditableDocument(await readFile(file, 'utf8')).frontmatterPrefix;
    await writeFile(file, currentPrefix + restartedBody);
    server = await start(port);
    await exact(page, file, restartedBody);
    assert.notEqual(await page.evaluate(() => state.editor.collaboration.snapshot.epoch), beforeRestart.epoch);
    assert.equal(await editorSelection(page), null, 'unproven pre-restart caret is retired');
    assert.equal(await page.locator('#note-editor').evaluate(element => element === document.activeElement), false, 'continued typing requires deliberate fresh focus');
    assert.equal(transport.observed.filter(message => ['edit', 'title', 'undo', 'redo'].includes(message.method)).length, writesBeforeRestart, 'clean adoption never publishes a replacement');
    await appendEditorText(page, ' Fresh input.'); await saved(page);
    expected = await editorMarkdown(page);
    assert.match(expected, /Fresh input/);
    await exact(page, file, expected);
    await undoEditor(page); await exact(page, file, restartedBody);
    results.push(`${width}: clean changed-epoch source adopts without review or implicit write; fresh input/Undo works`);

    // Genuine failed private input remains retained; attention cannot bypass it.
    const beforeFailure = await readFile(file, 'utf8');
    const rejected = transport.rejectNext('edit', { code: 'source_unavailable' });
    await appendEditorText(page, ' Private unsaved input.'); await rejected.arrived;
    await page.waitForFunction(() => state.editor.collaboration.state.status === 'conflict');
    const beforeFailedAttention = patchRequests;
    await attention(page, 'settle'); await idle(page);
    assert.equal(patchRequests, beforeFailedAttention);
    assert.equal(await readFile(file, 'utf8'), beforeFailure);
    assert.match(await editorMarkdown(page), /Private unsaved input/);
    assert.equal(await page.locator('#note-recover').isVisible(), true);
    results.push(`${width}: genuine private failed draft remains reviewable and blocks settlement`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results, limits: ['Disposable shared Chromium shell and real local HTTP/WebSocket server; not native Mac lifecycle, physical input or proof of either historical cause.', 'The mid-reply scope change is a synthetic credential-revision bump, not a full credential or brain switch.'] }));
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
