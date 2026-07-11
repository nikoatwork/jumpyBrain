import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOCAL_MEMORY_ROOT = process.env.JUMPYBRAIN_MEMORY_ROOT || "__JUMPYBRAIN_MEMORY_ROOT__";
const JUMPYBRAIN_BIN = process.env.JUMPYBRAIN_CLI || "__JUMPYBRAIN_CLI__";
const REMOTE_ENV = loadRemoteEnv();
const GLOBAL_MEMORY_URL = process.env.JUMPYBRAIN_REMOTE_URL || REMOTE_ENV.JUMPYBRAIN_REMOTE_URL || "";
const GLOBAL_MEMORY_API_KEY = process.env.JUMPYBRAIN_API_KEY || REMOTE_ENV.JUMPYBRAIN_API_KEY || "";
const DEFAULT_TIMEOUT_MS = 120_000;

const limitSchema = Type.Optional(Type.Number({ description: "Maximum results to return. Defaults to 5 for recall and 10 for search." }));
const tagsSchema = Type.Optional(Type.Array(Type.String(), { description: "Optional memory tags." }));
const writeTypeSchema = Type.Union([Type.Literal("note"), Type.Literal("finding"), Type.Literal("decision"), Type.Literal("preference")], { description: "Memory note type." });

export default function jumpybrainMemoryExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("jumpybrain", GLOBAL_MEMORY_URL ? `global: ${GLOBAL_MEMORY_URL} | local: ${LOCAL_MEMORY_ROOT}` : `local: ${LOCAL_MEMORY_ROOT}`);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus("jumpybrain", undefined);
  });

  registerMemoryToolset(pi, {
    prefix: "jumpybrain",
    labelPrefix: "jumpyBrain Local",
    target: "local",
    descriptionTarget: "local configured jumpyBrain memory root",
    promptTarget: "local/project memory",
    targetArgs: () => ["--root", LOCAL_MEMORY_ROOT],
  });

  registerMemoryToolset(pi, {
    prefix: "jumpybrain_global",
    labelPrefix: "jumpyBrain Global",
    target: "global",
    descriptionTarget: "global remote team jumpyBrain memory",
    promptTarget: "global/team memory",
    targetArgs: remoteTargetArgs,
  });

  pi.registerCommand("memory-root", {
    description: "Show configured jumpyBrain local/global memory targets",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`jumpyBrain local memory root: ${LOCAL_MEMORY_ROOT}\nglobal remote memory: ${GLOBAL_MEMORY_URL || "not configured"}`, "info");
    },
  });

  pi.registerCommand("memory-status", {
    description: "Check local jumpyBrain memory status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["status", "--root", LOCAL_MEMORY_ROOT])), "info");
    },
  });

  pi.registerCommand("memory-global-status", {
    description: "Check global remote jumpyBrain memory status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["status", ...remoteTargetArgs()], undefined, remoteEnv())), "info");
    },
  });

  pi.registerCommand("memory-index", {
    description: "Rebuild local jumpyBrain memory index",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["index", "--root", LOCAL_MEMORY_ROOT])), "info");
    },
  });

  pi.registerCommand("memory-global-index", {
    description: "Rebuild global remote jumpyBrain memory index",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatForNotify(await runJumpybrain(["index", ...remoteTargetArgs()], undefined, remoteEnv())), "info");
    },
  });

  pi.registerCommand("memory-recall", {
    description: "Recall local jumpyBrain memory: /memory-recall <topic>",
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (!topic) {
        ctx.ui.notify("Usage: /memory-recall <topic>", "warning");
        return;
      }
      const result = await runJumpybrain(["recall", "--root", LOCAL_MEMORY_ROOT, "--topic", topic, "--limit", "5"]);
      ctx.ui.setWidget("jumpybrain-memory", formatForWidget(result));
    },
  });

  pi.registerCommand("memory-global-recall", {
    description: "Recall global remote jumpyBrain memory: /memory-global-recall <topic>",
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (!topic) {
        ctx.ui.notify("Usage: /memory-global-recall <topic>", "warning");
        return;
      }
      const result = await runJumpybrain(["recall", ...remoteTargetArgs(), "--topic", topic, "--limit", "5"], undefined, remoteEnv());
      ctx.ui.setWidget("jumpybrain-global-memory", formatForWidget(result));
    },
  });
}

interface ToolsetOptions {
  prefix: string;
  labelPrefix: string;
  target: "local" | "global";
  descriptionTarget: string;
  promptTarget: string;
  targetArgs: () => string[];
}

function registerMemoryToolset(pi: ExtensionAPI, options: ToolsetOptions) {
  pi.registerTool({
    name: `${options.prefix}_recall`,
    label: `${options.labelPrefix} Recall`,
    description: `Recall relevant durable memory from the ${options.descriptionTarget}.`,
    promptSnippet: `Search jumpyBrain ${options.promptTarget} with visible provenance before tasks that may depend on prior plans, preferences, decisions, or handoffs.`,
    promptGuidelines: [
      `Use ${options.prefix}_recall when ${options.promptTarget} would materially improve the answer.`,
      "Keep recall explicit and bounded; do not silently inject memory.",
    ],
    parameters: Type.Object({
      topic: Type.String({ description: "Current task/topic to recall memory for." }),
      limit: limitSchema,
    }),
    async execute(_toolCallId, params) {
      return toolResult(await runJumpybrain(["recall", ...options.targetArgs(), "--topic", params.topic, "--limit", String(params.limit ?? 5)], undefined, envForTarget(options.target)), options.target);
    },
  });

  pi.registerTool({
    name: `${options.prefix}_search`,
    label: `${options.labelPrefix} Search`,
    description: `Run a specific search against ${options.descriptionTarget}.`,
    promptSnippet: `Search jumpyBrain ${options.promptTarget} for a specific question with provenance.`,
    parameters: Type.Object({
      query: Type.String({ description: "Specific memory question or search query." }),
      limit: limitSchema,
      json: Type.Optional(Type.Boolean({ description: "Return jumpyBrain JSON output instead of human text." })),
    }),
    async execute(_toolCallId, params) {
      const args = ["recall", ...options.targetArgs(), "--query", params.query, "--limit", String(params.limit ?? 10)];
      if (params.json) args.push("--json");
      return toolResult(await runJumpybrain(args, undefined, envForTarget(options.target)), options.target);
    },
  });

  pi.registerTool({
    name: `${options.prefix}_remember`,
    label: `${options.labelPrefix} Remember`,
    description: `Write a reviewed durable note to ${options.descriptionTarget}.`,
    promptSnippet: `Write durable non-secret findings, decisions, or preferences to ${options.promptTarget} when the user asks to remember them there.`,
    promptGuidelines: [
      options.target === "global"
        ? `Use ${options.prefix}_remember only when the user explicitly commands a global/team/remote memory write. Do not treat ordinary approval to remember as approval to write global memory.`
        : `Use ${options.prefix}_remember only when the user explicitly asks to remember/store something durable in ${options.promptTarget} or clearly approves writing there.`,
      "Never store secrets, credentials, tokens, raw chat noise, or vague transient status in jumpyBrain memory.",
    ],
    parameters: Type.Object({
      type: writeTypeSchema,
      title: Type.String({ description: "Short title for the memory note." }),
      body: Type.String({ description: "Markdown body to store." }),
      tags: tagsSchema,
    }),
    async execute(_toolCallId, params) {
      const args = ["remember", ...options.targetArgs(), "--type", params.type, "--title", params.title];
      for (const tag of params.tags ?? []) args.push("--tag", tag);
      return toolResult(await runJumpybrain(args, params.body, envForTarget(options.target)), options.target);
    },
  });

  pi.registerTool({
    name: `${options.prefix}_wrapup`,
    label: `${options.labelPrefix} Wrapup`,
    description: `Write an end-of-session wrapup to ${options.descriptionTarget}.`,
    promptSnippet: options.target === "global"
      ? `Write a strict durable wrapup to ${options.promptTarget} only when the user explicitly commands a global/team/remote memory write.`
      : `At session end, write a strict durable wrapup to ${options.promptTarget} after recall, if useful and approved.`,
    promptGuidelines: [
      options.target === "global"
        ? `Use ${options.prefix}_wrapup only on explicit user command to commit global/team/remote memory; do not auto-write global wrapups at session end.`
        : `Use ${options.prefix}_wrapup at session end only for durable findings, decisions, conflicts/corrections, and open questions that belong in ${options.promptTarget}.`,
      "The body must include strict Markdown sections: ## Findings, ## Decisions, ## Conflicts / Corrections, ## Open Questions.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short wrapup title." }),
      topic: Type.Optional(Type.String({ description: "Recall topic to check for related memories before writing." })),
      body: Type.String({ description: "Strict Markdown wrapup body with required sections." }),
      tags: tagsSchema,
    }),
    async execute(_toolCallId, params) {
      const args = ["wrapup", ...options.targetArgs(), "--title", params.title];
      if (params.topic) args.push("--topic", params.topic);
      for (const tag of params.tags ?? []) args.push("--tag", tag);
      return toolResult(await runJumpybrain(args, params.body, envForTarget(options.target)), options.target);
    },
  });

  pi.registerTool({
    name: `${options.prefix}_index`,
    label: `${options.labelPrefix} Index`,
    description: `Rebuild the ${options.descriptionTarget} index.`,
    promptSnippet: `Rebuild the jumpyBrain ${options.promptTarget} index after memory Markdown changes or remote writes.`,
    parameters: Type.Object({}),
    async execute() {
      return toolResult(await runJumpybrain(["index", ...options.targetArgs()], undefined, envForTarget(options.target)), options.target);
    },
  });
}

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

function runJumpybrain(args: string[], input?: string, extraEnv: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(JUMPYBRAIN_BIN, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...extraEnv } });
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

function toolResult(result: CommandResult, target: "local" | "global") {
  const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n");
  return {
    content: [{ type: "text" as const, text: text || (result.ok ? "jumpyBrain command completed." : "jumpyBrain command failed.") }],
    details: { ok: result.ok, code: result.code, target, memoryRoot: target === "local" ? LOCAL_MEMORY_ROOT : undefined, memoryUrl: target === "global" ? GLOBAL_MEMORY_URL : undefined },
    isError: !result.ok,
  };
}

function remoteTargetArgs(): string[] {
  if (!GLOBAL_MEMORY_URL) throw new Error("JUMPYBRAIN_REMOTE_URL is required for global jumpyBrain memory.");
  return ["--target-url", GLOBAL_MEMORY_URL];
}

function remoteEnv(): Record<string, string> {
  if (!GLOBAL_MEMORY_API_KEY) throw new Error("JUMPYBRAIN_API_KEY is required for global jumpyBrain memory.");
  return { JUMPYBRAIN_API_KEY: GLOBAL_MEMORY_API_KEY };
}

function envForTarget(target: "local" | "global"): Record<string, string> {
  return target === "global" ? remoteEnv() : {};
}

function loadRemoteEnv(): Record<string, string> {
  const file = path.join(homedir(), ".jumpybrain", "remote.env");
  try {
    const values: Record<string, string> = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
    return values;
  } catch {
    return {};
  }
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
