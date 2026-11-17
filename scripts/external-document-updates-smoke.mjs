// Real browser and CLI against disposable Markdown only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
    if (!await page.locator("#recovery-options").evaluate(element => element.open)) await page.locator("#recovery-options > summary").click();
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
    if (!await page.locator("#recovery-options").evaluate(element => element.open)) await page.locator("#recovery-options > summary").click();
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

  // Two clean viewers follow real --target-url CLI writes against the loopback
  // hosted target: a hash-guarded append, a metadata-only update and a
  // deliberate replacement, plus typing while a held document event has not
  // been delivered. Bounded deadlines report the editor state explicitly.
  {
    const hostedId = "mem_94000000-0000-4000-8000-000000000004";
    const hostedFile = path.join(root, "notes/hosted.md");
    await writeFile(hostedFile, `---\nid: ${hostedId}\ntype: note\ntitle: Hosted update fixture\ncustom: retained\n---\nHosted base body.\n`);
    // spawnSync would freeze the in-process server this CLI talks to, so the
    // hosted target runs the real CLI through an async child instead.
    const hostedCli = async (command, args = [], input) => {
      const child = spawn(process.execPath, [cliPath, command, "--target-url", server.url, "--id", hostedId, "--json", ...args], { env: { ...process.env, JUMPYBRAIN_API_KEY: key } });
      const result = await new Promise((resolve, reject) => {
        let stdout = "", stderr = "";
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("hosted CLI command timed out")); }, 120_000);
        child.stdout.on("data", (chunk) => stdout += chunk);
        child.stderr.on("data", (chunk) => stderr += chunk);
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("close", (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
        child.stdin.on("error", () => {});
        child.stdin.end(input);
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    };
    const DELIVERY_MS = 8000;
    const delivered = async (page, label, source, arg) => {
      try { await page.waitForFunction(source, arg, { timeout: DELIVERY_MS }); }
      catch {
        const diagnosis = await page.evaluate(() => ({ status: state.editor?.collaboration?.state.status, markdown: richEditor?.getMarkdown?.() }));
        assert.fail(`${label}: not delivered within ${DELIVERY_MS} ms (editor status ${diagnosis.status}; markdown ${JSON.stringify(diagnosis.markdown)})`);
      }
    };
    const saved = (page) => page.waitForFunction(() => state.editor.collaboration.state.status === "saved", undefined, { timeout: DELIVERY_MS });
    const viewerErrors = [], viewerPuts = [];
    const firstContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const secondContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const viewerA = await firstContext.newPage();
      const hostedTransport = await installCollaborationSmokeTransport(viewerA);
      const viewerB = await secondContext.newPage();
      for (const page of [viewerA, viewerB]) {
        page.setDefaultTimeout(DELIVERY_MS + 5000);
        page.on("pageerror", (error) => viewerErrors.push(error.message));
        page.on("request", (request) => { if (request.method() === "PUT") viewerPuts.push(page.url()); });
        await page.goto(`${server.url}/?note=${hostedId}#apiKey=${key}`);
        await page.locator("#note-editor").waitFor({ state: "visible" });
        await saved(page);
        assert.equal(await page.locator("#note-external-state").textContent(), "", "initial hosted hydration must not claim an external update");
        assert.equal(await page.locator("#review-retained-version").isHidden(), true, "the hosted fixture opens without a retained-version notice");
      }
      const hostedMutations = () => hostedTransport.observed.filter((message) => ["edit", "undo", "redo", "title", "resync", "stream.start", "stream.chunk", "stream.finish", "stream.cancel"].includes(message.method)).length;

      // A hash-guarded CLI append reaches both viewers as a positioned source change.
      const opened = await hostedCli("show");
      assert.equal(opened.id, hostedId);
      const cleanMutations = hostedMutations();
      const appended = "Agent appended through the hosted target.";
      await hostedCli("update", ["--if-match", opened.contentHash], opened.content + appended + "\n");
      await delivered(viewerA, "viewer A append", (text) => richEditor.getMarkdown().endsWith(text + "\n"), appended);
      await delivered(viewerB, "viewer B append", (text) => richEditor.getMarkdown().endsWith(text + "\n"), appended);
      for (const page of [viewerA, viewerB]) assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
      const afterAppend = await hostedCli("show");
      assert.equal(await readFile(hostedFile, "utf8"), afterAppend.content, "CLI read and canonical bytes agree after the append");
      assert.ok(afterAppend.content.includes('custom: "retained"'), "the guarded append preserves unrelated user metadata through normalization");
      assert.equal(hostedMutations(), cleanMutations, "clean viewers never re-publish a supported append");
      assert.equal(viewerPuts.length, 0, "hydrating viewers send no legacy PUT autosave");
      const snapshotB = await viewerB.evaluate(() => state.editor.collaboration.snapshot);
      assert.equal(snapshotB.prefix + snapshotB.body, afterAppend.content, "the hydrated snapshot matches the canonical source bytes");
      assert.equal(snapshotB.contentHash, afterAppend.contentHash);
      assert.equal(snapshotB.recovery, undefined, "a hash-guarded append is not classified as a destructive replacement");

      // A managed metadata-only rewrite hydrates without a destructive transition.
      await hostedCli("update", ["--if-match", afterAppend.contentHash], afterAppend.content.replace(/^title:.*$/m, 'title: "Hosted title from the CLI"'));
      for (const page of [viewerA, viewerB]) await delivered(page, "title hydration", (title) => document.querySelector("#note-name").value === title, "Hosted title from the CLI");
      for (const page of [viewerA, viewerB]) {
        assert.ok((await editorMarkdown(page)).endsWith(appended + "\n"), "a supported title change never touches the body");
        assert.equal(await page.locator("#review-retained-version").isHidden(), true, "a supported title change keeps the review notice hidden");
      }
      assert.equal(hostedMutations(), cleanMutations, "a supported metadata update is hydrated, never re-published");
      const beforeTyping = await editorMarkdown(viewerA);
      await appendEditorText(viewerA, " Viewer A keeps editing.");
      await saved(viewerA);
      await undoEditor(viewerA);
      await delivered(viewerA, "viewer A undo", (body) => richEditor.getMarkdown() === body, beforeTyping);

      // A deliberate replacement keeps the retained-version review path.
      const carried = await hostedCli("show");
      await hostedCli("update", ["--if-match", carried.contentHash], carried.content.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)[\s\S]*$/, "$1") + "Replacement from the terminal.\n");
      for (const page of [viewerA, viewerB]) await delivered(page, "replacement hydration", (body) => richEditor.getMarkdown() === body, "Replacement from the terminal.\n");
      for (const page of [viewerA, viewerB]) {
        assert.equal(await page.locator("#note-external-state").innerText(), "Updated elsewhere");
        await page.waitForFunction(() => !document.getElementById("review-retained-version").hidden, undefined, { timeout: DELIVERY_MS });
      }
      const afterReplace = await hostedCli("show");
      assert.equal(await readFile(hostedFile, "utf8"), afterReplace.content, "CLI read and canonical bytes agree after the replacement");

      // Reopen returns exactly the state the CLI already confirmed.
      await viewerB.reload();
      await viewerB.locator("#note-editor").waitFor({ state: "visible" });
      await saved(viewerB);
      const reopened = await hostedCli("show");
      await delivered(viewerB, "reopen hydration", (body) => richEditor.getMarkdown() === body, "Replacement from the terminal.\n");
      const reopenedSnapshot = await viewerB.evaluate(() => state.editor.collaboration.snapshot);
      assert.equal(reopenedSnapshot.prefix + reopenedSnapshot.body, reopened.content, "a reopened viewer hydrates the exact canonical source");
      assert.equal(reopenedSnapshot.contentHash, reopened.contentHash);

      // An acknowledged CLI append whose document event is held cannot duplicate
      // itself, and independent typing before delivery still merges cleanly.
      let heldSnapshot;
      const held = hostedTransport.holdNextEvent(hostedId, (snapshot) => { heldSnapshot = snapshot; return snapshot.body.includes("Appended while the event was held."); });
      const beforeHeld = await hostedCli("show");
      await hostedCli("update", ["--if-match", beforeHeld.contentHash], beforeHeld.content + "Appended while the event was held.\n");
      await held.arrived; // The CLI update already returned; viewer A has not seen its event yet.
      // The earlier deliberate replacement is still under review, so this event
      // may legitimately carry that pending recovery notice; only the append
      // itself must appear as a positioned source operation, never as body loss.
      assert.ok(Array.isArray(heldSnapshot.operation?.splices) && heldSnapshot.operation.splices.some((splice) => splice.insert?.includes("Appended while the event was held.")), "the held document event carries the append as a positioned source operation: " + JSON.stringify(heldSnapshot.operation));
      await delivered(viewerB, "viewer B held append", (text) => richEditor.getMarkdown().endsWith(text + "\n"), "Appended while the event was held.");
      await appendEditorText(viewerA, " My typing during delivery.");
      await saved(viewerA);
      held.release();
      await delivered(viewerA, "viewer A merged delivery", () => richEditor.getMarkdown().includes("Appended while the event was held.") && richEditor.getMarkdown().includes("My typing during delivery."));
      assert.equal(await viewerA.locator("#note-save-error").isVisible(), false, "typing during a held delivery resolves without an error banner");
      const settled = await hostedCli("show");
      assert.equal(settled.content.split("Appended while the event was held.").length - 1, 1, "no re-publication ever duplicated the appended text");
      assert.deepEqual(viewerErrors, [], "hosted verification surfaces no page errors");
      console.log(JSON.stringify({ checks: "two clean hosted viewers hydrate guarded --target-url CLI append/title/replacement without destructive recovery; held-event typing and reopen agree with canonical bytes", deliveryDeadlineMs: DELIVERY_MS }));
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  }
} finally {
  await browser?.close(); await server?.close();
  await rm(root, { recursive: true, force: true });
}
