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

test("connection reflects confirmed auth, ignores old credentials, and preserves auth on application errors", async () => {
  const requests = [];
  const context = runtime(["graphFetch"], {
    activeApiKey: "saved-key", credentialRevision: 0, connectionStatus: "checking",
    apiKeyInput: { value: "unsaved-dialog-edit" },
    renderConnection: () => {},
    fetch: (url, options) => { const request = { options, ...deferred() }; requests.push(request); return request.promise; },
  });
  const send = async (status) => {
    const pending = context.graphFetch("/memories/all/recent");
    requests.at(-1).resolve({ status, ok: status === 200 });
    await pending;
  };
  await send(200);
  assert.equal(context.connectionStatus, "connected");
  assert.equal(requests[0].options.headers.Authorization, "Bearer saved-key");
  await send(409);
  assert.equal(context.connectionStatus, "connected", "save errors must not imply an auth failure");
  await send(500);
  assert.equal(context.connectionStatus, "connected");
  await send(401);
  assert.equal(context.connectionStatus, "disconnected");
  await send(200);
  await send(403);
  assert.equal(context.connectionStatus, "disconnected");
  const stale = context.graphFetch("/memories/all/recent");
  context.activeApiKey = "";
  context.credentialRevision++;
  requests.at(-1).resolve({ status: 200, ok: true });
  await stale;
  assert.equal(context.connectionStatus, "disconnected", "late responses cannot reconnect a cleared key");
  const offline = context.graphFetch("/memories/all/recent");
  requests.at(-1).reject(new Error("offline"));
  await assert.rejects(offline);
  assert.equal(context.connectionStatus, "unavailable");
});

test("connection settings mask keys, discard canceled edits, and remove persisted credentials", () => {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, { dataset: {}, setAttribute(name, value) { this[name] = value; } });
    return elements.get(id);
  };
  const removed = [];
  const context = runtime(["renderConnection", "maskApiKey", "closeConnection", "setConnectionKey"], {
    $, cancelReferenceInteraction() {}, activeApiKey: "saved-key", credentialRevision: 0, connectionStatus: "connected",
    apiKeyInput: { value: "unsaved-edit", type: "text" },
    connectionDialog: { close() {} }, localStorage: { removeItem: (key) => removed.push(key) },
  });
  context.renderConnection();
  assert.equal($("open-connection").textContent, "Connected");
  assert.equal($("disconnect").hidden, false);
  context.closeConnection();
  assert.equal(context.apiKeyInput.value, "saved-key");
  assert.equal(context.apiKeyInput.type, "password");
  assert.equal($("toggle-api-key")["aria-pressed"], "false");
  context.setConnectionKey("");
  assert.equal(context.activeApiKey, "");
  assert.equal(context.apiKeyInput.value, "");
  assert.equal(context.credentialRevision, 1);
  assert.equal($("open-connection").textContent, "Connect");
  assert.equal($("disconnect").hidden, true);
  assert.deepEqual(removed, ["jumpybrain.graph.apiKey"]);
  context.localStorage.removeItem = () => { throw new Error("storage blocked"); };
  assert.doesNotThrow(() => context.setConnectionKey(""));
});

test("recent notes cancel stale loads and recover from auth, network, and malformed responses", async () => {
  const requests = [], changes = [];
  const { createRecentNotes } = runtime(["isValidMemoryDocumentId", "createRecentNotes"]);
  const recent = createRecentNotes({
    abortController: () => new AbortController(),
    fetch: (signal) => { const request = { signal, ...deferred() }; requests.push(request); return request.promise; },
    onChange: (value) => changes.push(value),
  });
  recent.load(); recent.load();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ notes: [{ id: docB, title: "Latest" }, { id: "invalid" }] }); await tick();
  assert.equal(changes.at(-1).notes.length, 1);
  assert.equal(changes.at(-1).notes[0].id, docB);
  requests[0].resolve({ notes: [{ id: docA }] }); await tick();
  assert.equal(changes.at(-1).notes[0].id, docB);
  recent.load(); requests[2].reject({ status: 401 }); await tick();
  assert.equal(changes.at(-1).status, "auth");
  recent.load(); requests[3].reject(new Error("offline")); await tick();
  assert.equal(changes.at(-1).status, "error");
  recent.load(); requests[4].resolve({}); await tick();
  assert.equal(changes.at(-1).status, "error");
  recent.load(); requests[5].resolve({ notes: [] }); await tick();
  assert.equal(changes.at(-1).status, "ready");
  assert.equal(changes.at(-1).notes.length, 0);
  recent.load(); recent.cancel();
  const count = changes.length;
  requests[6].resolve({ notes: [{ id: docA }] }); await tick();
  assert.equal(changes.length, count);
});

test("home puts a prominent capture action before secondary search", () => {
  const html = graphPageHtml("testnonce");
  assert.ok(html.indexOf('id="home-new"') < html.indexOf('id="home-search"'));
  assert.match(html, /id="home-new" class="home-action" aria-label="New note"/);
  assert.match(html, /#home-new \{ background: var\(--control-fill\);[^}]+color: var\(--ink\)/);
  assert.match(html, /#home-search \{[^}]+background: transparent/);
  assert.match(html, /class="new-shortcut" aria-hidden="true"/);
  assert.match(html, /setAttribute\("aria-keyshortcuts"/);
});

test("note view uses white borderless proportional editing with an accessible name field", () => {
  const html = graphPageHtml("testnonce");
  assert.match(html, /--surface: #ffffff;/);
  const editorStyle = html.match(/#note-editor \{[^}]+\}/)[0];
  assert.match(editorStyle, /background: var\(--surface\)/);
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
  const richEditor = { markdown: "", setMarkdown(value) { this.markdown = value; }, getMarkdown() { return this.markdown; }, focus() {} };
  const context = runtime(["showNote", "isValidMemoryDocumentId", "noteLoadError"], {
    $, state, richEditor, document: { title: "" }, window: { setTimeout, clearTimeout },
    stagedReferenceNote: null, credentialRevision: 0, cancelReferenceInteraction() {},
    splitEditableDocument() {}, composeEditableDocument() {}, writeGraphDocument() {}, syncEditorUi() {},
    searchDialog: { open: false }, connectionDialog: { open: false }, dreamDialog: { open: false },
    readGraphDocument(id) { const read = { id, ...deferred() }; reads.push(read); return read.promise; },
    createDocumentEditor() { return { state: {}, cancel() {}, hydrate(payload) { richEditor.setMarkdown(payload.content); }, setEditing() {} }; },
  });
  const first = context.showNote(docA);
  const second = context.showNote(docB);
  reads[1].resolve({ title: "Beta", content: "body B", contentHash: "b" }); await second;
  reads[0].resolve({ title: "Alpha", content: "body A", contentHash: "a" }); await first;
  assert.equal($("note-title").textContent, "Beta");
  assert.equal(richEditor.getMarkdown(), "body B");
  assert.equal(context.document.title, "Beta · jumpyBrain");
});


// Exercise the real save guard, navigation lock, and editor; only browser/transport
// boundaries are fake. Deferred I/O and inert timers make every race explicit.
function referenceHarness({ dirty = true } = {}) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "", textContent: "", dataset: {}, open: false,
      focus() {}, select() {}, setAttribute() {},
      showModal() { this.open = true; }, close() { this.open = false; },
    });
    return elements.get(id);
  };
  const writes = [], resolves = [], reads = [], pushes = [], shows = [];
  const timers = new Map();
  let timer = 0, dismissed = 0;
  const window = {
    setTimeout(run) { timers.set(++timer, run); return timer; },
    clearTimeout(id) { timers.delete(id); },
  };
  const richEditor = {
    markdown: "", setMarkdown(value) { this.markdown = value; },
    getMarkdown() { return this.markdown; }, focus() {}, captureSelection() { return {}; },
  };
  const state = { noteToken: 1, editor: null };
  const context = runtime([
    "activatePageReference", "cancelReferenceInteraction", "referenceMessage",
    "createPageNavigation", "requestEditorNavigation", "createDocumentEditor",
    "splitEditableDocument", "composeEditableDocument", "withEditableTitle",
    "isValidMemoryDocumentId", "showNote", "noteLoadError", "setConnectionKey",
    "closeConnection", "maskApiKey", "renderConnection", "openConnection", "openSearch",
  ], {
    $, state, window, richEditor, AbortController, document: { title: "", activeElement: null },
    credentialRevision: 0, referenceRequest: null, stagedReferenceNote: null,
    activeApiKey: "old-key", connectionStatus: "connected", apiKeyInput: $("api-key"),
    localStorage: { setItem() {}, removeItem() {} }, reopenSearch: false,
    searchMode: "navigate", referenceSelection: null, searchOrigin: null,
    searchDocument: null, searchSelection: null,
    searchDialog: $("note-search"), connectionDialog: $("connection"), dreamDialog: $("dream"),
    noteSearch: { markStale() {}, query() {} },
    referenceAutocomplete: { dismiss() { dismissed++; }, markStale() {} },
    syncEditorUi(editorState) { richEditor.setMarkdown(editorState.draft); },
    graphJson(url, options) {
      const request = { url, options, ...deferred() }; resolves.push(request); return request.promise;
    },
    readGraphDocument(id, options) {
      const request = { id, options, ...deferred() }; reads.push(request); return request.promise;
    },
    writeGraphDocument(id, content, hash) {
      const request = { id, content, hash, ...deferred() }; writes.push(request); return request.promise;
    },
  });
  const origin = context.createDocumentEditor({
    generation: 1, documentId: docA, debounceMs: 750,
    setTimer: window.setTimeout, clearTimer: window.clearTimeout,
    splitDocument: context.splitEditableDocument, composeDocument: context.composeEditableDocument,
    readDocument: context.readGraphDocument, writeDocument: context.writeGraphDocument,
    isCurrent: () => state.editor === origin,
    onChange: context.syncEditorUi,
  });
  state.editor = origin;
  origin.hydrate({ content: "Original body", contentHash: "original-hash", title: "Alpha" });
  origin.setEditing(true);
  if (dirty) origin.input("Current unsaved draft");
  context.navigation = context.createPageNavigation({
    initial: { url: "/?note=" + docA, index: 0 },
    beforeLeave: () => context.requestEditorNavigation(() => {}),
    resume: () => state.editor?.setNavigationPending(false),
    push(entry) { pushes.push(entry); },
    show(url) { shows.push(context.showNote(new URL(url, "http://test").searchParams.get("note"))); },
    go() { assert.fail("unexpected history traversal"); },
  });
  return {
    context, $, state, origin, writes, resolves, reads, pushes, shows, richEditor,
    get dismissed() { return dismissed; },
    activate(title = "Beta") { return context.activatePageReference(title); },
    async saved() { writes.at(-1).resolve({ newContentHash: "saved-hash" }); await tick(); },
    async found() { resolves.at(-1).resolve({ status: "found", id: docB }); await tick(); },
    payload: { content: "Confirmed target body", contentHash: "target-hash", title: "Beta", frontmatter: { id: docB } },
  };
}

function assertRetained(h, draft = "Current unsaved draft") {
  assert.equal(h.state.editor, h.origin);
  assert.equal(h.origin.state.draft, draft);
  assert.equal(h.richEditor.getMarkdown(), draft);
  assert.equal(h.origin.state.cancelled, false);
  assert.equal(h.origin.state.navigationPending, false, "failed/canceled navigation restores editing");
  assert.equal(h.pushes.length, 0);
  assert.equal(h.context.stagedReferenceNote, null);
  assert.equal(h.context.referenceRequest, null);
}

test("page references save first, resolve freshly, preflight, and consume the staged payload without a second GET", async () => {
  const h = referenceHarness();
  const opening = h.activate("  Ｂeta  ");
  assert.equal(h.origin.state.navigationPending, true);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].content, "Current unsaved draft");
  assert.equal(h.writes[0].hash, "original-hash");
  assert.equal(h.resolves.length, 0, "resolve must wait for the PUT acknowledgement");
  await h.saved();
  assert.equal(h.resolves.length, 1);
  assert.equal(h.origin.state.dirty, false);
  assert.equal(h.resolves[0].url, "/memories/all/resolve-title");
  assert.equal(h.resolves[0].options.method, "POST");
  assert.deepEqual(JSON.parse(h.resolves[0].options.body), { title: "  Ｂeta  " });
  assert.equal(h.reads.length, 0);
  assert.equal(h.pushes.length, 0);
  await h.found();
  assert.equal(h.reads.length, 1);
  assert.equal(h.reads[0].id, docB);
  assert.equal(h.reads[0].options.signal, h.resolves[0].options.signal);
  assert.equal(h.pushes.length, 0, "preflight must finish before history/editor replacement");
  assert.equal(h.state.editor, h.origin);
  h.reads[0].resolve(h.payload);
  await opening;
  await Promise.all(h.shows);
  assert.equal(h.pushes[0].url, "/?note=" + docB);
  assert.equal(h.reads.length, 1, "showNote must reuse the validated preflight payload");
  assert.equal(h.state.editor.state.documentId, docB);
  assert.equal(h.state.editor.state.exactContent, h.payload.content);
  assert.equal(h.state.editor.state.contentHash, h.payload.contentHash);
  assert.equal(h.richEditor.getMarkdown(), h.payload.content);
  assert.equal(h.origin.state.cancelled, true);
  assert.equal(h.context.stagedReferenceNote, null);
  assert.equal(h.context.referenceRequest, null);
  assert.equal(h.$("reference-message").hidden, true);
  assert.ok(h.dismissed >= 2);
});

test("failed saves retain the dirty draft and never resolve a page reference", async () => {
  const h = referenceHarness();
  const opening = h.activate();
  h.writes[0].reject(new Error("Save unavailable"));
  await opening;
  assertRetained(h);
  assert.equal(h.origin.state.dirty, true);
  assert.equal(h.origin.state.saveStatus, "failed");
  assert.equal(h.resolves.length, 0);
  assert.match(h.$("reference-message").textContent, /Save failed/);
  await h.activate();
  assert.equal(h.writes.length, 1, "blocked autosave requires explicit retry");
  assert.equal(h.resolves.length, 0);
});

test("reference resolve/preflight failures retain the current editor and unlock navigation", async (t) => {
  const cases = [
    { name: "missing", result: { status: "missing" }, message: /No page has this title/ },
    { name: "ambiguous", result: { status: "ambiguous" }, message: /Several pages/ },
    { name: "invalid ID", result: { status: "found", id: "bad-id" } },
    { name: "malformed resolve", result: {} },
    ...[401, 403, 500, 429, undefined].map((status) => ({ name: "resolve " + status, error: { status }, message: status === 401 || status === 403 ? /Connect with an access key/ : undefined })),
    ...[401, 403, 404, 500, undefined].map((status) => ({ name: "preflight " + status, preflight: true, error: { status }, message: status === 401 || status === 403 ? /Connect with an access key/ : undefined })),
    { name: "renamed target", preflight: true, patch: { title: "Renamed" } },
    { name: "wrong identity", preflight: true, patch: { frontmatter: { id: docA } } },
    { name: "missing identity", preflight: true, patch: { frontmatter: {} } },
    { name: "invalid body", preflight: true, patch: { content: null } },
    { name: "missing hash", preflight: true, patch: { contentHash: undefined } },
    { name: "missing title", preflight: true, patch: { title: undefined } },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const h = referenceHarness();
    const opening = h.activate();
    await h.saved();
    if (scenario.preflight) await h.found();
    const request = scenario.preflight ? h.reads[0] : h.resolves[0];
    if (scenario.error) request.reject(Object.assign(new Error("private server detail"), scenario.error));
    else request.resolve(scenario.preflight ? { ...h.payload, ...scenario.patch } : scenario.result);
    await opening;
    assertRetained(h);
    assert.equal(h.reads.length, scenario.preflight ? 1 : 0);
    assert.match(h.$("reference-message").textContent, scenario.message || /could not be opened/);
    assert.doesNotMatch(h.$("reference-message").textContent, /private server detail/);
    assert.equal(h.$("reference-message").dataset.error, "true");
  });
});

test("reference activation ignores repeats while saving/resolving/preflighting and permits retry", async () => {
  const h = referenceHarness();
  const opening = h.activate();
  await h.activate("Other");
  assert.equal(h.writes.length, 1);
  await h.saved();
  await h.activate("Other");
  assert.equal(h.resolves.length, 1);
  await h.found();
  await h.activate("Other");
  assert.equal(h.reads.length, 1);
  h.reads[0].reject(new Error("offline"));
  await opening;
  assertRetained(h);
  const retry = h.activate();
  await tick();
  assert.equal(h.writes.length, 1, "saved draft needs no duplicate PUT");
  assert.equal(h.resolves.length, 2);
  await h.found();
  h.reads[1].resolve(h.payload);
  await retry;
  assert.equal(h.pushes.length, 1);
});

test("credentials and modal openings cancel pending references, including transports that ignore abort", async (t) => {
  const cancelers = [
    ["credentials", (h) => h.context.setConnectionKey("new-key")],
    ["connection modal", (h) => h.context.openConnection(false)],
    ["search modal", (h) => h.context.openSearch()],
    ["explicit cancellation", (h) => h.context.cancelReferenceInteraction()],
  ];
  for (const phase of ["save", "resolve", "preflight"]) {
    for (const [name, cancel] of cancelers) await t.test(name + " during " + phase, async () => {
      const h = referenceHarness();
      const opening = h.activate();
      if (phase !== "save") await h.saved();
      if (phase === "preflight") await h.found();
      const signal = h.context.referenceRequest.signal;
      cancel(h);
      assert.equal(signal.aborted, true);
      if (phase === "save") await h.saved();
      if (phase === "resolve") await h.found();
      if (phase === "preflight") h.reads[0].resolve(h.payload);
      await opening;
      assertRetained(h);
      assert.equal(h.$("reference-message").hidden, true, "canceled responses must not show stale feedback");
      assert.equal(h.resolves.length, phase === "save" ? 0 : 1);
      assert.equal(h.reads.length, phase === "preflight" ? 1 : 0);
    });
  }
});

test("reference activation is inert with an unloaded/busy editor or any open modal", async (t) => {
  for (const blocked of ["unloaded", "busy", "searchDialog", "connectionDialog", "dreamDialog", "no editor"]) {
    await t.test(blocked, async () => {
      const h = referenceHarness();
      if (blocked === "unloaded") h.origin.state.loaded = false;
      else if (blocked === "busy") h.origin.setNavigationPending(true);
      else if (blocked === "no editor") h.state.editor = null;
      else h.context[blocked].open = true;
      await h.activate();
      assert.equal(h.writes.length + h.resolves.length + h.reads.length + h.pushes.length, 0);
      assert.equal(h.context.referenceRequest, null);
      assert.equal(h.dismissed, 0);
    });
  }
});

test("a changed editor or credential revision invalidates a late reference response independently of abort", async (t) => {
  for (const change of ["editor", "credentials"]) await t.test(change, async () => {
    const h = referenceHarness();
    const opening = h.activate();
    await h.saved();
    await h.found();
    const replacement = { state: { draft: "New current draft" }, setNavigationPending() {} };
    if (change === "editor") h.state.editor = replacement;
    else h.context.credentialRevision++;
    h.reads[0].resolve(h.payload);
    await opening;
    assert.equal(h.pushes.length, 0);
    assert.equal(h.context.stagedReferenceNote, null);
    assert.equal(h.state.editor, change === "editor" ? replacement : h.origin);
    assert.equal(h.state.editor.state.draft, change === "editor" ? "New current draft" : "Current unsaved draft");
  });
});

test("showNote rejects a staged payload for another document or credential revision", async (t) => {
  for (const mismatch of ["id", "revision"]) await t.test(mismatch, async () => {
    const h = referenceHarness({ dirty: false });
    h.context.stagedReferenceNote = { id: mismatch === "id" ? docA : docB, revision: mismatch === "revision" ? -1 : 0, payload: h.payload };
    const showing = h.context.showNote(docB);
    assert.equal(h.reads.length, 1);
    assert.equal(h.reads[0].id, docB);
    h.reads[0].resolve({ ...h.payload, content: "Fresh authenticated payload" });
    await showing;
    assert.equal(h.richEditor.getMarkdown(), "Fresh authenticated payload");
    assert.equal(h.context.stagedReferenceNote, null);
  });
});
