import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stringArg, type ParsedCliArgs } from "./args.js";

const DEFAULT_REPO = "https://github.com/nikoatwork/jumpyBrain.git";
const DEFAULT_REF = "master";

interface InstallManifest {
  version?: number;
  installer?: string;
  installedVersion?: string;
  source?: string;
  ref?: string;
  scope?: string;
  installRoot?: string;
  appDir?: string;
  binDir?: string;
  cliPath?: string;
  memoryRoot?: string;
  integrationMode?: string;
  installerOptions?: {
    skipBuild?: boolean;
    skipQmdInstall?: boolean;
    skipInitialIndex?: boolean;
  };
}

export async function updateCli(args: ParsedCliArgs): Promise<void> {
  const plan = await installerUpdatePlan(args);

  if (plan.dryRun) {
    printUpdatePlan(plan);
    return;
  }

  console.log("Updating jumpyBrain with the installer.");
  console.log(`Install root: ${plan.installRoot}`);
  console.log(`Memory root: ${plan.memoryRoot}`);
  console.log(`Source: ${plan.source}${plan.ref ? ` (${plan.ref})` : ""}`);

  const result = spawnSync(process.execPath, [plan.installerScript, ...plan.installerArgs], {
    cwd: plan.appRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`jumpybrain update failed with exit code ${result.status ?? "unknown"}.`);
}

interface InstallerUpdatePlan {
  appRoot: string;
  installerScript: string;
  manifestPath: string;
  installRoot: string;
  memoryRoot: string;
  source: string;
  ref?: string;
  scope: string;
  integrationMode: string;
  dryRun: boolean;
  installerArgs: string[];
}

export async function installerUpdatePlan(args: ParsedCliArgs): Promise<InstallerUpdatePlan> {
  const home = path.resolve(stringArg(args, "home", process.env.HOME ?? os.homedir()));
  const installRoot = path.resolve(expandHome(stringArg(args, "install-root", path.join(home, ".jumpybrain")), home));
  const manifestPath = path.join(installRoot, "install-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error([
      `No jumpyBrain installer manifest found at ${manifestPath}.`,
      "`jumpybrain update` only works for installs created by the public installer.",
      "For source/dev installs, update manually with git pull && npm install && npm run build, or rerun install.sh.",
    ].join("\n"));
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as InstallManifest;
  if (manifest.installer && manifest.installer !== "jumpybrain-installer") {
    throw new Error(`Unsupported installer manifest '${manifest.installer}'. Rerun install.sh manually to refresh this install.`);
  }

  const appRoot = currentAppRoot();
  const installerScript = path.join(appRoot, "scripts", "public-install.mjs");
  if (!existsSync(installerScript)) {
    throw new Error(`Cannot find installer script at ${installerScript}. Rerun install.sh manually to refresh this install.`);
  }

  const memoryRoot = path.resolve(expandHome(manifest.memoryRoot ?? path.join(installRoot, "memory"), home));
  const scope = normalizeScope(manifest.scope);
  const integrationMode = normalizeIntegrationMode(manifest.integrationMode);
  const source = stringArg(args, "source", manifest.source ?? process.env.JUMPYBRAIN_INSTALL_SOURCE ?? DEFAULT_REPO);
  const ref = stringArg(args, "ref", manifest.ref ?? DEFAULT_REF).trim();
  const dryRun = Boolean(args["dry-run"]);
  const installerArgs = [
    "--install-root", installRoot,
    "--memory-root", memoryRoot,
    "--scope", scope,
    "--integrations", integrationMode,
    "--source", source,
  ];
  if (ref) installerArgs.push("--ref", ref);
  if (manifest.installerOptions?.skipBuild) installerArgs.push("--skip-build");
  if (manifest.installerOptions?.skipQmdInstall) installerArgs.push("--skip-qmd-install");
  if (manifest.installerOptions?.skipInitialIndex) installerArgs.push("--skip-initial-index");

  return {
    appRoot,
    installerScript,
    manifestPath,
    installRoot,
    memoryRoot,
    source,
    ref: ref || undefined,
    scope,
    integrationMode,
    dryRun,
    installerArgs,
  };
}

function printUpdatePlan(plan: InstallerUpdatePlan): void {
  console.log("jumpyBrain update dry run.");
  console.log(`Manifest: ${plan.manifestPath}`);
  console.log(`Install root: ${plan.installRoot}`);
  console.log(`Memory root: ${plan.memoryRoot}`);
  console.log(`Scope: ${plan.scope}`);
  console.log(`Integrations: ${plan.integrationMode}`);
  console.log(`Source: ${plan.source}${plan.ref ? ` (${plan.ref})` : ""}`);
  console.log(`Installer: ${plan.installerScript}`);
  console.log(`Command: ${process.execPath} ${[plan.installerScript, ...plan.installerArgs].map(shellQuote).join(" ")}`);
}

function currentAppRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function normalizeScope(value: unknown): string {
  return value === "project" ? "project" : "global";
}

function normalizeIntegrationMode(value: unknown): string {
  return value === "all" || value === "none" ? value : "auto";
}

function expandHome(value: string, home: string): string {
  return value === "~" || value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
