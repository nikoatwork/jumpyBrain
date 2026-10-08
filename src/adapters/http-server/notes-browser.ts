// Adapter-owned browser presentation, composed into the nonce-protected shell.
// String.raw keeps shell JavaScript readable; the Lexical surface is bundled separately.
export const notesStyles = String.raw`
    body { display: flex; flex-direction: column; height: 100dvh; }
    .app-nav { min-height: 60px; flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 24px; }
    #graph-header { flex: 0 0 auto; }
    .app-nav .home-link { margin-right: auto; font-weight: 650; background: transparent; color: var(--ink); }
    .quiet-button { border: 0; border-radius: 6px; padding: 8px 10px; background: var(--control-fill); color: var(--ink-soft); text-decoration: none; font: inherit; cursor: pointer; }
    .quiet-button:hover { background: var(--surface-hover); color: var(--ink); }
    .home { width: 100%; overflow: auto; padding: clamp(28px, 8vh, 80px) 24px 48px; text-align: center; }
    .home-actions { width: min(100%, 560px); margin: 0 auto; text-align: left; }
    .home-actions h1 { margin: 0 0 24px; font-size: clamp(24px, 4vw, 30px); line-height: 1.25; font-weight: 600; letter-spacing: -.035em; }
    .home-action { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 10px; text-align: left; font-size: 15px; }
    .home-action-label { flex: 1; }
    .home-action-icon { width: 20px; height: 20px; flex: 0 0 auto; }
    #home-new { background: var(--control-fill); color: var(--ink); font-weight: 600; }
    #home-new:hover { background: var(--surface-hover); border-color: var(--line-strong); }
    #home-search { margin-top: 10px; background: transparent; color: var(--ink-soft); }
    #home-search:hover { background: var(--surface-hover); color: var(--ink); }
    .recent-notes { width: min(100%, 560px); margin: 40px auto 0; text-align: left; }
    .recent-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .recent-heading h2 { margin: 0; font-size: 13px; font-weight: 650; }
    .recent-heading span, #recent-message { color: var(--ink-soft); font-size: 12px; }
    #recent-list { list-style: none; margin: 0; padding: 0; }
    .recent-link { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 13px 10px; margin-inline: -10px; border-radius: 6px; color: var(--ink); text-decoration: none; }
    .recent-link:hover { background: var(--surface-hover); }
    .recent-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .recent-link time { flex-shrink: 0; color: var(--ink-soft); font-size: 12px; }
    kbd { font: inherit; color: var(--ink); }
    .home-action kbd { flex-shrink: 0; padding: 3px 7px; border: 1px solid var(--line); border-radius: 5px; font-size: 12px; font-weight: 400; color: inherit; }
    body:not([data-view="graph"]) #graph-header, body:not([data-view="graph"]) #graph-wrap { display: none; }
    body[data-view="graph"] .app-nav { border-bottom: 1px solid var(--line); }
    main, body[data-view="graph"] main { flex: 1; height: auto; min-height: 0; }
    #note-panel { width: 100%; min-width: 0; overflow: auto; scrollbar-color: var(--line-strong) transparent; }
    .note-column { width: min(100%, 800px); margin: 0 auto; padding: clamp(24px, 5vh, 64px) 32px 100px; }
    #note-title { margin: 0 0 20px; color: var(--ink); font: 650 clamp(26px, 4vw, 36px)/1.25 ui-sans-serif, system-ui, sans-serif; letter-spacing: -.035em; overflow-wrap: anywhere; }
    #note-name { display: block; width: 100%; height: auto; margin: 0 0 20px; padding: 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: 650 clamp(26px, 4vw, 36px)/1.25 ui-sans-serif, system-ui, sans-serif; letter-spacing: -.035em; }
    #note-editor { display: block; width: 100%; min-height: 55vh; resize: none; overflow: hidden; padding: 8px 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: 16px/1.8 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; tab-size: 2; white-space: pre-wrap; overflow-wrap: anywhere; }
    #note-editor p { margin: 0; min-height: 1.8em; }
    #note-editor h1, #note-editor h2, #note-editor h3, #note-editor h4, #note-editor h5, #note-editor h6 { margin: .45em 0 .2em; line-height: 1.35; font-weight: 650; letter-spacing: -.025em; }
    #note-editor h1 { font-size: 30px; }
    #note-editor h2 { font-size: 24px; }
    #note-editor h3 { font-size: 20px; }
    #note-editor h4, #note-editor h5, #note-editor h6 { font-size: 18px; }
    .editor-bold { font-weight: 700; }
    .editor-italic { font-style: italic; }
    .markdown-literal, .markdown-reference { text-decoration: underline dotted var(--line-strong); text-underline-offset: 4px; }
    .markdown-literal code, .markdown-reference { font: inherit; background: transparent; }
    .markdown-literal::selection { background: var(--surface-hover); }
    #format-controls { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; margin: 0 0 12px -10px; }
    #format-controls button { font-size: 12px; }
    #format-controls #insert-reference { margin: 0; }
    #note-editor:focus, #note-editor:focus-visible, #note-name:focus, #note-name:focus-visible { outline: none; border: 0; box-shadow: none; }
    #note-save-error { color: var(--error-ink); font-size: 13px; }
    .capture-feedback { margin: 0; padding: 0 24px; font-size: 12px; color: var(--ink-soft); }
    .capture-feedback[data-error="true"] { color: var(--error-ink); }
    #insert-reference { margin: 0 0 12px -10px; font-size: 12px; }
    button:disabled { cursor: wait; opacity: .65; }
    .save-state { color: var(--ink-soft); font-size: 12px; white-space: nowrap; }
    .save-state[data-state="failed"], #note-message[data-error="true"] { color: var(--error-ink); }
    #note-message { color: var(--ink-soft); white-space: pre-wrap; }
    #note-file { margin: 28px 0 8px; color: var(--ink-soft); overflow-wrap: anywhere; font-size: 12px; }
    .note-frontmatter { margin-top: 24px; color: var(--ink-soft); font-size: 12px; }
    .note-frontmatter summary { cursor: pointer; width: fit-content; }
    .note-frontmatter pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    dialog { width: min(600px, calc(100vw - 32px)); max-height: min(650px, calc(100dvh - 64px)); padding: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: rgba(45,43,39,.18); }
    #note-search { margin-top: min(15vh, 100px); }
    .dialog-head { display: flex; align-items: center; gap: 8px; padding: 16px; border-bottom: 1px solid var(--line); }
    #note-search-input { width: 100%; min-width: 0; border: 0; box-shadow: none; background: transparent; font-size: 16px; }
    #note-search-input:focus-visible { outline: 2px solid var(--focus-ring); }
    #search-results { list-style: none; padding: 6px; margin: 0; max-height: 45dvh; overflow: auto; }
    .search-result { padding: 12px; border-radius: 8px; cursor: pointer; }
    .search-result[aria-selected="true"] { background: var(--surface-hover); }
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
    #connection label { display: block; margin: 20px 0 8px; }
    #open-connection[data-state="connected"] { color: var(--ink); }
    .connection-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
    #api-key { width: 100%; display: block; margin-top: 8px; font-size: 16px; }
    @media (max-width: 680px) {
      .app-nav { padding-inline: 12px; gap: 2px; }
      .app-nav .quiet-button { padding-inline: 8px; font-size: 12px; }
      #open-search kbd { display: none; }
      #note-save-state { order: 5; margin-left: auto; }
      #note-retry { order: 6; }
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
  <button id="new-note" class="quiet-button">New note</button>
  <button id="open-search" class="quiet-button" aria-label="Search notes">Search <kbd class="shortcut"></kbd></button>
  <a id="graph-link" class="quiet-button" href="/graph">Graph</a>
  <button id="open-connection" class="quiet-button" aria-label="Connect · Connection settings" aria-haspopup="dialog">Connect</button>
</nav>
<p id="capture-message" class="capture-feedback" role="status" aria-live="polite" hidden></p>
<dialog id="note-search" aria-label="Search notes">
  <div class="dialog-head">
    <input id="note-search-input" aria-label="Search titles and contents" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" autocomplete="off" placeholder="Search your memory…" />
    <button id="close-search" class="quiet-button" aria-label="Close search">Esc</button>
  </div>
  <ul id="search-results" role="listbox" aria-label="Matching notes"></ul>
  <div class="search-footer">
    <p id="search-message" role="status" aria-live="polite">Search titles and contents.</p>
    <p id="reference-help" hidden>Insert a literal [[Page Title]] reference, not a unique-ID link. Duplicate titles may be ambiguous; graph resolution still uses filenames.</p>
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
    <button id="toggle-api-key" class="quiet-button" type="button" aria-controls="api-key" aria-pressed="false">Show key</button>
    <p id="connection-message" role="status" aria-live="polite"></p>
    <div class="connection-actions">
      <button id="connection-submit" class="button button-primary" type="submit">Connect</button>
      <button id="disconnect" class="quiet-button" type="button" hidden>Disconnect</button>
      <button id="close-connection" class="quiet-button" type="button">Cancel</button>
    </div>
  </form>
</dialog>
`;

export const notesViews = String.raw`
  <section id="home" class="home" aria-label="Your jumpyBrain">
    <div class="home-actions">
      <h1>What's on your mind?</h1>
      <button id="home-new" class="home-action" aria-label="New note">
        <svg class="home-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span class="home-action-label">New note</span><kbd class="new-shortcut" aria-hidden="true"></kbd>
      </button>
      <button id="home-search" class="home-action" aria-label="Search notes">
        <svg class="home-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span class="home-action-label">Search your memory</span><kbd class="shortcut" aria-hidden="true"></kbd>
      </button>
    </div>
    <section class="recent-notes" aria-labelledby="recent-title">
      <div class="recent-heading"><h2 id="recent-title">Recent notes</h2><span>Latest first</span></div>
      <ul id="recent-list" aria-label="Recent notes"></ul>
      <p id="recent-message" role="status" aria-live="polite"></p>
      <button id="recent-retry" class="quiet-button" hidden>Retry</button>
      <button id="recent-connect" class="quiet-button" hidden>Connect</button>
    </section>
  </section>
  <section id="note-panel" data-testid="graph-note-panel" aria-label="Note editor" hidden>
    <div class="note-column">
      <h1 id="note-title" data-testid="graph-note-title" tabindex="-1"></h1>
      <input id="note-name" aria-label="Page name" aria-describedby="note-save-error" autocomplete="off" hidden />
      <p id="note-save-error" role="status" aria-live="polite" hidden></p>
      <p id="note-message" role="status" hidden></p>
      <button id="note-load-retry" class="quiet-button" hidden>Retry loading</button>
      <div id="format-controls" role="group" aria-label="Text formatting" hidden>
        <button class="quiet-button" data-format="paragraph" aria-label="Normal text">Text</button>
        <button class="quiet-button" data-format="h1" aria-label="Heading">H1</button>
        <button class="quiet-button" data-format="h2" aria-label="Subheading">H2</button>
        <button class="quiet-button" data-format="h3" aria-label="Small heading">H3</button>
        <button class="quiet-button" data-format="bold" aria-label="Bold"><strong>B</strong></button>
        <button class="quiet-button" data-format="italic" aria-label="Italic"><em>I</em></button>
        <button id="insert-reference" class="quiet-button" hidden>[[ ]] Insert page reference</button>
      </div>
      <div id="note-editor" data-testid="graph-note-editor" role="textbox" aria-multiline="true" aria-label="Markdown note body" spellcheck="true" hidden></div>
      <details id="note-metadata" class="note-frontmatter" hidden>
        <summary>Metadata · read only</summary>
        <p id="note-file"></p>
        <pre id="note-frontmatter"></pre>
      </details>
    </div>
  </section>
`;

export const notesScript = String.raw`
// Title metadata is separate from the raw Markdown body; renaming never rewrites links or headings.
function withEditableTitle(prefix, title, newline) {
  if (!title.trim() || /[\x00-\x1f\x7f]/.test(title)) {
    const error = new Error("Enter a non-empty page name without control characters.");
    error.code = "invalid_title";
    throw error;
  }
  const lines = prefix.replace(/\r\n/g, "\n").split("\n");
  if (!prefix) return ["---", "title: " + JSON.stringify(title), "---", ""].join(newline);
  // Canonical frontmatter uses one value per line. Remove all title entries, then add one.
  const filtered = lines.filter((line) => !/^title\s*:/.test(line));
  filtered.splice(1, 0, "title: " + JSON.stringify(title));
  return filtered.join(newline);
}

// Recent notes come from fresh Markdown metadata, not the search index.
function createRecentNotes(options) {
  let generation = 0;
  let request = null;
  function cancel() {
    generation++;
    if (request) request.abort();
    request = null;
  }
  async function load() {
    cancel();
    const token = generation;
    request = options.abortController();
    options.onChange({ status: "loading", notes: [] });
    try {
      const packet = await options.fetch(request.signal);
      if (token !== generation) return;
      if (!Array.isArray(packet?.notes)) throw new Error("Invalid recent notes response");
      options.onChange({ status: "ready", notes: packet.notes.filter((note) => isValidMemoryDocumentId(note?.id)).slice(0, 8) });
    } catch (error) {
      if (token !== generation) return;
      options.onChange({ status: error.status === 401 ? "auth" : "error", notes: [] });
    } finally {
      if (token === generation) request = null;
    }
  }
  return { load, cancel };
}

function renderRecentNotes(recent) {
  const list = $("recent-list");
  list.replaceChildren();
  list.setAttribute("aria-busy", String(recent.status === "loading"));
  for (const note of recent.notes) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "recent-link";
    link.href = "/?note=" + encodeURIComponent(note.id);
    const title = document.createElement("span");
    title.textContent = note.title || note.file || "Untitled";
    link.title = title.textContent + (note.file ? " · " + note.file : "");
    link.append(title);
    const date = note.updatedAt || note.createdAt;
    if (date && Number.isFinite(Date.parse(date))) {
      const time = document.createElement("time");
      time.dateTime = date;
      // Date-only metadata must not shift a day in the browser's timezone.
      const value = new Date(date.length === 10 ? date + "T12:00:00" : date);
      time.textContent = value.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(value.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
      time.title = (note.updatedAt ? "Edited " : "Created ") + value.toLocaleString();
      link.append(time);
    }
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigation.navigate("/?note=" + encodeURIComponent(note.id));
    });
    item.append(link);
    list.append(item);
  }
  $("recent-message").textContent = recent.status === "loading" ? "Loading recent notes…"
    : recent.status === "auth" ? "Connect to see your recent notes."
    : recent.status === "error" ? "Could not load recent notes."
    : recent.notes.length ? "" : "No notes yet. Create your first note above.";
  $("recent-message").hidden = recent.status === "ready" && recent.notes.length > 0;
  $("recent-retry").hidden = recent.status !== "error";
  $("recent-connect").hidden = recent.status !== "auth";
}

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
    return [{ documentId, file, title: String(metadata.title || file.split("/").pop() || "Untitled"), referenceTitle: typeof metadata.title === "string" ? metadata.title : null, snippet: String(hit.snippet || "") }];
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
    search.feedback = "";
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
    search.feedback = "";
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
  async function navigate(destination) {
    if (busy || destination === current.url) return false;
    busy = true;
    let applied = false;
    try {
      const allowed = await options.beforeLeave();
      await restore();
      if (!allowed) return false;
      // Creation runs only after saving the current draft, under the same history lock.
      const url = typeof destination === "function" ? await destination() : destination;
      await restore();
      current = { url, index: current.index + 1 };
      position = current.index;
      options.push(current);
      options.show(url);
      applied = true;
      return true;
    } finally {
      // A rejected create may race Back/Forward too: restore before unlocking editing.
      await restore();
      busy = false;
      if (!applied && options.resume) options.resume();
    }
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

function datedNoteDraft(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const day = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  return { type: "note", dailyDate: day, body: "" };
}

// Keep the exact request/key after a lost response; retry must not create another note.
function createNoteCapture(options) {
  let attempt = null;
  let pending = null;
  function create() {
    if (pending) return pending;
    if (!attempt) attempt = { key: options.key(), draft: datedNoteDraft(options.now()), result: null };
    if (attempt.result) return Promise.resolve(attempt.result);
    pending = (async () => {
      const result = await options.write(attempt.draft, attempt.key);
      if (!isValidMemoryDocumentId(result?.id)) throw new Error("Invalid note creation response.");
      attempt.result = result;
      return result;
    })().finally(() => { pending = null; });
    return pending;
  }
  return { create, complete() { attempt = null; } };
}

function pageReferenceError(result, results) {
  const title = result.referenceTitle;
  if (typeof title !== "string" || !title.trim() || title !== title.trim() || /[\[\]\x00-\x1f\x7f|#\\/]/.test(title)) {
    return "This note has no safe exact page title for [[references]]. Choose another note.";
  }
  if (results.some((other) => other.documentId !== result.documentId && other.referenceTitle?.trim().toLowerCase() === title.toLowerCase())) {
    return "Several results share this title. A title-only reference cannot distinguish them; choose another title.";
  }
  return "";
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
for (const dialog of [searchDialog, connectionDialog, dreamDialog]) dialog.addEventListener("keydown", wrapDialogFocus);
let searchOrigin = null;
let searchSelection = null;
let searchDocument = null;
let referenceSelection = null;
let searchMode = "navigate";
let selectingResult = false;
let reopenSearch = false;
const appleKeyboard = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const shortcut = appleKeyboard ? "⌘K" : "Ctrl+K";
const newShortcut = appleKeyboard ? "⌘Enter" : "Ctrl+Enter";
for (const element of document.querySelectorAll(".shortcut")) element.textContent = shortcut;
for (const element of document.querySelectorAll(".new-shortcut")) element.textContent = newShortcut;
for (const id of ["home-new", "new-note"]) {
  $(id).setAttribute("aria-keyshortcuts", appleKeyboard ? "Meta+Enter" : "Control+Enter");
  $(id).title = "New note · " + newShortcut;
}
for (const id of ["home-search", "open-search"]) $(id).setAttribute("aria-keyshortcuts", appleKeyboard ? "Meta+K" : "Control+K");
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

const recentNotes = createRecentNotes({
  abortController: () => new AbortController(),
  fetch: (signal) => graphJson("/memories/all/recent", { signal }),
  onChange: renderRecentNotes,
});
$("recent-retry").addEventListener("click", () => recentNotes.load());
$("recent-connect").addEventListener("click", () => openConnection(false));

function openSearch(mode = "navigate", range = null) {
  if (searchDialog.open || connectionDialog.open || dreamDialog.open) return;
  searchMode = mode === "insert" ? "insert" : "navigate";
  referenceSelection = range;
  $("reference-help").hidden = searchMode !== "insert";
  searchDialog.setAttribute("aria-label", searchMode === "insert" ? "Insert page reference" : "Search notes");
  searchOrigin = document.activeElement;
  searchDocument = state.editor;
  const editor = $("note-editor");
  searchSelection = { selection: richEditor.captureSelection(), scroll: $("note-panel").scrollTop };
  if (searchMode === "insert") {
    searchOrigin = editor;
    $("note-search-input").value = range.query;
  }
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
    richEditor.restoreSelection(searchSelection.selection);
    $("note-panel").scrollTop = searchSelection.scroll;
  }
}

function renderNoteSearch(search) {
  const list = $("search-results");
  // A save can update freshness between pointerdown and pointerup. Keep the
  // actual click targets mounted unless the result collection changes.
  if (list.noteResults !== search.results) {
    list.noteResults = search.results;
    list.noteSelected = null;
    list.replaceChildren();
    search.results.forEach((result, index) => {
      const item = document.createElement("li");
      item.id = "search-result-" + index;
      item.className = "search-result";
      item.setAttribute("role", "option");
      item.setAttribute("aria-disabled", String(!result.documentId));
      const title = document.createElement("strong"); title.textContent = result.title;
      const snippet = document.createElement("span"); snippet.textContent = result.snippet;
      const context = document.createElement("small"); context.textContent = result.file + (result.documentId ? "" : " · Unavailable: missing memory ID");
      item.append(title, snippet, context);
      item.addEventListener("click", () => chooseSearchResult(result));
      list.append(item);
    });
  }
  [...list.children].forEach((item, index) => item.setAttribute("aria-selected", String(index === search.selected)));
  $("note-search-input").removeAttribute("aria-activedescendant");
  if (search.selected >= 0) {
    const id = "search-result-" + search.selected;
    $("note-search-input").setAttribute("aria-activedescendant", id);
    if (list.noteSelected !== search.selected) $(id).scrollIntoView({ block: "nearest" });
  }
  list.noteSelected = search.selected;
  $("search-message").textContent = search.feedback || (searchMode === "insert" && search.status === "ready" && search.selected >= 0
    ? "↑ ↓ to choose · Enter to insert reference" : search.message);
  $("search-results").setAttribute("aria-busy", String(search.status === "loading"));
  $("search-freshness").hidden = !search.stale;
  $("search-retry").hidden = search.status !== "error";
  $("search-connect").hidden = search.status !== "auth";
}

async function chooseSearchResult(result) {
  if (!result?.documentId || selectingResult) return;
  if (searchMode === "insert") { insertPageReference(result); return; }
  const url = "/?note=" + encodeURIComponent(result.documentId);
  if (url === shellUrl()) { closeSearch(); return; }
  selectingResult = true;
  noteSearch.cancel();
  $("search-message").textContent = "Opening note…";
  try {
    // showPage closes the dialog only after the save guard approves navigation.
    // A rejected navigation must explain why instead of swallowing the click.
    if (!await navigation.navigate(url)) {
      $("search-message").textContent = state.editor?.state.saveStatus === "failed"
        ? "Save failed. Close search and retry saving your current note before opening another."
        : "Navigation is busy. Try opening the note again.";
    }
  } catch {
    $("search-message").textContent = "Could not open this note. Please try again.";
  } finally { selectingResult = false; }
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
  if (event.key === "Enter") { event.preventDefault(); chooseSearchResult(noteSearch.state.results[noteSearch.state.selected]); }
});
$("search-retry").addEventListener("click", () => noteSearch.query($("note-search-input").value, true));
function handleNoteShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === "k") {
    if (connectionDialog.open || dreamDialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) { if (searchDialog.open) closeSearch(); else openSearch(); }
  } else if (event.key === "Enter") {
    if (searchDialog.open || connectionDialog.open || dreamDialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) newNote();
  }
}
// Capture before Lexical consumes Enter: creating a note must not insert a paragraph.
document.addEventListener("keydown", handleNoteShortcut, true);

function renderConnection() {
  const connected = connectionStatus === "connected";
  const label = connected ? "Connected" : connectionStatus === "checking" ? "Connecting…" : "Connect";
  const button = $("open-connection");
  button.textContent = label;
  button.dataset.state = connectionStatus;
  button.setAttribute("aria-label", label + " · Connection settings");
  $("connection-title").textContent = connected ? "Connection settings" : "Connect to your memory";
  $("connection-submit").textContent = connected ? "Update key" : "Connect";
  $("disconnect").hidden = !activeApiKey;
  $("connection-message").textContent = connected ? "Connected to this server."
    : connectionStatus === "checking" ? "Checking your connection…"
    : connectionStatus === "unavailable" ? "Could not reach the server. Retry connecting."
    : activeApiKey ? "The access key was not accepted. Update it to reconnect." : "Not connected.";
}
function maskApiKey() {
  apiKeyInput.type = "password";
  $("toggle-api-key").textContent = "Show key";
  $("toggle-api-key").setAttribute("aria-pressed", "false");
}
function openConnection(fromSearch) {
  if (dreamDialog.open) return;
  apiKeyInput.value = activeApiKey;
  maskApiKey();
  renderConnection();
  reopenSearch = fromSearch;
  if (searchDialog.open) closeSearch();
  connectionDialog.showModal();
  apiKeyInput.focus();
}
$("open-connection").addEventListener("click", () => openConnection(false));
$("search-connect").addEventListener("click", () => openConnection(true));
function closeConnection() {
  apiKeyInput.value = activeApiKey;
  maskApiKey();
  connectionDialog.close();
}
$("close-connection").addEventListener("click", closeConnection);
connectionDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeConnection(); });
$("toggle-api-key").addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  $("toggle-api-key").textContent = reveal ? "Hide key" : "Show key";
  $("toggle-api-key").setAttribute("aria-pressed", String(reveal));
});
function setConnectionKey(key) {
  key = key.trim();
  activeApiKey = key;
  credentialRevision++;
  connectionStatus = activeApiKey ? "checking" : "disconnected";
  try {
    if (activeApiKey) localStorage.setItem("jumpybrain.graph.apiKey", activeApiKey);
    else localStorage.removeItem("jumpybrain.graph.apiKey");
  } catch { /* Session-only access still works. */ }
  closeConnection();
  renderConnection();
}
$("connection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  setConnectionKey(apiKeyInput.value);
  if (state.view === "home") recentNotes.load();
  if (reopenSearch) openSearch(searchMode, referenceSelection);
  if (state.view === "note") {
    if (!state.editor?.state.loaded) showNote(new URL(location.href).searchParams.get("note"));
    else graphJson("/memories/all/recent").catch(() => {}); // Verify without replacing an open draft.
  } else if (state.view === "graph") loadGraph();
});
$("disconnect").addEventListener("click", async () => {
  $("disconnect").disabled = true;
  try {
    // Save with the current key before clearing credentials or rendered memory.
    const disconnected = await navigation.navigate(() => {
      setConnectionKey("");
      noteSearch.query("");
      $("note-search-input").value = "";
      state.graphToken++;
      state.graph = null;
      $("viewport").replaceChildren();
      return "/";
    });
    if (!disconnected) $("connection-message").textContent = "Could not disconnect. Save your pending note and try again.";
  } finally { $("disconnect").disabled = false; }
});
renderConnection();

function shellUrl() { return location.pathname + location.search; }
const initialEntry = { url: shellUrl(), index: Number.isSafeInteger(history.state?.jumpyBrainIndex) ? history.state.jumpyBrainIndex : 0 };
history.replaceState({ jumpyBrainIndex: initialEntry.index }, "", initialEntry.url);
const navigation = createPageNavigation({
  initial: initialEntry,
  beforeLeave: () => requestEditorNavigation(() => {}),
  resume: () => state.editor?.setNavigationPending(false),
  go: (delta) => history.go(delta),
  push: (entry) => history.pushState({ jumpyBrainIndex: entry.index }, "", entry.url),
  show: showPage,
});
window.addEventListener("popstate", (event) => {
  if (dreamDialog.open) closeDreamHandoff(false);
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
  if (dreamDialog.open) closeDreamHandoff(false);
  recentNotes.cancel();
  $("graph-filters").open = false;
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
  if (state.view === "note") { showNote(documentId, documentId === newNoteId); newNoteId = null; return; }
  state.noteToken++;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  $("note-retry").hidden = true;
  document.title = state.view === "graph" ? "Memory map · jumpyBrain" : "Notes · jumpyBrain";
  if (state.view === "graph") {
    if (!state.graph) loadGraph(); else queueGraphLayout(0, true);
    $("query").focus({ preventScroll: true });
  } else {
    $("home-new").focus();
    recentNotes.load();
  }
}

async function showNote(documentId, focusEnd = false) {
  const token = ++state.noteToken;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  $("note-title").textContent = "";
  $("note-title").hidden = false;
  $("note-name").hidden = true;
  $("note-save-error").hidden = true;
  $("note-editor").hidden = true;
  richEditor.setMarkdown("", true);
  $("format-controls").hidden = true;
  $("note-metadata").hidden = true;
  $("note-metadata").open = false;
  $("note-retry").hidden = true;
  $("insert-reference").hidden = true;
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
    if (!searchDialog.open && !connectionDialog.open) richEditor.focus(focusEnd);
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
$("note-name").addEventListener("input", () => state.editor?.inputTitle($("note-name").value));
$("note-name").addEventListener("blur", () => state.editor?.flush());

function syncEditorUi(editorState) {
  if (!state.editor || state.editor.state !== editorState) return;
  $("note-retry").hidden = editorState.saveStatus !== "failed";
  $("note-retry").disabled = editorState.navigationPending;
  $("note-editor").hidden = !editorState.loaded;
  $("note-name").hidden = !editorState.loaded;
  $("note-title").hidden = editorState.loaded;
  $("note-name").readOnly = editorState.navigationPending;
  $("note-name").setAttribute("aria-invalid", String(editorState.saveStatus === "failed"));
  $("note-save-error").hidden = editorState.saveStatus !== "failed";
  $("note-save-error").textContent = editorState.saveError || "";
  richEditor.setReadOnly(editorState.navigationPending);
  $("format-controls").hidden = !editorState.loaded;
  for (const button of $("format-controls").querySelectorAll("button")) button.disabled = editorState.navigationPending;
  $("insert-reference").hidden = !editorState.loaded;
  $("insert-reference").disabled = editorState.navigationPending;
  if (editorState.loaded) {
    if ($("note-name").value !== editorState.title) $("note-name").value = editorState.title;
    $("note-title").textContent = editorState.title || "Untitled";
    document.title = (editorState.title || "Untitled") + " · jumpyBrain";
    if (richEditor.getMarkdown() !== editorState.draft) richEditor.setMarkdown(editorState.draft);
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

const noteCapture = createNoteCapture({
  now: () => new Date(),
  key: () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  write: (draft, key) => graphJson("/memories/all/notes", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(draft),
  }),
});
let creatingNote = false;
let newNoteId = null;
async function newNote() {
  if (creatingNote || searchDialog.open || connectionDialog.open || dreamDialog.open) return;
  creatingNote = true;
  for (const id of ["new-note", "home-new"]) $(id).disabled = true;
  const message = $("capture-message");
  message.hidden = false;
  message.dataset.error = "false";
  message.textContent = "Creating today's note…";
  try {
    const opened = await navigation.navigate(async () => {
      const result = await noteCapture.create();
      noteSearch.markStale();
      newNoteId = result.id;
      return "/?note=" + encodeURIComponent(result.id);
    });
    if (!opened) throw new Error("navigation_blocked");
    noteCapture.complete();
    message.hidden = true;
    $("new-note").textContent = "New note";
  } catch (error) {
    message.dataset.error = "true";
    message.textContent = Number(error.status) === 401 || Number(error.status) === 403
      ? "Connect with an access key, then retry New note."
      : error.message === "navigation_blocked"
        ? "Could not leave the current note. Retry any failed save, then try New note again."
        : "Could not confirm note creation. Check your connection and retry New note; the same request will be reused.";
    $("new-note").textContent = "Retry new note";
  } finally {
    creatingNote = false;
    for (const id of ["new-note", "home-new"]) $(id).disabled = false;
  }
}
for (const id of ["new-note", "home-new"]) $(id).addEventListener("click", (event) => { if (event.detail < 2) newNote(); });

function openReferenceSearch() {
  if (!state.editor?.state.loaded || state.editor.state.navigationPending) return;
  const range = richEditor.referenceRange();
  if (range) openSearch("insert", range);
}
$("insert-reference").addEventListener("click", openReferenceSearch);
$("format-controls").addEventListener("mousedown", (event) => { if (event.target.closest("button")) event.preventDefault(); });
for (const button of document.querySelectorAll("[data-format]")) button.addEventListener("click", () => richEditor.format(button.dataset.format));
function insertPageReference(result) {
  const editor = $("note-editor");
  const range = referenceSelection;
  if (!range || state.editor !== searchDocument || !state.editor?.state.loaded || state.editor.state.navigationPending || richEditor.getMarkdown() !== range.value) {
    noteSearch.state.feedback = "The draft changed. Close this picker and insert the reference again.";
    renderNoteSearch(noteSearch.state);
    return;
  }
  const problem = pageReferenceError(result, noteSearch.state.results);
  if (problem) { noteSearch.state.feedback = problem; renderNoteSearch(noteSearch.state); return; }
  closeSearch();
  editor.focus({ preventScroll: true });
  const text = "[[" + result.referenceTitle + "]]";
  if (!richEditor.insertReference(range, text)) {
    richEditor.restoreSelection(searchSelection.selection);
    $("capture-message").hidden = false;
    $("capture-message").dataset.error = "true";
    $("capture-message").textContent = "Your browser could not insert a reference. Type " + text + " in the Markdown body.";
    return;
  }
  state.editor.input(richEditor.getMarkdown());
}

showPage(initialEntry.url);
`;
