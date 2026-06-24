import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: run-retrieval.ts --data <longmemeval_s_cleaned.json> --workspace-root <dir> --out <results.jsonl> [--limit N] [--question-id ID] [--question-type TYPE] [--k 10] [--resume]",
    "",
    "Materializes one Markdown memory workspace per selected question, runs the jumpyBrain runtime index/search APIs, and writes retrieval JSONL.",
  ].join("\n");
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function frontmatterValue(value) {
  return JSON.stringify(String(value ?? ""));
}

function renderTurn(turn, turnIndex) {
  const role = turn && turn.role ? String(turn.role) : `turn-${turnIndex + 1}`;
  const title = role.charAt(0).toUpperCase() + role.slice(1);
  const content = turn && turn.content ? String(turn.content).trim() : "";
  return `## ${title}\n\n${content}\n`;
}

function normalizeSessions(item) {
  if (!Array.isArray(item.haystack_sessions)) return [];

  return item.haystack_sessions.map((session, index) => {
    if (Array.isArray(session)) {
      return {
        session_id: item.haystack_session_ids?.[index] ?? `session-${index + 1}`,
        date: item.haystack_dates?.[index] ?? "",
        turns: session,
      };
    }

    return {
      session_id: session?.session_id ?? item.haystack_session_ids?.[index] ?? `session-${index + 1}`,
      date: session?.date ?? item.haystack_dates?.[index] ?? "",
      turns: Array.isArray(session?.turns) ? session.turns : [],
    };
  });
}

function renderSession({ item, session, sessionIndex }) {
  const questionId = String(item.question_id);
  const sessionId = String(session.session_id);
  const date = String(session.date ?? "");
  const turns = session.turns.length > 0 ? session.turns : [{ role: "note", content: "No turns were present in this session." }];

  return [
    "---",
    `source: ${frontmatterValue("longmemeval")}`,
    `question_id: ${frontmatterValue(questionId)}`,
    `session_id: ${frontmatterValue(sessionId)}`,
    `date: ${frontmatterValue(date)}`,
    `question_type: ${frontmatterValue(item.question_type ?? "unknown")}`,
    "---",
    "",
    `# Session ${sessionIndex + 1}: ${sessionId}`,
    "",
    ...turns.map((turn, turnIndex) => renderTurn(turn, turnIndex)),
  ].join("\n");
}

function selectItems(items, args) {
  let selected = items;
  if (args["question-id"]) selected = selected.filter((item) => String(item.question_id) === String(args["question-id"]));
  if (args["question-type"]) selected = selected.filter((item) => String(item.question_type) === String(args["question-type"]));
  if (args.limit) selected = selected.slice(0, Number(args.limit));
  return selected;
}

function validateItems(items) {
  const required = ["question_id", "question", "question_type", "haystack_sessions", "answer_session_ids"];
  const errors = [];
  items.forEach((item, index) => {
    for (const field of required) {
      if (item[field] === undefined || item[field] === null) errors.push(`item[${index}] missing ${field}`);
    }
    if (!Array.isArray(item.haystack_sessions)) errors.push(`item[${index}] haystack_sessions must be an array`);
    if (!Array.isArray(item.answer_session_ids)) errors.push(`item[${index}] answer_session_ids must be an array`);
  });
  if (errors.length > 0) {
    throw new Error(`Invalid LongMemEval data:\n${errors.slice(0, 20).join("\n")}${errors.length > 20 ? `\n...${errors.length - 20} more` : ""}`);
  }
}

function readExistingJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function materializeItem(item, workspaceRoot) {
  const questionId = String(item.question_id);
  const workspaceDir = path.join(workspaceRoot, slug(questionId));
  const sessionsDir = path.join(workspaceDir, "sessions");

  await rm(workspaceDir, { recursive: true, force: true });
  await mkdir(sessionsDir, { recursive: true });

  const sessions = normalizeSessions(item);
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const filename = `${String(index + 1).padStart(2, "0")}-${slug(session.session_id)}.md`;
    await writeFile(path.join(sessionsDir, filename), renderSession({ item, session, sessionIndex: index }), "utf8");
  }

  return workspaceDir;
}

async function loadRuntime() {
  return import(pathToFileURL(path.resolve("dist/runtime/index.js")).href);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function returnedChars(results) {
  if (!Array.isArray(results)) return 0;
  return results.reduce((total, result) => total + (typeof result?.snippet === "string" ? result.snippet.length : 0), 0);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dataPath = args.data || args.fixture || args.input;
  const workspaceRoot = args["workspace-root"];
  const outPath = args.out;
  const k = Number(args.k || args.limitResults || 10);

  if (!dataPath || !workspaceRoot || !outPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const data = JSON.parse(await readFile(dataPath, "utf8"));
  if (!Array.isArray(data)) throw new Error("LongMemEval data must be a JSON array.");
  validateItems(data);
  const selected = selectItems(data, args);
  if (selected.length === 0) throw new Error("No benchmark items selected.");

  const absoluteWorkspaceRoot = path.resolve(String(workspaceRoot));
  const absoluteOut = path.resolve(String(outPath));
  await mkdir(absoluteWorkspaceRoot, { recursive: true });
  await mkdir(path.dirname(absoluteOut), { recursive: true });

  const existingRows = args.resume
    ? await readFile(absoluteOut, "utf8").then(readExistingJsonl).catch(() => [])
    : [];
  const existingByQuestionId = new Map(existingRows.map((row) => [String(row.question_id), row]));
  const lines = existingRows.map((row) => JSON.stringify(row));
  const runtime = await loadRuntime();

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const questionId = String(item.question_id);
    if (existingByQuestionId.has(questionId)) {
      console.error(`[${index + 1}/${selected.length}] ${questionId} skipped (resume)`);
      continue;
    }

    const workspace = await materializeItem(item, absoluteWorkspaceRoot);
    const started = performance.now();

    let results = [];
    let error;

    try {
      await runtime.indexMemory(workspace);
    } catch (indexError) {
      error = `index failed: ${errorMessage(indexError)}`;
    }

    if (!error) {
      try {
        results = (await runtime.searchMemory(workspace, String(item.question), k)).results ?? [];
      } catch (searchError) {
        error = `search failed: ${errorMessage(searchError)}`;
      }
    }

    const latencyMs = Math.round(performance.now() - started);
    lines.push(JSON.stringify({
      question_id: questionId,
      question_type: item.question_type ?? "unknown",
      adapter: "jumpybrain",
      workspace: path.relative(process.cwd(), workspace),
      latency_ms: latencyMs,
      returned_chars: returnedChars(results),
      cli_error: error,
      results,
    }));

    console.error(`[${index + 1}/${selected.length}] ${questionId} results=${results.length} latency_ms=${latencyMs}${error ? " ERROR" : ""}`);
  }

  await writeFile(absoluteOut, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ out: path.relative(process.cwd(), absoluteOut), count: selected.length }, null, 2));
}
