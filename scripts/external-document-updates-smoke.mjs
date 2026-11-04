// Real browser and CLI against disposable Markdown only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
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
    const liveTransport = await installCollaborationSmokeTransport(page);
    const mutationCount = () => liveTransport.observed.filter((message) => ["edit", "undo", "redo", "title", "resync", "stream.start", "stream.chunk", "stream.finish", "stream.cancel"].includes(message.method)).length;
    const errors = [], puts = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() === "PUT") puts.push(request); });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator("#note-editor").waitFor({ state: "visible" });
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
    assert.equal(await page.locator("#note-external-state").textContent(), "", "initial hydration must not claim an external update");
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
      assert.equal(await page.locator("#app-sidebar").isVisible(), false, "collapse preference also applies on narrow screens");
      assert.equal(await page.locator("#toggle-sidebar").isVisible(), true, "narrow navigation can always be expanded");
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
      assert.equal(puts.length, 0, "clean sidebar presentation sends no legacy PUT");
      assert.equal(mutationCount(), 0, "clean sidebar presentation sends no live mutation");
      await appendEditorText(page, "Temporary sidebar draft.");
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      assert.ok((await editorMarkdown(page)).includes("Temporary sidebar draft."), "collapsing preserves unsaved typing");
      await undoEditor(page);
      await page.waitForFunction((body) => richEditor.getMarkdown() === body, body);
      assert.equal(await editorMarkdown(page), body, "sidebar toggle does not reset undo history");
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await page.waitForFunction((body) => state.editor.state.saveStatus === "saved" && state.editor.state.savedBody === body, body);
      puts.length = 0;
      await selectEditorText(page, 5);
    }
    const hydrationMutations = mutationCount();
    let next = body.replace("Agent will revise this.", "A subtle change from the terminal.");
    external(next);
    const acceptedExternal = await readFile(path.join(root, "notes/external.md"), "utf8"), acceptedStat = await stat(path.join(root, "notes/external.md"));
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, next);
    assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
    assert.equal(await page.locator("#note-editor > .external-change").count(), 1);
    if (width === 390) assert.equal(await page.locator("#note-editor > .external-change").evaluate((element) => getComputedStyle(element).animationName), "none");
    assert.deepEqual(await editorSelection(page), caret, "idle caret survives a change to another paragraph");
    assert.equal(puts.length, 0, "external hydration sends no legacy PUT");
    assert.equal(mutationCount(), hydrationMutations, "external hydration sends no live mutation");
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `external-update-${width}.png`) });
    }
    await page.waitForFunction(() => !document.querySelector("#note-editor .external-change"));
    assert.equal(await editorMarkdown(page), next, "caret restoration and highlight expiry do not edit text");
    assert.equal(mutationCount(), hydrationMutations, "selection and highlight expiry send no live mutation");
    assert.equal(await readFile(path.join(root, "notes/external.md"), "utf8"), acceptedExternal, "pure hydration does not stamp or rewrite canonical source");
    assert.equal((await stat(path.join(root, "notes/external.md"))).mtimeMs, acceptedStat.mtimeMs, "pure hydration preserves the physical canonical write time");
    await undoEditor(page);
    assert.equal(await editorMarkdown(page), next, "Undo cannot resurrect the pre-external document");
    await appendEditorText(page, "Temporary local edit.");
    await undoEditor(page);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, next);
    await page.waitForTimeout(900);
    assert.equal(puts.length, 0, "live typing and actor undo use source operations rather than legacy PUT autosave");

    // A separate user's editor follows the same refresh/highlight path as CLI writes.
    // Isolate browser storage so this cannot depend on cross-tab storage events.
    const peerHydrationMutations = mutationCount();
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
      assert.equal(puts.length, 0, "another user's save sends no legacy PUT from the receiving editor");
      assert.equal(mutationCount(), peerHydrationMutations, "another user's source event sends no live echo mutation");
      await undoEditor(page);
      assert.equal(await editorMarkdown(page), next, "Undo cannot restore text from before another user's save");
    } finally {
      await peerContext.close();
    }

    // Title composition and independent body updates can coexist in live mode.
    const compositionMutations = mutationCount();
    await page.locator("#note-name").dispatchEvent("compositionstart");
    const composed = next.replace("First paragraph.", "First paragraph, updated externally.");
    external(composed);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, composed);
    assert.equal(await editorMarkdown(page), composed, "body collaboration does not replace composing title input");
    await page.locator("#note-name").dispatchEvent("compositionend");
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, composed);
    assert.equal(puts.length, 0);
    assert.equal(mutationCount(), compositionMutations, "title composition and unrelated source refresh do not echo a mutation");

    // Structural live reconciliation preserves an active range and scroll.
    await selectEditorText(page, 0, 5);
    const rangeBefore = await editorSelection(page), selectionMutations = mutationCount();
    await page.locator("#note-panel").evaluate((element) => { element.scrollTop = 250; });
    const scroll = await page.locator("#note-panel").evaluate((element) => element.scrollTop);
    const selected = composed.replace("Unchanged paragraph 20.", "A changed paragraph farther down.");
    external(selected);
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, selected);
    assert.deepEqual(await editorSelection(page), rangeBefore, "remote block updates preserve both selected endpoints");
    assert.equal(await page.locator("#note-panel").evaluate((element) => element.scrollTop), scroll);
    assert.equal(mutationCount(), selectionMutations, "range and scroll preservation do not echo source writes");

    // Hold a real source subscription event, then type before its delivery.
    const heldEvent = liveTransport.holdNextEvent(id, (snapshot) => snapshot.body.includes("Agent saved this"));
    const agentBody = selected.replace("Unchanged paragraph 21.", "Agent saved this while the browser was waiting.");
    external(agentBody);
    await heldEvent.arrived;
    await appendEditorText(page, "My current typing.");
    heldEvent.release();
    await page.waitForFunction(() => state.editor.state.saveStatus === "saved" && richEditor.getMarkdown().includes("My current typing.") && richEditor.getMarkdown().includes("Agent saved this"));
    assert.ok((await editorMarkdown(page)).includes("My current typing."), "late subscription snapshots never replace active typing");
    assert.equal(await page.locator("#note-save-error").isVisible(), false, "independent edits resolve without an error banner");
    assert.ok(cli("show").content.includes("My current typing."));
    assert.ok(cli("show").content.includes("Agent saved this"));

    // Both sides add at the end: preserve both additions instead of stopping autosave.
    const beforeAppend = await editorMarkdown(page);
    const heldAppend = liveTransport.holdNextRequest("edit");
    await appendEditorText(page, " More bottom typing.");
    await heldAppend.arrived;
    // Both writers genuinely use the same base. A fresh-hash raw replacement
    // after the human already committed would be an intentional deletion, not
    // a concurrent append that the server could safely infer and resurrect.
    external(beforeAppend + "\nAgent adds at the bottom too.\n");
    heldAppend.release();
    await page.waitForFunction(() => state.editor.state.saveStatus === "saved" && richEditor.getMarkdown().includes("More bottom typing.") && richEditor.getMarkdown().includes("Agent adds at the bottom too."));
    assert.equal(await page.locator("#note-save-error").isVisible(), false);

    // Actual same-passage replacements still require review, using clear copy.
    const heldReplacement = liveTransport.holdNextRequest("edit");
    await replaceEditorText(page, "My conflicting replacement.");
    await heldReplacement.arrived;
    external("Agent conflicting replacement.");
    heldReplacement.release();
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
    const emptyHydrationMutations = mutationCount();
    external("");
    await page.waitForFunction(() => richEditor.getMarkdown() === "");
    assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
    assert.equal(await page.locator("#note-editor .external-change").count(), 0);
    assert.equal(mutationCount(), emptyHydrationMutations, "hydrating an empty body sends no live mutation");

    // Observe direct Markdown writes too, independently of index/agent transport.
    const rawHydrationMutations = mutationCount();
    await writeFile(path.join(root, "notes/external.md"), prefix.replace("External update fixture", "Renamed externally") + "Direct filesystem edit.\n");
    await page.waitForFunction(() => richEditor.getMarkdown() === "Direct filesystem edit.\n");
    assert.equal(await page.locator("#note-name").inputValue(), "Renamed externally");
    assert.equal(mutationCount(), rawHydrationMutations, "filesystem body/title refresh sends no live echo mutation");
    const beforeErrors = await editorMarkdown(page);
    const canonicalBeforeDelete = await readFile(path.join(root, "notes/external.md"), "utf8");
    const heldMissingWrite = liveTransport.holdNextRequest("edit");
    await appendEditorText(page, " Draft survives missing source.");
    const missingDraft = await editorMarkdown(page);
    await heldMissingWrite.arrived;
    await rm(path.join(root, "notes/external.md"));
    await page.waitForFunction(() => state.editor.collaboration.state.status === "conflict");
    assert.equal(await editorMarkdown(page), missingDraft, "a real missing canonical source retains unpublished browser text");
    heldMissingWrite.release();
    await writeFile(path.join(root, "notes/external.md"), canonicalBeforeDelete);
    await page.locator("#note-recover").click();
    await page.waitForFunction((body) => document.getElementById("recovery-saved").value.endsWith(body), beforeErrors);
    assert.ok((await page.locator("#recovery-draft").inputValue()).includes("Draft survives missing source"));
    await page.locator("#recovery-publish").click();
    await page.waitForFunction(() => state.editor.collaboration.state.status === "saved");
    assert.equal(await editorMarkdown(page), missingDraft, "explicit resync publishes the reviewed retained draft after source restoration");
    const beforeDisconnect = await editorMarkdown(page);
    liveTransport.disconnect();
    await page.waitForFunction(() => ["offline", "connecting"].includes(state.editor.collaboration.state.status));
    assert.equal(await editorMarkdown(page), beforeDisconnect, "a disconnected source subscription never clears the editor");
    await page.waitForFunction(() => state.editor.collaboration.state.status === "saved");

    // An old-document subscription event cannot hydrate a newly selected note.
    const oldEvent = liveTransport.holdNextEvent(id, (snapshot) => snapshot.body.includes("Late old-document text"));
    external("Late old-document text.");
    await oldEvent.arrived;
    await page.evaluate((other) => navigation.navigate("/?note=" + other), otherId);
    await page.waitForFunction((other) => state.editor?.state.documentId === other && state.editor.state.loaded, otherId);
    oldEvent.release();
    await page.waitForTimeout(250);
    assert.equal(await editorMarkdown(page), "Another note.\n");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, checks: "CLI/filesystem/other-user editor refresh, highlights/fade/reduced motion, caret/scroll/undo, idle-safe merge of independent edits and concurrent end appends, same-passage review, recovery, deletion/disconnect recovery, stale-subscription navigation", subscriptionMutations: liveTransport.observed.filter((message) => message.method === "edit").length }));
    await page.close();
  }
} finally {
  await browser?.close(); await server?.close();
  await rm(root, { recursive: true, force: true });
}
