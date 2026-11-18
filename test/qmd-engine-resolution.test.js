import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

// A consumer project with jumpyBrain installed as a dependency (copied, not linked)
// and a minimal stand-in for @tobilu/qmd. Doctor never loads the SDK, so empty
// SDK files are enough to exercise package identity and the version probe.
async function consumer(t, name = "consumer project") {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb engine ")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, name);
  const pkg = path.join(project, "node_modules", "jumpybrain");
  await mkdir(pkg, { recursive: true });
  await cp(path.join(repo, "dist"), path.join(pkg, "dist"), { recursive: true });
  await cp(path.join(repo, "package.json"), path.join(pkg, "package.json"));
  const root = path.join(temp, "memory");
  return { temp, project, pkg, root, cli: path.join(pkg, "dist", "cli.js") };
}

async function fakeQmd(modules, { version = "2.8.3", sdk = true } = {}) {
  const dir = path.join(modules, "@tobilu", "qmd");
  await mkdir(path.join(dir, "bin"), { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "@tobilu/qmd", version, bin: { qmd: "bin/qmd" } }));
  const bin = path.join(dir, "bin", "qmd");
  await writeFile(bin, `#!/usr/bin/env node\nconsole.log("qmd ${version}");\n`);
  await chmod(bin, 0o755);
  if (sdk) {
    await mkdir(path.join(dir, "dist"), { recursive: true });
    for (const file of ["index.js", "store.js", "llm.js"]) await writeFile(path.join(dir, "dist", file), "");
  }
  return bin;
}

function doctor(f, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JUMPYBRAIN_") && !key.startsWith("QMD_")));
  // PATH holds only Node, so an unrelated global qmd cannot satisfy the check.
  const result = spawnSync(process.execPath, [f.cli, "doctor", "--json", "--root", f.root], {
    cwd: f.temp, encoding: "utf8", env: { ...clean, HOME: f.temp, PATH: path.dirname(process.execPath), ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).qmd;
}

test("doctor finds QMD installed beside jumpyBrain in a consuming project with spaces in its path", async t => {
  const f = await consumer(t);
  const bin = await fakeQmd(path.join(f.project, "node_modules"));
  const qmd = doctor(f);
  assert.equal(qmd.ok, true, qmd.message);
  assert.equal(qmd.source, "package");
  assert.equal(qmd.binary, bin);
});

test("the nearest QMD package wins even when its version is unsupported", async t => {
  const f = await consumer(t);
  await fakeQmd(path.join(f.project, "node_modules"));
  const nested = await fakeQmd(path.join(f.pkg, "node_modules"), { version: "2.8.2" });
  const qmd = doctor(f);
  assert.equal(qmd.binary, nested);
  assert.equal(qmd.ok, false, "a wrong nearer version must not fall through to the sibling");
});

test("a QMD package without its SDK fails the check", async t => {
  const f = await consumer(t);
  await fakeQmd(path.join(f.project, "node_modules"), { sdk: false });
  assert.equal(doctor(f).ok, false);
});

test("an explicit override wins over an installed package and a bad override fails visibly", async t => {
  const f = await consumer(t);
  await fakeQmd(path.join(f.project, "node_modules"));
  const missing = path.join(f.temp, "missing engine", "qmd");
  const qmd = doctor(f, { JUMPYBRAIN_QMD_BIN: missing });
  assert.deepEqual([qmd.ok, qmd.source, qmd.binary], [false, "override", missing]);
});

test("without an override or package, PATH is used", async t => {
  const f = await consumer(t);
  const qmd = doctor(f);
  assert.deepEqual([qmd.ok, qmd.source, qmd.binary], [false, "path", "qmd"]);
  const bin = await fakeQmd(path.join(f.temp, "global", "lib", "node_modules"));
  const binDir = path.join(f.temp, "global", "bin");
  await mkdir(binDir, { recursive: true });
  await symlink(bin, path.join(binDir, "qmd"));
  const onPath = doctor(f, { PATH: `${binDir}${path.delimiter}${path.dirname(process.execPath)}` });
  assert.deepEqual([onPath.ok, onPath.source], [true, "path"]);
});

test("a linked jumpyBrain resolves QMD from its real location, never the linking project", async t => {
  const f = await consumer(t);
  const real = path.join(f.temp, "checkout");
  await cp(f.pkg, real, { recursive: true });
  await rm(f.pkg, { recursive: true });
  await symlink(real, f.pkg, "dir");
  await fakeQmd(path.join(f.project, "node_modules"));
  assert.equal(doctor(f).source, "path");
  const bin = await fakeQmd(path.join(real, "node_modules"));
  assert.deepEqual([doctor(f).source, doctor(f).binary], ["package", bin]);
  // Even with symlink preservation the lookup starts from the real location.
  await rm(path.join(real, "node_modules"), { recursive: true });
  const preserved = doctor(f, { NODE_OPTIONS: "--preserve-symlinks --preserve-symlinks-main" });
  assert.equal(preserved.source, "path");
});

test("a broken nearest QMD package stays selected instead of falling through to PATH", async t => {
  const f = await consumer(t);
  const bin = await fakeQmd(path.join(f.project, "node_modules"));
  await writeFile(path.join(path.dirname(bin), "..", "package.json"), "{broken");
  const qmd = doctor(f);
  assert.deepEqual([qmd.ok, qmd.source, qmd.binary], [false, "package", bin]);
});

test("remote commands never execute the local engine", async t => {
  const f = await consumer(t);
  const marker = path.join(f.temp, "engine-ran");
  const bin = path.join(f.temp, "qmd-marker");
  await writeFile(bin, `#!/bin/sh\ntouch '${marker}'\necho 'qmd 2.8.3'\n`);
  await chmod(bin, 0o755);
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JUMPYBRAIN_")));
  const result = spawnSync(process.execPath, [f.cli, "recall", "--target-url", "http://127.0.0.1:9", "--topic", "x"], {
    cwd: f.temp, encoding: "utf8", timeout: 30000,
    env: { ...clean, HOME: f.temp, JUMPYBRAIN_QMD_BIN: bin, JUMPYBRAIN_API_KEY: "test-key-0123456789" },
  });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(marker), false, await readFile(marker, "utf8").catch(() => ""));
});
