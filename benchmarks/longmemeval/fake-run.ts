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
  return "Usage: fake-run.ts --fixture <mini-longmemeval.json> --out <results.jsonl> [--workspace-root <root>]";
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function resultForSession({ item, sessionId, rank, workspaceRoot }) {
  const sessionIndex = item.haystack_session_ids.indexOf(sessionId);
  const filename = `${String(sessionIndex + 1).padStart(2, "0")}-${slug(sessionId)}.md`;
  return {
    rank,
    session_id: sessionId,
    path: path.join(workspaceRoot, slug(item.question_id), "sessions", filename),
    snippet: `Synthetic retrieval snippet for ${sessionId}.`,
  };
}

function plannedSessionIds(item) {
  const haystackIds = Array.isArray(item.haystack_session_ids) ? item.haystack_session_ids : [];
  const answerIds = Array.isArray(item.answer_session_ids) ? item.answer_session_ids : [];
  const distractors = haystackIds.filter((sessionId) => !answerIds.includes(sessionId));

  if (String(item.question_id).includes("miss")) {
    return distractors.length > 0 ? distractors : haystackIds.filter((sessionId) => !answerIds.includes(sessionId));
  }

  return [...answerIds, ...distractors].slice(0, 10);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const fixturePath = args.fixture || args.input;
  const outputPath = args.out;
  const workspaceRoot = args["workspace-root"] || ".bench-tmp/longmemeval/workspaces";

  if (!fixturePath || !outputPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!Array.isArray(fixture)) {
    throw new Error("Fixture must be a JSON array of LongMemEval-like items.");
  }

  const lines = fixture.map((item) => {
    const sessionIds = plannedSessionIds(item);
    const results = sessionIds.map((sessionId, index) => resultForSession({
      item,
      sessionId,
      rank: index + 1,
      workspaceRoot,
    }));

    return JSON.stringify({
      question_id: item.question_id,
      question_type: item.question_type,
      query: item.question,
      results,
    });
  });

  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${lines.length} fake retrieval rows to ${outputPath}`);
}
