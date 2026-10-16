import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compactSearchMemory, expandMemoryDocument, readMarkdownDocuments, readMemoryDocument } from "../dist/runtime/index.js";
import { manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { installFakeQmd } from "./fake-qmd-helper.js";
import { parseArgs } from "../dist/cli/args.js";
import { isReadInvocation } from "../dist/cli/remote-access-policy.js";

const execute = promisify(execFile);
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const id = "mem_80000000-0000-4000-8000-000000000001";
const run = (args, env = {}) => execute(process.execPath, [cli, ...args], { env: { ...process.env, ...env } });

test("bounded CLI local/remote/recipe output is exactly one budgeted JSON packet, with legacy show preserved", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-bounded-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "notes"));
  const content = `---\nid: ${id}\ncreated_at: 2024-01-01\n---\n# Trial\nCalibration is provisional. NOT approved for production.\n\n# Detail\n${"Only under supervision. 🐙\n".repeat(60)}`;
  await writeFile(path.join(root, "notes/trial.md"), content);
  const { bin } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}\nconsole.log(JSON.stringify([{file:'qmd://jumpybrain/notes/trial.md', score:0.9, line:6, snippet:'Calibration is provisional. NOT approved for production.'}]));\n`);
  await chmod(bin, 0o755);
  const prior = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = bin;
  t.after(() => { if (prior === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = prior; });
  await mkdir(path.dirname(manifestPath(root)), { recursive: true });
  await writeFile(manifestPath(root), JSON.stringify({ version: 1, root, qmdCollection: "jumpybrain", generatedAt: new Date(0).toISOString(), documents: await readMarkdownDocuments(root) }));
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["secret"], port: 0, autoIndex: false, logger: { log() {}, info() {}, warn() {}, error() {} } });
  t.after(() => server.close());
  const policy = path.join(root, "policy.json");
  await writeFile(policy, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: server.url, access: "read-only" }] }));
  const env = { JUMPYBRAIN_API_KEY: "secret", JUMPYBRAIN_CLI_CONFIG: policy };
  for (const target of [["--root", root], ["--target-url", server.url]]) {
    for (const command of [["recall"], ["search"], ["run", "memory:recall"]]) {
      for (const json of [[], ["--json"]]) {
        const { stdout, stderr } = await run([...command, ...target, "--query", "calibration", "--limit", "5", "--compact", "--max-bytes=2048", ...json], env);
        const expected = await compactSearchMemory(root, "calibration", 5, { maxBytes: 2048 });
        assert.equal(stdout, JSON.stringify(expected) + "\n");
        assert.equal(stderr, "");
        assert.ok(Buffer.byteLength(stdout) <= 2048);
        assert.match(stdout, /NOT approved/);
      }
    }
    const read = await readMemoryDocument(root, id);
    for (const command of [["expand"], ["run", "memory:expand"]]) {
      const options = { id, expectedContentHash: read.contentHash, sectionLine: 10, maxBytes: 1024 };
      const { stdout, stderr } = await run([...command, ...target, "--id", id, "--if-match", read.contentHash, "--section-line", "10", "--max-bytes", "1024"], env);
      assert.equal(stdout, JSON.stringify(await expandMemoryDocument(root, options)) + "\n");
      assert.equal(stderr, "");
      const partial = JSON.parse(stdout);
      assert.equal(partial.partial, true);
      const continued = await run([...command, ...target, "--id", id, "--if-match", read.contentHash,
        "--start-line", String(partial.continuationLine), "--end-line", String(partial.requestedEndLine), "--json"], env);
      assert.equal(JSON.parse(continued.stdout).startLine, partial.continuationLine);
    }
    const shown = JSON.parse((await run(["show", ...target, "--id", id, "--json"], env)).stdout);
    assert.equal(shown.content, content);
    const legacy = JSON.parse((await run(["recall", ...target, "--topic", "calibration", "--json"], env)).stdout);
    assert.ok(legacy.results.length);
    assert.equal(legacy.mode, "recall");
  }
  const read = await readMemoryDocument(root, id);
  await writeFile(path.join(root, "notes/trial.md"), content + "changed\n");
  for (const target of [["--root", root], ["--target-url", server.url]]) {
    await assert.rejects(run(["expand", ...target, "--id", id, "--if-match", read.contentHash], env), error => {
      assert.equal(error.stdout, "");
      assert.match(error.stderr, /stale|refresh/i);
      return true;
    });
  }
  assert.equal(await readFile(path.join(root, "notes/trial.md"), "utf8"), content + "changed\n");
});

test("bounded flags fail clearly before credentials and never silently discard budgets or ranges", async () => {
  for (const args of [
    ["recall", "--read-only=false"], ["recall", "--read-only", "false"], ["recall", "--read-only", "--read-only"],
    ["recall", "--compact", "false"], ["recall", "--compact", "--max-bytes"],
    ["recall", "--compact", "--max-bytes", "1023"], ["recall", "--compact", "--max-bytes", "NaN"],
    ["recall", "--compact", "--max-bytes", "1024", "--max-bytes", "2048"],
    ["recall", "--compact", "--diagnostics", "false"], ["recall", "--max-bytes=1024"],
    ["recall", "--compact", "--limit", "1.5"], ["expand", "--id", id],
    ["expand", "--id", id, "--if-match", "bad"],
    ["expand", "--id", id, "--if-match", "sha256:" + "a".repeat(64), "--start-line", "0"],
    ["expand", "--id", id, "--if-match", "sha256:" + "a".repeat(64), "--section-line", "8", "--end-line", "9"],
    ["expand", "--id", id, "--if-match", "sha256:" + "a".repeat(64), "--strat-line", "9"],
  ]) {
    await assert.rejects(run([...args, "--target-url", "https://memory.invalid"], { JUMPYBRAIN_API_KEY: "", JUMPYBRAIN_CLI_CONFIG: "/tmp/nonexistent-bounded-policy" }), error => {
      assert.equal(error.stdout, "");
      assert.doesNotMatch(error.stderr, /JUMPYBRAIN_API_KEY is required|fetch failed/);
      return true;
    });
  }
  for (const args of [["expand"], ["run", "memory:expand"], ["recall", "--compact"]]) assert.ok(isReadInvocation(parseArgs(args)));
});
