// Run fixture first in another terminal: node scripts/living-topic-pages-fixture.mjs
// Then: node scripts/living-topic-pages-smoke.mjs (uses already-installed Playwright; never installs).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
const fixture = JSON.parse(await readFile(process.env.JUMPYBRAIN_LIVING_PREVIEW_INFO || '/tmp/jumpybrain-living-preview.json', 'utf8'));
const shots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-living-qa';
await mkdir(shots, { recursive: true });
const sourceFile = path.join(fixture.root, 'decisions/confirmed.md'), pageFile = path.join(fixture.root, 'pages/release.md');
const sourceBytes = await readFile(sourceFile), pageBytes = await readFile(pageFile);
const browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], mutations = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (['PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.method()); });
const noteUrl = id => `${fixture.url}/?note=${id}#apiKey=${fixture.key}`;
async function check(expected) {
  if (await page.locator('#page-details').isHidden()) await page.locator('#toggle-page-details').click();
  await page.locator('#living-sources > summary').evaluate(el => el.parentElement.open = true);
  const count = mutations.length;
  await page.getByRole('button', { name: 'Check source versions', exact: true }).click();
  await page.waitForFunction(text => document.querySelector('#living-sources-list').textContent.includes(text), expected);
  assert.equal(mutations.length, count, 'read-only checks never publish');
  assert.match(await page.locator('#living-sources-status').textContent(), /does not verify claims/);
}
try {
  await page.goto(noteUrl(fixture.page));
  await page.locator('#note-editor').waitFor();
  assert.ok(await page.evaluate(citation => richEditor.getMarkdown().includes(citation), fixture.citation), 'Lexical import preserves canonical link title');
  await check('unchanged');
  await page.locator('#note-editor').evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (node.textContent.includes('sha256:')) {
      element.focus(); const range = document.createRange(); range.setStart(node, node.textContent.length); range.collapse(true);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return;
    }
    throw new Error('Fingerprint text missing');
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.type(' Human: reserve one week for customer testing.');
  await page.waitForFunction(() => state.editor?.state.saveStatus === 'saved' && !state.editor.state.dirty);
  const after = await readFile(pageFile, 'utf8');
  assert.ok(after.includes(fixture.citation), 'real human edit on citation line preserves exact link/fingerprint');
  assert.match(after, /reserve one week for customer testing/);
  assert.match(after, /notify the customer before announcing/);
  await check('unchanged');
  await page.getByRole('button', { name: 'Open current source', exact: true }).first().click();
  await page.waitForFunction(id => state.editor?.state.documentId === id && state.editor.state.loaded, fixture.source);
  assert.equal(await page.locator('#living-sources').isVisible(), false, 'non-Dream source never advertises Dream check/refresh');
  await page.goto(noteUrl(fixture.page)); await page.locator('#note-editor').waitFor();
  await writeFile(sourceFile, Buffer.concat([sourceBytes, Buffer.from('\nOctober 14 suggestion: consider November 1, not approved.\n')]));
  await check('changed');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('jumpybrain-theme', value); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#living-sources').scrollIntoViewIfNeeded();
      const sizes = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(sizes.doc <= sizes.width && sizes.body <= sizes.width, `${theme}/${width} page fits`);
      await page.screenshot({ path: path.join(shots, `${theme}-${width}.png`) });
    }
  }
  await rm(sourceFile); await check('missing');
  await writeFile(sourceFile, sourceBytes);
  await page.goto(`${fixture.url}/graph#apiKey=${fixture.key}`);
  await page.locator('#open-dream').click();
  await page.locator('#dream-topic').fill('Release plan');
  assert.match(await page.locator('#dream-preview').inputValue(), /Requested topic.*"Release plan"/);
  assert.match(await page.locator('#dream-preview').inputValue(), /--check-sources --draft/);
  await page.locator('#dream-close').click();
  await page.goto(noteUrl(fixture.ordinary)); await page.locator('#note-editor').waitFor();
  assert.equal(await page.locator('#living-sources').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots: shots, themes: 2, widths: [1280,390,320], citationSurvivedHumanEdit: true, readOnlyChecks: true, outcomes: ['unchanged','changed','missing'], sourceNavigation: true, explicitTopicHandoff: true }));
} finally {
  await browser.close(); await writeFile(sourceFile, sourceBytes); await writeFile(pageFile, pageBytes);
}
