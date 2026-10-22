import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createDocumentEditor, splitEditableDocument, composeEditableDocument } from "../dist/adapters/http-server/document-controller.js";

const { outputFiles } = await build({
  entryPoints: [new URL("../src/adapters/http-server/reference-creation.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "node", write: false,
});
const { createReferenceCreation } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const id = "mem_12345678-1234-1234-1234-123456789abc";

async function mergeFixture({ baseline, local, external, title }) {
  const calls = [], writes = [];
  const creation = createReferenceCreation({ getSession: () => "same-note", isEnabled: () => true,
    ensure: async (requested) => { calls.push(requested); return { status: "found", id, created: true }; },
  });
  const editor = createDocumentEditor({
    generation: 1, documentId: id, debounceMs: 750, persistentEditing: true,
    setTimer: () => 1, clearTimer() {}, isCurrent: () => true,
    splitDocument: splitEditableDocument, composeDocument: composeEditableDocument,
    canApplyExternal: () => true, scope: () => "same-brain",
    readDocument: async () => ({ content: external, contentHash: "external", title: "Source" }),
    writeDocument: (_id, content, hash) => new Promise((resolve, reject) => { writes.push({ content, hash, resolve, reject }); }),
    // Match the browser bridge: external acceptance retains existing local
    // intent but never derives new creation intent from external references.
    onExternalUpdate: body => { creation.rebase(editor.state.savedBody, body); },
    onSaved: () => { creation.saved(editor.state.savedBody, editor.state.draft); },
    onChange() {},
  });
  editor.hydrate({ content: baseline, contentHash: "initial", title: "Source" });
  editor.input(local);
  creation.completed([title], local);
  await creation.saved(editor.state.savedBody, editor.state.draft);
  assert.deepEqual(calls, []);
  const rejected = editor.startSave();
  writes[0].reject({ status: 412 });
  assert.equal(await rejected, false);
  const mergedSave = editor.startSave();
  // mergeLatest awaits a read; let it reach the second pending source PUT.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2);
  assert.equal(writes[1].hash, "external");
  return { creation, editor, calls, writes, mergedSave };
}

test("412 rebase retains locally completed reference until merged source save, while external references remain inert", async () => {
  const h = await mergeFixture({
    baseline: "First\n\nLocal\n\nLast",
    local: "First\n\nLocal [[Local target]]\n\nLast",
    external: "External [[External only]]\n\nLocal\n\nLast",
    title: "Local target",
  });
  assert.match(h.writes[1].content, /External \[\[External only\]\]/);
  assert.match(h.writes[1].content, /Local \[\[Local target\]\]/);
  assert.deepEqual(h.calls, [], "source merge has not yet been saved");
  assert.equal(h.creation.hasPending(), true);
  h.writes[1].resolve({ newContentHash: "merged" });
  assert.equal(await h.mergedSave, true);
  await h.creation.settle();
  assert.deepEqual(h.calls, ["Local target"]);
  assert.equal(h.creation.hasPending(), false);
});

test("an external same-title occurrence cannot confirm an unsaved local occurrence during 412 rebase", async () => {
  const h = await mergeFixture({
    baseline: "First\n\n[[Same]]\n\nLocal\n\nLast",
    local: "First\n\n[[Same]]\n\nLocal [[Same]]\n\nLast",
    external: "First [[Same]]\n\n[[Same]]\n\nLocal\n\nLast",
    title: "Same",
  });
  assert.deepEqual(h.calls, [], "external same-title addition is not confirmation of the newly entered local occurrence");
  h.writes[1].resolve({ newContentHash: "merged" });
  assert.equal(await h.mergedSave, true);
  await h.creation.settle();
  assert.deepEqual(h.calls, ["Same"]);
});

test("removing an old same-title occurrence externally preserves the newly entered local reference through rebase", async () => {
  const h = await mergeFixture({
    baseline: "First\n\n[[Same]]\n\nLocal\n\nLast",
    local: "First\n\n[[Same]]\n\nLocal [[Same]]\n\nLast",
    external: "First\n\nRemoved\n\nLocal\n\nLast",
    title: "Same",
  });
  assert.deepEqual(h.calls, []);
  assert.equal(h.creation.hasPending(), true, "the merged draft retains the locally entered occurrence");
  h.writes[1].resolve({ newContentHash: "merged" });
  assert.equal(await h.mergedSave, true);
  await h.creation.settle();
  assert.deepEqual(h.calls, ["Same"]);
});
