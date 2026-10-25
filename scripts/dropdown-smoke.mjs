// Shared native dropdown: production styles, disposable controls, no memory access.
// npm run build && npx --package=playwright node scripts/dropdown-smoke.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dropdownStyles, prepareDropdown } from '../dist/adapters/http-server/browser-dropdown.js';
import { designSystemStyles } from '../dist/adapters/http-server/browser-design-system.js';
import { themeStyles } from '../dist/adapters/http-server/browser-theme.js';
import { extensionStyles, extensionSettingsMarkup } from '../dist/adapters/http-server/extensions-view.js';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>
${designSystemStyles}${themeStyles}${extensionStyles}${dropdownStyles}
* { box-sizing: border-box; } body { margin: 0; padding: 24px; color: var(--ink); background: var(--surface); font: 14px/1.5 var(--font-ui); }
[hidden] { display: none !important; } h1 { font-size: 20px; margin: 0 0 24px; } h2 { font-size: 16px; }
select:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
main { max-width: 520px; margin: auto; } label.field { display: grid; gap: 8px; margin-block: 24px; }
.dropdown { width: 100%; } #extension-settings { margin: 0; } .settings-heading { display: flex; justify-content: space-between; align-items: center; }
#extension-reload { display: none; } #extension-status:empty { display:none; }
.sidebar { width: 190px; max-width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-block: 24px; }
#edge { position: fixed; bottom: 12px; right: 12px; width: 170px; } #after { margin-bottom: 80px; }
</style><main><h1>Settings</h1>
${extensionSettingsMarkup}
<form><label class="field">Connection type<select id="kind" class="dropdown" required><option value="local">Local folder</option><option value="remote">Remote server</option><option disabled value="unavailable">Unavailable</option></select></label>
<fieldset disabled><label class="field">Disabled<select id="disabled" class="dropdown"><option>Cannot change</option></select></label></fieldset></form>
<div class="sidebar"><select id="brain" class="dropdown dropdown--quiet" aria-label="Switch brain"><option>Local brain</option><option>Team brain with a very long descriptive name that should fit the sidebar</option></select></div>
<button id="after">After dropdowns</button></main>
<select id="edge" class="dropdown" aria-label="Edge dropdown"><option>First</option><option>Second</option><option>Third</option></select></html>`;
const browser = await launchPlaywrightChromium();
const page = await browser.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
try {
  await page.setContent(html);
  await page.evaluate(prepareDropdown => {
    const prepare = new Function('return (' + prepareDropdown + ')')();
    document.querySelectorAll('select').forEach(select => { prepare(select); prepare(select); });
  }, prepareDropdown.toString());
  assert.equal(await page.evaluate(() => CSS.supports('appearance', 'base-select')), true, 'test browser must exercise styled pickers');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('select')].every(select => select.querySelectorAll('button').length === 1)), true, 'preparation is idempotent');
  await page.evaluate(() => {
    const palette = document.getElementById('extension-theme');
    palette.closest('label').hidden = false;
    palette.add(new Option('Candy Pink · A very long palette name that must wrap inside the menu instead of stretching its parent', 'pink'));
    palette.add(new Option('Pomodoro · Ember', 'ember'));
    window.changes = [];
    document.addEventListener('change', event => changes.push({ id: event.target.id, value: event.target.value }));
  });
  // Native form/value/change behavior remains intact for consumers and keyboard users.
  const kind = page.locator('#kind');
  await kind.focus(); await kind.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await kind.inputValue(), 'remote');
  assert.deepEqual(await page.evaluate(() => changes), [{ id: 'kind', value: 'remote' }]);
  await kind.press('Space'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Escape');
  assert.equal(await kind.inputValue(), 'remote', 'Escape cancels the pending selection');
  await kind.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'brain', 'Tab skips disabled native select');
  assert.equal(await page.locator('#disabled').isDisabled(), true);
  await page.getByRole('combobox', { name: 'Extension palette' }).click();
  await page.getByRole('option', { name: 'Pomodoro · Ember', exact: true }).click();
  assert.equal(await page.locator('#extension-theme').inputValue(), 'ember');
  assert.equal(await page.evaluate(() => changes.at(-1).value), 'ember');
  // Long selected labels must also fit their control, not just the open menu.
  await page.locator('#brain').selectOption({ index: 1 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}/${width}: page overflow`);
      for (const id of ['extension-theme', 'kind', 'brain', 'edge']) {
        const select = page.locator('#' + id);
        await select.click();
        assert.equal(await select.evaluate(el => el.matches(':open')), true);
        const layout = await select.evaluate(el => {
          const control = el.getBoundingClientRect();
          const selected = el.querySelector('selectedcontent').getBoundingClientRect();
          const icon = getComputedStyle(el, '::picker-icon');
          const picker = getComputedStyle(el, '::picker(select)');
          const options = [...el.options].map(option => {
            const rect = option.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          });
          return { control: { left: control.left, right: control.right, width: control.width }, picker: { width: parseFloat(picker.width), background: picker.backgroundColor }, options, parentWidth: el.parentElement.clientWidth, selectedWidth: selected.width, iconWidth: parseFloat(icon.width), height: innerHeight, width: innerWidth, surface: getComputedStyle(document.body).backgroundColor };
        });
        assert.ok(Math.abs(layout.picker.width - layout.control.width) <= 1, `${id}/${width}: picker follows trigger width`);
        assert.equal(layout.picker.background, layout.surface, `${id}: picker uses active theme`);
        assert.ok(layout.selectedWidth + layout.iconWidth < layout.control.width, `${id}: label reserves room for the arrow`);
        assert.ok(layout.control.width <= layout.parentWidth, `${id}/${width}: trigger fits parent`);
        for (const option of layout.options) {
          assert.ok(option.left >= 0 && option.right <= width + 1, `${id}/${width}: menu option fits viewport`);
          assert.ok(option.right - option.left <= layout.control.width, `${id}: long option fits menu`);
          assert.ok(option.top >= 0 && option.bottom <= layout.height + 1, `${id}/${width}: menu fits vertically`);
        }
        if (screenshotDir && id === 'extension-theme') await page.screenshot({ path: path.join(screenshotDir, `dropdown-${theme}-${width}.png`) });
        await page.keyboard.press('Escape');
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log('Dropdown smoke passed: native keyboard/pointer/change/disabled behavior, themed anchored menus, long labels, parent/viewport fit, bottom-edge flip at 1280/390/320px.');
} finally { await browser.close(); }
