import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function identityFile(): string {
  return process.env.JUMPYBRAIN_IDENTITY_FILE || path.join(os.homedir(), ".jumpybrain", "identity.json");
}

export function displayName(value: unknown): string {
  if (typeof value !== "string" || value.length > 48 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw Object.assign(new Error("Use a display name of at most 48 characters without control characters."), { code: "invalid_identity", status: 400 });
  }
  return value.trim();
}

/** Device-local preference, separate from brain content and access credentials. */
export async function readIdentity(file = identityFile()): Promise<{ name: string }> {
  try {
    const input = JSON.parse(await readFile(file, "utf8"));
    if (input.version !== 1) throw new Error("Unsupported display-name preference.");
    return { name: displayName(input.name) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { name: "" };
    throw new Error("Could not read your display name. Set it again in Settings or with jumpybrain identity --name.");
  }
}

export async function writeIdentity(name: unknown, file = identityFile()): Promise<{ name: string }> {
  const identity = { name: displayName(name) };
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, ...identity }) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
  return identity;
}

export function agentDisplayName(owner: string, client: string): string {
  // Explicitly supplied client names may already include this owner's prefix.
  return owner && !client.startsWith(owner + " · ") ? owner + " · " + client : client;
}
