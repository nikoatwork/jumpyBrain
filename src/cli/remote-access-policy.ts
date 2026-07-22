import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ParsedCliArgs } from "./args.js";
import { resolveCliTarget } from "./targets.js";

export const CLI_CONFIG_SCHEMA_VERSION = 1;
export const READ_ONLY_POLICY_ERROR_CODE = "JUMPYBRAIN_REMOTE_TARGET_READ_ONLY";

export interface RemoteAccessPolicyConfig {
  schemaVersion: 1;
  remoteTargets: Array<{ origin: string; access: "read-only" }>;
}

export interface RemoteAccessPolicyEnvironment {
  JUMPYBRAIN_CLI_CONFIG?: string;
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

const READ_COMMANDS = new Set(["status", "tree", "overview", "search", "recall", "show"]);
const MEMORY_RECIPE_PREFIX = "memory:";

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
  assertExactKeys(value, ["schemaVersion", "remoteTargets"], "config");
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

  return { schemaVersion: CLI_CONFIG_SCHEMA_VERSION, remoteTargets };
}

export function isReadInvocation(args: ParsedCliArgs): boolean {
  const command = semanticCommand(args);
  if (command === "dream") {
    if (args["apply-manifest"] || args.complete || args.abandon) return false;
    return Boolean(args.status);
  }
  return READ_COMMANDS.has(command);
}

function isTargetAwareInvocation(args: ParsedCliArgs): boolean {
  const command = args._[0];
  if (command === "dream" || command === "note") return true;
  if (["status", "index", "tree", "overview", "search", "recall", "show", "process", "remember", "wrapup"].includes(command)) return true;
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

function invalidConfigError(configPath: string, reason: string, cause?: unknown): Error {
  return new Error(`Invalid jumpyBrain CLI policy config at ${configPath}: ${reason}. Remote commands fail closed until the config is repaired or removed.`, { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly ${wanted.join(", ")}`);
  }
}
