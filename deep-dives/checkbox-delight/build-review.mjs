// Run after capture.mjs. Disposable screenshots stay outside the repository.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { themeStyles } from '../../dist/adapters/http-server/browser-theme.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from '../../scripts/playwright-runtime.mjs';

const output = process.env.JUMPYBRAIN_DELIGHT_OUTPUT || '/tmp/jumpybrain-checkbox-delight';
const variants = [
  { key: 'soft-pop', file: '01-soft-pop', name: 'Soft pop', description: 'A small spring, a drawn tick, a soft halo.', duration: '560 ms' },
  { key: 'tiny-spark', file: '02-tiny-spark', name: 'Tiny spark', description: 'One tiny glint for a little “nice, done.”', duration: '620 ms' },
  { key: 'quiet-sweep', file: '03-quiet-sweep', name: 'Quiet sweep', description: 'A gentle wash leaves a fine success line.', duration: '780 ms' },
];
const palettes = ['ember', 'ocean', 'mono'], schemes = ['light', 'dark'];
const styles = (await Promise.all(variants.map(v => readFile(new URL(`${v.file}.css`, import.meta.url), 'utf8'))))
  .join('\n').replaceAll('html[data-delight=', '.demo[data-delight=').replaceAll('#note-editor', '.demo-editor');
const cards = variants.map((v, i) => `<article>
  <div class="card-title"><strong>${i + 1}. ${v.name}</strong><small>${v.duration}</small></div>
  <p class="description">${v.description}</p>
  <div class="demo" data-delight="${v.key}" data-palette="ember" data-theme="light">
    <div class="demo-editor"><p class="markdown-task"><button type="button" data-task-toggle role="checkbox" aria-checked="false" aria-label="${v.name}: Finish one meaningful thing"></button><span>Finish one meaningful thing</span></p></div>
  </div>
  <div class="shots" hidden>${palettes.flatMap(palette => schemes.map(scheme => `<img ${palette === 'ember' && scheme === 'light' ? '' : 'hidden'} alt="${v.name}, ${palette} ${scheme}: actual editor screenshot" data-palette="${palette}" data-scheme="${scheme}" src="${output}/${v.key}-${palette}-${scheme}-moment.png">`)).join('')}<small>Real editor · completion moment</small></div>
</article>`).join('');
const html = (await readFile(new URL('review-template.html', import.meta.url), 'utf8'))
  .replace('/* PRODUCT_THEME */', themeStyles.replaceAll(':root', '.demo'))
  .replace('/* VARIANT_STYLES */', styles)
  .replace('<!-- CARDS -->', cards);
await writeFile(path.join(output, 'comparison.html'), html);

const browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 });
  for (const palette of palettes) {
    const cells = [];
    for (const variant of variants) for (const scheme of schemes) {
      const png = (await readFile(path.join(output, `${variant.key}-${palette}-${scheme}-moment.png`))).toString('base64');
      cells.push(`<section><p>${variant.name}<span>${palette} · ${scheme}</span></p><img src="data:image/png;base64,${png}"></section>`);
    }
    await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f4f3;font:16px system-ui;color:#222}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}section{overflow:hidden;border:1px solid #ddd;border-radius:10px;background:white}p{margin:0;padding:12px 16px;font-weight:600}span{float:right;font-size:13px;color:#666;font-weight:400;text-transform:capitalize}img{width:100%;display:block}</style></head><body><div class="grid">${cells.join('')}</div></body></html>`);
    await page.screenshot({ path: path.join(output, `comparison-${palette}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 728, height: 900 });
  await page.goto(pathToFileURL(path.join(output, 'comparison.html')).href);
  const checkboxes = page.getByRole('checkbox');
  for (let i = 0; i < 3; i++) {
    await checkboxes.nth(i).click();
    assert.equal(await checkboxes.nth(i).getAttribute('aria-checked'), 'true');
    await checkboxes.nth(i).press('Space');
    assert.equal(await checkboxes.nth(i).getAttribute('aria-checked'), 'false');
  }
  await page.getByRole('button', { name: 'Replay all' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role=checkbox]')].every(b => b.getAttribute('aria-checked') === 'true'));
  for (const palette of palettes) for (const scheme of schemes) {
    await page.locator('#palette').selectOption(palette);
    await page.locator('#scheme').selectOption(scheme);
    assert.equal(await page.locator(`.demo[data-palette="${palette}"][data-theme="${scheme}"]`).count(), 3);
  }
  await page.getByRole('button', { name: 'Screenshots', exact: true }).click();
  assert.equal(await page.locator('.shots img:visible').count(), 3);
  assert.ok(await page.locator('.shots img:visible').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0)));
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Try it' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('Interactive review passed: pointer, Space, replay, six themes, screenshot switching, narrow layout.');
} finally { await browser.close(); }
console.log(`Review: ${output}/comparison.html; 3 theme contact sheets.`);
