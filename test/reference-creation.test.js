import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: [new URL("../src/adapters/http-server/reference-creation.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "node", write: false,
});
const { createReferenceCreation, completedReferenceTitles } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const id = "mem_12345678-1234-1234-1234-123456789abc";
const active = (source, title) => { const start = source.indexOf(`[[${title}]]`); return [{ start, end: start + title.length + 4, title }]; };
test("completion detection requires an edit within active reference text", () => {
  const after = "Before [[New title]] after";
  assert.deepEqual(completedReferenceTitles("Before [[New title] after", after, active(after, "New title")), ["New title"]);
  assert.deepEqual(completedReferenceTitles("Before [[Old title]] after", after, active(after, "New title")), ["New title"]);
  assert.deepEqual(completedReferenceTitles("Before [[New title]] after", after, active(after, "New title")), []);
  assert.deepEqual(completedReferenceTitles("Before [[New title]] after", "X" + after, active("X" + after, "New title")), []);
  assert.deepEqual(completedReferenceTitles("`code\n[[New title]]", "code\n[[New title]]", active("code\n[[New title]]", "New title")), []);
  assert.deepEqual(completedReferenceTitles("Before [[New title] after", after, []), []);
  assert.deepEqual(completedReferenceTitles("`[[Old]]`", "[[Old]]", active("[[Old]]", "Old")), []);
  assert.deepEqual(completedReferenceTitles("```\n[[Old]]\n```", "[[Old]]", active("[[Old]]", "Old")), []);
  const deleted = "[[Title]]";
  assert.deepEqual(completedReferenceTitles("[[Titles]]", deleted, active(deleted, "Title")), ["Title"]);
});
function setup(overrides = {}) {
  const calls = [], changes = [], created = [];
  let session = "document-a", enabled = true;
  const controller = createReferenceCreation({ getSession: () => session, isEnabled: () => enabled,
    ensure: async (title) => { calls.push(title); return { status: "found", id, created: true }; },
    onChange: (state) => changes.push(structuredClone(state)), onCreated: (result, title) => created.push(title), ...overrides });
  return { controller, calls, changes, created, session: (value) => { session = value; }, enabled: (value) => { enabled = value; } };
}
test("only newly queued references confirmed in the saved and current source create pages", async () => {
  const { controller, calls, created } = setup();
  await controller.saved("[[Old unresolved]]");
  assert.deepEqual(calls, []);
  controller.completed(["New", "New", "bad/title"]);
  assert.equal(controller.hasPending(), true);
  assert.deepEqual(calls, []);
  assert.equal(await controller.saved("[[Old unresolved]]", "[[Old unresolved]]\n[[New]]"), false);
  assert.deepEqual(calls, []);
  assert.equal(await controller.saved("[[New]]", "[[New]] and later edits"), false);
  assert.deepEqual(calls, []);
  assert.equal(await controller.saved("[[New]] and later edits"), true);
  assert.deepEqual(calls, ["New"]);
  assert.deepEqual(created, ["New"]);
  assert.equal(controller.hasPending(), false);
  await controller.saved("[[New]]");
  assert.deepEqual(calls, ["New"]);
});
test("continued typing defers target creation until the complete current source is confirmed", async () => {
  const { controller, calls } = setup();
  controller.completed(["First"], "[[First]]");
  assert.equal(await controller.saved("[[First]]", "[[First]] and unsaved text"), false);
  assert.equal(await controller.settle(), false);
  assert.deepEqual(calls, []);
  controller.completed(["Second"], "[[First]] and [[Second]]");
  assert.equal(await controller.saved("[[First]] and unsaved text", "[[First]] and [[Second]]"), false);
  assert.equal(controller.hasPending(), true);
  assert.deepEqual(calls, []);
  assert.equal(await controller.saved("[[First]] and [[Second]]"), true);
  assert.deepEqual(calls, ["First", "Second"]);
  assert.equal(controller.hasPending(), false);
});
test("source save failure, removed references, code and escaped refs cannot authorize creation", async () => {
  const { controller, calls } = setup();
  controller.completed(["Removed", "Code", "Escaped"]);
  assert.equal(await controller.settle(), false);
  assert.equal(await controller.saved("[[Removed]]\n`[[Code]]`\n\\[[Escaped]]", "`[[Code]]`\n\\[[Escaped]]"), true);
  assert.deepEqual(calls, []);
});
test("a pre-existing unresolved occurrence cannot authorize an unsaved new occurrence with the same title", async () => {
  const { controller, calls } = setup();
  controller.completed(["Same"], "[[Same]] and [[Same]]");
  assert.equal(await controller.saved("[[Same]]", "[[Same]] and [[Same]]"), false);
  assert.deepEqual(calls, []);
  assert.equal(await controller.saved("[[Same]] and [[Same]]"), true);
  assert.deepEqual(calls, ["Same"]);
});
test("concurrent saved notifications coalesce; uncertain responses require explicit retry", async () => {
  let finish, attempts = 0;
  const { controller } = setup({ ensure: async () => { attempts++; if (attempts === 1) return new Promise((_, reject) => { finish = reject; }); return { status: "found", id, created: false }; } });
  controller.completed(["Title"]);
  const first = controller.saved("[[Title]]"), second = controller.saved("[[Title]]");
  assert.equal(attempts, 1);
  finish(new Error("response lost after publication"));
  assert.equal(await first, false); assert.equal(await second, false);
  assert.equal(controller.state.errors.length, 1);
  assert.equal(await controller.saved("[[Title]]"), false);
  assert.equal(await controller.settle(), false);
  assert.equal(attempts, 1);
  assert.equal(await controller.retry(), true);
  assert.equal(attempts, 2); assert.equal(controller.hasPending(), false);
});
test("ambiguous/unopenable results remain visible, and reuse never reports a new page", async () => {
  for (const status of ["ambiguous", "unopenable", "missing"]) {
    const { controller, created } = setup({ ensure: async () => ({ status }) });
    controller.completed(["Title"]);
    assert.equal(await controller.saved("[[Title]]"), false);
    assert.equal(controller.state.errors.length, 1); assert.deepEqual(created, []);
  }
  const { controller, created } = setup({ ensure: async () => ({ status: "found", id, created: false }) });
  controller.completed(["Title"]); await controller.saved("[[Title]]");
  assert.deepEqual(created, []);
});
test("session reset aborts/fences late responses and new sessions start empty", async () => {
  let finish, signal;
  const fixture = setup({ ensure: (_title, abort) => { signal = abort; return new Promise((resolve) => { finish = resolve; }); } });
  fixture.controller.completed(["Old"]);
  const pending = fixture.controller.saved("[[Old]]");
  fixture.session("document-b"); fixture.controller.reset();
  assert.equal(signal.aborted, true);
  finish({ status: "found", id, created: true });
  assert.equal(await pending, false); assert.deepEqual(fixture.created, []);
  assert.equal(fixture.controller.hasPending(), false);
  assert.equal(await fixture.controller.saved("[[Old]]"), true);
});
test("read-only sessions cannot queue or start requests", async () => {
  const { controller, calls, enabled } = setup();
  enabled(false); controller.completed(["Title"]);
  await controller.saved("[[Title]]");
  assert.deepEqual(calls, []); assert.equal(controller.hasPending(), false);
});
test("malformed successful target identities retain explicit recovery state", async () => {
  const { controller, created } = setup({ ensure: async () => ({ status: "found", id: "invalid-id", created: true }) });
  controller.completed(["Title"]);
  assert.equal(await controller.saved("[[Title]]"), false);
  assert.equal(controller.state.errors.length, 1);
  assert.deepEqual(created, []);
});
