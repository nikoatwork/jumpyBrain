import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { createRemoteAccessClient } from "../dist/adapters/http-client/access.js";
import { validateBrainsConfig, expandBrainSelector } from "../dist/cli/named-brains.js";
import { startPrefixProxy } from "./prefix-proxy-helpers.js";

// Named CLI brains (`--brain <name>`): disposable roots and loopback servers
// only. Every key is a fake. The Mac app is never running here.
const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const KEY_A = "fake-operator-key-brain-alpha-000000001";
const KEY_B = "fake-operator-key-brain-bravo-000000002";
const APP_UUID = "AAAAAAAA_AAAA_4AAA_8AAA_AAAAAAAAAAAA";

async function setup(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-named-brains-")));
  const home = path.join(temp, "home");
  const roots = { local: path.join(temp, "local"), a: path.join(temp, "a"), b: path.join(temp, "b") };
  for (const root of Object.values(roots)) { await mkdir(root); await initializeMemoryRoot(root); }
  const a = await startJumpyBrainHttpServer({ root: roots.a, apiKeys: [KEY_A], port: 0, autoIndex: false });
  const b = await startJumpyBrainHttpServer({ root: roots.b, apiKeys: [KEY_B], port: 0, autoIndex: false });
  t.after(async () => { await a.close(); await b.close(); await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  const envFile = path.join(home, ".config", "jumpybrain", ".env");
  const brainsFile = path.join(home, ".config", "jumpybrain", "brains.json");
  const jb = async (args, { env = {}, input } = {}) => {
    const child = execFile(process.execPath, [cli, ...args], {
      cwd: temp,
      env: { PATH: process.env.PATH, HOME: home, JUMPYBRAIN_CLI_CONFIG: path.join(temp, "absent-cli-config.json"), ...env },
    }, () => {});
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const code = await new Promise(resolve => child.on("close", resolve));
    return { code, stdout, stderr };
  };
  const ok = async (...args) => { const result = await jb(...args); assert.equal(result.code, 0, result.stderr + result.stdout); return result; };
  return { temp, home, roots, a, b, envFile, brainsFile, jb, ok };
}

const noSecret = (text, ...keys) => { for (const key of keys) assert.equal(text.includes(key), false, "a key leaked into CLI output"); };

/** A loopback server that counts requests, to prove nothing was sent. */
async function counter(t) {
  let requests = 0;
  const server = http.createServer((_req, res) => { requests++; res.statusCode = 500; res.end(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, count: () => requests };
}

test("brain list validation: names, duplicates, one destination each, origin or plain path prefix URLs", () => {
  const valid = validateBrainsConfig({ schemaVersion: 1, brains: [{ name: "work", root: "/w" }, { name: "it-ops", url: "https://it.example.org/" }] });
  assert.deepEqual(valid, [{ name: "work", kind: "local", root: "/w" }, { name: "it-ops", kind: "remote", url: "https://it.example.org" }]);
  // A path prefix served by a stripping proxy: trailing slash and default port normalized, case kept.
  for (const [input, stored] of [
    ["https://Brains.Example:443/sherpa/", "https://brains.example/sherpa"],
    ["https://brains.example/team/Ops_1.v2", "https://brains.example/team/Ops_1.v2"],
    ["http://127.0.0.1:3788/sherpa", "http://127.0.0.1:3788/sherpa"],
    ["https://it.example.org:8443", "https://it.example.org:8443"],
  ]) assert.deepEqual(validateBrainsConfig({ schemaVersion: 1, brains: [{ name: "w", url: input }] }), [{ name: "w", kind: "remote", url: stored }]);
  const prefixes = validateBrainsConfig({ schemaVersion: 1, brains: [{ name: "s", url: "https://b.example/sherpa" }, { name: "v", url: "https://b.example/vladimir" }, { name: "o", url: "https://b.example" }] });
  assert.deepEqual(prefixes.map(brain => brain.url), ["https://b.example/sherpa", "https://b.example/vladimir", "https://b.example"]);
  for (const url of ["https://a.example/team?x=1", "https://a.example/team?", "https://a.example/team#top", "https://a.example/#"]) {
    assert.throws(() => validateBrainsConfig({ schemaVersion: 1, brains: [{ name: "w", url }] }), /query or fragment/, url);
  }
  for (const url of ["https://a.example//team", "https://a.example/team//", "https://a.example/a/../b", "https://a.example/./team", "https://a.example/.team",
    "https://a.example/te%61m", "https://a.example/te am", "https://a.example/team\\x", "https://a.example\\team"]) {
    assert.throws(() => validateBrainsConfig({ schemaVersion: 1, brains: [{ name: "w", url }] }), /plain names/, url);
  }
  const bad = (brains, pattern) => assert.throws(() => validateBrainsConfig({ schemaVersion: 1, brains }), pattern);
  bad([{ name: "Work", root: "/w" }], /lowercase/);
  bad([{ name: "a_b", root: "/w" }], /lowercase/);
  bad([{ name: "w", root: "/w" }, { name: "w", root: "/x" }], /listed twice/);
  bad([{ name: "w", root: "/w" }, { name: "x", root: "/w" }], /same folder/);
  bad([{ name: "w", url: "https://a.example" }, { name: "x", url: "https://a.example/" }], /same URL/);
  bad([{ name: "w", url: "https://a.example/team" }, { name: "x", url: "https://a.example/team/" }], /same URL/);
  bad([{ name: "w", url: "http://a.example" }], /HTTPS/);
  bad([{ name: "w", url: "https://u:p@a.example" }], /credentials/);
  bad([{ name: "w", root: "relative" }], /absolute/);
  bad([{ name: "w", root: "/w", url: "https://a.example" }], /exactly one/);
  bad([{ name: "w", root: "/w", key: "secret" }], /unknown field/);
  assert.throws(() => validateBrainsConfig({ schemaVersion: 2, brains: [] }), /unsupported/);
});

test("argv expansion never reads the list without --brain and rejects conflicts and unsupported commands", async (t) => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-named-expand-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const env = { JUMPYBRAIN_BRAINS_FILE: path.join(temp, "brains.json") };
  await writeFile(env.JUMPYBRAIN_BRAINS_FILE, "{broken", { mode: 0o600 });
  // Without --brain an invalid list is irrelevant.
  assert.deepEqual(expandBrainSelector(["recall", "--root", "/x", "--topic", "y"], { env }).argv, ["recall", "--root", "/x", "--topic", "y"]);
  assert.throws(() => expandBrainSelector(["recall", "--brain", "w"], { env }), /Invalid brain list .*not valid JSON/);
  await writeFile(env.JUMPYBRAIN_BRAINS_FILE, JSON.stringify({ schemaVersion: 1, brains: [{ name: "w", root: temp }, { name: "r", url: "https://r.example" }] }));
  assert.deepEqual(expandBrainSelector(["recall", "--brain", "w", "--topic", "y"], { env }).argv, ["recall", "--root", temp, "--topic", "y"]);
  assert.deepEqual(expandBrainSelector(["show", "--brain=r", "--id", "x"], { env }).argv, ["show", "--target-url", "https://r.example", "--id", "x"]);
  assert.deepEqual(expandBrainSelector(["diff", "--root", temp, "--brain", "r"], { env }).argv, ["diff", "--root", temp, "--target-url", "https://r.example"]);
  for (const [argv, pattern] of [
    [["recall", "--brain", "w", "--root", "/x"], /only one target selector: --brain, --root/],
    [["recall", "--brain", "w", "--target-url=https://r.example"], /only one target selector/],
    [["recall", "--brain", "w", "--brain", "r"], /must not be repeated/],
    [["recall", "--brain"], /requires a name/],
    [["recall", "--brain", "nope"], /Unknown brain "nope"\. Named brains: w, r/],
    [["init", "--brain", "w"], /not supported by jumpybrain init; name the folder with --root/],
    [["serve", "--brain", "w"], /not supported/],
    [["backend", "status", "--brain", "w"], /not supported/],
    [["migrate", "obsidian", "--brain", "w"], /not supported/],
    [["update", "--brain", "w"], /not supported/],
    [["connections", "list", "--brain", "w"], /not supported/],
    [["diff", "--root", temp, "--brain", "w"], /is a local folder/],
    [["diff", "--brain", "r", "--target-url", "https://r.example"], /only one server selector/],
    [["doctor", "--brain", "r"], /local brains only/],
  ]) assert.throws(() => expandBrainSelector(argv, { env }), pattern, argv.join(" "));
  await writeFile(env.JUMPYBRAIN_BRAINS_FILE, JSON.stringify({ schemaVersion: 1, brains: [{ name: "gone", root: path.join(temp, "missing") }] }));
  assert.throws(() => expandBrainSelector(["recall", "--brain", "gone"], { env }), /missing or not a folder/);
  // The list decides where keys go: others must not be able to change it.
  await chmod(env.JUMPYBRAIN_BRAINS_FILE, 0o666);
  assert.throws(() => expandBrainSelector(["recall", "--brain", "gone"], { env }), /not writable by others/);
});

test("two hosted brains resolve independent bound keys; recall, expand and writes go to the named server", async (t) => {
  const { a, b, roots, envFile, brainsFile, jb, ok } = await setup(t);
  await ok(["brains", "add", "alpha", "--target-url", a.url, "--key-stdin"], { input: KEY_A + "\n" });
  await ok(["brains", "add", "bravo", "--target-url", b.url, "--key-env", "BRAVO_KEY"], { env: { BRAVO_KEY: KEY_B } });
  assert.equal((await readFile(brainsFile, "utf8")).includes("fake-operator"), false, "keys never go into the brain list");
  const env = await readFile(envFile, "utf8");
  assert.match(env, new RegExp(`JUMPYBRAIN_BRAIN_KEY_ALPHA=${KEY_A}\nJUMPYBRAIN_BRAIN_URL_ALPHA=${a.url.replace(/[.]/g, "\\.")}`));

  const listed = await ok(["brains", "list", "--json"]);
  const brains = JSON.parse(listed.stdout).brains;
  assert.deepEqual(brains.map(brain => [brain.name, brain.credential.source, brain.credential.last4]), [["alpha", "brain-env-file", KEY_A.slice(-4)], ["bravo", "brain-env-file", KEY_B.slice(-4)]]);
  noSecret(listed.stdout, KEY_A, KEY_B);
  const preview = await ok(["migrate", "remote", "--root", roots.local, "--brain", "bravo"], { env: { JUMPYBRAIN_API_KEY: KEY_A } });
  assert.match(preview.stdout, /Apply: jumpybrain migrate remote --root .* --brain bravo --apply/u);
  assert.match((await jb(["diff", "--brain", "bravo"])).stderr, /needs --root <local-brain> --brain <remote-name>/u);

  for (const [name, server, key] of [["alpha", a, KEY_A], ["bravo", b, KEY_B]]) {
    const status = await ok(["status", "--brain", name]);
    assert.match(status.stdout, new RegExp(`Remote memory: ${server.url}`));
    assert.match(status.stdout, new RegExp(`Target source: brain ${name}`));
    assert.match(status.stdout, new RegExp(`Access key: JUMPYBRAIN_BRAIN_KEY_${name.toUpperCase()} in .*\\.env .*ends …${key.slice(-4)}\\), accepted`));
    noSecret(status.stdout, KEY_A, KEY_B);
    const saved = JSON.parse((await ok(["remember", "--brain", name, "--title", `Only in ${name}`, "--json"], { input: `marker-${name} body` })).stdout);
    assert.equal(saved.saved, true);
    // A hosted brain searches its published index (autoIndex is off here).
    await ok(["index", "--brain", name]);
  }
  // Each note landed on its own server only.
  for (const [name, other] of [["alpha", "bravo"], ["bravo", "alpha"]]) {
    const recalled = JSON.parse((await ok(["recall", "--brain", name, "--query", `marker-${name}`, "--json"])).stdout);
    assert.ok(recalled.results.some(result => result.snippet?.includes(`marker-${name}`)));
    const cross = JSON.parse((await ok(["recall", "--brain", name, "--query", `marker-${other}`, "--json"])).stdout);
    assert.equal(cross.results.some(result => result.snippet?.includes(`marker-${other}`)), false);
    const hit = recalled.results.find(result => result.snippet?.includes(`marker-${name}`));
    const id = hit.provenance.metadata.id;
    const shown = JSON.parse((await ok(["show", "--brain", name, "--id", id, "--json"])).stdout);
    const expanded = JSON.parse((await ok(["expand", "--brain", name, "--id", id, "--if-match", shown.contentHash])).stdout);
    assert.match(JSON.stringify(expanded), new RegExp(`marker-${name}`));
  }

  // The generic key is never sent to a named brain, but direct URLs keep using it.
  const generic = { JUMPYBRAIN_API_KEY: KEY_A };
  await ok(["brains", "remove", "bravo"]);
  await ok(["brains", "add", "bravo", "--target-url", b.url]);
  const missing = await jb(["status", "--brain", "bravo"], { env: generic });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /No access key for brain "bravo" .*nothing was sent.*JUMPYBRAIN_API_KEY is not used for named brains/s);
  const direct = await jb(["status", "--target-url", a.url], { env: generic });
  assert.equal(direct.code, 0, direct.stderr);
  assert.match(direct.stdout, /Target source: flag/);
  assert.match(direct.stdout, /JUMPYBRAIN_API_KEY from the environment/);

  // A mismatched key is rejected by the server and explained with the named key order.
  await ok(["brains", "key", "bravo", "--key-stdin"], { input: KEY_A });
  const rejected = await jb(["recall", "--brain", "bravo", "--query", "x"]);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /rejected the access key \(HTTP 401/);
  assert.match(rejected.stderr, /Key used: JUMPYBRAIN_BRAIN_KEY_BRAVO in /);
  assert.match(rejected.stderr, /Key order for brain "bravo".*JUMPYBRAIN_API_KEY is never used/);
  assert.match(rejected.stderr, /Check with: jumpybrain status --brain bravo/);
  noSecret(rejected.stderr, KEY_A, KEY_B);

  // access whoami reports the named order and the bound key.
  await ok(["brains", "key", "bravo", "--key-stdin"], { input: KEY_B });
  const whoami = JSON.parse((await ok(["access", "whoami", "--brain", "bravo", "--json"])).stdout);
  assert.equal(whoami.cli.target.brain, "bravo");
  assert.deepEqual(whoami.cli.credential.candidates.map(slot => [slot.source, slot.used]), [["brain-environment", false], ["brain-env-file", true], ["app-connection", false]]);
  assert.equal(whoami.cli.access.role, "admin");
});

test("two brains under path prefixes on one host: separate keys, writes, recall, access and live collaboration stay under each prefix", async (t) => {
  const { a, b, jb, ok, envFile } = await setup(t);
  const proxy = await startPrefixProxy(t, { "/alpha": a.url, "/bravo": b.url });
  await ok(["brains", "add", "alpha", "--target-url", proxy.origin + "/alpha/", "--key-stdin"], { input: KEY_A });
  await ok(["brains", "add", "bravo", "--target-url", proxy.origin + "/bravo", "--key-stdin"], { input: KEY_B });
  assert.match(await readFile(envFile, "utf8"), new RegExp(`JUMPYBRAIN_BRAIN_URL_ALPHA=${proxy.origin.replace(/[.]/g, "\\.")}/alpha\n`));
  const bad = await jb(["brains", "add", "dots", "--target-url", proxy.origin + "/a/../bravo"]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /plain names/);
  for (const name of ["alpha", "bravo"]) {
    assert.match((await ok(["status", "--brain", name])).stdout, new RegExp(`Remote memory: ${proxy.origin}/${name}`));
    await ok(["remember", "--brain", name, "--title", `Prefixed ${name}`], { input: `prefix-marker-${name} body` });
    await ok(["index", "--brain", name]);
    assert.equal(JSON.parse((await ok(["access", "whoami", "--brain", name, "--json"])).stdout).cli.access.role, "admin");
  }
  const recalled = JSON.parse((await ok(["recall", "--brain", "alpha", "--query", "prefix-marker-alpha", "--json"])).stdout);
  const hit = recalled.results.find(result => result.snippet?.includes("prefix-marker-alpha"));
  assert.ok(hit);
  const cross = JSON.parse((await ok(["recall", "--brain", "bravo", "--query", "prefix-marker-alpha", "--json"])).stdout);
  assert.equal(cross.results.some(result => result.snippet?.includes("prefix-marker-alpha")), false);
  const opened = JSON.parse((await ok(["collaborate", "open", "--brain", "alpha", "--id", hit.provenance.metadata.id, "--json"])).stdout);
  assert.match(JSON.stringify(opened), /prefix-marker-alpha/);
  assert.ok(proxy.seen.includes("/alpha/ws"), "collaborate joined /ws under the prefix");
  assert.deepEqual(proxy.outside, [], "nothing was sent outside the prefixes");
});

test("a key bound to another URL is never sent: re-pointed names, env pairs and leftovers fail closed", async (t) => {
  const { a, brainsFile, envFile, jb, ok } = await setup(t, {});
  const trap = await counter(t);
  await ok(["brains", "add", "alpha", "--target-url", a.url, "--key-stdin"], { input: KEY_A });
  // Re-point the name by hand (or after a half-finished remove/add): the saved pair stays bound to the old URL.
  await writeFile(brainsFile, JSON.stringify({ schemaVersion: 1, brains: [{ name: "alpha", url: trap.url }] }), { mode: 0o600 });
  const stale = await jb(["recall", "--brain", "alpha", "--query", "x"]);
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /No usable access key for brain "alpha".*nothing was sent.*bound to another server/s);
  assert.equal(trap.count(), 0);
  noSecret(stale.stderr, KEY_A);

  // An environment key must name its destination too.
  const unbound = await jb(["status", "--brain", "alpha"], { env: { JUMPYBRAIN_BRAIN_KEY_ALPHA: KEY_A } });
  assert.match(unbound.stderr, /has no JUMPYBRAIN_BRAIN_URL_ALPHA.*not sent/s);
  const elsewhere = await jb(["status", "--brain", "alpha"], { env: { JUMPYBRAIN_BRAIN_KEY_ALPHA: KEY_A, JUMPYBRAIN_BRAIN_URL_ALPHA: a.url } });
  assert.match(elsewhere.stderr, /bound to another server/);
  assert.equal(trap.count(), 0);

  // A valid saved pair is not used, listed as usable or probed while an explicit
  // environment pair names another server.
  await writeFile(brainsFile, JSON.stringify({ schemaVersion: 1, brains: [{ name: "alpha", url: a.url }] }), { mode: 0o600 });
  await ok(["brains", "key", "alpha", "--key-stdin"], { input: KEY_A });
  await ok(["status", "--brain", "alpha"]);
  const shadow = { JUMPYBRAIN_BRAIN_KEY_ALPHA: KEY_B, JUMPYBRAIN_BRAIN_URL_ALPHA: trap.url };
  const blocked = await jb(["status", "--brain", "alpha"], { env: shadow });
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /bound to another server/);
  const whoami = JSON.parse((await ok(["access", "whoami", "--brain", "alpha", "--json"], { env: shadow })).stdout);
  assert.equal(whoami.cli.credential.resolved, false);
  assert.equal(whoami.cli.access.reason, "credential_unavailable");
  assert.ok(whoami.cli.credential.candidates.every(slot => !slot.used));
  const listed = JSON.parse((await ok(["brains", "list", "--json"], { env: shadow })).stdout);
  assert.equal(listed.brains[0].credential.found, false);
  assert.equal(trap.count(), 0);
  noSecret(blocked.stderr + JSON.stringify(whoami) + JSON.stringify(listed), KEY_A, KEY_B);

  // Pointing the name back at its server with a bound env pair works without the key file.
  await writeFile(brainsFile, JSON.stringify({ schemaVersion: 1, brains: [{ name: "alpha", url: a.url }] }), { mode: 0o600 });
  await rm(envFile);
  const paired = await ok(["status", "--brain", "alpha"], { env: { JUMPYBRAIN_BRAIN_KEY_ALPHA: KEY_A, JUMPYBRAIN_BRAIN_URL_ALPHA: `${a.url}/` } });
  assert.match(paired.stdout, /JUMPYBRAIN_BRAIN_KEY_ALPHA from the environment/);
});

test("the Mac app's key for the exact URL serves a named brain; device read-only policy follows the brain's server", async (t) => {
  const { temp, a, envFile, jb, ok } = await setup(t);
  const writer = (await createRemoteAccessClient({ url: a.url, apiKey: KEY_A }).issue({ name: "App", role: "writer" })).token;
  await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
  await writeFile(envFile, `JUMPYBRAIN_KEY_${APP_UUID}=${writer}\nJUMPYBRAIN_URL_${APP_UUID}=${a.url}\n`, { mode: 0o600 });
  await ok(["brains", "add", "alpha", "--target-url", a.url]);
  const status = await ok(["status", "--brain", "alpha"]);
  assert.match(status.stdout, new RegExp(`JUMPYBRAIN_KEY_${APP_UUID}`));

  // JUMPYBRAIN_API_KEY in the file alone is never used; an app connection that
  // refers to it for this exact URL is (the app bound that reference).
  await writeFile(envFile, `JUMPYBRAIN_API_KEY=${writer}\n`, { mode: 0o600 });
  const generic = await jb(["status", "--brain", "alpha"]);
  assert.match(generic.stderr, /No access key for brain "alpha"/);
  await writeFile(envFile, `JUMPYBRAIN_API_KEY=${writer}\nJUMPYBRAIN_KEYREF_${APP_UUID}=JUMPYBRAIN_API_KEY\nJUMPYBRAIN_URL_${APP_UUID}=${a.url}\n`, { mode: 0o600 });
  const referenced = await ok(["status", "--brain", "alpha", "--json"]);
  assert.deepEqual([JSON.parse(referenced.stdout).target.credential.source, JSON.parse(referenced.stdout).target.credential.variable], ["app-connection", "JUMPYBRAIN_API_KEY"]);

  const policy = path.join(temp, "cli-config.json");
  await writeFile(policy, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: a.url, access: "read-only" }] }));
  const blocked = await jb(["remember", "--brain", "alpha", "--title", "Blocked"], { input: "x", env: { JUMPYBRAIN_CLI_CONFIG: policy } });
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/);
  await ok(["index", "--brain", "alpha"]);
  await ok(["recall", "--brain", "alpha", "--query", "x"], { env: { JUMPYBRAIN_CLI_CONFIG: policy } });
});

test("an exact legacy Mac key reference works before and after named key rotation or removal", async (t) => {
  const { a, b, envFile, jb, ok } = await setup(t);
  await ok(["brains", "add", "alpha", "--target-url", a.url, "--key-stdin"], { input: KEY_A });
  const legacyReference = async () => writeFile(envFile, (await readFile(envFile, "utf8")) +
    `JUMPYBRAIN_KEYREF_${APP_UUID}=JUMPYBRAIN_BRAIN_KEY_ALPHA\nJUMPYBRAIN_URL_${APP_UUID}=${a.url}\n`, { mode: 0o600 });
  await legacyReference();
  const legacy = await ok(["status", "--target-url", a.url, "--json"]);
  assert.equal(JSON.parse(legacy.stdout).target.credential.variable, "JUMPYBRAIN_BRAIN_KEY_ALPHA");
  const original = await readFile(envFile, "utf8");
  await writeFile(envFile, original.replace(`JUMPYBRAIN_URL_${APP_UUID}=${a.url}`, `JUMPYBRAIN_URL_${APP_UUID}=${b.url}`));
  const wrongUrl = await jb(["status", "--target-url", b.url]);
  assert.match(wrongUrl.stderr, /No access key/u);
  await writeFile(envFile, original);
  await ok(["brains", "key", "alpha", "--key-stdin"], { input: KEY_B });
  const oldAppKey = await ok(["status", "--target-url", a.url, "--json"]);
  assert.equal(JSON.parse(oldAppKey.stdout).target.credential.variable, `JUMPYBRAIN_KEY_${APP_UUID}`);
  await ok(["brains", "key", "alpha", "--key-stdin"], { input: KEY_A });
  // Simulate an old app saving another reference to the alias again.
  await writeFile(envFile, (await readFile(envFile, "utf8")).replace(new RegExp(`^JUMPYBRAIN_KEY_${APP_UUID}=.*\n`, "m"), ""), { mode: 0o600 });
  await legacyReference();
  await ok(["brains", "remove", "alpha"]);
  const after = await ok(["status", "--target-url", a.url, "--json"]);
  assert.equal(JSON.parse(after.stdout).target.credential.variable, `JUMPYBRAIN_KEY_${APP_UUID}`);
});

test("local named brains: recall, expand and writes; defaults and direct flags unchanged; headless setup", async (t) => {
  const { temp, roots, brainsFile, jb, ok } = await setup(t);
  await ok(["brains", "add", "notes", "--root", roots.local]);
  const missing = await jb(["brains", "add", "ghost", "--root", path.join(temp, "nowhere")]);
  assert.match(missing.stderr, /No folder at .*jumpybrain init --root/);
  const dup = await jb(["brains", "add", "again", "--root", roots.local]);
  assert.match(dup.stderr, /Brain "notes" already names this folder/);
  const keyed = await jb(["brains", "add", "loc", "--root", roots.b, "--key-stdin"], { input: "x" });
  assert.match(keyed.stderr, /needs no access key/);

  await ok(["remember", "--brain", "notes", "--title", "Local named", "--json"], { input: "local-marker body" });
  const recalled = JSON.parse((await ok(["recall", "--brain", "notes", "--query", "local-marker", "--json"])).stdout);
  assert.equal(recalled.root, roots.local);
  const status = await ok(["status", "--brain", "notes"]);
  assert.match(status.stdout, /Target source: brain notes/);
  const whoami = JSON.parse((await ok(["access", "whoami", "--brain", "notes", "--json"])).stdout);
  assert.equal(whoami.cli.target.brain, "notes");
  const doctor = JSON.parse((await jb(["doctor", "--brain", "notes", "--json"])).stdout);
  assert.equal(doctor.memoryRoot.brain, "notes");

  // Old syntax and defaults ignore the list, even a broken one.
  await writeFile(brainsFile, "{broken", { mode: 0o600 });
  const direct = JSON.parse((await ok(["recall", "--root", roots.local, "--query", "local-marker", "--json"])).stdout);
  assert.equal(direct.root, roots.local);
  const defaulted = JSON.parse((await ok(["status", "--json"], { env: { JUMPYBRAIN_MEMORY_ROOT: roots.local } })).stdout);
  assert.equal(defaulted.target.source, "environment");
  const broken = await jb(["recall", "--brain", "notes", "--query", "x", "--json"]);
  assert.equal(broken.code, 1);
  assert.match(JSON.parse(broken.stdout).error.message, /Invalid brain list/);
});

test("brains add/remove are state-changing under read-only command mode; list stays available", async (t) => {
  const { roots, jb, ok } = await setup(t);
  const blocked = await jb(["brains", "add", "notes", "--root", roots.local], { env: { JUMPYBRAIN_READ_ONLY_COMMANDS: "1" } });
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /read-only command mode/);
  await ok(["brains", "list"], { env: { JUMPYBRAIN_READ_ONLY_COMMANDS: "1" } });
  // The gate runs before the brain list is read.
  const mutation = await jb(["remember", "--brain", "missing", "--title", "x"], { input: "x", env: { JUMPYBRAIN_READ_ONLY_COMMANDS: "1", JUMPYBRAIN_BRAINS_FILE: "/nonexistent/brains.json" } });
  assert.match(mutation.stderr + mutation.stdout, /JUMPYBRAIN_READ_ONLY_COMMANDS/);
  assert.doesNotMatch(mutation.stderr + mutation.stdout, /Unknown brain/);
  const help = await ok(["recall", "--help"]);
  assert.match(help.stdout, /--brain <name>/);
});

test("concurrent brains changes and app key saves across processes never drop each other", async (t) => {
  const { temp, envFile, brainsFile, ok } = await setup(t);
  const { createEnvFileCredentials } = await import("../dist/adapters/credentials/env-file.js");
  const folders = [];
  for (let index = 0; index < 8; index++) { const folder = path.join(temp, `folder-${index}`); await mkdir(folder); folders.push(folder); }
  await Promise.all(folders.map((folder, index) => ok(["brains", "add", `brain-${index}`, "--root", folder])));
  const names = JSON.parse(await readFile(brainsFile, "utf8")).brains.map(brain => brain.name).sort();
  assert.deepEqual(names, folders.map((_, index) => `brain-${index}`).sort());

  // Named keys from several CLI processes and app connection saves share one key file.
  const app = createEnvFileCredentials({ file: envFile });
  const refs = Array.from({ length: 6 }, (_, index) => `jumpybrain-companion:${index}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
  await Promise.all([
    ...Array.from({ length: 6 }, (_, index) => ok(["brains", "add", `remote-${index}`, "--target-url", `https://r${index}.example.org`, "--key-stdin"], { input: `fake-remote-key-${index}-000000000000` })),
    ...refs.map((ref, index) => app.set(ref, `fake-app-key-${index}-0000000000000000`, { url: `https://app${index}.example.org` })),
  ]);
  const text = await readFile(envFile, "utf8");
  for (let index = 0; index < 6; index++) {
    assert.match(text, new RegExp(`JUMPYBRAIN_BRAIN_KEY_REMOTE_${index}=fake-remote-key-${index}-`));
    assert.match(text, new RegExp(`JUMPYBRAIN_BRAIN_URL_REMOTE_${index}=https://r${index}\\.example\\.org`));
    assert.equal(await app.get(refs[index]), `fake-app-key-${index}-0000000000000000`);
  }
  assert.equal(JSON.parse(await readFile(brainsFile, "utf8")).brains.length, 14);
  const dir = await import("node:fs/promises").then(fs => fs.readdir(path.dirname(envFile)));
  assert.deepEqual(dir.filter(name => /\.lock$|candidate|\.tmp$/.test(name)), [], "no lock or temp files left behind");
});
