// Production shell + source-operation backend; disposable notes only. Build first.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { selectEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-fresh-note-feedback-"));
const token = "disposable-fresh-note-key", prompt = "How is your day?";
let server, browser;
try {
  server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const transport = await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/#apiKey=${token}`);
    await newNote(page, "#home-new");
    for (const mode of ["rapid", "delayed", "held-ack", "selected", "select-all"]) {
      if (mode === "select-all") {
        await page.locator("#note-editor").focus();
        const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
        await page.keyboard.press(`${modifier}+A`);
        await page.keyboard.press("Backspace");
      } else if (mode === "selected") {
        await selectEditorText(page, 0, prompt.length);
        await page.keyboard.press("Backspace");
        // Remove the now-empty heading and the adjacent blank paragraphs too.
        for (let index = 0; index < 5; index++) await page.keyboard.press("Backspace");
      } else {
        await selectEditorText(page, prompt.length);
        const held = mode === "held-ack" ? transport.holdNextReply("edit") : undefined;
        try {
          for (let index = 0; index < prompt.length + 5; index++) {
            await page.keyboard.press("Backspace");
            if (mode === "delayed") await page.waitForTimeout(50);
            if (held && index === 0) await held.arrived;
            const live = await page.evaluate(() => state.editor.collaboration.state);
            assert.notEqual(live.status, "conflict", `${width}/${mode}/${index}: ${live.message}`);
          }
        } finally { held?.release(); }
      }
      await saved(page);
      assert.equal(await editorMarkdown(page), "", `${mode} clears the entire note`);
      await canonicalMatches(page);
      await page.keyboard.insertText("A fresh start 🐐");
      await saved(page);
      assert.equal(await editorMarkdown(page), "A fresh start 🐐");
      await canonicalMatches(page);
      assert.equal(await page.locator("#note-save-error").isVisible(), false);
      await page.reload();
      await saved(page);
      assert.equal(await editorMarkdown(page), "A fresh start 🐐", "replacement survives reload");
      await newNote(page, "#new-note");
    }
    // Inject an unprovable editor transaction, then keep typing in the retained
    // draft. Verify the actual shell's feedback, diagnostics and recovery path.
    const technical = "The edit sequence did not reproduce the local draft. /private/fixture.md";
    await page.evaluate(technical => {
      const before = richEditor.getMarkdown(), after = before + "Private draft";
      richEditor.setMarkdown(after);
      state.editor.input(after, { before, after, operations: [], reason: technical });
      richEditor.setMarkdown(after + " retained");
      state.editor.input(after + " retained", { before: after, after: after + " retained", operations: [{ start: after.length, deleteCount: 0, insert: " retained" }] });
    }, technical);
    assert.equal(await page.locator("#toast-message").innerText(), "Your changes haven't been saved. Choose Review changes to continue.");
    assert.equal(await page.locator("#note-save-error").isVisible(), false);
    assert.equal(await page.locator("#note-recover").innerText(), "Review changes");
    assert.equal((await page.locator("body").innerText()).includes(technical), false);
    assert.equal((await page.locator("#note-save-state").getAttribute("aria-label")).includes(technical), false);
    assert.equal(await page.evaluate(() => state.editor.collaboration.state.dirty), true);
    assert.equal(await page.evaluate(() => state.editor.collaboration.body.endsWith(" retained")), true);
    assert.equal(await page.evaluate(technical => state.editor.collaboration.state.message === technical, technical), true, "later edits preserve the original diagnostic failure");
    assert.equal(await page.evaluate(() => JSON.parse(feedbackDiagnostics.snapshot({ view: "note", connection: "connected", companion: false }, navigator.userAgent)).events.some(event => event.operation === "save" && event.code === "conflict")), true);
    await page.locator("#toast-close").click();
    await page.evaluate(() => syncEditorUi(state.editor.state));
    assert.equal(await page.locator("#app-toast").isVisible(), false, "dismissed error does not reappear on state refresh");
    assert.equal(await page.evaluate(() => state.editor.collaboration.resolveConflict("saved")), true);
    await saved(page);
    assert.equal(await page.locator("#app-toast").isVisible(), false, "resolved failure clears the toast");
    await selectEditorText(page, 0, prompt.length);
    await page.keyboard.insertText("Editing works after review");
    await saved(page);
    await canonicalMatches(page);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Fresh-note feedback smoke passed: rapid/delayed/held-ack and selected deletion, empty-note saves, replacement/reload, plain dismissible feedback, diagnostics and retained-draft recovery at desktop/mobile widths.");
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
async function saved(page) {
  await page.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
}
async function canonicalMatches(page) {
  const snapshot = await page.evaluate(() => state.editor.collaboration.snapshot);
  assert.equal(await readFile(path.join(root, snapshot.file), "utf8"), snapshot.prefix + snapshot.body);
  assert.equal(await editorMarkdown(page), snapshot.body);
}

async function newNote(page, selector) {
  const response = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/memories/all/notes"));
  await page.locator(selector).click();
  const created = await (await response).json();
  await page.waitForFunction(id => state.editor?.state.documentId === id && state.editor.collaboration?.state.status === "saved", created.id);
  assert.equal(await editorMarkdown(page), "\n# " + prompt + "\n");
}
