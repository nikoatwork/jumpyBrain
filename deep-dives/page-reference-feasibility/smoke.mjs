// Isolated feasibility fixture: no memory root, app server, credentials, or index.
// Run: npx --package=playwright node deep-dives/page-reference-feasibility/smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { loadPlaywrightChromium } from "../../scripts/playwright-runtime.mjs";
import { selectEditorText, appendEditorText, editorMarkdown, undoEditor, editorSelection } from "../../scripts/editor-smoke-helpers.mjs";

const bundle = async (entry) => (await build({
  entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, minify: true,
  platform: "browser", format: "iife", target: "es2022", write: false,
  define: { "process.env.NODE_ENV": '"production"' },
})).outputFiles[0].text;
const prototype = await bundle("./editor.ts");
const baseline = await bundle("../../src/adapters/http-server/lexical-editor.ts");
console.log(`Bundle gzip: baseline=${gzipSync(baseline).length}, prototype=${gzipSync(prototype).length}, delta=${gzipSync(prototype).length - gzipSync(baseline).length} bytes`);
const server = createServer((req, res) => {
  if (req.url === "/editor.js" || req.url === "/baseline.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(req.url === "/editor.js" ? prototype : baseline);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Disposable reference prototype</title>
    <style>body{font:16px/1.8 system-ui;margin:20px}#note-editor{white-space:pre-wrap;overflow-wrap:anywhere;min-height:200px}p{margin:0;min-height:1.8em}.editor-bold{font-weight:bold}.editor-italic{font-style:italic}[role=link]:focus-visible{outline:2px solid blue}</style>
    <button id="before">Before editor</button><div id="note-editor" role="textbox" aria-label="Markdown" aria-multiline="true"></div><button id="after">After editor</button>
    <script src="${req.url === "/baseline" ? "/baseline.js" : "/editor.js"}"></script>
    <script>
      var changes = [], follows = [], errors = [], triggers = 0;
      var richEditor = window.createJumpyBrainNoteEditor(document.querySelector('#note-editor'), {
        onChange: value => changes.push(value), onReference: () => triggers++,
        onFollowReference: title => follows.push(title), onError: error => errors.push(error.message)
      });
    </script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const failures = [];
try {
  const chromium = await loadPlaywrightChromium();
  try { browser = await chromium.launch(); } catch (error) {
    if (!error.message.includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: "chrome" });
  }
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    async function check(name, run, baselineMode = false) {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await page.goto(origin + (baselineMode ? "/baseline" : "/"));
        await run(page);
        assert.deepEqual(await page.evaluate(() => errors), []);
        assert.deepEqual(pageErrors, []);
        console.log(`PASS ${width}px ${name}`);
      } catch (error) {
        failures.push({ width, name, error: error.stack });
        console.error(`FAIL ${width}px ${name}: ${error.message}`);
      } finally { await page.close(); }
    }
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
      await load(page, "```\n[[Inside]]\n```\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Outside]]"]);
      await selectEditorText(page, 0, 3);
      await paste(page, "Fence removed");
      assert.equal(await editorMarkdown(page), "Fence removed\n[[Inside]]\n```\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Inside]]"]);
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), "```\n[[Inside]]\n```\n[[Outside]]");
      assert.deepEqual(await links(page), ["[[Outside]]"]);
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
    await check("read-only navigation lock does not follow", async (page) => {
      await load(page, "[[Alpha]]");
      await page.evaluate(() => richEditor.setReadOnly(true));
      await page.getByRole("link").click();
      assert.deepEqual(await page.evaluate(() => follows), []);
    });
    // Compare failure-sensitive preservation against the unmodified real editor.
    for (const baselineMode of [true, false]) {
      await check(`${baselineMode ? "baseline" : "prototype"} fence reclassification preserves untouched emphasis spelling`, async (page) => {
        const source = "```\nInside\n```\nKeep _italic_ and [[Alpha]].";
        await load(page, source);
        await selectEditorText(page, 10, 11); // Middle backtick of closing fence in visible text.
        await page.keyboard.type("X");
        assert.equal(await editorMarkdown(page), "```\nInside\n`X`\nKeep _italic_ and [[Alpha]].");
      }, baselineMode);
      await check(`${baselineMode ? "baseline" : "prototype"} exact unchanged heading/emphasis around references`, async (page) => {
        const source = "## Heading _italic_\nKeep **bold** and [[snake_case **literal**]].  \n\n- [ ] [[Task]]\nLast";
        await load(page, source);
        assert.equal(await editorMarkdown(page), source);
        await appendEditorText(page, "!");
        assert.equal(await editorMarkdown(page), source + "!");
      }, baselineMode);
    }
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
      const source = "Opening `closed`\nKeep _italic_ and [[Alpha]].\nEnd";
      const edited = source.replace("closed`", "closed");
      await load(page, source);
      assert.deepEqual(await links(page), ["[[Alpha]]"]);
      await selectEditorText(page, 15, 16); await page.keyboard.press("Backspace");
      assert.deepEqual(await links(page), []);
      assert.equal(await editorMarkdown(page), edited);
      await undoEditor(page);
      assert.deepEqual(await links(page), ["[[Alpha]]"]);
      assert.equal(await editorMarkdown(page), source);
      await redo(page);
      assert.deepEqual(await links(page), []);
      assert.equal(await editorMarkdown(page), edited);
    });
    await check("cross-leaf references stay editable and inert without merging formatting", async (page) => {
      await load(page, "al**pha**");
      await selectEditorText(page, 5); await paste(page, "]]");
      await selectEditorText(page, 0); await paste(page, "[[");
      assert.equal(await page.locator("#note-editor").textContent(), "[[alpha]]");
      assert.deepEqual(await links(page), []);
      assert.equal(await page.locator("#note-editor .editor-bold").textContent(), "pha");
      const markdown = await editorMarkdown(page);
      await selectEditorText(page, 4);
      assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null);
      assert.equal(await page.evaluate(() => richEditor.referenceRange()), null);
      assert.deepEqual(await editorSelection(page), [4, 4]);
      assert.equal(await editorMarkdown(page), markdown);
    });
    if (width === 1280 && process.env.JUMPYBRAIN_PROTOTYPE_BENCH) {
      for (const baselineMode of [true, false]) for (const lines of [100, 1000]) {
        const page = await context.newPage(); await page.goto(origin + (baselineMode ? "/baseline" : "/"));
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
        console.log(`BENCH ${baselineMode ? "baseline" : "prototype"} ${lines} lines/${lines * 3} references: hydrate=${hydrate.toFixed(1)}ms, single-edit-to-frame p50=${samples[2].toFixed(1)}ms p95=${samples[4].toFixed(1)}ms (5 local samples, includes automation/frame overhead)`);
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
} else console.log("PASS isolated page-reference prototype (not app integration or physical-device QA)");

async function load(page, text) {
  await page.evaluate((value) => {
    richEditor.setMarkdown(value, true);
    changes.length = 0; follows.length = 0; errors.length = 0;
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
