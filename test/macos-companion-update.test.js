import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, realpath, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { companionUpdatePlan } from "../scripts/macos-companion.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = spawnSync("python3", ["--version"]);
const nativeTest = { skip: process.platform !== "darwin" || python.status !== 0 };

function run(command, args, env) {
  const result = spawnSync(command, args, { encoding: "utf8", env: { ...process.env, ...env }, cwd: repo });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

test("companion installer is optional outside macOS", () => {
  assert.equal(companionUpdatePlan({ home: "/absent", installRoot: "/absent/install", platform: "linux" }), null);
});

test("Python companion transaction regression suite", { skip: process.platform === "win32" || python.status !== 0 }, () => {
  run("python3", ["-B", "integrations/macos-companion/test_update.py"], { PYTHONDONTWRITEBYTECODE: "1" });
});

async function fixture(customRoot = false) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpybrain-unified-update-")));
  const home = path.join(temp, "home");
  const root = customRoot ? path.join(temp, "custom install") : path.join(home, ".jumpybrain");
  const source = path.join(temp, "source");
  await mkdir(source);
  for (const entry of ["dist", "scripts", "integrations", "package.json"]) {
    await cp(path.join(repo, entry), path.join(source, entry), {
      recursive: true, filter: (p) => !p.split(path.sep).some((part) => [".build", "__pycache__"].includes(part)),
    });
  }
  const tools = path.join(temp, "tools");
  await mkdir(tools);
  // Exercise the actual installer and Python transaction, mocking ONLY native
  // compilation/signing. No launchd, Chrome, real app, or real memory is touched.
  await writeFile(path.join(tools, "swiftc"), '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\nprintf "new native executable\\n" > "$2"\n', { mode: 0o755 });
  await writeFile(path.join(tools, "xcrun"), `#!/bin/sh\nif [ "$1" = "--find" ]; then printf '%s\\n' '${tools}/swiftc'; else printf '/fixture/sdk\\n'; fi\n`, { mode: 0o755 });
  await writeFile(path.join(tools, "codesign"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const env = { HOME: home, PATH: `${tools}:${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: "1" };
  const installer = path.join(repo, "scripts/public-install.mjs");
  const args = ["--home", home, "--install-root", root, "--source", source, "--skip-build", "--skip-qmd-install", "--skip-initial-index", "--integrations", "none"];
  run(process.execPath, [installer, ...args], env);
  const memory = path.join(temp, "custom-memory");
  const support = path.join(temp, "custom-support");
  const app = path.join(home, "Applications/jumpyBrain.app");
  await mkdir(memory);
  await writeFile(path.join(memory, "keep.md"), "# Unchanged canonical fixture\n");
  await mkdir(support);
  await writeFile(path.join(support, "api-key"), `${"a".repeat(64)}\n`);
  await writeFile(path.join(support, "companion.lock"), "");
  await mkdir(path.join(app, "Contents/Resources"), { recursive: true });
  await mkdir(path.join(app, "Contents/MacOS"));
  await writeFile(path.join(app, "Contents/MacOS/jumpyBrain"), "old native executable\n");
  await writeFile(path.join(app, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.jumpybrain.companion</string><key>CFBundleExecutable</key><string>jumpyBrain</string></dict></plist>`);
  const config = {
    node: process.execPath, qmd: "/usr/bin/true", runtimeRoot: path.join(root, "app"),
    memoryRoot: memory, supportDirectory: support,
    launchAgent: path.join(home, "Library/LaunchAgents/local.jumpybrain.companion.plist"),
    label: "local.jumpybrain.companion", port: 4891, revision: "old",
  };
  const configPath = path.join(app, "Contents/Resources/Configuration.json");
  await writeFile(configPath, JSON.stringify(config));
  const cli = path.join(root, "bin/jumpybrain");
  return { temp, home, root, source, tools, env, installer, args, memory, support, app, config, configPath, cli };
}

test("CLI update detects its custom install, previews, updates the companion from fetched source and preserves data/settings", nativeTest, async () => {
  const f = await fixture(true);
  try {
    const originalConfig = await readFile(f.configPath, "utf8");
    const manifestBefore = await readFile(path.join(f.root, "install-manifest.json"), "utf8");
    const before = await readFile(path.join(f.root, "app/dist/cli.js"), "utf8");
    const preview = run(f.cli, ["update", "--dry-run"], f.env);
    assert.match(preview.stdout, /installed macOS companion/);
    assert.match(preview.stdout, /No automatic restart/);
    assert.equal(await readFile(f.configPath, "utf8"), originalConfig);
    assert.equal(await readFile(path.join(f.root, "install-manifest.json"), "utf8"), manifestBefore);
    await writeFile(path.join(f.source, "dist/cli.js"), `${before}\n// fetched new runtime\n`);
    const updated = run(f.cli, ["update"], f.env);
    assert.match(updated.stdout, /Updated runtime and companion/);
    assert.match(updated.stdout, /Nothing was started/);
    assert.match(await readFile(path.join(f.root, "app/dist/cli.js"), "utf8"), /fetched new runtime/);
    assert.equal(await readFile(path.join(f.app, "Contents/MacOS/jumpyBrain"), "utf8"), "new native executable\n");
    assert.equal(existsSync(path.join(f.app, "Contents/Resources/runtime")), false);
    assert.deepEqual(JSON.parse(await readFile(f.configPath, "utf8")), { ...f.config, revision: "0.1.0" });
    assert.equal(await readFile(path.join(f.memory, "keep.md"), "utf8"), "# Unchanged canonical fixture\n");
    assert.equal(await readFile(path.join(f.support, "api-key"), "utf8"), `${"a".repeat(64)}\n`);
    assert.equal(existsSync(f.config.launchAgent), false, "disabled login stays disabled");
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("legacy snapshot migration works even when old managed CLI predates companion sources", nativeTest, async () => {
  const f = await fixture();
  try {
    delete f.config.runtimeRoot;
    await writeFile(f.configPath, JSON.stringify(f.config));
    const snapshot = path.join(f.app, "Contents/Resources/runtime");
    await mkdir(path.join(snapshot, "dist"), { recursive: true });
    await writeFile(path.join(snapshot, "dist/cli.js"), "// old snapshot\n");
    await writeFile(path.join(snapshot, "package.json"), '{"name":"jumpybrain"}');
    await rm(path.join(f.root, "app/integrations/macos-companion"), { recursive: true });
    run(process.execPath, [f.installer, ...f.args], f.env);
    assert.equal(JSON.parse(await readFile(f.configPath, "utf8")).runtimeRoot, path.join(f.root, "app"));
    assert.equal(existsSync(snapshot), false);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("native build failure leaves CLI, companion and manifest untouched", nativeTest, async () => {
  const f = await fixture();
  try {
    const manifest = await readFile(path.join(f.root, "install-manifest.json"), "utf8");
    const config = await readFile(f.configPath, "utf8");
    await writeFile(path.join(f.root, "app/old-marker"), "old\n");
    await writeFile(path.join(f.tools, "swiftc"), "#!/bin/sh\nexit 42\n", { mode: 0o755 });
    const result = spawnSync(f.cli, ["update"], { encoding: "utf8", env: { ...process.env, ...f.env } });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(path.join(f.root, "app/old-marker"), "utf8"), "old\n");
    assert.equal(await readFile(f.configPath, "utf8"), config);
    assert.equal(await readFile(path.join(f.root, "install-manifest.json"), "utf8"), manifest);
    assert.equal(existsSync(path.join(f.root, "app.installing")), false);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});


test("running companion blocks update before staging; dry-run remains available", nativeTest, async () => {
  const f = await fixture();
  try {
    const manifest = await readFile(path.join(f.root, "install-manifest.json"), "utf8");
    const result = run("python3", ["-c", `
import fcntl, subprocess, sys
with open(sys.argv[1]) as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    preview = subprocess.run([sys.argv[2], "update", "--dry-run"], capture_output=True, text=True)
    assert preview.returncode == 0, preview.stderr
    updated = subprocess.run([sys.argv[2], "update"], capture_output=True, text=True)
    assert updated.returncode != 0
    assert "Saved" in updated.stderr and "Quit jumpyBrain" in updated.stderr, updated.stderr
    print(updated.stderr)
`, path.join(f.support, "companion.lock"), f.cli], f.env);
    assert.match(result.stdout, /Quit jumpyBrain/);
    assert.equal(await readFile(path.join(f.root, "install-manifest.json"), "utf8"), manifest);
    assert.equal(existsSync(path.join(f.root, "app.installing")), false);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("another runtime is not adopted and a shared runtime cannot be uninstalled underneath its companion", nativeTest, async () => {
  const f = await fixture();
  try {
    const uninstall = spawnSync(process.execPath, [path.join(repo, "scripts/public-uninstall.mjs"), "--home", f.home, "--install-root", f.root], {
      encoding: "utf8", env: { ...process.env, ...f.env },
    });
    assert.notEqual(uninstall.status, 0);
    assert.match(uninstall.stderr, /companion depends on this installed runtime/);
    assert.equal(existsSync(path.join(f.root, "app/dist/cli.js")), true);
    f.config.runtimeRoot = path.join(f.temp, "other/app");
    await writeFile(f.configPath, JSON.stringify(f.config));
    const before = await readFile(f.configPath, "utf8");
    const updated = run(f.cli, ["update"], f.env);
    assert.match(updated.stdout, /Updating app and CLI only/);
    assert.equal(await readFile(f.configPath, "utf8"), before);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("concurrent updater cannot remove the first invocation's stage", nativeTest, async () => {
  const f = await fixture();
  try {
    const started = path.join(f.temp, "compiling");
    const release = path.join(f.temp, "release");
    await writeFile(path.join(f.tools, "swiftc"), `#!/bin/sh\ntouch '${started}'\nwhile [ ! -f '${release}' ]; do sleep 0.1; done\nwhile [ "$1" != "-o" ]; do shift; done\nprintf 'new native executable\\n' > "$2"\n`, { mode: 0o755 });
    run("python3", ["-c", `
import pathlib, subprocess, sys, time
cli, started, release = sys.argv[1:]
first = subprocess.Popen([cli, "update"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    deadline = time.monotonic() + 20
    while not pathlib.Path(started).exists():
        assert first.poll() is None, first.communicate()
        assert time.monotonic() < deadline, "native build did not start"
        time.sleep(.05)
    second = subprocess.run([cli, "update"], capture_output=True, text=True)
    assert second.returncode != 0 and "Another installer/update is active" in second.stderr, second.stderr
    pathlib.Path(release).touch()
    out, err = first.communicate(timeout=20)
    assert first.returncode == 0, (out, err)
finally:
    pathlib.Path(release).touch()
    if first.poll() is None:
        first.terminate()
        first.communicate(timeout=10)
`, f.cli, started, release], f.env);
    assert.equal(existsSync(path.join(f.root, ".installer-lock")), false);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("legacy scratch names are never deleted when they contain preserved companion data", nativeTest, async () => {
  const f = await fixture();
  try {
    const memory = path.join(f.root, "app.installing");
    const support = path.join(f.root, "app.previous");
    await rename(f.memory, memory);
    await rename(f.support, support);
    await writeFile(f.configPath, JSON.stringify({ ...f.config, memoryRoot: memory, supportDirectory: support }));
    run(f.cli, ["update"], f.env);
    assert.equal(await readFile(path.join(memory, "keep.md"), "utf8"), "# Unchanged canonical fixture\n");
    assert.equal(await readFile(path.join(support, "api-key"), "utf8"), `${"a".repeat(64)}\n`);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test("downloaded public installer includes its companion preflight dependencies", { skip: process.platform === "win32" }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-bootstrap-test-"));
  try {
    const tools = path.join(temp, "tools");
    await mkdir(tools);
    await writeFile(path.join(tools, "curl"), '#!/bin/sh\nFILE=${2#https://fixture.example/}\ncp "$FIXTURE_REPO/$FILE" "$4"\n', { mode: 0o755 });
    const result = spawnSync("sh", [path.join(repo, "install.sh"), "--help"], {
      cwd: temp, encoding: "utf8",
      env: { ...process.env, PATH: `${tools}:${process.env.PATH}`, JUMPYBRAIN_RAW_BASE: "https://fixture.example", FIXTURE_REPO: repo },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: install.sh/);
    // Pinning an older runtime must not fetch missing bootstrap dependencies
    // from that older ref. The bootstrap stays on master unless explicitly set.
    const shell = await readFile(path.join(repo, "install.sh"), "utf8");
    assert.match(shell, /INSTALLER_REF="\$\{JUMPYBRAIN_INSTALLER_REF:-master\}"/);
    assert.match(shell, /jumpyBrain\/\$\{INSTALLER_REF\}/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
