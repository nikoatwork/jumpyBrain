import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
  });
}

function runCliOk(args, options = {}) {
  const result = runCli(args, options);
  assert.equal(result.status, 0, `CLI failed\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function runCliFailure(args, options = {}) {
  const result = runCli(args, options);
  assert.notEqual(result.status, 0, `CLI unexpectedly succeeded\nargs: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stdout, "", "failure output should stay on stderr");
  return result;
}

test("CLI root and remote target failures name the actionable flag or fallback", () => {
  assert.match(runCliFailure(["status"]).stderr, /--root is required/);

  const remote = runCliFailure(["status", "--target-url", "https://brain.example"], { env: { JUMPYBRAIN_API_KEY: "" } });
  assert.match(remote.stderr, /JUMPYBRAIN_API_KEY/);
  assert.doesNotMatch(remote.stderr, /--root is required/);
});

test("CLI validation failures name invalid flag values and allowed values", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-errors-"));
  try {
    runCliOk(["init", "--root", tempRoot]);

    assert.match(
      runCliFailure(["recall", "--root", tempRoot, "--topic", "anything", "--depth", "sideways"]).stderr,
      /Invalid --depth 'sideways'\. Use one of: shallow, normal, deep/,
    );
    assert.match(
      runCliFailure(["process", "--root", tempRoot, "--mode", "merge", "--apply"]).stderr,
      /Invalid --mode 'merge'\. Use one of: lint, synthesize, ensure-ids/,
    );
    assert.match(
      runCliFailure(["remember", "--root", tempRoot, "--type", "artifact", "--title", "Bad type"], { input: "Body\n" }).stderr,
      /Invalid --type 'artifact'\. Use one of:/,
    );
    assert.match(
      runCliFailure(["remember", "--root", tempRoot, "--type", "decision", "--title", "Empty"], { input: "   \n" }).stderr,
      /Memory body is empty/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI missing QMD failure explains local runtime fix", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-missing-qmd-"));
  try {
    runCliOk(["init", "--root", tempRoot]);
    const result = runCliFailure(["index", "--root", tempRoot], { env: { JUMPYBRAIN_QMD_BIN: path.join(tempRoot, "missing-qmd") } });

    assert.match(result.stderr, /qmd CLI is required/);
    assert.match(result.stderr, /npm install -g @tobilu\/qmd/);
    assert.match(result.stderr, /JUMPYBRAIN_QMD_BIN/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
