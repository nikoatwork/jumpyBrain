// Production source binding: real contenteditable, real WS backend, disposable root.
import assert from "node:assert/strict";
import {runIntentProof,runRestartIntentProof} from "./collaboration-intent-proof.mjs";
import {runActorChurnProof} from "./collaboration-actor-churn-proof.mjs";
import { runStructuralCursorProof, runLiveCursorProof } from "./collaboration-cursor-proof.mjs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createServer } from "node:http";
import { build } from "esbuild";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { selectEditorText, appendEditorText, editorMarkdown, editorEnd, undoEditor } from "./editor-smoke-helpers.mjs";
import { observeContract } from "./contract-observations.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-production-editor-"));
const id = "mem_91111111-1111-4111-8111-111111111111", token = "disposable-production-editor-key";
const original = ["# Live source", "", "Keep **bold** and [[Reference]].  ", "", "- [ ] Task", "", "```js", "console.log('retained');", "```", "", "| A | B |", "| --- | --- |", "| x | y |", "", "Last paragraph", ""].join("\n");
const prefix = `---\nid: ${id}\ntype: note\ntitle: Live source\ncustom: retained\n---\n`;
let browser, sourceServer, server, agent;
async function agentConnection(url) {
  const socket = new WebSocket(url.replace(/^http/, "ws") + "/ws"), pending = new Map();
  socket.on("message", (data) => { const message = JSON.parse(data.toString()); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.ok ? request.resolve(message.result) : request.reject(new Error(JSON.stringify(message.error))); });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = crypto.randomUUID(); pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params: { clientId: "streaming-agent", actorKind: "agent", ...params } })); });
  await rpc("hello", { token, protocol: 2 }); return { rpc, close: () => socket.close() };
}
try {
  await mkdir(path.join(root, "notes")); await writeFile(path.join(root, "notes/live.md"), prefix + original);
  const bundle = await build({ stdin: { contents: `export {createNoteEditor} from './src/adapters/http-server/lexical-editor.ts';export {createCollaborationEditor} from './src/adapters/http-server/collaboration-editor.ts';export {sourceDifferences as fixtureSplices} from './src/core/collaboration/source.ts';`, resolveDir: process.cwd(), sourcefile: "production-collaboration-smoke.ts" }, bundle: true, write: false, platform: "browser", format: "iife", globalName: "ProductionCollaboration", define: { "process.env.NODE_ENV": '"production"' } });
  // Fixture producers declare their canonical operation sequences explicitly;
  // repeated-text intent is separately tested from actual keyboard ranges.
  // Isolated editor validation runs without a shared dist rebuild.
  sourceServer = createServer((request, response) => { response.setHeader("content-type", "text/html"); response.end(`<div id="note-panel"><div id="note-editor"></div></div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`); });
  await new Promise((resolve) => sourceServer.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${sourceServer.address().port}`;
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const isolated = await browser.newPage(); const errors = [];
  isolated.on("pageerror", (error) => errors.push(error.message));
  await isolated.goto(base);
  await isolated.evaluate((body) => { window.changes = []; window.richEditor = ProductionCollaboration.createNoteEditor(document.querySelector("#note-editor"), { onChange: (body) => changes.push(body), onError(error) { throw error; } }); richEditor.setMarkdown(""); const result = richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}); if (result.status !== "applied") throw new Error(JSON.stringify(result)); }, original);
  await selectEditorText(isolated, 2, 2);
  await isolated.evaluate(() => { window.keep = document.querySelector("#note-editor").children[2]; });
  const changed = original.replace("Last paragraph", "Last remote paragraph");
  { const result = await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}), changed); assert.equal(result.status, "applied", result.reason); }
  assert.equal(await editorMarkdown(isolated), changed);
  assert.equal(await isolated.evaluate(() => keep === document.querySelector("#note-editor").children[2]), true, "untouched DOM block survives remote edit");
  assert.equal(await isolated.evaluate(() => changes.length), 0, "remote edits do not echo as human input");
  await isolated.evaluate(() => { window.boldLeaf = document.querySelector("#note-editor .editor-bold"); });
  const inline = changed.replace("Keep **bold**", "Keep `inserted` **bold**");
  { const result = await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}), inline); assert.equal(result.status, "applied", result.reason); }
  assert.equal(await isolated.evaluate(() => boldLeaf === document.querySelector("#note-editor .editor-bold")), true, "unaffected formatted leaf survives a sibling insertion");
  assert.equal(await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}).status, changed), "applied");
  const structural = changed.replace("# Live source", "## Live source\nNew paragraph").replace("- [ ] Task", "- [x] Task\n- [ ] Next").replace("| x | y |", "| streamed | y |");
  assert.equal(await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}).status, structural), "applied");
  assert.equal(await editorMarkdown(isolated), structural);
  assert.equal(await isolated.locator("#note-editor h2").textContent(), "Live source");
  assert.equal(await isolated.locator("#note-editor [data-task-checked]").count() > 0 || await isolated.locator("#note-editor").innerText().then((text) => text.includes("Task")), true);
  const joined = structural.replace("New paragraph\n", "").replace("- [x] Task\n- [ ] Next", "Task joined");
  assert.equal(await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}).status, joined), "applied");
  assert.equal(await editorMarkdown(isolated), joined);
  const crlf = original.replace(/\n/g, "\r\n");
  { const result = await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}), crlf); assert.equal(result.status, "applied", result.reason); }
  assert.equal(await editorMarkdown(isolated), crlf);
  assert.equal(await isolated.locator("#note-editor h1").innerText(), "Live source");
  assert.deepEqual(await isolated.evaluate(() => richEditor.collaborativeSelection()), { anchor: 4, focus: 4 }, "plain heading projection counts its exact source prefix");
  await selectEditorText(isolated, "Live source".length + "Keep ".length + 1);
  assert.deepEqual(await isolated.evaluate(() => richEditor.collaborativeSelection()), { anchor: crlf.indexOf("bold") + 1, focus: crlf.indexOf("bold") + 1 }, "formatted source uses exact delimiter-aware coordinates");
  await isolated.locator("#note-editor pre[data-language]").evaluate((element) => {
    element.closest('[contenteditable]').focus(); const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), text = walker.nextNode(); const range = document.createRange(); range.setStart(text, 5); range.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await isolated.evaluate(() => new Promise(requestAnimationFrame));
  assert.deepEqual(await isolated.evaluate(() => richEditor.collaborativeSelection()), { anchor: crlf.indexOf("console.log") + 5, focus: crlf.indexOf("console.log") + 5 }, "code source projection accounts for CRLF and its fence");
  observeContract('source-selection',await isolated.evaluate(()=>richEditor.collaborativeSelection()));
  { const result = await isolated.evaluate((body) => richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}), "Added paragraph\n" + original); assert.equal(result.status, "applied", result.reason); }
  assert.equal(await isolated.evaluate(() => getSelection().anchorOffset), 5, "newline-style changes retain an unchanged code leaf caret");
  assert.equal(await isolated.evaluate(() => Boolean(getSelection().anchorNode.parentElement.closest('pre'))), true);
  const repeated = "First paragraph.\n\nAgent will revise this.\n\n" + Array.from({length:35}, (_, i) => `Unchanged paragraph ${i}.`).join("\n\n") + "\n";
  await isolated.evaluate((body) => richEditor.setMarkdown(body), repeated);
  await appendEditorText(isolated, "Temporary sidebar draft.");
  await isolated.evaluate(() => richEditor.applyCollaborativeMarkdown(richEditor.getMarkdown()));
  await isolated.evaluate(() => { const button = document.createElement("button"); button.id = "outside"; button.textContent = "Outside"; document.body.append(button); });
  await isolated.locator("#outside").click();
  await isolated.evaluate((body) => { richEditor.setCollaborativeHistory({ undo() { const result = richEditor.applyCollaborativeMarkdown(body,{operationSequence:[ProductionCollaboration.fixtureSplices(richEditor.getMarkdown(),body)]}); if (result.status === "recovery") throw new Error(result.reason); } }); }, repeated);
  await undoEditor(isolated);
  await isolated.waitForFunction((body) => richEditor.getMarkdown() === body, repeated);
  assert.equal(await editorMarkdown(isolated), repeated, "removing a final local paragraph preserves its trailing newline");
  assert.deepEqual(errors, []);
  await runStructuralCursorProof(isolated);
  await isolated.close();
  if (process.env.JUMPYBRAIN_EDITOR_ISOLATED_ONLY === "1") { console.log("Production editor reconciliation smoke passed (isolated structural subset)."); }
  else {
    const { startJumpyBrainHttpServer } = await import("../dist/server/index.js");
    server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: 0, autoIndex: false });
    // Serve the isolated bundle through the real backend origin so its strict
    // browser Origin rule is exercised without a test-only auth bypass.
    await sourceServer.close(); sourceServer = undefined;
    const contexts = [await browser.newContext({ bypassCSP: true }), await browser.newContext({ bypassCSP: true })];
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const heldTransport = await installCollaborationSmokeTransport(pages[0]);
    for (const [index, page] of pages.entries()) {
      page.setDefaultTimeout(10_000);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.url + "/health");
      await page.setContent(`<div id="note-panel"><div id="note-editor"></div></div>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(({ url, token, id, index }) => {
        window.states = []; window.richEditor = ProductionCollaboration.createNoteEditor(document.querySelector("#note-editor"), { onChange(body) { live.input(body); }, onError(error) { throw error; } });
        richEditor.setMarkdown("");
        window.live = ProductionCollaboration.createCollaborationEditor({ url: url.replace(/^http/, "ws") + "/ws", token, scope: "production-smoke", documentId: id, editor: richEditor, clientId: `human-${index}`, onState(state) { states.push(state); } }); live.connect();
      }, { url: server.url, token, id, index });
      await page.waitForFunction(() => live.state.status === "saved");
    }
    assert.equal(await editorMarkdown(pages[0]), original);
    const heldUndoAcknowledgement = heldTransport.holdNextReply("edit");
    await appendEditorText(pages[0], " pending-undo");
    await heldUndoAcknowledgement.arrived;
    await undoEditor(pages[0]);
    heldUndoAcknowledgement.release();
    await pages[0].waitForFunction((body) => richEditor.getMarkdown() === body && live.state.status === "saved", original);
    await pages[1].waitForFunction((body) => richEditor.getMarkdown() === body, original);
    await undoEditor(pages[0]);
    await pages[0].waitForFunction(() => live.state.status === "saved");
    assert.equal(await editorMarkdown(pages[0]), original, "Undo of a sent edit consumes its actor history instead of recording a redo-like inverse edit");

    await selectEditorText(pages[0], 2);
    await pages[1].waitForFunction(() => live.snapshot.presence.some((peer) => peer.anchor === 4 && peer.focus === 4));
    assert.ok(await pages[1].locator('[data-collaboration-actor]').count() > 0, "scoped source caret reaches another context");
    await selectEditorText(pages[0], "Live source".length + "Keep ".length + 1);
    await pages[1].waitForFunction(() => document.querySelectorAll('[data-collaboration-actor]').length > 0);

    await appendEditorText(pages[0], "Human zero");
    await pages[0].waitForFunction(() => live.state.status === "saved" && richEditor.getMarkdown().includes("Human zero"));
    await pages[1].waitForFunction(() => richEditor.getMarkdown().includes("Human zero"));
    observeContract('own-edit', {body:await editorMarkdown(pages[0]),operations:heldTransport.observed.filter(frame=>frame.method==='edit').at(-1).params.operations,status:await pages[0].evaluate(()=>live.state.status)});
    assert.ok((await editorMarkdown(pages[0])).startsWith(original), "append retains all initial source " + await editorMarkdown(pages[0]));
    // Different human edits survive concurrent source operations.
    await Promise.all(pages.map((page, index) => appendEditorText(page, ` concurrent-${index}`)));
    await Promise.all(pages.map((page) => page.waitForFunction(() => live.state.status === "saved")));
    const converged = await editorMarkdown(pages[0]);
    await pages[1].waitForFunction((body) => richEditor.getMarkdown() === body, converged);
    assert.ok(converged.includes("concurrent-0") && converged.includes("concurrent-1"));
    // An authoritative saved event settles actor undo/barriers even if its
    // separate RPC reply is delayed. Other actors' text remains intact.
    const heldHistoryReply = heldTransport.holdNextReply("undo", { rpcOnly: true });
    await undoEditor(pages[0]);
    await heldHistoryReply.arrived;
    assert.equal(await pages[0].evaluate(() => live.flush()), true, "confirmed history event settles the publication barrier");
    heldHistoryReply.release();
    await pages[0].waitForFunction(() => live.state.status === "saved");
    await pages[1].waitForFunction(() => !richEditor.getMarkdown().includes("concurrent-0"));
    assert.ok((await editorMarkdown(pages[1])).includes("concurrent-1"));
    observeContract('own-undo-preserves-peer', {body:await editorMarkdown(pages[1]),status:await pages[0].evaluate(()=>live.state.status),dirty:await pages[0].evaluate(()=>live.state.dirty)});
    await pages[0].evaluate(() => live.redo());
    await pages[1].waitForFunction(() => richEditor.getMarkdown().includes("concurrent-0") && richEditor.getMarkdown().includes("concurrent-1"));
    await undoEditor(pages[0]);
    await pages[1].waitForFunction(() => !richEditor.getMarkdown().includes("concurrent-0"));

    // Canonical title normalization must acknowledge our own submitted intent,
    // while empty names remain editable local drafts until replaced.
    const beforeTitleBody = await editorMarkdown(pages[0]);
    assert.equal(await pages[0].evaluate(() => live.setTitle("  Normalized live title  ")), true);
    await pages[1].waitForFunction(() => live.snapshot.title === "Normalized live title");
    assert.equal(await pages[0].evaluate(() => live.title), "Normalized live title");
    assert.equal(await pages[0].evaluate(() => live.setTitle("")), false);
    assert.equal(await pages[0].evaluate(() => live.state.status), "saving");
    assert.equal(await pages[0].evaluate(() => live.state.canWrite), true);
    assert.equal(await pages[0].evaluate(() => live.title), "", "blank title input is retained for replacement");
    assert.equal(await pages[0].evaluate(() => live.snapshot.title), "Normalized live title", "blank input preserves the canonical title");
    assert.equal(await editorMarkdown(pages[0]), beforeTitleBody, "blank input preserves the body");
    await pages[0].evaluate(() => live.inputTitle("Recovered valid title"));
    assert.equal(await pages[0].evaluate(() => live.flush()), true);
    assert.equal(await pages[0].evaluate(() => live.snapshot.title), "Recovered valid title");
    assert.equal(await editorMarkdown(pages[0]), beforeTitleBody);
    // Real filesystem writes reconcile into both clients without body PUTs.
    const canonical = await readFile(path.join(root, "notes/live.md"), "utf8");
    await writeFile(path.join(root, "notes/live.md"), canonical.replace("Last paragraph", "External writer paragraph"));
    await Promise.all(pages.map((page) => page.waitForFunction(() => richEditor.getMarkdown().includes("External writer paragraph"), null, { timeout: 15_000 })));
    // Agent generation is visible chunk by chunk, including structural syntax.
    agent = await agentConnection(server.url);
    let agentSnapshot = await agent.rpc("open", { documentId: id });
    const streamId = crypto.randomUUID();
    await agent.rpc("stream.start", { documentId: id, epoch: agentSnapshot.epoch, baseRevision: agentSnapshot.revision, streamId, start: agentSnapshot.body.length });
    const chunks = ["\n\nAgent **streaming", "** 🐐\n- [ ] live task", "\n```js\nlet value = 1;\n```\n"];
    for (const [sequence, insert] of chunks.entries()) {
      agentSnapshot = await agent.rpc("stream.chunk", { documentId: id, epoch: agentSnapshot.epoch, streamId, sequence, insert });
      await Promise.all(pages.map((page) => page.waitForFunction((body) => richEditor.getMarkdown() === body, agentSnapshot.body)));
    }
    await agent.rpc("stream.cancel", { documentId: id, epoch: agentSnapshot.epoch, streamId });
    // Browser composition remains local until committed; remote source is then
    // reconciled without replacing the composing contenteditable subtree.
    await editorEnd(pages[0]);
    await pages[0].locator("#note-editor").dispatchEvent("compositionstart", { data: "" });
    await pages[0].keyboard.insertText("日本語");
    const composing = await pages[0].evaluate(() => richEditor.isComposing());
    const imeStream = crypto.randomUUID();
    agentSnapshot = await agent.rpc("open", { documentId: id });
    await agent.rpc("stream.start", { documentId: id, epoch: agentSnapshot.epoch, baseRevision: agentSnapshot.revision, streamId: imeStream, start: 0 });
    agentSnapshot = await agent.rpc("stream.chunk", { documentId: id, epoch: agentSnapshot.epoch, streamId: imeStream, sequence: 0, insert: "IME remote prefix\n" });
    await pages[0].locator("#note-editor").dispatchEvent("compositionend", { data: "日本語" });
    await pages[0].waitForFunction(() => richEditor.getMarkdown().includes("日本語") && richEditor.getMarkdown().startsWith("IME remote prefix") && live.state.status === "saved");
    const imeBody = await editorMarkdown(pages[0]);
    await pages[1].waitForFunction((body) => richEditor.getMarkdown() === body, imeBody);
    assert.ok(composing, "the smoke exercised active Lexical composition");
    await agent.rpc("stream.cancel", { documentId: id, epoch: agentSnapshot.epoch, streamId: imeStream });
    agent.close(); agent = undefined;
    // A real backend restart leaves a durable draft. A reloaded client needs
    // explicit recovery after the document epoch changed, then publishes once.
    const port = new URL(server.url).port, serverUrl = server.url;
    await server.close(); server = undefined;
    await pages[0].waitForFunction(() => live.state.status === "offline");
    await appendEditorText(pages[0], " offline recoverable");
    await pages[0].evaluate(() => live.inputTitle("Offline recovered title"));
    assert.equal(await pages[0].evaluate(() => live.flush()), false);
    assert.equal(await pages[0].evaluate(() => live.state.durableDraft), true);
    const offlineBody = await editorMarkdown(pages[0]);
    await pages[0].evaluate(() => { live.dispose(); richEditor.destroy(); });
    server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: Number(port), autoIndex: false });
    await pages[0].goto(serverUrl + "/health");
    await pages[0].setContent(`<div id="note-panel"><div id="note-editor"></div></div>`);
    await pages[0].addScriptTag({ content: bundle.outputFiles[0].text });
    await pages[0].evaluate(({ url, token, id }) => {
      window.richEditor = ProductionCollaboration.createNoteEditor(document.querySelector("#note-editor"), { onChange(body) { live.input(body); }, onError(error) { throw error; } }); richEditor.setMarkdown("");
      window.live = ProductionCollaboration.createCollaborationEditor({ url: url.replace(/^http/, "ws") + "/ws", token, scope: "production-smoke", documentId: id, editor: richEditor, clientId: "human-0" }); live.connect();
    }, { url: server.url, token, id });
    await pages[0].waitForFunction(() => live.state.status === "conflict");
    assert.equal(await editorMarkdown(pages[0]), offlineBody);
    assert.equal(await pages[0].evaluate(() => live.title), "Offline recovered title");
    assert.equal(await pages[0].evaluate(() => live.resolveConflict("draft")), true);
    assert.equal(await pages[0].evaluate(() => live.flush()), true);
    assert.ok((await readFile(path.join(root, "notes/live.md"), "utf8")).includes("offline recoverable"));
    assert.equal(await pages[0].evaluate(() => live.snapshot.title), "Offline recovered title");
    assert.deepEqual(errors, []);
    for (const context of contexts) await context.close();
    await runLiveCursorProof({browser,serverUrl:server.url,token,root,bundle:bundle.outputFiles[0].text,errors});
    await runIntentProof({browser,serverUrl:server.url,token,root,bundle:bundle.outputFiles[0].text,errors});
    await runIntentProof({browser,serverUrl:server.url,token,root,bundle:bundle.outputFiles[0].text,errors,shipped:true});
    // The shipped shell must use the same live path without legacy PUT autosave.
    const shellContexts = [await browser.newContext(), await browser.newContext()];
    const shellPages = await Promise.all(shellContexts.map((context) => context.newPage()));
    const puts = [];
    for (const page of shellPages) {
      page.setDefaultTimeout(15_000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => { if (request.method() === "PUT" && request.url().includes("/document")) puts.push(request.url()); });
      await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);
      await page.locator("#note-editor").waitFor({ state: "visible" });
      await page.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
    }
    assert.equal(await shellPages[0].locator("#note-name").inputValue(), "Offline recovered title");
    await appendEditorText(shellPages[0], " shell human");
    await shellPages[0].waitForFunction(() => state.editor.collaboration.state.status === "saved" && richEditor.getMarkdown().includes("shell human"));
    await shellPages[1].waitForFunction(() => richEditor.getMarkdown().includes("shell human"));
    await shellPages[0].locator("#note-name").fill("  Shell live title  ");
    await shellPages[0].locator("#note-name").blur();
    await shellPages[1].waitForFunction(() => document.querySelector("#note-name").value === "Shell live title");
    assert.equal(puts.length, 0, "the shipped shell sends no stale body PUT autosave");
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      for (const width of [1280, 390]) {
        await shellPages[0].setViewportSize({ width, height: 900 });
        await shellPages[0].screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `production-collaboration-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    for (const context of shellContexts) await context.close();
    // Duplicate Tab / window.open copies sessionStorage. Actor and draft
    // ownership must remain distinct, and reload recovery must be explicit.
    const cloneContext = await browser.newContext();
    const opener = await cloneContext.newPage(); opener.setDefaultTimeout(15_000);
    opener.on("pageerror", (error) => errors.push(error.message));
    await opener.goto(`${server.url}/?note=${id}#apiKey=${token}`);
    await opener.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
    const openerId = await opener.evaluate(() => { sessionStorage.setItem("cloned-session-marker", "copied"); return state.editor.collaboration.clientId; });
    const popupPromise = cloneContext.waitForEvent("page");
    await opener.evaluate((id) => { window.open("/?note=" + id, "_blank"); }, id);
    const popup = await popupPromise; popup.setDefaultTimeout(15_000);
    popup.on("pageerror", (error) => errors.push(error.message));
    await popup.waitForFunction(() => state.editor?.collaboration?.state.status === "saved");
    assert.equal(await popup.evaluate(() => sessionStorage.getItem("cloned-session-marker")), "copied", "the test really copied sessionStorage");
    const popupId = await popup.evaluate(() => state.editor.collaboration.clientId);
    assert.notEqual(popupId, openerId, "a cloned browser tab gets an independent actor and private draft key");
    await appendEditorText(opener, " clone-parent");
    await opener.waitForFunction(() => state.editor.collaboration.state.status === "saved" && richEditor.getMarkdown().includes("clone-parent"));
    await popup.waitForFunction(() => richEditor.getMarkdown().includes("clone-parent"));
    await appendEditorText(popup, " clone-child");
    await popup.waitForFunction(() => state.editor.collaboration.state.status === "saved" && richEditor.getMarkdown().includes("clone-child"));
    await opener.waitForFunction(() => richEditor.getMarkdown().includes("clone-child"));
    await undoEditor(opener);
    await popup.waitForFunction(() => !richEditor.getMarkdown().includes("clone-parent") && richEditor.getMarkdown().includes("clone-child"));
    const clonePort = Number(new URL(server.url).port);
    await server.close(); server = undefined;
    await popup.waitForFunction(() => state.editor.collaboration.state.status === "offline");
    await appendEditorText(popup, " private reload draft");
    await popup.evaluate(() => state.editor.inputTitle("Older offline B title"));
    assert.equal(await popup.evaluate(() => state.editor.collaboration.state.durableDraft), true);
    server = await startJumpyBrainHttpServer({ root, apiKeys: [token], port: clonePort, autoIndex: false });
    await popup.reload();
    await popup.waitForFunction(() => state.editor?.collaboration?.state.status === "saved" && state.editor.collaboration.state.recoveryDrafts.length > 0);
    assert.notEqual(await popup.evaluate(() => state.editor.collaboration.clientId), popupId, "a new page does not adopt another page identity");
    assert.equal((await editorMarkdown(popup)).includes("private reload draft"), false, "reload never silently publishes or adopts an older tab draft");
    assert.equal((await readFile(path.join(root, "notes/live.md"), "utf8")).includes("private reload draft"), false);
    await server.close(); server = undefined;
    await popup.waitForFunction(() => state.editor.collaboration.state.status === "offline");
    await appendEditorText(popup, " unique current A body");
    await popup.evaluate(() => state.editor.inputTitle("Unique current A title"));
    const currentA = await editorMarkdown(popup);
    await popup.locator("#note-recover").click();
    await popup.waitForFunction(() => document.getElementById("recovery-message").textContent.includes("Could not load saved changes"));
    await popup.evaluate(() => {
      window.originalDraftSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (String(key).startsWith("jumpybrain.collaboration.draft.v2:")) throw new DOMException("Fixture quota", "QuotaExceededError"); return originalDraftSetItem.call(this, key, value); };
    });
    if (!await popup.locator("#recovery-options").evaluate(element => element.open)) await popup.locator("#recovery-options > summary").click();
    await popup.locator("#recovery-versions").selectOption("0");
    assert.equal(await editorMarkdown(popup), currentA, "storage failure leaves the current unique draft visible");
    assert.ok((await popup.locator("#recovery-draft").inputValue()).startsWith("Unique current A title\n\n"));
    assert.equal(await popup.locator("#recovery-versions").inputValue(), "", "failed selection keeps the current dialog version");
    assert.equal(await popup.locator("#recovery-message").innerText(), "Keep this window open and copy your draft before reloading.");
    await popup.evaluate(() => { Storage.prototype.setItem = originalDraftSetItem; });
    await popup.locator("#recovery-versions").selectOption("0");
    assert.ok((await popup.locator("#recovery-draft").inputValue()).includes("private reload draft"), "the recoverable private draft is offered through the actual shell selector");
    assert.equal(await popup.evaluate(() => state.editor.collaboration.title), "Older offline B title");
    const archivedAIndex = await popup.evaluate((body) => state.editor.collaboration.state.recoveryDrafts.findIndex((record) => record.body === body && record.title === "Unique current A title"), currentA);
    assert.ok(archivedAIndex >= 0, "adopting B durably preserves unique A as a recoverable version");
    assert.equal((await readFile(path.join(root, "notes/live.md"), "utf8")).includes("private reload draft"), false, "selecting a recovery version does not publish it");
    await popup.locator("#recovery-close").click(); await popup.locator("#note-recover").click();
    if (!await popup.locator("#recovery-options").evaluate(element => element.open)) await popup.locator("#recovery-options > summary").click();
    await popup.locator("#recovery-versions").selectOption(String(archivedAIndex));
    assert.equal(await editorMarkdown(popup), currentA, "the preserved A version remains selectable in the actual recovery UI");
    assert.equal(await popup.evaluate(() => state.editor.collaboration.title), "Unique current A title");
    assert.equal((await readFile(path.join(root, "notes/live.md"), "utf8")).includes("unique current A body"), false, "private recovery does not silently publish either version");
    await cloneContext.close();
    await runRestartIntentProof({browser,root,token,errors,startServer:port=>startJumpyBrainHttpServer({root,apiKeys:[token],port,autoIndex:false})});
    await runActorChurnProof({browser,errors});
    assert.deepEqual(errors, []);
    console.log("Production collaboration editor smoke passed: two contexts, source convergence, actor undo, canonical external writes, agent streams, IME, offline body/title reload recovery, shipped notes shell, cloned-tab actor isolation and explicit recovery selector, title normalization and draft-version preservation, granular edits and visible revisioned cursors, actual positional intent and authoritative selection history, bounded default CLI actor churn.");
  }
} finally {
  agent?.close(); await browser?.close(); await server?.close(); if (sourceServer) await new Promise((resolve) => sourceServer.close(resolve)); await rm(root, { recursive: true, force: true });
}
