import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Device-local record of project memory roots the user approved on this machine.
 * A repository cannot grant itself trust: committed files only declare intent
 * (jumpybrain.json `capture`), and this file lives outside every project. It is
 * advisory consent, like the remote read-only guard, not a security boundary
 * against a local process that can already write files.
 */
export interface TrustedProject { root: string; allowCapture: boolean; trustedAt: string }
interface TrustFile { schemaVersion: 1; projects: TrustedProject[] }

/** Sits beside the CLI policy config, so JUMPYBRAIN_CLI_CONFIG relocates both. */
export function trustFilePath(env: NodeJS.ProcessEnv = process.env): string {
  if (Object.prototype.hasOwnProperty.call(env, "JUMPYBRAIN_CLI_CONFIG")) {
    const configured = env.JUMPYBRAIN_CLI_CONFIG?.trim();
    if (!configured) throw new Error("JUMPYBRAIN_CLI_CONFIG must be a non-empty file path when set.");
    return path.join(path.dirname(path.resolve(configured)), "trusted-projects.json");
  }
  return path.join(os.homedir(), ".jumpybrain", "trusted-projects.json");
}

export function readTrustedProjects(file = trustFilePath()): TrustedProject[] {
  if (!existsSync(file)) return [];
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !Array.isArray(value.projects)) throw new Error();
    return value.projects.map((entry: Record<string, unknown>) => {
      if (!entry || typeof entry !== "object" || Object.keys(entry).sort().join() !== "allowCapture,root,trustedAt") throw new Error();
      if (typeof entry.root !== "string" || !path.isAbsolute(entry.root) || typeof entry.allowCapture !== "boolean" || typeof entry.trustedAt !== "string") throw new Error();
      return { root: entry.root, allowCapture: entry.allowCapture, trustedAt: entry.trustedAt };
    });
  } catch {
    throw new Error(`Invalid trusted projects file at ${file}. Repair or remove it; project memory stays untrusted until then.`);
  }
}

export function trustedProject(root: string, file = trustFilePath()): TrustedProject | undefined {
  return readTrustedProjects(file).find(entry => entry.root === root);
}

/** Records or replaces one approval; re-trusting without allowCapture withdraws capture. */
export function writeTrustedProject(root: string, allowCapture: boolean, file = trustFilePath()): TrustedProject {
  const entry = { root, allowCapture, trustedAt: new Date().toISOString() };
  save([...readTrustedProjects(file).filter(item => item.root !== root), entry], file);
  return entry;
}

export function removeTrustedProject(root: string, file = trustFilePath()): boolean {
  const projects = readTrustedProjects(file);
  const kept = projects.filter(item => item.root !== root);
  if (kept.length === projects.length) return false;
  save(kept, file);
  return true;
}

function save(projects: TrustedProject[], file: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, projects } satisfies TrustFile, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}
