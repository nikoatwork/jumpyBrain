// Run after npm run build:
// npx --package=playwright node deep-dives/checkbox-delight/capture.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from '../../scripts/playwright-runtime.mjs';

export const variants = [
  { key: 'soft-pop', file: '01-soft-pop', name: 'Soft pop', time: 180 },
  { key: 'tiny-spark', file: '02-tiny-spark', name: 'Tiny spark', time: 150 },
  { key: 'quiet-sweep', file: '03-quiet-sweep', name: 'Quiet sweep', time: 300 },
];

// Observe only completions armed by a pointer or keyboard action. Initial loaded
// checks, theme switches and ordinary rerenders never celebrate.
export function installCompletionPreview() {
  const editor = document.querySelector('#note-editor');
  const armed = new WeakSet();
  const timers = new WeakMap();
  const arm = event => {
    if (event.type === 'keydown' && ![' ', 'Enter'].includes(event.key)) return;
    const button = event.target.closest('[data-task-toggle]');
    if (button && !button.disabled && button.getAttribute('aria-checked') === 'false') armed.add(button);
  };
  editor.addEventListener('click', arm, true);
  editor.addEventListener('keydown', arm, true);
  new MutationObserver(records => {
    for (const { target, oldValue } of records) {
      if (oldValue !== 'false' || target.getAttribute('aria-checked') !== 'true' || !armed.has(target)) continue;
      armed.delete(target);
      const row = target.parentElement;
      clearTimeout(timers.get(row));
      row.classList.remove('delight-celebrate');
      void row.offsetWidth;
      row.classList.add('delight-celebrate');
      timers.set(row, setTimeout(() => row.classList.remove('delight-celebrate'), 1100));
    }
  }).observe(editor, { subtree: true, attributes: true, attributeFilter: ['aria-checked'], attributeOldValue: true });
}

const output = process.env.JUMPYBRAIN_DELIGHT_OUTPUT || '/tmp/jumpybrain-checkbox-delight';
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-delight-'));
const id = 'mem_a0000000-0000-4000-8000-000000000001';
const apiKey = 'disposable-checkbox-preview';
const source = `---\nid: ${id}\ntype: note\ntitle: Small wins, real progress\n---\n## Today’s focus\nA little momentum goes a long way.\n\n- [x] Gather the important ideas\n- [ ] Finish one meaningful thing\n- [ ] Leave space for what comes next\n`;
const errors = [], results = [];
let browser, server;
try {
  await mkdir(output, { recursive: true });
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const variant of variants) for (const palette of ['ember', 'ocean', 'mono']) for (const scheme of ['light', 'dark']) {
    await writeFile(path.join(root, 'notes/focus.md'), source);
    const context = await browser.newContext({ viewport: { width: 1080, height: 720 }, colorScheme: scheme });
    await context.addInitScript(({ palette, scheme }) => {
      localStorage.setItem('jumpybrain.palette', palette);
      localStorage.setItem('jumpybrain.theme', scheme);
    }, { palette, scheme });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/?note=${id}#apiKey=${apiKey}`);
    const checks = page.locator('#note-editor [data-task-toggle]');
    await checks.nth(2).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-palette'), palette);
    assert.equal(await page.locator('html').getAttribute('data-theme'), scheme);
    const css = await readFile(new URL(`${variant.file}.css`, import.meta.url), 'utf8');
    await page.evaluate(({ key, css }) => {
      document.documentElement.dataset.delight = key;
      const style = document.createElement('style');
      style.nonce = document.querySelector('style[nonce]').nonce;
      style.textContent = css;
      document.head.append(style);
    }, { key: variant.key, css });
    await page.evaluate(installCompletionPreview);
    assert.equal(await page.locator('.delight-celebrate').count(), 0);
    const layout = () => checks.nth(1).evaluate(button => {
      const { x, y, width, height } = button.parentElement.getBoundingClientRect();
      return { x, y, width, height };
    });
    const before = await layout();
    await checks.nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.delight-celebrate').length === 1);
    await page.evaluate(time => {
      for (const animation of document.getAnimations()) {
        if (animation.animationName?.startsWith('delight-') || animation.animationName?.startsWith('tiny-spark-')) {
          animation.pause(); animation.currentTime = time;
        } else animation.finish();
      }
    }, variant.time);
    const box = await page.locator('#note-editor').boundingBox();
    const clip = { x: Math.max(0, box.x - 20), y: box.y - 8, width: Math.min(720, 1080 - box.x + 20), height: 255 };
    const stem = `${variant.key}-${palette}-${scheme}`;
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(output, `${stem}-moment.png`), clip });
    await page.evaluate(() => {
      for (const a of document.getAnimations()) a.finish();
      document.querySelectorAll('.delight-celebrate').forEach(row => row.classList.remove('delight-celebrate'));
    });
    await page.screenshot({ path: path.join(output, `${stem}-done.png`), clip });
    assert.deepEqual(await layout(), before, 'completion keeps row geometry');
    assert.match(await page.evaluate(() => richEditor.getMarkdown()), /- \[x\] Finish one meaningful thing/);
    // Toggle off and complete by Space, then Enter. Both use the real editor.
    await checks.nth(1).click();
    await checks.nth(1).focus();
    await checks.nth(1).press('Space');
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'true');
    assert.equal(await checks.nth(1).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await checks.nth(1).press('Enter');
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'false');
    await checks.nth(1).press('Enter');
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'true');
    // Motion preference is live, leaving the successful checked shape intact.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => /^(delight-|tiny-spark-)/.test(a.animationName || '')).length), 0);
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'true');
    const contrast = await checks.nth(1).evaluate(button => {
      const style = getComputedStyle(button), label = getComputedStyle(button.nextElementSibling);
      const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface');
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const luminance = color => {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      return { tick: ratio(style.color, style.backgroundColor), label: ratio(label.color, surface), fill: style.backgroundColor };
    });
    assert.ok(contrast.tick >= 3, `${stem}: tick contrast ${contrast.tick}`);
    assert.ok(contrast.label >= 4.5, `${stem}: label contrast ${contrast.label}`);
    await page.setViewportSize({ width: 390, height: 720 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow page fits');
    await page.screenshot({ path: path.join(output, `${stem}-narrow.png`) });
    results.push({ variant: variant.key, palette, scheme, contrast, pointer: true, keyboard: true, reducedMotion: true, stableLayout: true, narrow: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(`Passed ${results.length} variant/theme cases; 54 screenshots in ${output}; zero page errors.`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
