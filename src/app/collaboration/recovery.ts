import { createHash, randomUUID } from "node:crypto";
import { opendir, lstat, realpath, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { readBoundedCanonicalSource } from "../../core/canonical/markdown-store.js";
import { CollaborationError } from "../../core/collaboration/index.js";

const digest = (content: Buffer) => "sha256:" + createHash("sha256").update(content).digest("hex");
const validHash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const validRecovery = (value: unknown): value is string => typeof value === "string" && /^raw-[a-f0-9]{64}$/.test(value);
interface RecoveryHint { version: 1; recoveryId: string; baseContentHash: string; externalContentHash: string; }
const hintMatches = (hint: RecoveryHint, read: Awaited<ReturnType<typeof readRecovery>>) =>
  hint.version === 1 && hint.recoveryId === read.recoveryId && hint.baseContentHash === read.base.contentHash && hint.externalContentHash === read.external.contentHash;
const metadata = (documentId: string, read: Awaited<ReturnType<typeof readRecovery>>) =>
  ({code: "external_destructive_replacement" as const, recoveryId: read.recoveryId, directory: `.jumpybrain/recovery/${documentId}/${read.recoveryId}`, baseContentHash: read.base.contentHash, externalContentHash: read.external.contentHash});
async function safeParent(root: string, documentId: string) {
  let parent = root;
  for (const part of [".jumpybrain", "recovery", documentId]) {
    parent = path.join(parent, part);
    const stat = await lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CollaborationError("unsafe_recovery");
  }
  if (await realpath(parent) !== parent) throw new CollaborationError("unsafe_recovery");
  return parent;
}
export async function readRecovery(root: string, documentId: string, recoveryId: unknown, maxBytes: number) {
  if (!validRecovery(recoveryId)) throw new CollaborationError("invalid_recovery");
  const directory = path.join(root, ".jumpybrain", "recovery", documentId, recoveryId);
  const metadata = JSON.parse((await readBoundedCanonicalSource(root, path.join(directory, "recovery.json"), 4096)).toString("utf8"));
  if (metadata.version !== 1 || metadata.reason !== "external_destructive_replacement" || metadata.documentId !== documentId || !validHash(metadata.baseContentHash) || !validHash(metadata.externalContentHash))
    throw new CollaborationError("unsafe_recovery");
  const expectedId = "raw-" + createHash("sha256").update(metadata.baseContentHash).update(metadata.externalContentHash).digest("hex");
  if (expectedId !== recoveryId) throw new CollaborationError("unsafe_recovery");
  const base = await readBoundedCanonicalSource(root, path.join(directory, "base.md"), maxBytes);
  const external = await readBoundedCanonicalSource(root, path.join(directory, "external.md"), maxBytes);
  if (digest(base) !== metadata.baseContentHash || digest(external) !== metadata.externalContentHash || !base.equals(Buffer.from(base.toString("utf8"))) || !external.equals(Buffer.from(external.toString("utf8"))))
    throw new CollaborationError("unsafe_recovery");
  return { recoveryId, reason: "external_destructive_replacement" as const, base: { content: base.toString("utf8"), contentHash: metadata.baseContentHash as string }, external: { content: external.toString("utf8"), contentHash: metadata.externalContentHash as string } };
}

/** Derived discovery hint. Source copies and their checked hashes remain authority. */
export async function recordLatestRecovery(root: string, documentId: string, recoveryId: string, maxBytes: number) {
  const read = await readRecovery(root, documentId, recoveryId, maxBytes);
  const parent = await safeParent(root, documentId);
  const target = path.join(parent, "latest.json");
  const stage = path.join(parent, ".latest-" + randomUUID() + ".tmp");
  const hint: RecoveryHint = { version: 1, recoveryId, baseContentHash: read.base.contentHash, externalContentHash: read.external.contentHash };
  const handle = await open(stage, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(hint) + "\n");
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await safeParent(root, documentId);
    await rename(stage, target);
    const directory = await open(parent, "r");
    try { await directory.sync(); } catch { /* Directory sync is unsupported on some filesystems. */ }
    finally { await directory.close(); }
  } finally { await unlink(stage).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
}

/** Reopening must advertise the verified latest version or explicit uncertainty. */
export async function latestRecovery(root: string, documentId: string, maxBytes: number) {
  let entries, incomplete = false;
  try {
    const parent = await safeParent(root, documentId);
    let pointerPresent = false;
    try {
      const bytes = await readBoundedCanonicalSource(root, path.join(parent, "latest.json"), 4096);
      pointerPresent = true;
      const hint = JSON.parse(bytes.toString("utf8")) as RecoveryHint;
      const read = await readRecovery(root, documentId, hint.recoveryId, maxBytes);
      if (!hintMatches(hint, read)) throw new CollaborationError("unsafe_recovery");
      return { recovery: metadata(documentId, read), incomplete: false };
    } catch (error) { if (pointerPresent || (error as NodeJS.ErrnoException).code !== "ENOENT") incomplete = true; }
    entries = await opendir(parent);
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { incomplete: false }; return { incomplete: true }; }
  const candidates: {name: string; changed: number}[] = [];
  let inspected = 0;
  try {
    for await (const entry of entries) {
      if (++inspected > 256) { incomplete = true; break; }
      if (!entry.isDirectory() || !validRecovery(entry.name)) continue;
      try {
        const stat = await lstat(path.join(root, ".jumpybrain", "recovery", documentId, entry.name));
        if (!stat.isDirectory() || stat.isSymbolicLink()) { incomplete = true; continue; }
        candidates.push({name: entry.name, changed: stat.mtimeMs});
      } catch { incomplete = true; }
    }
  } catch { incomplete = true; }
  // A bounded recent window is discoverable; retained data is never evicted.
  candidates.sort((a,b) => b.changed - a.changed);
  for (const entry of candidates.slice(0, 8)) {
    try {
      const read = await readRecovery(root, documentId, entry.name, maxBytes);
      return { recovery: metadata(documentId, read), incomplete };
    } catch { incomplete = true; /* Corrupt entries never become source content. */ }
  }
  return { incomplete: incomplete || candidates.length > 8 };
}
