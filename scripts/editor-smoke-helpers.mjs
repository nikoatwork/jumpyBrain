// Exercise the real contenteditable input/history path; only Markdown reads use
// the shell bridge so formatting and literal-source preservation remain observable.
export async function editorMarkdown(page) {
  return page.evaluate(() => richEditor.getMarkdown());
}

export async function selectEditorText(page, start, end = start) {
  await page.locator("#note-editor").evaluate((element, { start, end }) => {
    if (!element.isContentEditable) throw new Error("#note-editor must be contenteditable before editing");
    element.focus({ preventScroll: true });
    const point = (offset) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      throw new Error("Selection offset is outside the editor text");
    };
    const range = document.createRange();
    range.setStart(...point(start));
    range.setEnd(...point(end));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, { start, end });
  // Let Lexical observe the browser selectionchange before a toolbar click.
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

export async function editorEnd(page) {
  await page.locator("#note-editor").evaluate((element) => {
    if (!element.isContentEditable) throw new Error("#note-editor must be contenteditable before editing");
    element.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

export async function editorSelection(page) {
  return page.locator("#note-editor").evaluate((element) => {
    const selection = window.getSelection();
    if (!selection.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    const offset = (node, position) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.setEnd(node, position);
      return range.toString().length;
    };
    return [offset(selection.anchorNode, selection.anchorOffset), offset(selection.focusNode, selection.focusOffset)];
  });
}

export async function editorAtEnd(page) {
  const selection = await editorSelection(page);
  const length = await page.locator("#note-editor").evaluate((element) => element.textContent.length);
  return selection?.[0] === length && selection?.[1] === length;
}

export async function replaceEditorText(page, text) {
  await page.locator("#note-editor").evaluate((element) => {
    if (!element.isContentEditable) throw new Error("#note-editor must be contenteditable before editing");
    element.focus();
  });
  const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
  await page.keyboard.press(modifier + "+a");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.insertText(text);
}

export async function appendEditorText(page, text) {
  await editorEnd(page);
  await page.keyboard.insertText(text);
}

export async function undoEditor(page) {
  const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
  await page.locator("#note-editor").focus();
  await page.keyboard.press(modifier + "+z");
}
