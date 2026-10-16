import path from "node:path";
import { DEFAULT_MEMORY_DIRS, CURRENT_MEMORY_SCHEMA_VERSION } from "../../core/memory-root/index.js";
import { LOGSEQ_MIGRATION_MANIFEST, analyzeLogseqReferences, migrationDocumentIdentity, migrationPathKey, parseLogseqManifest, planLogseqDocument, type LogseqMigrationDocument, type LogseqMigrationEntry, type LogseqMigrationManifest, type LogseqMigrationResult } from "../../core/migration/index.js";
import { discoverLogseq } from "./discovery.js";
import { assertSnapshot, fail, isWithin, MigrationError, safePath, snapshot, statIfPresent, type Snapshot } from "./filesystem.js";
import { applyTransaction, transactionPath, type LogseqMigrationHooks, type Mutation } from "./transaction.js";

export type { LogseqMigrationAction, LogseqMigrationDocument, LogseqMigrationEntry, LogseqMigrationManifest, LogseqMigrationResult } from "../../core/migration/index.js";
export type { LogseqMigrationHooks, LogseqMigrationStep } from "./transaction.js";

export async function migrateLogseq(source: string, root: string, options: { apply?: boolean; failOnConflict?: boolean } = {}): Promise<LogseqMigrationResult> {
  return migrateLogseqWithHooks(source, root, options);
}

/** Internal failure-injection seam. Runtime should export only migrateLogseq and result types. */
export async function migrateLogseqWithHooks(sourceArg: string, rootArg: string, options: { apply?: boolean; failOnConflict?: boolean } = {}, hooks?: LogseqMigrationHooks): Promise<LogseqMigrationResult> {
  try {
    return await migrate(sourceArg, rootArg, options, hooks);
  } catch (error) {
    // Never return fs paths, parsed configuration values, source filenames, bodies, or arbitrary hook errors.
    if (error instanceof MigrationError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/^(Unsafe Logseq source-relative path\.|Invalid (?:or unsupported Logseq migration ownership manifest|migration envelope)|Canonical envelope verification failed\.|Migration envelope verification failed\.)/.test(message)) throw new MigrationError(message.slice(0, 240));
    throw new MigrationError("Logseq migration preflight or filesystem operation failed. Check readable regular files, root compatibility, permissions, and concurrent writers; no source files are written.");
  }
}

async function validateDestination(root: string): Promise<{ config?: Snapshot; ignore?: Snapshot }> {
  await safePath(root);
  const rootStat = await statIfPresent(root);
  if (rootStat && !rootStat.isDirectory()) fail("Migration destination must be a directory.");
  for (const dir of DEFAULT_MEMORY_DIRS) {
    const absolute = path.join(root, dir);
    await safePath(absolute);
    const state = await statIfPresent(absolute);
    if (state && !state.isDirectory()) fail("A canonical destination directory is occupied by a file.");
  }
  const config = await snapshot(path.join(root, "jumpybrain.json"));
  if (config) {
    let value: Record<string, unknown>;
    try { value = JSON.parse(config.bytes.toString("utf8")); } catch { fail("Invalid destination memory-root configuration (contents redacted)."); }
    // Import and the explicit follow-up index must refer to the same Markdown root.
    if (value! && value!.indexRoot !== undefined && value!.indexRoot !== ".") fail("Redirected or invalid indexRoot is not supported for migration; index the destination itself.");
    if (!value! || value!.schemaVersion !== CURRENT_MEMORY_SCHEMA_VERSION || value!.canonical !== "markdown" || value!.derivedDir !== ".jumpybrain" || !Array.isArray(value!.memoryDirs) || value!.memoryDirs.length !== DEFAULT_MEMORY_DIRS.length || !DEFAULT_MEMORY_DIRS.every(dir => (value!.memoryDirs as unknown[]).includes(dir))) fail("Incompatible or custom destination memory-root configuration; use the standard Markdown memory schema.");
  }
  // Read only if setup can alter it. Existing initialized roots retain their ignore policy unchanged.
  const ignore = config ? undefined : await snapshot(path.join(root, ".gitignore"));
  return { config, ignore };
}

async function migrate(sourceArg: string, rootArg: string, options: { apply?: boolean; failOnConflict?: boolean }, hooks?: LogseqMigrationHooks): Promise<LogseqMigrationResult> {
  if (typeof sourceArg !== "string" || !sourceArg.trim() || typeof rootArg !== "string" || !rootArg.trim() || /[\x00-\x1f\x7f]/.test(sourceArg + rootArg)) fail("A valid local Logseq --source and separate destination --root are required.");
  const source = path.resolve(sourceArg), root = path.resolve(rootArg);
  if (isWithin(source, root) || isWithin(root, source)) fail("Source and destination must be separate, non-overlapping directories.");
  if (root === path.parse(root).root) fail("Filesystem root cannot be a migration destination.");
  await safePath(source);
  await safePath(root);
  await safePath(transactionPath(root));
  if (await statIfPresent(transactionPath(root))) fail("A retained Logseq migration transaction exists next to the destination. Stop writers and recover it before any dry-run or apply.");
  const setup = await validateDestination(root);
  const sourceDiscovery = await discoverLogseq(source);
  const references = analyzeLogseqReferences(sourceDiscovery.documents);
  if (references.likelyDatabaseMirror) fail("Likely Logseq database-graph Markdown mirror detected; only classic file graphs are supported.");
  const warnings = [
    "Logseq is authoritative: mapped destination-only edits are overwritten by default; removed source documents delete identity-verified manifest-owned outputs.",
    ...sourceDiscovery.warnings,
    `References preserved as text: wiki links=${references.wikiLinks}, unresolved wiki links=${references.unresolvedWikiLinks}, omitted local asset references=${references.omittedAssetReferences}. Attachments are not copied.`,
    "No index is built. After a successful apply, run jumpybrain index --root <destination>.",
  ];
  const manifestBefore = await snapshot(path.join(root, LOGSEQ_MIGRATION_MANIFEST));
  const prior = manifestBefore ? parseLogseqManifest(manifestBefore.bytes) : undefined;
  const priorBySource = new Map(prior?.entries.map(entry => [entry.sourcePath, entry]) ?? []);
  const currentSources = new Set(sourceDiscovery.documents.map(document => document.sourcePath));
  const entries: LogseqMigrationEntry[] = [];
  const mutations: Mutation[] = [];
  const destinationStates = new Map<string, Snapshot | undefined>();
  const now = new Date().toISOString();
  const outputKeys = new Set<string>(), ids = new Set<string>();
  for (const document of sourceDiscovery.documents) {
    const previous = priorBySource.get(document.sourcePath);
    // Pure planning determines exact fixed output paths; read only that mapped destination.
    const outputPath = document.sourcePath.replace(/^pages\//, "notes/").replace(/^journals\//, "sessions/");
    const current = await snapshot(path.join(root, outputPath));
    destinationStates.set(outputPath, current);
    const planned = planLogseqDocument({ sourcePath: document.sourcePath, body: document.body, current: current?.bytes, prior: previous, now });
    if (ids.has(planned.entry.id)) fail("Duplicate mapped destination document identity; repair IDs before migration.");
    ids.add(planned.entry.id);
    outputKeys.add(migrationPathKey(outputPath));
    entries.push(planned.entry);
    if (planned.entry.action !== "unchanged") mutations.push({ relative: outputPath, before: current, after: planned.output });
  }
  for (const previous of prior?.entries ?? []) {
    if (currentSources.has(previous.sourcePath)) continue;
    if (outputKeys.has(migrationPathKey(previous.outputPath))) fail("Source rename collides with a prior normalized/case-folded mapping; use a distinct destination or restore the original spelling.");
    const current = await snapshot(path.join(root, previous.outputPath));
    destinationStates.set(previous.outputPath, current);
    // Already absent is reconciled idempotently; never infer deletion outside the trusted manifest.
    if (current && migrationDocumentIdentity(current.bytes).id !== previous.id) fail("Removed source has a destination identity mismatch or missing ID; refusing unsafe deletion.");
    const conflict = !!current && current.hash !== previous.outputHash;
    entries.push({ ...previous, action: "delete", conflict, previousSourceHash: previous.sourceHash, previousOutputHash: previous.outputHash, ...(current ? { destinationHash: current.hash } : {}) });
    if (current) mutations.push({ relative: previous.outputPath, before: current });
  }
  if (options.failOnConflict && entries.some(entry => entry.conflict)) fail("Migration conflicts with independently changed destination documents; fail-on-conflict prevented all writes.");
  const counts = {
    created: entries.filter(entry => entry.action === "create").length,
    overwritten: entries.filter(entry => entry.action === "overwrite").length,
    deleted: entries.filter(entry => entry.action === "delete").length,
    unchanged: entries.filter(entry => entry.action === "unchanged").length,
  };
  const manifestEntries: LogseqMigrationDocument[] = entries.filter(entry => entry.action !== "delete").map(({ action: _action, conflict: _conflict, destinationHash: _destinationHash, previousSourceHash: _previousSourceHash, previousOutputHash: _previousOutputHash, ...entry }) => entry);
  const manifest: LogseqMigrationManifest = { version: 1, importer: "jumpybrain-logseq", importerVersion: 1, migratedAt: now, entries: manifestEntries, counts: { ...counts, warnings: warnings.length } };
  // Preserve manifest bytes/timestamp on identical reruns. Its counts describe the last actual reconciliation.
  const manifestChanged = !prior || counts.created + counts.overwritten + counts.deleted > 0;
  if (manifestChanged) mutations.push({ relative: LOGSEQ_MIGRATION_MANIFEST, before: manifestBefore, after: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifest: true });
  const pages = sourceDiscovery.documents.filter(document => document.sourcePath.startsWith("pages/")).length;
  const result: LogseqMigrationResult = {
    dryRun: !options.apply, applied: false, root, sourceDocuments: sourceDiscovery.documents.length,
    outputDocuments: manifestEntries.length, pages, journals: sourceDiscovery.documents.length - pages,
    ...counts, sourceBytes: manifestEntries.reduce((sum, entry) => sum + entry.sourceBytes, 0),
    outputBytes: manifestEntries.reduce((sum, entry) => sum + entry.outputBytes, 0),
    warnings, errors: [], entries, manifest: LOGSEQ_MIGRATION_MANIFEST, indexed: false,
  };
  if (!options.apply) return result;
  if (mutations.length || !setup.config) {
    await applyTransaction({ root, mutations, initialize: !setup.config, configBefore: setup.config, ignoreBefore: setup.ignore, hooks,
      revalidate: async () => {
        await assertSnapshot(path.join(root, "jumpybrain.json"), setup.config);
        if (!setup.config) await assertSnapshot(path.join(root, ".gitignore"), setup.ignore);
        await assertSnapshot(path.join(root, LOGSEQ_MIGRATION_MANIFEST), manifestBefore);
        for (const [relative, state] of destinationStates) await assertSnapshot(path.join(root, relative), state);
        // Reread only allowlisted bodies; detect source additions/removals as well as edits before publication.
        const fresh = await discoverLogseq(source);
        if (fresh.documents.length !== sourceDiscovery.documents.length || fresh.documents.some((document, index) => document.sourcePath !== sourceDiscovery.documents[index]!.sourcePath || document.snapshot.hash !== sourceDiscovery.documents[index]!.snapshot.hash)) fail("Logseq source changed after preflight; retry from a stable source.");
      },
    });
  }
  result.applied = true;
  return result;
}
