// Isolated production editor regressions: no memory root, app server, credentials, or index.
// Requires existing dist/adapters/http-server/editor-bundle.js; does not build or fork the editor.
// Run: npx --package=playwright node scripts/page-reference-editor-smoke.mjs
// Optional: JUMPYBRAIN_REFERENCE_EDITOR_BENCH=1 (production-only local timing observations).
// Narrow touch Chromium is not physical-device, real IME, or assistive-technology QA.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { selectEditorText, appendEditorText, editorMarkdown, undoEditor, editorSelection } from "./editor-smoke-helpers.mjs";
import { referencePresentationStyles } from "../dist/adapters/http-server/editor-reference-presentation.js";

const editorBundle = await readFile(new URL("../dist/adapters/http-server/editor-bundle.js", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/editor.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(editorBundle);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated production reference editor</title>
    <style>body{font:16px/1.8 system-ui;margin:20px;--writing-font:system-ui}#note-editor{white-space:pre-wrap;overflow-wrap:anywhere;min-height:200px}p{margin:0;min-height:1.8em}.editor-bold{font-weight:bold}.editor-italic{font-style:italic}[role=link]:focus-visible{outline:2px solid blue}${referencePresentationStyles}</style>
    <button id="before">Before editor</button><div id="note-editor" role="textbox" aria-label="Markdown" aria-multiline="true"></div><button id="after">After editor</button>
    <script src="/editor.js"></script>
    <script>
      var changes = [], follows = [], errors = [], completed = [], allowReadonlyActivation = false;
      var richEditor = window.createJumpyBrainNoteEditor(document.querySelector('#note-editor'), {
        onChange: value => changes.push(value),
        onCompletedReferences: titles => completed.push(...titles),
        canActivateReference: () => allowReadonlyActivation,
        onActivateReference: title => follows.push(title), onError: error => errors.push(error.message)
      });
    </script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const failures = [];
try {
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    async function check(name, run) {
      if (process.env.JUMPYBRAIN_EDITOR_CHECK && !name.includes(process.env.JUMPYBRAIN_EDITOR_CHECK)) return;
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await page.goto(origin);
        await run(page);
        assert.deepEqual(await page.evaluate(() => errors), []);
        assert.deepEqual(pageErrors, []);
        console.log(`PASS ${width}px ${name}`);
      } catch (error) {
        if (process.env.JUMPYBRAIN_EDITOR_CHECK) console.error(await page.locator("#note-editor").evaluate((element) => ({ html: element.innerHTML, markdown: richEditor.getMarkdown(), selection: richEditor.captureSelection() })));
        failures.push({ width, name, error: error.stack });
        console.error(`FAIL ${width}px ${name}: ${error.message}`);
      } finally { await page.close(); }
    }
    await check("reading brackets have zero width and only the editing block expands", async (page) => {
      const source = "Before [[kilian]] and [[Second]] after\nAnother [[Other]] block";
      await load(page, source);
      await page.locator('#before').focus();
      await page.waitForFunction(() => document.querySelector('#note-editor.reference-markers-ready'));
      const widths = () => page.locator('[data-page-reference]').evaluateAll(links => links.map(link => {
        const text = link.firstChild, range = document.createRange();
        range.setStart(text, 0); range.setEnd(text, 2);
        const left = range.getBoundingClientRect().width;
        range.setStart(text, text.length - 2); range.setEnd(text, text.length);
        return left + range.getBoundingClientRect().width;
      }));
      assert.deepEqual(await widths(), [0, 0, 0], 'hidden brackets occupy no inline space');
      await selectEditorText(page, 10);
      let sizes = await widths();
      assert.ok(sizes[0] > 0 && sizes[1] > 0 && sizes[2] === 0, 'only caret block reveals brackets');
      assert.deepEqual(await editorSelection(page), [10, 10]);
      await selectEditorText(page, 48);
      sizes = await widths();
      assert.ok(sizes[0] === 0 && sizes[1] === 0 && sizes[2] > 0, 'moving the caret collapses the old block');
      await selectEditorText(page, 10, 48);
      assert.ok((await widths()).every(size => size > 0), 'selection reveals the blocks it covers');
      await page.evaluate(() => richEditor.setReadOnly(true));
      assert.deepEqual(await widths(), [0, 0, 0], 'read-only selection is reading');
      await page.evaluate(() => richEditor.setReadOnly(false));
      await page.locator('#before').focus();
      assert.deepEqual(await widths(), [0, 0, 0], 'blur collapses every block');
      assert.equal(await editorMarkdown(page), source);
      assert.deepEqual(await page.evaluate(() => changes), [], 'presentation never creates a source edit');
    });
    await check("font-load failure retains visible editable reference syntax", async (page) => {
      await page.addInitScript(() => {
        window.FontFace = class { load() { return Promise.reject(new Error('fixture font unavailable')); } };
      });
      await page.reload();
      await load(page, 'See [[kilian]] here');
      await page.locator('#before').focus();
      assert.equal(await page.locator('#note-editor.reference-markers-ready').count(), 0);
      assert.ok(await page.getByRole('link').evaluate(link => {
        const range = document.createRange(); range.setStart(link.firstChild, 0); range.setEnd(link.firstChild, 2);
        return range.getBoundingClientRect().width > 0;
      }), 'failure leaves ordinary brackets');
      assert.equal(await editorMarkdown(page), 'See [[kilian]] here');
    });
    await check("collapsed references retain title metrics, wrapping and literal code", async (page) => {
      const title = 'kilian 日本語 ' + 'long readable title '.repeat(12);
      await load(page, `Before [[${title.trim()}]] after\n\n## Heading [[kilian]]\n\n- [ ] Task [[kilian]]\n\nLiteral [[path/to/note]] and \`[[code]]\``);
      await page.locator('#before').focus();
      await page.waitForFunction(() => document.querySelector('#note-editor.reference-markers-ready'));
      const layout = await page.locator('#note-editor > p').first().evaluate(block => {
        const style = getComputedStyle(block), probe = document.createElement('p');
        probe.textContent = block.textContent.replace(/\[\[([^\[\]]+)\]\]/g, '$1');
        Object.assign(probe.style, { font: style.font, width: `${block.getBoundingClientRect().width}px`, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, margin: '0' });
        document.body.append(probe);
        const expected = probe.getBoundingClientRect().height, actual = block.getBoundingClientRect().height;
        probe.remove();
        const link = block.querySelector('[data-page-reference]'), text = link.firstChild, range = document.createRange();
        range.setStart(text, 2); range.setEnd(text, 8);
        const titleWidth = range.getBoundingClientRect().width;
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        context.font = style.font;
        return { expected, actual, titleWidth, expectedTitleWidth: context.measureText('kilian').width };
      });
      assert.equal(layout.actual, layout.expected, 'line wrapping matches the same prose without brackets');
      assert.ok(Math.abs(layout.titleWidth - layout.expectedTitleWidth) < .1, 'title keeps the original writing font');
      const widths = await page.locator('#note-editor .markdown-reference').evaluateAll(links => links.map(link => {
        const range = document.createRange(); range.setStart(link.firstChild, 0); range.setEnd(link.firstChild, 2);
        return { active: link.hasAttribute('data-page-reference'), width: range.getBoundingClientRect().width };
      }));
      assert.ok(widths.filter(value => value.active).every(value => value.width === 0), 'paragraph/heading/task references collapse');
      assert.ok(widths.filter(value => !value.active).every(value => value.width > 0), 'inert reference syntax stays literal');
      assert.ok(await page.locator('.editor-inline-code').last().evaluate(link => {
        const range = document.createRange(); range.setStart(link.firstChild, 0); range.setEnd(link.firstChild, 2);
        return range.getBoundingClientRect().width > 0;
      }), 'inline code retains visible brackets');
    });
    await check("Markdown paste renders immediately and survives undo/redo and reload", async (page) => {
      await load(page, "Replace me");
      await selectEditorText(page, 0, 10);
      const source = "# Pasted heading\n\n## Smaller heading\nKeep **bold** and _italic_ with [[Exact **title**]].\n\n- retained list\n```md\n# code, not heading\n**literal**\n```\n";
      await paste(page, source.replace(/\n/g, "\r\n"));
      assert.equal(await page.locator("#note-editor h1").innerText(), "Pasted heading");
      assert.equal(await page.locator("#note-editor h2").innerText(), "Smaller heading");
      assert.equal(await page.locator("#note-editor .editor-bold").innerText(), "bold");
      assert.equal(await page.locator("#note-editor .editor-italic").innerText(), "italic");
      assert.equal(await editorMarkdown(page), source);
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "Replace me");
      await redo(page);
      assert.equal(await editorMarkdown(page), source);
      await load(page, await editorMarkdown(page));
      assert.equal(await page.locator("#note-editor h2").innerText(), "Smaller heading");
      assert.equal(await editorMarkdown(page), source);
    });
    await check("inline Markdown paste replaces only the selection and leaves caret at insertion", async (page) => {
      await load(page, "Before replace after");
      await selectEditorText(page, 7, 14);
      await paste(page, "**bold** and *italic*");
      assert.equal(await editorMarkdown(page), "Before **bold** and *italic* after");
      assert.deepEqual(await editorSelection(page), [22, 22]);
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "Before replace after");
    });
    await check("paste within code stays literal while whole-block replacement parses", async (page) => {
      await load(page, "```md\ncode\n```");
      await selectEditorText(page, 4);
      await paste(page, " **literal**");
      assert.equal(await editorMarkdown(page), "```md\ncode **literal**\n```");
      assert.equal(await page.locator("#note-editor .editor-bold").count(), 0);
      await load(page, "- old literal block");
      await selectEditorText(page, 0, 19);
      await paste(page, "## New heading");
      assert.equal(await page.locator("#note-editor h2").innerText(), "New heading");
    });
    await check("empty and read-only clipboard events cannot change the document", async (page) => {
      await load(page, "Keep this");
      await selectEditorText(page, 0, 9);
      await paste(page, "");
      assert.equal(await editorMarkdown(page), "Keep this");
      await page.evaluate(() => richEditor.setReadOnly(true));
      await paste(page, "## Changed");
      assert.equal(await editorMarkdown(page), "Keep this");
    });
    await check("completed user references report after source edits, including paste, picker and redo", async (page) => {
      await load(page, "[[Typed");
      await appendEditorText(page, "]]");
      assert.deepEqual(await page.evaluate(() => completed), ["Typed"]);
      await page.evaluate(() => { completed.length = 0; });
      await undoEditor(page);
      assert.deepEqual(await page.evaluate(() => completed), []);
      await redo(page);
      assert.deepEqual(await page.evaluate(() => completed), ["Typed"]);
      await load(page, "Before ");
      await selectEditorText(page, 7);
      await paste(page, "[[Pasted]] and `[[Code]]` and \\[[Escaped]]");
      assert.deepEqual(await page.evaluate(() => completed), ["Pasted"]);
      await load(page, "[[Pick");
      await selectEditorText(page, 6);
      await page.evaluate(() => {
        const range = richEditor.referenceRange();
        if (!range || !richEditor.insertReference(range, "[[Picked title]]")) throw new Error("Picker insertion failed");
      });
      assert.deepEqual(await page.evaluate(() => completed), ["Picked title"]);
      await selectEditorText(page, 2, 8);
      await page.keyboard.insertText("Edited");
      assert.deepEqual(await page.evaluate(() => completed), ["Picked title", "Edited title"]);
    });
    await check("hydration, external snapshots, caret moves and context changes do not complete old references", async (page) => {
      await load(page, "[[Old unresolved]]");
      await selectEditorText(page, 5);
      await page.keyboard.press("ArrowRight");
      await page.evaluate(() => richEditor.setExternalMarkdown("[[External unresolved]]"));
      assert.deepEqual(await page.evaluate(() => completed), []);
      await load(page, "`unclosed\n[[Old unresolved]]");
      await selectEditorText(page, 0, 1);
      await page.keyboard.press("Backspace");
      assert.deepEqual(await links(page), ["[[Old unresolved]]"]);
      assert.deepEqual(await page.evaluate(() => completed), []);
      await load(page, "`[[Code]]` and \\[[Escaped]]");
      await appendEditorText(page, "!");
      assert.deepEqual(await page.evaluate(() => completed), []);
    });
    await check("IME preedit does not report a reference before committed composition", async (page) => {
      await load(page, "Before ");
      await selectEditorText(page, 7);
      const input = await context.newCDPSession(page);
      try {
        await input.send("Input.imeSetComposition", { text: "[[日本語]]", selectionStart: 7, selectionEnd: 7 });
        assert.deepEqual(await page.evaluate(() => completed), []);
        await input.send("Input.insertText", { text: "[[日本語]]" });
        await page.waitForFunction(() => completed.includes("日本語"));
        assert.deepEqual(await page.evaluate(() => completed), ["日本語"]);
      } finally { await input.detach(); }
    });
    await check("load, click/tap, punctuation, and no change notifications", async (page) => {
      const source = "# [[Heading]]\n\nPlain [[Alpha]] and [[β_日本語]] end.\n- [[Bullet]] + [[Second]]\n  - [[Nested]]\n    - [[Deep]]\n\n[[snake_case **literal**]]\n";
      await load(page, source);
      const titles = ["Heading", "Alpha", "β_日本語", "Bullet", "Second", "Nested", "Deep", "snake_case **literal**"];
      assert.deepEqual(await links(page), titles.map((title) => `[[${title}]]`));
      for (const title of titles) {
        const link = page.getByRole("link", { name: `[[${title}]]`, exact: true });
        if (width === 390) await link.tap(); else await link.click();
      }
      assert.deepEqual(await page.evaluate(() => follows), titles);
      assert.equal(await editorMarkdown(page), source);
      assert.deepEqual(await page.evaluate(() => changes), []);
    });
    await check("excluded syntax and exact source after unrelated edit", async (page) => {
      const source = ["\\[[Escaped]]", "![[Embed]]", "[outer [[Nested]] text]", "[[Missing", "[[Alias|label]]", "[[Heading#anchor]]", "[[path/file]]", "[[ padded ]]", "`[[Inline]]` and [[Outside]]", "```md", "[[Fenced]]", "```", "    [[Indented]]", "[[Extra]]]", "After"].join("\n");
      await load(page, source);
      assert.deepEqual(await links(page), ["[[Outside]]"]);
      await appendEditorText(page, "!");
      assert.equal(await editorMarkdown(page), source + "!");
    });
    await check("inert references retain exact punctuation when surrounding text changes", async (page) => {
      for (const literal of ["[[notes/my_note]]", "[[alias|**literal**]]", "[[ spaced_title ]]", "[[path/`literal`]]", "[[a#my_anchor]]"]) {
        const source = "See " + literal + " here";
        await load(page, source);
        assert.deepEqual(await links(page), []);
        await appendEditorText(page, "!");
        assert.equal(await editorMarkdown(page), source + "!");
        await undoEditor(page);
        assert.equal(await editorMarkdown(page), source);
      }
    });
    await check("explicit picker remains usable inside unfinished mid-block text", async (page) => {
      await load(page, "before [[ab suffix");
      await selectEditorText(page, 11);
      assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null);
      assert.equal(await page.evaluate(() => richEditor.insertReference(richEditor.referenceRange(), "[[Alpha]]")), true);
      assert.equal(await editorMarkdown(page), "before [[ab[[Alpha]] suffix");
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "before [[ab suffix");
    });
    await check("click-only accessible activation retains read-only and selection guards", async (page) => {
      await load(page, "See [[Alpha]] here");
      await page.getByRole("link").evaluate((element) => element.click());
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
      await selectEditorText(page, 4, 13);
      await page.getByRole("link").evaluate((element) => element.click());
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
      await selectEditorText(page, 0);
      await page.evaluate(() => richEditor.setReadOnly(true));
      await page.getByRole("link").evaluate((element) => element.click());
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
    });
    await check("typed and pasted references in paragraph and bullets", async (page) => {
      await load(page, "Paragraph: ");
      await appendEditorText(page, "[[Typed]]");
      await page.waitForFunction(() => document.querySelectorAll('[role="link"]').length === 1);
      assert.equal(await editorMarkdown(page), "Paragraph: [[Typed]]");
      await page.keyboard.type(" suffix");
      assert.equal(await editorMarkdown(page), "Paragraph: [[Typed]] suffix");
      await load(page, "- Bullet: ");
      await appendEditorText(page, "[[");
      await page.keyboard.type("Typed bullet]]");
      await page.waitForFunction(() => document.querySelectorAll('[role="link"]').length === 1);
      assert.equal(await editorMarkdown(page), "- Bullet: [[Typed bullet]]");
      await paste(page, " [[Pasted]] and [[Another]]");
      assert.deepEqual(await links(page), ["[[Typed bullet]]", "[[Pasted]]", "[[Another]]"]);
      assert.equal(await editorMarkdown(page), "- Bullet: [[Typed bullet]] [[Pasted]] and [[Another]]");
    });
    await check("picker insertion and undo/redo in a literal bullet", async (page) => {
      await load(page, "- Pick: ");
      await selectEditorText(page, 8);
      const ok = await page.evaluate(() => richEditor.insertReference(richEditor.referenceRange(), "[[Selected_日本語]]"));
      assert.equal(ok, true);
      assert.deepEqual(await links(page), ["[[Selected_日本語]]"]);
      assert.equal(await editorMarkdown(page), "- Pick: [[Selected_日本語]]");
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "- Pick: ");
      assert.deepEqual(await links(page), []);
      await redo(page);
      assert.equal(await editorMarkdown(page), "- Pick: [[Selected_日本語]]");
      assert.deepEqual(await links(page), ["[[Selected_日本語]]"]);
    });
    await check("edit title, invalidate brackets, restore via undo", async (page) => {
      await load(page, "- [[Alpha]] end");
      await selectEditorText(page, 10); // Before the final closing bracket.
      await page.keyboard.press("Backspace");
      assert.equal(await editorMarkdown(page), "- [[Alpha] end");
      assert.deepEqual(await links(page), []);
      assert.deepEqual(await editorSelection(page), [9, 9]);
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "- [[Alpha]] end");
      assert.deepEqual(await links(page), ["[[Alpha]]"]);
      await selectEditorText(page, 4, 9);
      await page.keyboard.type("Beta");
      assert.equal(await editorMarkdown(page), "- [[Beta]] end");
      assert.deepEqual(await links(page), ["[[Beta]]"]);
      await selectEditorText(page, 2);
      await page.getByRole("link").click();
      assert.deepEqual(await page.evaluate(() => follows), ["Beta"]);
    });
    await check("dynamic fence edits invalidate later references without changing text", async (page) => {
      await load(page, "~~~\n[[Inside]]\n~~~\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Outside]]"]);
      await selectEditorText(page, 0, 3);
      await paste(page, "Fence removed");
      assert.equal(await editorMarkdown(page), "Fence removed\n[[Inside]]\n~~~\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Inside]]"]);
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "~~~\n[[Inside]]\n~~~\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Outside]]"]);
    });
    await check("copy preserves literal reference brackets without activation", async (page) => {
      const source = "Select [[Alpha]] safely";
      await load(page, source);
      await selectEditorText(page, 7, 16);
      assert.equal(await page.evaluate(() => getSelection().toString()), "[[Alpha]]");
      const copied = await page.locator("#note-editor").evaluate((element) => {
        const clipboardData = new DataTransfer();
        element.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData }));
        return clipboardData.getData("text/plain");
      });
      assert.equal(copied, "[[Alpha]]"); // Editor event path, not OS clipboard coverage.
      assert.deepEqual(await page.evaluate(() => follows), []);
      assert.equal(await editorMarkdown(page), source);
      assert.deepEqual(await page.evaluate(() => changes), []);
    });
    await check("drag selection copies text without activation", async (page) => {
      await load(page, "Select [[Alpha]] safely");
      const box = await page.getByRole("link").boundingBox();
      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => follows), []);
      assert.match(await page.evaluate(() => getSelection().toString()), /Alpha/);
      assert.equal(await editorMarkdown(page), "Select [[Alpha]] safely");
      assert.deepEqual(await page.evaluate(() => changes), []);
    });
    await check("Tab then Enter activation; arrow editing does not activate", async (page) => {
      await load(page, "[[Alpha]] and [[Beta]]");
      await page.locator("#before").focus();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.getAttribute("role") === "link")) break;
      }
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "link");
      await page.keyboard.press("Enter");
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
      assert.equal(await editorMarkdown(page), "[[Alpha]] and [[Beta]]");
      assert.deepEqual(await page.evaluate(() => changes), []);
      await selectEditorText(page, 4);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type("X");
      assert.equal((await page.evaluate(() => follows)).length, 1);
      assert.match(await editorMarkdown(page), /AlpXha/);
    });
    await check("double click follows on the first click without editing source", async (page) => {
      await load(page, "See [[Alpha]] here");
      await page.getByRole("link").dblclick();
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
      assert.equal(await editorMarkdown(page), "See [[Alpha]] here");
      assert.deepEqual(await page.evaluate(() => changes), []);
    });
    await check("read-only navigation lock does not follow", async (page) => {
      await load(page, "[[Alpha]]");
      await page.evaluate(() => richEditor.setReadOnly(true));
      await page.getByRole("link").click();
      assert.deepEqual(await page.evaluate(() => follows), []);
    });
    await check("permission-readonly activation can be enabled explicitly without bypassing selection protection", async (page) => {
      await load(page, "[[Alpha]]");
      await page.evaluate(() => { allowReadonlyActivation = true; richEditor.setReadOnly(true); });
      await page.getByRole("link").click();
      assert.deepEqual(await page.evaluate(() => follows), ["Alpha"]);
      await page.evaluate(() => {
        follows.length = 0;
        const range = document.createRange(); range.selectNodeContents(document.querySelector('[role="link"]'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
      });
      await page.getByRole("link").dispatchEvent("click", { button: 0 });
      assert.deepEqual(await page.evaluate(() => follows), []);
    });
    await check("fence reclassification preserves untouched emphasis spelling", async (page) => {
      const source = "~~~\nInside\n~~~\nKeep _italic_ and [[Alpha]].";
      await load(page, source);
      await selectEditorText(page, 10, 11); // Middle tilde of unsupported literal closing fence.
      await page.keyboard.type("X");
      assert.equal(await editorMarkdown(page), "~~~\nInside\n~X~\nKeep _italic_ and [[Alpha]].");
    });
    await check("exact unchanged heading/emphasis around references", async (page) => {
      const source = "## Heading _italic_\nKeep **bold** and [[snake_case **literal**]].  \n\n- [ ] [[Task]]\nLast";
      await load(page, source);
      assert.equal(await editorMarkdown(page), source);
      await appendEditorText(page, "!");
      assert.equal(await editorMarkdown(page), source + "!");
    });
    await check("multiline code and unsupported container fences stay inert", async (page) => {
      for (const source of [
        "`first line\n[[Not a link]]\nlast line`\n[[After]]",
        "``first line\n` [[Not a link]]\nlast line``\n[[After]]",
        "> ```\n> [[Not a link]]\n> ```\n[[Conservatively inert]]",
        "- ~~~\n  [[Not a link]]\n  ~~~\n[[Conservatively inert]]",
        "> 1. ```\n>    - [[Not a link]]\n>    ```",
        "    ```\n- [[Not a link]]\n    ```",
        "`unclosed\nKeep _italic_ and [[Not a link]].\nEnd",
        "`unclosed\n> ```\n> ` [[Not a link]]\n> ```",
        "- item\n  ~~~\n~~~\n[[Not a link]]\n~~~",
      ]) {
        await load(page, source);
        assert.deepEqual(await links(page), source.endsWith("[[After]]") ? ["[[After]]"] : [], source);
        assert.equal(await editorMarkdown(page), source);
        assert.deepEqual(await page.evaluate(() => changes), []);
        await appendEditorText(page, "!");
        assert.equal(await editorMarkdown(page), source + "!");
      }
    });
    await check("multiline delimiter reclassification preserves untouched source and undo", async (page) => {
      const source = "Opening `unclosed\nKeep _italic_ and [[Alpha]].\nEnd";
      const edited = source.replace("`unclosed", "unclosed");
      await load(page, source);
      assert.deepEqual(await links(page), []);
      await selectEditorText(page, 8, 9); await page.keyboard.press("Backspace");
      assert.deepEqual(await links(page), ["[[Alpha]]"]);
      assert.equal(await editorMarkdown(page), edited);
      await undoEditor(page);
      assert.deepEqual(await links(page), []);
      assert.equal(await editorMarkdown(page), source);
      await redo(page);
      assert.deepEqual(await links(page), ["[[Alpha]]"]);
      assert.equal(await editorMarkdown(page), edited);
    });
    await check("cross-leaf references stay editable and inert without merging formatting", async (page) => {
      await load(page, "al**pha**");
      await selectEditorText(page, 5); await paste(page, "]]");
      await selectEditorText(page, 0); await paste(page, "[[");
      assert.equal(await page.locator("#note-editor").textContent(), "[[alpha]]");
      assert.deepEqual(await links(page), []);
      assert.equal(await page.locator("#note-editor .editor-bold").textContent(), "pha");
      assert.deepEqual(await page.evaluate(() => completed), []);
      const markdown = await editorMarkdown(page);
      await selectEditorText(page, 4);
      assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null);
      assert.equal(await page.evaluate(() => richEditor.referenceRange().selection.isCollapsed()), true, "explicit picker retains a safe caret-only fallback");
      assert.deepEqual(await editorSelection(page), [4, 4]);
      assert.equal(await editorMarkdown(page), markdown);
    });
    await check("tasks toggle once by pointer/keyboard, retain labels and undo/redo", async (page) => {
      const source = "# Heading\n- [ ] First **bold**\n  - [X] Child `x`\n    - [ ] Grandchild\n+ [ ] literal\n    - [ ] indented code\n| a | b |\n| --- | --- |";
      await load(page, source);
      assert.equal(await page.getByRole("checkbox").count(), 3);
      const first = page.getByRole("checkbox").first();
      await first.click();
      assert.equal(await first.getAttribute("aria-checked"), "true");
      assert.equal(await editorMarkdown(page), source.replace("- [ ] First", "- [x] First"));
      await undoEditor(page); assert.equal(await editorMarkdown(page), source);
      await redo(page); assert.equal(await first.getAttribute("aria-checked"), "true");
      await first.focus(); await page.keyboard.press("Space");
      assert.equal(await first.getAttribute("aria-checked"), "false");
      await first.focus(); await page.keyboard.press("Enter");
      assert.equal(await first.getAttribute("aria-checked"), "true");
      assert.equal(await page.getByRole("checkbox").count(), 3);
      await page.evaluate(() => richEditor.setReadOnly(true));
      assert.equal(await first.isDisabled(), true);
      const before = await editorMarkdown(page); await first.dispatchEvent("click");
      assert.equal(await editorMarkdown(page), before);
    });
    await check("task creation, Enter continuation/exit and Backspace are ordinary undoable edits", async (page) => {
      await load(page, ""); await page.locator("#note-editor").focus();
      await page.keyboard.type("- [ ] First");
      assert.equal(await page.getByRole("checkbox").count(), 1);
      await page.keyboard.press("Enter"); await page.keyboard.type("Second");
      assert.equal(await editorMarkdown(page), "- [ ] First\n- [ ] Second");
      await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
      await page.keyboard.type("After");
      assert.equal(await editorMarkdown(page), "- [ ] First\n- [ ] Second\nAfter");
      await load(page, "- [ ] Label"); await selectEditorText(page, 0); await page.keyboard.press("Backspace");
      assert.equal(await editorMarkdown(page), "Label");
      await undoEditor(page); assert.equal(await editorMarkdown(page), "- [ ] Label");
    });
    await check("inline and fenced code keep Markdown, references and HTML inert", async (page) => {
      const source = "Before `[[Hidden]] **literal** <b> @title` after [[Visible]]\nUse ``a ` b`` and ```a `` b``` here.\n````ts\n\t[[Hidden block]]\n\n```\n<b>日本語</b> **literal** @title\n````\nTail _italic_.";
      await load(page, source);
      assert.equal(await page.locator("pre").count(), 1);
      assert.equal(await page.locator("pre").getAttribute("data-language"), "ts");
      assert.deepEqual(await links(page), ["[[Visible]]"]);
      await selectEditorText(page, 10, 13);
      const beforeFormat = await editorMarkdown(page);
      await page.evaluate(() => richEditor.format("bold"));
      assert.equal(await editorMarkdown(page), beforeFormat, "code does not accept bold shortcuts");
      assert.equal(await page.locator("#note-editor b, #note-editor img").count(), 0);
      await appendEditorText(page, "!");
      assert.equal(await editorMarkdown(page), source.replace("_italic_", "*italic*") + "!");
      const visible = await page.locator("#note-editor").textContent();
      await selectEditorText(page, visible.indexOf("Hidden block") + 4);
      assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null);
      await paste(page, " EDIT");
      assert.ok((await editorMarkdown(page)).includes("[[Hidd EDITen block]]"));
      assert.deepEqual(await page.evaluate(() => completed), []);
      await undoEditor(page); assert.equal(await editorMarkdown(page), source.replace("_italic_", "*italic*") + "!");
    });
    await check("code edits preserve language, tabs, blank lines, safe delimiters and exit route", async (page) => {
      await load(page, "```js\na\n\tb\n\n```\nTail");
      await selectEditorText(page, 1); await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
      await page.keyboard.type("[[Inert]] **plain**");
      assert.equal(await editorMarkdown(page), "```js\na\n\t[[Inert]] **plain**\n\tb\n\n```\nTail");
      assert.deepEqual(await links(page), []);
      await page.keyboard.press("Control+Enter"); await page.keyboard.type("Below");
      assert.ok((await editorMarkdown(page)).includes("```\nBelow\nTail"));
      await load(page, "````txt\nabc\n````"); await selectEditorText(page, 3);
      await paste(page, "\n`````\n");
      const exported = await editorMarkdown(page);
      assert.ok(exported.startsWith("``````txt\nabc\n`````\n\n``````"));
      await load(page, exported); assert.equal(await editorMarkdown(page), exported);
      assert.ok((await page.locator("pre").innerText()).startsWith("abc\n`````\n"));
    });
    await check("code controls and typed fences create code without interpreting snippets", async (page) => {
      await load(page, ""); await page.locator("#note-editor").focus();
      await page.keyboard.type("```python"); await page.keyboard.press("Enter");
      assert.equal(await page.locator("pre").count(), 1);
      await page.keyboard.type("print('日本語')");
      assert.equal(await editorMarkdown(page), "```python\nprint('日本語')\n```");
      await page.keyboard.press("Control+Enter"); await page.keyboard.type("after");
      const text = await page.locator("#note-editor").textContent();
      await selectEditorText(page, text.indexOf("after") + 1, text.length);
      await page.evaluate(() => richEditor.format("task"));
      assert.equal(await page.getByRole("checkbox").count(), 1);
      await load(page, "hello world"); await selectEditorText(page, 0, 5);
      await page.evaluate(() => richEditor.format("code"));
      assert.equal(await editorMarkdown(page), "`hello` world");
      await undoEditor(page); assert.equal(await editorMarkdown(page), "hello world");
    });
    await check("unsupported and malformed code remains literal across neighboring edits", async (page) => {
      for (const source of ["```js attr\nx\n```", " ```js\nx\n ```", "~~~js\nx\n~~~", "```js\nunclosed", "`unclosed", "    ```\nx\n    ```", "A `multi\nline` example"]) {
        await load(page, source + "\nTail");
        assert.equal(await page.locator("pre").count(), 0, source);
        await appendEditorText(page, "!");
        assert.equal(await editorMarkdown(page), source + "\nTail!");
      }
    });
    if (width === 1280 && process.env.JUMPYBRAIN_REFERENCE_EDITOR_BENCH === "1") {
      for (const lines of [100, 1000]) {
        const page = await context.newPage(); await page.goto(origin);
        const source = Array.from({ length: lines }, (_, i) => `- Line ${i} [[Alpha]] [[Beta]] [[Gamma]]`).join("\n");
        const hydrate = await page.evaluate((value) => { const start = performance.now(); richEditor.setMarkdown(value, true); return performance.now() - start; }, source);
        const length = await page.locator("#note-editor").evaluate((element) => element.textContent.length);
        await selectEditorText(page, length);
        const samples = [];
        for (let i = 0; i < 5; i++) {
          const start = await page.evaluate(() => performance.now());
          await page.keyboard.insertText("!");
          samples.push(await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())))) - start);
        }
        samples.sort((a, b) => a - b);
        console.log(`BENCH production ${lines} lines/${lines * 3} references: hydrate=${hydrate.toFixed(1)}ms, single-edit-to-frame p50=${samples[2].toFixed(1)}ms p95=${samples[4].toFixed(1)}ms (5 local samples, includes automation/frame overhead)`);
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
if (failures.length) {
  for (const failure of failures) console.error(`\n${failure.width}px ${failure.name}\n${failure.error}`);
  process.exitCode = 1;
} else console.log("PASS isolated production page-reference editor (not app integration or physical-device QA)");

async function load(page, text) {
  await page.evaluate((value) => {
    richEditor.setMarkdown(value, true);
    changes.length = 0; follows.length = 0; errors.length = 0; completed.length = 0;
  }, text);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function links(page) { return page.locator('#note-editor [role="link"]').allTextContents(); }
async function paste(page, text) {
  await page.locator("#note-editor").evaluate((element, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, text);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function redo(page) {
  const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
  await page.keyboard.press(modifier + "+Shift+z");
}
