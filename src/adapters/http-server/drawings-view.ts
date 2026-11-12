// Shared hosted/companion presentation over canonical drawings/<Name>.excalidraw files.
// The Excalidraw editor runs in an isolated same-origin frame; this shell owns
// authentication, hash-checked saving, navigation guards and the sidebar list.
import { browserIcons } from "./browser-icons.js";

export const drawingIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="12" width="8" height="8" rx="1.5"/><circle cx="17" cy="16" r="4"/><path d="m7 9 5-6 5 6Z"/></svg>';
const trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>';

export const drawingsStyles = String.raw`
#drawing-view { flex: 1; min-width: 0; min-height: 0; width: 100%; display: flex; flex-direction: column; }
#drawing-view[hidden] { display: none; }
.drawing-header { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-bottom: 1px solid var(--line); flex: none; }
#drawing-name { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink); font: var(--weight-semibold) var(--text-ui)/var(--leading-ui) var(--font-ui); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); }
#drawing-name:hover:not(:read-only), #drawing-name:focus { background: var(--hover-fill); }
#drawing-state { flex: none; color: var(--ink-faint); font-size: var(--text-caption); white-space: nowrap; }
#drawing-state[data-tone="error"] { color: var(--error-ink); }
.drawing-notice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-bottom: 1px solid var(--line); font-size: var(--text-caption); color: var(--ink-soft); flex: none; }
.drawing-notice[hidden] { display: none; }
#drawing-stage { flex: 1; min-height: 0; position: relative; }
#drawing-stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
#drawing-empty { margin: var(--space-8) auto; max-width: 420px; text-align: center; color: var(--ink-soft); }
#drawing-empty[hidden] { display: none; }
#sidebar-drawings { margin-bottom: var(--space-3); }
#sidebar-drawings:empty { margin: 0; }
#sidebar-drawings .sidebar-page-link { display: flex; gap: var(--space-2); white-space: nowrap; }
#sidebar-drawings .sidebar-page-link svg { flex: none; width: var(--icon-size); height: var(--icon-size); color: var(--ink-faint); }
#sidebar-drawings .sidebar-page-link span { overflow: hidden; text-overflow: ellipsis; }
#sidebar-drawings-more { margin-bottom: var(--space-3); }
.search-result[data-kind="drawing"] .search-result-preview { color: var(--ink-faint); }
`;

export const drawingsNavigationControl = `<button id="new-drawing" type="button" class="quiet-button nav-item sidebar-icon" aria-label="New drawing" title="New drawing">${drawingIcon}</button>`;
export const drawingsSidebarMarkup = `<div id="drawing-navigation" hidden><ul id="sidebar-drawings" aria-label="Drawings"></ul><button id="sidebar-drawings-more" class="quiet-button sidebar-list-more" hidden>Show all drawings</button></div>`;

export const drawingsMarkup = `
  <section id="drawing-view" aria-label="Drawing" hidden>
    <div class="drawing-header">
      <input id="drawing-name" aria-label="Drawing name" maxlength="100" autocomplete="off" spellcheck="false" />
      <span id="drawing-state" role="status" aria-live="polite"></span>
      <button id="drawing-copy-mention" type="button" class="quiet-button note-icon" aria-label="Copy mention" title="Copy a mention to paste into a note">${browserIcons.link}</button>
      <button id="drawing-delete" type="button" class="quiet-button note-icon" aria-label="Delete drawing" title="Delete drawing">${trashIcon}</button>
    </div>
    <div id="drawing-notice" class="drawing-notice" role="alert" hidden>
      <span id="drawing-notice-text"></span>
      <button id="drawing-retry" type="button" class="quiet-button" hidden>Retry</button>
      <button id="drawing-reload" type="button" class="quiet-button" hidden>Load newer version</button>
      <button id="drawing-overwrite" type="button" class="quiet-button" hidden>Keep mine</button>
    </div>
    <div id="drawing-stage"><p id="drawing-empty" hidden></p></div>
  </section>`;

export const drawingsDialogMarkup = `
<dialog id="drawing-delete-dialog" class="document-dialog" aria-labelledby="drawing-delete-title">
  <h2 id="drawing-delete-title">Delete drawing?</h2>
  <p id="drawing-delete-name"></p>
  <p>Deleting this drawing cannot be undone. Notes that mention it are kept.</p>
  <p id="drawing-delete-message" role="status" aria-live="polite"></p>
  <div class="dialog-actions"><button id="drawing-delete-cancel" type="button" class="quiet-button">Cancel</button><button id="drawing-delete-confirm" type="button" class="quiet-button">Delete</button></div>
</dialog>`;

/** Browser script; composed into the shell after its transport and navigation exist. */
export const drawingsScript = String.raw`
function createDrawingsUI(host) {
  const extension = ".excalidraw", route = "/memories/all/drawings";
  const validName = (value) => typeof value === "string" && value.length > 0 && value.length <= 100 && value === value.trim()
    && !/[\x00-\x1f\x7f\[\]|#\\/:]/.test(value) && !value.startsWith(".") && !value.endsWith(".");
  const path = (name) => route + "/" + encodeURIComponent(name);
  const href = (name) => host.scopeUrl("/?drawing=" + encodeURIComponent(name));
  const element = (id) => document.getElementById(id);
  const view = element("drawing-view"), stage = element("drawing-stage"), nameInput = element("drawing-name"), stateLabel = element("drawing-state");
  const notice = element("drawing-notice"), noticeText = element("drawing-notice-text"), empty = element("drawing-empty");
  const deleteDialog = element("drawing-delete-dialog");
  let list = [], listScope = null, listAt = 0, listRequest = null, showAll = false;
  let token = 0, current = null, frame = null, frameReady = null, saveTimer = null, saving = null;

  function referenceName(target) {
    if (typeof target !== "string" || !target.toLowerCase().endsWith(extension)) return null;
    const name = target.slice(0, -extension.length);
    return validName(name) ? name : null;
  }
  function setState(text, tone) { stateLabel.textContent = text; if (tone) stateLabel.dataset.tone = tone; else delete stateLabel.dataset.tone; }
  function setNotice(text, actions) {
    noticeText.textContent = text || "";
    notice.hidden = !text;
    for (const id of ["drawing-retry", "drawing-reload", "drawing-overwrite"]) element(id).hidden = !(actions || []).includes(id);
  }
  function setEmpty(text) { empty.textContent = text || ""; empty.hidden = !text; if (frame) frame.hidden = Boolean(text); }
  function writable() { return Boolean(current) && !current.readOnly && !host.readOnly(); }
  function syncControls() {
    const open = Boolean(current);
    nameInput.readOnly = !open || !writable();
    element("drawing-delete").disabled = !open || !writable();
    element("drawing-copy-mention").disabled = !open;
  }

  // ---- sidebar list -------------------------------------------------------
  function renderList() {
    const container = element("drawing-navigation"), items = element("sidebar-drawings"), more = element("sidebar-drawings-more");
    container.hidden = !host.connected();
    const visible = showAll ? list : list.slice(0, 5);
    items.replaceChildren(...visible.map((drawing) => {
      const row = document.createElement("li"); row.className = "sidebar-page";
      const link = document.createElement("a"); link.className = "sidebar-page-link"; link.href = href(drawing.name); link.title = drawing.name;
      if (current && current.name === drawing.name) link.setAttribute("aria-current", "page");
      const glyph = document.createElement("span"); glyph.innerHTML = host.icon; glyph.style.display = "contents";
      const label = document.createElement("span"); label.textContent = drawing.name;
      link.append(glyph, label);
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); host.navigate("/?drawing=" + encodeURIComponent(drawing.name));
      });
      row.append(link); return row;
    }));
    more.hidden = list.length <= 5;
    more.textContent = showAll ? "Show fewer drawings" : "Show all drawings (" + list.length + ")";
  }
  async function refreshList(force) {
    const scope = host.scope();
    if (!host.connected()) { list = []; listScope = null; renderList(); return list; }
    if (!force && listScope === scope && Date.now() - listAt < 5000) return list;
    if (listRequest && listRequest.scope === scope) return listRequest.promise;
    const promise = (async () => {
      try {
        const packet = await host.json(route);
        if (host.scope() !== scope) return list;
        list = Array.isArray(packet && packet.drawings) ? packet.drawings.filter((item) => item && validName(item.name)) : [];
        listScope = scope; listAt = Date.now();
      } catch { if (listScope !== scope) list = []; }
      finally { if (listRequest && listRequest.promise === promise) listRequest = null; }
      renderList();
      return list;
    })();
    listRequest = { scope, promise };
    return promise;
  }
  /** File-name matches for the shared search dialog; never throws. */
  async function match(query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle || !host.connected()) return [];
    const drawings = await refreshList(false).catch(() => []);
    return drawings.filter((drawing) => drawing.name.toLocaleLowerCase().includes(needle)).slice(0, 5)
      .map((drawing) => ({ documentId: null, drawing: drawing.name, file: "drawings/" + drawing.name + extension, title: drawing.name, referenceTitle: null, snippet: "Drawing" }));
  }

  // ---- frame --------------------------------------------------------------
  function ensureFrame() {
    if (frameReady) return frameReady;
    frame = document.createElement("iframe");
    frame.id = "drawing-frame"; frame.title = "Drawing canvas"; frame.src = "/drawing-frame";
    frameReady = new Promise((resolve, reject) => {
      frame.addEventListener("load", () => {
        let api = null;
        try { api = frame.contentWindow.jumpyBrainDrawing; } catch { /* Not this origin. */ }
        if (api) resolve(api); else reject(new Error("The drawing editor did not load."));
      }, { once: true });
      frame.addEventListener("error", () => reject(new Error("The drawing editor did not load.")), { once: true });
    });
    frameReady.catch(() => {});
    stage.append(frame);
    return frameReady;
  }
  function dropFrame() {
    if (frame) frame.remove();
    frame = null; frameReady = null;
  }
  function frameApi() {
    try { return frame && frame.contentWindow && frame.contentWindow.jumpyBrainDrawing || null; } catch { return null; }
  }

  // ---- saving -------------------------------------------------------------
  function changed(session, serialized) {
    if (current !== session || !writable()) return;
    session.pending = serialized;
    if (session.conflict) return;
    session.failed = false;
    setState("Unsaved changes");
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; save(); }, 800);
  }
  async function save() {
    const session = current;
    if (!session) return true;
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    if (saving) { await saving; if (current !== session) return true; }
    if (session.pending === null) return !session.failed && !session.conflict;
    if (session.conflict) return false;
    const sent = session.pending;
    // Stored files are capped at 4 MiB; say so instead of letting the upload fail.
    if (sent.length > 4 * 1024 * 1024 - 2) {
      session.failed = true;
      setState("Not saved", "error");
      setNotice("This drawing is larger than 4 MB and cannot be saved. Remove or shrink embedded images, then retry.", ["drawing-retry"]);
      return false;
    }
    setState("Saving…");
    const attempt = (async () => {
      try {
        // The serialized scene is already JSON; avoid reparsing large drawings.
        const record = await host.json(path(session.name), { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": session.hash }, body: '{"scene":' + sent + "}" });
        session.hash = record.contentHash;
        if (session.pending === sent) session.pending = null;
        session.failed = false;
        if (current === session) { setState(session.pending === null ? "Saved" : "Unsaved changes"); setNotice(""); }
        listAt = 0;
        return true;
      } catch (error) {
        session.failed = true;
        if (current !== session) return false;
        if (error.code === "drawing_conflict") {
          session.conflict = true;
          setState("Not saved", "error");
          setNotice("This drawing was changed somewhere else. Load the newer version, or keep yours and replace it.", ["drawing-reload", "drawing-overwrite"]);
        } else if (error.code === "drawing_missing") {
          session.conflict = true;
          setState("Not saved", "error");
          setNotice("This drawing was deleted or renamed somewhere else. Your changes are still here; copy what you need before leaving.", []);
        } else if (Number(error.status) === 403) {
          session.readOnly = true; session.pending = null; session.failed = false;
          const api = frameApi(); if (api) api.setReadOnly(true);
          setState("Read only"); setNotice("This connection can view drawings but not change them."); syncControls();
        } else {
          setState("Not saved", "error");
          setNotice(error.code === "invalid_drawing" ? String(error.message) : "Could not save this drawing. Check the connection and retry.", ["drawing-retry"]);
        }
        return false;
      }
    })();
    saving = attempt;
    try { return await attempt; } finally {
      if (saving === attempt) saving = null;
      if (current === session && session.pending !== null && !session.failed && !session.conflict && saveTimer === null) saveTimer = setTimeout(() => { saveTimer = null; save(); }, 800);
    }
  }
  /** Navigation barrier: true only when nothing unsaved would be abandoned. */
  async function flush() {
    const session = current;
    if (!session) return true;
    if (session.renaming) await session.renaming;
    const api = frameApi();
    if (api && session.opened) api.flush();
    if (session.pending === null && !saving) return !session.failed && !session.conflict;
    const saved = await save();
    return current !== session || (saved && session.pending === null);
  }
  function hasPending() { return Boolean(current && (current.pending !== null || saving)); }

  // ---- open / close -------------------------------------------------------
  async function open(session, record) {
    session.hash = record.contentHash; session.pending = null; session.failed = false; session.conflict = false;
    const api = await ensureFrame();
    if (current !== session) return;
    setEmpty("");
    session.opened = true;
    api.open({ scene: record.scene, theme: host.theme(), readOnly: !writable(), onChange: (serialized) => changed(session, serialized) });
    setState(writable() ? "Saved" : "Read only"); setNotice(""); syncControls();
    host.ready(true);
  }
  async function load(session) {
    setState("Loading…"); setNotice(""); setEmpty("");
    try {
      const record = await host.json(path(session.name));
      if (current !== session) return;
      await open(session, record);
    } catch (error) {
      if (current !== session) return;
      const api = frameApi(); if (api) api.close();
      setState("");
      setEmpty(error.code === "drawing_missing" ? "This drawing does not exist. It may have been renamed or deleted."
        : error.code === "invalid_drawing" || error.code === "drawing_unsafe" ? "This file is not a drawing jumpyBrain can open."
        : Number(error.status) === 401 ? "Connect to open this drawing." : "Could not open this drawing. Check the connection and try again.");
      syncControls();
      host.ready(false);
    }
  }
  function show(name) {
    token++;
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    if (deleteDialog.open) deleteDialog.close();
    host.ready(false);
    if (name === null || name === undefined) {
      current = null; view.hidden = true; dropFrame(); renderList(); return;
    }
    view.hidden = false;
    const session = { name, hash: null, pending: null, failed: false, conflict: false, readOnly: false, opened: false, renaming: null, token };
    current = session;
    nameInput.value = name;
    syncControls(); renderList(); refreshList(false);
    if (!validName(name)) { setState(""); setEmpty("This drawing link is not valid."); return; }
    load(session);
  }
  async function reload() {
    const session = current;
    if (!session || saving) return;
    session.pending = null; session.failed = false; session.conflict = false;
    await load(session);
  }
  async function overwrite() {
    const session = current;
    if (!session || saving || session.pending === null) return;
    try {
      const record = await host.json(path(session.name));
      if (current !== session) return;
      session.hash = record.contentHash; session.conflict = false; session.failed = false;
      await save();
    } catch { if (current === session) setNotice("Could not replace the other version. Check the connection and retry.", ["drawing-reload", "drawing-overwrite"]); }
  }
  /** A clean open drawing follows changes made by agents or other windows. */
  async function refreshOpen() {
    const session = current;
    if (!session || !session.opened || session.pending !== null || saving || session.conflict || session.failed || session.renaming || document.hidden) return;
    try {
      const record = await host.json(path(session.name));
      if (current !== session || session.pending !== null || saving || record.contentHash === session.hash) return;
      const api = frameApi();
      if (api && api.flush() && session.pending !== null) return;
      await open(session, record);
    } catch { /* The next save or explicit open reports failures. */ }
  }

  // ---- create / rename / delete -------------------------------------------
  async function create() {
    if (!host.connected()) { host.message("Connect before creating a drawing.", true); return; }
    if (host.readOnly()) { host.message("This brain is read only.", true); return; }
    try {
      await host.navigate(async () => {
        const names = new Set((await refreshList(true)).map((drawing) => drawing.name.toLocaleLowerCase()));
        let number = 1, name = "Untitled drawing";
        for (let attempt = 0; attempt < 20; attempt++) {
          while (names.has(name.toLocaleLowerCase())) name = "Untitled drawing " + (++number);
          try {
            await host.json(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
            listAt = 0;
            return "/?drawing=" + encodeURIComponent(name);
          } catch (error) {
            if (error.code !== "drawing_conflict") throw error;
            names.add(name.toLocaleLowerCase());
          }
        }
        throw new Error("Could not choose a free drawing name.");
      });
    } catch (error) {
      host.message(Number(error && error.status) === 403 ? "This connection cannot create drawings." : "Could not create a drawing. Check the connection and try again.", true);
    }
  }
  function rename() {
    const session = current, next = nameInput.value.trim();
    if (!session || session.renaming) return;
    if (next === session.name || !writable() || !session.opened) { nameInput.value = session.name; return; }
    if (!validName(next)) {
      nameInput.value = session.name;
      host.message("Use 1–100 characters without slashes, brackets, colons, # or |, and no leading or trailing dot.", true);
      return;
    }
    session.renaming = (async () => {
      try {
        const api = frameApi(); if (api) api.flush();
        if ((session.pending !== null || saving) && !await save()) throw Object.assign(new Error("unsaved"), { code: "unsaved" });
        const record = await host.json(path(session.name), { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": session.hash }, body: JSON.stringify({ name: next }) });
        if (current !== session) return;
        session.name = record.name; session.hash = record.contentHash;
        nameInput.value = record.name;
        host.replaceUrl("/?drawing=" + encodeURIComponent(record.name));
        // An older server renames the file only and reports no mentions.
        if (!record.mentions) { host.message("Renamed. Update notes that mention the old name.", false); return; }
        const mentions = record.mentions;
        const updated = Array.isArray(mentions.updated) ? mentions.updated.length : 0, failed = Array.isArray(mentions.failed) ? mentions.failed : [];
        if (updated && host.notesChanged) host.notesChanged();
        const plural = (count) => count === 1 ? "1 note" : count + " notes";
        if (failed.length) {
          const named = failed.map((note) => note.title).filter(Boolean).slice(0, 3).join(", ");
          host.message("Renamed" + (updated ? " and updated " + plural(updated) : "") + ". " + plural(failed.length) + " still mention the old name"
            + (named ? " (" + named + ")" : "") + ". Update them by hand.", true);
        } else host.message(updated ? "Renamed. Updated mentions in " + plural(updated) + "." : "Renamed.", false);
      } catch (error) {
        if (current !== session) return;
        nameInput.value = session.name;
        host.message(error.code === "drawing_conflict" ? "A drawing with this name already exists, or this one changed. Try another name."
          : error.code === "unsaved" ? "Save this drawing before renaming it." : "Could not rename this drawing.", true);
      } finally { session.renaming = null; await refreshList(true); }
    })();
  }
  async function remove() {
    const session = current;
    if (!session || !session.hash) return;
    const confirm = element("drawing-delete-confirm"), message = element("drawing-delete-message");
    confirm.disabled = true; message.textContent = "Deleting…";
    try {
      if (saving) await saving;
      await host.json(path(session.name), { method: "DELETE", headers: { "If-Match": session.hash } });
      if (current === session) { session.pending = null; session.failed = false; session.conflict = false; }
      deleteDialog.close(); listAt = 0;
      await host.navigate("/");
      refreshList(true);
    } catch (error) {
      message.textContent = error.code === "drawing_conflict" ? "This drawing changed. Close this dialog and review it before deleting." : "Could not delete this drawing.";
    } finally { confirm.disabled = false; }
  }

  nameInput.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); nameInput.blur(); }
    if (event.key === "Escape" && current) { event.preventDefault(); nameInput.value = current.name; nameInput.blur(); }
  });
  nameInput.addEventListener("blur", rename);
  element("drawing-retry").addEventListener("click", () => { if (current) { current.failed = false; save(); } });
  element("drawing-reload").addEventListener("click", reload);
  element("drawing-overwrite").addEventListener("click", overwrite);
  element("drawing-copy-mention").addEventListener("click", async () => {
    if (!current) return;
    const mention = "[[" + current.name + extension + "]]";
    try { await navigator.clipboard.writeText(mention); host.message("Mention copied. Paste it into a note.", false); }
    catch { host.message("Could not copy. Type " + mention + " in a note.", true); }
  });
  element("drawing-delete").addEventListener("click", () => {
    if (!current || !writable() || !current.hash) return;
    element("drawing-delete-name").textContent = current.name;
    element("drawing-delete-message").textContent = "";
    deleteDialog.showModal(); element("drawing-delete-cancel").focus();
  });
  element("drawing-delete-cancel").addEventListener("click", () => deleteDialog.close());
  element("drawing-delete-confirm").addEventListener("click", remove);
  element("new-drawing").addEventListener("click", create);
  element("sidebar-drawings-more").addEventListener("click", () => { showAll = !showAll; renderList(); });
  window.addEventListener("focus", refreshOpen);
  document.addEventListener("visibilitychange", refreshOpen);
  new MutationObserver(() => { const api = frameApi(); if (api && current && current.opened) api.setTheme(host.theme()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return { show, flush, hasPending, refreshList, match, referenceName, create,
    connectionChanged() { listScope = null; refreshList(true); if (current) { const api = frameApi(); if (api && current.opened) api.setReadOnly(!writable()); syncControls(); } },
    current: () => current ? current.name : null };
}
`;
