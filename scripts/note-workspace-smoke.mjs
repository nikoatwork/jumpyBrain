// Production editor shell and disposable Markdown only. The Electron smoke
// separately verifies the native window; this runner covers the document journey.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, indexMemory, readMemoryDocument } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { stampMemoryActor } from '../dist/core/contribution.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, replaceEditorText, undoEditor, selectEditorText, editorSelection, editorEnd } from './editor-smoke-helpers.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-note-workspace-'));
const root = path.join(temporary, 'memory');
const output = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || path.resolve('.local-pack/desktop/note-workspace');
const key = 'disposable-note-workspace-key';
const id = n => `mem_d7100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const title = 'Launch plan — a shared working document for the product, research and customer experience teams';
const location = 'pages/projects/' + 'research-and-planning-'.repeat(6) + 'brief.md';
const file = path.join(root, location);
const body = [
  '## The goal', '',
  'Build a focused place where people and their agents can keep useful knowledge together. The first version should make writing, reviewing and returning to a document feel effortless.', '',
  '## Decisions', '',
  'Keep the first release small. The document stays readable while tools help maintain context. Every accepted edit remains in ordinary Markdown.', '',
  '### What matters', '',
  'A writer should know what is saved, reach the right section, and copy a useful draft without learning a new workflow.', '',
  '## Review plan', '',
  '- [ ] Review the customer language', '- [ ] Confirm the first release scope', '',
  '```md', '# This is code, not an outline heading', '```', '',
  '> ## This quoted text is literal, not a supported heading', '',
  '## Decisions', '',
  'The second decision section records the follow-up discussion. Repeated headings must remain distinct navigation targets.', '',
  '### Open questions', '',
  'Which details help a newcomer feel confident? Keep unanswered questions visible rather than suggesting every draft is final.', '',
  '## Next steps', '',
  'Ask a coworker to review the wording. Give an agent the current draft when extra context would help, and compare changes before accepting conflicting edits.', '',
  '## Sources', '',
  'The customer interview notes and release discussion provide the evidence. Related suggestions can help discovery, but do not prove a claim.',
].join('\n');
const prefix = (n, name) => `---\nid: ${id(n)}\ntitle: ${JSON.stringify(name)}\ntype: note\ncreated_at: 2026-10-27T10:00:00.000Z\nupdated_at: 2026-10-28T12:00:00.000Z\n---\n`;
const source = stampMemoryActor(prefix(1, title) + body, { kind: 'agent', name: 'Research assistant' });
const errors = [], mutations = [];
let browser, server, gateway;
const saved = page => page.waitForFunction(() => state.editor?.state.saveStatus === 'saved' && !state.editor.state.dirty && !state.editor.state.saveInFlight);
try {
  await initializeMemoryRoot(root);
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(file, source);
  await writeFile(path.join(root, 'notes/empty.md'), prefix(2, 'A fresh document'));
  await writeFile(path.join(root, 'notes/second.md'), prefix(3, 'Coworker review') + '## Coworker review\n\nA separate document with independent context.\n');
  await indexMemory(root, { indexing: { mode: 'lexical' } });
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.fixtureClipboard = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.fixtureClipboard.push(text); } } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['PUT', 'PATCH', 'DELETE'].includes(request.method()) && /\/documents\//.test(request.url())) mutations.push(request.method());
  });
  const open = async n => {
    await page.goto(`${server.url}/?note=${id(n)}#apiKey=${key}`);
    await page.locator('#note-editor').waitFor({ state: 'visible' });
  };
  await open(1);
  assert.equal(await page.locator('#note-save-state').textContent(), 'Saved', 'a confirmed loaded baseline is visibly saved');
  assert.equal(await page.locator('#copy-note-draft').innerText(), 'Copy draft');
  assert.equal(await page.locator('#page-details').isHidden(), true);
  assert.equal(await page.locator('#format-controls').isHidden(), true, 'formatting is folded on note entry');
  assert.equal(await page.locator('#insert-reference').innerText(), 'Link', 'linking stays directly reachable');
  assert.equal(await page.locator('#note-section-count').innerText(), '8 sections', 'headings are discoverable before opening details');
  assert.equal(await page.locator('#delete-note').isVisible(), false);
  await page.evaluate(() => { window.fixtureEditorRoot = document.getElementById('note-editor'); });
  await page.locator('#toggle-page-details').click();
  await page.locator('#note-outline-list button').first().waitFor();
  const headings = await page.locator('#note-editor > :is(h1,h2,h3,h4,h5,h6)').allTextContents();
  assert.equal(headings.length, 8);
  assert.deepEqual(await page.locator('#note-outline-list button').allTextContents(), headings);
  assert.equal(await page.locator('#saved-version-editor').innerText(), 'Agent · Research assistant');
  assert.equal(await page.locator('#note-file').innerText(), location);
  assert.equal(await page.locator('#note-editor-hint').isHidden(), true);
  assert.equal(await page.locator('#saved-version-editor img').count(), 0);

  const duplicates = headings.flatMap((name, index) => name === 'Decisions' ? [index] : []);
  for (const index of duplicates) {
    await page.locator('#note-outline-list button').nth(index).click();
    await page.waitForFunction(index => {
      const selection = getSelection();
      let node = selection?.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      return node?.closest?.('h1,h2,h3,h4,h5,h6') === document.querySelectorAll('#note-editor > :is(h1,h2,h3,h4,h5,h6)')[index];
    }, index);
  }
  assert.equal(await page.evaluate(() => fixtureEditorRoot === document.getElementById('note-editor')), true);
  assert.equal(await editorMarkdown(page), body);
  assert.equal(await readFile(file, 'utf8'), source);
  assert.deepEqual(mutations, [], 'context and section navigation never write canonical Markdown');

  // Folding preserves an actual noncollapsed selection, not merely draft text.
  const visible = await page.locator('#note-editor').textContent();
  const start = visible.indexOf('Build a focused');
  await selectEditorText(page, start, start + 5);
  const selection = await editorSelection(page);
  await page.locator('#toggle-note-format').click();
  assert.deepEqual(await editorSelection(page), selection);
  assert.equal(await page.evaluate(() => fixtureEditorRoot === document.getElementById('note-editor')), true);
  assert.deepEqual(mutations, [], 'opening Format adds no save');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await saved(page);
  assert.equal(await editorMarkdown(page), body.replace('Build a focused', '**Build** a focused'));
  assert.equal(await page.locator('#toggle-note-format').getAttribute('aria-expanded'), 'true', 'autosave retains the fold state');
  await undoEditor(page); await saved(page);
  assert.equal(await editorMarkdown(page), body);
  await page.getByRole('button', { name: 'Bold', exact: true }).focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#format-controls').isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-note-format');
  // Keyboard entry retains Lexical's prior selection through ordinary tab focus.
  await selectEditorText(page, start, start + 5);
  await page.locator('#toggle-note-format').focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bold', exact: true }).focus(); await page.keyboard.press('Enter');
  await saved(page);
  assert.equal(await editorMarkdown(page), body.replace('Build a focused', '**Build** a focused'));
  await undoEditor(page); await saved(page);
  await page.locator('#note-editor').press('Escape');
  assert.equal(await page.locator('#toggle-note-format').getAttribute('aria-expanded'), 'true', 'ordinary writing Escape does not close Format');
  await page.locator('#open-search').click();
  await page.locator('#note-search-input').press('Escape');
  assert.equal(await page.locator('#toggle-note-format').getAttribute('aria-expanded'), 'true', 'Search owns its Escape');
  await page.locator('#toggle-note-format').click();
  assert.equal(await editorMarkdown(page), body);

  // The live count follows headings with details folded, excluding code/literals.
  await page.locator('#close-page-details').click();
  await replaceEditorText(page, '## One\n\n## One\n\n```md\n# Code\n```\n\n> # Literal');
  await page.waitForFunction(() => document.getElementById('note-section-count').textContent === '2 sections');
  await undoEditor(page);
  await page.waitForFunction(() => document.getElementById('note-section-count').textContent === '8 sections');
  await saved(page);
  await page.locator('#toggle-page-details').click();
  await page.locator('#note-outline-list button').nth(duplicates[1]).click();

  // A useful navigation action puts subsequent typing in the selected section.
  await page.keyboard.insertText('Refined ');
  const refined = body.replace('## Decisions\n\nThe second', '## Refined Decisions\n\nThe second');
  await page.waitForFunction(expected => richEditor.getMarkdown() === expected, refined);
  await saved(page);
  await undoEditor(page);
  await page.waitForFunction(expected => richEditor.getMarkdown() === expected, body);
  await saved(page);

  await page.locator('#close-page-details').click();
  assert.equal(await page.locator('#page-details').isHidden(), true);
  assert.equal(await page.locator('#toggle-page-details').evaluate(element => element === document.activeElement), true);
  await page.locator('#toggle-page-details').click();
  await page.locator('#close-page-details').focus();
  await page.keyboard.press('Escape');
  await page.locator('#page-details').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#toggle-page-details').evaluate(element => element === document.activeElement), true);

  await page.evaluate(() => getSelection().removeAllRanges());
  for (const width of [1280, 1180, 900, 390, 320]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.getElementById('note-panel').scrollTop = 0; }, theme);
    for (const expanded of [false, true]) {
      const current = await page.locator('#toggle-page-details').getAttribute('aria-expanded') === 'true';
      if (current !== expanded) await page.locator('#toggle-page-details').click();
      await page.evaluate(() => { document.getElementById('note-panel').scrollTop = 0; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${theme}, details ${expanded}: no document overflow`);
      assert.equal(await page.locator('#copy-note-draft').isVisible(), true);
      await page.waitForFunction(() => {
        const title = document.getElementById('note-name');
        return title.scrollHeight <= title.clientHeight + 1;
      });
      assert.equal(await page.locator('#note-name').evaluate(element => element.scrollHeight <= element.clientHeight + 1), true, 'long title grows after rail changes its writing width');
      if (expanded) {
        assert.equal(await page.locator('#page-details').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'long location wraps within details');
      }
      await page.screenshot({ path: path.join(output, `workspace-${width}-${theme}-${expanded ? 'context' : 'writing'}.png`) });
    }
  }
  // The fold-out uses existing palettes and touch targets without crowding prose.
  await page.locator('#close-page-details').click();
  await page.locator('#toggle-note-format').click();
  for (const width of [1280, 390, 320]) for (const theme of ['light', 'dark']) for (const palette of ['ember', 'ocean', 'mono']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(({ theme, palette }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.palette = palette; document.getElementById('note-panel').scrollTop = 0; }, { theme, palette });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(() => ({ width: innerWidth, overflow: [...document.querySelectorAll('body *')].filter(el => !el.closest('[hidden]') && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(el => [el.id || el.className, el.getBoundingClientRect().right]) }))));
    assert.equal(await page.locator('#format-controls').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'expanded tool groups fit');
    assert.ok(await page.locator('#note-panel').evaluate(el => el.clientHeight) >= 300, 'narrow layout leaves a usable writing area');
    await page.screenshot({ path: path.join(output, `format-${width}-${theme}-${palette}.png`) });
  }
  await page.locator('#toggle-note-format').click();
  await page.evaluate(() => delete document.documentElement.dataset.palette);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Dispatch supported DOM input and the copy click in one task, before the
  // ordinary 750ms debounce. Copy itself must not initiate a save or transmit.
  const beforeCopy = mutations.length;
  await page.evaluate(() => {
    const title = document.getElementById('note-name');
    title.value = 'Unsaved working copy'; title.dispatchEvent(new Event('input', { bubbles: true }));
    const editor = document.getElementById('note-editor'); editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.insertText(' A draft addition for review.');
  await page.evaluate(() => document.getElementById('copy-note-draft').click());
  await page.waitForFunction(() => fixtureClipboard.length === 1);
  const copied = await page.evaluate(() => ({ text: fixtureClipboard[0], title: state.editor.state.title, body: richEditor.getMarkdown(), dirty: state.editor.state.dirty }));
  assert.equal(copied.dirty, true);
  assert.equal(copied.text, copied.title + '\n\n' + copied.body);
  assert.match(copied.text, /A draft addition for review/);
  assert.equal(mutations.length, beforeCopy, 'copy adds no explicit save request');
  await page.locator('#toast-message').filter({ hasText: 'Draft copied' }).waitFor();
  await page.evaluate(() => state.editor.flush()); await saved(page);
  assert.doesNotMatch(await readFile(file, 'utf8'), /Start writing, or type/);

  await open(2);
  await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await replaceEditorText(page, 'A first sentence.');
  await page.locator('#note-editor-hint').waitFor({ state: 'hidden' });
  await undoEditor(page);
  await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await replaceEditorText(page, '```md\n# Not a page heading\n```');
  await page.locator('#note-editor-hint').waitFor({ state: 'hidden' });
  await undoEditor(page); await page.locator('#note-editor-hint').waitFor({ state: 'visible' });
  await page.evaluate(() => state.editor.flush());
  await page.locator('#toggle-page-details').click();
  assert.equal(await page.locator('#note-outline').isHidden(), true, 'empty document does not reserve an empty outline');
  assert.equal(await page.locator('#note-section-count').isHidden(), true);
  await page.locator(`.sidebar-page-link[href*="${id(3)}"]`).first().click();
  await page.waitForURL(url => url.searchParams.get('note') === id(3));
  await page.locator('#note-editor').filter({ hasText: 'independent context' }).waitFor();
  assert.equal(await page.locator('#page-details').isHidden(), true, 'new note resets details');
  assert.equal(await page.locator('#note-outline-list button').count(), 0);
  await page.locator('#toggle-page-details').click();
  assert.deepEqual(await page.locator('#note-outline-list button').allTextContents(), ['Coworker review']);
  assert.equal(await page.locator('#saved-version-editor').innerText(), 'Editor unknown');
  assert.equal(await page.locator('#note-file').innerText(), 'notes/second.md');
  assert.doesNotMatch(await readFile(path.join(root, 'notes/empty.md'), 'utf8'), /Start writing, or type/);

  // Complete first-note journey through real capture, formatting, references,
  // search, section navigation, Back, a blocked save and canonical reopening.
  await page.locator('#new-note').click();
  await page.waitForURL(url => ![id(1), id(2), id(3)].includes(url.searchParams.get('note')));
  await page.locator('#note-name').waitFor();
  const createdId = new URL(page.url()).searchParams.get('note');
  const createdUrl = page.url();
  assert.equal(await page.locator('#format-controls').isHidden(), true);
  await page.locator('#note-name').fill('A calmer writing journey');
  await page.locator('#note-name').press('Enter');
  await page.keyboard.insertText('A first thought');
  // Place the caret inside this paragraph: concatenated textContent has no
  // separator, so its exact start is also the preceding heading's end offset.
  await selectEditorText(page, (await page.locator('#note-editor').textContent()).indexOf('A first thought') + 1);
  await page.locator('#toggle-note-format').click();
  await page.getByRole('button', { name: 'Subheading', exact: true }).click();
  assert.match(await editorMarkdown(page), /## A first thought/, 'formatting the selected newly written paragraph');
  await page.waitForFunction(() => document.getElementById('note-section-count').textContent === '2 sections');
  await saved(page);
  await page.locator('#toggle-note-format').click();
  await editorEnd(page); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.locator('#insert-reference').click();
  await page.locator('#note-search-input').fill('Coworker review');
  await page.locator('#search-results [role=option]').filter({ hasText: 'Coworker review' }).first().click();
  await saved(page);
  assert.match(await editorMarkdown(page), /\[\[Coworker review\]\]/);
  await page.locator('#toggle-page-details').click();
  await page.locator('#note-outline-list button').first().click();
  await page.locator('#close-page-details').click();
  await page.locator('#note-name').focus();
  await page.locator('[data-page-reference="true"]').click();
  await page.waitForURL(url => url.searchParams.get('note') === id(3));
  await page.locator('#navigate-back').click();
  await page.waitForURL(url => url.searchParams.get('note') === createdId);
  await page.locator('#note-editor').waitFor();
  assert.equal(await page.locator('#format-controls').isHidden(), true, 'return opens a calm page');
  await page.locator('#open-search').click();
  await page.locator('#note-search-input').fill('Coworker review');
  await page.locator('#search-results [role=option]').filter({ hasText: 'Coworker review' }).first().click();
  await page.waitForURL(url => url.searchParams.get('note') === id(3));
  await page.locator('#navigate-back').click();
  await page.waitForURL(url => url.searchParams.get('note') === createdId);
  await page.locator('#note-editor').waitFor();
  const blockSave = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Fixture save unavailable' } }) });
  await page.route('**/documents/' + createdId, route => route.request().method() === 'PUT' ? blockSave(route) : route.continue());
  await editorEnd(page); await page.keyboard.insertText(' Continued after returning.');
  await page.locator('#note-retry').waitFor();
  await page.locator('#home-link').click();
  await page.waitForFunction(() => !state.editor.state.navigationPending && !document.getElementById('note-retry').hidden);
  assert.equal(new URL(page.url()).searchParams.get('note'), createdId, 'failed save blocks departure');
  assert.equal(await page.locator('#copy-note-draft').isVisible(), true);
  await page.unroute('**/documents/' + createdId);
  await page.locator('#note-retry').click(); await saved(page);
  const created = await readMemoryDocument(root, createdId);
  assert.match(created.content, /## A first thought/);
  assert.match(created.content, /\[\[Coworker review\]\]/);
  assert.match(created.content, /Continued after returning/);
  assert.doesNotMatch(created.content, /Start writing, or type/);
  await page.goto(createdUrl); await page.locator('#note-editor').waitFor();
  assert.match(await editorMarkdown(page), /Continued after returning/);
  assert.equal(await page.locator('#format-controls').isHidden(), true);
  await context.close();

  // A real read-only remote brain keeps useful context/copy while empty-state
  // guidance never invites an edit the selected connection cannot perform.
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  const controlKey = 'd'.repeat(64), keys = new Map();
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) } });
  await gateway.store.save({ kind: 'remote', name: 'Review-only workspace', url: server.url, allowWrites: false, key }, gateway.store.snapshot().revision);
  const profile = gateway.store.snapshot().profiles.find(profile => profile.name === 'Review-only workspace');
  const switched = await fetch(gateway.url + '/companion/switch', { method: 'POST', headers: { Authorization: 'Bearer ' + controlKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: profile.id }) });
  assert.equal(switched.status, 200);
  const readonlyContext = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await readonlyContext.request.post(gateway.url + '/companion/session', { data: { token: controlKey }, headers: { Origin: gateway.url } });
  const readonly = await readonlyContext.newPage(); readonly.on('pageerror', error => errors.push(error.message));
  await readonly.goto(`${gateway.url}/?note=${id(2)}&brain=${profile.id}`);
  await readonly.locator('#note-editor').waitFor({ state: 'visible' });
  assert.equal(await readonly.locator('#note-editor').getAttribute('aria-readonly'), 'true');
  assert.equal(await readonly.locator('#note-editor-hint').isHidden(), true);
  assert.equal(await readonly.locator('#copy-note-draft').isVisible(), true);
  assert.equal(await readonly.locator('#toggle-note-format').isHidden(), true);
  assert.equal(await readonly.locator('#format-controls').isHidden(), true);
  await readonly.locator('#toggle-page-details').click();
  assert.equal(await readonly.locator('#delete-note').isDisabled(), true);
  await readonlyContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS folding-desk journey: real create/title/body, pointer and keyboard selection formatting/undo, direct reference insertion/follow/Back/search, section counts/jumps, autosave/reopen, failed-save departure guard/Retry, immutable folding, scoped Escape/focus, read-only, exact draft copy, 1280/1180/900/390/320px light/dark details and 18 expanded palette layouts. Screenshots: ' + output);
} finally {
  await browser?.close(); await gateway?.close(); await server?.close(); await rm(temporary, { recursive: true, force: true });
}
