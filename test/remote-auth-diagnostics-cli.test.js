import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { createRemoteAccessClient } from "../dist/adapters/http-client/access.js";

// Remote auth failures must say which key the CLI sent (source + fingerprint),
// which other keys it could have used, the precedence and how to recover,
// without ever printing a key. All keys here are disposable fakes.
const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const OPERATOR = "fake-operator-key-for-auth-diagnostics-0001";
const STALE = "jb_FAKEstaleKEYexportedInZshenv0000000000000wXyZ";
const APP_UUID = "AAAAAAAA_AAAA_4AAA_8AAA_AAAAAAAAAAAA";

async function hosted(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-auth-diagnostics-")));
  const brain = path.join(root, "brain"); await mkdir(brain); await initializeMemoryRoot(brain);
  const server = await startJumpyBrainHttpServer({ root: brain, apiKeys: [OPERATOR], port: 0, autoIndex: false });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  const envFile = path.join(root, "home", ".config", "jumpybrain", ".env");
  const cliRun = async (args, env = {}) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [cli, ...args], {
        env: { PATH: process.env.PATH, HOME: path.join(root, "home"), JUMPYBRAIN_ENV_FILE: envFile, JUMPYBRAIN_CLI_CONFIG: path.join(root, "absent-cli-config.json"), ...env },
      });
      return { code: 0, stdout, stderr };
    } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  return { root, server, envFile, cliRun };
}

const noSecret = (text, ...keys) => { for (const key of keys) assert.equal(text.includes(key), false, "a key leaked into CLI output"); };

test("a stale exported key names its source, the shadowed app key, precedence and recovery", async (t) => {
  const { server, envFile, cliRun } = await hosted(t);
  const admin = createRemoteAccessClient({ url: server.url, apiKey: OPERATOR });
  const writer = (await admin.issue({ name: "Laptop", role: "writer" })).token;
  await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
  await writeFile(envFile, `JUMPYBRAIN_KEY_${APP_UUID}=${writer}\nJUMPYBRAIN_URL_${APP_UUID}=${server.url}\n`, { mode: 0o600 });

  const failed = await cliRun(["status", "--target-url", server.url], { JUMPYBRAIN_API_KEY: STALE });
  assert.equal(failed.code, 1); assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /rejected the access key \(HTTP 401 invalid_api_key\)/);
  assert.match(failed.stderr, /Key used: JUMPYBRAIN_API_KEY from the environment \(48 chars, ends …wXyZ\)/);
  assert.match(failed.stderr, new RegExp(`Not used: the key the jumpyBrain app saved for this URL, JUMPYBRAIN_KEY_${APP_UUID} in .*\\.env \\(46 chars, ends …${writer.slice(-4)}\\)`));
  assert.match(failed.stderr, /Key order: JUMPYBRAIN_API_KEY in the environment, then the key the jumpyBrain app saved/);
  assert.match(failed.stderr, /ask the server admin for a valid key .*jumpybrain access issue/);
  assert.match(failed.stderr, /~\/\.zshenv.*or unset it/);
  assert.match(failed.stderr, new RegExp(`Check with: jumpybrain status --target-url ${server.url}`));
  noSecret(failed.stderr, STALE, writer);

  // Following the advice (unset the stale export) uses the app key, and status says so.
  const fixed = await cliRun(["status", "--target-url", server.url]);
  assert.equal(fixed.code, 0, fixed.stderr);
  assert.match(fixed.stdout, new RegExp(`Access key: the key the jumpyBrain app saved for this URL, JUMPYBRAIN_KEY_${APP_UUID} .*\\(46 chars, ends …${writer.slice(-4)}\\), accepted`));
  const json = JSON.parse((await cliRun(["status", "--target-url", server.url, "--json"])).stdout);
  assert.deepEqual(json.target.credential, { source: "app-connection", variable: `JUMPYBRAIN_KEY_${APP_UUID}`, file: envFile.replace(path.dirname(path.dirname(path.dirname(envFile))), "~"), length: 46, last4: writer.slice(-4) });
  noSecret(fixed.stdout + JSON.stringify(json), writer);
});

test("revoked, reader, missing and unsendable keys each explain themselves without the key", async (t) => {
  const { server, cliRun } = await hosted(t);
  const admin = createRemoteAccessClient({ url: server.url, apiKey: OPERATOR });
  const issued = await admin.issue({ name: "Old laptop", role: "writer" });
  await admin.revoke(issued.credential.id);
  const reader = (await admin.issue({ name: "Reviewer", role: "reader" })).token;

  const revoked = await cliRun(["recall", "--target-url", server.url, "--topic", "x"], { JUMPYBRAIN_API_KEY: issued.token });
  assert.match(revoked.stderr, /HTTP 401 invalid_api_key\)\. The server does not recognize it: it may be mistyped, revoked/);
  assert.match(revoked.stderr, new RegExp(`Key used: JUMPYBRAIN_API_KEY from the environment \\(46 chars, ends …${issued.token.slice(-4)}\\)`));
  assert.doesNotMatch(revoked.stderr, /Not used/);
  noSecret(revoked.stderr, issued.token);

  const write = await cliRun(["index", "--target-url", server.url], { JUMPYBRAIN_API_KEY: reader });
  assert.match(write.stderr, /accepted the access key, but it does not allow this command \(HTTP 403 read_only\): it grants reader access only/);
  assert.match(write.stderr, /ask the server admin for a writer key/);
  assert.doesNotMatch(write.stderr, /Check with/, "status would succeed with a reader key, so it is not offered as the check");
  const listing = await cliRun(["access", "list", "--target-url", server.url], { JUMPYBRAIN_API_KEY: reader });
  assert.match(listing.stderr, /HTTP 403 admin_required\): it needs an admin key/);
  assert.match(listing.stderr, /ask the server admin for an admin key/);
  noSecret(write.stderr + listing.stderr, reader);

  const missing = await cliRun(["status", "--target-url", server.url]);
  assert.match(missing.stderr, /^No access key for .*Set JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app .*jumpybrain access issue/);

  const quoted = await cliRun(["status", "--target-url", server.url], { JUMPYBRAIN_API_KEY: `'${OPERATOR}'` });
  assert.match(quoted.stderr, /The key contains quote marks or spaces/);
  const smart = await cliRun(["status", "--target-url", server.url], { JUMPYBRAIN_API_KEY: `“${OPERATOR}”` });
  assert.match(smart.stderr, /^Cannot send JUMPYBRAIN_API_KEY from the environment \(45 chars, ends …001”\): it contains characters an access key cannot have, such as smart quotes/);
  assert.doesNotMatch(smart.stderr, /ByteString/);
  noSecret(quoted.stderr + smart.stderr, OPERATOR);
});

test("live collaboration reports a rejected key like HTTP, not as a lost connection", async (t) => {
  const { server, cliRun } = await hosted(t);
  const failed = await cliRun(["collaborate", "open", "--target-url", server.url, "--id", "mem_00000000-0000-4000-8000-000000000001"], { JUMPYBRAIN_API_KEY: STALE });
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /rejected the access key \(HTTP 401 invalid_api_key\)/);
  assert.match(failed.stderr, /Key used: JUMPYBRAIN_API_KEY from the environment \(48 chars, ends …wXyZ\)/);
  assert.doesNotMatch(failed.stderr, /Connection lost/);
  noSecret(failed.stderr, STALE);
});
