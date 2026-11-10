// Real shared live shell; disposable Markdown only. Build once before running.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { splitEditableDocument } from '../dist/adapters/http-server/document-controller.js';
import { parseFrontmatter } from '../dist/core/frontmatter.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';
import { appendEditorText, editorMarkdown, editorSelection, selectEditorText, undoEditor, showSidebar } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jb-single-user-recovery-'));
const token = 'disposable-single-user-key';
const id = n => `mem_94222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const prefix = documentId => `---\nid: ${documentId}\ntype: note\ntitle: Single user note\ncustom: preserved\n---\n`;
let server, browser;
const results = [], errors = [];
const start = (port = 0) => startJumpyBrainHttpServer({ root, apiKeys: [token], port, autoIndex: false });
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
async function undoAttention(page) {
  await page.locator('#toast-action').click();
  await idle(page);
  assert.equal(await page.locator('#toast-message').innerText(), 'Attention change undone.');
}
try {
  await mkdir(path.join(root, 'notes'));
  server = await start();
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const [index, width] of [1280, 390].entries()) {
    const documentId = id(index + 1), file = path.join(root, 'notes', `${index + 1}.md`);
    await writeFile(file, prefix(documentId) + 'Original saved note.\n');
    const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const transport = await installCollaborationSmokeTransport(page);
    let patchRequests = 0;
    page.on('request', request => { if (request.method() === 'PATCH' && request.url().includes('/memories/all/documents/')) patchRequests++; });
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
  console.log(JSON.stringify({ passed: true, results, limits: ['Disposable shared Chromium shell and real local HTTP/WebSocket server; not native Mac lifecycle, physical input or proof of either historical cause.'] }));
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
