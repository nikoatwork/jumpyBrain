#!/usr/bin/env node
import { refreshManagedIntegrations, renderIntegration } from '../integrations/electron/managed-integrations.mjs';
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync, readFileSync } from "node:fs";
import { access, chmod, cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRemoteTargetOrigin } from "./remote-target-origin.mjs";
import { companionUpdatePlan, checkCompanionUpdate, commitCompanionUpdate } from "./macos-companion.mjs";
import { checkQmdInstallation, QMD_PACKAGE } from "./qmd-install-check.mjs";
import { atomicJSON, cliShim, durableNode, preflight, selectEngineWithSource, discoverRelease, installRelease, filesystemReport, observeFilesystem, formatFilesystem } from "./install-support.mjs";
import { classifyManifest, classifyVerification, DEFAULT_REPO, incompatibleRuntimeError, INSTALLER_NAME, MANIFEST_VERSION, migrationBlockers, migrationCommand, runtimeCapabilities, sourcePolicy } from "./install-compatibility.mjs";
import { softwareStorage, finishSoftware, maintainSoftware } from './installation-storage.mjs';
import { applyProfileFlags, askSmartSearch, browseInstructions, describePlan, effectiveProfile, formatPlan, promptChoices, recordedProfile, removeSmartSearchModel, shouldPrompt, SMART_SEARCH, smartSearchModelPath } from './install-profiles.mjs';

const installerToken = randomUUID();
let unlock = async () => {};
let selectedQmd;
let installationHome;
let selectedRelease;
let retainedRollback;
const pendingSoftware = [];
let resultReport = { schemaVersion: 1, state: "blocked", checks: {}, remainingActions: [] };
const jsonOutput = process.argv.includes("--json");
if (jsonOutput) console.log = (...args) => console.error(...args);


async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.profile === "browse") {
    reportBrowseOnly();
    if (jsonOutput) process.stdout.write(JSON.stringify(resultReport) + "\n");
    return;
  }
  ensureSupportedPlatform();
  ensureNodeVersion();

  const home = path.resolve(options.home ?? process.env.HOME ?? os.homedir());
  installationHome = home;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
  try {
    const outcome = await installManaged({ options, home, cwd, installRoot });
    if (outcome !== "browse" && !options.dryRun) {
      for (const { generation, versions } of pendingSoftware) finishSoftware(generation, { home, root: installRoot, owner: process.pid, versions });
      resultReport.storage = maintainSoftware({ home, root: installRoot, owner: process.pid });
      // Printed last so the report reflects everything this run left on disk.
      if (resultReport.filesystem) console.log(`\n${formatFilesystem(observeFilesystem(resultReport.filesystem, "applied", { rollback: retainedRollback }))}`);
    }
  } finally { await unlock(); }
  if (jsonOutput) process.stdout.write(JSON.stringify(resultReport) + "\n");
}

async function physicalPath(target) {
  try { return await realpath(target); }
  catch (error) {
    if (error.code !== 'ENOENT' || path.dirname(target) === target) throw error;
    return path.join(await physicalPath(path.dirname(target)), path.basename(target));
  }
}

async function installManaged({ options, home, cwd, installRoot }) {
  const appDir = path.join(installRoot, "app");
  const binDir = path.join(installRoot, "bin");
  const cliPath = path.join(binDir, process.platform === "win32" ? "jumpybrain.cmd" : "jumpybrain");
  const cliConfigPath = path.join(installRoot, "cli-config.json");
  const manifestPath = path.join(installRoot, "install-manifest.json");
  const previousManifest = await readInstallManifest(manifestPath, { installRoot, appDir, binDir, cliPath, cliConfigPath });
  assertNoUnmanagedInstall(previousManifest, { installRoot, appDir, binDir, cliPath });
  const existingInstall = Boolean(previousManifest && previousManifest.state !== "installing");
  // Retrying an interrupted first install finishes what was chosen, unless the retry chooses again.
  if (previousManifest?.state === "installing" && !options.profile && !options.withApp && !options.remoteOnly && previousManifest.profile === "mac-app") options.withApp = true;
  if (previousManifest?.state === "installing" && options.smartSearch === undefined && previousManifest.addOns?.smartSearch === true) options.smartSearch = true;
  const previousProfile = recordedProfile(previousManifest, { appInstalled: installRoot === path.join(home, ".jumpybrain") && existsSync(path.join(home, "Applications/jumpyBrain.app")) });
  // A person at a terminal picks what they want; agents, --json, --yes, dry runs and pipes get the defaults.
  const choiceFlags = ["profile", "with-app", "remote-only", "smart-search", "no-smart-search"].some(flag => options.provided.has(flag));
  if (!previousManifest && !choiceFlags && shouldPrompt({ stdinIsTTY: process.stdin.isTTY, json: jsonOutput, yes: options.yes, dryRun: options.dryRun })) {
    const choice = await withTerminal(ask => promptChoices(ask));
    options.profile = choice.profile;
    options.smartSearch = choice.smartSearch;
    if (choice.profile === "browse") { reportBrowseOnly(); return "browse"; }
    applyProfileFlags(options);
    if (options.remoteOnly && !options.provided.has("integrations")) options.integrations = "none";
  }
  if (options.source === "release" && options.ref) throw new Error("--ref selects a Git revision and cannot be combined with --source release.");
  const previousPolicy = previousManifest ? sourcePolicy(previousManifest) : null;
  // Converting source policy is explicit: an ordinary rerun keeps the recorded source/ref.
  const migratingToRelease = Boolean(previousManifest && previousManifest.state !== "installing" && options.source === "release" && previousPolicy.kind !== "release");
  const scope = previousManifest?.scope ?? options.scope;
  const memoryRoot = path.resolve(expandHome(
    previousManifest?.memoryRoot ?? options.memoryRoot ?? (scope === "project" ? path.join(cwd, "memory") : path.join(installRoot, "memory")),
    home,
  ));
  const source = options.source ?? (options.ref
    ? (previousManifest?.distribution === "release" ? DEFAULT_REPO : previousManifest?.source ?? DEFAULT_REPO)
    : (previousManifest?.distribution === "release" ? "release" : previousManifest?.source))
    ?? process.env.JUMPYBRAIN_INSTALL_SOURCE ?? "release";
  const ref = source === "release" ? undefined : options.ref ?? previousManifest?.ref ?? undefined;
  const integrations = previousManifest?.integrationMode ?? options.integrations;
  const manifestSource = source === "release" ? DEFAULT_REPO : await normalizeInstallSource(source);
  const remoteOnly = options.remoteOnly || previousManifest?.remoteOnly === true;
  // Conflicting modes stop here: before preflight, locks, engine selection or any write.
  const conflict = message => Object.assign(new Error(`${message} Nothing was changed.`), { blockers: [message] });
  if (previousManifest && options.remoteOnly && previousManifest.remoteOnly !== true) throw conflict(`The installation at ${installRoot} is a local installation with its own brain; --remote-only cannot convert it. Use a separate --install-root for a remote-only CLI, or uninstall this one first.`);
  if (previousManifest?.remoteOnly === true && options.profile && options.profile !== "remote") throw conflict(`The installation at ${installRoot} connects agents to a team brain (remote-only) and cannot switch to the ${options.profile} profile today: it has no local engine or brain. Use a separate --install-root for a local installation.`);
  if (previousManifest?.remoteOnly === true && options.smartSearch !== undefined) throw conflict(`The installation at ${installRoot} is remote-only, so there is no local brain for smart search. Smart search for a team brain is set up on its server.`);
  if (previousManifest?.remoteOnly === true && options.withApp) throw conflict(`The installation at ${installRoot} is remote-only and has no local engine or brain, so the Mac app cannot be added to it. Use a separate local installation for the app.`);
  if (!previousManifest && remoteOnly && options.provided.has("memory-root")) throw conflict("--remote-only creates no local brain, so --memory-root cannot be combined with it.");
  options.remoteOnly = remoteOnly;
  if (existsSync(path.join(home, "Applications/jumpyBrain.app")) && previousManifest?.desktopPort && options.appPort && options.appPort !== previousManifest.desktopPort) throw new Error("The existing app port is preserved. Do not change it during setup.");
  // A source build option never applies to a release runtime, whose dependencies are always installed from its lockfile.
  for (const key of ["skipBuild", "skipQmdInstall", "skipInitialIndex"]) if (!(migratingToRelease && key === "skipBuild")) options[key] ||= Boolean(previousManifest?.installerOptions?.[key]);
  if (remoteOnly && (integrations !== "none" || options.withApp)) throw conflict("--remote-only requires --integrations none and cannot include --with-app.");
  const physicalMemory = await physicalPath(memoryRoot);
  for (const directory of [appDir, binDir, path.join(installRoot, "engines")]) {
    const protectedDir = await physicalPath(directory);
    if (physicalMemory === protectedDir || physicalMemory.startsWith(protectedDir + path.sep) || protectedDir.startsWith(physicalMemory + path.sep)) throw new Error("Memory must not overlap replaceable program or engine directories.");
  }
  const profile = effectiveProfile(options, previousProfile);
  if (existingInstall && previousProfile === "mac-app" && profile === "personal") log("The Mac app stays installed; this installation now records the personal profile. Remove the app by moving it to the Trash.");
  // The brain's saved policy, also when resuming an interrupted first install that already switched it.
  const smartSearchBefore = previousManifest && !remoteOnly ? smartSearchActive(memoryRoot) : false;
  // The managed model this brain selected, read once so the plan and the removal name the same file.
  const smartSearchModelId = smartSearchBefore ? brainIndexingPolicy(memoryRoot)?.modelId : undefined;
  if (existingInstall && !remoteOnly && options.smartSearch === undefined && shouldPrompt({ stdinIsTTY: process.stdin.isTTY, json: jsonOutput, yes: options.yes, dryRun: options.dryRun })) {
    const keep = await withTerminal(ask => askSmartSearch(ask, { current: smartSearchBefore }));
    if (keep !== smartSearchBefore) options.smartSearch = keep;
  }
  const smartSearchWanted = remoteOnly ? false : options.smartSearch ?? smartSearchBefore;
  const smartSearchAction = smartSearchWanted ? (smartSearchBefore ? "keep" : "add") : smartSearchBefore ? "remove" : "none";
  const plan = describePlan({ profile, smartSearch: smartSearchWanted, smartSearchAction, existing: existingInstall && profile === previousProfile });
  resultReport = { ...resultReport, dryRun: options.dryRun, installRoot, cliPath, memoryRoot: remoteOnly ? null : memoryRoot, source, remoteOnly, profile, plan, integrations: [], skippedIntegrations: [] };
  log(formatPlan(plan));
  const reuseCandidate = Boolean(options.withApp && previousManifest && previousManifest.state !== "installing" && !options.source && !options.ref);
  if (previousManifest) {
    const { shape, omitted } = previousManifest[manifestClassification];
    const capability = runtimeCapabilities(appDir, { desktop: reuseCandidate });
    resultReport.compatibility = { manifestShape: shape, omittedFields: omitted, installedVersion: capability.version, sourcePolicy: previousPolicy.kind,
      action: previousManifest.state === "installing" ? "resume-install" : reuseCandidate ? "reuse" : migratingToRelease ? "migrate-to-release" : "update", blockers: [] };
    // Read-only gates run before preflight, locks, engine selection or any write.
    if (reuseCandidate && !capability.compatible) {
      const error = incompatibleRuntimeError({ installedVersion: capability.version, required: capability.missing, withApp: true, policy: previousPolicy });
      Object.assign(resultReport.compatibility, { blockers: [error.message], nextCommand: error.compatibility.nextCommand });
      error.blockers = [error.message];
      throw error;
    }
    if (migratingToRelease) {
      const blockers = migrationBlockers({ paths: { installRoot, appDir, binDir, cliPath, cliConfigPath }, currentShims: [currentShimPattern({ appDir, cliConfigPath, qmd: false }), currentShimPattern({ appDir, cliConfigPath, qmd: true })] });
      resultReport.compatibility.blockers = blockers;
      resultReport.policyChange = { from: previousPolicy, to: { kind: "release", source: "release", ref: null } };
      if (blockers.length) {
        const error = new Error("Release migration needs:\n" + blockers.map(item => "- " + item).join("\n") + "\nNothing was changed.");
        error.blockers = blockers;
        throw error;
      }
      log(`Migrating the ${previousPolicy.kind} source policy (${previousPolicy.source}${previousPolicy.ref ? `@${previousPolicy.ref}` : ""}) to verified releases. The previous runtime and manifest stay in place until the candidate is verified.`);
    }
  }
  await preflight({ options, installRoot, memoryRoot, source, home });
  const rootExisted = existsSync(installRoot);
  if (!options.dryRun) {
    unlock = await lockInstallation(installRoot, home);
    const lockedManifest = await readInstallManifest(manifestPath, { installRoot, appDir, binDir, cliPath, cliConfigPath });
    if (JSON.stringify(lockedManifest) !== JSON.stringify(previousManifest)) throw new Error("Installation changed while waiting for its lock. Rerun the same command.");
  }
  const engine = await selectEngineWithSource({ installRoot, appDir, skipInstall: options.skipQmdInstall, dryRun: options.dryRun, remoteOnly, previous: previousManifest?.qmd });
  selectedQmd = engine.bin;
  resultReport.engine = selectedQmd;
  resultReport.engineSource = engine.source;
  if (selectedQmd) log(`${options.dryRun && !existsSync(selectedQmd) ? "Would install private" : "Selected"} QMD CLI + SDK: ${selectedQmd}`);
  else if (!remoteOnly) log("Search dependency unavailable; skipping install and initial index as requested.");
  options.reuseApp = reuseCandidate;
  if (source === "release") selectedRelease = options.reuseApp ? previousManifest.release : await discoverRelease();
  resultReport.release = selectedRelease || null;
  if (resultReport.compatibility) resultReport.compatibility.candidateVersion = options.reuseApp ? resultReport.compatibility.installedVersion : selectedRelease?.version ?? null;
  resultReport.state = options.dryRun ? "planned" : "failed";
  // The compiled CLI bundles its WebSocket client; esbuild only compiles desktop extensions.
  const dependencies = options.reuseApp ? "reused" : options.skipBuild ? "source" : remoteOnly && source === "release" ? "omitted" : "installed";
  const reportFilesystem = ({ policy, integrations: planned, existing }) => {
    resultReport.filesystem = filesystemReport({ dryRun: options.dryRun, home, installRoot, appDir, cliPath, cliConfigPath, manifestPath, memoryRoot, remoteOnly,
      existing, reuseApp: options.reuseApp, policy, engine, integrations: planned, skipInitialIndex: options.skipInitialIndex, withApp: options.withApp, dependencies, source,
      smartSearch: smartSearchAction === "add" ? { action: "add", path: smartSearchModelPath(home) }
        : smartSearchAction === "remove" && smartSearchModelId ? { action: "remove", path: smartSearchModelPath(home, process.env, smartSearchModelId) } : undefined,
      agentDirs: [home, ...(scope === "project" ? [cwd] : [])].flatMap(base => [".claude", ".agents", ".pi", ".codex"].map(name => path.join(base, name))),
      bootstrapDir: process.env.JUMPYBRAIN_BOOTSTRAP_DIR || undefined, rootExisted });
    resultReport.commandMode = policy.readOnlyCommands === null ? "invalid" : policy.readOnlyCommands ? "read-only" : "read-write";
  };

  const summary = {
    installRoot,
    appDir,
    binDir,
    cliPath,
    cliConfigPath,
    memoryRoot,
    scope,
    integrations: [],
    skippedIntegrations: [],
    dryRun: options.dryRun,
  };

  if (previousManifest && previousManifest.state !== "installing") {
    await updateExistingInstall({
      options,
      previousManifest,
      manifestPath,
      manifestSource,
      source,
      ref,
      scope,
      integrations,
      home,
      installRoot,
      appDir,
      binDir,
      cliPath,
      cliConfigPath,
      memoryRoot,
      dependencies,
      reportFilesystem,
      profile,
      smartSearchAction,
      smartSearchBefore,
      smartSearchModelId,
    });
    return;
  }

  log(`${options.dryRun ? "Dry run: planning jumpyBrain installation" : "Installing jumpyBrain"} (${scope})`);
  log(`Install root: ${installRoot}`);
  log(remoteOnly ? "Memory root: none (remote-only)" : `Memory root: ${memoryRoot}`);
  const policyPlan = await planRemoteAccessPolicy(cliConfigPath, options);
  summary.cliPolicy = policyPlan.description;
  logPolicyPlan(policyPlan);

  const integrationPlan = planIntegrations({ integrations, scope, home, cwd });
  if (!previousManifest) for (const item of integrationPlan.install) {
    if (existsSync(item.path)) throw new Error(`An integration already exists at ${item.path}. Preserve it or select --integrations none; it will not be overwritten.`);
  }
  reportFilesystem({ policy: policyPlan, integrations: integrationPlan.install, existing: false });
  const now = new Date().toISOString();
  const manifest = {
    version: MANIFEST_VERSION, installer: INSTALLER_NAME, state: "installing",
    createdAt: previousManifest?.createdAt ?? now, updatedAt: now,
    source: manifestSource, distribution: source === "release" ? "release" : "source", release: selectedRelease || null, ref: ref ?? null,
    scope, installRoot, appDir, binDir, cliPath, cliConfigPath, memoryRoot,
    node: durableNode(), qmd: selectedQmd || null, desktopPort: options.appPort || previousManifest?.desktopPort, remoteOnly, integrationMode: integrations,
    // While installing this is the request (a retry resumes it); once ready it is the verified outcome.
    profile, addOns: { smartSearch: smartSearchWanted },
    integrations: integrationPlan.install.map(({ kind, path }) => ({ kind, path })),
    installerOptions: { skipBuild: Boolean(options.skipBuild), skipQmdInstall: Boolean(options.skipQmdInstall), skipInitialIndex: Boolean(options.skipInitialIndex) },
    files: [cliPath, ...integrationPlan.install.map(item => item.path)],
    integrationHashes: previousManifest?.integrationHashes || {},
    ...(scope === "project" ? { projectRoot: cwd } : {}),
  };
  if (!options.dryRun) {
    await atomicJSON(manifestPath, manifest);
    await mkdir(installRoot, { recursive: true });
    await installApp({ source, ref, appDir, skipBuild: options.skipBuild, dependencies });
    await mkdir(binDir, { recursive: true });
    await writeCliShim({ cliPath, appDir, cliConfigPath });
    await writeRemoteAccessPolicy(policyPlan);
    if (!remoteOnly) await initializeMemoryRoot({ cliPath, memoryRoot });
  }

  const qmdAvailable = Boolean(selectedQmd);
  summary.searchReady = qmdAvailable && !options.skipInitialIndex;
  // A resumed install whose brain already switched to smart search applies an explicit opt-out first:
  // `index --lexical` is then its initial index, so a missing model cannot block it.
  const optOutFirst = !options.dryRun && smartSearchAction === "remove";
  if (optOutFirst) manifest.addOns.smartSearch = applySmartSearch({ action: "remove", cliPath, memoryRoot, options, modelId: smartSearchModelId });
  else if (!options.dryRun && qmdAvailable && !options.skipInitialIndex) await indexMemoryRoot({ cliPath, memoryRoot });

  for (const item of integrationPlan.install) {
    if (!options.dryRun) {
      await installIntegration({ item, memoryRoot, cliPath, appDir });
      manifest.integrationHashes[item.path] = createHash("sha256").update(await readFile(item.path)).digest("hex");
      await atomicJSON(manifestPath, manifest);
    }
    summary.integrations.push(`${item.kind}:${item.path}`);
  }
  for (const item of integrationPlan.skipped) summary.skippedIntegrations.push(`${item.kind}:${item.reason}`);

  if (!options.dryRun) {
    manifest.installedVersion = await readInstalledVersion(appDir);
    await verifyInstallation({ options, cliPath, memoryRoot, runtime: { role: "installed", version: manifest.installedVersion } });
    if (options.withApp) await setupDesktop({ appDir, installRoot, home, memoryRoot, options });
    // Before `ready`: an interrupted download leaves the request in the installing record, and a
    // retry runs the same idempotent setup again (reusing a verified model, repairing a partial index).
    if (!optOutFirst) manifest.addOns.smartSearch = applySmartSearch({ action: smartSearchAction, cliPath, memoryRoot, options, modelId: smartSearchModelId });
    manifest.state = "ready";
    await atomicJSON(manifestPath, manifest);
  }
  Object.assign(resultReport, { version: manifest.installedVersion || selectedRelease?.version || null, integrations: summary.integrations, skippedIntegrations: summary.skippedIntegrations });
  if (summary.integrations.length && !options.dryRun) resultReport.remainingActions.push("Restart/reload any already-running assistant to activate its integration; file presence does not prove activation.");

  if (!options.dryRun) resultReport.state = resultReport.remainingActions.length ? "pending_user_action" : "ready";
  summary.remoteOnly = remoteOnly;
  summary.smartSearch = resultReport.smartSearch?.state ?? (smartSearchAction === "add" ? "planned" : "off");
  printSummary(summary);
}

async function lockInstallation(installRoot, home) {
  await mkdir(installRoot, { recursive: true });
  if ((await lstat(installRoot)).isSymbolicLink()) throw new Error("Install root must be a real directory, not a symlink.");
  const lock = path.join(installRoot, ".installer-lock");
  const owned = { pid: process.pid, host: os.hostname(), token: installerToken };
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const recovery = path.join(installRoot, ".installer-recovery-lock");
    try { await mkdir(recovery, { mode: 0o700 }); }
    catch { throw new Error("Another installer is recovering its lock. Retry when it finishes."); }
    try {
      const stat = await lstat(lock);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Refusing a linked installer lock.");
      const owner = await readLockRecord(path.join(lock, "owner.json"));
      if (owner === undefined) {
        // The Mac app's updater records its owner as desktop.json instead.
        await reclaimAbandonedAppUpdate({ lock, installRoot, home, owned });
        return () => rm(lock, { recursive: true });
      }
      if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 2) throw unverifiableLock(lock, "has an unreadable owner record");
      if (owner.host !== os.hostname()) throw unverifiableLock(lock, `was created under another host name (${String(owner.host).slice(0, 64)}). It may be this Mac under an earlier network name, but that cannot be proven`);
      if (processAlive(owner.pid)) throw new Error("Another installer/update is active. Wait for it to finish.");
      await rm(lock, { recursive: true });
      await mkdir(lock, { mode: 0o700 });
    } finally { await rm(recovery, { recursive: true }); }
  }
  await atomicJSON(path.join(lock, "owner.json"), owned);
  return () => rm(lock, { recursive: true });
}

// undefined: absent. null: present but unreadable or malformed.
async function readLockRecord(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { return error.code === "ENOENT" ? undefined : null; }
}
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
function unverifiableLock(lock, reason) {
  return new Error(`Installer lock ${lock} ${reason}, so a running jumpyBrain installer, update or Mac app setup cannot be ruled out. Nothing was changed. `
    + "Quit jumpyBrain and make sure no jumpyBrain installer or update is still running in a Terminal; then remove that folder and rerun the same command.");
}

// A Mac app update whose worker never started (for example because its Node no
// longer loads) leaves desktop.json behind. Reclaim it only with the same proof
// the app's updater uses: its own update directory, no live owner or build, and no
// interrupted replacement awaiting recovery. Claimed in place, like the app does.
async function reclaimAbandonedAppUpdate({ lock, installRoot, home, owned }) {
  const updates = path.join(home, "Library/Application Support/jumpyBrain Updates");
  const owner = await readLockRecord(path.join(lock, "desktop.json"));
  if (installRoot !== path.join(home, ".jumpybrain") || owner === undefined) throw unverifiableLock(lock, "has no owner record");
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 2 || typeof owner.directory !== "string") throw unverifiableLock(lock, "has an unreadable Mac app update record");
  if (path.dirname(owner.directory) !== updates || !/^update-[\w-]+$/.test(path.basename(owner.directory))) throw unverifiableLock(lock, "names an unknown Mac app update folder");
  const child = await readLockRecord(path.join(owner.directory, "child.json"));
  if (child !== undefined && (!child || !Number.isSafeInteger(child.pid) || child.pid < 2)) throw unverifiableLock(lock, "has an unreadable Mac app build record");
  if (processAlive(owner.pid) || processAlive(child?.pid)) throw new Error("A Mac app update is running. Wait for it to finish, then rerun the same command.");
  const journal = await readLockRecord(path.join(owner.directory, "transaction.json"));
  if (journal === null || (journal && !["success", "rolled-back"].includes(journal.phase))) {
    throw new Error("An interrupted Mac app update needs recovery first. Open jumpyBrain and choose Recover in its update panel; the previous installation is retained. Nothing was changed.");
  }
  try { await mkdir(path.join(lock, "reclaim"), { mode: 0o700 }); }
  catch { throw new Error("Another installer is recovering its lock. Retry when it finishes."); }
  try {
    const current = await readLockRecord(path.join(lock, "desktop.json"));
    if (current?.pid !== owner.pid || current?.directory !== owner.directory) throw new Error("Another installer/update changed the lock. Retry when it finishes.");
    await atomicJSON(path.join(lock, "owner.json"), owned);
    await rm(path.join(lock, "desktop.json"), { force: true });
  } finally {
    await rm(path.join(lock, "reclaim"), { recursive: true, force: true });
  }
  log(`Recovered an abandoned Mac app update lock (owner process ${owner.pid} has exited).`);
}

async function updateExistingInstall({
  options,
  previousManifest,
  manifestPath,
  manifestSource,
  source,
  ref,
  scope,
  integrations,
  home,
  installRoot,
  appDir,
  binDir,
  cliPath,
  cliConfigPath,
  memoryRoot,
  dependencies,
  reportFilesystem,
  profile,
  smartSearchAction,
  smartSearchBefore,
  smartSearchModelId,
}) {
  assertPreservedInstallSettings(options, { scope, integrations, memoryRoot }, home);

  log("Existing managed installation detected");
  log(`Install root: ${installRoot}`);
  log(options.remoteOnly ? "Memory root: none (remote-only)" : `Memory root (preserved): ${memoryRoot}`);
  const companion = companionUpdatePlan({ installRoot, home });
  log(companion
    ? "Updating shared runtime, CLI, and installed macOS companion; memory and agent integrations are preserved"
    : "Updating app and CLI only; memory, memory-root config, derived indexes remain unchanged; untouched managed integrations refresh (CLI policy changes only with explicit target flags)");
  if (companion) {
    log("macOS companion: wait for Saved, Quit from the menu bar before updating, then reopen after success. No automatic restart.");
    if (!options.dryRun) checkCompanionUpdate(companion);
  }
  const policyPlan = await planRemoteAccessPolicy(cliConfigPath, options);
  logPolicyPlan(policyPlan);
  reportFilesystem({ policy: policyPlan, integrations: (previousManifest.integrations || []).filter(item => item && typeof item.path === "string"), existing: true });

  if (options.dryRun) {
    resultReport.state = "planned";
    console.log("\njumpyBrain update dry run complete. No changes made.");
    console.log(`CLI: ${cliPath}`);
    console.log(options.remoteOnly ? "Remote-only: no local brain or search engine." : `Memory preserved: ${memoryRoot}`);
    console.log(`CLI policy: ${policyPlan.description}`);
    console.log(`\n${formatFilesystem(resultReport.filesystem)}`);
    return;
  }
  if (options.remoteOnly) log("This installation connects agents to a team brain (remote-only); that mode stays fixed. Use a separate --install-root for personal memory or the Mac app.");

  const verifyRuntime = async (runtimeDir, role) => {
    // Never leave probe files in a live runtime; a staged runtime is invocation-owned.
    const candidate = runtimeDir === appDir ? path.join(installRoot, `.verify-cli-${process.pid}`) : path.join(runtimeDir, 'verify-cli');
    await writeFile(candidate, cliShim({ appDir: runtimeDir, cliConfigPath, qmd: selectedQmd }), { mode: 0o755 });
    try { await verifyInstallation({ options: { ...options, readOnly: true }, cliPath: candidate, memoryRoot, runtime: { role, version: await readInstalledVersion(runtimeDir), beforeChanges: true } }); }
    finally { await rm(candidate, { force: true }); }
  };
  // A reused runtime must prove the current readiness contract before its shim/manifest change.
  if (options.reuseApp) await verifyRuntime(appDir, "installed");
  else await installApp({ source, ref, appDir, skipBuild: options.skipBuild, dependencies, companion, beforePublish: stagingDir => verifyRuntime(stagingDir, "candidate") });
  await mkdir(binDir, { recursive: true });
  await writeCliShim({ cliPath, appDir, cliConfigPath });
  await writeRemoteAccessPolicy(policyPlan);

  const now = new Date().toISOString();
  // A legacy manifest without cliConfigPath never proved ownership of an existing config file.
  const ownsConfig = previousManifest.cliConfigPath !== undefined || policyPlan.write || !existsSync(cliConfigPath);
  const manifest = {
    ...previousManifest,
    version: MANIFEST_VERSION,
    installer: INSTALLER_NAME,
    state: previousManifest.state ?? "ready",
    createdAt: previousManifest.createdAt ?? now,
    updatedAt: now,
    installedVersion: await readInstalledVersion(appDir),
    source: manifestSource,
    distribution: source === "release" ? "release" : "source",
    release: selectedRelease || null,
    node: durableNode(), qmd: selectedQmd || null, desktopPort: options.appPort || previousManifest.desktopPort,
    ref: ref ?? null,
    scope,
    installRoot,
    appDir,
    binDir,
    cliPath,
    cliConfigPath: ownsConfig ? cliConfigPath : undefined,
    memoryRoot,
    integrationMode: integrations,
    profile,
    addOns: { ...(previousManifest.addOns && typeof previousManifest.addOns === "object" ? previousManifest.addOns : {}), smartSearch: smartSearchBefore },
    ...(resultReport.policyChange ? { installerOptions: { ...previousManifest.installerOptions, skipBuild: Boolean(options.skipBuild) } } : {}),
  };
  if (!ownsConfig) log(`Existing ${cliConfigPath} predates recorded ownership; it is used but will not be removed by uninstall.`);
  await verifyInstallation({ options: { ...options, readOnly: true }, cliPath, memoryRoot, runtime: { role: "installed", version: manifest.installedVersion } });
  if (options.withApp) { await atomicJSON(manifestPath, manifest); await setupDesktop({ appDir, installRoot, home, memoryRoot, options }); }
  const refreshed = await refreshManagedIntegrations(manifest, { home });
  manifest.integrationHashes = refreshed.hashes;
  for (const item of refreshed.results) log(`Integration ${item.status}: ${item.path}`);
  await atomicJSON(manifestPath, manifest);
  if (smartSearchAction === "add" || smartSearchAction === "remove") {
    manifest.addOns.smartSearch = applySmartSearch({ action: smartSearchAction, cliPath, memoryRoot, options, modelId: smartSearchModelId });
    await atomicJSON(manifestPath, manifest);
  } else resultReport.smartSearch = { action: smartSearchAction, state: smartSearchAction === "keep" ? "on" : "off" };
  Object.assign(resultReport, { integrationRefresh: refreshed.results, version: manifest.installedVersion, state: resultReport.remainingActions.length ? "pending_user_action" : "ready" });

  console.log("\njumpyBrain update complete.");
  console.log(`CLI: ${cliPath}`);
  console.log(options.remoteOnly ? "Remote-only: no local brain or search engine." : `Memory preserved: ${memoryRoot}`);
  console.log(`CLI policy: ${policyPlan.description}`);
  console.log("Untouched managed integrations refreshed; customized, missing and untracked files preserved.");
  if (!options.remoteOnly) console.log(smartSearchLine(resultReport.smartSearch.state));
}

// The brain's own policy is the truth: `jumpybrain smart-search on|off` changes it without the installer.
function brainIndexingPolicy(memoryRoot) {
  try { return JSON.parse(readFileSync(path.join(memoryRoot, "jumpybrain.json"), "utf8"))?.indexing; }
  catch { return undefined; }
}
function smartSearchActive(memoryRoot) { return brainIndexingPolicy(memoryRoot)?.mode === "semantic"; }

// Turning the add-on on or off never fails the installation: keyword search is already verified.
// It uses the index flags every installed runtime since semantic setup understands
// (`smart-search on|off` is their newer spelling), and records what the brain actually uses.
function applySmartSearch({ action, cliPath, memoryRoot, options, modelId }) {
  if (action === "keep" || action === "none") { resultReport.smartSearch = { action, state: action === "keep" ? "on" : "off" }; return action === "keep"; }
  if (action === "add" && (!selectedQmd || options.skipInitialIndex)) {
    resultReport.smartSearch = { action, state: "pending" };
    resultReport.remainingActions.push(`Smart search was not turned on because local search is not set up yet; after doctor --check passes run: ${shellQuote(cliPath)} index --root ${shellQuote(memoryRoot)} --setup-semantic --download-model`);
    return false;
  }
  log(action === "add" ? "Turning on smart search: downloading and verifying its 334 MB model, then indexing" : "Turning off smart search and removing its downloaded model");
  const index = flags => run(cliPath, ["index", "--root", memoryRoot, ...flags], { env: provisioningEnvironment(cliPath) });
  // Only a model the brain selected by managed identity (`modelId`, read before switching) is removed; a custom path is left alone.
  try {
    index(action === "add" ? ["--setup-semantic", "--download-model"] : ["--lexical"]);
    resultReport.smartSearch = { action, state: action === "add" ? "on" : "off" };
    if (action === "remove" && modelId) {
      let removed;
      try { removed = removeSmartSearchModel(installationHome, process.env, modelId); }
      catch (error) { removed = { path: smartSearchModelPath(installationHome, process.env, modelId), removed: false, reason: error.message }; }
      resultReport.smartSearch.model = removed;
      if (removed.removed) log(`Removed the smart search model ${removed.path}`);
      else if (removed.reason) {
        const action = `Smart search is off, but its model was not removed (${removed.reason}). Delete ${removed.path} yourself to free the space.`;
        resultReport.remainingActions.push(action);
        log(action);
        const planned = resultReport.filesystem?.changes.find(item => item.role === "smart-search-model");
        if (planned) Object.assign(planned, { action: "keep", note: `not removed: ${removed.reason}` });
      }
    }
  } catch (error) {
    // The policy can be saved before a failed index; put an added policy back to keyword search.
    if (action === "add" && smartSearchActive(memoryRoot)) { try { index(["--lexical"]); } catch { /* reported below by the observed state */ } }
    const on = smartSearchActive(memoryRoot);
    resultReport.smartSearch = { action, state: action === "add" ? (on ? "on-not-ready" : "failed") : on ? "failed" : "off", error: error.message };
    resultReport.remainingActions.push(action === "add"
      ? `Smart search was not turned on (${error.message}); ${on ? "its index is incomplete, so searches fall back to keyword matches" : "keyword search works"}. Retry with: ${shellQuote(cliPath)} index --root ${shellQuote(memoryRoot)} --setup-semantic --download-model`
      : `Smart search could not be fully turned off (${error.message}). Retry with: ${shellQuote(cliPath)} index --root ${shellQuote(memoryRoot)} --lexical`);
  }
  return smartSearchActive(memoryRoot);
}

function smartSearchLine(state) {
  if (state === "on") return "Smart search is on: it also finds notes that say the same thing in other words. Turn it off with jumpybrain smart-search off.";
  if (state === "planned") return "Smart search will be turned on after installing (334 MB model download).";
  if (state === "failed" || state === "pending" || state === "on-not-ready") return "Smart search is not on yet; see the remaining action above. Keyword search works.";
  return `Smart search is off. ${SMART_SEARCH.outcome} Add it any time with jumpybrain smart-search on (334 MB download, runs only on this computer).`;
}

async function withTerminal(questions) {
  const { createInterface } = await import("node:readline/promises");
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try { return await questions(question => terminal.question(question)); }
  finally { terminal.close(); }
}

function reportBrowseOnly() {
  const plan = describePlan({ profile: "browse", smartSearch: false });
  Object.assign(resultReport, { state: "not_needed", profile: "browse", plan, remainingActions: ["Open the team brain's web address in your browser and choose Connect."] });
  console.log(`\n${browseInstructions()}`);
}

function parseArgs(argv) {
  const options = {
    scope: "global",
    integrations: "auto",
    dryRun: false,
    yes: false,
    skipBuild: false,
    skipQmdInstall: false,
    readOnlyTargets: [],
    allowWriteTargets: [],
    help: false,
    provided: new Set(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--json") options.json = true;
    else if (token === "--app-port") options.appPort = Number(requiredValue(argv, ++index, token));
    else if (token === "--with-app") { options.provided.add("with-app"); options.withApp = true; }
    else if (token === "--remote-only") { options.provided.add("remote-only"); options.remoteOnly = true; }
    else if (token === "--profile") { options.provided.add("profile"); options.profile = requiredValue(argv, ++index, token); }
    else if (token === "--smart-search") { options.provided.add("smart-search"); options.smartSearch = true; }
    else if (token === "--no-smart-search") { options.provided.add("no-smart-search"); options.smartSearch = false; }
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--yes" || token === "-y") options.yes = true;
    else if (token === "--skip-build") options.skipBuild = true;
    else if (token === "--skip-qmd-install") options.skipQmdInstall = true;
    else if (token === "--skip-initial-index") options.skipInitialIndex = true;
    else if (token === "--scope") { options.provided.add("scope"); options.scope = requiredValue(argv, ++index, token); }
    else if (token === "--memory-root") { options.provided.add("memory-root"); options.memoryRoot = requiredValue(argv, ++index, token); }
    else if (token === "--integrations") { options.provided.add("integrations"); options.integrations = requiredValue(argv, ++index, token); }
    else if (token === "--ref") options.ref = requiredValue(argv, ++index, token);
    else if (token === "--source") options.source = requiredValue(argv, ++index, token);
    else if (token === "--install-root") options.installRoot = requiredValue(argv, ++index, token);
    else if (token === "--read-only-target") options.readOnlyTargets.push(requiredValue(argv, ++index, token));
    else if (token === "--allow-write-target") options.allowWriteTargets.push(requiredValue(argv, ++index, token));
    else if (token === "--read-only-commands") options.readOnlyCommands = true;
    else if (token === "--allow-write-commands") options.allowWriteCommands = true;
    else if (token === "--home") options.home = requiredValue(argv, ++index, token);
    else if (token === "--cwd") options.cwd = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown option ${token}.\n\n${usage()}`);
  }

  if (!["global", "project"].includes(options.scope)) throw new Error("--scope must be global or project.");
  if (!["auto", "all", "none"].includes(options.integrations)) throw new Error("--integrations must be auto, all, or none.");
  if (options.provided.has("smart-search") && options.provided.has("no-smart-search")) throw new Error("--smart-search and --no-smart-search cannot be combined.");
  applyProfileFlags(options);
  if (options.appPort !== undefined && (!options.withApp || !Number.isInteger(options.appPort) || options.appPort < 1024 || options.appPort > 65535)) throw new Error("--app-port requires --with-app and a port from 1024 to 65535.");
  if (options.remoteOnly && !options.provided.has("integrations")) options.integrations = "none";
  if (options.remoteOnly && (options.integrations !== "none" || options.withApp)) throw new Error("--remote-only requires --integrations none and cannot include --with-app.");
  assertCompatiblePolicyFlags(options);
  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function usage() {
  return [
    "Usage: install.sh [options]",
    "",
    "Profiles (what you want jumpyBrain for; a terminal run without options asks, Enter accepts the default):",
    "  --profile personal          Personal memory for my agents: CLI, local keyword search, agent skills (default)",
    "  --profile mac-app           The Mac app plus personal memory (same as --with-app)",
    "  --profile remote            Connect my agents to a team brain: CLI only (same as --remote-only)",
    "  --profile browse            Browse a team brain in the browser: nothing to install; explains how",
    "",
    "Add-ons:",
    "  --smart-search              Also find notes that say the same thing in other words: downloads a 334 MB",
    "                              model once, runs only on this computer (later: jumpybrain smart-search on)",
    "  --no-smart-search           Turn smart search off on rerun and remove its downloaded model",
    "",
    "Options:",
    "  --with-app                  Also install and verify the Mac app using this brain",
    "  --app-port <port>           Local Mac helper port (default: 3787; existing setting preserved)",
    "  --remote-only               Install CLI without a local engine, brain or dependencies (integrations none)",
    "  --json                      Emit one structured result; progress goes to stderr",
    "  --scope global|project       Install global memory/integrations or project-local ones (default: global)",
    "  --memory-root <path>         Override memory root",
    "  --integrations auto|all|none Install detected integrations, all integrations, or none (default: auto)",
    "  --ref <git-ref>              Git ref to install when cloning from GitHub",
    "  --source <path-or-git-url>   Install from local source path or git URL",
    "  --install-root <path>        Install app/shims under this directory (default: ~/.jumpybrain)",
    "  --read-only-target <url>     Mark a remote target read-only (repeatable)",
    "  --allow-write-target <url>   Remove a remote target read-only policy (repeatable)",
    "  --read-only-commands        Block every state-changing CLI command on this device (local guard)",
    "  --allow-write-commands      Remove the read-only command mode",
    "  --dry-run                   Print the exact filesystem plan without writing files",
    "  --yes                       Never ask; use the defaults or recorded choices (agents, --json and pipes never get asked)",
    "",
    "Advanced (development and recovery; local search is then not verified):",
    "  --skip-build                Use the source's existing dist/ instead of installing dependencies and building",
    "  --skip-qmd-install          Do not provision the search engine when none is found",
    "  --skip-initial-index        Do not build the first search index",
  ].join("\n");
}

function ensureSupportedPlatform() {
  if (process.platform === "win32") throw new Error("The jumpyBrain installer currently supports macOS/Linux shells. On Windows, use the source install docs for now.");
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) throw new Error(`Node >=22 is required. Current Node is ${process.version}. Install a recent Node first, then rerun the installer.`);
}

async function installApp({ source, ref, appDir, skipBuild, dependencies, companion, beforePublish }) {
  await mkdir(path.dirname(appDir), { recursive: true });
  // Only delete scratch directories created by THIS invocation. Legacy fixed
  // app.installing/app.previous paths may contain user-configured preserved data.
  const stagingDir = await mkdtemp(`${appDir}.installing-`);
  let backupContainer;
  try {
    if (source === "release") {
      await installRelease(stagingDir, selectedRelease);
    } else if (isLocalPath(source)) {
      const sourceRoot = await realpath(source.startsWith("file://") ? fileURLToPath(source) : path.resolve(source));
      log(`Copying app from ${sourceRoot}`);
      await cp(sourceRoot, stagingDir, {
        recursive: true,
        filter: (src) => {
          const relative = path.relative(sourceRoot, src);
          if (!relative) return true;
          const parts = relative.split(path.sep);
          return ![".git", "node_modules", ".local-pack", ".dogfood-memory", ".jumpybrain", ".backend-pins", ".retiring", "tasks", "evals"].includes(parts[0])
            && !parts.some((part) => part === "node_modules" || part === ".build" || part === "__pycache__");
        },
      });
    } else {
      log(`Cloning ${source}${ref ? ` at ${ref}` : ""}`);
      run("git", ["clone", "--depth", "1", source, stagingDir], { cwd: path.dirname(appDir) });
      if (ref) {
        const fetch = spawnSync("git", ["fetch", "--depth", "1", "origin", ref], { cwd: stagingDir, stdio: "inherit" });
        if (fetch.status === 0) run("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: stagingDir });
        else {
          log(`Fetch for ${ref} failed; trying checkout from cloned refs.`);
          run("git", ["checkout", ref], { cwd: stagingDir });
        }
      }
    }

    if (dependencies === "omitted") {
      log("Remote-only: using the compiled package as is; no dependencies are installed and npm is not needed.");
    } else if (!skipBuild) {
      log("Installing dependencies");
      if (source === "release" && !existsSync(path.join(stagingDir, "package-lock.json"))) throw new Error("This release predates reproducible installer assets. Use an explicit trusted --source until a compatible release is published.");
      run("npm", source === "release" ? ["ci", "--omit=dev", "--no-audit", "--no-fund"] : ["ci", "--no-audit", "--no-fund"], { cwd: stagingDir });
      if (source !== "release") { log("Building CLI"); run("npm", ["run", "build"], { cwd: stagingDir }); }
      if (source !== "release") run('npm', ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stagingDir });
    } else if (!existsSync(path.join(stagingDir, "dist", "cli.js"))) {
      throw new Error("--skip-build was passed but dist/cli.js is missing from the install source.");
    }

    // Validate the new runtime selection, not package-local QMD in the old app.
    await beforePublish?.(stagingDir);

    if (companion) {
      commitCompanionUpdate(companion, stagingDir);
      try {
        const file = path.join(path.dirname(appDir), 'companion-retention-pending.json');
        const receipt = JSON.parse(await readFile(file, 'utf8'));
        pendingSoftware.push({ generation: receipt.generation });
        await rm(file);
      } catch (error) { log(`Companion software retention receipt unavailable: ${error.message}`); }
      return;
    }

    backupContainer = await mkdtemp(`${appDir}.previous-`);
    const backupDir = path.join(backupContainer, "app");
    let generation;
    if (existsSync(appDir)) {
      // Register before replacement. Failure later leaves an unfinished,
      // protected recovery generation instead of prematurely retiring it.
      try {
        const previous = JSON.parse(await readFile(path.join(path.dirname(appDir), 'install-manifest.json'), 'utf8'));
        generation = softwareStorage('begin', { home: installationHome, root: path.dirname(appDir), owner: process.pid,
          producer: 'source-cli', components: previous.state === 'installing' ? [] : ['cli'], payloads: [{ path: backupContainer, runtimes: ['app'] }] });
        await cp(path.join(path.dirname(appDir), 'install-manifest.json'), path.join(backupContainer, 'install-manifest.json'));
      } catch (error) { log(error.message); }
    }
    if (existsSync(appDir)) await rename(appDir, backupDir);
    try {
      await rename(stagingDir, appDir);
    } catch (error) {
      if (existsSync(backupDir) && !existsSync(appDir)) await rename(backupDir, appDir);
      throw error;
    }
    if (existsSync(backupDir)) {
      if (generation) pendingSoftware.push({ generation, versions: { cli: await readInstalledVersion(backupDir) } });
      retainedRollback = backupDir;
      log(`Previous runtime retained for verified rollback: ${backupDir}`);
    } else await rm(backupContainer, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    // Keep a backup containing an unrecovered app for manual recovery.
    if (backupContainer && !existsSync(path.join(backupContainer, "app"))) await rm(backupContainer, { recursive: true, force: true });
    throw error;
  }
}

// The current shim form with any recorded Node/engine path. A failed later step can
// leave this shim beside an older manifest, so a retry must still recognize it.
function currentShimPattern({ appDir, cliConfigPath, qmd }) {
  const node = "/\u0000dir/\u0000node", engine = "/\u0000qmd", quoted = String.raw`'(?:[^']|'\\'')*'`;
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let source = escape(cliShim({ appDir, cliConfigPath, node, qmd: qmd ? engine : undefined }));
  for (const value of [node, path.dirname(node), engine]) source = source.replaceAll(escape(`'${value}'`), quoted);
  return new RegExp(`^${source}$`);
}

async function writeCliShim({ cliPath, appDir, cliConfigPath }) {
  const temporary = `${cliPath}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, cliShim({ appDir, cliConfigPath, qmd: selectedQmd }), { mode: 0o755 });
    await access(temporary, fsConstants.X_OK);
    await rename(temporary, cliPath);
  } finally { await rm(temporary, { force: true }); }
}

async function planRemoteAccessPolicy(cliConfigPath, options) {
  const additions = new Set(options.readOnlyTargets.map(normalizeRemoteTargetOrigin));
  const removals = new Set(options.allowWriteTargets.map(normalizeRemoteTargetOrigin));
  const explicit = additions.size > 0 || removals.size > 0 || options.readOnlyCommands || options.allowWriteCommands;
  if (!explicit) {
    // Report an existing command mode without rewriting or failing on the preserved file.
    let readOnlyCommands = false;
    const preserved = existsSync(cliConfigPath);
    if (preserved) {
      try { readOnlyCommands = (await readPolicyConfig(cliConfigPath)).commands === "read-only"; }
      catch { readOnlyCommands = null; }
    }
    return { configPath: cliConfigPath, config: null, write: false, readOnlyCommands, description: preserved ? `preserved at ${cliConfigPath}${readOnlyCommands === null ? " (invalid policy; state-changing commands are blocked)" : readOnlyCommands ? " (read-only commands)" : ""}` : "not configured" };
  }

  const current = existsSync(cliConfigPath) ? await readPolicyConfig(cliConfigPath) : { schemaVersion: 1, remoteTargets: [] };
  const origins = new Set(current.remoteTargets.map((entry) => entry.origin));
  for (const origin of additions) origins.add(origin);
  for (const origin of removals) origins.delete(origin);
  const readOnlyCommands = options.readOnlyCommands ? true : options.allowWriteCommands ? false : current.commands === "read-only";
  // The command mode key is written only when on, so existing policy files keep their exact shape.
  const config = {
    schemaVersion: 1,
    remoteTargets: [...origins].sort().map((origin) => ({ origin, access: "read-only" })),
    ...(readOnlyCommands ? { commands: "read-only" } : {}),
  };
  const description = [
    additions.size > 0 ? `read-only ${[...additions].join(", ")}` : "",
    removals.size > 0 ? `write enabled ${[...removals].join(", ")}` : "",
    options.readOnlyCommands ? "read-only commands for every target" : "",
    options.allowWriteCommands ? "state-changing commands allowed" : "",
  ].filter(Boolean).join("; ");
  const keep = origins.size > 0 || readOnlyCommands;
  return { configPath: cliConfigPath, config, write: keep, remove: !keep && existsSync(cliConfigPath), readOnlyCommands, description };
}

async function writeRemoteAccessPolicy(plan) {
  if (plan.remove) {
    await rm(plan.configPath, { force: true });
    return;
  }
  if (!plan.write) return;
  await mkdir(path.dirname(plan.configPath), { recursive: true });
  const temporary = `${plan.configPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(plan.config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, plan.configPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readPolicyConfig(configPath) {
  let value;
  try {
    value = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot safely update CLI policy: ${configPath} is not valid JSON. Refusing to overwrite it.`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Cannot safely update CLI policy: ${configPath} must contain an object.`);
  const { commands, ...required } = value;
  if (value.schemaVersion !== 1 || !Array.isArray(value.remoteTargets) || Object.keys(required).sort().join(",") !== "remoteTargets,schemaVersion" || (commands !== undefined && commands !== "read-only")) {
    throw new Error(`Cannot safely update CLI policy: ${configPath} has an unsupported or ambiguous schema. Refusing to overwrite it.`);
  }
  const seen = new Set();
  const remoteTargets = value.remoteTargets.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "access,origin" || entry.access !== "read-only" || typeof entry.origin !== "string") {
      throw new Error(`Cannot safely update CLI policy: remoteTargets[${index}] is invalid. Refusing to overwrite it.`);
    }
    const origin = normalizeRemoteTargetOrigin(entry.origin);
    if (seen.has(origin)) throw new Error(`Cannot safely update CLI policy: duplicate normalized origin ${origin}. Refusing to overwrite it.`);
    seen.add(origin);
    return { origin, access: "read-only" };
  });
  return { schemaVersion: 1, remoteTargets, ...(commands ? { commands } : {}) };
}

function assertCompatiblePolicyFlags(options) {
  const additions = new Set(options.readOnlyTargets.map(normalizeRemoteTargetOrigin));
  const removals = new Set(options.allowWriteTargets.map(normalizeRemoteTargetOrigin));
  for (const origin of additions) {
    if (removals.has(origin)) throw new Error(`Remote target ${origin} appears in both --read-only-target and --allow-write-target.`);
  }
  if (options.readOnlyCommands && options.allowWriteCommands) throw new Error("--read-only-commands and --allow-write-commands cannot be combined.");
}

function logPolicyPlan(plan) {
  log(`CLI remote-access policy: ${plan.description}`);
}

async function initializeMemoryRoot({ cliPath, memoryRoot }) {
  log("Initializing memory root");
  run(cliPath, ["init", "--root", memoryRoot], { cwd: process.cwd(), env: provisioningEnvironment(cliPath) });
}

async function indexMemoryRoot({ cliPath, memoryRoot }) {
  log("Building initial memory index");
  run(cliPath, ["index", "--root", memoryRoot], { cwd: process.cwd(), env: provisioningEnvironment(cliPath) });
}

// The installer is explicitly provisioning this local root. Its two internal
// mutations must not inherit the command restriction it just installed, a
// preserved policy, or the caller's process-only restriction. Only these
// children use an absent policy path; installed commands keep their real policy.
function provisioningEnvironment(cliPath) {
  return { JUMPYBRAIN_READ_ONLY_COMMANDS: "", JUMPYBRAIN_CLI_CONFIG: path.join(path.dirname(cliPath), `.provision-policy-${randomUUID()}`) };
}


async function verifyInstallation({ options, cliPath, memoryRoot, runtime = { role: "installed", version: null } }) {
  if (options.remoteOnly) {
    run(cliPath, ["--version"], {});
    resultReport.checks.cli = true;
    return;
  }
  if (!selectedQmd || options.skipInitialIndex) {
    resultReport.remainingActions.push("Local recall was not verified; run doctor --check and recall after preparing the engine/index.");
    return;
  }
  const doctor = verificationCommand(cliPath, ["doctor", "--root", memoryRoot, "--check", "--json"], runtime);
  resultReport.checks.doctor = true;
  // A brain never indexed in the current format (older installs, skipped or failed
  // indexing) cannot pass read-only recall. Nothing derived is written before
  // publication; afterwards an ordinary recall repairs the rebuildable index
  // (without persisting index policy into jumpybrain.json) and must report complete.
  let readOnly = options.readOnly;
  if (readOnly && doctor.memoryRoot?.readiness?.freshness === "missing") {
    if (runtime.beforeChanges) {
      resultReport.indexPending = true;
      log("No published index exists yet; recall is verified after the installed runtime builds it.");
      return;
    }
    readOnly = false;
    resultReport.indexBuilt = true;
  }
  verificationCommand(cliPath, ["recall", "--root", memoryRoot, "--topic", "installation check", "--limit", "1", "--json", ...(readOnly ? ["--read-only"] : [])], runtime);
  resultReport.checks.recall = true;
}
function verificationCommand(cliPath, args, runtime) {
  const checked = spawnSync(cliPath, args, { env: { ...process.env, HOME: installationHome, ...(selectedQmd ? { JUMPYBRAIN_QMD_BIN: selectedQmd } : {}) }, encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  const result = classifyVerification(args[0], checked, { readOnly: args.includes("--read-only") });
  if (result.outcome !== "ready") {
    resultReport.checks[args[0]] = false;
    const subject = `${runtime.role} runtime ${runtime.version || "(unknown version)"}`;
    const inspect = `${shellQuote(resultReport.cliPath)} doctor --root ${shellQuote(resultReport.memoryRoot)}`;
    const failure = { check: args[0], outcome: result.outcome, runtime: runtime.role, version: runtime.version || null, engine: selectedQmd || null, engineSource: resultReport.engineSource || null, changed: !runtime.beforeChanges };
    const note = runtime.beforeChanges ? "Nothing was replaced." : "The previous runtime is retained for recovery; rerun the same command after correcting this.";
    let message;
    if (result.outcome === "incompatible_output") {
      failure.required = args[0] === "doctor" ? "doctor --check --json reporting ok" : "recall --json reporting retrieval status";
      failure.nextCommand = runtime.role === "installed" ? migrationCommand({ withApp: Boolean(resultReport.compatibility?.action === "reuse") }) : "Select a newer --ref/--source or use --source release.";
      message = `The ${subject} cannot report current ${args[0]} readiness (${result.detail}). This is a version incompatibility, not a search failure. ${note} Next: ${failure.nextCommand}`;
    } else if (result.outcome === "not_ready") {
      const failing = args[0] === "doctor" ? ["cli", "node", "qmd", "memoryRoot"].filter(key => result.packet[key]?.ok === false).concat(result.packet.retrievalProbe?.status === "failed" ? ["retrievalProbe"] : []) : [`retrieval ${result.packet.retrieval.status}`];
      Object.assign(failure, { failing, nextCommand: inspect });
      message = `The ${subject} reported ${args[0]} not ready${failing.length ? ` (${failing.join(", ")})` : ""}. ${note} Run ${inspect} to inspect readiness.`;
    } else {
      failure.nextCommand = inspect;
      message = `The ${subject} could not complete ${args[0]} (${result.detail}); it may have failed or predate this check. ${note} Run ${inspect} to inspect it.`;
    }
    resultReport.failure = failure;
    throw new Error(`${message} ${(checked.stderr || "").slice(-1000)}`.trim());
  }
  if (result.readOnlyLexical) resultReport.recallMode = 'verified-read-only-lexical';
  log(`Verified installed ${args[0]}; note contents are omitted from setup output.`);
  return result.packet;
}
async function setupDesktop({ appDir, installRoot, home, memoryRoot, options }) {
  run(process.execPath, [path.join(fileURLToPath(new URL('.', import.meta.url)), "setup-desktop.mjs"), "--prepared", appDir, "--home", home, ...(options.reuseApp ? ["--reuse"] : [])], { env: { JUMPYBRAIN_INSTALLER_LOCK_TOKEN: installerToken } });
  resultReport.appPath = path.join(home, "Applications/jumpyBrain.app");
  resultReport.checks.desktop = true;
}

function planIntegrations({ integrations, scope, home, cwd }) {
  if (integrations === "none") return { install: [], skipped: [{ kind: "all", reason: "disabled" }] };
  const allKinds = ["codex", "claude", "pi"];
  const requested = integrations === "all" ? allKinds : detectedHarnesses(home);
  const install = [];
  const skipped = [];

  for (const kind of allKinds) {
    if (!requested.includes(kind)) {
      skipped.push({ kind, reason: "not detected" });
      continue;
    }
    if (kind === "codex") install.push({ kind, asset: "skill", path: scope === "project" ? path.join(cwd, ".agents", "skills", "jumpybrain-memory", "SKILL.md") : path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md") });
    if (kind === "claude") install.push({ kind, asset: "skill", path: scope === "project" ? path.join(cwd, ".claude", "skills", "jumpybrain-memory", "SKILL.md") : path.join(home, ".claude", "skills", "jumpybrain-memory", "SKILL.md") });
    if (kind === "pi") install.push({ kind, asset: "pi-extension", path: scope === "project" ? path.join(cwd, ".pi", "extensions", "jumpybrain-memory.ts") : path.join(home, ".pi", "agent", "extensions", "jumpybrain-memory.ts") });
  }

  return { install, skipped };
}

function detectedHarnesses(home) {
  const override = process.env.JUMPYBRAIN_TEST_AVAILABLE_HARNESSES;
  if (override !== undefined) return override.split(",").map((item) => item.trim()).filter(Boolean);
  const detected = [];
  if (commandExists("codex") || existsSync(path.join(home, ".codex"))) detected.push("codex");
  if (commandExists("claude") || existsSync(path.join(home, ".claude"))) detected.push("claude");
  if (commandExists("pi") || existsSync(path.join(home, ".pi"))) detected.push("pi");
  return detected;
}

async function installIntegration({ item, memoryRoot, cliPath, appDir }) {
  await mkdir(path.dirname(item.path), { recursive: true });
  const assetPath = item.asset === "skill" ? path.join(appDir, "skills", "jumpybrain-memory", "SKILL.md") : path.join(appDir, "integrations", "pi", "jumpybrain-memory.ts");
  const rendered = renderTemplate(await readFile(assetPath, "utf8"), { memoryRoot, cliPath, asset: item.asset });
  if (existsSync(item.path) && await readFile(item.path, "utf8") !== rendered) throw new Error(`Integration was customized: ${item.path}. Preserve it before retrying.`);
  await writeFile(item.path, rendered, "utf8");
}

const renderTemplate = renderIntegration;

function printSummary(summary) {
  console.log(summary.dryRun ? "\njumpyBrain install dry run complete. No changes made." : "\njumpyBrain install complete.");
  if (summary.dryRun) console.log(`\n${formatFilesystem(resultReport.filesystem)}\n`);
  if (summary.remoteOnly) {
    console.log(`CLI: ${summary.cliPath}`);
    console.log(`CLI policy: ${summary.cliPolicy}`);
    console.log(`Remote-only: no local brain, search engine or agent integrations${resultReport.filesystem.runtimeDependencies === "omitted" ? ", and no dependencies" : ""}.`);
    console.log(summary.dryRun ? "\nAfter installing, read a shared brain with (the key comes from JUMPYBRAIN_API_KEY or ~/.config/jumpybrain/.env):" : "\nRead a shared brain with (the key comes from JUMPYBRAIN_API_KEY or ~/.config/jumpybrain/.env):");
    console.log(`${shellQuote(summary.cliPath)} recall --target-url https://your-server.example --topic "what should I know?" --limit 5`);
    console.log("\nTip: add the CLI bin directory to PATH if desired:");
    console.log(`export PATH=${shellQuote(summary.binDir)}:"$PATH"`);
    return;
  }
  console.log(`Memory root: ${summary.memoryRoot}`);
  console.log(`CLI: ${summary.cliPath}`);
  console.log(`CLI policy: ${summary.cliPolicy}`);
  if (summary.integrations.length > 0) {
    console.log(summary.dryRun ? "Integrations planned (would install):" : "Integrations installed:");
    for (const item of summary.integrations) console.log(`- ${item}`);
  } else {
    console.log(summary.dryRun ? "Integrations planned: none" : "Integrations installed: none");
  }
  if (summary.skippedIntegrations.length > 0) {
    console.log("Integrations skipped:");
    for (const item of summary.skippedIntegrations) console.log(`- ${item}`);
  }
  if (!summary.dryRun) {
    console.log(summary.searchReady ? "Keyword search is ready." : "Keyword search still needs its search dependency or initial index; check doctor before handing setup back.");
    console.log(smartSearchLine(summary.smartSearch));
    if (summary.integrations.length) {
      console.log("\nRestart or reload any assistant that was already open so it can discover its new integration.");
      console.log('Then ask: "Use jumpyBrain to remember that we chose weekly releases because smaller changes are easier to review."');
      console.log('In a fresh session, ask: "Use jumpyBrain to recall what we decided about releases."');
    }
  }
  console.log(summary.dryRun ? "\nAfter installing, verify with (an empty new brain has no matches):" : "\nTry (an empty new brain has no matches):");
  console.log(`${shellQuote(summary.cliPath)} recall --root ${shellQuote(summary.memoryRoot)} --topic "what should I remember?" --limit 5`);
  console.log("\nTip: add the CLI bin directory to PATH if desired:");
  console.log(`export PATH=${shellQuote(summary.binDir)}:"$PATH"`);
}

const manifestClassification = Symbol("manifestClassification");
async function readInstallManifest(filePath, expectedPaths) {
  if (!existsSync(filePath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot safely update the existing install: ${filePath} is not valid JSON. Refusing to overwrite it.`, { cause: error });
  }
  // Shared with Desktop setup and uninstall: only demonstrated installer shapes are accepted.
  const classification = classifyManifest(manifest, expectedPaths.installRoot);
  Object.defineProperty(manifest, manifestClassification, { value: classification, enumerable: false });
  return manifest;
}

function assertNoUnmanagedInstall(previousManifest, { installRoot, appDir, binDir, cliPath }) {
  if (previousManifest) return;
  const existingManagedPaths = [appDir, binDir, cliPath].filter((item) => existsSync(item));
  if (existingManagedPaths.length === 0) return;
  throw new Error([
    `An existing installation layout was found under ${installRoot}, but no valid install-manifest.json owns it.`,
    "Refusing to overwrite app or CLI files. Preserve or move the existing files, then run the installer again.",
  ].join("\n"));
}

function assertPreservedInstallSettings(options, current, home) {
  const requested = [
    ["scope", options.scope, current.scope],
    ["integrations", options.integrations, current.integrations],
    ["memory-root", options.memoryRoot ? path.resolve(expandHome(options.memoryRoot, home)) : undefined, current.memoryRoot],
  ];
  for (const [name, value, preserved] of requested) {
    if (!options.provided.has(name) || value === preserved) continue;
    throw new Error(`Existing install setting --${name} is ${JSON.stringify(preserved)}. Refusing to change it during an app/CLI-only update.`);
  }
}

async function readInstalledVersion(appDir) {
  try {
    const pkg = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

async function normalizeInstallSource(source) {
  if (!isLocalPath(source)) return source;
  return realpath(source.startsWith("file://") ? fileURLToPath(source) : path.resolve(source));
}

function isLocalPath(value) {
  if (value.startsWith("file://")) return true;
  if (/^[a-z]+:\/\//i.test(value)) return false;
  return existsSync(path.resolve(value));
}

function expandHome(value, home) {
  return value === "~" || value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
}

function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v ${shellQuote(command)} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, env: { ...process.env, ...options?.env, HOME: installationHome, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}`, ...(selectedQmd ? { JUMPYBRAIN_QMD_BIN: selectedQmd } : {}) }, stdio: jsonOutput ? ["ignore", 2, 2] : "inherit", timeout: 600000 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function log(message) {
  console.log(`[jumpybrain] ${message}`);
}

main().catch((error) => {
  observeFilesystem(resultReport.filesystem, "interrupted", { rollback: retainedRollback });
  if (!jsonOutput && resultReport.filesystem?.mode === "interrupted") console.error(`${formatFilesystem(resultReport.filesystem)}\n`);
  if (jsonOutput) process.stdout.write(JSON.stringify({ ...resultReport, error: error.message, blockers: error.blockers || [] }) + "\n");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
