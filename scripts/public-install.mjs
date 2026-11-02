#!/usr/bin/env node
import { refreshManagedIntegrations, renderIntegration } from '../integrations/electron/managed-integrations.mjs';
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, chmod, cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRemoteTargetOrigin } from "./remote-target-origin.mjs";
import { companionUpdatePlan, checkCompanionUpdate, commitCompanionUpdate } from "./macos-companion.mjs";
import { checkQmdInstallation, QMD_PACKAGE } from "./qmd-install-check.mjs";
import { atomicJSON, cliShim, preflight, selectEngine, discoverRelease, installRelease } from "./install-support.mjs";

const installerToken = randomUUID();
let unlock = async () => {};
let selectedQmd;
let installationHome;
let selectedRelease;
let resultReport = { schemaVersion: 1, state: "blocked", checks: {}, remainingActions: [] };
const jsonOutput = process.argv.includes("--json");
if (jsonOutput) console.log = (...args) => console.error(...args);

const DEFAULT_REPO = "https://github.com/nikoatwork/jumpyBrain.git";
const MANIFEST_VERSION = 1;
const INSTALLER_NAME = "jumpybrain-installer";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  ensureSupportedPlatform();
  ensureNodeVersion();

  const home = path.resolve(options.home ?? process.env.HOME ?? os.homedir());
  installationHome = home;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
  try {
    await installManaged({ options, home, cwd, installRoot });
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
  const scope = previousManifest?.scope ?? options.scope;
  const memoryRoot = path.resolve(expandHome(
    previousManifest?.memoryRoot ?? options.memoryRoot ?? (scope === "project" ? path.join(cwd, "memory") : path.join(installRoot, "memory")),
    home,
  ));
  const source = options.source ?? (options.ref
    ? (previousManifest?.distribution === "release" ? DEFAULT_REPO : previousManifest?.source ?? DEFAULT_REPO)
    : (previousManifest?.distribution === "release" ? "release" : previousManifest?.source))
    ?? process.env.JUMPYBRAIN_INSTALL_SOURCE ?? "release";
  const ref = options.ref ?? previousManifest?.ref ?? undefined;
  const integrations = previousManifest?.integrationMode ?? options.integrations;
  const manifestSource = source === "release" ? DEFAULT_REPO : await normalizeInstallSource(source);
  const remoteOnly = options.remoteOnly || previousManifest?.remoteOnly === true;
  options.remoteOnly = remoteOnly;
  if (existsSync(path.join(home, "Applications/jumpyBrain.app")) && previousManifest?.desktopPort && options.appPort && options.appPort !== previousManifest.desktopPort) throw new Error("The existing app port is preserved. Do not change it during setup.");
  for (const key of ["skipBuild", "skipQmdInstall", "skipInitialIndex"]) options[key] ||= Boolean(previousManifest?.installerOptions?.[key]);
  if (remoteOnly && (integrations !== "none" || options.withApp)) throw new Error("--remote-only requires --integrations none and cannot include --with-app.");
  const physicalMemory = await physicalPath(memoryRoot);
  for (const directory of [appDir, binDir, path.join(installRoot, "engines")]) {
    const protectedDir = await physicalPath(directory);
    if (physicalMemory === protectedDir || physicalMemory.startsWith(protectedDir + path.sep) || protectedDir.startsWith(physicalMemory + path.sep)) throw new Error("Memory must not overlap replaceable program or engine directories.");
  }
  resultReport = { ...resultReport, dryRun: options.dryRun, installRoot, cliPath, memoryRoot: remoteOnly ? null : memoryRoot, source, remoteOnly, integrations: [], skippedIntegrations: [] };
  await preflight({ options, installRoot, memoryRoot, source, home });
  if (!options.dryRun) {
    unlock = await lockInstallation(installRoot);
    const lockedManifest = await readInstallManifest(manifestPath, { installRoot, appDir, binDir, cliPath, cliConfigPath });
    if (JSON.stringify(lockedManifest) !== JSON.stringify(previousManifest)) throw new Error("Installation changed while waiting for its lock. Rerun the same command.");
  }
  selectedQmd = await selectEngine({ installRoot, appDir, skipInstall: options.skipQmdInstall, dryRun: options.dryRun, remoteOnly, previous: previousManifest?.qmd });
  resultReport.engine = selectedQmd;
  if (selectedQmd) log(`${options.dryRun && !existsSync(selectedQmd) ? "Would install private" : "Selected"} QMD CLI + SDK: ${selectedQmd}`);
  else if (!remoteOnly) log("Search dependency unavailable; skipping install and initial index as requested.");
  options.reuseApp = Boolean(options.withApp && previousManifest?.state !== "installing" && previousManifest && !options.source && !options.ref);
  if (source === "release") selectedRelease = options.reuseApp ? previousManifest.release : await discoverRelease();
  resultReport.release = selectedRelease || null;
  resultReport.state = options.dryRun ? "planned" : "failed";

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
    });
    return;
  }

  log(`${options.dryRun ? "Dry run: planning jumpyBrain installation" : "Installing jumpyBrain"} (${scope})`);
  log(`Install root: ${installRoot}`);
  log(`Memory root: ${memoryRoot}`);
  const policyPlan = await planRemoteAccessPolicy(cliConfigPath, options);
  summary.cliPolicy = policyPlan.description;
  logPolicyPlan(policyPlan);

  const integrationPlan = planIntegrations({ integrations, scope, home, cwd });
  if (!previousManifest) for (const item of integrationPlan.install) {
    if (existsSync(item.path)) throw new Error(`An integration already exists at ${item.path}. Preserve it or select --integrations none; it will not be overwritten.`);
  }
  const now = new Date().toISOString();
  const manifest = {
    version: MANIFEST_VERSION, installer: INSTALLER_NAME, state: "installing",
    createdAt: previousManifest?.createdAt ?? now, updatedAt: now,
    source: manifestSource, distribution: source === "release" ? "release" : "source", release: selectedRelease || null, ref: ref ?? null,
    scope, installRoot, appDir, binDir, cliPath, cliConfigPath, memoryRoot,
    node: process.execPath, qmd: selectedQmd || null, desktopPort: options.appPort || previousManifest?.desktopPort, remoteOnly, integrationMode: integrations,
    integrations: integrationPlan.install.map(({ kind, path }) => ({ kind, path })),
    installerOptions: { skipBuild: Boolean(options.skipBuild), skipQmdInstall: Boolean(options.skipQmdInstall), skipInitialIndex: Boolean(options.skipInitialIndex) },
    files: [cliPath, ...integrationPlan.install.map(item => item.path)],
    integrationHashes: previousManifest?.integrationHashes || {},
    ...(scope === "project" ? { projectRoot: cwd } : {}),
  };
  if (!options.dryRun) {
    await atomicJSON(manifestPath, manifest);
    await mkdir(installRoot, { recursive: true });
    await installApp({ source, ref, appDir, skipBuild: options.skipBuild });
    await mkdir(binDir, { recursive: true });
    await writeCliShim({ cliPath, appDir, cliConfigPath });
    await writeRemoteAccessPolicy(policyPlan);
    if (!remoteOnly) await initializeMemoryRoot({ cliPath, memoryRoot });
  }

  const qmdAvailable = Boolean(selectedQmd);
  summary.searchReady = qmdAvailable && !options.skipInitialIndex;
  if (!options.dryRun && qmdAvailable && !options.skipInitialIndex) await indexMemoryRoot({ cliPath, memoryRoot });

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
    await verifyInstallation({ options, cliPath, memoryRoot });
    if (options.withApp) await setupDesktop({ appDir, installRoot, home, memoryRoot, options });
    manifest.state = "ready";
    await atomicJSON(manifestPath, manifest);
  }
  Object.assign(resultReport, { version: manifest.installedVersion || selectedRelease?.version || null, integrations: summary.integrations, skippedIntegrations: summary.skippedIntegrations });
  if (summary.integrations.length && !options.dryRun) resultReport.remainingActions.push("Restart/reload any already-running assistant to activate its integration; file presence does not prove activation.");

  if (!options.dryRun) resultReport.state = resultReport.remainingActions.length ? "pending_user_action" : "ready";
  printSummary(summary);
}

async function lockInstallation(installRoot) {
  await mkdir(installRoot, { recursive: true });
  if ((await lstat(installRoot)).isSymbolicLink()) throw new Error("Install root must be a real directory, not a symlink.");
  const lock = path.join(installRoot, ".installer-lock");
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const recovery = path.join(installRoot, ".installer-recovery-lock");
    try { await mkdir(recovery, { mode: 0o700 }); }
    catch { throw new Error("Another installer is recovering its lock. Retry when it finishes."); }
    try {
      const owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8").catch(() => "null"));
      if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 2 || owner.host !== os.hostname()) throw new Error("Installer lock has no verifiable owner. Verify no install is running before manually removing .installer-lock.");
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (e) { if (e.code === "ESRCH") alive = false; else throw e; }
      if (alive) throw new Error("Another installer/update is active. Wait for it to finish.");
      if ((await lstat(lock)).isSymbolicLink()) throw new Error("Refusing a linked installer lock.");
      await rm(lock, { recursive: true });
      await mkdir(lock, { mode: 0o700 });
    } finally { await rm(recovery, { recursive: true }); }
  }
  await atomicJSON(path.join(lock, "owner.json"), { pid: process.pid, host: os.hostname(), token: installerToken });
  return () => rm(lock, { recursive: true });
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
}) {
  assertPreservedInstallSettings(options, { scope, integrations, memoryRoot }, home);

  log("Existing managed installation detected");
  log(`Install root: ${installRoot}`);
  log(`Memory root (preserved): ${memoryRoot}`);
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

  if (options.dryRun) {
    resultReport.state = "planned";
    console.log("\njumpyBrain update dry run complete.");
    console.log(`CLI: ${cliPath}`);
    console.log(`Memory preserved: ${memoryRoot}`);
    console.log(`CLI policy: ${policyPlan.description}`);
    return;
  }

  if (!options.reuseApp) await installApp({ source, ref, appDir, skipBuild: options.skipBuild, companion,
    beforePublish: async stagingDir => {
      const candidate = path.join(stagingDir, 'verify-cli');
      await writeFile(candidate, cliShim({ appDir: stagingDir, cliConfigPath, qmd: selectedQmd }), { mode: 0o755 });
      try { await verifyInstallation({ options: { ...options, readOnly: true }, cliPath: candidate, memoryRoot }); }
      finally { await rm(candidate, { force: true }); }
    },
  });
  await mkdir(binDir, { recursive: true });
  await writeCliShim({ cliPath, appDir, cliConfigPath });
  await writeRemoteAccessPolicy(policyPlan);

  const now = new Date().toISOString();
  const manifest = {
    ...previousManifest,
    version: MANIFEST_VERSION,
    installer: INSTALLER_NAME,
    createdAt: previousManifest.createdAt ?? now,
    updatedAt: now,
    installedVersion: await readInstalledVersion(appDir),
    source: manifestSource,
    distribution: source === "release" ? "release" : "source",
    release: selectedRelease || null,
    node: process.execPath, qmd: selectedQmd || null, desktopPort: options.appPort || previousManifest.desktopPort,
    ref: ref ?? null,
    scope,
    installRoot,
    appDir,
    binDir,
    cliPath,
    cliConfigPath,
    memoryRoot,
    integrationMode: integrations,
  };
  await verifyInstallation({ options: { ...options, readOnly: true }, cliPath, memoryRoot });
  if (options.withApp) { await atomicJSON(manifestPath, manifest); await setupDesktop({ appDir, installRoot, home, memoryRoot, options }); }
  const refreshed = await refreshManagedIntegrations(manifest, { home });
  manifest.integrationHashes = refreshed.hashes;
  for (const item of refreshed.results) log(`Integration ${item.status}: ${item.path}`);
  await atomicJSON(manifestPath, manifest);
  Object.assign(resultReport, { integrationRefresh: refreshed.results, version: manifest.installedVersion, state: resultReport.remainingActions.length ? "pending_user_action" : "ready" });

  console.log("\njumpyBrain update complete.");
  console.log(`CLI: ${cliPath}`);
  console.log(`Memory preserved: ${memoryRoot}`);
  console.log(`CLI policy: ${policyPlan.description}`);
  console.log("Untouched managed integrations refreshed; customized, missing and untracked files preserved.");
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
    else if (token === "--with-app") options.withApp = true;
    else if (token === "--remote-only") options.remoteOnly = true;
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
    else if (token === "--home") options.home = requiredValue(argv, ++index, token);
    else if (token === "--cwd") options.cwd = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown option ${token}.\n\n${usage()}`);
  }

  if (!["global", "project"].includes(options.scope)) throw new Error("--scope must be global or project.");
  if (!["auto", "all", "none"].includes(options.integrations)) throw new Error("--integrations must be auto, all, or none.");
  if (options.appPort !== undefined && (!options.withApp || !Number.isInteger(options.appPort) || options.appPort < 1024 || options.appPort > 65535)) throw new Error("--app-port requires --with-app and a port from 1024 to 65535.");
  if (options.remoteOnly && !options.provided.has("integrations")) options.integrations = "none";
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
    "Options:",
    "  --with-app                  Also install and verify the Mac app using this brain",
    "  --app-port <port>           Local Mac helper port (default: 3787; existing setting preserved)",
    "  --remote-only               Install CLI without a local engine or brain (integrations none)",
    "  --json                      Emit one structured result; progress goes to stderr",
    "  --scope global|project       Install global memory/integrations or project-local ones (default: global)",
    "  --memory-root <path>         Override memory root",
    "  --integrations auto|all|none Install detected integrations, all integrations, or none (default: auto)",
    "  --ref <git-ref>              Git ref to install when cloning from GitHub",
    "  --source <path-or-git-url>   Install from local source path or git URL",
    "  --install-root <path>        Install app/shims under this directory (default: ~/.jumpybrain)",
    "  --read-only-target <url>     Mark a remote target read-only (repeatable)",
    "  --allow-write-target <url>   Remove a remote target read-only policy (repeatable)",
    "  --dry-run                   Print planned actions without writing files",
    "  --yes                       Reserved for non-interactive future prompts",
  ].join("\n");
}

function ensureSupportedPlatform() {
  if (process.platform === "win32") throw new Error("The jumpyBrain installer currently supports macOS/Linux shells. On Windows, use the source install docs for now.");
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) throw new Error(`Node >=22 is required. Current Node is ${process.version}. Install a recent Node first, then rerun the installer.`);
}

async function installApp({ source, ref, appDir, skipBuild, companion, beforePublish }) {
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

    if (!skipBuild) {
      log("Installing dependencies");
      if (source === "release" && !existsSync(path.join(stagingDir, "package-lock.json"))) throw new Error("This release predates reproducible installer assets. Use an explicit trusted --source until a compatible release is published.");
      run("npm", source === "release" ? ["ci", "--omit=dev", "--no-audit", "--no-fund"] : ["ci", "--no-audit", "--no-fund"], { cwd: stagingDir });
      if (source !== "release") { log("Building CLI"); run("npm", ["run", "build"], { cwd: stagingDir }); }
    } else if (!existsSync(path.join(stagingDir, "dist", "cli.js"))) {
      throw new Error("--skip-build was passed but dist/cli.js is missing from the install source.");
    }

    // Validate the new runtime selection, not package-local QMD in the old app.
    await beforePublish?.(stagingDir);

    if (companion) {
      commitCompanionUpdate(companion, stagingDir);
      return;
    }

    backupContainer = await mkdtemp(`${appDir}.previous-`);
    const backupDir = path.join(backupContainer, "app");
    if (existsSync(appDir)) await rename(appDir, backupDir);
    try {
      await rename(stagingDir, appDir);
    } catch (error) {
      if (existsSync(backupDir) && !existsSync(appDir)) await rename(backupDir, appDir);
      throw error;
    }
    if (existsSync(backupDir)) {
      const retirement = spawnSync('python3', ['-B', fileURLToPath(new URL('../integrations/electron/update-retention.py', import.meta.url)), '--runtime', backupDir], { encoding: 'utf8', timeout: 10000 });
      if (retirement.status === 0) { log(`Previous runtime retirement: ${retirement.stdout.trim()}`); await rm(backupContainer, { recursive: true, force: true }); }
      else log(`Previous runtime retained (live, legacy, frozen or unverified): ${backupDir}`);
    } else await rm(backupContainer, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    // Keep a backup containing an unrecovered app for manual recovery.
    if (backupContainer && !existsSync(path.join(backupContainer, "app"))) await rm(backupContainer, { recursive: true, force: true });
    throw error;
  }
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
  const explicit = additions.size > 0 || removals.size > 0;
  if (!explicit) {
    return { configPath: cliConfigPath, config: null, write: false, description: existsSync(cliConfigPath) ? `preserved at ${cliConfigPath}` : "not configured" };
  }

  const current = existsSync(cliConfigPath) ? await readPolicyConfig(cliConfigPath) : { schemaVersion: 1, remoteTargets: [] };
  const origins = new Set(current.remoteTargets.map((entry) => entry.origin));
  for (const origin of additions) origins.add(origin);
  for (const origin of removals) origins.delete(origin);
  const config = {
    schemaVersion: 1,
    remoteTargets: [...origins].sort().map((origin) => ({ origin, access: "read-only" })),
  };
  const description = [
    additions.size > 0 ? `read-only ${[...additions].join(", ")}` : "",
    removals.size > 0 ? `write enabled ${[...removals].join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return { configPath: cliConfigPath, config, write: origins.size > 0, remove: origins.size === 0 && existsSync(cliConfigPath), description };
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
  if (value.schemaVersion !== 1 || !Array.isArray(value.remoteTargets) || Object.keys(value).sort().join(",") !== "remoteTargets,schemaVersion") {
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
  return { schemaVersion: 1, remoteTargets };
}

function assertCompatiblePolicyFlags(options) {
  const additions = new Set(options.readOnlyTargets.map(normalizeRemoteTargetOrigin));
  const removals = new Set(options.allowWriteTargets.map(normalizeRemoteTargetOrigin));
  for (const origin of additions) {
    if (removals.has(origin)) throw new Error(`Remote target ${origin} appears in both --read-only-target and --allow-write-target.`);
  }
}

function logPolicyPlan(plan) {
  log(`CLI remote-access policy: ${plan.description}`);
}

async function initializeMemoryRoot({ cliPath, memoryRoot }) {
  log("Initializing memory root");
  run(cliPath, ["init", "--root", memoryRoot], { cwd: process.cwd() });
}

async function indexMemoryRoot({ cliPath, memoryRoot }) {
  log("Building initial memory index");
  run(cliPath, ["index", "--root", memoryRoot], { cwd: process.cwd() });
}


async function verifyInstallation({ options, cliPath, memoryRoot }) {
  if (options.remoteOnly) {
    run(cliPath, ["--version"], {});
    resultReport.checks.cli = true;
    return;
  }
  if (!selectedQmd || options.skipInitialIndex) {
    resultReport.remainingActions.push("Local recall was not verified; run doctor --check and recall after preparing the engine/index.");
    return;
  }
  verificationCommand(cliPath, ["doctor", "--root", memoryRoot, "--check", "--json"]);
  resultReport.checks.doctor = true;
  verificationCommand(cliPath, ["recall", "--root", memoryRoot, "--topic", "installation check", "--limit", "1", "--json", ...(options.readOnly ? ["--read-only"] : [])]);
  resultReport.checks.recall = true;
}
function verificationCommand(cliPath, args) {
  const checked = spawnSync(cliPath, args, { env: { ...process.env, HOME: installationHome, ...(selectedQmd ? { JUMPYBRAIN_QMD_BIN: selectedQmd } : {}) }, encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  if (checked.error || checked.status !== 0) {
    resultReport.checks[args[0]] = false;
    throw new Error(`Installed ${args[0]} verification failed (${checked.error?.code || checked.status}). Run ${shellQuote(cliPath)} ${args[0]} --root ${shellQuote(resultReport.memoryRoot)} to inspect readiness. ${(checked.stderr || "").slice(-1000)}`);
  }
  const packet = JSON.parse(checked.stdout);
  const readOnlyReady = args.includes('--read-only') && packet.readiness?.freshness === 'fresh'
    && packet.retrieval?.status === 'partial' && packet.retrieval.warnings?.length > 0
    && packet.retrieval.warnings.every(warning => ['read_only_index', 'read_only_lexical_fallback'].includes(warning));
  if (args[0] === "doctor" ? packet.ok !== true : packet.retrieval?.status !== "complete" && !readOnlyReady) throw new Error(`Installed ${args[0]} did not report complete readiness.`);
  if (readOnlyReady) resultReport.recallMode = 'verified-read-only-lexical';
  log(`Verified installed ${args[0]}; note contents are omitted from setup output.`);
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
    console.log(summary.searchReady ? "Local text search is ready. A semantic model is optional." : "Local text search still needs its search dependency or initial index; check doctor before handing setup back.");
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

async function readInstallManifest(filePath, expectedPaths) {
  if (!existsSync(filePath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot safely update the existing install: ${filePath} is not valid JSON. Refusing to overwrite it.`, { cause: error });
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.installer !== INSTALLER_NAME) {
    throw new Error(`Cannot safely update the existing install: ${filePath} is not a ${INSTALLER_NAME} manifest. Refusing to overwrite it.`);
  }

  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(`Cannot safely update the existing install: manifest version ${JSON.stringify(manifest.version)} is unsupported. Refusing to overwrite it.`);
  }

  for (const key of ["installRoot", "appDir", "binDir", "cliPath"]) {
    if (typeof manifest[key] !== "string" || manifest[key].length === 0) {
      throw new Error(`Cannot safely update the existing install: manifest ${key} must be a non-empty path. Refusing to overwrite it.`);
    }
    if (path.resolve(manifest[key]) !== expectedPaths[key]) {
      throw new Error(`Cannot safely update the existing install: manifest ${key} does not match ${expectedPaths[key]}. Refusing to overwrite it.`);
    }
  }
  if (manifest.cliConfigPath !== undefined && (typeof manifest.cliConfigPath !== "string" || path.resolve(manifest.cliConfigPath) !== expectedPaths.cliConfigPath)) {
    throw new Error(`Cannot safely update the existing install: manifest cliConfigPath does not match ${expectedPaths.cliConfigPath}. Refusing to overwrite it.`);
  }

  if (!["global", "project"].includes(manifest.scope)) {
    throw new Error(`Cannot safely update the existing install: manifest scope ${JSON.stringify(manifest.scope)} is unsupported. Refusing to overwrite it.`);
  }
  if (!["auto", "all", "none"].includes(manifest.integrationMode)) {
    throw new Error(`Cannot safely update the existing install: manifest integrationMode ${JSON.stringify(manifest.integrationMode)} is unsupported. Refusing to overwrite it.`);
  }
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
  if (jsonOutput) process.stdout.write(JSON.stringify({ ...resultReport, error: error.message, blockers: error.blockers || [] }) + "\n");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
