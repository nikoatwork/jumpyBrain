#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, chmod, cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const scope = options.scope;
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
  const memoryRoot = path.resolve(expandHome(options.memoryRoot ?? (scope === "project" ? path.join(cwd, "memory") : path.join(installRoot, "memory")), home));
  const appDir = path.join(installRoot, "app");
  const binDir = path.join(installRoot, "bin");
  const cliPath = path.join(binDir, process.platform === "win32" ? "jumpybrain.cmd" : "jumpybrain");
  const source = options.source ?? process.env.JUMPYBRAIN_INSTALL_SOURCE ?? DEFAULT_REPO;

  const summary = {
    installRoot,
    appDir,
    binDir,
    cliPath,
    memoryRoot,
    scope,
    integrations: [],
    skippedIntegrations: [],
    dryRun: options.dryRun,
  };

  log(`Installing jumpyBrain (${scope})`);
  log(`Install root: ${installRoot}`);
  log(`Memory root: ${memoryRoot}`);

  if (!options.dryRun) {
    await mkdir(installRoot, { recursive: true });
    await installApp({ source, ref: options.ref, appDir, skipBuild: options.skipBuild, dryRun: options.dryRun });
    await mkdir(binDir, { recursive: true });
    await writeCliShim({ cliPath, appDir });
    await initializeMemoryRoot({ cliPath, memoryRoot });
  }

  await ensureQmd({ skipInstall: options.skipQmdInstall, dryRun: options.dryRun });

  const integrationPlan = planIntegrations({ integrations: options.integrations, scope, home, cwd });
  for (const item of integrationPlan.install) {
    if (!options.dryRun) await installIntegration({ item, memoryRoot, cliPath, appDir });
    summary.integrations.push(`${item.kind}:${item.path}`);
  }
  for (const item of integrationPlan.skipped) summary.skippedIntegrations.push(`${item.kind}:${item.reason}`);

  if (!options.dryRun) {
    const manifest = {
      version: MANIFEST_VERSION,
      installer: INSTALLER_NAME,
      createdAt: new Date().toISOString(),
      scope,
      installRoot,
      appDir,
      binDir,
      cliPath,
      memoryRoot,
      integrations: integrationPlan.install.map((item) => ({ kind: item.kind, path: item.path })),
      files: [cliPath, ...integrationPlan.install.map((item) => item.path)],
    };
    await writeFile(path.join(installRoot, "install-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  printSummary(summary);
}

function parseArgs(argv) {
  const options = {
    scope: "global",
    integrations: "auto",
    dryRun: false,
    yes: false,
    skipBuild: false,
    skipQmdInstall: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--yes" || token === "-y") options.yes = true;
    else if (token === "--skip-build") options.skipBuild = true;
    else if (token === "--skip-qmd-install") options.skipQmdInstall = true;
    else if (token === "--scope") options.scope = requiredValue(argv, ++index, token);
    else if (token === "--memory-root") options.memoryRoot = requiredValue(argv, ++index, token);
    else if (token === "--integrations") options.integrations = requiredValue(argv, ++index, token);
    else if (token === "--ref") options.ref = requiredValue(argv, ++index, token);
    else if (token === "--source") options.source = requiredValue(argv, ++index, token);
    else if (token === "--install-root") options.installRoot = requiredValue(argv, ++index, token);
    else if (token === "--home") options.home = requiredValue(argv, ++index, token);
    else if (token === "--cwd") options.cwd = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown option ${token}.\n\n${usage()}`);
  }

  if (!["global", "project"].includes(options.scope)) throw new Error("--scope must be global or project.");
  if (!["auto", "all", "none"].includes(options.integrations)) throw new Error("--integrations must be auto, all, or none.");
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
  await rm(appDir, { recursive: true, force: true });
  await mkdir(path.dirname(appDir), { recursive: true });

  if (isLocalPath(source)) {
    const sourceRoot = await realpath(source.startsWith("file://") ? fileURLToPath(source) : path.resolve(source));
    log(`Copying app from ${sourceRoot}`);
    await cp(sourceRoot, appDir, {
      recursive: true,
      filter: (src) => {
        const relative = path.relative(sourceRoot, src);
        if (!relative) return true;
        const parts = relative.split(path.sep);
        return ![".git", "node_modules", ".local-pack", ".dogfood-memory", ".bench-tmp", "benchdata", "bench-results", "tasks"].includes(parts[0]);
      },
    });
  } else {
    log(`Cloning ${source}${ref ? ` at ${ref}` : ""}`);
    run("git", ["clone", "--depth", "1", source, appDir], { cwd: path.dirname(appDir) });
    if (ref) {
      const fetch = spawnSync("git", ["fetch", "--depth", "1", "origin", ref], { cwd: appDir, stdio: "inherit" });
      if (fetch.status !== 0) log(`Fetch for ${ref} failed; trying checkout from cloned refs.`);
      run("git", ["checkout", ref], { cwd: appDir });
    }
  }

  if (!skipBuild) {
    log("Installing dependencies");
    run("npm", ["install"], { cwd: appDir });
    log("Building CLI");
    run("npm", ["run", "build"], { cwd: appDir });
  } else if (!existsSync(path.join(appDir, "dist", "cli.js"))) {
    throw new Error("--skip-build was passed but dist/cli.js is missing from the install source.");
  }
}

async function writeCliShim({ cliPath, appDir }) {
  const cliTarget = path.join(appDir, "dist", "cli.js");
  await rm(cliPath, { force: true });
  await writeFile(cliPath, `#!/usr/bin/env sh\nexec node ${JSON.stringify(cliTarget)} "$@"\n`, "utf8");
  await chmod(cliPath, 0o755);
  await access(cliPath, fsConstants.X_OK);
}

async function initializeMemoryRoot({ cliPath, memoryRoot }) {
  log("Initializing memory root");
  run(cliPath, ["init", "--root", memoryRoot], { cwd: process.cwd() });
}

async function ensureQmd({ skipInstall, dryRun }) {
  const configured = process.env.JUMPYBRAIN_QMD_BIN;
  if (configured && commandWorks(configured, ["--version"])) {
    log(`QMD available: ${configured}`);
    return;
  }
  if (commandWorks("qmd", ["--version"])) {
    log("QMD available: qmd");
    return;
  }
  if (skipInstall) {
    log("QMD not found; skipping install because --skip-qmd-install was passed.");
    return;
  }
  if (dryRun) {
    log("Would install QMD with: npm install -g @tobilu/qmd");
    return;
  }
  log("QMD not found; installing @tobilu/qmd globally");
  run("npm", ["install", "-g", "@tobilu/qmd"], { cwd: process.cwd() });
  if (!commandWorks("qmd", ["--version"])) throw new Error("QMD install completed but `qmd --version` still failed. Ensure npm global bin is on PATH or set JUMPYBRAIN_QMD_BIN.");
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
