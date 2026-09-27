// Real-browser WYSIWYG and preservation checks; only disposable Markdown is written.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { startJumpyBrainHttpServer } = await import(process.env.JUMPYBRAIN_SMOKE_PACKAGE_DIR
  ? pathToFileURL(path.join(process.env.JUMPYBRAIN_SMOKE_PACKAGE_DIR, "dist/server/index.js")).href
  : new URL("../dist/server/index.js", import.meta.url).href);
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";
import { editorMarkdown, appendEditorText, selectEditorText, replaceEditorText, undoEditor } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-lexical-smoke-"));
const key = "disposable-lexical-key";
const id = "mem_90000000-0000-4000-8000-000000000001";
const body = ["", "# A readable heading", "", "## A smaller heading", "", "Keep **bold**, _italic_, and ***both*** here.  ", "",
  "[[Exact Page Name]] and [link](javascript:alert(1))", "![image](https://example.invalid/never-fetch.png)",
  "| Table | Value |", "| --- | --- |", "| retained | **exactly** |", "",
  "```js", "# not a heading", "**not bold**", "console.log('<script>');", "```", "",
  "- [ ] Task", "    indented code **literal**", "<img src=x onerror=alert(1)>", "<script>window.pwned = true</script>",
  "\\*escaped\\* and a\\_path", "~~obsolete~~", "**multiline", "continued**", "Unicode café 日本語 🐐", ""].join("\n");
const prefix = `---\nid: ${id}\ntype: note\ntitle: Preservation fixture\ncustom: keep-me\n---\n`;
let server, browser;
try {
  await mkdir(path.join(root, "notes"));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium();
  try { browser = await chromium.launch(); } catch (error) {
    if (!error.message.includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: "chrome" });
  }
  for (const width of [1280, 390]) {
    const canonicalPath = path.join(root, "notes/preservation.md");
    const original = (prefix + body).replace(/\n/g, "\r\n");
    await writeFile(canonicalPath, original);
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(15_000);
    const errors = [], puts = [], external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "PUT") puts.push(request.postDataJSON());
      if (!request.url().startsWith(server.url)) external.push(request.url());
    });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    assert.equal(await page.locator("#note-editor h1").innerText(), "A readable heading");
    assert.equal(await page.locator("#note-editor h2").innerText(), "A smaller heading");
    assert.ok(await page.locator("#note-editor .editor-bold").count());
    assert.ok(await page.locator("#note-editor .editor-italic").count());
    assert.equal(await page.locator("#note-editor img, #note-editor script, #note-editor a").count(), 0);
    assert.equal(await editorMarkdown(page), body);
    await page.locator("#open-search").click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    assert.equal(puts.length, 0, "load, selection and blur must not rewrite Markdown");
    assert.equal(await readFile(canonicalPath, "utf8"), original);
    await appendEditorText(page, "Edited below unsupported Markdown.");
    await saved(page);
    assert.equal(await editorMarkdown(page), body + "Edited below unsupported Markdown.");
    const edited = await readFile(canonicalPath, "utf8");
    assert.match(edited, /custom: ["']?keep-me/);
    assert.ok(puts.at(-1).content.endsWith((body + "Edited below unsupported Markdown.").replace(/\n/g, "\r\n")), "browser submits original CRLF style");
    assert.equal(edited.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace(/\r\n/g, "\n"), body + "Edited below unsupported Markdown.", "untouched Markdown survives the server's existing newline normalization");
    await page.reload();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    assert.equal(await editorMarkdown(page), body + "Edited below unsupported Markdown.");
    // Editing unsupported blocks must not run shortcuts and delete their syntax.
    for (const [needle, suffix] of [["**not bold**", " **more**"], ["~~obsolete~~", "!"], ["continued**", "!"]]) {
      const visible = await page.locator("#note-editor").textContent();
      await selectEditorText(page, visible.indexOf(needle) + needle.length);
      await page.keyboard.type(suffix);
      await saved(page);
      assert.ok((await editorMarkdown(page)).includes(needle + suffix), needle);
    }
    const literal = page.locator(".markdown-literal").filter({ hasText: "**not bold**" });
    const currentVisible = await page.locator("#note-editor").textContent();
    await selectEditorText(page, currentVisible.indexOf("not bold"), currentVisible.indexOf("not bold") + 8);
    const literalBefore = await editorMarkdown(page);
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    assert.equal(await editorMarkdown(page), literalBefore, "literal formatting is deliberately blocked, never shown then lost");
    assert.equal(await literal.locator(".editor-bold").count(), 0);

    // Create a real note, rename it, and type Markdown shortcuts into the rich surface.
    await page.locator("#new-note").click();
    await page.waitForURL((url) => url.searchParams.get("note") !== id);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    await page.locator("#note-name").fill(`WYSIWYG notes · ${width}px`);
    await replaceEditorText(page, "");
    // insertText("") does not delete the selected body; Backspace is a real edit.
    await page.keyboard.press("Backspace");
    await page.keyboard.type("# Write naturally");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## A smaller heading");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Keep it simple: **bold** and *italic*.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("No preview. Just write.");
    await saved(page);
    assert.equal(await page.locator("#note-editor h1").innerText(), "Write naturally");
    assert.equal(await page.locator("#note-editor h2").innerText(), "A smaller heading");
    assert.ok((await editorMarkdown(page)).includes("**bold**"));
    assert.ok((await editorMarkdown(page)).includes("*italic*"));
    assert.ok(await page.locator("#note-editor .editor-bold").count());
    assert.ok(await page.locator("#note-editor .editor-italic").count());
    const beforeFormat = await editorMarkdown(page);
    // Toolbar formatting retains the selected range and is undoable across saves.
    const text = await page.locator("#note-editor").textContent();
    const start = text.indexOf("No preview");
    await selectEditorText(page, start, start + "No preview".length);
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await saved(page);
    assert.match(await editorMarkdown(page), /\*\*No preview\*\*/);
    await undoEditor(page);
    await saved(page);
    assert.equal(await editorMarkdown(page), beforeFormat);
    await page.reload();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    assert.equal(await editorMarkdown(page), beforeFormat);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      await page.locator("#note-name").focus();
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `lexical-${width}.png`) });
    }
    // Clipboard HTML cannot introduce executable markup or fetch images.
    await page.locator("#note-editor").focus();
    await page.locator("#note-editor").evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "<img src=x onerror=alert(1)> pasted text");
      clipboardData.setData("text/html", '<img src="https://example.invalid/paste.png" onerror="alert(1)">');
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    });
    await saved(page);
    assert.match(await editorMarkdown(page), /<img src=x onerror=alert\(1\)> pasted text/);
    assert.equal(await page.locator("#note-editor img").count(), 0);
    // Exact reference titles may contain Markdown punctuation; never escape it.
    const referenceTitle = "snake_case **literal**";
    await page.route("**/memories/all/search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ provenance: { file: "notes/preservation.md", metadata: { id, title: referenceTitle } } }], index: { stale: false } }) }));
    await appendEditorText(page, "\nReference: ");
    await page.locator("#insert-reference").click();
    await page.locator("#note-search-input").fill("snake");
    await page.locator("#search-results [role=option]").first().waitFor();
    await page.keyboard.press("Enter");
    await saved(page);
    assert.ok((await editorMarkdown(page)).includes(`[[${referenceTitle}]]`));
    await page.reload();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    assert.ok((await editorMarkdown(page)).includes(`[[${referenceTitle}]]`));
    assert.equal(await page.locator(".markdown-reference").last().textContent(), `[[${referenceTitle}]]`);
    // Empty document transitions must still clear history from the previous note.
    await replaceEditorText(page, "");
    await page.keyboard.press("Backspace");
    await saved(page);
    const emptyId = "mem_90000000-0000-4000-8000-000000000002";
    await writeFile(path.join(root, "notes/empty.md"), `---\nid: ${emptyId}\ntitle: Empty note\n---\n`);
    await page.evaluate((id) => navigation.navigate("/?note=" + id), emptyId);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    const writesBeforeUndo = puts.length;
    await undoEditor(page);
    await page.waitForTimeout(900);
    assert.equal(await editorMarkdown(page), "", "Undo cannot resurrect another document's body");
    assert.equal(puts.length, writesBeforeUndo);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS Lexical WYSIWYG/preservation/security ${width}px`);
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
async function saved(page) {
  await page.waitForFunction(() => document.querySelector("#note-save-state").textContent === "Saved");
}
