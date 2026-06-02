import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return "Usage: score.ts --fixture <mini-longmemeval.json> --run <retrieval.jsonl> [--summary-json <summary.json>] [--failure-report <failures.json>] [--limit N] [--question-id ID] [--question-type TYPE]";
}

function readJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL on line ${index + 1}: ${error.message}`);
      }
    });
}

function retrievedSessionIds(row) {
  if (Array.isArray(row.retrieved_session_ids)) {
    return row.retrieved_session_ids.map(String);
  }

  if (Array.isArray(row.results)) {
    return row.results
      .map((result) => result?.session_id ?? result?.provenance?.session_id)
      .filter((sessionId) => sessionId !== undefined && sessionId !== null)
      .map(String);
  }

  return [];
}

function returnedChars(row) {
  if (typeof row.returned_chars === "number") return row.returned_chars;
  if (!Array.isArray(row.results)) return 0;
  return row.results.reduce((total, result) => {
    if (typeof result?.snippet === "string") return total + result.snippet.length;
    if (typeof result?.text === "string") return total + result.text.length;
    return total;
  }, 0);
}

function compactResults(row) {
  if (!Array.isArray(row.results)) return [];
  return row.results.slice(0, 10).map((result, index) => ({
    rank: index + 1,
    session_id: String(result?.session_id ?? result?.provenance?.session_id ?? ""),
    file: result?.file ?? result?.path ?? result?.provenance?.file,
    score: typeof result?.score === "number" ? result.score : undefined,
    scoreBreakdown: result?.scoreBreakdown,
    snippet: typeof result?.snippet === "string" ? result.snippet.slice(0, 500) : undefined,
  }));
}

function selectItems(items, args) {
  let selected = items;
  if (args["question-id"]) selected = selected.filter((item) => String(item.question_id) === String(args["question-id"]));
  if (args["question-type"]) selected = selected.filter((item) => String(item.question_type) === String(args["question-type"]));
  if (args.limit) selected = selected.slice(0, Number(args.limit));
  return selected;
}

function scoreItem(item, row) {
  const gold = new Set((Array.isArray(item.answer_session_ids) ? item.answer_session_ids : []).map(String));
  const retrieved = retrievedSessionIds(row);
  const firstHitIndex = retrieved.findIndex((sessionId) => gold.has(sessionId));
  const hasAllEvidenceAt10 = gold.size > 0 && [...gold].every((sessionId) => retrieved.slice(0, 10).includes(sessionId));
  const hitAt10 = firstHitIndex >= 0 && firstHitIndex < 10 ? 1 : 0;

  return {
    question_id: String(item.question_id),
    question_type: String(item.question_type ?? "unknown"),
    question: String(item.question ?? ""),
    answer_session_ids: [...gold],
    retrieved_session_ids: retrieved,
    returned_chars: returnedChars(row),
    latency_ms: typeof row.latency_ms === "number" ? row.latency_ms : 0,
    cli_error: row.cli_error || undefined,
    hit_at_1: firstHitIndex >= 0 && firstHitIndex < 1 ? 1 : 0,
    hit_at_5: firstHitIndex >= 0 && firstHitIndex < 5 ? 1 : 0,
    hit_at_10: hitAt10,
    mrr: firstHitIndex >= 0 ? 1 / (firstHitIndex + 1) : 0,
    all_evidence_at_10: hasAllEvidenceAt10 ? 1 : 0,
    top_results: hitAt10 ? undefined : compactResults(row),
  };
}

function average(items, key) {
  if (items.length === 0) return 0;
  return items.reduce((total, item) => total + item[key], 0) / items.length;
}

function percentile(items, key, p) {
  if (items.length === 0) return 0;
  const values = items.map((item) => item[key]).sort((left, right) => left - right);
  const index = Math.ceil((p / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(values.length - 1, index))];
}

function summarizeScores(scores) {
  const metricKeys = ["hit_at_1", "hit_at_5", "hit_at_10", "mrr", "all_evidence_at_10", "returned_chars", "latency_ms"];
  const makeSummary = (items) => ({
    ...Object.fromEntries(metricKeys.map((key) => [key, average(items, key)])),
    returned_chars_p50: percentile(items, "returned_chars", 50),
    returned_chars_p95: percentile(items, "returned_chars", 95),
    latency_ms_p50: percentile(items, "latency_ms", 50),
    latency_ms_p95: percentile(items, "latency_ms", 95),
  });

  const byType = {};
  for (const score of scores) {
    byType[score.question_type] ??= [];
    byType[score.question_type].push(score);
  }

  return {
    count: scores.length,
    overall: makeSummary(scores),
    by_question_type: Object.fromEntries(Object.entries(byType).map(([type, items]) => [type, {
      count: items.length,
      ...makeSummary(items),
    }])),
    failures_at_10: scores.filter((score) => score.hit_at_10 === 0 || score.all_evidence_at_10 === 0),
    per_question: scores,
  };
}

function formatMetric(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function printSummary(summary) {
  console.log("LongMemEval retrieval scaffold summary");
  console.log(`questions: ${summary.count}`);
  console.log("overall:");
  for (const [key, value] of Object.entries(summary.overall)) {
    console.log(`  ${key}: ${formatMetric(value)}`);
  }
  console.log("by question_type:");
  for (const [type, values] of Object.entries(summary.by_question_type)) {
    console.log(`  ${type} (${values.count}):`);
    for (const [key, value] of Object.entries(values)) {
      if (key === "count") continue;
      console.log(`    ${key}: ${formatMetric(value)}`);
    }
  }
  console.log(`failures_at_10: ${summary.failures_at_10.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const fixturePath = args.fixture || args.input;
  const runPath = args.run;
  const summaryJsonPath = args["summary-json"];
  const failureReportPath = args["failure-report"];

  if (!fixturePath || !runPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!Array.isArray(fixture)) {
    throw new Error("Fixture must be a JSON array of LongMemEval-like items.");
  }

  const selected = selectItems(fixture, args);
  const rows = readJsonl(await readFile(runPath, "utf8"));
  const rowsByQuestionId = new Map(rows.map((row) => [String(row.question_id), row]));
  const scores = selected.map((item) => {
    const row = rowsByQuestionId.get(String(item.question_id)) ?? { question_id: item.question_id, results: [] };
    return scoreItem(item, row);
  });
  const summary = summarizeScores(scores);

  printSummary(summary);

  if (summaryJsonPath) {
    const resolved = path.resolve(String(summaryJsonPath));
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(`summary_json: ${path.relative(process.cwd(), resolved)}`);
  }

  if (failureReportPath) {
    const resolved = path.resolve(String(failureReportPath));
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify({ count: summary.failures_at_10.length, failures: summary.failures_at_10 }, null, 2)}\n`, "utf8");
    console.log(`failure_report: ${path.relative(process.cwd(), resolved)}`);
  }
}
