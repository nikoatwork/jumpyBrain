// "Linked from" and "Open in graph" over real Markdown: a Logseq-style import links to a page
// created later. Companion (local + read-only remote) and the hosted shell. Disposable roots only.
// npm run build && npx --package=playwright node scripts/page-backlinks-smoke.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText, showSidebar } from './editor-smoke-helpers.mjs';

const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-page-backlinks-')));
const shots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
const root = path.join(temporary, 'memory'), directory = path.join(temporary, 'support');
const token = randomBytes(32).toString('hex'), hostedKey = 'page-backlinks-disposable-key';
const id = n => `mem_d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const note = (n, title, body) => `---\nid: ${id(n)}\ntitle: ${title}\n---\n${body}\n`;
const pageFile = path.join(root, 'pages', 'project-p.md');
let gateway, hosted, browser;
try {
  await initializeMemoryRoot(root); await mkdir(directory, { mode: 0o700 });
  await mkdir(path.join(root, 'notes', 'deep'), { recursive: true });
  // Imported journals and notes reference [[Project P]] before the page exists.
  await writeFile(path.join(root, 'sessions', '2024_01_02.md'), note(1, 'Jan 2nd, 2024', '- Met about [[Project P]] today\n- Lunch'));
  await writeFile(path.join(root, 'sessions', '2024_01_03.md'), note(2, 'Jan 3rd, 2024', '- Follow-up on [[project p]] budget'));
  await writeFile(path.join(root, 'notes', 'ideas.md'), note(3, 'Ideas', 'See [[project p|the project]] and [[Project P#Goals]].'));
  await writeFile(path.join(root, 'notes', 'deep', 'ref.md'), note(4, 'Relative reference', 'Path link [details](../../pages/project-p.md) here.'));
  await writeFile(path.join(root, 'notes', 'legacy.md'), '# Legacy\n\n[[Project P]] mention without an ID\n');
  for (const n of [5, 6]) await writeFile(path.join(root, 'notes', `n${n}.md`), note(n, `Meeting ${n}`, `- [[Project P]] item ${n}`));
  await writeFile(path.join(root, 'notes', 'unrelated.md'), note(7, 'Unrelated', 'Only [[Ideas]].'));
  await writeFile(pageFile, note(9, 'Project P', 'The page, created after the import. Self [[Project P]].'));

  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, initialRoot: root, port: 0, controlKey: token,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  hosted = await startJumpyBrainHttpServer({ root, apiKeys: [hostedKey], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium();
  const companionNote = n => gateway.url + '/?note=' + id(n) + '&brain=' + gateway.state().activeId + '#companion=' + token;
  async function linkedFrom(page, count) {
    await page.locator('#page-backlinks').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#page-backlinks-heading').textContent(), `Linked from (${count})`);
  }
  for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem('jumpybrain.theme', theme), theme);
    // Linked from is canonical; it must not depend on the search index.
    await page.route('**/memories/all/search*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Disposable search unavailable' } }) }));
    await page.goto(companionNote(9));
    await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Project P');
    await linkedFrom(page, 7);
    const rows = page.locator('#page-backlinks-list .page-backlink');
    assert.equal(await rows.count(), 5);
    assert.deepEqual(await page.locator('#page-backlinks-list .page-backlink-title').allTextContents(), ['Ideas', 'Jan 2nd, 2024', 'Jan 3rd, 2024', 'legacy', 'Meeting 5']);
    assert.equal(await rows.nth(1).locator('.page-backlink-snippet').textContent(), 'Met about [[Project P]] today');
    assert.equal(await rows.nth(3).getAttribute('aria-disabled'), 'true', 'ID-less import is listed but not openable');
    await page.locator('#page-backlinks-more').click();
    assert.equal(await rows.count(), 7);
    assert.equal(await page.locator('#page-backlinks-list a').count(), 6);
    assert.equal(await page.locator('#related-pages').isVisible(), false, 'no duplicate linked context in Related pages');
    await page.locator('#page-backlinks').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'no horizontal page scroll');
    assert.ok(await page.locator('#page-backlinks').evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }));
    assert.ok(await rows.nth(0).evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'rows wrap instead of overflowing');
    if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `backlinks-${theme}-${width}.png`) }); }

    if (width === 1280 && theme === 'light') {
      // Navigation saves the draft first, like any other link.
      await appendEditorText(page, ' Saved before leaving.');
      await page.locator('#page-backlinks-list a', { hasText: 'Ideas' }).click();
      await page.waitForURL(url => url.searchParams.get('note') === id(3));
      await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Ideas');
      assert.match(await readFile(pageFile, 'utf8'), /Saved before leaving\./);
      await page.goBack();
      await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Project P');
      await linkedFrom(page, 7);
    }

    const card = page.locator('#open-note-graph');
    assert.equal(await card.getAttribute('aria-label'), 'Open in graph');
    await card.click();
    await page.waitForURL(url => url.pathname === '/graph' && url.searchParams.get('focus') === 'pages/project-p.md');
    await page.getByTestId('graph-ready').waitFor({ state: 'visible' });
    const focusNode = page.locator('g[data-node-id="pages/project-p.md"]');
    await focusNode.waitFor();
    assert.match(await focusNode.getAttribute('class'), /selected/);
    assert.equal(await page.locator('g[data-node-id="notes/unrelated.md"]').count(), 0, 'focused view shows this page and its connections');
    const offset = await page.evaluate(() => {
      const svg = document.getElementById('graph').getBoundingClientRect();
      const node = document.querySelector('g[data-node-id="pages/project-p.md"]').getBoundingClientRect();
      return { x: Math.abs(node.x + node.width / 2 - (svg.x + svg.width / 2)) / svg.width, y: Math.abs(node.y + node.height / 2 - (svg.y + svg.height / 2)) / svg.height };
    });
    assert.ok(offset.x < 0.25 && offset.y < 0.25, 'page sits near the map centre: ' + JSON.stringify(offset));
    if (shots) await page.screenshot({ path: path.join(shots, `graph-focus-${theme}-${width}.png`) });
    // A plain map visit clears the focus the link applied.
    await showSidebar(page); await page.locator('#graph-link').click();
    await page.waitForURL(url => url.pathname === '/graph' && !url.searchParams.has('focus'));
    await page.locator('g[data-node-id="notes/unrelated.md"]').waitFor();
    assert.equal(await page.locator('#focus').inputValue(), '');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px ${theme}: Linked from (7) for pre-existing links, snippets, ID-less row, show all, no Related duplicate, Open in graph focus/centre, plain map clears focus`);
  }

  // Read-only remote brain through a fresh companion (no lingering tabs), then the hosted shell directly.
  await gateway.close();
  const other = path.join(temporary, 'other'), otherSupport = path.join(temporary, 'support-remote');
  await initializeMemoryRoot(other); await mkdir(otherSupport, { mode: 0o700 });
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory: otherSupport, initialRoot: other, port: 0, controlKey: token,
    credentials: { get: async () => hostedKey, set: async () => {}, delete: async () => {} } });
  const native = (route, body) => fetch(gateway.url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const saved = await native('/companion/profiles', { profile: { name: 'Read-only backlinks', kind: 'remote', url: hosted.url, key: hostedKey }, revision: gateway.state().revision });
  assert.equal(saved.status, 200, await saved.clone().text());
  const remote = (await saved.json()).profiles.find(profile => profile.kind === 'remote');
  assert.notEqual(remote.allowWrites, true, 'remote profiles start read-only');
  const switched = await native('/companion/switch', { id: remote.id });
  assert.equal(switched.status, 200, await switched.clone().text());
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(companionNote(9));
  await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Project P');
  await linkedFrom(page, 7);
  assert.equal(await page.locator('#note-name').evaluate(el => el.readOnly), true, 'remote profile is read-only');
  await page.locator('#page-backlinks-list a', { hasText: 'Jan 2nd, 2024' }).click();
  await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Jan 2nd, 2024');
  await page.goto(hosted.url + '/?note=' + id(9) + '#apiKey=' + hostedKey);
  await page.waitForFunction(() => document.querySelector('#note-name')?.value.startsWith('Project P'));
  await linkedFrom(page, 7);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS read-only remote companion profile and hosted shell: Linked from (7) and navigation');
} finally {
  await browser?.close(); await gateway?.close(); await hosted?.close(); await rm(temporary, { recursive: true, force: true });
}
