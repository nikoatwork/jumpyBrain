// Real browser and CLI against disposable Markdown only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { editorMarkdown, editorSelection, selectEditorText, appendEditorText, replaceEditorText, undoEditor } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-external-updates-"));
const id = "mem_94000000-0000-4000-8000-000000000001";
const otherId = "mem_94000000-0000-4000-8000-000000000002";
const prefix = `---\nid: ${id}\ntype: note\ntitle: External update fixture\n---\n`;
const key = "disposable-external-update-key";
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
function cli(command, args = [], input) {
  const result = spawnSync(process.execPath, [cliPath, command, "--root", root, "--id", id, "--json", ...args], { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function external(body) {
  const current = cli("show");
  cli("update", ["--if-match", current.contentHash], current.content.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)[\s\S]*$/, "$1") + body);
}
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
let server, browser;
try {
  await mkdir(path.join(root, "notes"));
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    const body = "First paragraph.\n\nAgent will revise this.\n\n" + Array.from({ length: 35 }, (_, i) => `Unchanged paragraph ${i}.`).join("\n\n") + "\n";
    await writeFile(path.join(root, "notes/external.md"), prefix + body);
    await writeFile(path.join(root, "notes/other.md"), `---\nid: ${otherId}\ntype: note\ntitle: Other fixture\n---\nAnother note.\n`);
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: width === 390 ? "dark" : "light", reducedMotion: width === 390 ? "reduce" : "no-preference" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], puts = [], readDurations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() === "PUT") puts.push(request); });
    page.on("requestfinished", (request) => {
      if (request.method() === "GET" && request.url().endsWith(`/documents/${id}`)) readDurations.push(request.timing().responseEnd);
    });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    await selectEditorText(page, 5);
    const caret = await editorSelection(page);
    if (width === 1280) {
      const surface = await page.locator("#note-editor").elementHandle();
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      assert.equal(await page.locator("#app-sidebar").isVisible(), false);
      assert.equal(await editorMarkdown(page), body);
      assert.deepEqual(await editorSelection(page), caret, "sidebar toggle retains the editor caret");
      assert.equal(await surface.evaluate((element) => element === document.querySelector("#note-editor")), true);
      assert.equal(await page.getByRole("button", { name: "Expand sidebar", exact: true }).getAttribute("aria-expanded"), "false");
      if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
        await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, "sidebar-collapsed-light.png") });
        await page.emulateMedia({ colorScheme: "dark" });
        await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, "sidebar-collapsed-dark.png") });
        await page.emulateMedia({ colorScheme: "light" });
      }
      await page.reload();
      await page.locator("#note-editor").waitFor({ state: "visible" });
      assert.equal(await page.locator("#app-sidebar").isVisible(), false, "collapse persists across reload");
      await page.setViewportSize({ width: 390, height: 800 });
      assert.equal(await page.locator("#app-sidebar").isVisible(), true, "top navigation remains available on narrow screens");
      assert.equal(await page.locator("#toggle-sidebar").isVisible(), false);
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.locator("#app-sidebar").isVisible(), false);
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#app-sidebar").isVisible(), true, "keyboard can restore navigation");
      const sibling = await page.context().newPage();
      await sibling.goto(server.url);
      await sibling.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      await page.waitForFunction(() => document.getElementById("toggle-sidebar").getAttribute("aria-expanded") === "false");
      await sibling.close();
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      assert.equal(puts.length, 0, "clean sidebar presentation changes never write the note");
      await appendEditorText(page, "Temporary sidebar draft.");
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      assert.ok((await editorMarkdown(page)).includes("Temporary sidebar draft."), "collapsing preserves unsaved typing");
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), body, "sidebar toggle does not reset undo history");
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await page.waitForFunction((body) => state.editor.state.saveStatus === "saved" && state.editor.state.savedBody === body, body);
      puts.length = 0;
      await selectEditorText(page, 5);
    }
    let next = body.replace("Agent will revise this.", "A subtle change from the terminal.");
    external(next);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, next);
    assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
    assert.equal(await page.locator("#note-editor > .external-change").count(), 1);
    if (width === 390) assert.equal(await page.locator("#note-editor > .external-change").evaluate((element) => getComputedStyle(element).animationName), "none");
    assert.deepEqual(await editorSelection(page), caret, "idle caret survives a change to another paragraph");
    assert.equal(puts.length, 0, "external hydration never writes back");
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `external-update-${width}.png`) });
    }
    await page.waitForFunction(() => !document.querySelector("#note-editor .external-change"));
    assert.equal(await editorMarkdown(page), next, "caret restoration and highlight expiry do not edit text");
    await undoEditor(page);
    assert.equal(await editorMarkdown(page), next, "Undo cannot resurrect the pre-external document");
    await appendEditorText(page, "Temporary local edit.");
    await undoEditor(page);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, next);
    await page.waitForTimeout(900);
    assert.equal(puts.length, 0, "new local edits undo to the accepted external baseline without a write");

    // A separate user's editor follows the same refresh/highlight path as CLI writes.
    // Isolate browser storage so this cannot depend on cross-tab storage events.
    const peerContext = await browser.newContext();
    try {
      const peer = await peerContext.newPage();
      await peer.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await peer.locator("#note-editor").waitFor({ state: "visible" });
      const previous = next;
      await selectEditorText(peer, "First paragraph.".length);
      await peer.keyboard.insertText(" Written by another user.");
      next = previous.replace("First paragraph.", "First paragraph. Written by another user.");
      await peer.waitForFunction((body) => state.editor.state.saveStatus === "saved" && state.editor.state.savedBody === body, next);
      await page.waitForFunction((body) => richEditor.getMarkdown() === body, next);
      assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
      assert.equal(await page.locator("#note-editor > .external-change").count(), 1);
      assert.equal(puts.length, 0, "another user's save never writes back from the receiving editor");
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), next, "Undo cannot restore text from before another user's save");
    } finally {
      await peerContext.close();
    }

    // Composition holds even a clean note; it does not require a dirty event.
    await page.locator("#note-name").dispatchEvent("compositionstart");
    const composed = next.replace("First paragraph.", "First paragraph, updated externally.");
    external(composed);
    await page.waitForFunction(() => state.editor.state.externalStatus === "pending");
    assert.equal(await editorMarkdown(page), next);
    await page.locator("#note-name").dispatchEvent("compositionend");
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, composed);
    assert.equal(puts.length, 0);

    // Preserve a scrolled reading position and an active selection until released.
    await selectEditorText(page, 0, 5);
    const selected = composed.replace("Unchanged paragraph 20.", "A changed paragraph farther down.");
    external(selected);
    await page.waitForFunction(() => state.editor.state.externalStatus === "pending");
    assert.equal(await editorMarkdown(page), composed);
    await selectEditorText(page, 5);
    await page.locator("#note-panel").evaluate((element) => { element.scrollTop = 250; });
    const scroll = await page.locator("#note-panel").evaluate((element) => element.scrollTop);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, selected);
    assert.equal(await page.locator("#note-panel").evaluate((element) => element.scrollTop), scroll);

    // Hold a real GET response, then type before it reaches the controller.
    const arrived = deferred(), release = deferred();
    let hold = true;
    const docUrl = `${server.url}/memories/all/documents/${id}`;
    await page.route(docUrl, async (route) => {
      if (route.request().method() !== "GET" || !hold) return route.continue();
      hold = false;
      const response = await route.fetch();
      arrived.resolve(); await release.promise;
      await route.fulfill({ response });
    });
    const agentBody = selected.replace("Unchanged paragraph 21.", "Agent saved this while the browser was waiting.");
    external(agentBody);
    await arrived.promise;
    await appendEditorText(page, "My current typing.");
    const draft = await editorMarkdown(page);
    release.resolve();
    await page.waitForTimeout(150);
    assert.equal(await editorMarkdown(page), draft, "late reads never replace active typing");
    await page.waitForFunction(() => state.editor.state.saveStatus === "saved" && richEditor.getMarkdown().includes("My current typing.") && richEditor.getMarkdown().includes("Agent saved this"));
    assert.equal(await page.locator("#note-save-error").isVisible(), false, "independent edits resolve without an error banner");
    assert.ok(cli("show").content.includes("My current typing."));
    assert.ok(cli("show").content.includes("Agent saved this"));
    await page.unroute(docUrl);

    // Both sides add at the end: preserve both additions instead of stopping autosave.
    const beforeAppend = await editorMarkdown(page);
    await appendEditorText(page, " More bottom typing.");
    external(beforeAppend + "\nAgent adds at the bottom too.\n");
    await page.waitForFunction(() => state.editor.state.saveStatus === "saved" && richEditor.getMarkdown().includes("More bottom typing.") && richEditor.getMarkdown().includes("Agent adds at the bottom too."));
    assert.equal(await page.locator("#note-save-error").isVisible(), false);

    // Actual same-passage replacements still require review, using clear copy.
    await page.locator("#note-name").dispatchEvent("compositionstart");
    await replaceEditorText(page, "My conflicting replacement.");
    external("Agent conflicting replacement.");
    await page.locator("#note-name").dispatchEvent("compositionend");
    await page.waitForFunction(() => state.editor.state.saveStatus === "failed");
    assert.equal(await page.locator("#note-save-state").innerText(), "Changes need review");
    assert.doesNotMatch(await page.locator("#note-save-error").innerText(), /hash|stale|412/);
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `overlap-review-${width}.png`) });
    await page.locator("#note-recover").click();
    await page.waitForFunction(() => document.querySelector("#recovery-saved").value.includes("Agent conflicting replacement"));
    assert.ok((await page.locator("#recovery-draft").inputValue()).includes("My conflicting replacement"));
    await page.locator("#recovery-reload").click();
    await page.waitForFunction(() => richEditor.getMarkdown() === "Agent conflicting replacement.");

    // Body deletions are an update too, including an entirely empty body.
    external("");
    await page.waitForFunction(() => richEditor.getMarkdown() === "");
    assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
    assert.equal(await page.locator("#note-editor .external-change").count(), 0);

    // Observe direct Markdown writes too, independently of index/agent transport.
    await writeFile(path.join(root, "notes/external.md"), prefix.replace("External update fixture", "Renamed externally") + "Direct filesystem edit.\n");
    await page.waitForFunction(() => richEditor.getMarkdown() === "Direct filesystem edit.\n");
    assert.equal(await page.locator("#note-name").inputValue(), "Renamed externally");
    const beforeErrors = await editorMarkdown(page);
    let missingRead = false;
    await page.route(docUrl, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      missingRead = true; await route.fulfill({ status: 404, json: { error: "missing_id" } });
    });
    await page.waitForTimeout(2300);
    assert.equal(missingRead, true);
    assert.equal(await editorMarkdown(page), beforeErrors, "a missing-note read never clears the editor");
    await page.unroute(docUrl);

    // An old-document response cannot hydrate a newly selected document.
    const oldRead = deferred(), oldRelease = deferred();
    hold = true;
    await page.route(docUrl, async (route) => {
      if (route.request().method() !== "GET" || !hold) return route.continue();
      hold = false;
      const response = await route.fetch(); oldRead.resolve(); await oldRelease.promise;
      await route.fulfill({ response });
    });
    external("Late old-document text.");
    await oldRead.promise;
    await page.evaluate((other) => navigation.navigate("/?note=" + other), otherId);
    await page.waitForFunction((other) => state.editor?.state.documentId === other && state.editor.state.loaded, otherId);
    oldRelease.resolve();
    await page.waitForTimeout(250);
    assert.equal(await editorMarkdown(page), "Another note.\n");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, checks: "CLI/filesystem/other-user editor refresh, highlights/fade/reduced motion, caret/scroll/undo, idle-safe merge of independent edits and concurrent end appends, same-passage review, recovery, deletion/read errors, navigation", reads: readDurations.length, maxReadMs: Math.round(Math.max(...readDurations)) }));
    await page.close();
  }
} finally {
  await browser?.close(); await server?.close();
  await rm(root, { recursive: true, force: true });
}
