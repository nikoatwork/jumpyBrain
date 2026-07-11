#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, chmod, cp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRemoteTargetOrigin } from "./remote-target-origin.mjs";

const DEFAULT_REPO = "https://github.com/nikoatwork/jumpyBrain.git";
const MANIFEST_VERSION = 1;
const INSTALLER_NAME = "jumpybrain-installer";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  ensureSupportedPlatform();
  ensureNodeVersion();

  const home = path.resolve(options.home ?? process.env.HOME ?? os.homedir());
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
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
  const source = options.source ?? previousManifest?.source ?? process.env.JUMPYBRAIN_INSTALL_SOURCE ?? DEFAULT_REPO;
  const ref = options.ref ?? previousManifest?.ref ?? undefined;
  const integrations = previousManifest?.integrationMode ?? options.integrations;
  const manifestSource = await normalizeInstallSource(source);

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

  if (previousManifest) {
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

  log(`Installing jumpyBrain (${scope})`);
  log(`Install root: ${installRoot}`);
  log(`Memory root: ${memoryRoot}`);
  const policyPlan = await planRemoteAccessPolicy(cliConfigPath, options);
  summary.cliPolicy = policyPlan.description;
  logPolicyPlan(policyPlan);

  if (!options.dryRun) {
    await mkdir(installRoot, { recursive: true });
    await installApp({ source, ref, appDir, skipBuild: options.skipBuild });
    await mkdir(binDir, { recursive: true });
    await writeCliShim({ cliPath, appDir, cliConfigPath });
    await writeRemoteAccessPolicy(policyPlan);
    await initializeMemoryRoot({ cliPath, memoryRoot });
  }

  const qmdAvailable = await ensureQmd({ skipInstall: options.skipQmdInstall, dryRun: options.dryRun });
  if (!options.dryRun && qmdAvailable && !options.skipInitialIndex) await indexMemoryRoot({ cliPath, memoryRoot });

  const integrationPlan = planIntegrations({ integrations, scope, home, cwd });
  for (const item of integrationPlan.install) {
    if (!options.dryRun) await installIntegration({ item, memoryRoot, cliPath, appDir });
    summary.integrations.push(`${item.kind}:${item.path}`);
  }
  for (const item of integrationPlan.skipped) summary.skippedIntegrations.push(`${item.kind}:${item.reason}`);

  if (!options.dryRun) {
    const now = new Date().toISOString();
    const manifest = {
      version: MANIFEST_VERSION,
      installer: INSTALLER_NAME,
      createdAt: previousManifest?.createdAt ?? now,
      updatedAt: now,
      installedVersion: await readInstalledVersion(appDir),
      source: manifestSource,
      ref: ref ?? null,
      scope,
      installRoot,
      appDir,
      binDir,
      cliPath,
      cliConfigPath,
      memoryRoot,
      integrationMode: integrations,
      integrations: integrationPlan.install.map((item) => ({ kind: item.kind, path: item.path })),
      installerOptions: {
        skipBuild: Boolean(options.skipBuild),
        skipQmdInstall: Boolean(options.skipQmdInstall),
        skipInitialIndex: Boolean(options.skipInitialIndex),
      },
      files: [cliPath, ...integrationPlan.install.map((item) => item.path)],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  printSummary(summary);
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
  log("Updating app and CLI only; memory, memory-root config, derived indexes, and integrations will not be changed (CLI policy changes only with explicit target flags)");
  const policyPlan = await planRemoteAccessPolicy(cliConfigPath, options);
  logPolicyPlan(policyPlan);

  if (options.dryRun) {
    console.log("\njumpyBrain update dry run complete.");
    console.log(`CLI: ${cliPath}`);
    console.log(`Memory preserved: ${memoryRoot}`);
    console.log(`CLI policy: ${policyPlan.description}`);
    return;
  }

  await installApp({ source, ref, appDir, skipBuild: options.skipBuild });
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
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("\njumpyBrain update complete.");
  console.log(`CLI: ${cliPath}`);
  console.log(`Memory preserved: ${memoryRoot}`);
  console.log(`CLI policy: ${policyPlan.description}`);
  console.log("Integrations unchanged.");
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

async function installApp({ source, ref, appDir, skipBuild }) {
  const stagingDir = `${appDir}.installing`;
  const backupDir = `${appDir}.previous`;
  if (!existsSync(appDir) && existsSync(backupDir)) {
    log("Recovering the previous app after an interrupted update");
    await rename(backupDir, appDir);
  } else if (existsSync(appDir)) {
    await rm(backupDir, { recursive: true, force: true });
  }
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(path.dirname(appDir), { recursive: true });

  try {
    if (isLocalPath(source)) {
      const sourceRoot = await realpath(source.startsWith("file://") ? fileURLToPath(source) : path.resolve(source));
      log(`Copying app from ${sourceRoot}`);
      await cp(sourceRoot, stagingDir, {
        recursive: true,
        filter: (src) => {
          const relative = path.relative(sourceRoot, src);
          if (!relative) return true;
          const parts = relative.split(path.sep);
          return ![".git", "node_modules", ".local-pack", ".dogfood-memory", "tasks"].includes(parts[0]);
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
      run("npm", ["install"], { cwd: stagingDir });
      log("Building CLI");
      run("npm", ["run", "build"], { cwd: stagingDir });
    } else if (!existsSync(path.join(stagingDir, "dist", "cli.js"))) {
      throw new Error("--skip-build was passed but dist/cli.js is missing from the install source.");
    }

    if (existsSync(appDir)) await rename(appDir, backupDir);
    try {
      await rename(stagingDir, appDir);
    } catch (error) {
      if (existsSync(backupDir) && !existsSync(appDir)) await rename(backupDir, appDir);
      throw error;
    }
    await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

async function writeCliShim({ cliPath, appDir, cliConfigPath }) {
  const cliTarget = path.join(appDir, "dist", "cli.js");
  await rm(cliPath, { force: true });
  await writeFile(cliPath, [
    "#!/usr/bin/env sh",
    "if [ -z \"${JUMPYBRAIN_CLI_CONFIG+x}\" ]; then",
    `  export JUMPYBRAIN_CLI_CONFIG=${shellQuote(cliConfigPath)}`,
    "fi",
    `exec node ${JSON.stringify(cliTarget)} "$@"`,
    "",
  ].join("\n"), "utf8");
  await chmod(cliPath, 0o755);
  await access(cliPath, fsConstants.X_OK);
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

async function ensureQmd({ skipInstall, dryRun }) {
  const configured = process.env.JUMPYBRAIN_QMD_BIN;
  if (configured && commandWorks(configured, ["--version"])) {
    log(`QMD available: ${configured}`);
    return true;
  }
  if (commandWorks("qmd", ["--version"])) {
    log("QMD available: qmd");
    return true;
  }
  if (skipInstall) {
    log("QMD not found; skipping install because --skip-qmd-install was passed.");
    return false;
  }
  if (dryRun) {
    log("Would install QMD with: npm install -g @tobilu/qmd");
    return false;
  }
  log("QMD not found; installing @tobilu/qmd globally");
  run("npm", ["install", "-g", "@tobilu/qmd"], { cwd: process.cwd() });
  if (!commandWorks("qmd", ["--version"])) throw new Error("QMD install completed but `qmd --version` still failed. Ensure npm global bin is on PATH or set JUMPYBRAIN_QMD_BIN.");
  return true;
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
  const rendered = renderTemplate(await readFile(assetPath, "utf8"), { memoryRoot, cliPath });
  await writeFile(item.path, rendered, "utf8");
}

function renderTemplate(content, { memoryRoot, cliPath }) {
  return content
    .replaceAll("__JUMPYBRAIN_MEMORY_ROOT__", memoryRoot)
    .replaceAll("__JUMPYBRAIN_CLI__", cliPath);
}

function printSummary(summary) {
  console.log("\njumpyBrain install complete.");
  console.log(`Memory root: ${summary.memoryRoot}`);
  console.log(`CLI: ${summary.cliPath}`);
  console.log(`CLI policy: ${summary.cliPolicy}`);
  if (summary.integrations.length > 0) {
    console.log("Integrations installed:");
    for (const item of summary.integrations) console.log(`- ${item}`);
  } else {
    console.log("Integrations installed: none");
  }
  if (summary.skippedIntegrations.length > 0) {
    console.log("Integrations skipped:");
    for (const item of summary.skippedIntegrations) console.log(`- ${item}`);
  }
  console.log("\nTry:");
  console.log(`${summary.cliPath} recall --root ${JSON.stringify(summary.memoryRoot)} --topic "what should I remember?" --limit 5`);
  console.log("\nTip: add the CLI bin directory to PATH if desired:");
  console.log(`export PATH=${JSON.stringify(summary.binDir)}:$PATH`);
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

function commandWorks(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function log(message) {
  console.log(`[jumpybrain] ${message}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
