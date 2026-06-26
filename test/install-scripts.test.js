import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveQmdBinary } from "../dist/qmd/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const installScript = path.join(repoRoot, "scripts", "public-install.mjs");
const uninstallScript = path.join(repoRoot, "scripts", "public-uninstall.mjs");
const cliPath = path.join(repoRoot, "dist", "cli.js");

function runNode(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  assert.equal(result.status, 0, `${path.basename(script)} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

test("public installer installs global memory and detected integrations without npm publish", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-install-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  try {
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await mkdir(path.join(home, ".claude"), { recursive: true });
    await mkdir(path.join(home, ".pi"), { recursive: true });

    const result = runNode(installScript, [
      "--scope", "global",
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--skip-build",
      "--skip-qmd-install",
    ], { env: { HOME: home, JUMPYBRAIN_TEST_AVAILABLE_HARNESSES: "codex,claude,pi" } });

    assert.match(result.stdout, /jumpyBrain install complete/);
    assert.equal(existsSync(path.join(installRoot, "bin", "jumpybrain")), true);
    assert.equal(existsSync(path.join(installRoot, "memory", "jumpybrain.json")), true);

    const codexSkill = path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md");
    const claudeSkill = path.join(home, ".claude", "skills", "jumpybrain-memory", "SKILL.md");
    const piExtension = path.join(home, ".pi", "agent", "extensions", "jumpybrain-memory.ts");
    assert.equal(existsSync(codexSkill), true);
    assert.equal(existsSync(claudeSkill), true);
    assert.equal(existsSync(piExtension), true);

    const skillText = await readFile(codexSkill, "utf8");
    assert.doesNotMatch(skillText, /__JUMPYBRAIN_/);
    assert.match(skillText, new RegExp(escapeRegExp(path.join(installRoot, "memory"))));
    assert.match(await readFile(piExtension, "utf8"), /"remember"/);

    const manifest = JSON.parse(await readFile(path.join(installRoot, "install-manifest.json"), "utf8"));
    assert.equal(manifest.memoryRoot, path.join(installRoot, "memory"));
    assert.equal(manifest.integrations.length, 3);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public installer supports project scope without touching global skill locations", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-project-install-"));
  const home = path.join(temp, "home");
  const project = path.join(temp, "project");
  const installRoot = path.join(temp, "install");
  try {
    await mkdir(project, { recursive: true });
    runNode(installScript, [
      "--scope", "project",
      "--install-root", installRoot,
      "--home", home,
      "--cwd", project,
      "--source", repoRoot,
      "--integrations", "all",
      "--skip-build",
      "--skip-qmd-install",
    ], { cwd: project, env: { HOME: home } });

    assert.equal(existsSync(path.join(project, "memory", "jumpybrain.json")), true);
    assert.equal(existsSync(path.join(project, ".agents", "skills", "jumpybrain-memory", "SKILL.md")), true);
    assert.equal(existsSync(path.join(project, ".claude", "skills", "jumpybrain-memory", "SKILL.md")), true);
    assert.equal(existsSync(path.join(project, ".pi", "extensions", "jumpybrain-memory.ts")), true);
    assert.equal(existsSync(path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md")), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public installer can rerun idempotently over existing memory and integrations", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-idempotent-install-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  try {
    const args = [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--integrations", "all",
      "--skip-build",
      "--skip-qmd-install",
    ];
    runNode(installScript, args, { env: { HOME: home } });
    const configPath = path.join(installRoot, "memory", "jumpybrain.json");
    const firstConfig = await readFile(configPath, "utf8");
    runNode(installScript, args, { env: { HOME: home } });
    assert.equal(await readFile(configPath, "utf8"), firstConfig);
    assert.equal(existsSync(path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md")), true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public uninstall preserves memory by default and can delete it explicitly", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-uninstall-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  try {
    runNode(installScript, [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--integrations", "all",
      "--skip-build",
      "--skip-qmd-install",
    ], { env: { HOME: home } });

    runNode(uninstallScript, ["--install-root", installRoot, "--home", home], { env: { HOME: home } });
    assert.equal(existsSync(path.join(installRoot, "bin", "jumpybrain")), false);
    assert.equal(existsSync(path.join(installRoot, "app")), false);
    assert.equal(existsSync(path.join(installRoot, "memory", "jumpybrain.json")), true);

    await writeFile(path.join(installRoot, "install-manifest.json"), JSON.stringify({
      installer: "jumpybrain-installer",
      installRoot,
      appDir: path.join(installRoot, "app"),
      binDir: path.join(installRoot, "bin"),
      memoryRoot: path.join(installRoot, "memory"),
      files: [],
    }, null, 2));
    runNode(uninstallScript, ["--install-root", installRoot, "--home", home, "--delete-memory"], { env: { HOME: home } });
    assert.equal(existsSync(path.join(installRoot, "memory")), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("QMD binary resolution supports installer override before PATH fallback", () => {
  assert.equal(resolveQmdBinary({ JUMPYBRAIN_QMD_BIN: "/tmp/qmd-custom" }), "/tmp/qmd-custom");
  assert.equal(resolveQmdBinary({}), "qmd");
});

test("CLI doctor reports machine-readable installer diagnostics", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-doctor-"));
  try {
    const memoryRoot = path.join(temp, "memory");
    const init = spawnSync(process.execPath, [cliPath, "init", "--root", memoryRoot], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const result = spawnSync(process.execPath, [cliPath, "doctor", "--root", memoryRoot, "--json"], {
      encoding: "utf8",
      env: { ...process.env, HOME: temp, JUMPYBRAIN_QMD_BIN: process.execPath },
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.cli.ok, true);
    assert.equal(payload.node.ok, true);
    assert.equal(payload.qmd.ok, true);
    assert.equal(payload.memoryRoot.ok, true);
    assert.equal(payload.memoryRoot.root, await realpath(memoryRoot));
    assert.equal(payload.integrations.codex.ok, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
