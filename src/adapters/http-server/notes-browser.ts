// Adapter-owned browser presentation, composed into the nonce-protected shell.
// String.raw keeps browser JavaScript readable without a bundler or runtime dependency.
export const notesStyles = String.raw`
    body { background: var(--cream-50); display: flex; flex-direction: column; height: 100dvh; }
    .app-nav { min-height: 60px; flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 24px; }
    #graph-header { flex: 0 0 auto; }
    .app-nav .home-link { margin-right: auto; font-weight: 650; }
    .quiet-button { border: 0; border-radius: 6px; padding: 8px 10px; background: transparent; color: var(--ink-soft); text-decoration: none; font: inherit; cursor: pointer; }
    .quiet-button:hover { background: var(--sage-100); color: var(--ink); }
    a:focus-visible, summary:focus-visible { outline: 2px solid var(--forest-600); outline-offset: 3px; }
    .home { width: 100%; display: grid; place-content: center; padding: 24px; text-align: center; }
    .home-prompt { border: 0; background: transparent; color: var(--ink-soft); padding: 24px 8px; border-radius: 8px; font-size: clamp(18px, 3vw, 25px); letter-spacing: -.035em; font-weight: 400; }
    .home-prompt strong { font-weight: 650; color: var(--forest-950); }
    kbd { font: inherit; color: var(--ink); }
    .home-prompt kbd { padding: 5px 9px; margin-right: 4px; border: 1px solid var(--line); border-radius: 7px; background: var(--white); }
    body:not([data-view="graph"]) #graph-header, body:not([data-view="graph"]) #graph-wrap { display: none; }
    body[data-view="graph"] .app-nav { border-bottom: 1px solid var(--line); }
    main, body[data-view="graph"] main { flex: 1; height: auto; min-height: 0; }
    #note-panel { width: 100%; min-width: 0; overflow: auto; scrollbar-color: var(--sage-300) transparent; }
    .note-column { width: min(100%, 800px); margin: 0 auto; padding: clamp(24px, 5vh, 64px) 32px 100px; }
    #note-title { margin: 0 0 20px; color: var(--forest-950); font: 650 clamp(26px, 4vw, 36px)/1.25 ui-sans-serif, system-ui, sans-serif; letter-spacing: -.035em; overflow-wrap: anywhere; }
    #note-editor { display: block; width: 100%; min-height: 55vh; resize: none; overflow: hidden; padding: 8px 0; border: 0; border-radius: 0; background: transparent; color: var(--ink); box-shadow: none; font: 15px/1.8 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; tab-size: 2; white-space: pre-wrap; overflow-wrap: anywhere; }
    #note-editor:focus-visible { outline: 1px solid var(--line-strong); outline-offset: 8px; }
    .save-state { color: var(--ink-soft); font-size: 12px; white-space: nowrap; }
    .save-state[data-state="failed"], #note-message[data-error="true"] { color: #8b4434; }
    #note-message { color: var(--ink-soft); white-space: pre-wrap; }
    #note-file { margin: 28px 0 8px; color: var(--ink-soft); overflow-wrap: anywhere; font-size: 12px; }
    .note-frontmatter { margin-top: 24px; color: var(--ink-soft); font-size: 12px; }
    .note-frontmatter summary { cursor: pointer; width: fit-content; }
    .note-frontmatter pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    dialog { width: min(600px, calc(100vw - 32px)); max-height: min(650px, calc(100dvh - 64px)); padding: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--cream-50); color: var(--ink); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: rgba(23,55,43,.18); }
    #note-search { margin-top: min(15vh, 100px); }
    .dialog-head { display: flex; align-items: center; gap: 8px; padding: 16px; border-bottom: 1px solid var(--line); }
    #note-search-input { width: 100%; min-width: 0; border: 0; box-shadow: none; background: transparent; font-size: 16px; }
    #note-search-input:focus-visible { outline: 2px solid var(--line-strong); }
    #search-results { list-style: none; padding: 6px; margin: 0; max-height: 45dvh; overflow: auto; }
    .search-result { padding: 12px; border-radius: 8px; cursor: pointer; }
    .search-result[aria-selected="true"] { background: var(--sage-100); }
    .search-result[aria-disabled="true"] { cursor: default; color: var(--ink-soft); }
    .search-result strong, .search-result span, .search-result small { display: block; overflow-wrap: anywhere; }
    .search-result strong { font-size: 14px; font-weight: 650; }
    .search-result span { font-size: 13px; color: var(--ink-soft); margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .search-result small { margin-top: 4px; color: var(--ink-soft); font-size: 11px; }
    .search-footer { padding: 12px 18px; font-size: 12px; color: var(--ink-soft); }
    .search-footer p { margin: 0; }
    #search-freshness { margin-top: 6px; }
    #connection { padding: 24px; }
    #connection h2 { margin: 0 0 8px; font-size: 20px; }
    #connection p { color: var(--ink-soft); }
    #connection label { display: block; margin: 20px 0; }
    #api-key { width: 100%; display: block; margin-top: 8px; font-size: 16px; }
    @media (max-width: 680px) {
      .app-nav { padding-inline: 12px; gap: 2px; }
      .app-nav .quiet-button { padding-inline: 8px; font-size: 12px; }
      #open-search kbd { display: none; }
      #note-save-state { order: 5; margin-left: auto; }
      #note-retry { order: 6; }
      #graph-header .topbar { display: none; }
      .note-column { padding: 28px 22px 80px; }
      #note-editor { font-size: 16px; }
      .save-state { font-size: 11px; }
      #note-search { margin-top: 16px; max-height: calc(100dvh - 32px); }
    }
`;

export const notesMarkup = String.raw`
<nav class="app-nav" aria-label="Main navigation">
  <a id="home-link" class="quiet-button home-link" href="/" aria-label="Home">jumpyBrain</a>
  <span id="note-save-state" data-testid="graph-note-save-state" class="save-state" role="status" aria-live="polite" hidden></span>
  <button id="note-retry" data-testid="graph-note-retry" class="quiet-button" hidden>Retry save</button>
  <button id="open-search" class="quiet-button" aria-label="Search notes">Search <kbd class="shortcut"></kbd></button>
  <a id="graph-link" class="quiet-button" href="/graph">Graph</a>
  <button id="open-connection" class="quiet-button" aria-label="Connection settings">Connect</button>
</nav>
<dialog id="note-search" aria-label="Search notes">
  <div class="dialog-head">
    <input id="note-search-input" aria-label="Search titles and contents" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" autocomplete="off" placeholder="Search your memory…" />
    <button id="close-search" class="quiet-button" aria-label="Close search">Esc</button>
  </div>
  <ul id="search-results" role="listbox" aria-label="Matching notes"></ul>
  <div class="search-footer">
    <p id="search-message" role="status" aria-live="polite">Search titles and contents.</p>
    <p id="search-freshness" hidden>Recent edits may not appear until the search index refreshes.</p>
    <button id="search-retry" class="quiet-button" hidden>Retry search</button>
    <button id="search-connect" class="quiet-button" hidden>Connect</button>
  </div>
</dialog>
<dialog id="connection" aria-labelledby="connection-title">
  <form id="connection-form">
    <h2 id="connection-title">Connect to your memory</h2>
    <p>Use the access key for this server. It stays in this browser; only enter it on a server you trust.</p>
    <label>Access key<input id="api-key" data-testid="api-key" type="password" autocomplete="off" /></label>
    <button class="button button-primary" type="submit">Connect</button>
    <button id="close-connection" class="quiet-button" type="button">Cancel</button>
  </form>
</dialog>
`;

export const notesViews = String.raw`
  <section id="home" class="home" aria-label="Your jumpyBrain">
    <button id="home-search" class="home-prompt" aria-label="Search notes"><kbd class="shortcut">⌘K</kbd> to enter your <strong>jumpyBrain</strong></button>
  </section>
  <section id="note-panel" data-testid="graph-note-panel" aria-label="Note editor" hidden>
    <div class="note-column">
      <h1 id="note-title" data-testid="graph-note-title" tabindex="-1"></h1>
      <p id="note-message" role="status" hidden></p>
      <button id="note-load-retry" class="quiet-button" hidden>Retry loading</button>
      <textarea id="note-editor" data-testid="graph-note-editor" aria-label="Markdown note body" spellcheck="true" wrap="soft" hidden></textarea>
      <details id="note-metadata" class="note-frontmatter" hidden>
        <summary>Metadata · read only</summary>
        <p id="note-file"></p>
        <pre id="note-frontmatter"></pre>
      </details>
    </div>
  </section>
`;

export const notesScript = String.raw`
// Search and navigation controllers have injected effects for deterministic tests.
function normalizeNoteResults(results) {
  const seen = new Set();
  const normalized = (Array.isArray(results) ? results : []).flatMap((hit) => {
    const metadata = hit.provenance?.metadata || {};
    const documentId = isValidMemoryDocumentId(metadata.id) ? metadata.id : null;
    const file = String(hit.provenance?.file || "");
    const key = documentId || file || String(hit.id);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ documentId, file, title: String(metadata.title || file.split("/").pop() || "Untitled"), snippet: String(hit.snippet || "") }];
  });
  // Prefer usable notes without hiding unavailable legacy documents altogether.
  return [...normalized.filter((result) => result.documentId), ...normalized.filter((result) => !result.documentId)].slice(0, 12);
}

function createNoteSearch(options) {
  const search = { query: "", status: "idle", results: [], selected: -1, stale: false, message: "Search titles and contents." };
  let generation = 0;
  let timer = null;
  let request = null;
  let localStale = false;
  let writeRevision = 0;
  function markStale() {
    writeRevision++;
    localStale = true;
    search.stale = true;
    options.onChange(search);
  }
  function cancel() {
    generation++;
    if (timer !== null) options.clearTimer(timer);
    timer = null;
    if (request) request.abort();
    request = null;
  }
  function query(value, immediate) {
    cancel();
    const token = generation;
    search.query = value.trim();
    search.results = [];
    search.selected = -1;
    search.stale = localStale;
    search.status = search.query ? "loading" : "idle";
    search.message = search.query ? "Searching…" : "Search titles and contents.";
    options.onChange(search);
    if (!search.query) return;
    const run = async () => {
      timer = null;
      request = options.abortController();
      const requestedWriteRevision = writeRevision;
      try {
        const payload = await options.fetch(search.query, request.signal);
        if (token !== generation) return;
        search.results = normalizeNoteResults(payload?.results);
        search.selected = search.results.findIndex((result) => result.documentId);
        if (requestedWriteRevision === writeRevision && typeof payload?.index?.stale === "boolean") localStale = payload.index.stale;
        search.stale = Boolean(payload?.index?.stale) || localStale;
        search.status = "ready";
        search.message = search.selected >= 0 ? "↑ ↓ to choose · Enter to open"
          : search.results.length ? "These notes need memory IDs before they can be opened. Ask the server operator."
          : "No notes found. Try another word.";
      } catch (error) {
        if (token !== generation) return;
        search.status = Number(error.status) === 401 || Number(error.status) === 403 ? "auth" : "error";
        search.message = search.status === "auth" ? "Connect with an access key to search your memory."
          : Number(error.status) === 500 ? "Search is unavailable. The server may need its index built. Retry or ask the server operator."
          : "Search failed. Check your connection and retry.";
      }
      if (token === generation) { request = null; options.onChange(search); }
    };
    if (immediate) run();
    else timer = options.setTimer(run, 180);
  }
  function move(delta) {
    const available = search.results.map((result, index) => result.documentId ? index : -1).filter((index) => index >= 0);
    if (!available.length) return;
    const position = available.indexOf(search.selected);
    search.selected = available[(position + delta + available.length) % available.length];
    options.onChange(search);
  }
  return { state: search, query, cancel, move, markStale };
}

// Undo a history traversal before flushing a draft, then replay it only on success.
// This preserves both history entries on failed saves instead of replacing the target URL.
function createPageNavigation(options) {
  let current = options.initial;
  let position = current.index;
  let busy = false;
  let restoring = null;
  let committing = null;
  function restore() {
    if (position === current.index && !restoring) return Promise.resolve();
    if (!restoring) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      restoring = { resolve, promise };
      options.go(current.index - position);
    }
    return restoring.promise;
  }
  async function navigate(url) {
    if (busy || url === current.url) return false;
    busy = true;
    try {
      const allowed = await options.beforeLeave();
      await restore();
      if (!allowed) return false;
      current = { url, index: current.index + 1 };
      position = current.index;
      options.push(current);
      options.show(url);
      return true;
    } finally { busy = false; }
  }
  async function pop(entry) {
    position = entry.index;
    if (restoring) {
      if (position === current.index) {
        const done = restoring.resolve;
        restoring = null;
        done();
      } else options.go(current.index - position);
      return;
    }
    if (committing) {
      // If another traversal races the replay, honor the actual entry, after the same save guard.
      current = entry;
      committing = null;
      busy = false;
      options.show(entry.url);
      return;
    }
    if (busy) { await restore(); return; }
    busy = true;
    await restore();
    const allowed = await options.beforeLeave();
    await restore();
    if (!allowed) { busy = false; return; }
    committing = entry;
    options.go(entry.index - current.index);
  }
  return { navigate, pop };
}

const searchDialog = $("note-search");
const connectionDialog = $("connection");
function wrapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll("button, input, textarea, a[href], [tabindex]")]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const first = controls[0], last = controls[controls.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
for (const dialog of [searchDialog, connectionDialog]) dialog.addEventListener("keydown", wrapDialogFocus);
let searchOrigin = null;
let searchSelection = null;
let searchDocument = null;
let selectingResult = false;
let reopenSearch = false;
let previousKey = "";
const shortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘K" : "Ctrl+K";
for (const element of document.querySelectorAll(".shortcut")) element.textContent = shortcut;
const noteSearch = createNoteSearch({
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timer) => window.clearTimeout(timer),
  abortController: () => new AbortController(),
  fetch: (query, signal) => graphJson("/memories/all/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 24, depth: "normal" }), signal,
  }),
  onChange: renderNoteSearch,
});

function openSearch() {
  if (searchDialog.open || connectionDialog.open) return;
  searchOrigin = document.activeElement;
  searchDocument = state.editor;
  const editor = $("note-editor");
  searchSelection = { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection, scroll: $("note-panel").scrollTop };
  searchDialog.showModal();
  $("note-search-input").focus();
  $("note-search-input").select();
  noteSearch.query($("note-search-input").value);
}

function closeSearch(restoreFocus = true) {
  noteSearch.cancel();
  searchDialog.close();
  if (!restoreFocus) return;
  if (searchOrigin?.isConnected && !searchOrigin.closest("[hidden]")) searchOrigin.focus({ preventScroll: true });
  if (searchOrigin === $("note-editor") && searchDocument === state.editor && searchSelection) {
    $("note-editor").setSelectionRange(searchSelection.start, searchSelection.end, searchSelection.direction);
    $("note-panel").scrollTop = searchSelection.scroll;
  }
}

function renderNoteSearch(search) {
  const list = $("search-results");
  list.replaceChildren();
  search.results.forEach((result, index) => {
    const item = document.createElement("li");
    item.id = "search-result-" + index;
    item.className = "search-result";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === search.selected));
    item.setAttribute("aria-disabled", String(!result.documentId));
    const title = document.createElement("strong"); title.textContent = result.title;
    const snippet = document.createElement("span"); snippet.textContent = result.snippet;
    const context = document.createElement("small"); context.textContent = result.file + (result.documentId ? "" : " · Unavailable: missing memory ID");
    item.append(title, snippet, context);
    item.addEventListener("click", () => chooseSearchResult(index));
    list.append(item);
  });
  $("note-search-input").removeAttribute("aria-activedescendant");
  if (search.selected >= 0) {
    const id = "search-result-" + search.selected;
    $("note-search-input").setAttribute("aria-activedescendant", id);
    $(id).scrollIntoView({ block: "nearest" });
  }
  $("search-message").textContent = search.message;
  $("search-results").setAttribute("aria-busy", String(search.status === "loading"));
  $("search-freshness").hidden = !search.stale;
  $("search-retry").hidden = search.status !== "error";
  $("search-connect").hidden = search.status !== "auth";
}

async function chooseSearchResult(index) {
  const result = noteSearch.state.results[index];
  if (!result?.documentId || selectingResult) return;
  selectingResult = true;
  closeSearch();
  try { await navigation.navigate("/?note=" + encodeURIComponent(result.documentId)); }
  finally { selectingResult = false; }
}

$("open-search").addEventListener("click", openSearch);
$("home-search").addEventListener("click", openSearch);
$("close-search").addEventListener("click", () => closeSearch());
searchDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSearch(); });
searchDialog.addEventListener("click", (event) => { if (event.target === searchDialog) closeSearch(); });
$("note-search-input").addEventListener("input", (event) => { if (!event.isComposing) noteSearch.query(event.target.value); });
$("note-search-input").addEventListener("compositionend", (event) => noteSearch.query(event.target.value));
$("note-search-input").addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); noteSearch.move(event.key === "ArrowDown" ? 1 : -1); }
  if (event.key === "Enter") { event.preventDefault(); chooseSearchResult(noteSearch.state.selected); }
});
$("search-retry").addEventListener("click", () => noteSearch.query($("note-search-input").value, true));
document.addEventListener("keydown", (event) => {
  if (!event.isComposing && !event.altKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (searchDialog.open) closeSearch(); else openSearch();
  }
});

function openConnection(fromSearch) {
  previousKey = apiKeyInput.value;
  reopenSearch = fromSearch;
  if (searchDialog.open) closeSearch();
  connectionDialog.showModal();
  apiKeyInput.focus();
}
$("open-connection").addEventListener("click", () => openConnection(false));
$("search-connect").addEventListener("click", () => openConnection(true));
function closeConnection() {
  apiKeyInput.value = previousKey;
  connectionDialog.close();
}
$("close-connection").addEventListener("click", closeConnection);
connectionDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeConnection(); });
$("connection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try { localStorage.setItem("jumpybrain.graph.apiKey", apiKeyInput.value); } catch { /* Session-only access still works. */ }
  connectionDialog.close();
  if (reopenSearch) openSearch();
  else if (state.view === "note" && !state.editor?.state.loaded) showNote(new URL(location.href).searchParams.get("note"));
  else if (state.view === "graph") loadGraph();
});

function shellUrl() { return location.pathname + location.search; }
const initialEntry = { url: shellUrl(), index: Number.isSafeInteger(history.state?.jumpyBrainIndex) ? history.state.jumpyBrainIndex : 0 };
history.replaceState({ jumpyBrainIndex: initialEntry.index }, "", initialEntry.url);
const navigation = createPageNavigation({
  initial: initialEntry,
  beforeLeave: () => requestEditorNavigation(() => {}),
  go: (delta) => history.go(delta),
  push: (entry) => history.pushState({ jumpyBrainIndex: entry.index }, "", entry.url),
  show: showPage,
});
window.addEventListener("popstate", (event) => {
  if (searchDialog.open) closeSearch();
  if (connectionDialog.open) closeConnection();
  navigation.pop({ url: shellUrl(), index: Number.isSafeInteger(event.state?.jumpyBrainIndex) ? event.state.jumpyBrainIndex : 0 });
});
for (const [id, url] of [["home-link", "/"], ["graph-link", "/graph"]]) {
  $(id).addEventListener("click", (event) => {
    // Native new-tab navigation does not abandon the current draft.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigation.navigate(url);
  });
}

function showPage(url) {
  if (searchDialog.open) closeSearch(false);
  if (connectionDialog.open) closeConnection();
  const target = new URL(url, location.origin);
  const documentId = target.searchParams.get("note");
  state.view = documentId !== null ? "note" : /^\/graph\/?$/.test(target.pathname) ? "graph" : "home";
  document.body.dataset.view = state.view;
  $("home").hidden = state.view !== "home";
  $("note-panel").hidden = state.view !== "note";
  $("note-save-state").hidden = state.view !== "note";
  $("open-search").hidden = state.view === "home";
  $("graph-link").hidden = state.view === "graph";
  $("error").hidden = true;
  if (state.view === "note") { showNote(documentId); return; }
  state.noteToken++;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  $("note-retry").hidden = true;
  document.title = state.view === "graph" ? "Memory map · jumpyBrain" : "jumpyBrain";
  if (state.view === "graph") {
    if (!state.graph) loadGraph(); else queueGraphLayout(0);
    $("query").focus();
  } else $("home-search").focus();
}

async function showNote(documentId) {
  const token = ++state.noteToken;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  $("note-title").textContent = "";
  $("note-editor").hidden = true;
  $("note-editor").value = "";
  $("note-metadata").hidden = true;
  $("note-metadata").open = false;
  $("note-retry").hidden = true;
  $("note-save-state").textContent = "";
  $("note-load-retry").hidden = true;
  $("note-message").hidden = false;
  $("note-message").dataset.error = "false";
  $("note-message").textContent = "Loading note…";
  $("note-panel").scrollTop = 0;
  document.title = "Note · jumpyBrain";
  if (!isValidMemoryDocumentId(documentId)) { noteLoadError("This note link has an invalid memory ID. Use Search to find a note."); return; }
  const editor = createDocumentEditor({
    generation: token, documentId, debounceMs: 750, persistentEditing: true,
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (timer) => window.clearTimeout(timer),
    splitDocument: splitEditableDocument, composeDocument: composeEditableDocument,
    readDocument: readGraphDocument, writeDocument: writeGraphDocument,
    onSaved: () => noteSearch.markStale(),
    isCurrent: (generation, id) => state.noteToken === generation && state.editor === editor && editor.state.documentId === id,
    onChange: syncEditorUi,
  });
  state.editor = editor;
  try {
    const payload = await readGraphDocument(documentId);
    if (token !== state.noteToken || state.editor !== editor) return;
    if (typeof payload?.content !== "string" || typeof payload?.contentHash !== "string") throw new Error("Invalid document response.");
    $("note-title").textContent = payload.title || payload.file || "Untitled";
    document.title = $("note-title").textContent + " · jumpyBrain";
    $("note-file").textContent = payload.file || "";
    $("note-message").hidden = true;
    editor.hydrate(payload);
    editor.setEditing(true);
    autoSizeNoteEditor();
    if (!searchDialog.open && !connectionDialog.open) $("note-editor").focus({ preventScroll: true });
  } catch (error) {
    if (token !== state.noteToken || state.editor !== editor) return;
    noteLoadError(Number(error.status) === 404 ? "This note is no longer available. Use Search to find another note."
      : Number(error.status) === 401 || Number(error.status) === 403 ? "Connect with an access key to open this note."
      : "Could not load this note. Check your connection and retry.");
    $("note-load-retry").hidden = false;
  }
}
function noteLoadError(message) {
  $("note-message").textContent = message;
  $("note-message").dataset.error = "true";
  $("note-message").hidden = false;
  $("note-title").textContent = "Note unavailable";
}
$("note-load-retry").addEventListener("click", () => showNote(new URL(location.href).searchParams.get("note")));

function syncEditorUi(editorState) {
  if (!state.editor || state.editor.state !== editorState) return;
  $("note-retry").hidden = editorState.saveStatus !== "failed";
  $("note-retry").disabled = editorState.navigationPending;
  $("note-editor").hidden = !editorState.loaded;
  // readOnly, not disabled: keep focus and caret while a navigation save is pending.
  $("note-editor").readOnly = editorState.navigationPending;
  if (editorState.loaded) {
    if ($("note-editor").value !== editorState.draft) $("note-editor").value = editorState.draft;
    $("note-frontmatter").textContent = editorState.frontmatterPrefix;
    $("note-metadata").hidden = false;
  }
  const feedback = editorState.saveStatus === "saving" ? "Saving…"
    : editorState.saveStatus === "failed" ? "Save failed"
    : editorState.saveStatus === "saved" ? "Saved" : editorState.dirty ? "Editing…" : "";
  $("note-save-state").textContent = feedback;
  $("note-save-state").dataset.state = editorState.saveStatus;
  $("note-save-state").title = editorState.saveError || "";
  $("note-save-state").setAttribute("aria-label", feedback + (editorState.saveError ? ": " + editorState.saveError : ""));
}

showPage(initialEntry.url);
`;
