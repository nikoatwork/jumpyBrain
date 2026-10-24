import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installFakeQmd } from "./fake-qmd-helper.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(repo, "dist/cli.js");
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-doctor-followup-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const home = path.join(temp, "home"), root = path.join(temp, "project", "memory");
  await mkdir(home);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:JUMPYBRAIN_|QMD_|XDG_|CODEX_|ANTHROPIC_|OPENAI_)/u.test(key)));
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache") });
  const run = (args, extra = {}) => spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: "utf8", timeout: 15000, env: { ...env, ...extra.env }, input: extra.input });
  const ok = (args, extra) => { const result = run(args, extra); assert.equal(result.status, 0, result.stderr); return result; };
  return { temp, root, home, env, run, ok };
}
async function snapshot(dir) {
  const result = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(file) : (await readFile(file)).toString("base64");
  }
  return result;
}
async function fakeEngine(f) {
  const { bin } = await installFakeQmd(f.root);
  const query = await readFile(new URL("./fixtures/fake-qmd-lifecycle/bin/qmd", import.meta.url), "utf8");
  const executable = path.join(path.dirname(bin), "qmd");
  await writeFile(executable, query.replace('const args = process.argv.slice(2);', 'if (process.argv[2] === "--version") { console.log("qmd 2.8.3"); process.exit(0); }\nconst args = process.argv.slice(2);'));
  await chmod(executable, 0o700);
  f.env.JUMPYBRAIN_QMD_BIN = executable;
  return executable;
}

test("doctor keeps legacy exit 0, strict check fails with JSON and no root/home writes", async t => {
  const f = await fixture(t);
  f.env.JUMPYBRAIN_QMD_BIN = path.join(f.temp, "missing qmd");
  const before = await snapshot(f.temp);
  const legacy = f.ok(["doctor", "--root", f.root, "--json"]);
  assert.equal(JSON.parse(legacy.stdout).ok, false);
  const strict = f.run(["doctor", "--root", f.root, "--check", "--json"]);
  assert.equal(strict.status, 1);
  assert.equal(strict.stderr, "");
  const report = JSON.parse(strict.stdout);
  assert.match(report.memoryRoot.message, /Memory root does not exist.*jumpybrain init --root/su);
  assert.match(report.qmd.message, /JUMPYBRAIN_QMD_BIN.*Correct.*unset.*If still unavailable/su);
  assert.equal(report.qmd.binary, f.env.JUMPYBRAIN_QMD_BIN);
  assert.deepEqual(await snapshot(f.temp), before);
});

test("doctor validates every flag before executing dependency probes or creating files", async t => {
  const f = await fixture(t);
  const probe = path.join(f.temp, "probe.cjs"), sentinel = path.join(f.temp, "probe-ran");
  await writeFile(probe, '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.PROBE_SENTINEL, "ran");\n');
  await chmod(probe, 0o700);
  const before = await snapshot(f.temp);
  const invalid = [["--check=true"], ["--check", "false"], ["--check", "--check"], ["--check", "--check=false"], ["--chek"], ["--json=false"], ["--json", "--json"], ["--root"], ["--root="], ["--root", f.root, "--root", f.root], ["--target-url", "https://brain.example"], ["--check", "--version"]];
  for (const flags of invalid) {
    const result = f.run(["doctor", ...flags], { env: { JUMPYBRAIN_QMD_BIN: probe, PROBE_SENTINEL: sentinel } });
    assert.equal(result.status, 1, flags.join(" "));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unknown doctor flag|takes? no value|must not be repeated|requires a non-empty value/u);
  }
  assert.deepEqual(await snapshot(f.temp), before);
});

test("missing explicit root gets an executable literal same-root init hint, then empty recall recovers", async t => {
  const f = await fixture(t);
  f.root = path.join(f.temp, 'Brain space \' " $& $(touch SUBSTITUTED) `touch BACKTICK`');
  const before = await snapshot(f.temp);
  const missing = f.run(["recall", "--root", f.root, "--query", "fictional event"]);
  assert.equal(missing.status, 1);
  assert.doesNotMatch(missing.stderr, /ENOENT/u);
  const hint = missing.stderr.trim().split("Initialize this same root with: ")[1];
  assert.ok(hint);
  assert.deepEqual(await snapshot(f.temp), before);
  const init = spawnSync("/bin/sh", ["-c", 'jumpybrain() { "$TEST_NODE" "$TEST_CLI" "$@"; }; ' + hint], {
    cwd: f.temp, encoding: "utf8", timeout: 15000, env: { ...f.env, TEST_NODE: process.execPath, TEST_CLI: cli },
  });
  assert.equal(init.status, 0, init.stderr);
  assert.ok((await readdir(f.root)).includes("jumpybrain.json"));
  await fakeEngine(f);
  const empty = JSON.parse(f.ok(["recall", "--root", f.root, "--query", "fictional event", "--json"]).stdout);
  assert.equal(empty.results.length, 0);
  assert.equal((await readdir(f.temp)).some(file => ["SUBSTITUTED", "BACKTICK"].includes(file)), false);
  assert.deepEqual(await readdir(path.join(f.root, "notes")), []);
});

test("bad explicit QMD override identifies correction first; unsetting restores same saved memory", async t => {
  const f = await fixture(t);
  f.ok(["init", "--root", f.root]);
  const good = await fakeEngine(f);
  const saved = JSON.parse(f.ok(["remember", "--root", f.root, "--type", "finding", "--title", "Fictional event", "--json"], { input: "The fictional violet event is on 18 November. The year was not specified.\n" }).stdout);
  const canonical = path.join(f.root, saved.file), bytes = await readFile(canonical, "utf8");
  const before = await snapshot(f.temp);
  const bad = path.join(f.temp, "missing engine", "qmd");
  for (const args of [["index"], ["recall", "--query", "violet"], ["recall", "--query", "violet", "--compact"]]) {
    const result = f.run([args[0], "--root", f.root, ...args.slice(1)], { env: { JUMPYBRAIN_QMD_BIN: bad } });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(JSON.stringify(bad)));
    assert.match(result.stderr, /JUMPYBRAIN_QMD_BIN.*Correct.*unset.*If still unavailable/su);
  }
  const broken = f.run(["doctor", "--root", f.root, "--check", "--json"], { env: { JUMPYBRAIN_QMD_BIN: bad } });
  assert.equal(broken.status, 1);
  assert.equal(JSON.parse(broken.stdout).qmd.ok, false);
  // Failed retrieval can acquire/release derived locks; canonical content is invariant.
  assert.equal(await readFile(canonical, "utf8"), bytes);
  delete f.env.JUMPYBRAIN_QMD_BIN;
  const binDir = path.join(f.temp, "bin");
  await mkdir(binDir);
  await symlink(good, path.join(binDir, "qmd"));
  f.env.PATH = binDir + path.delimiter + f.env.PATH;
  const recovered = JSON.parse(f.ok(["doctor", "--root", f.root, "--check", "--json"]).stdout);
  assert.equal(recovered.ok, true);
  const recalled = f.ok(["recall", "--root", f.root, "--query", "violet", "--json"]);
  assert.ok(recalled.stdout.includes("The year was not specified."));
  assert.equal(await readFile(canonical, "utf8"), bytes);
  assert.equal(Object.keys(before.project.memory.findings).length, 1);
  assert.equal((await readdir(path.join(f.root, "findings"))).length, 1);
});

test("doctor distinguishes malformed config without exposing raw errors or init advice", async t => {
  const f = await fixture(t);
  f.ok(["init", "--root", f.root]);
  await fakeEngine(f);
  await writeFile(path.join(f.root, "jumpybrain.json"), "{malformed");
  const before = await snapshot(f.temp);
  const result = f.run(["doctor", "--root", f.root, "--check", "--json"]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).memoryRoot.message, /read or parse jumpybrain.json/u);
  assert.doesNotMatch(result.stdout, /init --root/u);
  const recall = f.run(["recall", "--root", f.root, "--query", "fictional"]);
  assert.equal(recall.status, 1);
  assert.match(recall.stderr, /read or parse jumpybrain.json/u);
  assert.deepEqual(await snapshot(f.temp), before);
});

test("explicit project scope sees project-only Codex, Claude and Pi files while global remains separate", async t => {
  const f = await fixture(t);
  f.ok(["init", "--root", f.root]);
  await fakeEngine(f);
  const project = path.dirname(f.root);
  for (const relative of [".agents/skills/jumpybrain-memory/SKILL.md", ".claude/skills/jumpybrain-memory/SKILL.md", ".pi/extensions/jumpybrain-memory.ts"]) {
    const file = path.join(project, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "fictional integration presence fixture\n");
  }
  const before = await snapshot(f.temp);
  const result = JSON.parse(f.ok(["doctor", "--root=" + f.root, "--check", "--json"]).stdout);
  assert.equal(result.projectRoot, project);
  assert.equal(result.integrationsScope, "global");
  for (const kind of ["codex", "claude", "pi"]) {
    assert.equal(result.integrations[kind].ok, false);
    assert.equal(result.projectIntegrations[kind].ok, true);
    assert.match(result.projectIntegrations[kind].message, /host activation not checked/u);
  }
  const direct = JSON.parse(f.ok(["doctor", "--root", project, "--check", "--json"]).stdout);
  assert.equal(direct.projectIntegrations.pi.ok, true);
  const text = f.ok(["doctor", "--root", f.root, "--check"]).stdout;
  assert.match(text, /Global integration file presence.*Project integration file presence/su);
  const global = JSON.parse(f.ok(["doctor", "--json"]).stdout);
  assert.equal(global.projectIntegrations, undefined);
  assert.match(f.ok(["doctor"]).stdout, /Project integrations not inspected/u);
  assert.deepEqual(await snapshot(f.temp), before);
});

test("inaccessible explicit root remains a permission failure without initialization or redirection", async t => {
  if (process.getuid?.() === 0) { t.skip("permission denial cannot be established as root"); return; }
  const f = await fixture(t);
  f.ok(["init", "--root", f.root]);
  await fakeEngine(f);
  const before = await snapshot(f.temp);
  await chmod(f.root, 0o000);
  try {
    const result = f.run(["doctor", "--root", f.root, "--check", "--json"]);
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).memoryRoot.message, /Permission denied/u);
    assert.doesNotMatch(result.stdout, /init --root/u);
    const recall = f.run(["recall", "--root", f.root, "--query", "fictional"]);
    assert.equal(recall.status, 1);
    assert.match(recall.stderr, /Permission denied/u);
    assert.doesNotMatch(recall.stderr, /init --root/u);
  } finally { await chmod(f.root, 0o755); }
  assert.deepEqual(await snapshot(f.temp), before);
});

test("a missing configured index root is not mistaken for an absent selected memory root", async t => {
  const f = await fixture(t);
  f.ok(["init", "--root", f.root]);
  const config = path.join(f.root, "jumpybrain.json");
  await writeFile(config, JSON.stringify({ ...JSON.parse(await readFile(config, "utf8")), indexRoot: "absent-source" }));
  const before = await snapshot(f.temp);
  const result = f.run(["index", "--root", f.root]);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /Memory root does not exist|init --root/u);
  assert.deepEqual(await snapshot(f.temp), before);
});
