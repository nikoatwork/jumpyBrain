import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveQmdBinary } from "../dist/adapters/qmd/qmd-cli.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const installScript = path.join(repoRoot, "scripts", "public-install.mjs");
const uninstallScript = path.join(repoRoot, "scripts", "public-uninstall.mjs");
const cliPath = path.join(repoRoot, "dist", "cli.js");

test("public install docs and shell wrappers use the canonical master branch", async () => {
  const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");
  const [readme, installDocs, installShell, uninstallShell] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/install.md"),
    readRepoFile("install.sh"),
    readRepoFile("uninstall.sh"),
  ]);

  assert.doesNotMatch(`${readme}\n${installDocs}`, /raw\.githubusercontent\.com\/nikoatwork\/jumpyBrain\/main\//);
  assert.match(readme, /raw\.githubusercontent\.com\/nikoatwork\/jumpyBrain\/master\/install\.sh/);
  assert.match(installDocs, /raw\.githubusercontent\.com\/nikoatwork\/jumpyBrain\/master\/install\.sh/);
  assert.match(installDocs, /raw\.githubusercontent\.com\/nikoatwork\/jumpyBrain\/master\/uninstall\.sh/);
  assert.match(installShell, /JUMPYBRAIN_INSTALL_REF:-master/);
  assert.match(uninstallShell, /JUMPYBRAIN_INSTALL_REF:-master/);
  assert.doesNotMatch(`${installShell}\n${uninstallShell}`, /JUMPYBRAIN_INSTALL_REF:-main/);
});

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
    assert.equal(manifest.source, repoRoot);
    assert.equal(manifest.ref, null);
    assert.equal(manifest.integrationMode, "auto");
    assert.equal(manifest.installedVersion, "0.1.0");
    assert.equal(manifest.integrations.length, 3);
    assert.equal(manifest.cliConfigPath, path.join(installRoot, "cli-config.json"));
    assert.equal(existsSync(manifest.cliConfigPath), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public installer manages reversible per-target read-only policy and custom shim override", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-policy-install-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "custom install");
  const configPath = path.join(installRoot, "cli-config.json");
  const manifestPath = path.join(installRoot, "install-manifest.json");
  const installedCli = path.join(installRoot, "bin", "jumpybrain");
  const baseArgs = [
    "--install-root", installRoot,
    "--home", home,
    "--source", repoRoot,
    "--integrations", "none",
    "--skip-build",
    "--skip-qmd-install",
    "--skip-initial-index",
  ];
  try {
    const first = runNode(installScript, [
      ...baseArgs,
      "--read-only-target", "HTTPS://MEMORY.EXAMPLE:443/path?alias=one",
      "--read-only-target", "http://127.0.0.1:4545/",
    ], { env: { HOME: home } });
    assert.match(first.stdout, /CLI remote-access policy: read-only/);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
      schemaVersion: 1,
      remoteTargets: [
        { origin: "http://127.0.0.1:4545", access: "read-only" },
        { origin: "https://memory.example", access: "read-only" },
      ],
    });
    const manifestText = await readFile(manifestPath, "utf8");
    assert.equal(JSON.parse(manifestText).cliConfigPath, configPath);
    assert.doesNotMatch(manifestText, /memory\.example|127\.0\.0\.1:4545/);
    const shim = await readFile(installedCli, "utf8");
    assert.match(shim, /JUMPYBRAIN_CLI_CONFIG\+x/);
    assert.match(shim, new RegExp(escapeRegExp(configPath)));

    const firstConfig = await readFile(configPath, "utf8");
    const rerun = runNode(installScript, baseArgs, { env: { HOME: home } });
    assert.match(rerun.stdout, /CLI remote-access policy: preserved/);
    assert.equal(await readFile(configPath, "utf8"), firstConfig);

    const explicitOverride = path.join(temp, "override.json");
    await writeFile(explicitOverride, JSON.stringify({ schemaVersion: 1, remoteTargets: [] }), "utf8");
    const overridden = spawnSync(installedCli, ["status", "--target-url", "https://memory.example"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, JUMPYBRAIN_CLI_CONFIG: explicitOverride, JUMPYBRAIN_API_KEY: "" },
    });
    assert.notEqual(overridden.status, 0);
    assert.match(overridden.stderr, /JUMPYBRAIN_API_KEY is required/);
    assert.doesNotMatch(overridden.stderr, /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/);

    runNode(installScript, [...baseArgs, "--allow-write-target", "https://memory.example/another-path"], { env: { HOME: home } });
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).remoteTargets, [
      { origin: "http://127.0.0.1:4545", access: "read-only" },
    ]);

    const beforeConflict = await readFile(configPath, "utf8");
    const conflict = spawnSync(process.execPath, [installScript,
      ...baseArgs,
      "--read-only-target", "http://127.0.0.1:4545/path",
      "--allow-write-target", "HTTP://127.0.0.1:4545/",
    ], { encoding: "utf8", env: { ...process.env, HOME: home } });
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /appears in both/);
    assert.equal(await readFile(configPath, "utf8"), beforeConflict);

    runNode(installScript, [...baseArgs, "--allow-write-target", "http://127.0.0.1:4545"], { env: { HOME: home } });
    assert.equal(existsSync(configPath), false, "removing the final policy should not persist a redundant writable config");

    const dryRoot = path.join(temp, "dry-install");
    const dry = runNode(installScript, [
      "--install-root", dryRoot,
      "--home", home,
      "--source", repoRoot,
      "--dry-run",
      "--skip-qmd-install",
      "--read-only-target", "https://dry.example",
    ], { env: { HOME: home } });
    assert.match(dry.stdout, /CLI remote-access policy: read-only https:\/\/dry\.example/);
    assert.equal(existsSync(path.join(dryRoot, "cli-config.json")), false);

    runNode(installScript, [...baseArgs, "--read-only-target", "https://cleanup.example"], { env: { HOME: home } });
    assert.equal(existsSync(configPath), true);
    const uninstall = runNode(uninstallScript, ["--install-root", installRoot, "--home", home], { env: { HOME: home } });
    assert.match(uninstall.stdout, new RegExp(escapeRegExp(configPath)));
    assert.equal(existsSync(configPath), false);
    assert.equal(existsSync(path.join(installRoot, "memory", "jumpybrain.json")), true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("installer refuses to modify malformed existing CLI policy", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-malformed-policy-install-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  const configPath = path.join(installRoot, "cli-config.json");
  const args = [
    "--install-root", installRoot, "--home", home, "--source", repoRoot, "--integrations", "none",
    "--skip-build", "--skip-qmd-install", "--skip-initial-index",
  ];
  try {
    runNode(installScript, [...args, "--read-only-target", "https://memory.example"], { env: { HOME: home } });
    await writeFile(configPath, "{ malformed\n", "utf8");
    const result = spawnSync(process.execPath, [installScript, ...args, "--allow-write-target", "https://memory.example"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cannot safely update CLI policy/);
    assert.equal(await readFile(configPath, "utf8"), "{ malformed\n");
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

test("public installer rerun updates only app and CLI while preserving memory, settings, and integrations", async () => {
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
      "--skip-initial-index",
    ];
    runNode(installScript, args, { env: { HOME: home } });
    const configPath = path.join(installRoot, "memory", "jumpybrain.json");
    const memoryPath = path.join(installRoot, "memory", "notes", "keep.md");
    const codexSkill = path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md");
    const manifestPath = path.join(installRoot, "install-manifest.json");
    const firstConfig = await readFile(configPath, "utf8");
    const firstManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(memoryPath, "# Preserve me\n", "utf8");
    await writeFile(codexSkill, "# User-customized integration\n", "utf8");

    const result = runNode(installScript, args, { env: { HOME: home } });

    assert.match(result.stdout, /Existing managed installation detected/);
    assert.match(result.stdout, /Updating app and CLI only/);
    assert.match(result.stdout, /jumpyBrain update complete/);
    assert.doesNotMatch(result.stdout, /Initializing memory root/);
    assert.doesNotMatch(result.stdout, /Building initial memory index/);
    assert.equal(await readFile(configPath, "utf8"), firstConfig);
    assert.equal(await readFile(memoryPath, "utf8"), "# Preserve me\n");
    assert.equal(await readFile(codexSkill, "utf8"), "# User-customized integration\n");

    const updatedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(updatedManifest.createdAt, firstManifest.createdAt);
    assert.deepEqual(updatedManifest.integrations, firstManifest.integrations);
    assert.deepEqual(updatedManifest.installerOptions, firstManifest.installerOptions);

    const differentMemoryRoot = path.join(temp, "different-memory");
    const settingsChange = spawnSync(process.execPath, [installScript,
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--memory-root", differentMemoryRoot,
      "--skip-build",
    ], { encoding: "utf8", env: { ...process.env, HOME: home } });
    assert.notEqual(settingsChange.status, 0);
    assert.match(settingsChange.stderr, /Refusing to change it during an app\/CLI-only update/);
    assert.equal(existsSync(differentMemoryRoot), false);
    assert.equal(await readFile(configPath, "utf8"), firstConfig);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("copy-paste installer rerun preserves a recorded non-default ref", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-ref-rerun-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  const manifestPath = path.join(installRoot, "install-manifest.json");
  try {
    runNode(installScript, [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--ref", "pinned-release",
      "--integrations", "none",
      "--skip-build",
      "--skip-qmd-install",
      "--skip-initial-index",
    ], { env: { HOME: home } });

    const env = { ...process.env, HOME: home };
    delete env.JUMPYBRAIN_INSTALL_REF;
    const result = spawnSync("sh", [path.join(repoRoot, "install.sh"),
      "--install-root", installRoot,
      "--home", home,
      "--skip-build",
    ], { cwd: repoRoot, encoding: "utf8", env });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).ref, "pinned-release");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("remote installer refs check out the fetched commit instead of assuming a local branch", async () => {
  const source = await readFile(installScript, "utf8");
  assert.match(source, /git", \["checkout", "--detach", "FETCH_HEAD"\]/);
  assert.match(source, /if \(fetch\.status === 0\)/);
});

test("public installer refuses unmanaged or corrupt existing installation layouts", async (t) => {
  await t.test("missing manifest", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-unmanaged-install-"));
    const installRoot = path.join(temp, "install");
    const marker = path.join(installRoot, "app", "keep.txt");
    try {
      await mkdir(path.dirname(marker), { recursive: true });
      await writeFile(marker, "do not overwrite\n", "utf8");
      const result = spawnSync(process.execPath, [installScript,
        "--install-root", installRoot,
        "--source", repoRoot,
        "--skip-build",
        "--skip-qmd-install",
      ], { encoding: "utf8", env: { ...process.env, HOME: temp } });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /no valid install-manifest\.json owns it/);
      assert.match(result.stderr, /Refusing to overwrite app or CLI files/);
      assert.equal(await readFile(marker, "utf8"), "do not overwrite\n");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  await t.test("corrupt manifest", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-corrupt-install-"));
    const installRoot = path.join(temp, "install");
    const marker = path.join(installRoot, "app", "keep.txt");
    try {
      await mkdir(path.dirname(marker), { recursive: true });
      await writeFile(marker, "do not overwrite\n", "utf8");
      await writeFile(path.join(installRoot, "install-manifest.json"), "not json\n", "utf8");
      const result = spawnSync(process.execPath, [installScript,
        "--install-root", installRoot,
        "--source", repoRoot,
        "--skip-build",
        "--skip-qmd-install",
      ], { encoding: "utf8", env: { ...process.env, HOME: temp } });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /is not valid JSON/);
      assert.match(result.stderr, /Refusing to overwrite it/);
      assert.equal(await readFile(marker, "utf8"), "do not overwrite\n");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  await t.test("marker-only manifest", () => assertManagedManifestRefused(
    () => ({ installer: "jumpybrain-installer" }),
    /manifest version undefined is unsupported/,
  ));

  await t.test("unsupported manifest version", () => assertManagedManifestRefused(
    ({ installRoot, appDir, binDir, cliPath }) => ({
      version: 2,
      installer: "jumpybrain-installer",
      installRoot,
      appDir,
      binDir,
      cliPath,
      scope: "global",
      integrationMode: "none",
    }),
    /manifest version 2 is unsupported/,
  ));

  await t.test("malformed ownership path", () => assertManagedManifestRefused(
    ({ installRoot, appDir, binDir, cliPath }) => ({
      version: 1,
      installer: "jumpybrain-installer",
      installRoot,
      appDir: { path: appDir },
      binDir,
      cliPath,
      scope: "global",
      integrationMode: "none",
    }),
    /manifest appDir must be a non-empty path/,
  ));
});

async function assertManagedManifestRefused(createManifest, expectedError) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-invalid-manifest-"));
  const installRoot = path.join(temp, "install");
  const appDir = path.join(installRoot, "app");
  const binDir = path.join(installRoot, "bin");
  const cliPath = path.join(binDir, "jumpybrain");
  const marker = path.join(appDir, "keep.txt");
  try {
    await mkdir(appDir, { recursive: true });
    await writeFile(marker, "do not overwrite\n", "utf8");
    await writeFile(path.join(installRoot, "install-manifest.json"), JSON.stringify(
      createManifest({ installRoot, appDir, binDir, cliPath }),
      null,
      2,
    ));

    const result = spawnSync(process.execPath, [installScript,
      "--install-root", installRoot,
      "--source", repoRoot,
      "--skip-build",
      "--skip-qmd-install",
    ], { encoding: "utf8", env: { ...process.env, HOME: temp } });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
    assert.equal(await readFile(marker, "utf8"), "do not overwrite\n");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test("failed app update leaves the existing CLI installation intact", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-failed-update-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  const badSource = path.join(temp, "bad-source");
  try {
    runNode(installScript, [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--integrations", "none",
      "--skip-build",
      "--skip-qmd-install",
      "--skip-initial-index",
    ], { env: { HOME: home } });

    const appMarker = path.join(installRoot, "app", "existing-app.txt");
    const cliPath = path.join(installRoot, "bin", "jumpybrain");
    const configPath = path.join(installRoot, "memory", "jumpybrain.json");
    const firstConfig = await readFile(configPath, "utf8");
    await writeFile(appMarker, "working install\n", "utf8");
    await mkdir(badSource, { recursive: true });

    const result = spawnSync(process.execPath, [installScript,
      "--install-root", installRoot,
      "--home", home,
      "--source", badSource,
      "--skip-build",
    ], { encoding: "utf8", env: { ...process.env, HOME: home } });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dist\/cli\.js is missing/);
    assert.equal(await readFile(appMarker, "utf8"), "working install\n");
    assert.equal(existsSync(cliPath), true);
    assert.equal(await readFile(configPath, "utf8"), firstConfig);
    assert.equal(existsSync(`${path.join(installRoot, "app")}.installing`), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI update dry run uses installer manifest without mutating memory", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-update-"));
  const home = path.join(temp, "home");
  const installRoot = path.join(temp, "install");
  try {
    runNode(installScript, [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--integrations", "none",
      "--skip-build",
      "--skip-qmd-install",
      "--skip-initial-index",
    ], { env: { HOME: home } });

    const configPath = path.join(installRoot, "memory", "jumpybrain.json");
    const firstConfig = await readFile(configPath, "utf8");
    const installedCli = path.join(installRoot, "bin", "jumpybrain");
    const result = spawnSync(installedCli, ["update", "--dry-run", "--install-root", installRoot], {
      cwd: temp,
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /jumpyBrain update dry run/);
    assert.match(result.stdout, new RegExp(escapeRegExp(`Install root: ${installRoot}`)));
    assert.match(result.stdout, new RegExp(escapeRegExp(`Memory root: ${path.join(installRoot, "memory")}`)));
    assert.match(result.stdout, /--skip-build/);
    assert.equal(await readFile(configPath, "utf8"), firstConfig);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI update fails clearly without an installer manifest", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-update-missing-"));
  try {
    const result = spawnSync(process.execPath, [cliPath, "update", "--install-root", path.join(temp, "missing")], {
      encoding: "utf8",
      env: { ...process.env, HOME: temp },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No jumpyBrain installer manifest found/);
    assert.match(result.stderr, /rerun install\.sh/);
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
      version: 1,
      installer: "jumpybrain-installer",
      installRoot,
      appDir: path.join(installRoot, "app"),
      binDir: path.join(installRoot, "bin"),
      cliPath: path.join(installRoot, "bin", "jumpybrain"),
      cliConfigPath: path.join(installRoot, "cli-config.json"),
      memoryRoot: path.join(installRoot, "memory"),
      integrations: [],
      files: [path.join(installRoot, "bin", "jumpybrain")],
    }, null, 2));
    runNode(uninstallScript, ["--install-root", installRoot, "--home", home, "--delete-memory"], { env: { HOME: home } });
    assert.equal(existsSync(path.join(installRoot, "memory")), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public uninstaller fails closed on invalid ownership manifests", async (t) => {
  const cases = [
    ["missing manifest", undefined, /no .*install-manifest\.json exists to prove ownership/],
    ["corrupt manifest", "{ nope\n", /is not valid JSON/],
    ["unsupported manifest", { version: 2, installer: "jumpybrain-installer" }, /manifest version 2 is unsupported/],
  ];

  for (const [name, manifest, expected] of cases) {
    await t.test(name, async () => {
      const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-uninstall-invalid-"));
      const installRoot = path.join(temp, "install");
      const marker = path.join(installRoot, "app", "keep.txt");
      try {
        await mkdir(path.dirname(marker), { recursive: true });
        await writeFile(marker, "keep\n", "utf8");
        if (manifest !== undefined) {
          await writeFile(path.join(installRoot, "install-manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest), "utf8");
        }
        const result = spawnSync(process.execPath, [uninstallScript, "--install-root", installRoot, "--home", temp], {
          encoding: "utf8",
          env: { ...process.env, HOME: temp },
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
        assert.equal(await readFile(marker, "utf8"), "keep\n");
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    });
  }
});

test("public uninstaller validates every recorded removal path before mutation", async (t) => {
  async function fixture() {
    const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-uninstall-paths-"));
    const home = path.join(temp, "home");
    const installRoot = path.join(temp, "install");
    runNode(installScript, [
      "--install-root", installRoot,
      "--home", home,
      "--source", repoRoot,
      "--integrations", "none",
      "--skip-build",
      "--skip-qmd-install",
      "--skip-initial-index",
    ], { env: { HOME: home } });
    return { temp, home, installRoot, manifestPath: path.join(installRoot, "install-manifest.json") };
  }

  await t.test("selected root mismatch", async () => {
    const state = await fixture();
    const otherRoot = path.join(state.temp, "other");
    try {
      await mkdir(otherRoot, { recursive: true });
      await writeFile(path.join(otherRoot, "install-manifest.json"), await readFile(state.manifestPath, "utf8"), "utf8");
      const result = spawnSync(process.execPath, [uninstallScript, "--install-root", otherRoot, "--home", state.home], { encoding: "utf8", env: { ...process.env, HOME: state.home } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /manifest installRoot does not match/);
      assert.equal(existsSync(path.join(state.installRoot, "app")), true);
    } finally {
      await rm(state.temp, { recursive: true, force: true });
    }
  });

  await t.test("arbitrary manifest file", async () => {
    const state = await fixture();
    const victim = path.join(state.temp, "keep.txt");
    try {
      const manifest = JSON.parse(await readFile(state.manifestPath, "utf8"));
      await writeFile(victim, "keep\n", "utf8");
      manifest.files.push(victim);
      await writeFile(state.manifestPath, JSON.stringify(manifest), "utf8");
      const result = spawnSync(process.execPath, [uninstallScript, "--install-root", state.installRoot, "--home", state.home], { encoding: "utf8", env: { ...process.env, HOME: state.home } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /only the recorded CLI and integration paths/);
      assert.equal(await readFile(victim, "utf8"), "keep\n");
      assert.equal(existsSync(path.join(state.installRoot, "app")), true);
    } finally {
      await rm(state.temp, { recursive: true, force: true });
    }
  });

  await t.test("dry run preserves custom-root install and memory", async () => {
    const state = await fixture();
    try {
      const result = runNode(uninstallScript, ["--install-root", state.installRoot, "--home", state.home, "--dry-run"], { env: { HOME: state.home } });
      assert.match(result.stdout, /jumpyBrain uninstall complete/);
      assert.equal(existsSync(path.join(state.installRoot, "app")), true);
      assert.equal(existsSync(path.join(state.installRoot, "memory", "jumpybrain.json")), true);
      assert.equal(existsSync(state.manifestPath), true);
    } finally {
      await rm(state.temp, { recursive: true, force: true });
    }
  });

  await t.test("delete-memory rejects unmarked roots without removing the app", async () => {
    const state = await fixture();
    try {
      const manifest = JSON.parse(await readFile(state.manifestPath, "utf8"));
      const unsafeMemory = path.join(state.temp, "not-memory");
      await mkdir(unsafeMemory, { recursive: true });
      await writeFile(path.join(unsafeMemory, "keep.txt"), "keep\n", "utf8");
      manifest.memoryRoot = unsafeMemory;
      await writeFile(state.manifestPath, JSON.stringify(manifest), "utf8");
      const result = spawnSync(process.execPath, [uninstallScript, "--install-root", state.installRoot, "--home", state.home, "--delete-memory"], { encoding: "utf8", env: { ...process.env, HOME: state.home } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /no jumpybrain\.json found/);
      assert.equal(await readFile(path.join(unsafeMemory, "keep.txt"), "utf8"), "keep\n");
    } finally {
      await rm(state.temp, { recursive: true, force: true });
    }
  });
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
