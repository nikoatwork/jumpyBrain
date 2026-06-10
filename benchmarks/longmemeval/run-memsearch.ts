import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

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
    "Usage: run-memsearch.ts --data <longmemeval_s_cleaned.json> --workspace-root <dir> --out <results.jsonl> [--limit N] [--question-id ID] [--question-type TYPE] [--k 10] [--resume]",
    "",
    "Materializes one Markdown memory workspace per selected question, indexes/searches it with the optional memsearch CLI, and writes normalized retrieval JSONL.",
    "Defaults to local no-paid-call mode: --provider onnx with per-question Milvus Lite state.",
  ].join("\n");
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function safeCollection(value) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `lme_${cleaned || "unknown"}`.slice(0, 200);
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

async function markdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(fullPath));
    } else if (entry.isFile() && /\.md(?:own)?$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatterValue(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.replace(/^['"]|['"]$/g, "");
  }
}

async function buildSessionMap(workspace) {
  const map = new Map();
  for (const file of await markdownFiles(workspace)) {
    const markdown = await readFile(file, "utf8");
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    const sessionMatch = match?.[1]?.match(/^session_id:\s*(.+)$/m);
    const sessionId = sessionMatch ? String(parseFrontmatterValue(sessionMatch[1])) : undefined;
    if (!sessionId) continue;
    map.set(path.resolve(file), sessionId);
    map.set(path.relative(process.cwd(), file), sessionId);
    map.set(path.relative(workspace, file), sessionId);
  }
  return map;
}

function runCli(bin, args, options = {}) {
  return spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
}

function preflight(bin) {
  const result = runCli(bin, ["--version"]);
  if (result.error && result.error.message.includes("ENOENT")) {
    return `memsearch CLI not found. Install optional deps with: uv tool install \"memsearch[onnx]\" or pip install \"memsearch[onnx]\"`;
  }
  if (result.status !== 0) {
    return `memsearch preflight failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`;
  }
  return undefined;
}

function memsearchArgs(baseArgs, options) {
  const args = [...baseArgs];
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.collection) args.push("--collection", options.collection);
  if (options.milvusUri) args.push("--milvus-uri", options.milvusUri);
  if (options.milvusToken) args.push("--milvus-token", options.milvusToken);
  return args;
}

function parseMemsearchJson(stdout) {
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.results)) return parsed.results;
  return [];
}

function relativeFile(source) {
  if (!source) return undefined;
  const resolved = path.resolve(String(source));
  return path.relative(process.cwd(), resolved);
}

function sessionIdForSource(source, sessionMap) {
  if (!source) return undefined;
  const resolved = path.resolve(String(source));
  return sessionMap.get(resolved) ?? sessionMap.get(String(source)) ?? sessionMap.get(path.relative(process.cwd(), resolved));
}

function normalizeHit(hit, index, sessionMap) {
  const source = hit.source ?? hit.file ?? hit.path;
  const snippet = String(hit.content ?? hit.snippet ?? hit.text ?? "");
  const sessionId = sessionIdForSource(source, sessionMap);
  return {
    id: hit.chunk_hash ?? hit.id ?? `memsearch-${index + 1}`,
    score: typeof hit.score === "number" ? hit.score : Number(hit.score ?? 0),
    snippet,
    path: relativeFile(source),
    file: relativeFile(source),
    session_id: sessionId,
    provenance: {
      file: relativeFile(source),
      session_id: sessionId,
      heading: hit.heading,
      lineStart: hit.start_line,
      lineEnd: hit.end_line,
      chunk_hash: hit.chunk_hash,
    },
    metadata: {
      adapter: "memsearch",
      heading: hit.heading,
      heading_level: hit.heading_level,
      chunk_hash: hit.chunk_hash,
    },
  };
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
  const provider = String(args.provider || "onnx");
  const model = args.model ? String(args.model) : undefined;
  const bin = String(args["memsearch-bin"] || "memsearch");
  const stateRoot = path.resolve(String(args["state-root"] || path.join(".bench-tmp", "longmemeval", "memsearch-state")));
  const sharedMilvusUri = args["milvus-uri"] ? path.resolve(String(args["milvus-uri"])) : undefined;
  const milvusToken = args["milvus-token"] ? String(args["milvus-token"]) : undefined;

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
  await mkdir(stateRoot, { recursive: true });

  const existingRows = args.resume && existsSync(absoluteOut)
    ? await readFile(absoluteOut, "utf8").then(readExistingJsonl).catch(() => [])
    : [];
  const existingByQuestionId = new Map(existingRows.map((row) => [String(row.question_id), row]));
  const lines = existingRows.map((row) => JSON.stringify(row));
  const preflightError = preflight(bin);

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const questionId = String(item.question_id);
    if (existingByQuestionId.has(questionId)) {
      console.error(`[${index + 1}/${selected.length}] ${questionId} skipped (resume)`);
      continue;
    }

    const workspace = await materializeItem(item, absoluteWorkspaceRoot);
    const sessionMap = await buildSessionMap(workspace);
    const collection = safeCollection(questionId);
    const perQuestionState = path.join(stateRoot, slug(questionId));
    await mkdir(perQuestionState, { recursive: true });
    const milvusUri = sharedMilvusUri || path.join(perQuestionState, "milvus.db");
    await mkdir(path.dirname(milvusUri), { recursive: true });
    const started = performance.now();

    let results = [];
    let error = preflightError;

    if (!error) {
      const options = { provider, model, collection, milvusUri, milvusToken };
      const indexArgs = memsearchArgs(["index", workspace, "--force"], options);
      const indexResult = runCli(bin, indexArgs);
      if (indexResult.status === 0) {
        const searchArgs = memsearchArgs(["search", String(item.question), "--top-k", String(k), "--json-output"], options);
        const searchResult = runCli(bin, searchArgs);
        if (searchResult.status === 0) {
          try {
            results = parseMemsearchJson(searchResult.stdout).map((hit, hitIndex) => normalizeHit(hit, hitIndex, sessionMap));
          } catch (parseError) {
            error = `search JSON parse failed: ${parseError.message}\nstdout:\n${searchResult.stdout.slice(0, 2000)}`;
          }
        } else {
          error = `search failed: ${searchResult.stderr || searchResult.stdout}`;
        }
      } else {
        error = `index failed: ${indexResult.stderr || indexResult.stdout}`;
      }
    }

    const latencyMs = Math.round(performance.now() - started);
    lines.push(JSON.stringify({
      question_id: questionId,
      question_type: item.question_type ?? "unknown",
      adapter: "memsearch",
      workspace: path.relative(process.cwd(), workspace),
      latency_ms: latencyMs,
      returned_chars: returnedChars(results),
      cli_error: error,
      memsearch: {
        provider,
        model,
        collection,
        milvus_uri: path.relative(process.cwd(), milvusUri),
      },
      results,
    }));

    console.error(`[${index + 1}/${selected.length}] ${questionId} results=${results.length} latency_ms=${latencyMs}${error ? " ERROR" : ""}`);
  }

  await writeFile(absoluteOut, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ out: path.relative(process.cwd(), absoluteOut), count: selected.length, adapter: "memsearch" }, null, 2));
}
