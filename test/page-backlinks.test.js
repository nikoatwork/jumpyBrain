import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeMemoryRoot, memoryDocumentBacklinks } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { installPageBacklinks } from "../dist/adapters/http-server/page-backlinks.js";

const id = n => `mem_b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const note = (n, title, body) => `---\nid: ${id(n)}\ntitle: ${title}\n---\n${body}\n`;

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-backlinks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeMemoryRoot(root);
  return { root, write: async (file, content) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), content); } };
}

test("backlinks resolve links written before the page existed, aliases, case and relative links", async t => {
  const { root, write } = await fixture(t);
  // Logseq-style imports reference a page that does not exist yet.
  await write("sessions/2024_01_02.md", note(1, "Jan 2nd, 2024", "- Met about [[Project P]] today\n- unrelated line"));
  await write("notes/ideas.md", note(2, "Ideas", "See [[project p|the project]] and [[Project P#Goals]].\nAlso [[PROJECT P]]."));
  await write("notes/deep/ref.md", note(3, "Relative ref", "Path link [details](../../pages/project-p.md) here."));
  await write("notes/other.md", note(4, "Other", "Links to [[Ideas]] only, and https://example.com/[x]"));
  await write("notes/legacy.md", "# Legacy without id\n\n[[Project P]] mention\n");
  await assert.rejects(memoryDocumentBacklinks(root, id(9)), error => error.code === "missing_id");

  // The page is created later; nothing rewrites the older notes.
  await write("pages/project-p.md", note(9, "Project P", "Self [[Project P]] and [link](project-p.md)."));
  const result = await memoryDocumentBacklinks(root, id(9));
  assert.equal(result.file, "pages/project-p.md");
  assert.equal(result.title, "Project P");
  assert.equal(result.count, 4, "self-link and unrelated notes are excluded");
  assert.equal(result.links, 1 + 3 + 1 + 1);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.backlinks.map(link => [link.title, link.id, link.count]), [
    ["Ideas", id(2), 3],
    ["Jan 2nd, 2024", id(1), 1],
    ["legacy", undefined, 1],
    ["Relative ref", id(3), 1],
  ]);
  const byTitle = Object.fromEntries(result.backlinks.map(link => [link.title, link]));
  assert.equal(byTitle["Jan 2nd, 2024"].snippet, "Met about [[Project P]] today");
  assert.equal(byTitle.Ideas.snippet, "See [[project p|the project]] and [[Project P#Goals]].");
  assert.deepEqual(byTitle["Relative ref"].kinds, ["markdown-link"]);
  assert.equal(byTitle["Relative ref"].snippet, "Path link [details](../../pages/project-p.md) here.");
  assert.equal("id" in byTitle.legacy, false, "ID-less sources are listed but not addressable");
});

test("backlinks exclude deleted notes, bound records and long snippets", async t => {
  const { root, write } = await fixture(t);
  await write("pages/hub.md", note(1, "Hub", "Hub page"));
  const long = "word ".repeat(80) + "[[Hub]]" + " tail".repeat(80);
  for (let n = 2; n < 6; n++) await write(`notes/n${n}.md`, note(n, `Note ${n}`, n === 2 ? long : `- [[hub]]`));
  const limited = await memoryDocumentBacklinks(root, id(1), { limit: 2 });
  assert.equal(limited.count, 4);
  assert.equal(limited.backlinks.length, 2);
  assert.equal(limited.truncated, true);
  const snippet = limited.backlinks[0].snippet;
  assert.match(snippet, /^….*\[\[Hub\]\].*…$/);
  assert.ok(snippet.length <= 162);
  await rm(path.join(root, "notes/n3.md"));
  const after = await memoryDocumentBacklinks(root, id(1));
  assert.deepEqual(after.backlinks.map(link => link.file), ["notes/n2.md", "notes/n4.md", "notes/n5.md"]);
  await assert.rejects(memoryDocumentBacklinks(root, "not-an-id"), error => error.code === "invalid_id");
  await write("notes/dupe.md", note(1, "Hub copy", "dupe"));
  await assert.rejects(memoryDocumentBacklinks(root, id(1)), error => error.code === "duplicate_id");
});

test("hosted document route returns a remote-safe backlink packet", async t => {
  const { root, write } = await fixture(t);
  await write("pages/p.md", note(1, "P", "Page"));
  await write("notes/a.md", note(2, "A", "About [[P]]."));
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["fixture"], port: 0, autoIndex: false });
  t.after(() => server.close());
  const get = suffix => fetch(server.url + "/memories/all/documents/" + suffix, { headers: { Authorization: "Bearer fixture" } });
  const response = await get(id(1) + "?backlinks=1");
  assert.equal(response.status, 200);
  const packet = await response.json();
  assert.equal(packet.root, "remote:all");
  assert.equal(packet.target, "remote");
  assert.equal(packet.count, 1);
  assert.deepEqual(packet.backlinks, [{ id: id(2), file: "notes/a.md", title: "A", count: 1, kinds: ["wiki-link"], snippet: "About [[P]]." }]);
  assert.equal(JSON.stringify(packet).includes(root), false, "no local root leaks");
  const missing = await get(id(7) + "?backlinks=1");
  assert.equal(missing.status, 404); await missing.body?.cancel();
  const unauthenticated = await fetch(server.url + "/memories/all/documents/" + id(1) + "?backlinks=1");
  assert.equal(unauthenticated.status, 401); await unauthenticated.body?.cancel();
});

function uiHarness() {
  let focused = null;
  class Node extends EventTarget {
    hidden = true; children = []; attributes = {}; textContent = ""; className = ""; tabIndex = 0;
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return name === "href" ? this.href : this.attributes[name]; }
    get firstElementChild() { return this.children[0] ?? null; }
    focus() { focused = this; }
  }
  const elements = Object.fromEntries(["", "-list", "-more", "-count", "-limited"].map(suffix => [`page-backlinks${suffix}`, new Node()]));
  const win = Object.assign(new EventTarget(), { setTimeout: () => 0, clearTimeout() {} });
  const document = Object.assign(new EventTarget(), { defaultView: win, hidden: false, getElementById: name => elements[name], createElement: tag => Object.assign(new Node(), { tag }) });
  let scope = "a", enabled = true, changed = 0;
  const editor = { state: { loaded: true, cancelled: false, documentId: id(1), savedTitle: "P" } };
  const calls = [], navigation = [];
  const controller = installPageBacklinks({ document, editor: () => editor, scope: () => scope, enabled: () => enabled,
    load(docId, signal) { return new Promise((resolve, reject) => calls.push({ docId, signal, resolve, reject })); },
    href: docId => "/?note=" + docId, navigate: url => navigation.push(url), changed: () => changed++ });
  return { controller, editor, calls, navigation, elements, win, panel: elements["page-backlinks"], list: elements["page-backlinks-list"],
    more: elements["page-backlinks-more"], focused: () => focused, changed: () => changed, scope(value) { scope = value; }, enabled(value) { enabled = value; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const packet = (n, extra = {}) => ({ id: id(1), count: n, truncated: false, backlinks: Array.from({ length: n }, (_, i) => ({ id: id(10 + i), file: `notes/${i}.md`, title: `Source ${i}`, count: 1, kinds: ["wiki-link"], snippet: `about [[P]] ${i}` })), ...extra });

test("Linked from lists titles and snippets, expands, and navigates through the host guard", async () => {
  const h = uiHarness(); h.controller.sync();
  assert.equal(h.calls[0].docId, id(1));
  assert.equal(h.panel.hidden, true);
  h.calls[0].resolve(packet(7)); await settle();
  assert.equal(h.panel.hidden, false);
  assert.equal(h.elements["page-backlinks-count"].textContent, "7");
  assert.equal(h.list.children.length, 5);
  const row = h.list.children[0].children[0];
  assert.deepEqual(row.children.map(part => [part.className, part.textContent]), [["page-backlink-title", "Source 0"], ["page-backlink-snippet", "about [[P]] 0"]]);
  assert.equal(h.controller.has(id(10)), true);
  assert.equal(h.more.hidden, false); assert.equal(h.more.textContent, "Show all 7");
  h.more.dispatchEvent(new Event("click"));
  assert.equal(h.list.children.length, 7); assert.equal(h.more.hidden, true);
  assert.equal(h.focused(), h.list.children[5].children[0], "focus moves to the first revealed note");
  const shown = h.list.children[0].children[0];
  const click = Object.assign(new Event("click", { cancelable: true }), { button: 0 });
  shown.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(h.navigation, ["/?note=" + id(10)]);
  const modified = Object.assign(new Event("click", { cancelable: true }), { button: 0, metaKey: true });
  shown.dispatchEvent(modified);
  assert.equal(modified.defaultPrevented, false, "new-tab navigation stays native");
  assert.ok(h.changed() > 0, "Related pages can drop duplicates");
});

test("Linked from ignores old-server, foreign, late and failed responses and refreshes on rename", async () => {
  const h = uiHarness(); h.controller.sync();
  // A server without backlinks support ignores the parameter and returns the plain document read.
  h.calls[0].resolve({ id: id(1), content: "x" }); await settle();
  assert.equal(h.panel.hidden, true);
  h.editor.state.savedTitle = "Q"; h.controller.sync();
  assert.equal(h.calls.length, 2, "a rename reloads title links");
  h.calls[1].resolve({ ...packet(2), id: id(9) }); await settle();
  assert.equal(h.panel.hidden, true, "another page's packet is rejected");
  h.editor.state.documentId = id(2); h.controller.sync();
  assert.equal(h.calls[2].docId, id(2));
  h.scope("b"); h.controller.sync();
  assert.equal(h.calls[2].signal.aborted, true);
  h.calls[2].resolve({ ...packet(2), id: id(2) }); await settle();
  assert.equal(h.panel.hidden, true, "late results cannot cross brain scope");
  h.calls[3].resolve({ id: id(2), count: 1, backlinks: [{ title: "No id", file: "notes/x.md", count: 1 }, { id: id(2), title: "Self", file: "pages/p.md" }] }); await settle();
  assert.equal(h.list.children.length, 2);
  const [legacy, self] = h.list.children.map(item => item.children[0]);
  assert.equal(legacy.tag, "span"); assert.equal(legacy.attributes["aria-disabled"], "true");
  assert.equal(self.tag, "span", "a self reference is never offered as navigation");
  h.editor.state.savedTitle = "R"; h.controller.sync();
  h.calls[4].reject(new Error("offline")); await settle();
  assert.equal(h.list.children.length, 2, "failures keep the last useful list");
  h.enabled(false); h.controller.sync();
  assert.equal(h.panel.hidden, true);
  h.enabled(true); h.controller.sync(); h.win.dispatchEvent(new Event("pagehide"));
  assert.equal(h.calls[5].signal.aborted, true); assert.equal(h.panel.hidden, true);
});
