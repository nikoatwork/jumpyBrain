// Device-local read-only command mode: every state-changing command stops before
// credentials, input, network or backend work; observational commands are unchanged.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isObservationalInvocation, validateRemoteAccessPolicyConfig } from "../dist/cli/remote-access-policy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");
const blocked = /JUMPYBRAIN_READ_ONLY_COMMANDS/;
const laterStage = /No access key for|ENOENT|missing\.json|fetch failed|ECONNREFUSED/;
const ID = "mem_00000000-0000-4000-8000-000000000000", HASH = `sha256:${"a".repeat(64)}`;

async function scratch(t, config = { schemaVersion: 1, remoteTargets: [], commands: "read-only" }) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-read-only-commands-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const configPath = path.join(temp, "cli-config.json");
  if (config !== null) await writeFile(configPath, typeof config === "string" ? config : JSON.stringify(config));
  const env = { HOME: temp, JUMPYBRAIN_CLI_CONFIG: configPath, JUMPYBRAIN_API_KEY: "", JUMPYBRAIN_ENV_FILE: path.join(temp, "absent.env"), JUMPYBRAIN_MEMORY_ROOT: "", JUMPYBRAIN_READ_ONLY_COMMANDS: "" };
  return { temp, configPath, env };
}

function runCli(args, env, input = "stdin must not be consumed") {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd: env.HOME, encoding: "utf8", env: { ...process.env, ...env }, input, timeout: 20000 });
}

test("policy config accepts only the optional read-only command mode and keeps the existing shape without it", () => {
  const targets = [{ origin: "https://memory.example", access: "read-only" }];
  assert.deepEqual(validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: targets }), { schemaVersion: 1, remoteTargets: targets });
  assert.deepEqual(validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: [], commands: "read-only" }), { schemaVersion: 1, remoteTargets: [], commands: "read-only" });
  for (const commands of ["read-write", true, null, ""]) {
    assert.throws(() => validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: [], commands }), /commands must be "read-only"/);
  }
  assert.throws(() => validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: [], commands: "read-only", extra: 1 }), /exactly/);
});

test("classification is an explicit allowlist: unknown and state-changing operations are not observational", () => {
  const observational = [
    [], ["help"], ["version"], ["instructions"], ["agent-hint"], ["doctor"], ["feedback"],
    ["status"], ["tree"], ["overview"], ["search"], ["recall"], ["show"], ["expand"], ["diff"], ["dream"],
    ["run", "memory:recall"], ["run", "memory:show"],
    ["access", "list"], ["collaborate", "open"], ["collaborate", "watch"], ["attention", "list"],
    ["board", "list"], ["board", "show"], ["board", "status"], ["drawings", "list"], ["drawings", "show"],
    ["connections", "list"], ["connections", "test"], ["project", "status"], ["identity"],
    ["backend", "status"], ["backend", "list"], ["extensions", "list"], ["extensions", "check"], ["migrate", "remote"],
  ];
  for (const words of observational) assert.equal(isObservationalInvocation({ _: words }), true, words.join(" "));
  assert.equal(isObservationalInvocation({ _: ["update"], "dry-run": true }), true);

  const changing = [
    ["remember"], ["wrapup"], ["delete"], ["index"], ["process"], ["init"], ["serve"], ["update"], ["note"],
    ["run", "memory:remember"], ["run", "memory:index"], ["run", "other:recipe"], ["run"],
    ["access", "issue"], ["access", "revoke"], ["access"], ["collaborate", "edit"], ["collaborate", "stream"], ["collaborate"],
    ["attention", "settle"], ["attention", "snooze"], ["attention", "bring-back"],
    ["board", "create"], ["board", "add"], ["board"], ["drawings", "update"],
    ["connections", "add"], ["connections", "remove"], ["connections", "select"], ["project", "trust"], ["project", "untrust"],
    ["backend", "start"], ["backend", "stop"], ["extensions", "install"], ["extensions", "remove"], ["extensions", "reload"],
    ["migrate", "obsidian"], ["migrate", "logseq"], ["future-command"],
  ];
  for (const words of changing) assert.equal(isObservationalInvocation({ _: words }), false, words.join(" "));
  assert.equal(isObservationalInvocation({ _: ["identity"], name: "Alex" }), false);
  assert.equal(isObservationalInvocation({ _: ["migrate", "remote"], apply: true }), false);
  assert.equal(isObservationalInvocation({ _: ["update"], id: "mem_x", "dry-run": true }), false, "a document update is never a preview");
  assert.equal(isObservationalInvocation({ _: ["update"], root: "/brain", "dry-run": true }), false);
  for (const flag of ["complete", "abandon", "force", "apply-manifest"]) assert.equal(isObservationalInvocation({ _: ["dream"], [flag]: true }), false);
});

test("read-only command mode blocks local and remote mutations before credentials, input files, roots or backends", async t => {
  const { temp, env } = await scratch(t);
  const remote = ["--target-url", "https://memory.example"];
  const newRoot = path.join(temp, "new-brain");
  const mutations = [
    ["remember", ...remote], ["remember", "--root", newRoot, "--title", "x"], ["wrapup", "--title", "x", ...remote],
    ["update", "--id", ID, "--if-match", HASH, ...remote], ["update", "--id", ID, "--if-match", HASH, "--root", newRoot],
    ["delete", "--id", ID, ...remote], ["index", ...remote], ["index", "--root", newRoot], ["process", "--mode", "lint", "--root", newRoot],
    ["run", "memory:remember", ...remote], ["run", "memory:index", "--root", newRoot],
    ["dream", "--force", ...remote], ["dream", "--apply-manifest", path.join(temp, "missing.json"), ...remote],
    ["access", "issue", "--name", "Eve", "--role", "admin", ...remote], ["access", "revoke", "--id", "x", ...remote],
    ["access", "issue", "--name", "Eve", "--root", newRoot], ["access", "revoke", "--id", "x", "--root", newRoot],
    ["collaborate", "edit", "--id", ID, ...remote], ["collaborate", "stream", "--id", ID, ...remote],
    ["attention", "settle", "--id", ID, "--if-match", HASH, ...remote],
    ["drawings", "update", "--drawing", "x", "--if-match", HASH, "--file", path.join(temp, "missing.json"), ...remote],
    ["board", "create", "--name", "Plan", ...remote],
    ["migrate", "remote", "--root", newRoot, "--apply", ...remote], ["migrate", "obsidian", "--source", path.join(temp, "vault"), "--root", newRoot, "--apply"],
    ["init", "--root", newRoot], ["serve", "--root", newRoot], ["backend", "start", "--root", newRoot], ["backend", "stop", "--root", newRoot],
    ["identity", "--name", "Alex"], ["project", "trust"], ["connections", "remove", "--id", "x", "--revision", "1"],
    ["extensions", "install", "--source", path.join(temp, "package")], ["update"], ["future-command"],
  ];
  for (const args of mutations) {
    const result = runCli(args, env);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, blocked, `${args.join(" ")}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, laterStage, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
  assert.equal(existsSync(newRoot), false, "no local root or backend state was created");
  assert.deepEqual((await readdir(temp)).sort(), ["cli-config.json"], "no device state was written");

  const json = runCli(["remember", "--json", ...remote], env);
  assert.equal(json.stderr, "");
  assert.equal(JSON.parse(json.stdout).error.code, "read_only_commands");
});

test("read-only command mode leaves observational commands at their normal next step", async t => {
  const { env } = await scratch(t);
  const remote = ["--target-url", "https://memory.example"];
  for (const args of [["status"], ["tree"], ["search", "--query", "x"], ["recall", "--topic", "x"], ["show", "--id", ID], ["expand", "--id", ID, "--if-match", HASH],
    ["dream"], ["run", "memory:recall", "--topic", "x"], ["access", "list"], ["attention", "list"], ["drawings", "list"], ["board", "list"]]) {
    const result = runCli([...args, ...remote], env);
    assert.doesNotMatch(result.stderr, blocked, args.join(" "));
    assert.match(result.stderr, /No access key for/, args.join(" "));
  }
  for (const args of [["--version"], ["instructions"], ["help"], ["identity"], ["project", "status"]]) {
    const result = runCli(args, env);
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  }
  const preview = runCli(["update", "--dry-run"], env);
  assert.doesNotMatch(preview.stderr, blocked, "an update preview is observational");
});

test("the environment switch can only tighten; unreadable policy and invalid values fail closed for mutations only", async t => {
  const off = await scratch(t, null);
  const mutation = ["remember", "--target-url", "https://memory.example"], read = ["status", "--target-url", "https://memory.example"];
  assert.match(runCli(mutation, off.env).stderr, /No access key for/, "no policy: unchanged behavior");
  for (const value of ["1", "true", "TRUE"]) {
    const result = runCli(mutation, { ...off.env, JUMPYBRAIN_READ_ONLY_COMMANDS: value });
    assert.match(result.stderr, blocked); assert.match(result.stderr, /environment variable/); assert.doesNotMatch(result.stderr, laterStage);
    assert.match(runCli(read, { ...off.env, JUMPYBRAIN_READ_ONLY_COMMANDS: value }).stderr, /No access key for/);
  }
  const invalid = runCli(mutation, { ...off.env, JUMPYBRAIN_READ_ONLY_COMMANDS: "yes" });
  assert.match(invalid.stderr, /must be 1, true, 0 or false/); assert.doesNotMatch(invalid.stderr, laterStage);
  assert.match(runCli(read, { ...off.env, JUMPYBRAIN_READ_ONLY_COMMANDS: "yes" }).stderr, /No access key for/);

  const on = await scratch(t);
  for (const value of ["0", "false"]) assert.match(runCli(mutation, { ...on.env, JUMPYBRAIN_READ_ONLY_COMMANDS: value }).stderr, blocked, "the variable never lifts the configured mode");

  const broken = await scratch(t, "{bad json\n");
  const local = runCli(["init", "--root", path.join(broken.temp, "brain")], broken.env);
  assert.match(local.stderr, /Invalid jumpyBrain CLI policy config/); assert.equal(existsSync(path.join(broken.temp, "brain")), false);
  assert.equal(runCli(["--version"], broken.env).status, 0);
});

test("blocked commands send nothing to the server, even with a usable key; reads still reach it", async t => {
  const { env } = await scratch(t);
  const requests = [];
  const server = createServer((request, response) => { requests.push(`${request.method} ${request.url}`); response.writeHead(503, { "content-type": "application/json" }); response.end("{}"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const target = ["--target-url", `http://127.0.0.1:${server.address().port}`];
  const run = args => new Promise(resolve => {
    const child = spawn(process.execPath, [cliPath, ...args, ...target], { env: { ...process.env, ...env, JUMPYBRAIN_API_KEY: "jb_usable-looking-key" }, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; }); child.stdin.end("body"); child.on("close", () => resolve(stderr));
  });
  for (const args of [["remember", "--title", "x"], ["index"], ["access", "issue", "--name", "Eve"], ["access", "revoke", "--id", "x"], ["collaborate", "edit", "--id", ID], ["delete", "--id", ID]]) {
    assert.match(await run(args), blocked, args.join(" "));
  }
  assert.deepEqual(requests, []);
  assert.doesNotMatch(await run(["status"]), blocked);
  assert.ok(requests.length > 0, "an allowed read contacts the server");
});
