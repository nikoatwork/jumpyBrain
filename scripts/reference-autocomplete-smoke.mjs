// Isolated fixture; exercises the REAL search controller with stub transport,
// not search relevance, authentication, app navigation, or real IME/device QA.
// Requires existing production dist; does not build an alternative editor or plugin.
// Run: npx --package=playwright node scripts/reference-autocomplete-smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";
import { selectEditorText, appendEditorText, editorMarkdown, undoEditor } from "./editor-smoke-helpers.mjs";

const shell = graphPageHtml("isolated-autocomplete").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
// Same extraction technique as test/notes-browser.test.js; do not fork ranking/controller logic.
function extract(name) {
  const start = shell.indexOf("function " + name + "(");
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let end = shell.indexOf("{", start); end < shell.length; end++) {
    if (shell[end] === "{") depth++;
    if (shell[end] === "}" && --depth === 0) return shell.slice(start, end + 1);
  }
  throw new Error("Unterminated " + name);
}
const controllers = ["isValidMemoryDocumentId", "normalizeNoteResults", "createNoteSearch"].map(extract).join("\n");
const editorBundle = await readFile(new URL("../dist/adapters/http-server/editor-bundle.js", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/editor.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(editorBundle); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated production autocomplete</title>
    <style>body{font:16px/1.8 system-ui;margin:20px;min-height:1200px}#note-panel{max-height:300px;overflow:auto;margin-top:40px;border:1px solid #eee}#note-editor{white-space:pre-wrap;overflow-wrap:anywhere;min-height:150px}p{margin:0;min-height:1.8em}</style>
    <button id="before">Before</button><section id="note-panel"><div id="note-editor" role="textbox" aria-label="Markdown" aria-multiline="true"></div></section><button id="outside">Outside</button>
    <script src="/editor.js"></script><script>
      ${controllers}
      var changes=[], follows=[], errors=[], requests=[], held=[], session=0, mode="ready", transportStale=false;
      var fixtureResults = ["Alpha", "Beta"].map((title,i) => ({provenance:{file:"notes/"+i+".md", metadata:{id:"mem_90000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),title}},snippet:"Fixture result"}));
      var richEditor = window.createJumpyBrainNoteEditor(document.querySelector('#note-editor'), {
        onChange: value => changes.push(value), onReference: () => {}, onActivateReference: title => follows.push(title), onError: error => errors.push(error.message)
      });
      var popup = window.installReferenceAutocomplete(document.querySelector('#note-editor'), richEditor, {
        createSearch: createNoteSearch, getSession: () => session, onError: error => errors.push(error.message),
        fetch: async (query, signal) => {
          requests.push({query,signal});
          if(mode === "hold") return new Promise(resolve => held.push(resolve));
          if(mode === "auth") throw Object.assign(new Error("auth"),{status:401});
          if(mode === "error") throw Object.assign(new Error("unavailable"),{status:500});
          return {results:fixtureResults,index:{stale:transportStale}};
        }
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
    async function check(name, run) {
      const page = await context.newPage(); page.setDefaultTimeout(5000);
      const pageErrors = []; page.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await page.goto(origin); await run(page);
        assert.deepEqual(await page.evaluate(() => errors), []); assert.deepEqual(pageErrors, []);
        console.log(`PASS ${width}px ${name}`);
      } catch (error) { failures.push({ width, name, error: error.stack }); console.error(`FAIL ${width}px ${name}: ${error.message}`); }
      finally { await page.close(); }
    }
    await check("empty query, continued typing, insertion and undo with focus retained", async (page) => {
      await load(page, "- Start "); await appendEditorText(page, "[[");
      await visible(page); assert.match(await menu(page).innerText(), /Type a page title/);
      await page.waitForTimeout(250); assert.equal(await page.evaluate(() => requests.length), 0);
      await page.keyboard.type("alp"); await ready(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), "note-editor");
      assert.equal(await editorMarkdown(page), "- Start [[alp");
      assert.ok(await page.evaluate(() => requests.at(-1).query === "alp"));
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      assert.equal(await editorMarkdown(page), "- Start [[Beta]]");
      assert.deepEqual(await page.evaluate(() => follows), []);
      await undoEditor(page); assert.equal(await editorMarkdown(page), "- Start [[alp");
    });
    await check("heading and nested bullets still work with code elsewhere", async (page) => {
      for (const source of ["# Heading [[alp", "- Parent\n    - Nested [[alp\n```\n[[not a link]]\n```", "`code`\n\nParagraph [[alp"]) {
        await load(page, source);
        const visibleText = await page.locator("#note-editor").textContent();
        await selectEditorText(page, visibleText.indexOf("[[alp") + 5);
        await ready(page); await page.keyboard.press("Enter");
        assert.equal(await editorMarkdown(page), source.replace("[[alp", "[[Alpha]]"));
      }
    });
    await check("Escape is non-destructive; caret departure invalidates session", async (page) => {
      await load(page, "- [[alp"); await selectEditorText(page, 7); await ready(page);
      await page.keyboard.press("Escape"); await page.waitForTimeout(250);
      assert.equal(await menu(page).isVisible(), false); assert.equal(await editorMarkdown(page), "- [[alp");
      await page.evaluate(() => popup.refresh()); assert.equal(await menu(page).isVisible(), false);
      await page.keyboard.type("h"); await ready(page);
      await selectEditorText(page, 0); await page.waitForTimeout(60); assert.equal(await menu(page).isVisible(), false);
    });
    await check("pointer/touch accepts latest range, preserving trailing text", async (page) => {
      await load(page, "Before [[alp]] after"); await selectEditorText(page, 12); await ready(page);
      const row = menu(page).getByRole("option").nth(1);
      if (width === 390) await row.tap(); else await row.click();
      assert.equal(await editorMarkdown(page), "Before [[Beta]] after");
      assert.ok(await page.evaluate(() => document.querySelector('#note-editor').contains(document.activeElement)));
      assert.deepEqual(await page.evaluate(() => follows), []);
    });
    await check("late requests cannot resurrect dismissed or switched sessions", async (page) => {
      await page.evaluate(() => { mode = "hold"; });
      await load(page, "[[alp"); await selectEditorText(page, 5);
      await page.waitForFunction(() => requests.length === 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => requests[0].signal.aborted), true);
      await page.evaluate(() => held.shift()({results:fixtureResults,index:{stale:false}}));
      await page.waitForTimeout(100); assert.equal(await menu(page).isVisible(), false);
      await page.keyboard.type("h"); await page.waitForFunction(() => requests.length === 2);
      await page.evaluate(() => { session++; popup.refresh(); held.shift()({results:fixtureResults,index:{stale:false}}); });
      await page.waitForTimeout(100); assert.equal(await menu(page).isVisible(), false);
      assert.equal(await editorMarkdown(page), "[[alph");
    });
    await check("auth/error/empty feedback and stale results stay inline", async (page) => {
      for (const [mode, message] of [["auth", /Connect with an access key/], ["error", /Search is unavailable/], ["ready", /Index may be stale/]]) {
        await page.evaluate((value) => { window.mode = value; transportStale = true; }, mode);
        await load(page, "[[alpha"); await selectEditorText(page, 7);
        await page.waitForFunction(() => popup.state.status !== "loading" && popup.state.status !== "idle");
        assert.match(await menu(page).innerText(), message);
        assert.equal(await page.evaluate(() => document.activeElement.id), "note-editor");
      }
      await page.evaluate(() => { fixtureResults = []; });
      await page.keyboard.type("x"); await page.waitForFunction(() => popup.state.active && popup.state.query === "alphax" && popup.state.status === "ready");
      assert.match(await menu(page).innerText(), /No notes found/);
    });
    await check("composition guards and unsafe titles block insertion", async (page) => {
      await load(page, "[[alp"); await selectEditorText(page, 5); await ready(page);
      await page.locator("#note-editor").dispatchEvent("compositionstart");
      assert.equal(await menu(page).isVisible(), false);
      await page.locator("#note-editor").dispatchEvent("keydown", { key: "Enter", isComposing: true });
      assert.equal(await editorMarkdown(page), "[[alp");
      await page.locator("#note-editor").dispatchEvent("compositionend"); await ready(page);
      await page.evaluate(() => { fixtureResults[0].provenance.metadata.title = "bad|alias"; });
      await page.keyboard.type("h"); await ready(page, "alph"); await page.keyboard.press("Enter");
      assert.match(await menu(page).innerText(), /No safe exact page title/);
      assert.equal(await editorMarkdown(page), "[[alph");
    });
    await check("positioning follows scroll/resize and clips offscreen caret", async (page) => {
      await load(page, Array.from({length:16},(_,i)=>"Line "+i).join("\n") + "\n- [[alp");
      await page.locator("#note-editor p").last().scrollIntoViewIfNeeded();
      const text = await page.locator("#note-editor").textContent(); await selectEditorText(page, text.length); await ready(page);
      await bounded(page);
      await page.evaluate(() => { document.querySelector('#note-panel').scrollTop = 0; });
      await page.waitForTimeout(80); assert.equal(await menu(page).isVisible(), false);
      await page.locator("#note-editor p").last().scrollIntoViewIfNeeded(); await visible(page); await bounded(page);
      await page.setViewportSize({width, height:420}); await page.waitForTimeout(80);
      // After a viewport change the popup may safely hide if the caret is outside.
      if (await menu(page).isVisible()) await bounded(page);
    });
    await check("wrapped caret and zoomed visual viewport keep suggestions bounded", async (page) => {
      await load(page, "Wrapped text ".repeat(24) + "[[alp");
      await page.locator("#note-editor p").last().scrollIntoViewIfNeeded();
      const text = await page.locator("#note-editor").textContent();
      await selectEditorText(page, text.length);
      await ready(page); await bounded(page);
      const session = await page.context().newCDPSession(page);
      try {
        await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.5 });
        await page.waitForTimeout(100);
        // Offscreen carets may safely hide; a visible popup must fit the actual
        // shrunken/panned visual viewport, not just the layout viewport.
        if (await menu(page).isVisible()) {
          const box = await menu(page).boundingBox();
          const view = await page.evaluate(() => ({ x: visualViewport.offsetLeft, y: visualViewport.offsetTop, width: visualViewport.width, height: visualViewport.height }));
          assert.ok(box.x >= view.x && box.y >= view.y && box.x + box.width <= view.x + view.width + 1 && box.y + box.height <= view.y + view.height + 1);
        }
        await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
        await visible(page); await bounded(page);
      } finally { await session.detach(); }
    });
    await check("code/escape contexts remain inert; destroy removes popup", async (page) => {
      for (const source of ["\\[[alp", "![[alp", "`[[alp`", "```\n[[alp\n```", "    [[alp",
        "`first\n[[alp\nlast`", "``first\n` [[alp\nlast``", "> ```\n> [[alp\n> ```",
        "- ~~~\n  [[alp\n  ~~~", "> 1. ```\n>    - [[alp\n>    ```", "`unclosed\n[[alp",
        "- ~~~\n  ~~~\n[[alp", "Before [[alp suffix",
        "`unclosed\n> ```\n> ` [[alp\n> ```", "- item\n  ~~~\n~~~\n[[alp\n~~~"]) {
        await load(page, source);
        const text = await page.locator("#note-editor").textContent();
        await selectEditorText(page, text.indexOf("[[alp") + 5);
        await page.waitForTimeout(250); assert.equal(await menu(page).isVisible(), false, source);
      }
      await page.evaluate(() => popup.destroy()); assert.equal(await menu(page).count(), 0);
    });
    await check("cross-leaf triggers never open or replace a partial formatted reference", async (page) => {
      // Construct actual formatted leaves through editing: imported [[...]] text
      // intentionally treats title punctuation literally rather than as emphasis.
      for (const [source, opening, closing, replacement] of [
        ["al**pha**", "[[", "]]"], // title split
        ["Xalpha", "[", "]]", [0, "["]], // opener split
        ["alphaX", "[[", "]", [5, "]"]], // closer split
        ["al**pha**", "[[", ""], // unfinished title split
      ]) {
        await load(page, source);
        if (replacement) {
          await selectEditorText(page, replacement[0], replacement[0] + 1);
          await paste(page, replacement[1]);
          await selectEditorText(page, replacement[0], replacement[0] + 1);
          await page.evaluate(() => richEditor.format("bold"));
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        let text = await page.locator("#note-editor").textContent();
        await selectEditorText(page, text.length); await paste(page, closing);
        await selectEditorText(page, 0); await paste(page, opening);
        text = await page.locator("#note-editor").textContent();
        assert.equal(text, closing ? "[[alpha]]" : "[[alpha");
        const markdown = await editorMarkdown(page);
        const bold = await page.locator("#note-editor .editor-bold").allTextContents();
        assert.ok(bold.length, source);
        await page.evaluate(() => { requests.length = 0; });
        for (let caret = 2; caret <= text.length; caret++) {
          await selectEditorText(page, caret);
          await page.waitForTimeout(220);
          assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null, source + " @ " + caret);
          assert.equal(await menu(page).isVisible(), false, source + " @ " + caret);
        }
        assert.equal(await page.evaluate(() => requests.length), 0);
        assert.equal(await editorMarkdown(page), markdown);
        assert.deepEqual(await page.locator("#note-editor .editor-bold").allTextContents(), bold);
      }
    });
    await check("formatting an active query invalidates pending suggestions", async (page) => {
      await page.evaluate(() => { mode = "hold"; });
      await load(page, "Start alp");
      await selectEditorText(page, 6); await paste(page, "[[");
      await selectEditorText(page, 11);
      await page.waitForFunction(() => requests.length > 0);
      await selectEditorText(page, 9, 11);
      await page.evaluate(() => richEditor.format("bold"));
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await selectEditorText(page, 9);
      await page.waitForTimeout(60);
      const markdown = await editorMarkdown(page);
      assert.equal(await page.evaluate(() => requests.every((request) => request.signal.aborted)), true);
      await page.evaluate(() => held.splice(0).forEach((resolve) => resolve({results:fixtureResults,index:{stale:false}})));
      await page.waitForTimeout(250);
      assert.equal(await menu(page).isVisible(), false);
      assert.equal(await page.evaluate(() => richEditor.autocompleteRange()), null);
      assert.equal(await page.locator("#note-editor").textContent(), "Start [[alp");
      assert.deepEqual(await page.locator("#note-editor .editor-bold").allTextContents(), ["lp"]);
      assert.equal(await editorMarkdown(page), markdown);
    });
    await context.close();
  }
} finally { if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve)); }
for (const failure of failures) console.error(`\n${failure.width}px ${failure.name}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
else console.log("PASS isolated autocomplete fixture; transport stubbed, real IME/AT/physical devices not validated");
async function paste(page, text) {
  await page.locator("#note-editor").evaluate((element, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, text);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
function menu(page) { return page.locator('[data-reference-autocomplete]'); }
async function visible(page) { await menu(page).waitFor({state:"visible"}); }
async function ready(page, query) {
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.waitForFunction((expected) => popup.state.active && popup.state.status === "ready" && (expected === undefined || popup.state.query === expected) && document.querySelectorAll('[data-reference-autocomplete] [role=option]').length > 0, query);
}
async function load(page, value) {
  await page.evaluate((text) => { session++; popup.dismiss(); richEditor.setMarkdown(text,true); popup.refresh(); changes.length=0; follows.length=0; }, value);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function bounded(page) {
  const box = await menu(page).boundingBox(), view = page.viewportSize();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, JSON.stringify({box,view}));
}
