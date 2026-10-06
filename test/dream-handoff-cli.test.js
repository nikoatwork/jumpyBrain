import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDreamHandoff } from "../dist/adapters/http-server/dream-handoff.js";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { repoRoot } from "./source-graph-helpers.js";

const apiKey = "synthetic-dream-handoff-secret";
const humanId = "mem_82000000-0000-4000-8000-000000000001";
const logger = { info() {}, warn() {}, error() {}, log() {} };

// Parse only the deliberately small recipe grammar, never execute a shell or
// evaluate copied instructions/evidence. Redirection is emulated with stdin.
function recipes(prompt, origin) {
  const commands = new Map();
  const allowed = {
    status: [],
    dream: ["from", "days", "date-basis", "max-files", "bytes-per-file", "max-total-bytes"],
    recall: ["topic", "limit", "depth"],
    search: ["query", "limit", "depth"],
    show: ["id"],
    remember: ["type", "dream", "title"],
    update: ["id", "if-match"],
    index: [],
  };
  for (const block of prompt.matchAll(/```sh\r?\n([\s\S]*?)```/g)) {
    for (const line of block[1].split(/\r?\n/).filter((line) => line.startsWith("jumpybrain "))) {
      const tokens = [];
      const pattern = /\s*("[^"\r\n]*"|'[^'\r\n]*'|[a-zA-Z0-9_./:=+-]+|<)(?=\s|$)/gy;
      let offset = 0;
      while (offset < line.trimEnd().length) {
        pattern.lastIndex = offset;
        const match = pattern.exec(line);
        assert.ok(match, `Unsupported recipe syntax: ${line.slice(offset)}`);
        const raw = match[1];
        const token = /^["']/.test(raw) ? raw.slice(1, -1) : raw;
        if (token.includes("$")) assert.match(raw, /^"\$(TOPIC|ID|HASH|TITLE)"$/);
        assert.doesNotMatch(token, /[`;|&\\]/);
        tokens.push(token);
        offset = pattern.lastIndex;
      }
      assert.equal(tokens.shift(), "jumpybrain");
      const command = tokens[0];
      assert.ok(Object.hasOwn(allowed, command), `Unexpected command: ${command}`);
      let inputFile;
      const redirect = tokens.indexOf("<");
      if (redirect !== -1) {
        assert.equal(redirect, tokens.length - 2, "stdin redirection must end the recipe");
        inputFile = tokens.pop();
        tokens.pop();
      }
      const flags = {};
      for (let i = 1; i < tokens.length; i++) {
        const key = tokens[i].replace(/^--/, "");
        assert.equal(tokens[i], `--${key}`);
        assert.ok(["target-url", "json", ...allowed[command]].includes(key), `Unsupported ${command} flag ${key}`);
        assert.equal(Object.hasOwn(flags, key), false, `Duplicate flag ${key}`);
        flags[key] = ["json", "dream"].includes(key) ? true : tokens[++i];
      }
      assert.equal(flags["target-url"], origin, "every copied command stays on the disposable origin");
      assert.equal(flags.json, true);
      if (command === "dream") {
        assert.deepEqual(flags, {
          "target-url": origin, from: "2024-03-01", days: "3", "date-basis": "evidence",
          "max-files": "10", "bytes-per-file": "8000", "max-total-bytes": "40000", json: true,
        });
      }
      if (command === "recall" || command === "search") {
        assert.equal(flags[command === "recall" ? "topic" : "query"], "$TOPIC");
        assert.ok(Number(flags.limit) > 0 && Number(flags.limit) <= 5, "follow-up retrieval is bounded");
        assert.ok(["shallow", "normal", "deep"].includes(flags.depth));
      }
      if (command === "show" || command === "update") assert.equal(flags.id, "$ID");
      if (command === "update") assert.equal(flags["if-match"], "$HASH");
      if (command === "remember") {
        assert.equal(flags.type, "page");
        assert.equal(flags.dream, true);
        assert.equal(flags.title, "$TITLE");
      }
      assert.equal(inputFile, command === "remember" ? "body.md" : command === "update" ? "revised.md" : undefined);
      // Repeated show examples are fine, but must obey the same checked grammar.
      if (!commands.has(command)) commands.set(command, { args: tokens, inputFile });
    }
  }
  assert.deepEqual([...commands.keys()].sort(), Object.keys(allowed).sort());
  return commands;
}

async function canonicalSnapshot(root) {
  const entries = [];
  for (const bucket of ["notes", "sessions", "findings", "decisions", "preferences", "pages"]) {
    for (const file of (await readdir(path.join(root, bucket))).sort()) {
      const absolute = path.join(root, bucket, file);
      entries.push({ file: `${bucket}/${file}`, content: await readFile(absolute, "utf8"), mtime: (await stat(absolute)).mtimeMs });
    }
  }
  return entries;
}

// Async spawn is essential: the real HTTP server runs in this test process.
function runCli(args, { cwd, env, input = "" }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "dist/cli.js"), ...args], {
      cwd, env, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 15000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`CLI timed out: ${args[0]}\n${stderr}`));
      else resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

test("copied Dream recipes drive a disposable authenticated remote CLI lifecycle without models", { timeout: 90000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-dream-handoff-cli-"));
  const root = path.join(temp, "server-memory");
  const scratch = path.join(temp, "private-client");
  const home = path.join(temp, "home");
  const qmd = path.join(temp, "synthetic-qmd.cjs");
  const callsFile = path.join(temp, "qmd-calls.jsonl");
  const overrides = {
    HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: path.join(temp, "cache"),
    JUMPYBRAIN_CLI_CONFIG: path.join(home, "no-cli-config.json"),
    JUMPYBRAIN_QMD_BIN: qmd, JUMPYBRAIN_QMD_EMBED: "false",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  let server;
  try {
    await Promise.all([root, scratch, home].map((directory) => mkdir(directory, { recursive: true })));
    // Fixed lexical answers and inert query fallback; no real QMD/model binary is invoked.
    await writeFile(qmd, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + '\\n');
if (args[0] === 'search') {
  const collection = args[args.indexOf('-c') + 1];
  console.log(JSON.stringify(collection === 'jumpybrain' ? [{
    file: 'qmd://jumpybrain/pages/human.md', score: 0.9, line: 8,
    snippet: 'Synthetic orchard evidence from 2024-02-29 remains uncertain; keep this human-authored page unchanged.'
  }] : []));
} else if (['collection', 'update', 'query'].includes(args[0])) console.log('[]');
else { console.error('Unexpected QMD operation: ' + args[0]); process.exit(1); }
`);
    await chmod(qmd, 0o755);
    Object.assign(process.env, overrides);
    const memory = createServerMemoryRuntime({ root });
    await memory.initializeMemoryRoot();
    const human = `---\nid: ${humanId}\ntype: page\ntitle: "Synthetic orchard evidence"\ndate: "2024-02-29"\ndream: false\n---\nSynthetic orchard evidence from 2024-02-29 remains uncertain; keep this human-authored page unchanged.\n`;
    await writeFile(path.join(root, "pages/human.md"), human);
    await writeFile(path.join(root, "pages/prior-dream.md"), '---\ntype: page\ndream: true\ndate: "2024-02-29"\n---\nUnrelated existing dream page.\n');
    await writeFile(path.join(root, "notes/outside.md"), '---\ndate: "2024-02-27"\n---\nOutside the inclusive three-day window.\n');
    // ID-less sources deliberately exceed both the per-file and total budgets.
    for (let n = 0; n < 12; n++) {
      await writeFile(path.join(root, "notes", `source-${String(n).padStart(2, "0")}.md`),
        `---\ndate: "2024-02-28"\n---\n${"Synthetic orchard evidence; uncertainty preserved. ".repeat(240)}\n`);
    }
    await memory.indexMemory(); // Fixture setup only; the handoff indexes once after its writes.
    const before = await canonicalSnapshot(root);
    server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false, logger });
    const handoff = createDreamHandoff(server.url, new Date("2024-03-01T00:05:00.000Z"));
    assert.equal(handoff.target, server.url);
    assert.equal(handoff.prompt.includes(apiKey), false);
    assert.equal(handoff.prompt.includes(root), false);
    const commands = recipes(handoff.prompt, server.url);
    const env = { ...process.env, ...overrides, JUMPYBRAIN_API_KEY: apiKey };
    const variables = { TOPIC: "Synthetic orchard evidence", TITLE: "Synthetic orchard dream map" };
    const run = async (command, { success = true, apiKey: key = apiKey } = {}) => {
      const recipe = commands.get(command);
      const args = recipe.args.map((token) => {
        if (!token.startsWith("$")) return token;
        const value = variables[token.slice(1)];
        assert.equal(typeof value, "string", `Unset fixture placeholder ${token}`);
        return value;
      });
      const input = recipe.inputFile ? await readFile(path.join(scratch, recipe.inputFile), "utf8") : "";
      const result = await runCli(args, { cwd: scratch, env: { ...env, JUMPYBRAIN_API_KEY: key }, input });
      assert.equal(result.signal, null);
      if (success) assert.equal(result.code, 0, `${command}: ${result.stderr}`);
      else assert.notEqual(result.code, 0, `${command} unexpectedly succeeded: ${result.stdout}`);
      return result;
    };
    const json = async (command) => JSON.parse((await run(command)).stdout);
    const status = await json("status");
    assert.equal(status.memory, "all");
    assert.equal(status.canonical, "markdown");
    assert.equal(JSON.stringify(status).includes(root), false);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);

    const packet = await json("dream");
    assert.deepEqual(packet.window, { from: "2024-02-28", to: "2024-03-01", timezone: "UTC", dateBasis: "evidence" });
    assert.deepEqual(packet.limits, { maxFiles: 10, bytesPerFile: 8000, maxTotalBytes: 40000 });
    assert.equal(packet.totalFiles, 13);
    assert.ok(packet.files.length > 0 && packet.files.length <= 10);
    assert.equal(packet.hasMore, true);
    assert.ok(packet.files.some((file) => file.truncated));
    assert.ok(packet.files.every((file) => Buffer.byteLength(file.content) <= 8000));
    assert.ok(packet.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) <= 40000);
    assert.ok(packet.files.every((file) => !["pages/prior-dream.md", "notes/outside.md"].includes(file.file)));
    assert.ok(packet.warnings.some((warning) => /missing document ID/.test(warning)));
    assert.equal(JSON.stringify(packet).includes(root), false);
    assert.equal("batchId" in packet, false);
    for (const command of ["recall", "search"]) {
      const result = await json(command);
      assert.equal(result.mode, command);
      assert.equal(result.query, variables.TOPIC);
      assert.ok(result.results.length <= 5);
      assert.ok(result.results.some((hit) => hit.provenance.metadata.id === humanId), "use canonical provenance IDs, not QMD chunk IDs");
    }
    assert.deepEqual(await canonicalSnapshot(root), before, "retrieval never stamps source IDs or mutates Markdown");

    const body = "Historical 2024-02-29 evidence: [[pages/human]]. The orchard conclusion remains uncertain.\n";
    await writeFile(path.join(scratch, "body.md"), body, { mode: 0o600 });
    const created = await json("remember");
    assert.match(created.file, /^pages\/.+\.md$/);
    assert.match(created.id, /^mem_/);
    assert.equal(created.indexed, false);
    variables.ID = created.id;
    const shown = await json("show");
    assert.equal(shown.frontmatter.id, created.id);
    assert.equal(shown.frontmatter.type, "page");
    assert.equal(shown.frontmatter.dream, true);
    assert.ok(shown.content.includes(body.trim()));
    variables.HASH = shown.contentHash;
    const revised = shown.content.replace("conclusion remains uncertain", "conclusion remains uncertain pending further evidence");
    assert.notEqual(revised, shown.content);
    await writeFile(path.join(scratch, "revised.md"), revised, { mode: 0o600 });
    const updated = await json("update");
    assert.equal(updated.id, created.id);
    assert.equal(updated.file, created.file);
    assert.equal(updated.index.stale, true);
    assert.notEqual(updated.newContentHash, shown.contentHash);
    const accepted = await readFile(path.join(root, created.file), "utf8");
    await writeFile(path.join(scratch, "revised.md"), revised.replace("pending further evidence", "STALE OVERWRITE"));
    assert.match((await run("update", { success: false })).stderr, /content hash is stale/i);
    assert.equal(await readFile(path.join(root, created.file), "utf8"), accepted);

    // index currently accepts --json but prints a human summary, unlike other recipes.
    assert.match((await run("index")).stdout, /Indexed \d+ Markdown documents/);
    const after = await json("show");
    assert.equal(after.contentHash, updated.newContentHash);
    assert.equal(after.frontmatter.id, created.id);
    assert.equal(after.frontmatter.type, "page");
    assert.equal(after.frontmatter.dream, true);
    assert.equal(after.frontmatter.created_at, shown.frontmatter.created_at);
    assert.match(after.content, /pending further evidence/);
    const manifest = JSON.parse(await readFile(path.join(root, ".jumpybrain/index.json"), "utf8"));
    const indexed = manifest.documents.find((entry) => entry.relativePath === created.file);
    assert.equal(indexed.frontmatter.dream, true);
    assert.equal(indexed.frontmatter.updated_at, after.frontmatter.updated_at);
    assert.equal((await json("status")).index.stale, false);
    const preserved = await canonicalSnapshot(root);
    assert.deepEqual(preserved.filter((entry) => entry.file !== created.file), before, "all source/human/prior-dream bytes and mtimes survive");
    assert.equal(preserved.length, before.length + 1);

    // Missing prerequisites/denied auth must fail, never silently use local memory.
    assert.match((await run("status", { success: false, apiKey: "" })).stderr, /JUMPYBRAIN_API_KEY/);
    assert.match((await run("dream", { success: false, apiKey: "wrong-synthetic-key" })).stderr, /invalid.*api.*key|unauthorized|401/i);
    assert.match((await run("remember", { success: false, apiKey: "wrong-synthetic-key" })).stderr, /invalid.*api.*key|unauthorized|401/i);
    assert.deepEqual(await canonicalSnapshot(root), preserved);
    assert.deepEqual((await readdir(scratch)).sort(), ["body.md", "revised.md"], "no fallback local memory or exported evidence packets");
    const calls = (await readFile(callsFile, "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(calls.some((args) => args[0] === "search"));
    assert.equal(calls.filter((args) => args[0] === "update").length, 2, "one setup index and one post-write handoff index");
    assert.ok(calls.every((args) => ["collection", "update", "search", "query"].includes(args[0])), "only stubbed operations; no embeddings or real model calls");
  } finally {
    if (server) await server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temp, { recursive: true, force: true });
  }
});
