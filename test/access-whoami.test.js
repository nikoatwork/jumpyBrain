import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { createRemoteAccessClient, probeRemoteAccess } from "../dist/adapters/http-client/access.js";
import { parseArgs } from "../dist/cli/args.js";
import { isObservationalInvocation, isReadInvocation } from "../dist/cli/remote-access-policy.js";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";

// `access whoami` is the one observational answer to: which brain do CLI
// commands use, which key is sent, what does the server say that key may do,
// what does this device block, and what does the Mac app have selected.
// Every key, token and server body here is a disposable fake.
const run = promisify(execFile);
const repo = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repo, "dist/cli.js");
const OPERATOR = "fake-operator-key-for-access-whoami-000001";
const CONTROL = "c".repeat(64);
const BODY_MARKER = "SERVER-BODY-MARKER-do-not-print";
const APP_UUID = "BBBBBBBB_BBBB_4BBB_8BBB_BBBBBBBBBBBB";
const ALL = ["read", "write", "manage_access"];

async function sandbox(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-access-whoami-")));
  const home = path.join(root, "home"); await mkdir(home);
  const envFile = path.join(home, ".config", "jumpybrain", ".env");
  const policyFile = path.join(root, "cli-config.json");
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const cliRun = async (args, env = {}) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [cli, ...args], {
        cwd: root, timeout: 30000,
        env: { PATH: process.env.PATH, HOME: home, JUMPYBRAIN_ENV_FILE: envFile, JUMPYBRAIN_CLI_CONFIG: policyFile, ...env },
      });
      return { code: 0, stdout, stderr };
    } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  const whoami = async (args = [], env = {}) => {
    const result = await cliRun(["access", "whoami", ...args, "--json"], env);
    assert.equal(result.code, 0, result.stderr); assert.equal(result.stderr, "");
    return { ...result, report: JSON.parse(result.stdout) };
  };
  const keyFile = async (text, mode = 0o600) => {
    await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
    await writeFile(envFile, text, { mode }); await chmod(envFile, mode);
  };
  return { root, home, envFile, policyFile, cliRun, whoami, keyFile };
}

async function hosted(t, root) {
  const brain = path.join(root, "hosted-brain"); await mkdir(brain); await initializeMemoryRoot(brain);
  const server = await startJumpyBrainHttpServer({ root: brain, apiKeys: [OPERATOR], host: "127.0.0.1", port: 0, autoIndex: false });
  t.after(() => server.close());
  const admin = createRemoteAccessClient({ url: server.url, apiKey: OPERATOR });
  const issue = async (name, role) => { const issued = await admin.issue({ name, role }); return { token: issued.token, id: issued.credential.id }; };
  return { server, url: new URL(server.url).origin, brain, admin, issue };
}

/** A fake server that answers /capabilities with a scripted reply and records every request. */
async function fake(t, reply) {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    reply(request, response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}`, seen };
}
const json = (status, body) => (_request, response) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
const noSecret = (text, ...secrets) => { for (const secret of secrets) assert.equal(text.includes(secret), false, "a secret leaked into CLI output"); };
const listing = async (folder) => (await readdir(folder, { recursive: true })).sort();

test("the capabilities probe validates the server's answer and never returns a body or guesses a role", async (t) => {
  const key = "fake-probe-key-0123456789";
  const ask = async (reply, options = {}) => { const server = await fake(t, reply); return { result: await probeRemoteAccess({ url: server.url, apiKey: key, ...options }), server }; };

  const current = await ask(json(200, { protocol: 2, principal: { id: "11111111-2222-4333-8444-555555555555", name: "Lap\u0000top\n", role: "writer" }, capabilities: ["write", "read"], roles: {} }));
  assert.deepEqual(current.result, { outcome: "confirmed", role: "writer", name: "Lap top", id: "11111111-2222-4333-8444-555555555555", capabilities: ["read", "write"] });
  assert.deepEqual(current.server.seen, [{ method: "GET", url: "/capabilities", authorization: "Bearer " + key }], "one GET, no retry");

  // An older server sends only the role: the list is absent, never invented here.
  assert.deepEqual((await ask(json(200, { principal: { id: "bootstrap:0123456789abcdef", name: "Brain operator", role: "admin" } }))).result,
    { outcome: "confirmed", role: "admin", name: "Brain operator" }, "a key-derived bootstrap ID is not passed on");
  assert.deepEqual((await ask(json(200, { principal: { role: "reader" }, capabilities: ["read", "launch_rockets"] }))).result,
    { outcome: "confirmed", role: "reader", capabilities: ["read"], unknownCapabilities: true });
  for (const malformed of ["write", { write: true }, ["read", 7], null]) {
    assert.deepEqual((await ask(json(200, { principal: { role: "writer" }, capabilities: malformed }))).result, { outcome: "confirmed", role: "writer", capabilities: null });
  }
  for (const role of ["owner", "Admin", "", 7, null, undefined, ["admin"]]) {
    assert.deepEqual((await ask(json(200, { principal: { role }, capabilities: ALL }))).result, { outcome: "unsupported", detail: "unknown_role", status: 200 }, String(role));
  }
  for (const body of [{}, { principal: null }, { principal: "admin" }, [], "admin"]) {
    assert.deepEqual((await ask(json(200, body))).result, { outcome: "unsupported", detail: "invalid_response", status: 200 });
  }
  const html = (_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(`<html>${BODY_MARKER}</html>`); };
  assert.deepEqual((await ask(html)).result, { outcome: "unsupported", detail: "invalid_response", status: 200 });
  const huge = (_request, response) => { response.writeHead(200); response.end(JSON.stringify({ principal: { role: "admin" }, pad: "x".repeat(40000) })); };
  assert.deepEqual((await ask(huge)).result, { outcome: "unsupported", detail: "invalid_response", status: 200 });

  for (const status of [401, 403]) {
    const refused = await ask(json(status, { error: { code: "invalid_api_key", message: BODY_MARKER }, principal: { role: "admin" } }));
    assert.deepEqual(refused.result, { outcome: "authentication_failed", status });
  }
  assert.deepEqual((await ask(json(404, { error: { message: BODY_MARKER } }))).result, { outcome: "unsupported", detail: "http_status", status: 404 });
  for (const status of [429, 500, 503]) assert.deepEqual((await ask(json(status, { principal: { role: "admin" } }))).result, { outcome: "offline", detail: "http_status", status });

  // A redirect is reported, not followed: the key is never sent to another address.
  const elsewhere = await fake(t, json(200, { principal: { role: "admin" } }));
  const redirected = await ask((_request, response) => { response.writeHead(302, { Location: elsewhere.url + "/capabilities" }); response.end(); });
  assert.deepEqual(redirected.result, { outcome: "unsupported", detail: "redirect", status: 302 });
  assert.equal(elsewhere.seen.length, 0);

  assert.deepEqual((await ask(() => { /* never answers */ }, { timeoutMs: 150 })).result, { outcome: "offline", detail: "timeout" });
  const closed = await fake(t, json(200, {})); const dead = closed.url.replace(/:\d+$/, ":1");
  assert.deepEqual(await probeRemoteAccess({ url: dead, apiKey: key, timeoutMs: 2000 }), { outcome: "offline", detail: "network" });
  await assert.rejects(probeRemoteAccess({ url: closed.url, apiKey: "  " }), /API key is required/);
  assert.equal(closed.seen.length, 0);
});

test("reader, writer and admin keys on a real server report their role, named capabilities and effective access", async (t) => {
  const s = await sandbox(t), h = await hosted(t, s.root);
  const expected = { reader: ["read"], writer: ["read", "write"], admin: ALL };
  const keys = {};
  for (const role of Object.keys(expected)) {
    const issued = keys[role] = await h.issue(`${role} laptop`, role);
    const { report, stdout } = await s.whoami(["--target-url", h.url], { JUMPYBRAIN_API_KEY: issued.token });
    assert.deepEqual(report.cli.target, { kind: "remote", source: "flag", url: h.url });
    assert.deepEqual(report.cli.access, { source: "server", role, capabilities: expected[role], capabilitiesFrom: "server", name: `${role} laptop`, credentialId: issued.id });
    for (const capability of ALL) {
      const granted = expected[role].includes(capability);
      assert.deepEqual(report.cli.effective[capability], { allowed: granted, blockedBy: granted ? [] : ["server_role"] }, `${role} ${capability}`);
    }
    assert.deepEqual(report.cli.credential.candidates[0], { source: "environment", found: true, used: true, variable: "JUMPYBRAIN_API_KEY", length: issued.token.length, last4: issued.token.slice(-4) });
    assert.deepEqual(report.app, { running: false });
    noSecret(stdout, issued.token);

    const text = await s.cliRun(["access", "whoami", "--remote-url", h.url + "/"], { JUMPYBRAIN_API_KEY: issued.token });
    assert.equal(text.code, 0); assert.equal(text.stderr, "");
    assert.match(text.stdout, new RegExp(`target: remote ${h.url} \\(flag\\)`));
    assert.match(text.stdout, new RegExp(`1\\. JUMPYBRAIN_API_KEY in the environment: found \\(${issued.token.length} chars, ends …${issued.token.slice(-4)}\\) — used`));
    assert.match(text.stdout, new RegExp(`server role: ${role} \\(${expected[role].join(", ")}\\) as "${role} laptop"`));
    assert.match(text.stdout, role === "reader" ? /effective: read yes; write no \(not in the server role\); manage access keys no \(not in the server role\)/
      : role === "writer" ? /effective: read yes; write yes; manage access keys no \(not in the server role\)/ : /effective: read yes; write yes; manage access keys yes/);
    assert.match(text.stdout, /Mac app \(its own selection; never the CLI target\):\n {2}not running/);
    noSecret(text.stdout, issued.token);
  }

  // A write refused for the role points at this check (the 401 explanation keeps its own status check).
  const refusedWrite = await s.cliRun(["index", "--target-url", h.url], { JUMPYBRAIN_API_KEY: keys.reader.token });
  assert.equal(refusedWrite.code, 1);
  assert.match(refusedWrite.stderr, new RegExp(`HTTP 403 read_only[\\s\\S]*See what this key may do: jumpybrain access whoami --target-url ${h.url}`));

  // The host's bootstrap key is an admin; its key-derived ID is not shown.
  const operator = await s.whoami(["--target-url", h.url], { JUMPYBRAIN_API_KEY: OPERATOR });
  assert.deepEqual(operator.report.cli.access, { source: "server", role: "admin", capabilities: ALL, capabilitiesFrom: "server", name: "Brain operator" });
  noSecret(operator.stdout, OPERATOR, "bootstrap:");

  // A revoked key is unconfirmed, with nothing claimed about what it could do.
  await h.admin.revoke(keys.writer.id);
  const revoked = await s.whoami(["--target-url", h.url], { JUMPYBRAIN_API_KEY: keys.writer.token });
  assert.deepEqual(revoked.report.cli.access, { source: "server", role: null, capabilities: [], reason: "authentication_failed", httpStatus: 401 });
  for (const capability of ALL) assert.deepEqual(revoked.report.cli.effective[capability], { allowed: null, blockedBy: ["unconfirmed"] });
  const revokedText = await s.cliRun(["access", "whoami", "--target-url", h.url], { JUMPYBRAIN_API_KEY: keys.writer.token });
  assert.match(revokedText.stdout, /server role: not confirmed: the server rejected the key \(HTTP 401\)/);
  assert.match(revokedText.stdout, /effective: read unknown \(server role not confirmed\); write unknown/);
  assert.doesNotMatch(revokedText.stdout, /reader|writer \(|Invalid API key/);
  noSecret(revoked.stdout + revokedText.stdout, keys.writer.token);
});

test("each key source is reported; a missing, unreadable or unsendable key sends nothing", async (t) => {
  const s = await sandbox(t);
  const server = await fake(t, json(200, { principal: { name: "Counted", role: "writer" }, capabilities: ["read", "write"] }));
  const target = ["--target-url", server.url];
  const unresolved = (report, detail) => {
    assert.deepEqual(report.cli.access, { source: "server", role: null, capabilities: [], reason: "credential_unavailable", detail });
    for (const capability of ALL) assert.deepEqual(report.cli.effective[capability], { allowed: null, blockedBy: ["unconfirmed"] });
  };

  // No key anywhere.
  const none = await s.whoami(target);
  assert.deepEqual(none.report.cli.credential, { resolved: false, usable: false, keyFile: "~/.config/jumpybrain/.env", candidates: [
    { source: "environment", found: false, used: false }, { source: "app-connection", found: false, used: false }, { source: "env-file", found: false, used: false }] });
  unresolved(none.report, "no_key");
  const noneText = (await s.cliRun(["access", "whoami", ...target])).stdout;
  assert.match(noneText, /1\. JUMPYBRAIN_API_KEY in the environment: not set\n.*2\. key the app saved for this URL in ~\/\.config\/jumpybrain\/\.env: not set\n.*3\. JUMPYBRAIN_API_KEY in ~\/\.config\/jumpybrain\/\.env: not set/);
  assert.match(noneText, /server role: not confirmed: no access key was found, so nothing was sent/);
  assert.match(noneText, /To set one: export JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app/);
  assert.doesNotMatch(noneText, /Keychain/i);

  // The app saved a key for this exact URL; the file's default key is found but not used.
  const appKey = "fake-app-saved-key-00000000000000AbCd", fileKey = "fake-file-default-key-000000000000WxYz", envKey = "fake-exported-key-00000000000000000QrSt";
  assert.equal(server.seen.length, 0, "nothing was sent while no key was found");
  await s.keyFile(`JUMPYBRAIN_API_KEY=${fileKey}\nJUMPYBRAIN_KEY_${APP_UUID}=${appKey}\nJUMPYBRAIN_URL_${APP_UUID}=${server.url}\n`);
  const saved = await s.whoami(target);
  assert.deepEqual(saved.report.cli.credential.candidates, [
    { source: "environment", found: false, used: false },
    { source: "app-connection", found: true, used: true, variable: `JUMPYBRAIN_KEY_${APP_UUID}`, file: "~/.config/jumpybrain/.env", length: appKey.length, last4: "AbCd" },
    { source: "env-file", found: true, used: false, variable: "JUMPYBRAIN_API_KEY", file: "~/.config/jumpybrain/.env", length: fileKey.length, last4: "WxYz", sameKeyAsUsed: false }]);
  assert.equal(saved.report.cli.access.role, "writer"); assert.equal(saved.report.cli.access.name, "Counted");
  assert.deepEqual(server.seen.map(entry => entry.authorization), ["Bearer " + appKey]);

  // The environment wins over both; the others are listed as not used.
  const exported = await s.cliRun(["access", "whoami", ...target], { JUMPYBRAIN_API_KEY: envKey });
  assert.match(exported.stdout, /1\. JUMPYBRAIN_API_KEY in the environment: found \(39 chars, ends …QrSt\) — used/);
  assert.match(exported.stdout, new RegExp(`2\\. key the app saved for this URL in ~/\\.config/jumpybrain/\\.env: found \\(37 chars, ends …AbCd, JUMPYBRAIN_KEY_${APP_UUID}\\) — not used`));
  assert.match(exported.stdout, /3\. JUMPYBRAIN_API_KEY in ~\/\.config\/jumpybrain\/\.env: found \(38 chars, ends …WxYz\) — not used/);
  assert.equal(server.seen.at(-1).authorization, "Bearer " + envKey);
  noSecret(saved.stdout + exported.stdout, appKey, fileKey, envKey);

  // A connection that refers to the file's JUMPYBRAIN_API_KEY is that same key, shown in both places.
  await s.keyFile(`JUMPYBRAIN_API_KEY=${fileKey}\nJUMPYBRAIN_KEYREF_${APP_UUID}=JUMPYBRAIN_API_KEY\nJUMPYBRAIN_URL_${APP_UUID}=${server.url}\n`);
  const referenced = (await s.whoami(target)).report.cli.credential.candidates;
  assert.deepEqual(referenced.map(slot => [slot.source, slot.found, slot.used, slot.variable]), [
    ["environment", false, false, undefined], ["app-connection", true, true, "JUMPYBRAIN_API_KEY"], ["env-file", true, true, "JUMPYBRAIN_API_KEY"]]);

  // A key file other users can read is refused: nothing is sent, and its content is never quoted.
  let sent = server.seen.length;
  await s.keyFile(`JUMPYBRAIN_API_KEY=${fileKey}\n`, 0o644);
  const insecure = await s.whoami(target);
  unresolved(insecure.report, "key_file_problem");
  assert.equal(insecure.report.cli.credential.fileProblemCode, "credential_file_insecure");
  assert.match(insecure.report.cli.credential.fileProblem, /must be private to you\. Run: chmod 600 ~\/\.config\/jumpybrain\/\.env/);
  assert.deepEqual(insecure.report.cli.credential.candidates.map(slot => slot.found), [false, null, null], "file slots are not checked, not 'not set'");
  const insecureText = (await s.cliRun(["access", "whoami", ...target])).stdout;
  assert.match(insecureText, /2\. key the app saved for this URL in ~\/\.config\/jumpybrain\/\.env: not checked/);
  assert.match(insecureText, /Not checked: .*chmod 600/);
  assert.match(insecureText, /server role: not confirmed: the key file could not be used, so nothing was sent/);
  assert.equal(server.seen.length, sent, "nothing was sent with an insecure key file");
  noSecret(insecure.stdout + insecureText, fileKey);

  // An exported key still works beside an insecure file, which is reported as not checked.
  const beside = await s.whoami(target, { JUMPYBRAIN_API_KEY: envKey });
  assert.equal(beside.report.cli.access.role, "writer");
  assert.equal(beside.report.cli.credential.fileProblemCode, "credential_file_insecure");
  assert.equal(server.seen.length, sent + 1);

  // A key that cannot be put in a header is never sent.
  sent = server.seen.length;
  const quoted = "“fake-smart-quoted-key-0000000000”";
  const unsendable = await s.whoami(target, { JUMPYBRAIN_API_KEY: quoted });
  unresolved(unsendable.report, "invalid_characters");
  assert.equal(unsendable.report.cli.credential.resolved, true); assert.equal(unsendable.report.cli.credential.usable, false);
  assert.match(unsendable.report.cli.credential.problem, /smart quotes or a line break/);
  assert.equal(server.seen.length, sent);
  noSecret(unsendable.stdout, "fake-smart-quoted-key");
});

test("an older, unknown or malformed server answer never reports a write the role was not confirmed to have", async (t) => {
  const s = await sandbox(t), env = { JUMPYBRAIN_API_KEY: "fake-legacy-probe-key-0000000000" };
  const check = async (reply) => { const server = await fake(t, reply); return { ...await s.whoami(["--target-url", server.url], env), text: (await s.cliRun(["access", "whoami", "--target-url", server.url], env)).stdout }; };
  const unknown = (result, detail, extra = {}) => {
    assert.deepEqual(result.report.cli.access, { source: "server", role: null, capabilities: [], reason: "unsupported", detail, ...extra });
    for (const capability of ALL) assert.equal(result.report.cli.effective[capability].allowed, null);
    assert.doesNotMatch(result.text, /write yes|read yes|manage access keys yes/);
    noSecret(result.stdout + result.text, BODY_MARKER, env.JUMPYBRAIN_API_KEY);
  };

  // An older server sends only principal.role: the known fixed set is derived and labelled.
  const legacy = await check(json(200, { protocol: 2, principal: { id: "x", name: "Old server key", role: "writer" } }));
  assert.deepEqual(legacy.report.cli.access, { source: "server", role: "writer", capabilities: ["read", "write"], capabilitiesFrom: "role", name: "Old server key" });
  assert.match(legacy.text, /server role: writer \(read, write\) as "Old server key"; derived from the role, this server does not list capabilities/);

  unknown(await check(json(200, { principal: { name: BODY_MARKER, role: "owner" }, capabilities: ALL })), "unknown_role", { httpStatus: 200 });
  unknown(await check(json(200, { principal: { role: "writer" }, capabilities: "read,write" })), "malformed_capabilities");
  unknown(await check((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(`<html>${BODY_MARKER}</html>`); }), "invalid_response", { httpStatus: 200 });
  unknown(await check(json(404, { error: { code: "not_found", message: BODY_MARKER } })), "http_status", { httpStatus: 404 });

  // A list that claims more than the confirmed role is cut back to that role's fixed set.
  const inflated = await check(json(200, { principal: { role: "reader" }, capabilities: ["read", "write", "manage_access", "launch_rockets"] }));
  assert.deepEqual(inflated.report.cli.access, { source: "server", role: "reader", capabilities: ["read"], capabilitiesFrom: "server" });
  assert.deepEqual(inflated.report.cli.effective.write, { allowed: false, blockedBy: ["server_role"] });
  assert.match(inflated.report.notes.join("\n"), /capabilities this CLI does not recognize for the reader role; they are not counted/);
  // A list that states less than the role is believed.
  const reduced = await check(json(200, { principal: { role: "admin" }, capabilities: ["read"] }));
  assert.deepEqual(reduced.report.cli.access.capabilities, ["read"]);
  assert.equal(reduced.report.cli.effective.write.allowed, false);

  // Refusals and outages show a fixed explanation, never the response body.
  const rejected = await check(json(401, { error: { code: "invalid_api_key", message: BODY_MARKER } }));
  assert.deepEqual(rejected.report.cli.access, { source: "server", role: null, capabilities: [], reason: "authentication_failed", httpStatus: 401 });
  const down = await check(json(503, { error: { message: BODY_MARKER } }));
  assert.deepEqual(down.report.cli.access, { source: "server", role: null, capabilities: [], reason: "offline", detail: "http_status", httpStatus: 503 });
  assert.match(down.text, /server role: not confirmed: the server could not be reached \(HTTP 503\)/);
  noSecret(rejected.stdout + rejected.text + down.stdout + down.text, BODY_MARKER);
});

test("local read-only guards are reported apart from the server role, and never stop the diagnostic", async (t) => {
  const s = await sandbox(t), h = await hosted(t, s.root);
  const writer = await h.issue("Guarded laptop", "writer");
  const env = { JUMPYBRAIN_API_KEY: writer.token }, target = ["--target-url", h.url];
  for (const words of [["access", "whoami"], ["access", "list"]]) {
    assert.equal(isObservationalInvocation({ _: words }), true); assert.equal(isReadInvocation({ _: words }), true);
  }
  assert.equal(isObservationalInvocation({ _: ["access", "issue"] }), false);

  // Read-only command mode from the environment: the role still says writer, the device blocks changes.
  const forced = await s.whoami(target, { ...env, JUMPYBRAIN_READ_ONLY_COMMANDS: "1" });
  assert.equal(forced.report.cli.access.role, "writer");
  assert.deepEqual(forced.report.cli.restrictions, { commandMode: { state: "read-only", source: "environment" }, originPolicy: { state: "off", origin: h.url }, policyFile: { path: s.policyFile, state: "absent" } });
  assert.deepEqual(forced.report.cli.effective, { read: { allowed: true, blockedBy: [] }, write: { allowed: false, blockedBy: ["command_mode"] }, manage_access: { allowed: false, blockedBy: ["command_mode", "server_role"] } });
  const forcedText = (await s.cliRun(["access", "whoami", ...target], { ...env, JUMPYBRAIN_READ_ONLY_COMMANDS: "true" })).stdout;
  assert.match(forcedText, /server role: writer \(read, write\)/);
  assert.match(forcedText, /this device: read-only command mode ON \(JUMPYBRAIN_READ_ONLY_COMMANDS\); state-changing commands are blocked for every target; this server is not marked read-only on this device/);
  assert.match(forcedText, /effective: read yes; write no \(read-only command mode on this device\)/);
  // The same mode really does stop a write before the key is read, while the diagnostic keeps working.
  const blocked = await s.cliRun(["index", ...target], { ...env, JUMPYBRAIN_READ_ONLY_COMMANDS: "1" });
  assert.equal(blocked.code, 1); assert.match(blocked.stderr, /JUMPYBRAIN_READ_ONLY_COMMANDS/);

  // The same mode from the device policy file, plus this origin marked read-only.
  await writeFile(s.policyFile, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: h.url, access: "read-only" }], commands: "read-only" }));
  const configured = await s.whoami(target, env);
  assert.deepEqual(configured.report.cli.restrictions, { commandMode: { state: "read-only", source: "policy-file" }, originPolicy: { state: "read-only", origin: h.url }, policyFile: { path: s.policyFile, state: "ok" } });
  assert.deepEqual(configured.report.cli.effective.write, { allowed: false, blockedBy: ["command_mode", "origin_policy"] });
  assert.equal(configured.report.cli.effective.read.allowed, true);

  // Only the per-origin policy: this server is read-only here, another server is not.
  await writeFile(s.policyFile, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: h.url, access: "read-only" }] }));
  const origin = await s.whoami(target, env);
  assert.deepEqual(origin.report.cli.restrictions.commandMode, { state: "off" });
  assert.deepEqual(origin.report.cli.effective.write, { allowed: false, blockedBy: ["origin_policy"] });
  assert.match((await s.cliRun(["access", "whoami", ...target], env)).stdout, new RegExp(`read-only command mode off; ${h.url} is marked read-only on this device`));
  const refused = await s.cliRun(["access", "issue", "--name", "Eve", ...target], env);
  assert.equal(refused.code, 1); assert.match(refused.stderr, /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/);
  const other = await fake(t, json(200, { principal: { role: "writer" }, capabilities: ["read", "write"] }));
  assert.deepEqual((await s.whoami(["--target-url", other.url], env)).report.cli.effective.write, { allowed: true, blockedBy: [] });

  // A broken policy file stops ordinary remote commands; the diagnostic reports it without quoting its content.
  await writeFile(s.policyFile, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: "https://someone:hunter2-fake@memory.example", access: "read-only" }] }));
  assert.equal((await s.cliRun(["status", ...target], env)).code, 1, "an ordinary remote read fails closed");
  const broken = await s.whoami(target, env);
  assert.equal(broken.report.cli.access.role, "writer", "the role is still checked and shown");
  assert.deepEqual(broken.report.cli.restrictions, { commandMode: { state: "invalid" }, originPolicy: { state: "invalid", origin: h.url }, policyFile: { path: s.policyFile, state: "invalid" } });
  for (const capability of ALL) assert.equal(broken.report.cli.effective[capability].allowed, false);
  assert.deepEqual(broken.report.cli.effective.read.blockedBy, ["policy_invalid"]);
  const brokenText = (await s.cliRun(["access", "whoami", ...target], env)).stdout;
  assert.match(brokenText, /the CLI policy at .*cli-config\.json is not valid; repair or remove it/);
  noSecret(broken.stdout + brokenText, "hunter2-fake", writer.token);

  // A bad variable value fails state-changing commands closed and is named.
  await rm(s.policyFile);
  const bad = await s.whoami(target, { ...env, JUMPYBRAIN_READ_ONLY_COMMANDS: "yes" });
  assert.deepEqual(bad.report.cli.restrictions.commandMode, { state: "invalid" });
  assert.deepEqual([bad.report.cli.effective.read.allowed, bad.report.cli.effective.write], [true, { allowed: false, blockedBy: ["policy_invalid"] }]);
});

test("a local target needs no key, is never started or changed, and no target is reported as none", async (t) => {
  const s = await sandbox(t);
  const brain = path.join(s.root, "local brain"); await mkdir(brain); await initializeMemoryRoot(brain);
  const before = await listing(brain);
  const local = await s.whoami(["--root", brain]);
  assert.deepEqual(local.report.cli.target, { kind: "local", source: "flag", root: brain, state: "available" });
  assert.equal(local.report.cli.credential, undefined);
  assert.deepEqual(local.report.cli.access, { source: "local", role: "admin", capabilities: ALL });
  assert.deepEqual(local.report.cli.restrictions.originPolicy, { state: "not-applicable" });
  for (const capability of ALL) assert.deepEqual(local.report.cli.effective[capability], { allowed: true, blockedBy: [] });
  const text = (await s.cliRun(["access", "whoami"], { JUMPYBRAIN_MEMORY_ROOT: brain, JUMPYBRAIN_READ_ONLY_COMMANDS: "1" })).stdout;
  assert.match(text, /target: local .*local brain \(environment\)\n {2}key: none needed for a local folder\n {2}access: local folder: no server role; whoever can change its files has full access/);
  assert.match(text, /effective: read yes; write no \(read-only command mode on this device\); manage access keys no \(read-only command mode on this device\)/);
  assert.deepEqual(await listing(brain), before, "no backend descriptor, index or other file was created");

  const missing = await s.whoami(["--root", path.join(s.root, "absent")]);
  assert.equal(missing.report.cli.target.state, "missing");
  assert.deepEqual(missing.report.cli.access, { source: "local", role: null, capabilities: [], reason: "folder_unavailable", detail: "missing" });
  assert.deepEqual(missing.report.cli.effective.write, { allowed: false, blockedBy: ["folder_unavailable"] });
  const plain = path.join(s.root, "plain"); await mkdir(plain);
  assert.equal((await s.whoami(["--root", plain])).report.cli.target.state, "not_initialized");
  assert.deepEqual(await readdir(plain), [], "an uninitialized folder is not initialized by the check");

  const none = await s.whoami();
  assert.equal(none.report.cli.target.kind, "none"); assert.equal(none.report.cli.access, null); assert.equal(none.report.cli.effective, null);
  assert.match(none.report.cli.target.message, /No brain is selected for CLI commands here\. Pass --root <memory-root> or --target-url <url>/);
  assert.match((await s.cliRun(["access", "whoami"])).stdout, /target: none\. No brain is selected/);
});

test("strict arguments, help and URL handling", async (t) => {
  const s = await sandbox(t);
  for (const argv of [["--name", "x"], ["--id", "x"], ["--role", "admin"], ["extra"], ["--json=true"], ["--root"], ["--target-url", "https://a.example", "--target-url", "https://b.example"], ["--directory"]]) {
    assert.throws(() => parseArgs(["access", "whoami", ...argv]), argv.join(" "));
  }
  assert.deepEqual(parseArgs(["access", "whoami", "--target-url=https://a.example", "--directory", "/x", "--json"]), { _: ["access", "whoami"], "target-url": "https://a.example", directory: "/x", json: true });
  const both = await s.cliRun(["access", "whoami", "--root", s.root, "--target-url", "https://a.example"]);
  assert.equal(both.code, 1); assert.match(both.stderr, /Use only one target selector/);

  // A URL carrying a password is refused without repeating it, and nothing is sent.
  const server = await fake(t, json(200, { principal: { role: "admin" } }));
  const embedded = await s.cliRun(["access", "whoami", "--target-url", server.url.replace("http://", "http://someone:hunter2-fake@")], { JUMPYBRAIN_API_KEY: "fake-url-test-key-000000" });
  assert.equal(embedded.code, 1); assert.match(embedded.stderr, /must not contain a user name or password/);
  noSecret(embedded.stdout + embedded.stderr, "hunter2-fake"); assert.equal(server.seen.length, 0);
  for (const value of ["ftp://memory.example", "not a url"]) {
    const invalid = await s.cliRun(["access", "whoami", "--target-url", value]);
    assert.equal(invalid.code, 1); assert.match(invalid.stderr, /must be an HTTP\(S\) URL/);
  }
  // A query string is not part of the target and is neither shown nor sent.
  const query = await s.whoami(["--target-url", server.url + "/?token=query-secret-fake"], { JUMPYBRAIN_API_KEY: "fake-url-test-key-000000" });
  assert.equal(query.report.cli.target.url, server.url); noSecret(query.stdout, "query-secret-fake");
  assert.deepEqual(server.seen.map(entry => entry.url), ["/capabilities"]);

  for (const argv of [["access", "whoami", "--help"], ["help", "access", "whoami"], ["access", "whoami", "--target-url", "--help"]]) {
    const help = await s.cliRun(argv);
    assert.match(help.stdout, /^Usage: jumpybrain access whoami \[--root <memory-root> \| --target-url <url>\] \[--directory <support-directory>\] \[--json\]\n/);
    assert.match(help.stdout, /never the key/);
  }
  const family = (await s.cliRun(["access", "--help"])).stdout;
  assert.match(family, /^Usage: jumpybrain access <whoami\|issue\|list\|revoke>/); assert.match(family, / {2}whoami: Read-only check/);
  assert.match((await s.cliRun(["access", "list", "--help"])).stdout, /^Usage: jumpybrain access list \(--root <memory-root> \| --target-url <url>\) \[--json\]\n/);
  assert.doesNotMatch((await s.cliRun(["connections", "--help"])).stdout, /allow-writes/);
});

test("the Mac app's own selection and role are shown beside the CLI's, without its control token", async (t) => {
  const s = await sandbox(t), h = await hosted(t, s.root);
  const reader = await h.issue("App reader", "reader"), writer = await h.issue("CLI writer", "writer");
  const support = path.join(s.root, "support"); await mkdir(support, { mode: 0o700 });
  const brain = path.join(s.root, "app brain"); await mkdir(brain); await initializeMemoryRoot(brain);
  const dir = ["--directory", support];

  // App closed: the CLI side is complete and the app is simply not running.
  const closed = await s.whoami(["--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token });
  assert.equal(closed.report.cli.access.role, "writer"); assert.deepEqual(closed.report.app, { running: false });
  assert.deepEqual(await readdir(support), [], "nothing is written into the app's folder");

  const stored = new Map();
  const gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: brain, port: 0, controlKey: CONTROL,
    credentials: { get: async ref => stored.get(ref), set: async (ref, value) => stored.set(ref, value), delete: async ref => stored.delete(ref) },
    identityFile: path.join(s.root, "identity.json"), switchTimeoutMs: 2000, localFactory: async () => ({ url: "http://127.0.0.1:1", close: async () => {} }) });
  t.after(() => gateway.close());
  await writeFile(path.join(support, "api-key"), CONTROL, { mode: 0o600 });
  const native = (route, body) => fetch(gateway.url + route, { method: "POST", headers: { Authorization: "Bearer " + CONTROL, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // The running gateway asynchronously records diagnostics for startup and requests.
  const appFiles = async () => {
    const files = (await listing(support)).filter(file => file !== "diagnostics" && !file.startsWith(`diagnostics${path.sep}`));
    return Promise.all(files.map(async file => [file, await readFile(path.join(support, file))]));
  };
  const beforeLocalChecks = await appFiles();

  // The app has a local folder selected; the CLI has no target of its own.
  const untargeted = await s.whoami(dir);
  assert.equal(untargeted.report.cli.target.kind, "none");
  assert.equal(untargeted.report.app.running, true);
  assert.deepEqual([untargeted.report.app.selected.kind, untargeted.report.app.selected.root], ["local", brain]);
  assert.deepEqual(untargeted.report.app.access, { source: "local", role: "admin", capabilities: ALL });
  assert.equal(untargeted.report.app.matchesCliTarget, null);
  assert.match(untargeted.report.notes.join("\n"), /The app's selection does not select a brain for CLI commands.*jumpybrain access whoami --root/);

  // Same local folder for both: a match, and no note.
  const same = await s.whoami(["--root", brain, ...dir]);
  assert.equal(same.report.app.matchesCliTarget, true); assert.deepEqual(same.report.notes, []);
  assert.deepEqual(await appFiles(), beforeLocalChecks, "checking local access preserves app configuration");

  // The app selects the server with a reader key; the CLI sends a writer key to the same server.
  const saved = await gateway.store.save({ name: "Team", kind: "remote", url: h.url, key: reader.token }, gateway.store.snapshot().revision);
  const profile = saved.profiles.find(item => item.kind === "remote");
  assert.equal((await native("/companion/switch", { id: profile.id })).status, 200);
  const beforeRemoteChecks = await appFiles();
  const mixed = await s.whoami(["--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token });
  assert.deepEqual(mixed.report.app, { running: true, selected: { kind: "remote", id: profile.id, name: "Team", url: h.url }, health: "connected",
    access: { source: "server", role: "reader", capabilities: ["read"], name: "App reader" }, matchesCliTarget: true });
  assert.deepEqual(mixed.report.cli.access, { source: "server", role: "writer", capabilities: ["read", "write"], capabilitiesFrom: "server", name: "CLI writer", credentialId: writer.id });
  assert.match(mixed.report.notes.join("\n"), /different access \(app: reader, CLI: writer\)\. Each uses its own key/);
  const mixedText = (await s.cliRun(["access", "whoami", "--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token })).stdout;
  assert.match(mixedText, /server role: writer \(read, write\) as "CLI writer"/);
  assert.match(mixedText, new RegExp(`Mac app \\(its own selection; never the CLI target\\):\\n {2}selected: Team \\[remote\\] ${h.url}; connected\\n {2}server role: reader \\(read\\) as "App reader"`));
  assert.match(mixedText, /^Note: The app and the CLI reach this brain with different access/m);

  // The CLI points elsewhere: the app's selection is shown but never becomes the CLI target.
  const elsewhere = await s.whoami(["--root", brain, ...dir]);
  assert.equal(elsewhere.report.cli.target.kind, "local"); assert.equal(elsewhere.report.app.matchesCliTarget, false);
  assert.match(elsewhere.report.notes.join("\n"), /different brains\. Selecting a connection in the app never changes the CLI target/);

  // The app's key is revoked: its role becomes unconfirmed with the app's reason, never reader.
  await h.admin.revoke(reader.id);
  await new Promise(resolve => setTimeout(resolve, 2100)); // the app re-checks health at most every two seconds
  const revoked = await s.whoami(["--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token });
  assert.deepEqual([revoked.report.app.health, revoked.report.app.access], ["authentication_failed", { source: "server", role: null, capabilities: [], reason: "authentication_failed" }]);
  const revokedText = (await s.cliRun(["access", "whoami", "--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token })).stdout;
  assert.match(revokedText, /selected: Team \[remote\] .*; authentication_failed\n {2}server role: not confirmed: the server rejected the key/);

  const everything = [untargeted, same, mixed, elsewhere, revoked].map(result => result.stdout).join("\n") + mixedText + revokedText;
  noSecret(everything, CONTROL, reader.token, writer.token, profile.credentialRef);
  assert.deepEqual(await appFiles(), beforeRemoteChecks, "checking remote access preserves app configuration");
  assert.equal(gateway.store.snapshot().activeId, profile.id, "and no selection");

  // A control file other users can read is not trusted, and no error text from it is shown.
  await chmod(path.join(support, "api-key"), 0o644);
  const unsafe = await s.whoami(["--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token });
  assert.deepEqual(unsafe.report.app, { running: "unknown", problem: "The app's private control files could not be read safely. Restart the app, then retry." });
  assert.equal(unsafe.report.cli.access.role, "writer", "the CLI side does not depend on the app");
  await chmod(path.join(support, "api-key"), 0o600);

  // A wrong control token is refused by the app; only the status is reported.
  await writeFile(path.join(support, "api-key"), "d".repeat(64), { mode: 0o600 });
  const refused = await s.whoami(dir);
  assert.deepEqual(refused.report.app, { running: "unknown", problem: "The app refused its control request (HTTP 401). Restart the app, then retry." });
  noSecret(refused.stdout, "d".repeat(64));

  // After the app quits, its selection is no longer reported.
  await gateway.close();
  assert.deepEqual((await s.whoami(dir)).report.app, { running: false });

  // A leftover descriptor for a live process that no longer answers is "unknown", with a fixed explanation.
  await writeFile(path.join(support, "extensions-control.json"), JSON.stringify({ version: 1, directory: support, origin: "http://127.0.0.1:1", pid: process.pid }), { mode: 0o600 });
  const silent = await s.whoami(["--target-url", h.url, ...dir], { JUMPYBRAIN_API_KEY: writer.token });
  assert.deepEqual(silent.report.app, { running: "unknown", problem: "The app did not answer its control request. It may be starting or stopping; retry." });
  assert.equal(silent.report.cli.access.role, "writer");
  assert.match((await s.cliRun(["access", "whoami", ...dir])).stdout, /Mac app \(its own selection; never the CLI target\):\n {2}unknown: The app did not answer its control request/);
});
