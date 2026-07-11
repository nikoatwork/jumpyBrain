import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

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
    const timer = setTimeout(() => reject(new Error(`Timed out starting remote CLI smoke server. stdout=${output} stderr=${errorOutput}`)), 10000);
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
        reject(new Error(`Remote CLI smoke server exited early with ${code}. stdout=${output} stderr=${errorOutput}`));
      }
    });
  });
  return { child, url, closed };
}

function assertRecallResultIncludes(payload, token, file) {
  assert.equal(payload.mode, "recall");
  assert.ok(payload.results.length > 0, `expected recall results for ${token}`);
  assert.ok(
    payload.results.some((result) => result.provenance.file === file && result.snippet.includes(token)),
    `expected recall result for ${file} containing ${token}; got ${JSON.stringify(payload.results, null, 2)}`,
  );
}

test("local CLI document edit smoke initializes, remembers, indexes, recalls, shows, updates, and verifies exact file content", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-local-edit-smoke-"));
  const originalToken = "local-edit-smoke-original-orchid-1729";
  const revisedToken = "local-edit-smoke-revised-orchid-1730";

  try {
    runCli(["init", "--root", tempRoot]);
    const remembered = JSON.parse(runCli([
      "remember",
      "--root",
      tempRoot,
      "--type",
      "note",
      "--title",
      "Document edit smoke note",
      "--tag",
      "edit-flow-validation",
      "--json",
    ], {
      input: `Local document edit smoke body carries ${originalToken}.\n`,
    }).stdout);

    assert.match(remembered.id, /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.match(remembered.file, /^notes\//);

    const indexed = runCli(["index", "--root", tempRoot]);
    assert.match(indexed.stdout, /Indexed 1 Markdown documents/);
    const recalled = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", originalToken, "--limit", "5", "--json"]).stdout);
    assertRecallResultIncludes(recalled, originalToken, remembered.file);

    const shown = JSON.parse(runCli(["show", "--root", tempRoot, "--id", remembered.id, "--json"]).stdout);
    assert.equal(shown.id, remembered.id);
    assert.equal(shown.file, remembered.file);
    assert.match(shown.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(shown.content, new RegExp(`id: "${remembered.id}"`));
    assert.match(shown.content, new RegExp(originalToken));

    const revisedContent = shown.content.replace(originalToken, revisedToken);
    assert.notEqual(revisedContent, shown.content);
    const updated = JSON.parse(runCli(["update", "--root", tempRoot, "--id", remembered.id, "--if-match", shown.contentHash, "--json"], {
      input: revisedContent,
    }).stdout);
    assert.equal(updated.oldContentHash, shown.contentHash);
    assert.match(updated.newContentHash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(updated.newContentHash, shown.contentHash);
    assert.equal(updated.index.stale, true);

    const afterShow = JSON.parse(runCli(["show", "--root", tempRoot, "--id", remembered.id, "--json"]).stdout);
    assert.equal(afterShow.contentHash, updated.newContentHash);
    assert.match(afterShow.content, new RegExp(revisedToken));
    assert.doesNotMatch(afterShow.content, new RegExp(originalToken));

    const exactFileContent = await readFile(path.join(tempRoot, remembered.file), "utf8");
    assert.equal(exactFileContent, afterShow.content);
    assert.match(exactFileContent, new RegExp(revisedToken));
    assert.doesNotMatch(exactFileContent, new RegExp(originalToken));

    runCli(["index", "--root", tempRoot]);
    const recalledAfterUpdate = JSON.parse(runCli(["recall", "--root", tempRoot, "--topic", revisedToken, "--limit", "5", "--json"]).stdout);
    assertRecallResultIncludes(recalledAfterUpdate, revisedToken, remembered.file);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("in-process remote CLI document edit smoke remembers, shows, updates, reindexes, and verifies changed content", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-remote-edit-smoke-"));
  const started = await startCliServer(tempRoot);
  const env = { JUMPYBRAIN_API_KEY: "secret" };
  const target = ["--target-url", started.url];
  const originalToken = "remote-edit-smoke-original-saffron-2718";
  const revisedToken = "remote-edit-smoke-revised-saffron-2719";

  try {
    const remembered = JSON.parse(runCli([
      "remember",
      ...target,
      "--type",
      "note",
      "--title",
      "Remote document edit smoke note",
      "--tag",
      "edit-flow-validation",
      "--json",
    ], {
      env,
      input: `Remote document edit smoke body carries ${originalToken}.\n`,
    }).stdout);

    assert.match(remembered.id, /^mem_/);
    assert.match(remembered.file, /^notes\//);
    assert.equal(remembered.index.stale, true);

    const shown = JSON.parse(runCli(["show", ...target, "--id", remembered.id, "--json"], { env }).stdout);
    assert.equal(shown.root, "remote:all");
    assert.equal(shown.target, "remote");
    assert.equal(shown.memory, "all");
    assert.equal(shown.id, remembered.id);
    assert.equal(shown.file, remembered.file);
    assert.match(shown.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(shown.content, new RegExp(originalToken));
    assert.equal(JSON.stringify(shown).includes(tempRoot), false);

    const revisedContent = shown.content.replace(originalToken, revisedToken);
    const updated = JSON.parse(runCli(["update", ...target, "--id", remembered.id, "--if-match", shown.contentHash, "--json"], {
      env,
      input: revisedContent,
    }).stdout);
    assert.equal(updated.root, "remote:all");
    assert.equal(updated.target, "remote");
    assert.equal(updated.memory, "all");
    assert.equal(updated.id, remembered.id);
    assert.equal(updated.file, remembered.file);
    assert.equal(updated.oldContentHash, shown.contentHash);
    assert.match(updated.newContentHash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(updated.newContentHash, shown.contentHash);
    assert.equal(updated.index.stale, true);

    const afterShow = JSON.parse(runCli(["show", ...target, "--id", remembered.id, "--json"], { env }).stdout);
    assert.equal(afterShow.contentHash, updated.newContentHash);
    assert.match(afterShow.content, new RegExp(revisedToken));
    assert.doesNotMatch(afterShow.content, new RegExp(originalToken));
    assert.equal(JSON.stringify(afterShow).includes(tempRoot), false);

    runCli(["index", ...target], { env });
    const recalledAfterUpdate = JSON.parse(runCli(["recall", ...target, "--topic", revisedToken, "--limit", "5", "--json"], { env }).stdout);
    assert.equal(recalledAfterUpdate.root, "remote:all");
    assertRecallResultIncludes(recalledAfterUpdate, revisedToken, remembered.file);
  } finally {
    started.child.kill("SIGTERM");
    await started.closed;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI usage smoke pins document show, update, and ID-stamping commands", () => {
  const help = runCli(["help"]).stdout;
  assert.match(help, /jumpybrain show --root <memory-root> --id <mem_id> \[--json\]/);
  assert.match(help, /jumpybrain show --target-url <url> --id <mem_id> \[--json\]/);
  assert.match(help, /cat revised\.md \| jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> \[--json\]/);
  assert.match(help, /cat revised\.md \| jumpybrain update --target-url <url> --id <mem_id> --if-match <contentHash> \[--json\]/);
  assert.match(help, /jumpybrain process --root <memory-root> --mode lint\|synthesize\|ensure-ids \[--topic "\.\.\."\] --apply/);

  const runHelp = runCliFailure(["run"]).stderr;
  assert.match(runHelp, /jumpybrain run memory:show --id <mem_id> \[--root <memory-root>\] \[--target-url <url>\] \[--json\]/);
  assert.match(runHelp, /cat revised\.md \| jumpybrain run memory:update --id <mem_id> --if-match <contentHash> \[--root <memory-root>\] \[--target-url <url>\] \[--json\]/);
  assert.match(runHelp, /jumpybrain run memory:process --mode lint\|synthesize\|ensure-ids \[--topic "\.\.\."\] \[--root <memory-root>\] --apply/);
});
