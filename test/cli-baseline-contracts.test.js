import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

const validWrapup = [
  "## Findings",
  "- Baseline command contracts are covered by smoke tests.",
  "",
  "## Decisions",
  "- Keep public CLI command behavior stable during refactors.",
  "",
  "## Conflicts / Corrections",
  "- None captured.",
  "",
  "## Open Questions",
  "- Which command handlers should move first?",
  "",
].join("\n");

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

function assertUsageContract(output) {
  for (const expected of [
    "jumpybrain --version",
    "jumpybrain instructions",
    "jumpybrain doctor [--root <memory-root>] [--json]",
    "jumpybrain update [--dry-run] [--install-root <path>]",
    "jumpybrain serve --root <memory-root> --host 127.0.0.1 --port 3787",
    "jumpybrain run memory:remember --type finding --title \"...\"",
    "jumpybrain run memory:recall --topic \"...\" --limit 5",
    "jumpybrain init --root <memory-root>",
    "jumpybrain status --root <memory-root> --json",
    "jumpybrain recall --root <memory-root> --topic \"...\" --limit 5 --depth shallow",
    "jumpybrain recall --root <memory-root> --query \"...\" --limit 10 --depth normal --json",
    "jumpybrain show --root <memory-root> --id <mem_id> [--json]",
    "jumpybrain show --target-url <url> --id <mem_id> [--json]",
    "jumpybrain dream --root <memory-root>|--target-url <url> [--out dream-batch.json] [--json]",
    "jumpybrain dream --root <memory-root>|--target-url <url> --status|--complete <batch-id>|--abandon <batch-id>",
    "jumpybrain dream --root <memory-root>|--target-url <url> --apply-manifest dream-manifest.json",
    "cat revised.md | jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> [--json]",
    "cat revised.md | jumpybrain update --target-url <url> --id <mem_id> --if-match <contentHash> [--json]",
    "jumpybrain process --root <memory-root> --mode lint|synthesize|ensure-ids [--topic \"...\"] --apply",
    "cat memory.md | jumpybrain remember --root <memory-root> --type finding --title \"...\"",
    "cat wrapup.md | jumpybrain wrapup --root <memory-root> --title \"...\" --topic \"...\"",
  ]) {
    assert.match(output, new RegExp(escapeRegExp(expected)), `usage should include: ${expected}`);
  }
}

test("CLI help and instructions expose stable command names and important flags", () => {
  const help = runCli(["help"]).stdout;
  const flagHelp = runCli(["--help"]).stdout;
  assert.equal(flagHelp, help);
  assertUsageContract(help);

  const instructions = runCli(["instructions"]).stdout;
  assert.match(instructions, /jumpyBrain memory hint for coding agents/);
  assert.match(instructions, /jumpybrain run memory:recall --topic/);
  assert.match(instructions, /--depth shallow\|normal\|deep/);
  assert.match(instructions, /jumpybrain show --root <memory-root> --id <mem_id>/);
  assert.match(instructions, /process --root <memory-root> --mode ensure-ids --apply/);
  assert.match(instructions, /Do not memorize secrets/);
});

test("CLI local baseline smoke covers doctor, init, status, remember, recall, wrapup, and process lint JSON", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-cli-baseline-"));
  const memoryRoot = path.join(temp, "memory");
  try {
    const init = JSON.parse(runCli(["init", "--root", memoryRoot, "--json"]).stdout);
    assert.equal(init.configFile, "jumpybrain.json");
    assert.equal(init.schemaVersion, 1);
    assert.deepEqual(init.memoryDirs, ["notes", "sessions", "findings", "decisions", "preferences", "pages"]);

    const status = JSON.parse(runCli(["status", "--root", memoryRoot, "--json"]).stdout);
    const recipeStatus = JSON.parse(runCli(["run", "memory:status", "--root", memoryRoot, "--json"]).stdout);
    assert.deepEqual(recipeStatus, status);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);
    assert.equal(status.schemaVersion, 1);

    const doctor = JSON.parse(runCli(["doctor", "--root", memoryRoot, "--json"], {
      env: { HOME: temp, JUMPYBRAIN_QMD_BIN: process.execPath },
    }).stdout);
    assert.equal(doctor.cli.ok, true);
    assert.equal(doctor.node.ok, true);
    assert.equal(doctor.qmd.ok, true);
    assert.equal(doctor.memoryRoot.ok, true);
    assert.equal(doctor.memoryRoot.initialized, true);

    const remembered = JSON.parse(runCli(["remember", "--root", memoryRoot, "--type", "finding", "--title", "Baseline CLI smoke", "--tag", "contract", "--json"], {
      input: "The baseline CLI smoke remembers the violet-lantern contract marker.\n",
    }).stdout);
    assert.equal(remembered.indexed, true);
    assert.match(remembered.file, /^findings\/\d{4}-\d{2}-\d{2}-baseline-cli-smoke/);

    const recall = JSON.parse(runCli(["recall", "--root", memoryRoot, "--topic", "violet-lantern contract marker", "--limit", "3", "--json"]).stdout);
    const recipeRecall = JSON.parse(runCli(["run", "memory:recall", "--root", memoryRoot, "--topic", "violet-lantern contract marker", "--limit", "3", "--json"]).stdout);
    assert.equal(recall.mode, "recall");
    assert.equal(recipeRecall.mode, "recall");
    assert.equal(recipeRecall.query, recall.query);
    assert.equal(recipeRecall.results[0].provenance.file, remembered.file);
    assert.equal(recall.query, "violet-lantern contract marker");
    assert.equal(recall.results[0].provenance.file, remembered.file);
    assert.match(recall.results[0].snippet, /violet-lantern contract marker/);

    const wrapup = JSON.parse(runCli(["wrapup", "--root", memoryRoot, "--title", "Baseline CLI wrapup", "--topic", "violet-lantern contract marker", "--json"], {
      input: validWrapup,
    }).stdout);
    assert.match(wrapup.file, /^sessions\/\d{4}-\d{2}-\d{2}-baseline-cli-wrapup/);
    assert.equal(wrapup.validation.valid, true);
    assert.equal(wrapup.relatedMemory.skipped, false);
    assert.ok(wrapup.relatedMemory.results.some((result) => result.provenance.file === remembered.file));

    await mkdir(path.join(memoryRoot, "pages"), { recursive: true });
    await writeFile(path.join(memoryRoot, "pages", "baseline-command-contract.md"), [
      "---",
      'type: "page"',
      'title: "Baseline command contract"',
      'topic: "baseline command contract"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      "---",
      "",
      "# Baseline command contract",
      "",
      "This page intentionally lacks source memory links for deterministic lint coverage.",
      "",
    ].join("\n"));

    const lint = JSON.parse(runCli(["process", "--root", memoryRoot, "--mode", "lint", "--topic", "baseline command contract", "--apply", "--json"]).stdout);
    assert.equal(lint.mode, "lint");
    assert.equal(lint.applied, true);
    assert.match(lint.files[0], /^\.jumpybrain\/reports\/lint-/);
    const report = await readFile(path.join(memoryRoot, lint.files[0]), "utf8");
    assert.match(report, /missing an explicit Source memories section/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
