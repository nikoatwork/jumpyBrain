import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  return [
    "Usage: materialize.ts --fixture <mini-longmemeval.json> --out <workspace-root>",
    "",
    "Creates one deterministic Markdown memory workspace per question.",
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
  return JSON.stringify(String(value));
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
  const turns = session.turns.length > 0 ? session.turns : [{ role: "note", content: "No turns were present in this fixture session." }];

  return [
    "---",
    `source: ${frontmatterValue("longmemeval")}`,
    `question_id: ${frontmatterValue(questionId)}`,
    `session_id: ${frontmatterValue(sessionId)}`,
    `date: ${frontmatterValue(date)}`,
    "---",
    "",
    `# Session ${sessionIndex + 1}: ${sessionId}`,
    "",
    ...turns.map((turn, turnIndex) => renderTurn(turn, turnIndex)),
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const fixturePath = args.fixture || args.input;
  const outputRoot = args.out;

  if (!fixturePath || !outputRoot) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!Array.isArray(fixture)) {
    throw new Error("Fixture must be a JSON array of LongMemEval-like items.");
  }

  const absoluteOutputRoot = path.resolve(outputRoot);
  await mkdir(absoluteOutputRoot, { recursive: true });

  const workspaces = [];
  for (const item of fixture) {
    if (!item.question_id) {
      throw new Error("Every fixture item must include question_id.");
    }

    const questionId = String(item.question_id);
    const workspaceDir = path.join(absoluteOutputRoot, slug(questionId));
    const sessionsDir = path.join(workspaceDir, "sessions");

    await rm(workspaceDir, { recursive: true, force: true });
    await mkdir(sessionsDir, { recursive: true });

    const sessions = normalizeSessions(item);
    const files = [];
    for (let index = 0; index < sessions.length; index += 1) {
      const session = sessions[index];
      const filename = `${String(index + 1).padStart(2, "0")}-${slug(session.session_id)}.md`;
      const filePath = path.join(sessionsDir, filename);
      await writeFile(filePath, renderSession({ item, session, sessionIndex: index }), "utf8");
      files.push(path.relative(process.cwd(), filePath));
    }

    workspaces.push({
      question_id: questionId,
      workspace: path.relative(process.cwd(), workspaceDir),
      files,
    });
  }

  console.log(JSON.stringify({ output_root: path.relative(process.cwd(), absoluteOutputRoot), workspaces }, null, 2));
}
