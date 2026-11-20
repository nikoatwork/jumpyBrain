import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ParsedCliArgs } from "./args.js";
import { resolveCliTarget } from "./targets.js";

export const CLI_CONFIG_SCHEMA_VERSION = 1;
export const READ_ONLY_POLICY_ERROR_CODE = "JUMPYBRAIN_REMOTE_TARGET_READ_ONLY";
export const READ_ONLY_COMMANDS_ERROR_CODE = "JUMPYBRAIN_READ_ONLY_COMMANDS";

export interface RemoteAccessPolicyConfig {
  schemaVersion: 1;
  remoteTargets: Array<{ origin: string; access: "read-only" }>;
  /** Present only when this device blocks every state-changing CLI command, for any target. */
  commands?: "read-only";
}

export interface RemoteAccessPolicyEnvironment {
  JUMPYBRAIN_CLI_CONFIG?: string;
  /** `1`/`true` turns read-only command mode on for this process; it can never turn the configured mode off. */
  JUMPYBRAIN_READ_ONLY_COMMANDS?: string;
}

/**
 * Normalize a remote URL to the HTTP(S) origin used by the device-local CLI
 * policy. Keep this behavior aligned with the standalone installer helper in
 * scripts/remote-target-origin.mjs; tests enforce parity without making source
 * modules depend on repository scripts.
 */
export function normalizeRemoteTargetOrigin(value: string): string {
  if (value.trim().length === 0) {
    throw new Error("Remote target URL must be a non-empty HTTP(S) URL.");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error(`Invalid remote target URL ${JSON.stringify(value)}.`, { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Remote target URL must use HTTP or HTTPS: ${JSON.stringify(value)}.`);
  }
  if (url.username || url.password) {
    throw new Error(`Remote target URL must not contain embedded credentials: ${JSON.stringify(value)}.`);
  }

  return url.origin;
}

const READ_COMMANDS = new Set(["status", "tree", "overview", "search", "recall", "show", "expand"]);
const MEMORY_RECIPE_PREFIX = "memory:";

/**
 * Device-local read-only command mode. Rejects every state-changing command,
 * for local and remote targets alike, before credentials, stdin/files, network
 * or backend work. Observational commands never read the policy here, so their
 * behavior is unchanged. An unreadable policy fails closed for mutations.
 * Defense in depth only: a reader key is the server's authority.
 */
export async function enforceReadOnlyCommandMode(
  args: ParsedCliArgs,
  options: { env?: RemoteAccessPolicyEnvironment; home?: string } = {},
): Promise<void> {
  if (isObservationalInvocation(args)) return;
  const env = options.env ?? process.env;
  const requested = env.JUMPYBRAIN_READ_ONLY_COMMANDS?.trim().toLowerCase();
  if (requested === "1" || requested === "true") throw readOnlyCommandsError("the JUMPYBRAIN_READ_ONLY_COMMANDS environment variable");
  if (requested && requested !== "0" && requested !== "false") {
    throw new Error("JUMPYBRAIN_READ_ONLY_COMMANDS must be 1, true, 0 or false. State-changing commands fail closed until it is corrected or unset.");
  }
  const configPath = remoteAccessPolicyConfigPath(options);
  if ((await loadRemoteAccessPolicy(configPath))?.commands === "read-only") throw readOnlyCommandsError(configPath);
}

/**
 * Commands that change no brain, server access, device setting or installation.
 * An explicit allowlist: anything unclassified counts as state-changing.
 */
export function isObservationalInvocation(args: ParsedCliArgs): boolean {
  const command = args._[0] ?? "";
  const operation = args._[1] ?? "";
  // `feedback` sends only the caller's explicit message to support and touches no memory.
  if (["", "help", "--help", "version", "-v", "instructions", "agent-hint", "doctor", "feedback"].includes(command)) return true;
  // Replacing the installed software is a change; its preview is not.
  if (command === "update" && !(args.id || args["if-match"] || args.root || args["target-url"] || args["remote-url"])) return args["dry-run"] === true;
  if (command === "connections") return ["list", "test"].includes(operation);
  if (command === "project") return operation === "status";
  if (command === "identity") return args.name === undefined;
  if (command === "backend") return ["status", "list"].includes(operation);
  if (command === "extensions") return ["list", "check"].includes(operation);
  return isReadInvocation(args);
}

export async function enforceRemoteAccessPolicy(
  args: ParsedCliArgs,
  options: { env?: RemoteAccessPolicyEnvironment; home?: string } = {},
): Promise<void> {
  if (!isTargetAwareInvocation(args)) return;
  const target = resolveCliTarget(args, { allowDiscovery: true });
  if (target.kind !== "remote") return;

  const configPath = remoteAccessPolicyConfigPath(options);
  const config = await loadRemoteAccessPolicy(configPath);
  const origin = normalizeRemoteTargetOrigin(target.url);
  if (!config?.remoteTargets.some((entry) => entry.origin === origin)) return;
  if (isReadInvocation(args)) return;

  throw readOnlyPolicyError(origin);
}

export function remoteAccessPolicyConfigPath(
  options: { env?: RemoteAccessPolicyEnvironment; home?: string } = {},
): string {
  const env = options.env ?? process.env;
  if (Object.prototype.hasOwnProperty.call(env, "JUMPYBRAIN_CLI_CONFIG")) {
    const configured = env.JUMPYBRAIN_CLI_CONFIG?.trim();
    if (!configured) throw new Error("JUMPYBRAIN_CLI_CONFIG must be a non-empty file path when set.");
    return path.resolve(configured);
  }
  return path.join(options.home ?? os.homedir(), ".jumpybrain", "cli-config.json");
}

export async function loadRemoteAccessPolicy(configPath: string): Promise<RemoteAccessPolicyConfig | null> {
  if (!existsSync(configPath)) return null;

  let value: unknown;
  try {
    value = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw invalidConfigError(configPath, "the file is not valid JSON", error);
  }

  try {
    return validateRemoteAccessPolicyConfig(value);
  } catch (error) {
    throw invalidConfigError(configPath, error instanceof Error ? error.message : String(error), error);
  }
}

export function validateRemoteAccessPolicyConfig(value: unknown): RemoteAccessPolicyConfig {
  if (!isRecord(value)) throw new Error("config must be a JSON object");
  const { commands, ...required } = value;
  assertExactKeys(required, ["schemaVersion", "remoteTargets"], "config");
  if (commands !== undefined && commands !== "read-only") throw new Error("commands must be \"read-only\" when present");
  if (value.schemaVersion !== CLI_CONFIG_SCHEMA_VERSION) {
    throw new Error(`schemaVersion ${JSON.stringify(value.schemaVersion)} is unsupported`);
  }
  if (!Array.isArray(value.remoteTargets)) throw new Error("remoteTargets must be an array");

  const seen = new Set<string>();
  const remoteTargets = value.remoteTargets.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`remoteTargets[${index}] must be an object`);
    assertExactKeys(entry, ["access", "origin"], `remoteTargets[${index}]`);
    if (entry.access !== "read-only") throw new Error(`remoteTargets[${index}].access must be \"read-only\"`);
    if (typeof entry.origin !== "string") throw new Error(`remoteTargets[${index}].origin must be a string`);
    const origin = normalizeRemoteTargetOrigin(entry.origin);
    if (seen.has(origin)) throw new Error(`remoteTargets contains duplicate normalized origin ${JSON.stringify(origin)}`);
    seen.add(origin);
    return { origin, access: "read-only" as const };
  });

  return { schemaVersion: CLI_CONFIG_SCHEMA_VERSION, remoteTargets, ...(commands ? { commands } : {}) };
}

export function isReadInvocation(args: ParsedCliArgs): boolean {
  const command = semanticCommand(args);
  if (command === "collaborate") return ["open", "watch"].includes(args._[1] ?? "");
  if (command === "attention") return args._[1] === "list";
  if (command === "access") return args._[1] === "list";
  if (command === "board") return ["list", "show", "status"].includes(args._[1] ?? "");
  if (command === "drawings") return ["list", "show"].includes(args._[1] ?? "");
  if (command === "diff") return true;
  if (command === "migrate") return args._[1] === "remote" && args.apply !== true;
  if (command === "dream") {
    // Deprecated mutations remain blocked before input/credentials; normal windows are read-only.
    if (args["apply-manifest"] || args.complete || args.abandon || args.force) return false;
    return true;
  }
  return READ_COMMANDS.has(command);
}

function isTargetAwareInvocation(args: ParsedCliArgs): boolean {
  const command = args._[0];
  if (command === "dream" || command === "note" || command === "drawings") return true;
  if (["status", "index", "tree", "overview", "search", "recall", "show", "delete", "expand", "process", "remember", "wrapup"].includes(command)) return true;
  if (command === "update") return Boolean(args.id || args["if-match"] || args.root || args["target-url"] || args["remote-url"]);
  if (command === "run" && typeof args._[1] === "string" && args._[1].startsWith(MEMORY_RECIPE_PREFIX)) return true;
  return Boolean(args["target-url"] || args["remote-url"])
    && !["version", "-v", "help", "--help", "instructions", "agent-hint", "doctor", "serve"].includes(command);
}

function semanticCommand(args: ParsedCliArgs): string {
  if (args._[0] === "run") return args._[1]?.startsWith(MEMORY_RECIPE_PREFIX) ? args._[1].slice(MEMORY_RECIPE_PREFIX.length) : "";
  return args._[0] ?? "";
}

function readOnlyPolicyError(origin: string): Error {
  return new Error([
    `${READ_ONLY_POLICY_ERROR_CODE}: remote target ${origin} is configured read-only for this CLI installation.`,
    "This local advisory guard blocks state-changing CLI operations; server-side authorization is required for a security boundary.",
  ].join("\n"));
}

function readOnlyCommandsError(source: string): Error {
  return Object.assign(new Error([
    `${READ_ONLY_COMMANDS_ERROR_CODE}: this CLI is in read-only command mode (${source}); state-changing commands are blocked for every target.`,
    "Reading stays available: status, tree, search, recall, expand, show, dream windows and list operations.",
    "This local guard is defense in depth, not authorization: give this client a reader key so the server enforces it.",
  ].join("\n")), { code: "read_only_commands" });
}

function invalidConfigError(configPath: string, reason: string, cause?: unknown): Error {
  return new Error(`Invalid jumpyBrain CLI policy config at ${configPath}: ${reason}. Remote commands fail closed until the config is repaired or removed, as do state-changing commands.`, { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly ${wanted.join(", ")}${label === "config" ? " (commands is optional)" : ""}`);
  }
}
