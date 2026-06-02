import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const fixturePath = path.join(repoRoot, "benchmarks/longmemeval/fixtures/mini-longmemeval.json");
const runnerPath = path.join(repoRoot, "benchmarks/longmemeval/run-script.mjs");

function runScript(scriptName, args) {
  const result = spawnSync(
    process.execPath,
    [runnerPath, path.join(repoRoot, `benchmarks/longmemeval/${scriptName}.ts`), ...args],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${scriptName} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

test("materialize writes deterministic Markdown workspaces without gold labels", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-longmemeval-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspaces");
    runScript("materialize", ["--fixture", fixturePath, "--out", workspaceRoot]);

    const expectedFile = path.join(
      workspaceRoot,
      "q-single-release-notes",
      "sessions",
      "01-s-alpha.md",
    );
    assert.equal(existsSync(expectedFile), true);

    const markdown = await readFile(expectedFile, "utf8");
    assert.match(markdown, /source: "longmemeval"/);
    assert.match(markdown, /question_id: "q-single-release-notes"/);
    assert.match(markdown, /session_id: "s-alpha"/);
    assert.match(markdown, /date: "2026-01-05"/);
    assert.match(markdown, /## User/);
    assert.match(markdown, /## Assistant/);
    assert.match(markdown, /docs\/releases\/q2\.md/);
    assert.doesNotMatch(markdown, /has_answer/);
    assert.doesNotMatch(markdown, /answer_session_ids/);

    assert.equal(
      existsSync(path.join(workspaceRoot, "q-multi-safeguards", "sessions", "02-s-charlie.md")),
      true,
    );
    assert.equal(
      existsSync(path.join(workspaceRoot, "q-miss-owner", "sessions", "01-s-delta.md")),
      true,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("fake run and scorer cover hit, miss, and multi-evidence cases", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-longmemeval-"));
  try {
    const workspaceRoot = path.join(tempRoot, "workspaces");
    const runPath = path.join(tempRoot, "results", "fake.jsonl");
    const summaryPath = path.join(tempRoot, "results", "summary.json");
    const failureReportPath = path.join(tempRoot, "results", "failures.json");

    runScript("materialize", ["--fixture", fixturePath, "--out", workspaceRoot]);
    runScript("fake-run", [
      "--fixture",
      fixturePath,
      "--workspace-root",
      workspaceRoot,
      "--out",
      runPath,
    ]);
    const scoreResult = runScript("score", [
      "--fixture",
      fixturePath,
      "--run",
      runPath,
      "--summary-json",
      summaryPath,
      "--failure-report",
      failureReportPath,
    ]);

    assert.match(scoreResult.stdout, /LongMemEval retrieval scaffold summary/);

    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    assert.equal(summary.count, 3);
    assert.equal(summary.overall.hit_at_1, 2 / 3);
    assert.equal(summary.overall.hit_at_5, 2 / 3);
    assert.equal(summary.overall.hit_at_10, 2 / 3);
    assert.equal(summary.overall.mrr, 2 / 3);
    assert.equal(summary.overall.all_evidence_at_10, 2 / 3);
    assert.ok(summary.overall.returned_chars > 0);
    assert.ok(summary.overall.returned_chars_p50 > 0);
    assert.ok(summary.overall.returned_chars_p95 >= summary.overall.returned_chars_p50);
    assert.equal(summary.failures_at_10.length, 1);

    const failureReport = JSON.parse(await readFile(failureReportPath, "utf8"));
    assert.equal(failureReport.count, 1);
    assert.equal(failureReport.failures[0].question_id, "q-miss-owner");
    assert.ok(Array.isArray(failureReport.failures[0].top_results));

    const single = summary.per_question.find((item) => item.question_id === "q-single-release-notes");
    assert.equal(single.hit_at_1, 1);

    const multi = summary.per_question.find((item) => item.question_id === "q-multi-safeguards");
    assert.equal(multi.all_evidence_at_10, 1);
    assert.deepEqual(multi.answer_session_ids, ["s-bravo", "s-charlie"]);

    const miss = summary.per_question.find((item) => item.question_id === "q-miss-owner");
    assert.equal(miss.hit_at_10, 0);
    assert.equal(miss.mrr, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
