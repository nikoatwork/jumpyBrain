import assert from 'node:assert/strict';

// Check rendered geometry/cascade, including the percentage-width grid regression.
export async function checkPageActions(page, { companion = false } = {}) {
  const layout = await page.evaluate(() => {
    const panel = document.getElementById('note-panel');
    const card = document.getElementById('page-details').getBoundingClientRect();
    const editor = document.getElementById('note-editor').getBoundingClientRect();
    return { width: card.width, rightInset: panel.getBoundingClientRect().left + panel.clientWidth - card.right,
      overlaps: innerWidth >= 1180 && card.left < editor.right, narrow: innerWidth <= 680 };
  });
  assert.equal(layout.width, 224, 'page actions retain their intended width');
  assert.ok(Math.abs(layout.rightInset - 16) <= 1, 'page actions sit 16px from the scrollable right edge');
  assert.equal(layout.overlaps, false, 'page actions never overlap prose');

  const selectors = ['#toggle-page-details', ...(companion ? ['#note-add-to-board'] : [])];
  let rowWidth;
  for (const selector of selectors) {
    const row = page.locator(selector);
    await page.mouse.move(0, 0);
    const before = await row.boundingBox();
    await row.hover();
    const geometry = await row.evaluate(el => {
      const s = getComputedStyle(el), label = el.querySelector('span').getBoundingClientRect(), box = el.getBoundingClientRect();
      const probe = document.createElement('span');
      probe.style.background = 'var(--hover-fill)'; el.append(probe);
      const expectedHover = getComputedStyle(probe).backgroundColor; probe.remove();
      return { top: s.paddingTop, bottom: s.paddingBottom, left: s.paddingLeft, right: s.paddingRight,
        radius: parseFloat(s.borderRadius), border: s.borderTopWidth, background: s.backgroundColor, expectedHover,
        centerOffset: Math.abs((label.top + label.bottom) / 2 - (box.top + box.bottom) / 2) };
    });
    assert.equal(geometry.top, geometry.bottom, `${selector}: equal vertical padding`);
    assert.equal(geometry.left, geometry.right, `${selector}: equal horizontal padding`);
    assert.ok(parseFloat(geometry.left) >= 8 && geometry.radius > 0, 'hover has inset text and rounded corners');
    assert.equal(geometry.border, '0px', 'divider is outside the interactive surface');
    assert.ok(geometry.centerOffset < 1, 'label is vertically centered in its hover target');
    assert.equal(geometry.background, geometry.expectedHover, 'transparent rows use the shared faint hover wash');
    assert.deepEqual(await row.boundingBox(), before, 'hover never changes geometry');
    assert.ok(before.height >= (layout.narrow ? 40 : 36), 'action meets desktop/touch target size');
    if (rowWidth !== undefined) assert.equal(before.width, rowWidth, 'board and facts rows have equal widths');
    rowWidth = before.width;
    await row.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await row.evaluate(el => el === document.activeElement), true, 'keyboard returns to the action');
    assert.equal(await row.evaluate(el => getComputedStyle(el).outlineStyle), 'solid', 'keyboard focus stays visible');
  }
  for (const selector of ['#copy-note-draft', '#delete-note', '#navigate-back', '#navigate-forward']) {
    const icon = page.locator(selector);
    if (!await icon.isVisible()) continue;
    await page.mouse.move(0, 0);
    const before = await icon.evaluate(el => getComputedStyle(el).backgroundColor);
    await icon.hover();
    assert.equal(await icon.evaluate(el => getComputedStyle(el).backgroundColor), before, `${selector}: hover preserves icon background`);
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
}
