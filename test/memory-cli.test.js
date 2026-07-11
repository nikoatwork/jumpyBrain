import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseFrontmatter } from "../dist/core/canonical/markdown-store.js";
import { resolveCliTarget } from "../dist/cli/targets.js";
import { qmdIndexInternalsForTests } from "../dist/adapters/qmd/qmd-driver.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist/cli.js");

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });

  assert.equal(result.status, 0, `CLI failed\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function runCliFailure(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });

  assert.notEqual(result.status, 0, `CLI unexpectedly succeeded\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

const validWrapup = [
  "## Findings",
  "- The canonical layer should stay backend-agnostic.",
  "",
  "## Decisions",
  "- Keep wrapup writing behind the writing module.",
  "",
  "## Conflicts / Corrections",
  "- None captured.",
  "",
  "## Open Questions",
  "- Should wrapup recall become mandatory after dogfood usage?",
  "",
].join("\n");

test("CLI reports package version", async () => {
  const expected = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")).version;
  const result = runCli(["--version"]);
  assert.equal(result.stdout.trim(), expected);
});

test("CLI prints copyable agent memory instructions", () => {
  const result = runCli(["instructions"]);
  assert.match(result.stdout, /jumpyBrain memory hint/);
  assert.match(result.stdout, /memory:recall/);
  assert.match(result.stdout, /Do not memorize secrets/);
});

test("CLI command parsing uses local transport and target-selection boundaries", async () => {
  const cliSource = await readFile(path.join(repoRoot, "src", "cli.ts"), "utf8");
  const commandSource = await readFile(path.join(repoRoot, "src", "cli", "commands.ts"), "utf8");
  const targetSource = await readFile(path.join(repoRoot, "src", "cli", "memory-target.ts"), "utf8");
  const transportSource = await readFile(path.join(repoRoot, "src", "cli", "local-transport.ts"), "utf8");

  assert.match(cliSource, /from "\.\/cli\/index\.js"/);
  assert.match(commandSource, /from "\.\/local-transport\.js"/);
  assert.match(targetSource, /from "\.\/targets\.js"/);
  assert.doesNotMatch(`${cliSource}\n${commandSource}`, /from "\.\/index\.js"/);
  assert.doesNotMatch(`${cliSource}\n${commandSource}\n${targetSource}`, /from "\.\.?\/(?:qmd|adapters\/qmd)\//);
  assert.match(transportSource, /from "\.\.\/runtime\/index\.js"/);
  assert.doesNotMatch(transportSource, /from "\.\.\/(?:qmd|adapters\/qmd)\//);
});

test("CLI target selection preserves local roots and recognizes remote placeholders", () => {
  assert.deepEqual(resolveCliTarget({ root: "./memory" }), { kind: "local", root: "./memory" });
  assert.deepEqual(resolveCliTarget({}, { allowDiscovery: true }), { kind: "local" });
  assert.deepEqual(resolveCliTarget({ "target-url": "https://brain.example" }), { kind: "remote", url: "https://brain.example" });
  assert.throws(() => resolveCliTarget({}), /--root is required/);
});

test("CLI remote target requires API key before local root handling", () => {
  const result = runCliFailure(["status", "--target-url", "https://brain.example"], { env: { JUMPYBRAIN_API_KEY: "" } });
  assert.match(result.stderr, /JUMPYBRAIN_API_KEY/);
  assert.doesNotMatch(result.stderr, /--root is required/);
});

test("CLI local dream supports create status apply-manifest complete and cursor exclusion", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-cli-local-dream-"));
  try {
    const resolvedRoot = await realpath(tempRoot);
    runCli(["init", "--root", tempRoot]);
    const remembered = JSON.parse(runCli(["remember", "--root", tempRoot, "--type", "finding", "--title", "Local dream fruit", "--json"], {
      input: "Local dream should consolidate the mango note.",
    }).stdout);
    const overflow = JSON.parse(runCli(["remember", "--root", tempRoot, "--type", "finding", "--title", "Local dream overflow", "--json"], {
      input: "Local dream overflow should remain pending after the first apply.",
    }).stdout);

    const status = JSON.parse(runCli(["dream", "--root", tempRoot, "--status", "--json"]).stdout);
    assert.equal(status.target, "local");
    assert.equal(status.root, resolvedRoot);
    assert.equal(status.available, true);

    const localOut = path.join(tempRoot, "local-dream-batch.json");
    const batch = JSON.parse(runCli(["dream", "--root", tempRoot, "--out", localOut, "--max-files", "1", "--json"]).stdout);
    assert.deepEqual(JSON.parse(await readFile(localOut, "utf8")).batchId, batch.batchId);
    assert.equal(batch.target, "local");
    assert.equal(batch.root, resolvedRoot);
    assert.equal(batch.files.length, 1);
    const completedId = batch.files[0].id;
    const pendingId = completedId === remembered.id ? overflow.id : remembered.id;
    assert.ok([remembered.id, overflow.id].includes(completedId));
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "dream", "state.json")), true);

    const shown = JSON.parse(runCli(["show", "--root", tempRoot, "--id", completedId, "--json"]).stdout);
    const revisedPath = path.join(tempRoot, "local-dream-revised.md");
    await writeFile(revisedPath, `${shown.content}\n\nLocal dream applied marker.\n`, "utf8");
    const manifestPath = path.join(tempRoot, "local-dream-manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      batchId: batch.batchId,
      summary: "local dream applied",
      updates: [{ id: completedId, ifMatch: shown.contentHash, contentFile: path.basename(revisedPath) }],
    }, null, 2), "utf8");

    const completed = JSON.parse(runCli(["dream", "--root", tempRoot, "--apply-manifest", manifestPath, "--json"]).stdout);
    assert.equal(completed.target, "local");
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.updatedDocumentIds, [completedId]);

    const after = JSON.parse(runCli(["show", "--root", tempRoot, "--id", completedId, "--json"]).stdout);
    assert.match(after.content, /Local dream applied marker/);

    const next = JSON.parse(runCli(["dream", "--root", tempRoot, "--json"]).stdout);
    assert.equal(next.target, "local");
    assert.equal(next.files.some((file) => file.id === completedId), false);
    assert.equal(next.files.some((file) => file.id === pendingId), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI local dream apply-manifest rejects stale hashes and unsafe content paths", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-cli-local-dream-stale-"));
  try {
    runCli(["init", "--root", tempRoot]);
    const remembered = JSON.parse(runCli(["remember", "--root", tempRoot, "--type", "finding", "--title", "Local stale dream", "--json"], {
      input: "Local dream stale apply should remain open.",
    }).stdout);
    const shown = JSON.parse(runCli(["show", "--root", tempRoot, "--id", remembered.id, "--json"]).stdout);
    const batch = JSON.parse(runCli(["dream", "--root", tempRoot, "--json"]).stdout);
    const revisedPath = path.join(tempRoot, "local-stale-revised.md");
    await writeFile(revisedPath, shown.content, "utf8");
    const staleManifest = path.join(tempRoot, "local-stale-manifest.json");
    await writeFile(staleManifest, JSON.stringify({
      version: 1,
      batchId: batch.batchId,
      updates: [{ id: remembered.id, ifMatch: "sha256:0000", contentFile: path.basename(revisedPath) }],
    }, null, 2), "utf8");

    const staleApply = runCliFailure(["dream", "--root", tempRoot, "--apply-manifest", staleManifest]);
    assert.match(staleApply.stderr, /content hash is stale/i);
    const stillOpen = JSON.parse(runCli(["dream", "--root", tempRoot, "--status", "--json"]).stdout);
    assert.equal(stillOpen.openBatch.batchId, batch.batchId);

    const unsafeManifest = path.join(tempRoot, "local-unsafe-manifest.json");
    await writeFile(unsafeManifest, JSON.stringify({
      version: 1,
      batchId: batch.batchId,
      updates: [{ id: remembered.id, ifMatch: shown.contentHash, contentFile: "../escape.md" }],
    }, null, 2), "utf8");
    const unsafeApply = runCliFailure(["dream", "--root", tempRoot, "--apply-manifest", unsafeManifest]);
    assert.match(unsafeApply.stderr, /must not contain '\.\.'/);
    runCli(["dream", "--root", tempRoot, "--abandon", batch.batchId]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI remote target smoke covers status remember wrapup index search and recall", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-cli-remote-"));
  const started = await startCliServer(tempRoot);
  const env = { JUMPYBRAIN_API_KEY: "secret" };
  const target = ["--target-url", started.url];

  try {
    const status = runCli(["status", ...target, "--json"], { env });
    assert.equal(JSON.parse(status.stdout).initialized, true);

    const remembered = runCli(["remember", ...target, "--type", "finding", "--title", "Remote banana memory", "--json"], {
      env,
      input: "Remote CLI smoke remembers the banana release note location.",
    });
    const rememberedPayload = JSON.parse(remembered.stdout);
    assert.equal(rememberedPayload.indexed, false);
    assert.match(rememberedPayload.id, /^mem_/);
    assert.match(rememberedPayload.file, /^findings\//);

    const dreamStatus = runCli(["dream", ...target, "--status", "--json"], { env });
    assert.equal(JSON.parse(dreamStatus.stdout).available, true);
    const dreamOut = path.join(tempRoot, "dream-batch.json");
    const dream = runCli(["dream", ...target, "--out", dreamOut], { env });
    assert.match(dream.stdout, /Remote dream batch:/);
    assert.match(dream.stdout, /untrusted context/i);
    assert.match(dream.stdout, /only --complete advances dream state/);
    const dreamPayload = JSON.parse(await readFile(dreamOut, "utf8"));
    assert.match(dreamPayload.batchId, /^dream_/);
    assert.ok(dreamPayload.files.some((file) => file.id === rememberedPayload.id));
    const localDream = runCli(["dream", "--root", tempRoot, "--json"], { env });
    const localDreamPayload = JSON.parse(localDream.stdout);
    assert.equal(localDreamPayload.target, "local");
    assert.equal(localDreamPayload.root, await realpath(tempRoot));
    assert.match(localDreamPayload.batchId, /^dream_/);
    runCli(["dream", "--root", tempRoot, "--abandon", localDreamPayload.batchId], { env });
    const completedDream = JSON.parse(runCli(["dream", ...target, "--complete", dreamPayload.batchId, "--summary", "CLI reviewed", "--json"], { env }).stdout);
    assert.equal(completedDream.status, "completed");
    assert.equal(completedDream.root, "remote:all");

    const indexed = runCli(["index", ...target], { env });
    assert.match(indexed.stdout, /remote:all/);

    const search = runCli(["search", ...target, "--query", "banana release note", "--json"], { env });
    const searchPayload = JSON.parse(search.stdout);
    assert.equal(searchPayload.root, "remote:all");
    assert.match(searchPayload.results[0].snippet, /banana release note/);

    const recall = runCli(["recall", ...target, "--topic", "banana release note", "--json"], { env });
    const recallPayload = JSON.parse(recall.stdout);
    assert.equal(recallPayload.mode, "recall");
    assert.equal(recallPayload.root, "remote:all");
    assert.match(recallPayload.results[0].provenance.file, /^findings\//);

    const wrapup = runCli(["wrapup", ...target, "--title", "Remote CLI wrapup", "--topic", "banana release note", "--json"], {
      env,
      input: validWrapup,
    });
    const wrapupPayload = JSON.parse(wrapup.stdout);
    assert.match(wrapupPayload.id, /^mem_/);
    assert.match(wrapupPayload.file, /^sessions\//);
    assert.equal(wrapupPayload.relatedMemory.skipped, false);

    const shown = runCli(["show", ...target, "--id", rememberedPayload.id, "--json"], { env });
    const shownPayload = JSON.parse(shown.stdout);
    assert.equal(shownPayload.root, "remote:all");
    assert.equal(shownPayload.target, "remote");
    assert.equal(shownPayload.memory, "all");
    assert.equal(shownPayload.id, rememberedPayload.id);
    assert.equal(shownPayload.file, rememberedPayload.file);
    assert.match(shownPayload.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(shownPayload.content, /banana release note location/);
    assert.equal(JSON.stringify(shownPayload).includes(tempRoot), false);

    const humanShow = runCli(["show", ...target, "--id", rememberedPayload.id], { env });
    assert.match(humanShow.stdout, new RegExp(`ID: ${rememberedPayload.id}`));
    assert.match(humanShow.stdout, new RegExp(`File: ${rememberedPayload.file}`));
    assert.match(humanShow.stdout, /Content-Hash: sha256:[0-9a-f]{64}/);
    assert.match(humanShow.stdout, /banana release note location/);
    assert.doesNotMatch(humanShow.stdout, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const missingHash = runCliFailure(["update", ...target, "--id", rememberedPayload.id], { env, input: shownPayload.content });
    assert.match(missingHash.stderr, /--if-match <contentHash>/);
    assert.match(missingHash.stderr, /Re-run `jumpybrain show`/);

    const revisedContent = shownPayload.content.replace("banana release note location", "papaya release note location");
    const update = runCli(["update", ...target, "--id", rememberedPayload.id, "--if-match", shownPayload.contentHash, "--json"], {
      env,
      input: revisedContent,
    });
    const updatePayload = JSON.parse(update.stdout);
    assert.equal(updatePayload.root, "remote:all");
    assert.equal(updatePayload.target, "remote");
    assert.equal(updatePayload.memory, "all");
    assert.equal(updatePayload.id, rememberedPayload.id);
    assert.equal(updatePayload.file, rememberedPayload.file);
    assert.equal(updatePayload.oldContentHash, shownPayload.contentHash);
    assert.match(updatePayload.newContentHash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(updatePayload.newContentHash, shownPayload.contentHash);
    assert.equal(updatePayload.indexed, false);
    assert.equal(updatePayload.index.stale, true);

    const afterShow = JSON.parse(runCli(["show", ...target, "--id", rememberedPayload.id, "--json"], { env }).stdout);
    assert.equal(afterShow.contentHash, updatePayload.newContentHash);
    assert.match(afterShow.content, /papaya release note location/);
    assert.doesNotMatch(afterShow.content, /banana release note location/);

    const stale = runCliFailure(["update", ...target, "--id", rememberedPayload.id, "--if-match", shownPayload.contentHash], {
      env,
      input: afterShow.content,
    });
    assert.match(stale.stderr, /content hash is stale/i);
    assert.match(stale.stderr, /Re-run `jumpybrain show --id/);

    const applyDreamOut = path.join(tempRoot, "dream-apply-batch.json");
    const applyDream = JSON.parse(runCli(["dream", ...target, "--out", applyDreamOut, "--json"], { env }).stdout);
    assert.ok(applyDream.files.some((file) => file.id === rememberedPayload.id));
    const manifestContent = path.join(tempRoot, "dream-revised.md");
    await writeFile(manifestContent, afterShow.content, "utf8");
    const manifestPath = path.join(tempRoot, "dream-manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      batchId: applyDream.batchId,
      summary: "stale apply should fail",
      updates: [{ id: rememberedPayload.id, ifMatch: shownPayload.contentHash, contentFile: path.basename(manifestContent) }],
    }, null, 2), "utf8");
    const staleApply = runCliFailure(["dream", ...target, "--apply-manifest", manifestPath], { env });
    assert.match(staleApply.stderr, /content hash is stale/i);
    const stillOpen = JSON.parse(runCli(["dream", ...target, "--status", "--json"], { env }).stdout);
    assert.equal(stillOpen.openBatch.batchId, applyDream.batchId);
    runCli(["dream", ...target, "--abandon", applyDream.batchId], { env });
  } finally {
    started.child.kill("SIGTERM");
    await started.closed;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("read-only remote integration allows reads and sends no mutation requests", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-cli-read-only-"));
  const policyPath = path.join(tempRoot, "device-cli-config.json");
  let started;
  try {
    runCli(["init", "--root", tempRoot]);
    const remembered = JSON.parse(runCli(["remember", "--root", tempRoot, "--type", "finding", "--title", "Protected remote marker", "--json"], {
      input: "Protected target retrieval marker.",
    }).stdout);
    runCli(["index", "--root", tempRoot]);
    started = await startCliServer(tempRoot);
    await writeFile(policyPath, JSON.stringify({
      schemaVersion: 1,
      remoteTargets: [{ origin: started.url, access: "read-only" }],
    }), "utf8");
    const env = { JUMPYBRAIN_API_KEY: "secret", JUMPYBRAIN_CLI_CONFIG: policyPath };
    const target = ["--target-url", `${started.url}/alias/path?ignored=yes`];

    assert.equal(JSON.parse(runCli(["status", ...target, "--json"], { env }).stdout).initialized, true);
    assert.doesNotThrow(() => runCli(["tree", ...target, "--json"], { env }));
    assert.doesNotThrow(() => runCli(["overview", ...target, "--json"], { env }));
    assert.ok(JSON.parse(runCli(["search", ...target, "--query", "retrieval marker", "--json"], { env }).stdout).results.length > 0);
    assert.ok(JSON.parse(runCli(["recall", ...target, "--topic", "retrieval marker", "--json"], { env }).stdout).results.length > 0);
    assert.equal(JSON.parse(runCli(["show", ...target, "--id", remembered.id, "--json"], { env }).stdout).id, remembered.id);
    assert.equal(JSON.parse(runCli(["dream", ...target, "--status", "--json"], { env }).stdout).target, "remote");

    await waitForServerLog(tempRoot, (text) => countRequests(text) >= 7);
    const logBefore = await serverLogText(tempRoot);
    const requestsBefore = countRequests(logBefore);
    const stateBefore = await filesystemSnapshot(tempRoot, [".jumpybrain/logs", path.basename(policyPath)]);
    const mutations = [
      { args: ["remember", ...target, "--type", "finding", "--title", "blocked"], input: "blocked body" },
      { args: ["wrapup", ...target, "--title", "blocked", "--topic", "marker"], input: validWrapup },
      { args: ["update", ...target, "--id", remembered.id, "--if-match", "sha256:blocked"], input: "blocked update" },
      { args: ["index", ...target] },
      { args: ["dream", ...target] },
      { args: ["dream", ...target, "--complete", "dream_blocked"] },
      { args: ["dream", ...target, "--abandon", "dream_blocked"] },
      { args: ["dream", ...target, "--apply-manifest", path.join(tempRoot, "missing-manifest.json")] },
    ];
    for (const mutation of mutations) {
      const result = runCliFailure(mutation.args, { env, input: mutation.input });
      assert.match(result.stderr, /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(countRequests(await serverLogText(tempRoot)), requestsBefore);
    assert.deepEqual(await filesystemSnapshot(tempRoot, [".jumpybrain/logs", path.basename(policyPath)]), stateBefore);
  } finally {
    if (started) {
      started.child.kill("SIGTERM");
      await started.closed;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function startCliServer(root) {
  const child = spawn(process.execPath, [cliPath, "serve", "--root", root, "--host", "127.0.0.1", "--port", "0", "--init"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, JUMPYBRAIN_SERVER_API_KEYS: "secret" },
  });
  let output = "";
  let errorOutput = "";
  const closed = new Promise((resolve) => child.once("close", resolve));
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out starting remote CLI test server. stdout=${output} stderr=${errorOutput}`)), 10000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/listening on (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (!output.includes("listening on")) {
        clearTimeout(timer);
        reject(new Error(`Remote CLI test server exited early with ${code}. stdout=${output} stderr=${errorOutput}`));
      }
    });
  });
  return { child, url, closed };
}

async function waitForServerLog(root, predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const text = await serverLogText(root);
    if (predicate(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for server request log.");
}

async function serverLogText(root) {
  const logDir = path.join(root, ".jumpybrain", "logs");
  if (!existsSync(logDir)) return "";
  const files = (await readdir(logDir)).filter((file) => file.startsWith("server-")).sort();
  return (await Promise.all(files.map((file) => readFile(path.join(logDir, file), "utf8")))).join("\n");
}

function countRequests(text) {
  return text.split("\n").filter((line) => line.includes(" http_request ")).length;
}

async function filesystemSnapshot(root, excludedPrefixes = []) {
  const entries = [];
  async function visit(current, relative = "") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (excludedPrefixes.some((prefix) => childRelative === prefix || childRelative.startsWith(`${prefix}/`))) continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) entries.push([childRelative, (await stat(child)).size, await readFile(child, "utf8")]);
    }
  }
  await visit(root);
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

test("frontmatter parsing supports manual memory metadata", () => {
  const parsed = parseFrontmatter([
    "---",
    'session_id: "s-alpha"',
    'type: "finding"',
    'tags: ["qmd", "memory"]',
    "confidence: 0.8",
    "---",
    "# Finding",
  ].join("\n"));

  assert.equal(parsed.frontmatter.session_id, "s-alpha");
  assert.equal(parsed.frontmatter.type, "finding");
  assert.deepEqual(parsed.frontmatter.tags, ["qmd", "memory"]);
  assert.equal(parsed.frontmatter.confidence, 0.8);
  assert.equal(parsed.bodyStartLine, 7);
});

test("QMD helper logic keeps long-context query and path repair deterministic", () => {
  assert.equal(
    qmdIndexInternalsForTests.normalizeQmdLookupPath("Sessions/Answer_ShareGPT_5Lzox6N_0.md"),
    "sessions/answer-sharegpt-5lzox6n-0.md",
  );

  const assistantQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "I'm checking our previous chat about the shift rotation sheet for GM social media agents. Can you remind me what was the rotation for Admon on a Sunday?",
  );
  assert.ok(assistantQueries.slice(0, 8).includes("admon sunday"));
  assert.ok(assistantQueries.slice(0, 8).includes("shift rotation"));

  const temporalQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a customized phone case for my friend's birthday?",
  );
  assert.ok(temporalQueries.slice(0, 8).includes("prepare nursery"));
  assert.ok(temporalQueries.slice(0, 8).includes("baby shower"));
  assert.ok(temporalQueries.slice(0, 8).includes("phone case"));

  const datedTemporalQueries = qmdIndexInternalsForTests.qmdLexQueries(
    "changes after 2026-06-02 about query generation and wrapup memory",
  ).slice(0, 8).join("\n");
  assert.match(datedTemporalQueries, /query generation/);
  assert.match(datedTemporalQueries, /wrapup memory/);

  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("## User Could you suggest a hotel? ## Assistant"), true);
  assert.equal(qmdIndexInternalsForTests.looksLikeUnhelpfulSnippet("For a romantic dinner, I would recommend Roscioli."), false);

  assert.deepEqual(Object.keys(qmdIndexInternalsForTests).sort(), [
    "dateStats",
    "looksLikeUnhelpfulSnippet",
    "normalizeQmdLookupPath",
    "qmdLexQueries",
    "temporalBoostFor",
  ]);
});

test("temporal helper boosts dated candidates deterministically", () => {
  const docs = [
    documentWithDate("sessions/old.md", { date: "2026-06-01" }),
    documentWithDate("sessions/mid.md", { date: "2026-06-05" }),
    documentWithDate("sessions/new.md", { date: "2026-06-10" }),
  ];
  const stats = qmdIndexInternalsForTests.dateStats(docs);

  const latestOld = qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", docs[0].frontmatter, stats);
  const latestNew = qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", docs[2].frontmatter, stats);
  assert.ok(latestNew > latestOld);
  assert.equal(latestNew, 0.12);

  const firstOld = qmdIndexInternalsForTests.temporalBoostFor("first QMD decision", docs[0].frontmatter, stats);
  const firstNew = qmdIndexInternalsForTests.temporalBoostFor("first QMD decision", docs[2].frontmatter, stats);
  assert.ok(firstOld > firstNew);
  assert.equal(firstOld, 0.12);

  const afterMid = qmdIndexInternalsForTests.temporalBoostFor("changes after 2026-06-02 about query generation", docs[1].frontmatter, stats);
  const afterOld = qmdIndexInternalsForTests.temporalBoostFor("changes after 2026-06-02 about query generation", docs[0].frontmatter, stats);
  assert.ok(afterMid > 0);
  assert.equal(afterOld, 0);

  const beforeMid = qmdIndexInternalsForTests.temporalBoostFor("what happened before 2026-06-10 with wrapup memory", docs[1].frontmatter, stats);
  const beforeNew = qmdIndexInternalsForTests.temporalBoostFor("what happened before 2026-06-10 with wrapup memory", docs[2].frontmatter, stats);
  assert.ok(beforeMid > 0);
  assert.equal(beforeNew, 0);

  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", { date: "not-a-date" }, stats), 0);
  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("latest QMD decision", {}, stats), 0);
  assert.equal(qmdIndexInternalsForTests.temporalBoostFor("after the refactor QMD decision", docs[2].frontmatter, stats), 0);
});

function documentWithDate(relativePath, frontmatter) {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    frontmatter,
    bodyStartLine: 1,
  };
}

test("CLI run memory usage lists document edit and ID-stamping recipes", () => {
  const result = runCliFailure(["run"]);
  assert.match(result.stderr, /jumpybrain run memory:show --id <mem_id>/);
  assert.match(result.stderr, /\[--target-url <url>\]/);
  assert.match(result.stderr, /jumpybrain run memory:update --id <mem_id> --if-match <contentHash>/);
  assert.match(result.stderr, /jumpybrain run memory:process --mode lint\|synthesize\|ensure-ids/);
});

test("CLI run memory recipes discover the repo memory root", async () => {
  const tempParent = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-run-"));
  const tempRoot = path.join(tempParent, "memory");
  const nested = path.join(tempParent, "nested", "workspace");
  try {
    await mkdir(nested, { recursive: true });
    runCli(["init", "--root", tempRoot]);
    const configPath = path.join(tempRoot, "jumpybrain.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.indexRoot = "..";
    await writeFile(configPath, JSON.stringify(config, null, 2));
    await mkdir(path.join(tempParent, "docs"));
    await writeFile(path.join(tempParent, "docs", "workspace.md"), "# Workspace doc\n\nThe workspace-only clue is blue-otter.\n");

    runCli(["run", "memory:remember", "--type", "decision", "--title", "Discovered memory root"], {
      cwd: nested,
      input: "Agents can run jumpybrain recipes from nested workspaces.\n",
    });
    runCli(["run", "memory:index"], { cwd: nested });

    const recall = runCli(["run", "memory:recall", "--topic", "nested workspace recipes", "--limit", "3"], { cwd: nested });
    assert.match(recall.stdout, /Prior memory scan/);
    assert.match(recall.stdout, /Discovered memory root|nested workspaces/i);

    const workspaceRecall = runCli(["run", "memory:recall", "--topic", "blue otter workspace-only clue", "--limit", "3"], { cwd: nested });
    assert.match(workspaceRecall.stdout, /docs\/workspace\.md/);
    assert.match(workspaceRecall.stdout, /blue-otter/);

    const status = JSON.parse(runCli(["run", "memory:status", "--json"], { cwd: nested }).stdout);
    assert.equal(status.root, await realpath(tempRoot));
    assert.equal(status.compatible, true);
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
});

test("CLI init creates a stable, compatible memory root", async () => {
  const tempParent = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-init-"));
  const tempRoot = path.join(tempParent, "memory");
  try {
    const result = runCli(["init", "--root", tempRoot, "--json"]);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.configFile, "jumpybrain.json");
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.configCreated, true);
    assert.deepEqual(payload.memoryDirs, ["notes", "sessions", "findings", "decisions", "preferences", "pages"]);

    const config = JSON.parse(await readFile(path.join(tempRoot, "jumpybrain.json"), "utf8"));
    assert.equal(config.canonical, "markdown");
    assert.equal(config.derivedDir, ".jumpybrain");
    assert.match(await readFile(path.join(tempRoot, ".gitignore"), "utf8"), /\.jumpybrain\//);

    const status = JSON.parse(runCli(["status", "--root", tempRoot, "--json"]).stdout);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);
    assert.equal(status.schemaVersion, 1);
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
});

test("CLI refuses writes when memory root schema is newer than the CLI", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await writeFile(path.join(tempRoot, "jumpybrain.json"), JSON.stringify({ schemaVersion: 999, canonical: "markdown", derivedDir: ".jumpybrain" }));
    const result = runCliFailure(["remember", "--root", tempRoot, "--type", "decision", "--title", "Future schema"], {
      input: "This should not be written.\n",
    });
    assert.match(result.stderr, /schema v999/);
    assert.match(result.stderr, /Update the CLI/);
    assert.equal(existsSync(path.join(tempRoot, "decisions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI index stores original Markdown document metadata, not derived chunks", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await mkdir(path.join(tempRoot, "sessions"));
    await writeFile(path.join(tempRoot, "sessions", "a.md"), [
      "---",
      'session_id: "s-alpha"',
      "---",
      "",
      "# Session",
      "",
      "## Assistant",
      "",
      "Mira decided to store the release notes in docs/releases/q2.md.",
      "",
    ].join("\n"));

    runCli(["index", "--root", tempRoot]);
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "index.json")), true);
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "qmd-docs")), false);

    const manifest = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "index.json"), "utf8"));
    assert.equal(manifest.documents.length, 1);
    assert.equal(manifest.documents[0].relativePath, "sessions/a.md");
    assert.equal(manifest.documents[0].frontmatter.session_id, "s-alpha");
    assert.equal(manifest.chunks, undefined);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI index/recall returns real QMD provenance-rich memory results", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    await mkdir(path.join(tempRoot, "sessions"));
    await writeFile(path.join(tempRoot, "sessions", "a.md"), [
      "---",
      'session_id: "s-alpha"',
      'date: "2026-01-05"',
      "---",
      "",
      "# Session",
      "",
      "## Assistant",
      "",
      "Mira decided to store the release notes in docs/releases/q2.md.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "b.md"), [
      "---",
      'session_id: "s-distractor"',
      "---",
      "",
      "# Session",
      "",
      "Vale owns the markdown formatting checklist.",
      "",
    ].join("\n"));

    runCli(["index", "--root", tempRoot]);
    await rm(path.join(tempRoot, ".jumpybrain"), { recursive: true, force: true });
    runCli(["index", "--root", tempRoot]);

    const specificRecall = runCli(["recall", "--root", tempRoot, "--query", "Where did Mira store release notes?", "--limit", "5", "--json"]);
    const payload = JSON.parse(specificRecall.stdout);
    assert.equal(payload.results[0].provenance.session_id, "s-alpha");
    assert.match(payload.results[0].snippet, /release notes/);
    assert.equal(payload.results[0].provenance.file, "sessions/a.md");
    assert.match(payload.results[0].scoreBreakdown.driver, /^qmd-cli:/);
    assert.equal(typeof payload.results[0].scoreBreakdown.temporalRelevance, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.memoryStrength, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.provenanceConfidence, "number");
    assert.equal(typeof payload.results[0].scoreBreakdown.depthPolicyBoost, "number");
    assert.equal(payload.results[0].scoreBreakdown.retrievalDepth, "normal");

    const recall = runCli(["recall", "--root", tempRoot, "--topic", "release notes", "--limit", "2"]);
    assert.match(recall.stdout, /Prior memory scan/);
    assert.match(recall.stdout, /sessions\/a.md/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI process synthesizes a topical page and recall depth can retrieve it", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-process-"));
  try {
    runCli(["init", "--root", tempRoot]);
    await writeFile(path.join(tempRoot, "decisions", "memory-work.md"), [
      "---",
      'type: "decision"',
      'title: "Memory work uses pages"',
      'created_at: "2026-06-20T00:00:00.000Z"',
      "---",
      "",
      "# Memory work uses pages",
      "",
      "Memory work should synthesize topical pages from sessions and decisions using the silver-raven retrieval depth marker.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "memory-work.md"), [
      "---",
      'type: "session"',
      'session_id: "s-memory-work"',
      'created_at: "2026-06-21T00:00:00.000Z"',
      "---",
      "",
      "# Memory work session",
      "",
      "We discussed silver-raven retrieval depth and the need to treat sessions as raw evidence.",
      "",
    ].join("\n"));

    const withoutApply = runCliFailure(["process", "--root", tempRoot, "--mode", "synthesize", "--topic", "memory work"]);
    assert.match(withoutApply.stderr, /--apply/);

    const process = JSON.parse(runCli(["process", "--root", tempRoot, "--mode", "synthesize", "--topic", "memory work", "--apply", "--json"]).stdout);
    assert.equal(process.mode, "synthesize");
    assert.deepEqual(process.files, ["pages/memory-work.md"]);
    const page = await readFile(path.join(tempRoot, "pages", "memory-work.md"), "utf8");
    assert.match(page, /type: "page"/);
    assert.match(page, /## Source memories/);
    assert.match(page, /silver-raven retrieval depth/);

    runCli(["index", "--root", tempRoot]);
    const shallow = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", "silver-raven retrieval depth", "--depth", "shallow", "--limit", "5", "--json"]).stdout);
    assert.equal(shallow.depth, "shallow");
    assert.equal(shallow.results[0].provenance.file, "pages/memory-work.md");
    assert.equal(shallow.results[0].scoreBreakdown.retrievalDepth, "shallow");

    const deep = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", "silver-raven retrieval depth raw evidence", "--depth", "deep", "--limit", "5", "--json"]).stdout);
    assert.equal(deep.depth, "deep");
    assert.ok(deep.results.some((result) => result.provenance.file.startsWith("sessions/")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI process validates mode and writes a deterministic support report", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-lint-"));
  try {
    await mkdir(path.join(tempRoot, "pages"), { recursive: true });
    await writeFile(path.join(tempRoot, "pages", "sales.md"), [
      "---",
      'type: "page"',
      'title: "Sales"',
      'topic: "sales"',
      'updated_at: "2026-06-01T00:00:00.000Z"',
      "---",
      "",
      "# Sales",
      "",
      "This page has no source section.",
      "",
    ].join("\n"));
    await mkdir(path.join(tempRoot, "decisions"), { recursive: true });
    await mkdir(path.join(tempRoot, "findings"), { recursive: true });
    await mkdir(path.join(tempRoot, "sessions"), { recursive: true });
    await writeFile(path.join(tempRoot, "decisions", "sales-price-book.md"), [
      "---",
      'type: "decision"',
      'title: "Sales price book resolved"',
      'created_at: "2026-06-02T00:00:00.000Z"',
      "---",
      "",
      "# Sales price book resolved",
      "",
      "Resolved sales price book question: decision is to keep the sales price book in pages.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "findings", "sales-conflict.md"), [
      "---",
      'type: "finding"',
      'title: "Sales conflict"',
      'conflicts_with: ["decisions/sales-price-book.md"]',
      "---",
      "",
      "# Sales conflict",
      "",
      "This sales finding intentionally declares a conflict for deterministic lint coverage.",
      "",
    ].join("\n"));
    await writeFile(path.join(tempRoot, "sessions", "sales-open-question.md"), [
      "---",
      'type: "session"',
      'title: "Sales open question"',
      "---",
      "",
      "# Sales open question",
      "",
      "## Open Questions",
      "- Should sales price book stay in pages?",
      "",
    ].join("\n"));

    const badMode = runCliFailure(["process", "--root", tempRoot, "--mode", "compress", "--apply"]);
    assert.match(badMode.stderr, /Invalid --mode/);

    const result = JSON.parse(runCli(["process", "--root", tempRoot, "--mode", "lint", "--topic", "sales", "--apply", "--json"]).stdout);
    assert.equal(result.mode, "lint");
    assert.equal(result.files.length, 1);
    assert.match(result.files[0], /^\.jumpybrain\/reports\/lint-/);
    const report = await readFile(path.join(tempRoot, result.files[0]), "utf8");
    assert.match(report, /missing an explicit Source memories section/);
    assert.match(report, /Conflict: `findings\/sales-conflict\.md` declares a conflict with `decisions\/sales-price-book\.md`/);
    assert.match(report, /Open question in `sessions\/sales-open-question\.md` may be answered by `decisions\/sales-price-book\.md`/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI process ensure-ids reports modified canonical files without absolute paths", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-ensure-ids-cli-"));
  try {
    runCli(["init", "--root", tempRoot]);
    await writeFile(path.join(tempRoot, "decisions", "needs-id.md"), [
      "---",
      'type: "decision"',
      'title: "Needs ID"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      "---",
      "",
      "# Needs ID",
      "",
      "This canonical decision needs a document ID.",
      "",
    ].join("\n"));

    const result = runCli(["process", "--root", tempRoot, "--mode", "ensure-ids", "--apply"]);
    assert.match(result.stdout, /Processed memory: ensure-ids/);
    assert.match(result.stdout, /Modified count: 1/);
    assert.match(result.stdout, /File: decisions\/needs-id\.md/);
    assert.doesNotMatch(result.stdout, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const markdown = await readFile(path.join(tempRoot, "decisions", "needs-id.md"), "utf8");
    assert.match(markdown, /^id: "mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/m);
    assert.doesNotMatch(markdown, /updated_at: "2026-01-01T00:00:00.000Z"/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI show and update edit local documents by ID with content-hash preconditions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-doc-edit-cli-"));
  const id = "mem_10000000-0000-4000-8000-000000000801";
  const originalContent = [
    "---",
    `id: "${id}"`,
    'type: "note"',
    'title: "Original editable note"',
    'source: "manual"',
    'created_at: "2026-01-01T00:00:00.000Z"',
    'updated_at: "2026-01-01T00:00:00.000Z"',
    "---",
    "",
    "# Original editable note",
    "",
    "The original violet-coyote token is present.",
    "",
  ].join("\n");

  try {
    runCli(["init", "--root", tempRoot]);
    await writeFile(path.join(tempRoot, "notes", "editable.md"), originalContent);

    const shownJson = JSON.parse(runCli(["show", "--root", tempRoot, "--id", id, "--json"]).stdout);
    assert.equal(shownJson.id, id);
    assert.equal(shownJson.file, "notes/editable.md");
    assert.equal(shownJson.content, originalContent);
    assert.match(shownJson.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(shownJson.frontmatter.source, "manual");

    const humanShow = runCli(["show", "--root", tempRoot, "--id", id]);
    assert.equal(humanShow.stdout, [
      `ID: ${id}`,
      "File: notes/editable.md",
      `Content-Hash: ${shownJson.contentHash}`,
      "",
      originalContent,
    ].join("\n"));
    assert.doesNotMatch(humanShow.stdout, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const missingHash = runCliFailure(["update", "--root", tempRoot, "--id", id], { input: originalContent });
    assert.match(missingHash.stderr, /--if-match <contentHash>/);
    assert.match(missingHash.stderr, /Re-run `jumpybrain show`/);

    const revisedContent = [
      "---",
      'id: "mem_99999999-9999-4999-8999-999999999999"',
      'type: "decision"',
      'title: "Updated editable note"',
      'source: "submitted"',
      'created_at: "1900-01-01T00:00:00.000Z"',
      'updated_at: "1900-01-01T00:00:00.000Z"',
      'tags: ["edited"]',
      "---",
      "",
      "# Updated editable note",
      "",
      "The revised silver-coyote token is present.",
      "",
    ].join("\n");

    const update = runCli(["update", "--root", tempRoot, "--id", id, "--if-match", shownJson.contentHash], { input: revisedContent });
    assert.match(update.stdout, /Updated memory document: notes\/editable\.md/);
    assert.match(update.stdout, new RegExp(`Old-Content-Hash: ${shownJson.contentHash}`));
    assert.match(update.stdout, /New-Content-Hash: sha256:[0-9a-f]{64}/);
    assert.match(update.stdout, /Index: stale/);

    const afterJson = JSON.parse(runCli(["show", "--root", tempRoot, "--id", id, "--json"]).stdout);
    assert.notEqual(afterJson.contentHash, shownJson.contentHash);
    const updatedMarkdown = await readFile(path.join(tempRoot, "notes", "editable.md"), "utf8");
    assert.equal(updatedMarkdown, afterJson.content);
    assert.match(updatedMarkdown, new RegExp(`id: "${id}"`));
    assert.match(updatedMarkdown, /type: "note"/);
    assert.match(updatedMarkdown, /source: "manual"/);
    assert.match(updatedMarkdown, /title: "Updated editable note"/);
    assert.match(updatedMarkdown, /tags: \["edited"\]/);
    assert.match(updatedMarkdown, /revised silver-coyote token/);
    assert.doesNotMatch(updatedMarkdown, /original violet-coyote token/);
    assert.doesNotMatch(updatedMarkdown, /updated_at: "1900-01-01T00:00:00.000Z"/);

    const stale = runCliFailure(["update", "--root", tempRoot, "--id", id, "--if-match", shownJson.contentHash], { input: revisedContent });
    assert.match(stale.stderr, /content hash is stale/i);
    assert.match(stale.stderr, /Re-run `jumpybrain show --id/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI remember writes editable Markdown memory and updates the index", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCli(["remember", "--root", tempRoot, "--type", "decision", "--title", "Use QMD first", "--tag", "qmd", "--json"], {
      input: "QMD is the first retrieval primitive; Markdown remains canonical.\n",
    });
    const payload = JSON.parse(result.stdout);
    assert.match(payload.file, /^decisions\/\d{4}-\d{2}-\d{2}-use-qmd-first/);
    assert.equal(payload.indexed, true);

    const markdown = await readFile(path.join(tempRoot, payload.file), "utf8");
    assert.match(markdown, /type: "decision"/);
    assert.match(markdown, /source: "jumpybrain-remember"/);
    assert.match(markdown, /tags: \["qmd"\]/);
    assert.match(markdown, /# Use QMD first/);
    assert.match(markdown, /Markdown remains canonical/);
    assert.equal(existsSync(path.join(tempRoot, ".jumpybrain", "index.json")), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI remember rejects empty stdin body", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["remember", "--root", tempRoot, "--type", "decision", "--title", "Empty"], { input: "\n" });
    assert.match(result.stderr, /Memory body is empty/);
    assert.equal(existsSync(path.join(tempRoot, "decisions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI note commands report remember migration", async () => {
  const topLevel = runCliFailure(["note", "--root", "/tmp/memory", "--type", "decision", "--title", "Old"], { input: "body\n" });
  assert.match(topLevel.stderr, /renamed to `jumpybrain remember`/);

  const tempParent = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-run-"));
  const tempRoot = path.join(tempParent, "memory");
  try {
    runCli(["init", "--root", tempRoot]);
    const oldRecipe = runCliFailure(["run", "memory:note", "--root", tempRoot, "--type", "decision", "--title", "Old"], { input: "body\n" });
    assert.match(oldRecipe.stderr, /renamed to `jumpybrain run memory:remember`/);
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
});

test("CLI recall reports missing index clearly", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["recall", "--root", tempRoot, "--query", "anything"]);
    assert.match(result.stderr, /Memory index not found/);
    assert.match(result.stderr, /jumpybrain index --root/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup writes one editable session file with strict sections", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCli(["wrapup", "--root", tempRoot, "--title", "Boundary refactor wrapup", "--json"], {
      input: validWrapup,
    });
    const payload = JSON.parse(result.stdout);
    assert.match(payload.file, /^sessions\/\d{4}-\d{2}-\d{2}-boundary-refactor-wrapup/);
    assert.equal(payload.validation.valid, true);
    assert.equal(payload.relatedMemory.skipped, true);
    assert.match(payload.body, /^# Boundary refactor wrapup/);
    assert.match(payload.body, /## Findings/);
    assert.match(payload.body, /## Open Questions/);

    const markdown = await readFile(path.join(tempRoot, payload.file), "utf8");
    assert.match(markdown, /type: "session"/);
    assert.match(markdown, /source: "jumpybrain-wrapup"/);
    assert.match(markdown, /confidence: "agent-drafted"/);
    assert.match(markdown, /review: "user-review-recommended"/);
    assert.match(markdown, /# Boundary refactor wrapup/);
    assert.match(markdown, /## Conflicts \/ Corrections/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup rejects missing required sections without writing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const result = runCliFailure(["wrapup", "--root", tempRoot, "--title", "Bad wrapup"], {
      input: [
        "## Findings",
        "- Useful fact.",
        "",
        "## Decisions",
        "- Useful decision.",
      ].join("\n"),
    });
    assert.match(result.stderr, /Invalid wrapup Markdown/);
    assert.match(result.stderr, /## Conflicts \/ Corrections/);
    assert.equal(existsSync(path.join(tempRoot, "sessions")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI wrapup with duplicate title does not overwrite existing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-memory-"));
  try {
    const first = JSON.parse(runCli(["wrapup", "--root", tempRoot, "--title", "Same title", "--json"], { input: validWrapup }).stdout);
    const second = JSON.parse(runCli(["wrapup", "--root", tempRoot, "--title", "Same title", "--json"], { input: validWrapup }).stdout);

    assert.notEqual(first.file, second.file);
    assert.equal(existsSync(path.join(tempRoot, first.file)), true);
    assert.equal(existsSync(path.join(tempRoot, second.file)), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
