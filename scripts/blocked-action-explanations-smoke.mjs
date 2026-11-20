// Changes a key's role does not allow stay visible and explain themselves with a Settings
// action, in the Mac app and in the hosted browser: folders, note attention, formatting,
// boards. Busy and frozen states keep their plain disabled controls. A role lost on the
// server while a page is open is refused, explained and re-read without dropping the note.
// A production server and gateway with disposable roots and keys.
// Use existing dist (do not build here):
// npx --package=playwright node scripts/blocked-action-explanations-smoke.mjs [--shots <directory>]
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv.includes("--shots") ? path.resolve(process.argv[process.argv.indexOf("--shots") + 1]) : null;
const setupKey = "disposable-setup-" + randomBytes(16).toString("hex");
const controlKey = randomBytes(32).toString("hex");
const noteId = "mem_a0000000-0000-4000-8000-00000000000a", otherId = "mem_a0000000-0000-4000-8000-00000000000b";
const boardId = randomUUID();
const errors = [];
let temporary, remote, gateway, browser, stage = "bootstrap";
const check = async (name, operation) => { stage = name; await operation(); console.log("  ok - " + name); };
const shot = async (page, name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + ".png") }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(probe, label, timeout = 12000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) { last = await probe(); if (last) return last; await pause(50); }
  throw new Error("Timed out waiting for " + label);
}
const needsWriter = (action, brain) => `${action} needs a writer or admin key. Your key${brain ? ` for “${brain}”` : ""} has reader access.`;

try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-blocked-actions-smoke-")));
  const roots = { local: path.join(temporary, "local"), remote: path.join(temporary, "remote") };
  for (const root of Object.values(roots)) { await mkdir(root); await initializeMemoryRoot(root); }
  const noteFile = path.join(roots.remote, "notes", "shared-plan.md");
  await writeFile(noteFile, `---\nid: ${noteId}\ntype: note\ntitle: Shared plan\n---\nOriginal line\n\n- [ ] Ship it\n`);
  await writeFile(path.join(roots.remote, "notes", "second-note.md"), `---\nid: ${otherId}\ntype: note\ntitle: Second note\n---\nAnother line about [[missing topic]].\n`);
  await mkdir(path.join(roots.remote, "drawings"), { recursive: true });
  await writeFile(path.join(roots.remote, "drawings", "Sketch.excalidraw"), JSON.stringify({ type: "excalidraw", version: 2, source: "fixture", elements: [], appState: {}, files: {} }));
  await mkdir(path.join(roots.remote, "notes", "archive"));
  remote = await startJumpyBrainHttpServer({ root: roots.remote, apiKeys: [setupKey], host: "127.0.0.1", port: 0, autoIndex: false });
  const server = async (route, method = "GET", body, key = setupKey) => fetch(remote.url + route, { method, headers: { Authorization: "Bearer " + key, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const issue = async (name, role) => { const packet = await (await server("/access", "POST", { name, role })).json(); return { token: packet.token, id: packet.credential.id }; };
  const ada = await issue("Ada", "admin"), bob = await issue("Bob", "reader"), wren = await issue("Wren", "writer"), hana = await issue("Hana", "writer");
  assert.equal((await server("/memories/all/boards", "POST", { schemaVersion: 1, id: boardId, name: "Launch", archived: false, columns: [{ name: "To do", pages: [noteId, otherId] }, { name: "Doing", pages: [] }, { name: "Done", pages: [] }] })).ok, true);
  // Everything a refused change could have touched: files, folders, notes and the board.
  const remoteState = async () => JSON.stringify([
    (await readdir(path.join(roots.remote, "notes"), { recursive: true })).sort(), (await readdir(path.join(roots.remote, "drawings"))).sort(),
    await readFile(noteFile, "utf8"),
    await (await server("/memories/all/boards")).json(),
  ]);

  const support = path.join(temporary, "support"); await mkdir(support, { mode: 0o700 });
  const localId = randomUUID(), remoteId = randomUUID(), credentialRef = "jumpybrain-companion:" + randomUUID();
  await writeFile(path.join(support, "connections.json"), JSON.stringify({ version: 1, revision: 1, activeId: remoteId, profiles: [
    { id: localId, name: "Local brain", kind: "local", root: roots.local },
    { id: remoteId, name: "Team brain", kind: "remote", url: new URL(remote.url).origin, credentialRef },
  ] }, null, 2) + "\n", { mode: 0o600 });
  const keys = new Map([[credentialRef, bob.token]]);
  gateway = await startCompanionGateway({ runtimeRoot, directory: support, initialRoot: roots.local, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref) ?? null, set: async (ref, key) => { keys.set(ref, key); }, delete: async ref => { keys.delete(ref); }, selectFolder: async () => roots.local },
    switchTimeoutMs: 10000, targetTimeoutMs: 5000, identityFile: path.join(temporary, "identity.json") });
  const native = async (route, body) => {
    const response = await fetch(gateway.url + route, { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + controlKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, route + " " + await response.clone().text()); return response.json();
  };

  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  context.setDefaultTimeout(12000);
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));

  // Shared page helpers. The explanation is the one toast; its action leads to Settings.
  const toastOf = page => async () => { await page.locator("#app-toast").waitFor({ state: "visible" }); return { text: await page.locator("#toast-message").textContent(), action: await page.locator("#toast-action").isVisible() ? await page.locator("#toast-action").textContent() : "" }; };
  const dismissOf = page => async () => { for (let shown = 0; shown < 8 && await page.locator("#app-toast").isVisible(); shown++) { await page.locator("#toast-close").click(); await pause(60); } await page.locator("#app-toast").waitFor({ state: "hidden" }); };
  // After a role is lost, a more severe message (an editing session the server closed) may be
  // shown first; the explanation waits behind it. Dismiss anything else to reach it.
  const explainedBehind = async (page, pattern) => until(async () => {
    if (!await page.locator("#app-toast").isVisible()) return false;
    const text = await page.locator("#toast-message").textContent();
    if (pattern.test(text)) { assert.equal(await page.locator("#toast-action").textContent(), "Open Settings"); return text; }
    await page.locator("#toast-close").click(); return false;
  }, "the access explanation " + pattern, 25000);
  // Every request that could change the brain; reads that happen to use POST and signing in or out are not changes.
  const readPosts = /\/memories\/all\/(search|recall|recall\/compact|expand|resolve-title|dream-sources)$/;
  const changesOf = page => { const sent = []; page.on("request", request => { const url = new URL(request.url()); if (!["GET", "HEAD"].includes(request.method()) && !url.pathname.startsWith("/companion/") && !readPosts.test(url.pathname) && !["/feedback", "/session"].includes(url.pathname)) sent.push(request.method() + " " + url.pathname); }); return sent; };
  // What a user does, and what must come back: the same explanation, the Settings action, nothing else opening.
  const explained = async (page, expected, label) => {
    const shown = await toastOf(page)();
    assert.equal(shown.text, expected, label || expected); assert.equal(shown.action, "Open Settings", label || expected);
  };
  const explains = async (page, act, expected, label) => { await dismissOf(page)(); await act(); await explained(page, expected, label); };
  const dragStart = (page, selector) => page.evaluate(selector => {
    const element = document.querySelector(selector), event = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    element.dispatchEvent(event); return { draggable: element.draggable, prevented: event.defaultPrevented };
  }, selector);
  const openFolders = async page => {
    if (await page.locator("#folder-explorer").isHidden()) await page.locator("#toggle-folders").click();
    const notes = page.locator('#folder-explorer-tree [data-folder-path="notes"]'); await notes.waitFor();
    if (await notes.getAttribute("aria-expanded") !== "true") await notes.click();
    await page.locator('#folder-explorer-tree [data-file-path="notes/shared-plan.md"]').waitFor();
  };
  const fileMenu = async (page, item) => { await page.locator('#folder-explorer-tree [data-file-path="notes/shared-plan.md"]').click({ button: "right" }); const entry = page.locator("#folder-explorer-menu .menu-item", { hasText: item }); await entry.waitFor(); return entry; };
  // The same attempts in both hosts; `brain` is named only where there is more than one.
  const readerAttempts = async (page, brain, openNote) => {
    // Folders: New folder, the file menu, F2 and dragging all start a change.
    await openFolders(page);
    assert.equal(await page.locator("#folder-explorer-new").isDisabled(), false, "New folder stays available");
    await explains(page, () => page.locator("#folder-explorer-new").click(), needsWriter("Creating a folder", brain));
    assert.equal(await page.locator("#folder-explorer-edit").evaluate(dialog => dialog.open), false, "no folder dialog opens");
    for (const [item, action] of [["Rename…", "Renaming this file"], ["Move to…", "Moving this file"], ["Delete file…", "Deleting this file"], ["New folder…", "Creating a folder"]]) {
      await dismissOf(page)();
      const entry = await fileMenu(page, item);
      assert.equal(await entry.isDisabled(), false, item + " stays available");
      await entry.click(); await explained(page, needsWriter(action, brain), item);
      assert.equal(await page.locator("#folder-explorer-edit").evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator("#delete-note-dialog[open], #delete-dialog[open]").count(), 0);
    }
    assert.equal(await (await fileMenu(page, "Copy link to file")).isDisabled(), false, "reading actions are untouched");
    await page.keyboard.press("Escape");
    await dismissOf(page)(); await page.locator('#folder-explorer-tree [data-file-path="notes/shared-plan.md"]').focus(); await page.keyboard.press("F2");
    assert.equal((await toastOf(page)()).text, needsWriter("Renaming this file", brain));
    await dismissOf(page)();
    assert.deepEqual(await dragStart(page, '#folder-explorer-tree [data-file-path="notes/shared-plan.md"]'), { draggable: true, prevented: true });
    assert.equal((await toastOf(page)()).text, needsWriter("Moving this file", brain));
    await page.locator("#folder-explorer-close").click();

    // Note attention from the sidebar.
    const row = action => page.locator(`#sidebar-recent [data-page-action="${noteId}:${action}"]`);
    await row("settle").waitFor({ state: "attached" });
    assert.equal(await row("settle").isDisabled(), false, "Settle stays available");
    await explains(page, () => row("settle").click({ force: true }), needsWriter("Settling this note", brain));
    await explains(page, () => row("snooze").click({ force: true }), needsWriter("Snoozing this note", brain));
    assert.equal(await page.locator("#note-snooze").evaluate(dialog => dialog.open), false, "no snooze menu opens");

    // Formatting an open note; typing and deleting were already covered by the role smoke.
    await openNote();
    assert.notEqual(await page.locator("#note-editor").getAttribute("contenteditable"), "true");
    // A task checkbox is part of the text: pressing it explains like typing does.
    await explains(page, () => page.locator("#note-editor [data-task-toggle]").first().click({ force: true }), needsWriter("Editing this note", brain));
    assert.equal(await page.locator("#toggle-note-format").isVisible(), true, "Format stays visible");
    await page.locator("#toggle-note-format").click(); await page.locator("#format-controls").waitFor({ state: "visible" });
    for (const format of ["h1", "bold", "task"]) {
      assert.equal(await page.locator(`#format-controls [data-format="${format}"]`).isDisabled(), false, format + " stays available");
      await explains(page, () => page.locator(`#format-controls [data-format="${format}"]`).click(), needsWriter("Formatting this note", brain), format);
    }
    assert.equal(await page.locator("#note-editor-hint").isHidden(), true);
    await explains(page, () => page.locator("#delete-note").click(), needsWriter("Deleting this note", brain));
    assert.equal(await page.locator("dialog[open]").count(), 0, "no dialog opens for a refused change");
    await explains(page, () => page.locator("#new-note").click(), needsWriter("Creating a note", brain));
    // Reindex lives in the search dialog, where the toast is out of reach: the dialog carries the explanation.
    // The control only appears while search is out of date; this fixture has no index at all, so show it as that state would.
    await dismissOf(page)(); await page.keyboard.press("Meta+k"); await page.locator("#note-search-input").fill("Shared");
    await page.waitForFunction(() => ["ready", "error"].includes(noteSearch.state.status));
    await page.evaluate(() => { noteSearch.state.stale = true; renderNoteSearch(noteSearch.state); });
    await page.locator("#search-refresh-index").waitFor({ state: "visible" });
    assert.equal(await page.locator("#search-refresh-index").isDisabled(), false, "Reindex stays available");
    await page.locator("#search-refresh-index").click();
    assert.equal(await page.locator("#search-message").textContent(), needsWriter("Reindexing", brain) + (brain ? " See Settings → Access keys." : " See Connection settings → Access keys."));
    await page.keyboard.press("Escape");
    await explained(page, needsWriter("Reindexing", brain));
  };

  // A key's role is fixed; the server's own access file is the one place it can be changed
  // under a running page. The server re-reads it for every request.
  const downgrade = async id => {
    const file = path.join(roots.remote, ".jumpybrain", "access.json"), state = JSON.parse(await readFile(file, "utf8"));
    state.credentials.find(item => item.id === id).role = "reader"; state.generation++;
    await writeFile(file + ".next", JSON.stringify(state, null, 2) + "\n", { mode: 0o600 }); await rename(file + ".next", file);
  };

  // ---- Mac app, reader key ----
  const app = await context.newPage();
  const appChanges = changesOf(app);
  const ready = generation => app.waitForFunction(expected => typeof companionState !== "undefined" && companionRegistered && !companionFrozen && companionState?.phase === "idle" && (expected === null || companionState.generation === expected), generation ?? null);
  const openAppNote = async () => { await app.goto(`${gateway.url}/?note=${noteId}&brain=${remoteId}`); await ready(); await app.locator("#note-editor").waitFor({ state: "visible" }); await app.waitForFunction(() => state.editor?.state.loaded && state.editor.state.liveHasOpened); };
  const openBoard = async () => { await app.goto(`${gateway.url}/?board=${boardId}&brain=${remoteId}`); await ready(); await app.locator(`.board-card[data-board-page="${noteId}"]`).waitFor(); await app.waitForFunction(() => !document.querySelector(".board-card button").disabled); };
  const useKey = async token => {
    const before = gateway.state().generation;
    await native("/companion/profiles", { profile: { id: remoteId, name: "Team brain", kind: "remote", url: remote.url, key: token }, revision: gateway.state().revision });
    assert.notEqual(gateway.state().generation, before);
    await ready(gateway.state().generation);
  };
  const before = await remoteState();

  await check("app, reader: folder, attention and formatting controls stay available and explain themselves", async () => {
    await app.goto(`${gateway.url}/?brain=${remoteId}#companion=${controlKey}`); await ready();
    assert.equal(await app.evaluate(() => companionState.access.role), "reader");
    await readerAttempts(app, "Team brain", openAppNote);
    await shot(app, "app-reader-format");
    assert.equal(await app.locator("#companion-access-notice").isHidden(), true, "no access banner in the workspace");
    assert.doesNotMatch(await app.locator("#companion-active").textContent(), /read only|reader/i, "no role label beside the brain");
  });
  await check("app, reader: board cards, columns, the sidebar and Settings → Boards explain every change", async () => {
    await openBoard();
    const card = app.locator(`.board-card[data-board-page="${noteId}"]`);
    await explains(app, () => card.getByRole("button", { name: "Remove from board" }).click({ force: true }), needsWriter("Changing this board", "Team brain"));
    await explains(app, () => app.locator(`.board-card[data-board-page="${otherId}"]`).getByRole("button", { name: "Move up" }).click({ force: true }), needsWriter("Changing this board", "Team brain"));
    await explains(app, () => card.locator("button").first().press("Alt+ArrowRight"), needsWriter("Moving this card", "Team brain"));
    await dismissOf(app)();
    assert.deepEqual(await dragStart(app, `.board-card[data-board-page="${noteId}"]`), { draggable: true, prevented: true });
    assert.equal((await toastOf(app)()).text, needsWriter("Moving this card", "Team brain"));
    await explains(app, () => app.locator("#board-title .board-title-button").click(), needsWriter("Renaming this board", "Team brain"));
    await explains(app, () => app.locator(".board-column h2 .board-title-button").first().click(), needsWriter("Renaming this column", "Team brain"));
    assert.equal(await app.locator(".board-rename-input").count(), 0, "no rename field opens");
    await explains(app, () => app.locator(".board-add").first().click(), needsWriter("Adding a note to this board", "Team brain"));
    assert.equal(await app.locator(".board-composer").count(), 0, "no composer opens");
    await shot(app, "app-reader-board");
    await explains(app, () => app.locator("#sidebar-boards .board-nav-settle").first().click({ force: true }), needsWriter("Changing this board", "Team brain"));
    await explains(app, () => app.locator("#new-board").click(), needsWriter("Creating a board", "Team brain"));
    // A card still opens its note, and the note offers the board action.
    await card.locator("button").first().click();
    await app.waitForFunction(() => state.view === "note" && state.editor?.state.loaded);
    await explains(app, () => app.locator("#note-add-to-board").click(), needsWriter("Adding this note to a board", "Team brain"));
    assert.equal(await app.locator("#note-board-dialog").evaluate(dialog => dialog.open), false);
    await app.goto(`${gateway.url}/settings?section=boards&brain=${remoteId}`); await ready();
    const settingsRow = app.locator(`#settings-boards-list [data-board-id="${boardId}"]`); await settingsRow.waitFor();
    for (const name of ["Rename Launch", "Settle Launch", "Delete Launch"]) {
      assert.equal(await settingsRow.getByRole("button", { name }).isDisabled(), false, name + " stays available");
      await explains(app, () => settingsRow.getByRole("button", { name }).click(), needsWriter("Changing this board", "Team brain"), name);
      assert.equal(await settingsRow.getAttribute("data-mode"), "view", name + " opens nothing");
    }
    assert.equal(await settingsRow.locator("[type=checkbox]").isDisabled(), false, "the personal sidebar preference is not a change to the brain");
  });
  await check("app, reader: deleting or renaming a drawing and creating a page from the map explain themselves", async () => {
    await app.goto(`${gateway.url}/?drawing=Sketch&brain=${remoteId}`); await ready();
    await app.waitForFunction(() => window.__jumpyBrainDrawingReady === true);
    assert.equal(await app.locator("#drawing-delete").isDisabled(), false, "Delete drawing stays available");
    await explains(app, () => app.locator("#drawing-delete").click(), needsWriter("Deleting this drawing", "Team brain"));
    assert.equal(await app.locator("dialog[open]").count(), 0, "no delete dialog opens");
    await explains(app, async () => { await app.locator("#drawing-name").focus(); await app.keyboard.type("x"); }, needsWriter("Renaming this drawing", "Team brain"));
    assert.equal(await app.locator("#drawing-name").inputValue(), "Sketch");
    await app.goto(`${gateway.url}/graph?brain=${remoteId}`); await ready();
    await app.getByTestId("graph-ready").waitFor({ state: "visible" });
    await app.locator('g[data-node-id="unresolved:missing topic"]').focus(); await app.keyboard.press("Enter");
    await app.locator("#graph-topic").waitFor({ state: "visible" });
    assert.equal(await app.locator("#graph-topic-create").isVisible(), true, "Create page stays visible");
    // Inside a modal dialog the toast is out of reach: the dialog itself carries the explanation.
    await app.locator("#graph-topic-create").click();
    assert.equal(await app.locator("#graph-topic-status").textContent(), needsWriter("Creating this page", "Team brain") + " See Settings → Access keys.");
    await app.locator("#graph-topic-close").click();
    await explained(app, needsWriter("Creating this page", "Team brain"));
  });
  await check("app, reader: the explanation's action opens Settings → Access keys; nothing reached the server", async () => {
    await openAppNote();
    await explains(app, () => app.locator("#new-note").click(), needsWriter("Creating a note", "Team brain"));
    await app.locator("#toast-action").click();
    await app.waitForFunction(() => state.view === "settings" && document.body.dataset.settingsPage === "access" && /^Reader · key “Bob”/.test(document.getElementById("access-effective-summary").textContent));
    assert.equal(await app.locator("#app-toast").isHidden(), true, "using the action dismisses the explanation");
    await shot(app, "app-reader-settings");
    assert.deepEqual(appChanges, [], "no change request left the page");
    assert.equal(await remoteState(), before);
  });
  await check("app, reader: frozen and busy states keep plain disabled controls with no explanation", async () => {
    await openAppNote(); await openFolders(app); await dismissOf(app)();
    const frozen = await app.evaluate(() => {
      // A brain switch in progress, as every tab sees it; the next poll restores the session.
      companionLock(true);
      const result = { newNote: document.getElementById("new-note").disabled, newFolder: document.getElementById("folder-explorer-new").disabled,
        deleteNote: document.getElementById("delete-note").disabled, format: [...document.querySelectorAll("#format-controls button")].every(button => button.disabled),
        attention: [...document.querySelectorAll("#sidebar-recent [data-attention-action]")].every(button => button.disabled),
        offered: accessOffered(), denied: accessDenied("Creating a note"), toast: !document.getElementById("app-toast").hidden };
      companionLock(false);
      return result;
    });
    assert.deepEqual(frozen, { newNote: true, newFolder: true, deleteNote: true, format: true, attention: true, offered: false, denied: true, toast: false });
    // The folder panel closes itself while frozen; once the session is usable the restriction is offered again.
    await openFolders(app);
    assert.equal(await app.locator("#folder-explorer-new").isDisabled(), false);
    assert.equal(await app.locator("#new-note").isDisabled(), false);
    await app.locator("#folder-explorer-close").click();
  });

  // ---- Mac app, writer and admin keys: the same controls change the brain ----
  await check("app, writer: the same folder, formatting, attention and board controls work", async () => {
    await useKey(wren.token);
    assert.deepEqual(await app.evaluate(() => companionState.access.capabilities), ["read", "write"]);
    await openAppNote(); await dismissOf(app)();
    await openFolders(app);
    await app.locator("#folder-explorer-new").click(); await app.locator("#folder-explorer-edit[open]").waitFor();
    await app.locator("#folder-explorer-name").fill("writer-made"); await app.locator("#folder-explorer-save").click();
    await until(async () => (await readdir(path.join(roots.remote, "notes"))).includes("writer-made"), "the writer's folder on the server");
    await app.locator("#folder-explorer-close").click();
    assert.equal(await app.locator("#note-editor").getAttribute("contenteditable"), "true");
    await app.locator("#note-editor").click(); await app.keyboard.press("Meta+ArrowUp");
    await app.locator("#toggle-note-format").click(); await app.locator('#format-controls [data-format="h2"]').click();
    await until(async () => /^## Original line/m.test(await readFile(noteFile, "utf8")), "the formatted line on the server");
    await app.locator(`#sidebar-recent [data-page-action="${otherId}:settle"]`).click({ force: true });
    await until(async () => /attention_at: null/.test(await readFile(path.join(roots.remote, "notes", "second-note.md"), "utf8")), "the settled note on the server");
    await openBoard();
    await app.locator(`.board-card[data-board-page="${otherId}"]`).getByRole("button", { name: "Remove from board" }).click({ force: true });
    await until(async () => !JSON.stringify(await (await server("/memories/all/boards")).json()).includes(otherId), "the card removed on the server");
    assert.equal(await app.locator("#app-toast").isVisible() && /writer or admin key|paused/.test(await app.locator("#toast-message").textContent()), false, "a writer is never shown the restriction");
  });
  await check("app, admin: board renaming and folders work; no restriction is shown", async () => {
    await useKey(ada.token);
    await openBoard();
    await app.locator("#board-title .board-title-button").click();
    await app.locator(".board-rename-input").fill("Launch plan"); await app.keyboard.press("Enter");
    await until(async () => JSON.stringify(await (await server("/memories/all/boards")).json()).includes("Launch plan"), "the renamed board on the server");
    await openFolders(app);
    await app.locator("#folder-explorer-new").click(); await app.locator("#folder-explorer-edit[open]").waitFor();
    await app.locator("#folder-explorer-name").fill("admin-made"); await app.locator("#folder-explorer-save").click();
    await until(async () => (await readdir(path.join(roots.remote, "notes"))).includes("admin-made"), "the admin's folder on the server");
    assert.equal(await app.locator("#app-toast").isVisible() && /writer or admin key|paused/.test(await app.locator("#toast-message").textContent()), false);
  });

  // ---- Mac app: the role is lost on the server while the app shows the old one ----
  await check("app, role lost: the refused change is explained without a false role, the connection stays, Settings shows the server's answer", async () => {
    const ivo = await issue("Ivo", "writer");
    await useKey(ivo.token);
    // On Home, so no editing session is open that the server could close first.
    await app.goto(`${gateway.url}/?brain=${remoteId}`); await ready(); await dismissOf(app)(); await openFolders(app);
    assert.equal(await app.evaluate(() => companionState.access.role), "writer");
    const unchanged = (await readdir(path.join(roots.remote, "notes"))).sort();
    appChanges.length = 0;
    await downgrade(ivo.id);
    // No app shell polls here: the page has only what it was told before the change.
    await app.locator("#folder-explorer-new").click(); await app.locator("#folder-explorer-edit[open]").waitFor();
    await app.locator("#folder-explorer-name").fill("after-downgrade"); await app.locator("#folder-explorer-save").click();
    // The gateway may still remember the old role for a short while, so the text claims no role.
    await explainedBehind(app, /^This change needs a writer or admin key\. (The server refused it for your current key\.|Your key for “Team brain” has reader access\.)$/);
    assert.match(await app.locator("#folder-explorer-edit-error").textContent(), /reader access/);
    assert.deepEqual(appChanges, ["POST /memories/all/files/operations"]);
    assert.deepEqual((await readdir(path.join(roots.remote, "notes"))).sort(), unchanged);
    assert.equal(await app.locator("#companion-active").getAttribute("data-state"), "connected", "a refusal over the role is not shown as a lost connection");
    await shot(app, "app-downgrade-refused");
    await app.locator("#folder-explorer-cancel").click(); await app.locator("#folder-explorer-close").click();
    await app.locator("#toast-action").click();
    await app.waitForFunction(() => state.view === "settings" && document.body.dataset.settingsPage === "access" && /^Reader · key “Ivo”/.test(document.getElementById("access-effective-summary").textContent));
    // The key is then revoked. Refused requests make the page ask the app to re-check (spaced a few
    // seconds apart); no app shell poll and no reload is involved.
    await app.goto(`${gateway.url}/?brain=${remoteId}`); await ready();
    assert.deepEqual(await (await server("/access/" + ivo.id, "DELETE")).json(), { revoked: true });
    await until(async () => app.evaluate(async () => {
      await graphJson("/memories/all/files/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-folder", path: "notes/after-revoke" }) }).catch(() => {});
      return companionState.access?.role === null && companionState.access.reason === "authentication_failed";
    }).then(async done => done || (await pause(700), false)), "the app to notice the rejected key", 20000);
    await app.locator("#companion-access-notice").waitFor({ state: "visible" });
    await dismissOf(app)(); await app.locator("#new-note").click();
    await explainedBehind(app, /^Creating a note is paused: the app could not confirm what your access key may do on “Team brain”\.$/);
    assert.deepEqual((await readdir(path.join(roots.remote, "notes"))).sort(), unchanged);
  });

  // ---- Hosted browser ----
  const hosted = await context.newPage();
  const hostedChanges = changesOf(hosted);
  // Signed in as that key, with its role read: the previous key's state must not satisfy this.
  const connectAs = async key => {
    await hosted.locator("#open-connection").click(); await hosted.locator("#api-key").fill(key.token); await hosted.locator("#connection-submit").click();
    await hosted.waitForFunction(id => connectionStatus === "connected" && activeApiKey === "browser-session" && hostedPrincipalId === id && hostedAccess !== null, key.id);
  };
  const openHostedNote = async () => { await hosted.goto(`${remote.url}/?note=${noteId}`); await hosted.locator("#note-editor").waitFor({ state: "visible" }); await hosted.waitForFunction(() => state.editor?.state.loaded && state.editor.state.liveHasOpened && hostedAccess !== null); };
  await check("hosted, reader: the same controls explain themselves; Settings is the Access keys dialog", async () => {
    await hosted.goto(remote.url + "/"); await hosted.waitForFunction(() => typeof connectionStatus !== "undefined");
    await connectAs(bob);
    assert.deepEqual(await hosted.evaluate(() => hostedAccess), { role: "reader", capabilities: ["read"] });
    const unchanged = await remoteState();
    await readerAttempts(hosted, "", openHostedNote);
    await shot(hosted, "hosted-reader-format");
    assert.equal(await hosted.evaluate(() => connectionStatus), "connected");
    assert.deepEqual(hostedChanges, [], "no change request left the page");
    assert.equal(await remoteState(), unchanged);
    // The action opens the access details above the note, which stays as it was.
    await hosted.locator("#toast-action").click();
    await hosted.locator("#access-keys-dialog[open]").waitFor();
    await hosted.waitForFunction(() => /^Reader · key “Bob”/.test(document.getElementById("access-effective-summary").textContent));
    assert.equal(await hosted.locator("#app-toast").isHidden(), true);
    assert.equal(await hosted.evaluate(() => state.view === "note" && state.editor.state.loaded), true);
    await shot(hosted, "hosted-reader-settings");
    await hosted.locator("#access-keys-close").click();
  });
  await check("hosted, writer and admin: folders and formatting work with no explanation", async () => {
    for (const [key, name] of [[wren, "hosted-writer-made"], [ada, "hosted-admin-made"]]) {
      await connectAs(key); await openHostedNote(); await dismissOf(hosted)();
      await openFolders(hosted);
      await hosted.locator("#folder-explorer-new").click(); await hosted.locator("#folder-explorer-edit[open]").waitFor();
      await hosted.locator("#folder-explorer-name").fill(name); await hosted.locator("#folder-explorer-save").click();
      await until(async () => (await readdir(path.join(roots.remote, "notes"))).includes(name), name + " on the server");
      await hosted.locator("#folder-explorer-close").click();
      assert.equal(await hosted.locator("#app-toast").isVisible() && /writer or admin key|paused/.test(await hosted.locator("#toast-message").textContent()), false);
    }
    assert.equal(await hosted.locator("#note-editor").getAttribute("contenteditable"), "true");
  });

  // ---- A role lost on the server while the hosted page is open ----
  await check("hosted, role lost: the refused change is explained, the connection stays and the role is re-read", async () => {
    await connectAs(hana);
    // On Home, so no editing session is open that the server could close first.
    await hosted.goto(remote.url + "/"); await hosted.waitForFunction(() => typeof hostedAccess !== "undefined" && hostedAccess?.role === "writer");
    await dismissOf(hosted)(); await openFolders(hosted);
    hostedChanges.length = 0;
    await downgrade(hana.id);
    assert.equal((await (await server("/capabilities", "GET", undefined, hana.token)).json()).principal.role, "reader", "the server now reports a reader");
    // The page still believes it may write: the dialog opens, and the server refuses the request.
    const unchanged = (await readdir(path.join(roots.remote, "notes"))).sort();
    await hosted.locator("#folder-explorer-new").click(); await hosted.locator("#folder-explorer-edit[open]").waitFor();
    await hosted.locator("#folder-explorer-name").fill("after-downgrade"); await hosted.locator("#folder-explorer-save").click();
    await explainedBehind(hosted, /^This change needs a writer or admin key\. Your key has reader access\.$/);
    assert.match(await hosted.locator("#folder-explorer-edit-error").textContent(), /reader access/);
    assert.deepEqual(hostedChanges, ["POST /memories/all/files/operations"], "one attempt, refused by the server");
    assert.deepEqual((await readdir(path.join(roots.remote, "notes"))).sort(), unchanged);
    assert.equal(await hosted.evaluate(() => connectionStatus), "connected", "a refusal over the role is not a lost connection");
    assert.deepEqual(await hosted.evaluate(() => hostedAccess), { role: "reader", capabilities: ["read"] }, "the role was re-read");
    await shot(hosted, "hosted-downgrade-refused");
    await hosted.locator("#folder-explorer-cancel").click();
    // From now on the page stops the change itself.
    await explains(hosted, () => hosted.locator("#folder-explorer-new").click(), needsWriter("Creating a folder", ""));
    assert.equal(hostedChanges.length, 1);
    await hosted.locator("#toast-action").click();
    await hosted.locator("#access-keys-dialog[open]").waitFor();
    await hosted.waitForFunction(() => /^Reader · key “Hana”/.test(document.getElementById("access-effective-summary").textContent));
    await hosted.locator("#access-keys-close").click();
  });
  await check("hosted, role lost while typing: nothing reaches the server, the text stays, and Access keys re-reads the role without touching the note", async () => {
    const juno = await issue("Juno", "writer");
    await connectAs(juno); await openHostedNote(); await dismissOf(hosted)();
    await hosted.locator("#note-editor").click(); await hosted.keyboard.press("Meta+ArrowDown"); await hosted.keyboard.type(" Juno wrote this.");
    await until(async () => (await readFile(noteFile, "utf8")).includes("Juno wrote this."), "the writer's text on the server");
    await hosted.evaluate(() => { window.smokeSamePage = true; });
    await downgrade(juno.id);
    // The server may close the editing session at once or refuse the next edit; either way nothing typed is lost.
    const typed = await hosted.evaluate(() => document.getElementById("note-editor").isContentEditable);
    if (typed) {
      await hosted.locator("#note-editor").click(); await hosted.keyboard.press("Meta+ArrowDown"); await hosted.keyboard.type(" Typed after the downgrade.");
      await pause(2500);
    }
    assert.doesNotMatch(await readFile(noteFile, "utf8"), /Typed after the downgrade/, "the server accepted nothing from the downgraded key");
    const kept = await hosted.evaluate(() => ({ text: document.getElementById("note-editor").textContent, pending: state.editor.hasPending(), recover: !document.getElementById("note-recover").hidden }));
    if (/Typed after the downgrade\./.test(kept.text)) assert.deepEqual([kept.pending, kept.recover], [true, true], "typed text is kept as a draft with Recover offered");
    assert.match(kept.text, /Juno wrote this\./);
    // Access keys, opened the ordinary way, re-reads the role above the note.
    await dismissOf(hosted)();
    await hosted.locator("#open-connection").click(); await hosted.locator("#open-access-keys").click();
    await hosted.locator("#access-keys-dialog[open]").waitFor();
    await hosted.waitForFunction(() => /^Reader · key “Juno”/.test(document.getElementById("access-effective-summary").textContent) && hostedAccess?.role === "reader");
    await shot(hosted, "hosted-downgrade-access-keys");
    await hosted.locator("#access-keys-close").click();
    const after = await hosted.evaluate(() => ({ same: window.smokeSamePage === true, view: state.view, text: document.getElementById("note-editor").textContent, pending: state.editor.hasPending() }));
    assert.equal(after.same, true, "the page was not reloaded"); assert.equal(after.view, "note");
    assert.equal(after.text, kept.text, "the note and any draft are as they were"); assert.equal(after.pending, kept.pending);
    assert.equal(await hosted.evaluate(() => connectionStatus), "connected");
  });
  assert.deepEqual(errors, [], "page errors");
  console.log("PASS: blocked changes stay visible and explain themselves with a Settings action in the app and the hosted browser.");
} catch (error) {
  console.error("FAIL at: " + stage); console.error(error); if (errors.length) console.error("page errors:", errors); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await gateway?.close().catch(() => {}); await remote?.close().catch(() => {});
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
