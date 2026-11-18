import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repo, "dist", "cli.js");

async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb project ")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const config = path.join(temp, "device", "cli-config.json");
  const run = (args, { cwd = temp, env = {}, bin = cli } = {}) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JUMPYBRAIN_")));
    return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...clean, HOME: temp, JUMPYBRAIN_CLI_CONFIG: config, ...env } });
  };
  const init = async (root, capture) => {
    const result = run(["init", "--root", root, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    if (capture !== undefined) {
      const file = path.join(root, "jumpybrain.json");
      await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, "utf8")), capture }));
    }
    return root;
  };
  const status = (cwd, env) => {
    const result = run(["status", "--json"], { cwd, env });
    // --json failures are one {error} object on stdout; keep both streams for messages.
    return { ...result, output: result.stdout + result.stderr, json: result.status === 0 ? JSON.parse(result.stdout) : undefined };
  };
  const project = (args, cwd) => {
    const result = run(["project", ...args, "--json"], { cwd });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { temp, config, run, init, status, project };
}

test("an unapproved project memory stops direct commands until the user approves it", async t => {
  const f = await fixture(t);
  const repoDir = path.join(f.temp, "my repo");
  const root = await init(f, path.join(repoDir, "memory"));
  const work = path.join(repoDir, "src", "deep");
  await mkdir(work, { recursive: true });

  const refused = f.status(work);
  assert.notEqual(refused.status, 0);
  assert.match(refused.output, /not approved on this device[\s\S]*jumpybrain project trust --root '.*my repo\/memory'/u);
  assert.equal(f.project(["status"], work).project.trusted, false);

  const trusted = f.project(["trust"], work);
  assert.equal(trusted.project.root, root);
  assert.equal(trusted.target.source, "trusted-project");
  const selected = f.status(work);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.json.target.source, "trusted-project");

  assert.equal(f.project(["untrust"], work).changed, "untrusted");
  assert.notEqual(f.status(work).status, 0);
});

test("explicit selections beat an approved project, and recipes keep legacy discovery", async t => {
  const f = await fixture(t);
  const root = await init(f, path.join(f.temp, "repo", "memory"));
  const other = await init(f, path.join(f.temp, "other brain"));
  const cwd = path.join(f.temp, "repo");
  const legacy = f.run(["run", "memory:status", "--json"], { cwd });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(JSON.parse(legacy.stdout).root ?? JSON.parse(legacy.stdout).status?.root, root);

  f.project(["trust", "--root", root]);
  assert.equal(f.status(cwd, { JUMPYBRAIN_MEMORY_ROOT: other }).json.target.source, "environment");
  const flagged = f.run(["status", "--root", other, "--json"], { cwd });
  assert.equal(JSON.parse(flagged.stdout).target.source, "flag");
});

test("the nearest project wins, so an approved outer project never covers an unapproved inner one", async t => {
  const f = await fixture(t);
  const outer = await init(f, path.join(f.temp, "outer", "memory"));
  await init(f, path.join(f.temp, "outer", "packages", "inner", "memory"));
  f.project(["trust", "--root", outer]);
  assert.equal(f.status(path.join(f.temp, "outer")).json.target.source, "trusted-project");
  const inner = f.status(path.join(f.temp, "outer", "packages", "inner"));
  assert.notEqual(inner.status, 0);
  assert.match(inner.output, /inner\/memory/u);
});

test("capture needs both the project's request and the device approval, and malformed policy is rejected", async t => {
  const f = await fixture(t);
  const durable = await init(f, path.join(f.temp, "durable", "memory"), "durable");
  const asking = await init(f, path.join(f.temp, "asking", "memory"));
  const broken = await init(f, path.join(f.temp, "broken", "memory"), "always");

  const inDurable = path.join(f.temp, "durable");
  assert.deepEqual(f.project(["trust"], inDurable).project.capture, { requested: "durable", approved: false, effective: "ask" });
  assert.deepEqual(f.project(["trust", "--allow-capture"], inDurable).project.capture, { requested: "durable", approved: true, effective: "durable" });
  assert.deepEqual(f.project(["trust", "--allow-capture"], path.join(f.temp, "asking")).project.capture, { requested: "ask", approved: true, effective: "ask" });
  // Capture applies only to the brain commands here select: an explicit environment root elsewhere wins.
  const elsewhere = JSON.parse(f.run(["project", "status", "--json"], { cwd: inDurable, env: { JUMPYBRAIN_MEMORY_ROOT: asking } }).stdout);
  assert.equal(elsewhere.target.root, asking);
  assert.equal(elsewhere.project.capture.effective, "ask");
  // From another directory the approval is reported but capture does not apply there.
  assert.equal(f.project(["trust", "--root", durable, "--allow-capture"]).project.capture.effective, "ask");
  // Trusting again without --allow-capture withdraws capture but keeps the project approved.
  assert.equal(f.project(["trust"], inDurable).project.capture.effective, "ask");

  const refused = f.run(["project", "trust", "--root", broken]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Invalid jumpybrain\.json capture/u);
  assert.match(f.project(["status"], path.join(f.temp, "broken")).project.capture.error, /Invalid/u);
});

test("collaborate follows project approval instead of discovering an unapproved project", async t => {
  const f = await fixture(t);
  await init(f, path.join(f.temp, "repo", "memory"));
  const result = f.run(["collaborate", "open", "--id", "mem_missing", "--json"], { cwd: path.join(f.temp, "repo") });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /not approved on this device/u);
  assert.equal(existsSync(path.join(f.temp, "repo", "memory", ".jumpybrain", "backend")), false, "no backend started for the unapproved project");
});

test("an unreadable project memory folder stops direct commands instead of falling through", { skip: process.getuid?.() === 0 }, async t => {
  const f = await fixture(t);
  const outer = await init(f, path.join(f.temp, "outer"));
  const memory = await init(f, path.join(outer, "repo", "memory"));
  const other = await init(f, path.join(f.temp, "other"));
  const cwd = path.join(outer, "repo");
  await chmod(memory, 0o000);
  let result, report, recipe;
  try {
    result = f.status(cwd);
    report = f.run(["project", "status", "--json"], { cwd, env: { JUMPYBRAIN_MEMORY_ROOT: other } });
    recipe = f.run(["run", "memory:status", "--json"], { cwd });
  } finally { await chmod(memory, 0o755); }
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Could not check this directory for project memory \(EACCES\)/u);
  // Status still reports the explicitly selected brain.
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).target.root, other);
  // Legacy recipe discovery (no personal brain configured) still skips the unreadable folder, as before.
  assert.equal(recipe.status, 0, recipe.stdout + recipe.stderr);
  assert.match(recipe.stdout, new RegExp(JSON.stringify(outer).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
});

test("a malformed trust file fails visibly and project commands reject remote targets", async t => {
  const f = await fixture(t);
  await init(f, path.join(f.temp, "repo", "memory"));
  await mkdir(path.dirname(f.config), { recursive: true });
  await writeFile(path.join(path.dirname(f.config), "trusted-projects.json"), "{\"schemaVersion\":1,\"projects\":[{\"root\":\"relative\"}]}");
  const result = f.status(path.join(f.temp, "repo"));
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Invalid trusted projects file/u);

  const remote = f.run(["project", "trust", "--target-url", "http://127.0.0.1:9"]);
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /Use jumpybrain project status/u);
});

test("the managed personal brain is never mistaken for an unapproved project", async t => {
  const f = await fixture(t);
  const install = path.join(f.temp, "install");
  await cp(path.join(repo, "dist"), path.join(install, "app", "dist"), { recursive: true });
  await cp(path.join(repo, "package.json"), path.join(install, "app", "package.json"));
  const personal = await init(f, path.join(f.temp, "personal", "memory"));
  await writeFile(path.join(install, "install-manifest.json"), JSON.stringify({ installer: "jumpybrain-installer", memoryRoot: personal }));
  const bin = path.join(install, "app", "dist", "cli.js");
  const inPersonal = f.run(["status", "--json"], { cwd: path.join(f.temp, "personal"), bin });
  assert.equal(inPersonal.status, 0, inPersonal.stderr);
  assert.equal(JSON.parse(inPersonal.stdout).target.source, "install-manifest");
  assert.equal(JSON.parse(f.run(["status", "--json"], { cwd: f.temp, bin }).stdout).target.source, "install-manifest");

  const project = await init(f, path.join(f.temp, "work", "memory"));
  assert.notEqual(f.run(["status", "--json"], { cwd: path.join(f.temp, "work"), bin }).status, 0);
  const report = JSON.parse(f.run(["project", "status", "--json"], { cwd: path.join(f.temp, "work"), bin }).stdout);
  assert.equal(report.personalRoot, personal);
  assert.equal(report.project.root, project);
  assert.match(report.target.error, /not approved/u);
  // Recipes cannot quietly fall back to the personal brain next to an unapproved project either.
  const recipe = f.run(["run", "memory:status", "--json"], { cwd: path.join(f.temp, "work"), bin });
  assert.notEqual(recipe.status, 0);
  assert.match(recipe.stdout + recipe.stderr, /not approved on this device/u);
  const personalTrust = f.run(["project", "trust", "--root", personal, "--allow-capture"], { bin });
  assert.notEqual(personalTrust.status, 0);
  assert.match(personalTrust.stderr, /personal brain/u);
});

async function init(f, root, capture) { return f.init(root, capture); }
