import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MEMORY_ROOT = process.env.JUMPYBRAIN_MEMORY_ROOT || "__JUMPYBRAIN_MEMORY_ROOT__";
const JUMPYBRAIN_BIN = process.env.JUMPYBRAIN_CLI || "__JUMPYBRAIN_CLI__";
const DEFAULT_TIMEOUT_MS = 120_000;

const limitSchema = Type.Optional(Type.Number({ description: "Maximum results to return. Defaults to 5 for recall and 10 for search." }));
const tagsSchema = Type.Optional(Type.Array(Type.String(), { description: "Optional memory tags." }));

export default function jumpybrainMemoryExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("jumpybrain", `memory: ${MEMORY_ROOT}`);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus("jumpybrain", undefined);
  });

  pi.registerTool({
    name: "jumpybrain_recall",
    label: "jumpyBrain Recall",
    description: "Recall relevant durable memory from the configured jumpyBrain memory root.",
    promptSnippet: "Search jumpyBrain memory with visible provenance before tasks that may depend on prior plans, preferences, decisions, or handoffs.",
    promptGuidelines: [
      "Use jumpybrain_recall when project or user memory would materially improve the answer.",
      "Keep recall explicit and bounded; do not silently inject memory.",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "Current task/topic to recall memory for." }),
      limit: limitSchema,
    }),
    async execute(_toolCallId, params) {
      return toolResult(await runJumpybrain(["recall", "--root", MEMORY_ROOT, "--topic", params.topic, "--limit", String(params.limit ?? 5)]));
    },
  });

  pi.registerTool({
    name: "jumpybrain_search",
    label: "jumpyBrain Search",
    description: "Run a specific search against configured jumpyBrain memory.",
    promptSnippet: "Search jumpyBrain memory for a specific question with provenance.",
    parameters: Type.Object({
      query: Type.String({ description: "Specific memory question or search query." }),
      limit: limitSchema,
      json: Type.Optional(Type.Boolean({ description: "Return jumpyBrain JSON output instead of human text." })),
    }),
    async execute(_toolCallId, params) {
      const args = ["recall", "--root", MEMORY_ROOT, "--query", params.query, "--limit", String(params.limit ?? 10)];
      if (params.json) args.push("--json");
      return toolResult(await runJumpybrain(args));
    },
  });

  pi.registerTool({
    name: "jumpybrain_remember",
    label: "jumpyBrain Remember",
    description: "Write a reviewed durable note to jumpyBrain memory.",
    promptSnippet: "Write durable non-secret findings, decisions, or preferences to jumpyBrain memory when the user asks to remember them.",
    promptGuidelines: [
      "Use jumpybrain_remember only when the user explicitly asks to remember/store something durable or clearly approves writing memory.",
      "Never store secrets, credentials, tokens, raw chat noise, or vague transient status in jumpyBrain memory.",
    ],
    parameters: Type.Object({
      type: Type.Union([Type.Literal("note"), Type.Literal("finding"), Type.Literal("decision"), Type.Literal("preference")], { description: "Memory note type." }),
      title: Type.String({ description: "Short title for the memory note." }),
      body: Type.String({ description: "Markdown body to store." }),
      tags: tagsSchema,
    }),
    async execute(_toolCallId, params) {
      const args = ["remember", "--root", MEMORY_ROOT, "--type", params.type, "--title", params.title];
      for (const tag of params.tags ?? []) args.push("--tag", tag);
      return toolResult(await runJumpybrain(args, params.body));
    },
  });

  pi.registerTool({
    name: "jumpybrain_wrapup",
    label: "jumpyBrain Wrapup",
    description: "Write an end-of-session wrapup to jumpyBrain memory.",
    promptSnippet: "At session end, write a strict durable wrapup after recall, if useful and approved.",
    promptGuidelines: [
      "Use jumpybrain_wrapup at session end only for durable findings, decisions, conflicts/corrections, and open questions.",
      "The body must include strict Markdown sections: ## Findings, ## Decisions, ## Conflicts / Corrections, ## Open Questions.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short wrapup title." }),
      topic: Type.Optional(Type.String({ description: "Recall topic to check for related memories before writing." })),
      body: Type.String({ description: "Strict Markdown wrapup body with required sections." }),
      tags: tagsSchema,
    }),
    async execute(_toolCallId, params) {
      const args = ["wrapup", "--root", MEMORY_ROOT, "--title", params.title];
      if (params.topic) args.push("--topic", params.topic);
      for (const tag of params.tags ?? []) args.push("--tag", tag);
      return toolResult(await runJumpybrain(args, params.body));
    },
  });

  pi.registerTool({
    name: "jumpybrain_index",
    label: "jumpyBrain Index",
    description: "Rebuild the configured jumpyBrain memory index.",
    promptSnippet: "Rebuild the jumpyBrain index after memory Markdown changes.",
    parameters: Type.Object({}),
    async execute() {
      return toolResult(await runJumpybrain(["index", "--root", MEMORY_ROOT]));
    },
  });

  pi.registerCommand("memory-root", {
    description: "Show the configured jumpyBrain memory root",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`jumpyBrain memory root: ${MEMORY_ROOT}`, "info");
    },
  });

  pi.registerCommand("memory-status", {
    description: "Check jumpyBrain memory status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["status", "--root", MEMORY_ROOT])), "info");
    },
  });

  pi.registerCommand("memory-index", {
    description: "Rebuild jumpyBrain memory index",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["index", "--root", MEMORY_ROOT])), "info");
    },
  });

  pi.registerCommand("memory-recall", {
    description: "Recall jumpyBrain memory: /memory-recall <topic>",
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (!topic) {
        ctx.ui.notify("Usage: /memory-recall <topic>", "warning");
        return;
      }
      const result = await runJumpybrain(["recall", "--root", MEMORY_ROOT, "--topic", topic, "--limit", "5"]);
      ctx.ui.setWidget("jumpybrain-memory", formatForWidget(result));
    },
  });
}

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

function runJumpybrain(args: string[], input?: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(JUMPYBRAIN_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: error.message, code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stderrText = Buffer.concat(stderr).toString("utf8") + (timedOut ? `\nTimed out after ${DEFAULT_TIMEOUT_MS}ms.` : "");
      resolve({ ok: code === 0 && !timedOut, stdout: Buffer.concat(stdout).toString("utf8"), stderr: stderrText, code });
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

function toolResult(result: CommandResult) {
  const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n");
  return {
    content: [{ type: "text" as const, text: text || (result.ok ? "jumpyBrain command completed." : "jumpyBrain command failed.") }],
    details: { ok: result.ok, code: result.code, memoryRoot: MEMORY_ROOT },
    isError: !result.ok,
  };
}

function formatForNotify(result: CommandResult): string {
  const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  return text.slice(0, 3000) || (result.ok ? "jumpyBrain command completed." : "jumpyBrain command failed.");
}

function formatForWidget(result: CommandResult): string[] {
  const title = result.ok ? "jumpyBrain memory" : "jumpyBrain memory error";
  const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n") || "No output.";
  return [title, ...text.split(/\r?\n/).slice(0, 80)];
}
