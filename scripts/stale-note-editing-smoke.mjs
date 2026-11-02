// Existing-note input after idle/reconnect, using the shipped shell and real WS.
// Build first. All canonical files and browser storage are disposable.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applySourceSplices } from "../dist/core/collaboration/source.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { selectEditorText, editorMarkdown, editorSelection, undoEditor } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-stale-note-"));
const token = "disposable-stale-note-key";
const cases = [
  { name: "backspace", body: "Alpha same 🐐\n\nBeta same\n", start: 10, operation: { start: 9, deleteCount: 1, insert: "" }, key: "Backspace", expected: "Alpha sam 🐐\n\nBeta same\n" },
  { name: "delete", body: "Alpha same 🐐\n\nBeta same\n", start: 9, operation: { start: 9, deleteCount: 1, insert: "" }, key: "Delete", expected: "Alpha sam 🐐\n\nBeta same\n" },
  { name: "selected", body: "Alpha same 🐐\n\nBeta same\n", start: 6, end: 10, operation: { start: 6, deleteCount: 4, insert: "" }, key: "Backspace", expected: "Alpha  🐐\n\nBeta same\n" },
  { name: "cross-paragraph", body: "Alpha same\n\n\nBeta same\n\nTail", start: 6, end: 14, operation: { start: 6, deleteCount: 11, insert: "" }, key: "Backspace", expected: "Alpha  same\n\nTail" },
  { name: "empty-block", body: "Alpha same\n\n\nBeta same\n\nTail", emptyBlock: 2, operation: { start: 11, deleteCount: 1, insert: "" }, key: "Backspace", expected: "Alpha same\n\nBeta same\n\nTail" },
];
let server, browser;
const errors = [];
async function start(port = 0) {
  return startJumpyBrainHttpServer({ root, apiKeys: [token], port, autoIndex: false });
}
async function saved(page) {
  await page.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
}
async function exact(page, file, expected) {
  await saved(page);
  assert.equal(await editorMarkdown(page), expected);
  const snapshot = await page.evaluate(() => state.editor.collaboration.snapshot);
  assert.equal(snapshot.body, expected);
  assert.equal(await readFile(file, "utf8"), snapshot.prefix + expected, "canonical bytes equal the acknowledged source exactly");
  return snapshot;
}
try {
  await mkdir(path.join(root, "notes"));
  server = await start();
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  let sequence = 0;
  for (const scenario of ["idle", "reconnect", "restart", "external"]) {
    for (const fixture of cases) {
      const id = `mem_92222222-2222-4222-8222-${String(++sequence).padStart(12, "0")}`;
      const file = path.join(root, `notes/case-${sequence}.md`);
      const prefix = `---\nid: ${id}\ntype: note\ntitle: Disposable idle note\ncustom: preserved\n---\n`;
      await writeFile(file, prefix + fixture.body);
      const page = await browser.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", error => errors.push(error.message));
      const transport = await installCollaborationSmokeTransport(page);
      try {
        await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);
        await exact(page, file, fixture.body);
        if (fixture.emptyBlock !== undefined) {
          await page.locator("#note-editor").evaluate((element, index) => {
            element.focus();
            const range = document.createRange(); range.selectNodeContents(element.children[index]); range.collapse(true);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          }, fixture.emptyBlock);
          await page.evaluate(() => new Promise(requestAnimationFrame));
        } else await selectEditorText(page, fixture.start, fixture.end ?? fixture.start);
        const selection = await editorSelection(page);
        const before = await page.evaluate(() => state.editor.collaboration.snapshot);
        const quietSince = Date.now();
        let suffix = "";
        if (scenario === "idle") {
          // One real 35-second input idle exceeds the 30-second lease interval; the
          // remaining inputs wait through several unchanged observation cycles.
          await page.waitForTimeout(sequence === 1 ? 35_000 : 2_100);
        } else if (scenario === "reconnect") {
          const opened = transport.observed.filter(frame => frame.method === "open").length;
          transport.disconnect();
          await page.waitForFunction(() => ["offline", "connecting"].includes(state.editor.collaboration.state.status));
          await saved(page);
          assert.ok(transport.observed.filter(frame => frame.method === "open").length > opened);
        } else if (scenario === "restart") {
          const port = Number(new URL(server.url).port);
          await server.close(); server = undefined;
          await page.waitForFunction(() => ["offline", "connecting"].includes(state.editor.collaboration.state.status));
          server = await start(port);
          await saved(page);
          assert.notEqual(await page.evaluate(() => state.editor.collaboration.snapshot.epoch), before.epoch);
        } else {
          suffix = "\nUnique external tail";
          await writeFile(file, prefix + fixture.body + suffix);
          await page.waitForFunction(expected => richEditor.getMarkdown() === expected, fixture.body + suffix);
          await saved(page);
        }
        const current = await page.evaluate(() => state.editor.collaboration.snapshot);
        assert.equal(current.body, fixture.body + suffix);
        if (scenario !== "restart") assert.equal(current.epoch, before.epoch);
        if (scenario === "idle" || scenario === "reconnect") assert.equal(current.revision, before.revision);
        assert.deepEqual(await editorSelection(page), selection, "unchanged source coordinates retain the real DOM selection");
        const idleMs = Date.now() - quietSince;
        await page.keyboard.press(fixture.key);
        await page.evaluate(() => state.editor.flush());
        const result = await page.evaluate(() => state.editor.collaboration.state);
        assert.notEqual(result.status, "conflict", `${scenario}/${fixture.name}: ${result.message}`);
        const accepted = await exact(page, file, fixture.expected + suffix);
        assert.equal(accepted.revision, current.revision + 1, "one input publishes one exact operation");
        const edits = transport.observed.filter(frame => frame.method === "edit");
        assert.equal(edits.length, 1, "one input sends one operation batch");
        assert.deepEqual(edits[0].params.operations, [fixture.operation], "the selected occurrence owns the exact source interval");
        assert.equal(applySourceSplices(current.body, edits[0].params.operations), fixture.expected + suffix);
        await undoEditor(page);
        await exact(page, file, fixture.body + suffix);
        const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
        await page.keyboard.press(`${modifier}+Shift+z`);
        await exact(page, file, fixture.expected + suffix);
        await page.reload(); await exact(page, file, fixture.expected + suffix);
        console.log(JSON.stringify({ scenario, input: fixture.name, idleMs, before: { epoch: before.epoch, revision: before.revision }, edited: { epoch: accepted.epoch, revision: accepted.revision }, selection, operations: edits[0].params.operations }));
      } finally { await page.close(); }
    }
  }
  // A real overlapping raw write while an input request is held must retain
  // the private draft; further typing must preserve the first recovery reason.
  {
    const id = "mem_92222222-2222-4222-8222-000000000021";
    const file = path.join(root, "notes/overlap.md");
    const prefix = `---\nid: ${id}\ntype: note\ntitle: Disposable overlap\n---\n`;
    const body = "Alpha same\n\nTail", draft = "Alpha \n\nTail", canonical = "Alpha saved\n\nTail";
    await writeFile(file, prefix + body);
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", error => errors.push(error.message));
    const transport = await installCollaborationSmokeTransport(page);
    let held, external;
    try {
      await page.goto(`${server.url}/?note=${id}#apiKey=${token}`); await saved(page);
      await selectEditorText(page, 6, 10);
      held = transport.holdNextRequest("edit");
      await page.keyboard.press("Backspace"); await held.arrived;
      external = transport.holdNextEvent(id, snapshot => snapshot.body === canonical);
      await writeFile(file, prefix + canonical);
      // Prove the observer admitted the raw source before sending the old
      // positional request; own-flight snapshots are intentionally queued.
      await external.arrived; external.release(); held.release();
      await page.waitForFunction(() => state.editor.collaboration.state.status === "conflict");
      const first = await page.evaluate(() => state.editor.collaboration.state.message);
      assert.ok(first);
      assert.equal(await editorMarkdown(page), draft);
      assert.equal(await readFile(file, "utf8"), prefix + canonical);
      await selectEditorText(page, 0);
      await page.keyboard.insertText("Retained ");
      assert.equal(await page.evaluate(() => state.editor.flush()), false);
      assert.equal(await editorMarkdown(page), "Retained " + draft);
      assert.equal(await page.evaluate(() => state.editor.collaboration.state.message), first);
      assert.equal(await page.evaluate(() => state.editor.collaboration.state.durableDraft), true);
      assert.equal(await readFile(file, "utf8"), prefix + canonical);
      assert.equal(transport.observed.filter(frame => frame.method === "edit").length, 1, "conflicted typing sends no guessed replacement");
      console.log("Overlapping external change: exact canonical bytes, durable private draft and first recovery reason retained.");
    } finally { external?.release(); held?.release(); await page.close(); }
  }
  assert.deepEqual(errors, []);
  console.log("Stale-note editing smoke passed: idle, reconnect, restart and external change; exact persistence/reload and selective Undo.");
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
