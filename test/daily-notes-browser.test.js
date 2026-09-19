import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { extractCanonicalLinks, resolveCanonicalLinkTarget, buildCanonicalLinkTargetLookup } from "../dist/core/canonical/links.js";

const script = graphPageHtml("dailytest").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
function extract(name) {
  let start = script.indexOf("function " + name + "(");
  assert.ok(start >= 0, name);
  if (script.slice(start - 6, start) === "async ") start -= 6;
  const body = script.indexOf("{", start);
  let depth = 0;
  for (let end = body; end < script.length; end++) {
    if (script[end] === "{") depth++;
    if (script[end] === "}" && --depth === 0) return script.slice(start, end + 1);
  }
  throw new Error("Unterminated " + name);
}
function runtime(names, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(names.map(extract).join("\n"), context);
  return context;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const id = "mem_a0000000-0000-4000-8000-000000000001";

test("entire inline browser script parses and daily controls are available", () => {
  assert.doesNotThrow(() => new vm.Script(script));
  const html = graphPageHtml("dailytest");
  for (const control of ["home-new", "new-note", "insert-reference", "capture-message", "reference-help"]) assert.match(html, new RegExp('id="' + control + '"'));
});

test("dated capture uses local calendar getters across midnight, not UTC", () => {
  const { datedNoteDraft } = runtime(["datedNoteDraft"]);
  const before = new Date(2026, 8, 19, 23, 59, 59, 999);
  const after = new Date(2026, 8, 20, 0, 0, 0, 1);
  // Trap accidental UTC formatting even on a UTC test host.
  before.toISOString = after.toISOString = () => { throw new Error("must use local date"); };
  assert.equal(datedNoteDraft(before).title, "2026-09-19 23:59:59.999");
  assert.equal(datedNoteDraft(after).title, "2026-09-20 00:00:00.001");
  assert.equal(datedNoteDraft(before).body, "");
  assert.equal(datedNoteDraft(before).type, "note");
});

test("capture coalesces concurrent creates and retries the identical body/key after a lost response", async () => {
  const { createNoteCapture } = runtime(["datedNoteDraft", "isValidMemoryDocumentId", "createNoteCapture"]);
  const requests = [];
  let keys = 0;
  const capture = createNoteCapture({
    now: () => new Date(2026, 8, 19, 12, 0, keys),
    key: () => "attempt-" + ++keys,
    write(draft, key) { const request = { draft, key, ...deferred() }; requests.push(request); return request.promise; },
  });
  const first = capture.create();
  assert.equal(capture.create(), first);
  assert.equal(requests.length, 1);
  requests[0].reject(new Error("response lost"));
  await assert.rejects(first, /response lost/);
  const retry = capture.create();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].key, requests[0].key);
  assert.equal(requests[1].draft, requests[0].draft);
  requests[1].resolve({ id });
  await retry;
  assert.equal((await capture.create()).id, id, "confirmed creation is reused until navigation succeeds");
  assert.equal(requests.length, 2);
  capture.complete();
  const next = capture.create();
  assert.equal(requests[2].key, "attempt-2");
  assert.notEqual(requests[2].draft.title, requests[0].draft.title);
  requests[2].resolve({ id }); await next;
});

test("invalid creation response stays retryable under the original key", async () => {
  const { createNoteCapture } = runtime(["datedNoteDraft", "isValidMemoryDocumentId", "createNoteCapture"]);
  const keys = [];
  let result = { id: "qmd-hit-id" };
  const capture = createNoteCapture({ now: () => new Date(), key: () => "stable", write: async (_, key) => { keys.push(key); return result; } });
  await assert.rejects(capture.create(), /Invalid note creation response/);
  result = { id }; await capture.create();
  assert.deepEqual(keys, ["stable", "stable"]);
});

test("reference range replaces partial/completed brackets without eating surrounding Markdown", () => {
  const { pageReferenceRange } = runtime(["pageReferenceRange"]);
  const cases = [
    ["before [[Pa", 11, 11, 7, 11, "Pa"],
    ["before [[Page]] after", 11, 11, 7, 15, "Pa"],
    ["before [[Page]] after", 13, 13, 7, 15, "Page"],
    ["replace this", 0, 7, 0, 7, "replace"],
    ["before \\[[", 10, 10, 10, 10, ""],
    ["[[old\nnew", 9, 9, 9, 9, ""],
  ];
  for (const [value, start, end, expectedStart, expectedEnd, query] of cases) {
    const range = pageReferenceRange(value, start, end);
    assert.equal(range.start, expectedStart, value);
    assert.equal(range.end, expectedEnd, value);
    assert.equal(range.query, query, value);
    assert.equal(range.value, value);
  }
});

test("reference titles reject syntax/control characters and known ambiguity, not arbitrary HTML", () => {
  const { pageReferenceError } = runtime(["pageReferenceError"]);
  for (const title of [null, "", " spaced ", "Page#heading", "Page|alias", "Page/name", "Page\\name", "Page]]", "Page\nname", "Page\tname", "Page\u0000name"]) {
    assert.match(pageReferenceError({ referenceTitle: title, documentId: id }, []), /safe exact page title/);
  }
  const target = { referenceTitle: "Exact Page Name", documentId: id };
  assert.equal(pageReferenceError(target, [target]), "");
  assert.match(pageReferenceError(target, [target, { referenceTitle: "exact page name", documentId: "another" }]), /share this title/);
  assert.equal(pageReferenceError({ referenceTitle: '<b onclick="alert(1)">Title</b>', documentId: id }, []), "This note has no safe exact page title for [[references]]. Choose another note.", "slash remains unsafe even in HTML-looking titles");
  assert.equal(pageReferenceError({ referenceTitle: '<img onerror="alert(1)">', documentId: id }, []), "", "safe text is inserted as text, never HTML");
});

test("literal title reference extraction is compatible without claiming filename resolution", () => {
  const [link] = extractCanonicalLinks("Body [[Exact Page Name]] tail");
  assert.deepEqual(link, { kind: "wiki-link", target: "Exact Page Name" });
  const lookup = buildCanonicalLinkTargetLookup([{ relativePath: "notes/dated-exact-page-name.md" }]);
  assert.equal(resolveCanonicalLinkTarget("notes/source.md", link.target, link.kind, lookup), undefined);
});

test("creation destination runs after save approval and resumes editor on failure", async () => {
  const { createPageNavigation } = runtime(["createPageNavigation"]);
  let allowed = false, created = 0, resumed = 0;
  const pushed = [];
  const nav = createPageNavigation({
    initial: { index: 0, url: "/" }, beforeLeave: async () => allowed,
    resume: () => resumed++, push: (entry) => pushed.push(entry), show() {}, go() { throw new Error("unexpected history move"); },
  });
  const destination = async () => { created++; throw new Error("POST failed"); };
  assert.equal(await nav.navigate(destination), false);
  assert.equal(created, 0);
  allowed = true;
  await assert.rejects(nav.navigate(destination), /POST failed/);
  assert.equal(created, 1);
  assert.equal(resumed, 2);
  assert.equal(pushed.length, 0);
  assert.equal(await nav.navigate(async () => "/?note=" + id), true);
  assert.equal(pushed.length, 1);
});

test("failed create waits for racing Back restoration before releasing navigation/edit lock", async () => {
  const { createPageNavigation } = runtime(["createPageNavigation"]);
  const post = deferred();
  const moves = [];
  let resumed = 0;
  const nav = createPageNavigation({
    initial: { index: 1, url: "/?note=" + id }, beforeLeave: async () => true,
    resume: () => resumed++, push() {}, show() {}, go: (delta) => moves.push(delta),
  });
  const creating = nav.navigate(() => post.promise);
  const failed = assert.rejects(creating, /POST failed/);
  await tick();
  const back = nav.pop({ index: 0, url: "/" });
  await tick();
  assert.deepEqual(moves, [1]);
  post.reject(new Error("POST failed"));
  await tick();
  assert.equal(resumed, 0, "keep current draft read-only while URL is being restored");
  assert.equal(await nav.navigate("/graph"), false);
  await nav.pop({ index: 1, url: "/?note=" + id });
  await back; await failed;
  assert.equal(resumed, 1);
});

test("no-op input and undo to a confirmed body report Saved without scheduling another write", () => {
  const { createDocumentEditor } = runtime(["createDocumentEditor"]);
  const timers = new Map();
  const editor = createDocumentEditor({
    generation: 1, documentId: id, isCurrent: () => true, onChange() {}, debounceMs: 750,
    splitDocument: (body) => ({ body, frontmatterPrefix: "", newline: "\n", trailingNewline: false }),
    setTimer: (callback) => { timers.set(1, callback); return 1; }, clearTimer: (key) => timers.delete(key),
    writeDocument() { throw new Error("no write expected"); },
  });
  editor.hydrate({ content: "confirmed body", contentHash: "hash" });
  editor.input("confirmed body");
  assert.equal(editor.state.saveStatus, "saved");
  assert.equal(editor.state.dirty, false);
  assert.equal(timers.size, 0);
  editor.input("changed body");
  assert.equal(editor.state.saveStatus, "editing");
  assert.equal(timers.size, 1);
  editor.input("confirmed body");
  assert.equal(editor.state.saveStatus, "saved");
  assert.equal(editor.state.dirty, false);
  assert.equal(timers.size, 0);
});

test("reference insertion rejects changed, closed, and navigation-locked drafts without mutation", () => {
  for (const failure of ["changed", "closed", "locked"]) {
    const editor = { value: failure === "changed" ? "new draft" : "original", readOnly: failure === "locked" };
    const originalController = { state: { loaded: true } };
    const noteSearch = { state: { results: [] } };
    let renders = 0;
    const { insertPageReference } = runtime(["insertPageReference"], {
      $: () => editor, referenceSelection: { value: "original", start: 0, end: 0 },
      state: { editor: failure === "closed" ? null : originalController }, searchDocument: originalController,
      noteSearch, renderNoteSearch: () => renders++, closeSearch() { throw new Error("must not close"); },
    });
    insertPageReference({ documentId: id, referenceTitle: "Page" });
    assert.match(noteSearch.state.feedback, /draft changed/);
    assert.equal(renders, 1);
    assert.equal(editor.value, failure === "changed" ? "new draft" : "original");
  }
});

test("unsupported native insertion leaves the draft intact with manual guidance", () => {
  const editor = { value: "original", readOnly: false, focus() {}, setSelectionRange(start, end) { this.range = [start, end]; } };
  const message = { dataset: {} };
  const controller = { state: { loaded: true } };
  let closed = 0;
  const { insertPageReference } = runtime(["insertPageReference", "pageReferenceError"], {
    $: (id) => id === "note-editor" ? editor : message,
    referenceSelection: { value: "original", start: 0, end: 0 }, searchSelection: { start: 3, end: 3 },
    state: { editor: controller }, searchDocument: controller,
    noteSearch: { state: { results: [] } }, closeSearch: () => closed++, document: { execCommand: () => false },
  });
  insertPageReference({ documentId: id, referenceTitle: "Page" });
  assert.equal(editor.value, "original");
  assert.deepEqual(editor.range, [3, 3]);
  assert.equal(closed, 1);
  assert.match(message.textContent, /Type \[\[Page\]\]/);
  assert.equal(message.hidden, false);
});

test("picker errors survive save freshness updates and clear on query/selection change", async () => {
  const { createNoteSearch } = runtime(["createNoteSearch", "normalizeNoteResults", "isValidMemoryDocumentId"]);
  const search = createNoteSearch({
    setTimer: setTimeout, clearTimer: clearTimeout, abortController: () => new AbortController(), onChange() {},
    fetch: async () => ({ results: [{ provenance: { file: "notes/a.md", metadata: { id, title: "Page" } } }], index: { stale: false } }),
  });
  search.query("Page", true); await tick();
  search.state.feedback = "Several results share this title.";
  search.markStale();
  assert.equal(search.state.feedback, "Several results share this title.");
  search.move(1); assert.equal(search.state.feedback, "");
  search.state.feedback = "Draft changed";
  search.query("Other", true); assert.equal(search.state.feedback, "");
  search.cancel();
});
