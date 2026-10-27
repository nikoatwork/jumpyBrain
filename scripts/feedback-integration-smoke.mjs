// Regression checks for interactions found while integrating the feedback tickets.
// Real bundled editor/controllers and Chrome BFCache; disposable loopback content only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { mountInlineUpdates } from '../integrations/electron/update-inline.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { selectEditorText, replaceEditorText } from './editor-smoke-helpers.mjs';

const bundle = await readFile(new URL('../dist/adapters/http-server/editor-bundle.js', import.meta.url), 'utf8');
const browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium(), launchOptions: { channel: 'chrome', ignoreDefaultArgs: ['--disable-back-forward-cache'] } });
let server;
try {
  const page = await browser.newPage();
  await page.setContent('<div id="note-panel"><div id="note-find" hidden><input id="note-find-input"><span id="note-find-count"></span><button id="note-find-previous">Previous</button><button id="note-find-next">Next</button><button id="note-find-close">Close</button></div><div id="note-editor" style="white-space:pre-wrap"></div></div>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    window.editorErrors = [];
    window.richEditor = createJumpyBrainNoteEditor(document.querySelector('#note-editor'), { onChange() {}, onError: error => editorErrors.push(error.message) });
    window.find = JumpyBrainBrowser.installNoteFind({ document, available: () => true, capture: () => richEditor.captureSelection(), restore: selection => richEditor.restoreSelection(selection) });
  });
  for (const external of [false, true]) {
    await page.evaluate(() => richEditor.setMarkdown('Alpha **bold**\n\nSecond paragraph', true));
    await selectEditorText(page, 8);
    await page.evaluate(() => find.open());
    if (external) await page.evaluate(() => richEditor.setExternalMarkdown('A remotely refreshed note'));
    else await replaceEditorText(page, 'Entirely replaced body');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => editorErrors), [], 'Escape must not restore deleted Lexical keys after body replacement');
    const baseline = await page.evaluate(() => richEditor.getMarkdown());
    assert.equal(baseline, external ? 'A remotely refreshed note' : 'Entirely replaced body');
    await page.locator('#note-editor').focus();
    await page.keyboard.insertText(' More');
    assert.match(await page.evaluate(() => richEditor.getMarkdown()), / More/);
    assert.deepEqual(await page.evaluate(() => editorErrors), []);
  }
  await page.close();

  const script = bundle + `\nwindow.restored = false; addEventListener('pageshow', event => { if (event.persisted) restored = true; });
    window.searches = 0;
    window.currentNote = {state:{loaded:true,documentId:'mem_a0000000-0000-4000-8000-000000000001',savedTitle:'Alpha',savedBody:'',contentHash:'a'}};
    window.related = JumpyBrainBrowser.installRelatedPages({document,editor:()=>currentNote,scope:()=>'a',enabled:()=>true,
      search:async()=>{searches++;return {results:[{provenance:{metadata:{id:'mem_a0000000-0000-4000-8000-000000000002',title:'Alpha'}}}]};},href:id=>'/?note='+id,navigate:()=>{}});
    related.sync(); JumpyBrainBrowser.installControlLabels(document); (${mountInlineUpdates.toString()})();`;
  const html = '<div class="nav-utilities"></div><div id="related-pages" hidden><ul id="related-pages-list"></ul></div><a id="away" href="/away">Leave</a><script>' + script + '</script>';
  server = createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(request.url === '/away' ? '<p>Another disposable page</p>' : html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const restored = await browser.newPage();
  await restored.goto('http://127.0.0.1:' + server.address().port);
  await restored.locator('#related-pages').waitFor({ state: 'visible' });
  await restored.locator('#away').click();
  await restored.goBack({ waitUntil: 'commit' });
  await restored.waitForFunction(() => window.restored === true && searches >= 2 && !document.querySelector('#related-pages').hidden);
  await restored.evaluate(() => { currentNote.state.contentHash = 'b'; related.sync(); });
  await restored.waitForFunction(() => searches >= 3 && !document.querySelector('#related-pages').hidden);
  await restored.evaluate(() => document.dispatchEvent(new CustomEvent('jumpybrain-update-state', { detail: { phase: 'available', actions: ['update'] } })));
  await restored.locator('#desktop-updates').hover();
  await restored.waitForFunction(() => document.querySelector('#control-label').matches(':popover-open'));
  assert.equal(await restored.locator('#control-label').innerText(), 'Download update');
  await restored.evaluate(() => document.dispatchEvent(new CustomEvent('jumpybrain-update-state', { detail: { phase: 'ready', actions: ['restart'] } })));
  await restored.waitForFunction(() => !document.querySelector('#control-label').matches(':popover-open'));
  await restored.mouse.move(0, 0); await restored.locator('#desktop-updates').hover();
  await restored.waitForFunction(() => document.querySelector('#control-label').matches(':popover-open'));
  assert.equal(await restored.locator('#control-label').innerText(), 'Relaunch to apply update');
  await restored.evaluate(() => document.dispatchEvent(new CustomEvent('jumpybrain-update-state', { detail: { phase: 'ready', actions: ['restart'] } })));
  await restored.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await restored.locator('#control-label').evaluate(label => label.matches(':popover-open')), true, 'unchanged polling must not dismiss an active tooltip');
  await restored.locator('#desktop-updates').evaluate(button => button.remove());
  await restored.waitForFunction(() => !document.querySelector('#control-label').matches(':popover-open'));
  console.log('PASS feedback integration: Find after user/external body replacement; real BFCache Back/resume; dynamic native update and removed-control tooltips.');
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
