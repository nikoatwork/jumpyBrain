import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

const script = graphPageHtml("testnonce").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
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
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const docA = "mem_a0000000-0000-4000-8000-000000000001";
const docB = "mem_b0000000-0000-4000-8000-000000000001";
function hit(id = docA, title = "Alpha", file = "notes/alpha.md") {
  return { id: "qmd-hit", snippet: "Body-only search phrase.", provenance: { file, metadata: { id, title } } };
}
function searchHarness() {
  const timers = new Map();
  const requests = [];
  let nextTimer = 0;
  const { createNoteSearch } = runtime(["isValidMemoryDocumentId", "normalizeNoteResults", "createNoteSearch"]);
  const search = createNoteSearch({
    setTimer: (run, delay) => { assert.equal(delay, 180); timers.set(++nextTimer, run); return nextTimer; },
    clearTimer: (id) => timers.delete(id),
    abortController: () => new AbortController(),
    fetch: (query, signal) => { const request = { query, signal, ...deferred() }; requests.push(request); return request.promise; },
    onChange: () => {},
  });
  return { search, timers, requests, run() { for (const [id, run] of timers) { timers.delete(id); run(); } } };
}

test("note view uses white borderless proportional editing with an accessible name field", () => {
  const html = graphPageHtml("testnonce");
  assert.match(html, /body\[data-view="note"\] \{ background: #fff;/);
  const editorStyle = html.match(/#note-editor \{[^}]+\}/)[0];
  assert.match(editorStyle, /background: #fff/);
  assert.match(editorStyle, /border: 0/);
  assert.match(editorStyle, /ui-sans-serif/);
  assert.doesNotMatch(editorStyle, /monospace/);
  assert.match(html, /#note-editor:focus[^}]+outline: none/);
  assert.match(html, /id="note-name" aria-label="Page name" aria-describedby="note-save-error"/);
});

test("note result identity uses canonical metadata IDs, deduplicates hits, and retains unavailable rows", () => {
  const { normalizeNoteResults } = runtime(["isValidMemoryDocumentId", "normalizeNoteResults"]);
  const results = normalizeNoteResults([
    hit(), hit(docA, "duplicate"), hit(undefined, "ID-less"),
    hit("qmd-not-a-document", "Missing", "sessions/no-id.md"),
    hit(docB, '<img src=x onerror="alert(1)">', "pages/beta.md"),
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].documentId, docA);
  assert.equal(results[1].documentId, docB);
  assert.equal(results[2].documentId, null);
  const crowded = normalizeNoteResults([...Array.from({ length: 12 }, (_, n) => hit("bad-id", "Missing", "notes/legacy-" + n)), hit(docB)]);
  assert.equal(crowded[0].documentId, docB, "unavailable rows must not crowd out usable notes");
  assert.equal(normalizeNoteResults(null).length, 0);
});

test("search debounces bursts, cancels requests, and ignores late query/closed-dialog responses", async () => {
  const { search, requests, run, timers } = searchHarness();
  search.query("a"); search.query("al"); search.query("alpha");
  assert.equal(timers.size, 1);
  run();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].query, "alpha");
  search.query("beta");
  assert.equal(requests[0].signal.aborted, true);
  run();
  requests[1].resolve({ results: [hit(docB, "Beta")], index: { stale: true } });
  await tick();
  assert.equal(search.state.results[0].documentId, docB);
  assert.equal(search.state.stale, true);
  requests[0].resolve({ results: [hit()] });
  await tick();
  assert.equal(search.state.results[0].documentId, docB);
  search.query("closed"); run(); search.cancel();
  assert.equal(requests[2].signal.aborted, true);
  requests[2].resolve({ results: [hit()] }); await tick();
  assert.equal(search.state.results.length, 0);
  search.query("   ");
  assert.equal(search.state.status, "idle");
  assert.equal(timers.size, 0);
  assert.equal(requests.length, 3);
});

test("search handles empty, missing-ID, auth, index/server, rate-limit, and network states", async () => {
  const { search, requests, run } = searchHarness();
  search.query("none"); run(); requests.at(-1).resolve({ results: [], index: { stale: false } }); await tick();
  assert.match(search.state.message, /No notes found/);
  assert.equal(search.state.selected, -1);
  search.query("missing"); run(); requests.at(-1).resolve({ results: [hit("bad-id")] }); await tick();
  assert.equal(search.state.selected, -1);
  assert.match(search.state.message, /need memory IDs/);
  search.move(1);
  assert.equal(search.state.selected, -1);
  for (const status of [401, 403, 500, 429, undefined]) {
    search.query("failure", true);
    requests.at(-1).reject(Object.assign(new Error("private server detail"), { status })); await tick();
    assert.equal(search.state.status, status === 401 || status === 403 ? "auth" : "error");
    assert.doesNotMatch(search.state.message, /private server detail/);
    if (status === 500) assert.match(search.state.message, /index/);
  }
  search.query("retry", true);
  requests.at(-1).resolve({ results: [hit(), hit("bad", "Unavailable", "notes/no-id.md"), hit(docB)] }); await tick();
  assert.equal(search.state.status, "ready");
  assert.equal(search.state.selected, 0);
  search.move(1); assert.equal(search.state.selected, 1);
  search.move(1); assert.equal(search.state.selected, 0);
  search.move(-1); assert.equal(search.state.selected, 1);
});

test("local saves keep search stale across older clean responses until a later fresh query", async () => {
  const { search, requests, run } = searchHarness();
  search.query("during save"); run();
  search.markStale();
  requests[0].resolve({ results: [], index: { stale: false } }); await tick();
  assert.equal(search.state.stale, true, "pre-save response cannot clear local write freshness");
  search.query("after save");
  assert.equal(search.state.stale, true);
  run(); requests[1].resolve({ results: [], index: { stale: false } }); await tick();
  assert.equal(search.state.stale, false, "a later query can confirm a refreshed index");
  search.markStale();
  assert.equal(search.state.stale, true, "a PUT completing after search updates the visible palette");
});

test("dialog Tab wrapping excludes hidden/disabled controls and stays inside both directions", () => {
  const document = { activeElement: null };
  const control = (disabled = false, visible = true) => ({ disabled, tabIndex: 0, getClientRects: () => visible ? [1] : [], focus() { document.activeElement = this; } });
  const first = control(), last = control(), hidden = control(false, false), disabled = control(true);
  const { wrapDialogFocus } = runtime(["wrapDialogFocus"], { document });
  const event = { key: "Tab", currentTarget: { querySelectorAll: () => [first, hidden, disabled, last] }, preventDefault() { this.prevented = true; } };
  document.activeElement = last;
  wrapDialogFocus(event);
  assert.equal(document.activeElement, first);
  assert.equal(event.prevented, true);
  wrapDialogFocus({ ...event, shiftKey: true });
  assert.equal(document.activeElement, last);
});

test("result rendering uses text nodes for untrusted titles, excerpts, and paths", () => {
  function element() {
    return { children: [], attrs: {}, hidden: false, textContent: "", append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; }, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }, addEventListener() {}, scrollIntoView() {}, set innerHTML(_) { throw new Error("untrusted HTML insertion"); } };
  }
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const { renderNoteSearch } = runtime(["renderNoteSearch"], { $, document: { createElement: element }, chooseSearchResult() {}, searchMode: "navigate" });
  const malicious = '<script>alert("x")</script>';
  const search = { results: [{ documentId: docA, title: malicious, snippet: malicious, file: malicious }], selected: 0, status: "ready", message: "ready", stale: true };
  renderNoteSearch(search);
  const row = $("search-results").children[0];
  assert.deepEqual(row.children.map((child) => child.textContent), [malicious, malicious, malicious]);
  assert.equal(row.attrs["aria-selected"], "true");
  assert.equal($("search-freshness").hidden, false);
  search.stale = false;
  renderNoteSearch(search);
  assert.equal($("search-results").children[0], row, "freshness updates must preserve the mouse/touch target");
  search.selected = -1;
  renderNoteSearch(search);
  assert.equal($("search-results").children[0], row, "selection updates must not replace result rows either");
  assert.equal(row.attrs["aria-selected"], "false");
  search.results = [{ documentId: docB, title: "Beta", snippet: "new", file: "notes/beta.md" }];
  renderNoteSearch(search);
  assert.notEqual($("search-results").children[0], row, "a new query's results should replace old rows");
});

test("choosing a result navigates to its detail URL and explains save-guard rejection", async () => {
  const pending = deferred();
  const message = { textContent: "" };
  const calls = [];
  let closes = 0;
  const context = runtime(["chooseSearchResult"], {
    selectingResult: false,
    searchMode: "navigate",
    $: () => message,
    shellUrl: () => "/?note=" + docA,
    closeSearch: () => closes++,
    noteSearch: { cancel() {} },
    state: { editor: { state: { saveStatus: "failed" } } },
    navigation: { navigate(url) { calls.push(url); return pending.promise; } },
  });
  const opening = context.chooseSearchResult({ documentId: docB });
  assert.deepEqual(calls, ["/?note=" + docB]);
  assert.equal(closes, 0, "keep search visible until navigation has been approved");
  assert.equal(message.textContent, "Opening note…");
  await context.chooseSearchResult({ documentId: docB });
  assert.equal(calls.length, 1, "double-click must not request a second navigation");
  pending.resolve(false);
  await opening;
  assert.match(message.textContent, /Save failed.*retry saving/);
  assert.equal(context.selectingResult, false);
  assert.equal(closes, 0);
  await context.chooseSearchResult({ documentId: docA });
  assert.equal(closes, 1, "choosing the current note just dismisses search");
  await context.chooseSearchResult({ documentId: null });
  assert.equal(calls.length, 1);
  context.navigation.navigate = async (url) => { calls.push(url); return true; };
  await context.chooseSearchResult({ documentId: docB });
  assert.equal(calls.length, 2, "selection can be retried after a rejected navigation");
  assert.equal(context.selectingResult, false);
});

function navigationHarness(beforeLeave = async () => true) {
  const { createPageNavigation } = runtime(["createPageNavigation"]);
  const entries = [{ index: 0, url: "/" }];
  let position = 0;
  let shown = "/";
  let checks = 0;
  const go = [];
  const nav = createPageNavigation({
    initial: entries[0],
    beforeLeave: () => { checks++; return beforeLeave(); },
    push(entry) { entries.splice(position + 1); entries.push(entry); position++; },
    go(delta) { assert.notEqual(delta, 0, "history.go(0) would reload"); go.push(delta); },
    show(url) { shown = url; },
  });
  async function event(delta) {
    position += delta;
    assert.ok(entries[position], "valid history destination");
    // Browser dispatch does not wait for an async listener.
    nav.pop(entries[position]);
    await tick();
  }
  async function drain() { for (let n = 0; go.length && n < 20; n++) await event(go.shift()); assert.equal(go.length, 0, "no history loop"); }
  return { nav, entries, go, event, drain, get url() { return entries[position].url; }, get shown() { return shown; }, get checks() { return checks; } };
}

test("page navigation preserves Back/Forward entries, including a failed-save traversal", async () => {
  let allowed = true;
  const h = navigationHarness(async () => allowed);
  assert.equal(await h.nav.navigate("/?note=" + docA), true);
  assert.equal(await h.nav.navigate("/?note=" + docB), true);
  await h.event(-1); await h.drain();
  assert.equal(h.shown, "/?note=" + docA);
  assert.equal(h.url, h.shown);
  await h.event(1); await h.drain();
  assert.equal(h.shown, "/?note=" + docB);
  allowed = false;
  await h.event(-1); await h.drain();
  assert.equal(h.url, "/?note=" + docB);
  assert.equal(h.shown, h.url);
  assert.equal(h.entries[1].url, "/?note=" + docA, "failed Back must not replace the target entry");
  allowed = true;
  await h.event(-2); await h.drain();
  assert.equal(h.url, "/");
  assert.equal(h.shown, "/");
});

test("overlapping navigation is blocked while a save is pending", async () => {
  let save = null;
  const h = navigationHarness(() => save ? save.promise : Promise.resolve(true));
  await h.nav.navigate("/?note=" + docA);
  save = deferred();
  const navigating = h.nav.navigate("/graph");
  assert.equal(await h.nav.navigate("/"), false);
  assert.equal(h.url, "/?note=" + docA);
  await h.event(-1); await h.drain();
  assert.equal(h.url, "/?note=" + docA, "Back during save restores current URL");
  save.resolve(true);
  assert.equal(await navigating, true);
  assert.equal(h.url, "/graph");
  assert.equal(h.shown, h.url);
});

test("failed in-app navigation also waits for an overlapping history restoration", async () => {
  let save = null;
  const h = navigationHarness(() => save ? save.promise : Promise.resolve(true));
  await h.nav.navigate("/?note=" + docA);
  save = deferred();
  const navigation = h.nav.navigate("/graph");
  await h.event(-1);
  save.resolve(false);
  await h.drain();
  assert.equal(await navigation, false);
  assert.equal(h.url, "/?note=" + docA);
  assert.equal(h.shown, h.url);
});

test("late document GETs cannot overwrite a new full-page selection", async () => {
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, { hidden: true, value: "", textContent: "", dataset: {}, focus() {} }); return elements.get(id); };
  const reads = [];
  const state = { noteToken: 0, editor: null };
  const context = runtime(["showNote", "isValidMemoryDocumentId", "noteLoadError"], {
    $, state, document: { title: "" }, window: { setTimeout, clearTimeout },
    splitEditableDocument() {}, composeEditableDocument() {}, writeGraphDocument() {}, syncEditorUi() {}, autoSizeNoteEditor() {},
    searchDialog: { open: false }, connectionDialog: { open: false },
    readGraphDocument(id) { const read = { id, ...deferred() }; reads.push(read); return read.promise; },
    createDocumentEditor() { return { state: {}, cancel() {}, hydrate(payload) { $("note-editor").value = payload.content; }, setEditing() {} }; },
  });
  const first = context.showNote(docA);
  const second = context.showNote(docB);
  reads[1].resolve({ title: "Beta", content: "body B", contentHash: "b" }); await second;
  reads[0].resolve({ title: "Alpha", content: "body A", contentHash: "a" }); await first;
  assert.equal($("note-title").textContent, "Beta");
  assert.equal($("note-editor").value, "body B");
  assert.equal(context.document.title, "Beta · jumpyBrain");
});
