import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm, chmod, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readablePreview, searchPreview, resultEditContext, appendSearchHighlight } from "../dist/adapters/http-server/search-presentation.js";
import { normalizeRecognitionOptions, recognitionDay, matchesRecognition } from "../dist/core/search-recognition.js";
import { normalizeMemoryActor, stampMemoryActor, currentMemoryEditor } from "../dist/core/contribution.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { mergeMemoryDocumentUpdate } from "../dist/core/document-update.js";
import { patchMemoryAttention } from "../dist/core/attention.js";
import { initializeMemoryRoot, rememberMemory, readMemoryDocument, updateMemoryDocument, indexMemory, searchMemory } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { createRemoteMemoryTransport } from "../dist/adapters/http-client/index.js";
import { createRecentWriteSearch } from "../dist/adapters/http-server/recent-write-search.js";
import { recognizeSearchResults } from "../dist/app/local-memory/search-recognition.js";
import { actorFromArgs, recognitionFromArgs } from "../dist/cli/recognition.js";
import { parseArgs } from "../dist/cli/args.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const execFileAsync = promisify(execFile);
const id = n => `mem_99000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const human = { kind: "human", id: "browser:person-a" }, agent = { kind: "agent", name: "Test agent" };
const source = (n = 1) => `---\nid: ${id(n)}\ntype: note\ntitle: Mistral ${n}\ncreated_at: 2026-10-01\nupdated_at: 2026-10-23T15:42:00Z\n---\n# Mistral ${n}\n\n## Current status\n- **Application:** Product manager, Studio.\n`;

test("readable previews remove structural Markdown while preserving names, code and plain text safety", () => {
  const original = source();
  assert.equal(readablePreview(original, "Mistral 1"), "Current status Application: Product manager, Studio.");
  assert.equal(readablePreview("# Title\n\n> - [x] Use **C#**, C++, #topic and foo_bar.\n\n[Docs](https://example.com) [[Page title]]", "Title"), "Use C#, C++, #topic and foo_bar. Docs Page title");
  assert.equal(readablePreview("```ts\nconst a = '#literal';\nconst b = '**literal**';\n```"), "const a = '#literal'; const b = '**literal**';");
  assert.equal(readablePreview("---\n\n[ref]: https://example.com\n\n***\n"), "");
  assert.equal(readablePreview("# Empty", "Empty"), "");
  assert.equal(searchPreview("# Empty", "Empty"), "No preview text");
  assert.equal(searchPreview("Unrelated heading", "Title", "application", "# Title\nApplication body"), "Application body");
  assert.equal(readablePreview("# Title ## Status - **Application**: Studio", "Title"), "Status - Application: Studio");
  assert.equal(readablePreview("-123 is negative; a_b and C# remain"), "-123 is negative; a_b and C# remain");
  assert.equal(readablePreview("_italic_ and *word* and `code`"), "italic and word and code");
  assert.equal(readablePreview("word ".repeat(100), "", 40).length <= 40, true);
  assert.match(readablePreview("word ".repeat(100), "", 40), /…$/);
  assert.equal(source(), original, "presentation never mutates canonical input");
  const nodes = [];
  const element = { ownerDocument: { createTextNode: text => ({ text }), createElement: type => ({ type }) }, append: node => nodes.push(node) };
  appendSearchHighlight(element, '<img src=x onerror="alert(1)"> C++', "C++");
  assert.deepEqual(nodes.filter(node => node.type).map(node => [node.type, node.textContent]), [["mark", "C++"]]);
  assert.equal(nodes.some(node => node.type === "img"), false);
});

test("editor attribution is revision-bound, protected on updates, and independent of attention", () => {
  const stored = stampMemoryActor(source(), human, true);
  assert.deepEqual(currentMemoryEditor(stored), human);
  assert.equal(parseFrontmatter(stored).frontmatter.creator_id, human.id);
  assert.equal(currentMemoryEditor(stored.replace("Product manager", "External change")), undefined);
  assert.equal(currentMemoryEditor(stored.replace("15:42:00", "15:43:00")), undefined);
  assert.deepEqual(currentMemoryEditor(patchMemoryAttention(stored, { action: "settle" })), human);
  const submitted = stored.replace("creator_id: \"browser:person-a\"", 'creator_id: "forged"').replace("Product manager", "Agent edit");
  const updated = mergeMemoryDocumentUpdate(stored, submitted, { actor: agent, updatedAt: "2026-10-24T10:00:00Z" });
  assert.deepEqual(currentMemoryEditor(updated.content), agent);
  assert.equal(updated.frontmatter.creator_id, human.id);
  assert.equal(updated.frontmatter.last_editor_kind, "agent");
  const unknown = mergeMemoryDocumentUpdate(updated.content, "Untracked CLI content").content;
  assert.equal(currentMemoryEditor(unknown), undefined);
  assert.equal(parseFrontmatter(unknown).frontmatter.creator_id, human.id);
  assert.equal(parseFrontmatter(mergeMemoryDocumentUpdate(source(), stored).content).frontmatter.creator_id, undefined, "submitted attribution cannot create historical identity");
  for (const input of [null, {}, { kind: "user" }, { kind: "human", id: "" }, { kind: "agent", name: "a\nb" }, { kind: "human", role: "admin" }]) assert.throws(() => normalizeMemoryActor(input), { code: "invalid_actor" });
});

test("strict calendar dates and local day filtering retain timezone/DST meaning", () => {
  for (const input of [{ from: "2026-02-30" }, { to: "2026-13-01" }, { from: "2026-10-24", to: "2026-10-23" }, { timeZone: "bogus" }, { editor: "you" }, { offset: -1 }, { sort: "newest" }]) assert.throws(() => normalizeRecognitionOptions(input), { code: "invalid_recognition" });
  assert.equal(recognitionDay("2026-10-24", "America/Los_Angeles"), "2026-10-24");
  assert.equal(recognitionDay("2026-10-24T00:30:00Z", "America/Los_Angeles"), "2026-10-23");
  assert.equal(recognitionDay("2026-10-25T01:30:00Z", "Europe/Berlin"), "2026-10-25");
  const filter = normalizeRecognitionOptions({ from: "2026-10-23", to: "2026-10-23", timeZone: "America/Los_Angeles", editor: "you", actorId: human.id });
  assert.equal(matchesRecognition({ updatedAt: "2026-10-24T00:30:00Z", editor: human }, filter), true);
  assert.equal(matchesRecognition({ updatedAt: "2026-10-23", editor: agent }, filter), false);
  assert.equal(matchesRecognition({ createdAt: "2026-10-23", editor: human }, filter), false, "creation does not become edit time");
  assert.equal(matchesRecognition({ updatedAt: "invalid", editor: human }, filter), false);
  const context = resultEditContext({ updatedAt: "2026-10-23", createdAt: "2026-10-01", editor: human }, human.id, new Date(2026, 9, 24, 12));
  assert.equal(context.label, "Edited Yesterday · You");
  assert.match(context.details, /Created 2026-10-01/);
  assert.equal(resultEditContext({ updatedAt: "2026-02-30" }).label, "Edit date unknown · Editor unknown");
});

test("CLI attribution and recognition options are explicit and compose with strict read-only flags", () => {
  assert.deepEqual(actorFromArgs(parseArgs(["remember", "--title", "Title", "--actor", "agent", "--actor-name", "Codex"])), { kind: "agent", name: "Codex" });
  assert.equal(actorFromArgs(parseArgs(["update", "--actor", "unknown"])), undefined);
  assert.throws(() => actorFromArgs(parseArgs(["update", "--actor-id", "a"])), /require/);
  const options = recognitionFromArgs(parseArgs(["search", "--query", "mistral", "--last-editor=human", "--edited-from", "2026-10-23", "--sort", "edited", "--offset", "24", "--read-only", "--json"]));
  assert.equal(options.editor, "human"); assert.equal(options.offset, 24); assert.equal(options.sort, "edited");
});

test("canonical app writes preserve no-ops and return current declared editors through HTTP", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-attribution-"));
  let server;
  try {
    await initializeMemoryRoot(root);
    const saved = await rememberMemory(root, { type: "note", title: "Mistral", body: "Human content", actor: human });
    let document = await readMemoryDocument(root, saved.id);
    assert.deepEqual(document.recognition.editor, human);
    const unchanged = await updateMemoryDocument(root, saved.id, document.content, { ifMatch: document.contentHash, actor: agent });
    assert.equal(unchanged.unchanged, true);
    assert.deepEqual(unchanged.recognition.editor, human);
    assert.equal((await readMemoryDocument(root, saved.id)).contentHash, document.contentHash);
    server = await startJumpyBrainHttpServer({ root, apiKeys: ["disposable-key"], port: 0, autoIndex: false });
    const response = await fetch(`${server.url}/memories/all/documents/${saved.id}`, { method: "PUT", headers: { Authorization: "Bearer disposable-key", "Content-Type": "application/json", "If-Match": document.contentHash }, body: JSON.stringify({ content: document.content.replace("Human content", "Agent content"), actor: agent }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).recognition.editor, agent);
    document = await readMemoryDocument(root, saved.id);
    assert.deepEqual(document.recognition.editor, agent);
    await writeFile(path.join(root, saved.file), document.content.replace("Agent content", "Outside app"));
    assert.equal((await readMemoryDocument(root, saved.id)).recognition.editor, undefined);
    const bad = await fetch(`${server.url}/memories/all/search`, { method: "POST", headers: { Authorization: "Bearer disposable-key", "Content-Type": "application/json" }, body: JSON.stringify({ query: "mistral", recognition: { from: "2026-02-30" } }) });
    assert.equal(bad.status, 400);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});

test("filters consider candidates beyond the first screen, page deterministically and match local/remote/CLI", { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-recognition-"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  let server;
  try {
    await initializeMemoryRoot(root);
    const rows = [];
    for (let n = 1; n <= 35; n++) {
      const file = `notes/mistral-${String(n).padStart(2, "0")}.md`;
      const content = stampMemoryActor(source(n), n > 30 ? human : agent, true);
      await writeFile(path.join(root, file), content);
      rows.push({ file, score: 1 - n / 100, snippet: `Mistral ${n} Application: Product manager, Studio.`, line: 14 });
    }
    const { bin } = await installFakeQmd(root);
    await writeFile(bin, `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='search'||args[0]==='query'){const c=args[args.indexOf('-c')+1];console.log(JSON.stringify(c==='jumpybrain'?${JSON.stringify(rows)}.map(r=>({...r,file:'qmd://'+c+'/'+r.file})):[]));}else console.log('[]');\n`);
    await chmod(bin, 0o755); process.env.JUMPYBRAIN_QMD_BIN = bin;
    await indexMemory(root, { indexing: { mode: "lexical" } });
    const recognition = { editor: "human", timeZone: "Europe/Berlin", sort: "edited" };
    const local = await searchMemory(root, "mistral", 2, { recognition });
    assert.equal(local.recognition.matched, 5);
    assert.equal(local.recognition.nextOffset, 2);
    assert.equal(local.recognition.candidateLimit, 120);
    assert.equal(local.recognition.partial, true);
    assert.equal(local.results.every(hit => hit.recognition.editor.kind === "human"), true);
    const next = await searchMemory(root, "mistral", 2, { recognition: { ...recognition, offset: 2 } });
    assert.equal(next.results.length, 2);
    assert.notEqual(local.results[0].id, next.results[0].id);
    server = await startJumpyBrainHttpServer({ root, apiKeys: ["disposable-key"], port: 0, autoIndex: false });
    const response = await fetch(`${server.url}/memories/all/search`, { method: "POST", headers: { Authorization: "Bearer disposable-key", "Content-Type": "application/json" }, body: JSON.stringify({ query: "mistral", limit: 2, recognition }) });
    assert.equal(response.status, 200);
    const remote = await response.json();
    assert.deepEqual(remote.results.map(hit => hit.provenance.file), local.results.map(hit => hit.provenance.file));
    const cli = await execFileAsync(process.execPath, ["dist/cli.js", "search", "--root", root, "--query", "mistral", "--last-editor", "human", "--sort", "edited", "--time-zone", "Europe/Berlin", "--limit", "2", "--json"], { env: { ...process.env, JUMPYBRAIN_CLI_CONFIG: path.join(root, "unused.json") } });
    assert.deepEqual(JSON.parse(cli.stdout).results.map(hit => hit.provenance.file), local.results.map(hit => hit.provenance.file));
    const transport = createRemoteMemoryTransport({ url: server.url, apiKey: "disposable-key" });
    const transported = await transport.searchMemory("mistral", 2, { recognition });
    assert.deepEqual(transported.results.map(hit => hit.provenance.file), local.results.map(hit => hit.provenance.file));
    // The fake DB is not an immutable SQLite index: recognition must not bypass this gate.
    await assert.rejects(searchMemory(root, "mistral", 2, { recognition, readOnly: true }), { code: "read_only_invalid" });
    const before = await readFile(path.join(root, rows[0].file), "utf8");
    const hits = rows.map((row, i) => ({ id: String(i), score: 1, snippet: row.snippet, provenance: { file: row.file, metadata: { id: id(i + 1), title: `Mistral ${i + 1}` } } }));
    await writeFile(path.join(root, rows[0].file), before.replace("Product manager", "Externally changed"));
    const unknown = await recognizeSearchResults(await realpath(root), hits, 24, normalizeRecognitionOptions({ editor: "unknown" }));
    assert.equal(unknown.results.length, 1);
    assert.equal(unknown.results[0].recognition.editor, undefined);
    assert.equal(unknown.results[0].recognition.updatedAt, "2026-10-23T15:42:00Z", "declared metadata is not inferred mtime");
  } finally { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; await server?.close(); await rm(root, { recursive: true, force: true }); }
});

test("recent confirmed writes carry dates/editor, filter before paging and do not borrow stale attribution", async () => {
  const cache = createRecentWriteSearch({ scope: () => "a", fetch: async () => ({ results: [], index: { stale: true }, recognition: { version: 1, candidates: 0, metadataUnavailable: 0 } }) });
  for (let n = 1; n <= 30; n++) cache.remember({ id: id(n), file: `notes/${n}.md`, title: `Mistral ${n}`, body: "Application", recognition: { metadataStatus: "current", updatedAt: `2026-10-${String(n).padStart(2, "0")}`, editor: n > 25 ? human : agent } });
  const options = { editor: "you", actorId: human.id, sort: "edited" };
  const first = await cache.search("mistral", new AbortController().signal, 2, options);
  assert.equal(first.recognition.matched, 5); assert.equal(first.recognition.nextOffset, 2);
  assert.equal(first.results[0].recognition.editor.id, human.id);
  const next = await cache.search("mistral", new AbortController().signal, 2, { ...options, offset: 2 });
  assert.notEqual(first.results[0].id, next.results[0].id);
  cache.remember({ id: id(30), file: "notes/30.md", title: "Mistral 30", body: "Unknown new revision" });
  const packet = await cache.search("mistral", new AbortController().signal, 24, options);
  assert.equal(packet.results.some(hit => hit.id === id(30)), false);
});

test("remote recognition rejects missing or mismatched acknowledgements without an unfiltered retry", async () => {
  for (const scope of [undefined, { version: 1, options: { editor: "agent" } }]) {
    let calls = 0;
    const remote = createRemoteMemoryTransport({ url: "https://brain.example", apiKey: "fixture-key", fetchImpl: async () => {
      calls++; return new Response(JSON.stringify({ results: [], ...(scope ? { recognition: scope } : {}) }), { status: 200 });
    } });
    await assert.rejects(remote.searchMemory("mistral", 24, { recognition: { editor: "human" } }), { code: "unsupported_recognition" });
    assert.equal(calls, 1);
  }
});
