import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  processAlive, runProcess, runUpdate, updateEnvironment, validateRequest, waitForExit,
} from "../integrations/macos-companion/menu-update.mjs";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-menu-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "support handoff");
  await mkdir(directory);
  const request = {
    parentPid: process.pid,
    installRoot: path.join(root, `custom 'install' "root"`),
    appPath: path.join(root, `Applications/jumpy 'Brain' "test".app`),
    home: path.join(root, `home 'quoted' "space"`),
    node: path.join(root, `node 'tools' "bin"/node`),
    qmd: path.join(root, `qmd 'tools' "bin"/qmd`),
  };
  const requestPath = path.join(directory, "request.json");
  await writeFile(requestPath, JSON.stringify(request));
  for (const name of ["update.command", "menu-update.mjs"]) {
    await writeFile(path.join(directory, name), "inert fixture, never executed\n");
  }
  return { root, directory, request, requestPath };
}

async function assertFinished(f, status, message, extra = []) {
  assert.deepEqual((await readdir(f.directory)).sort(), [...extra, "claimed", "result.json", "update.log"].sort());
  assert.deepEqual(JSON.parse(await readFile(path.join(f.directory, "result.json"), "utf8")), { status });
  assert.match(await readFile(path.join(f.directory, "update.log"), "utf8"), message);
  if (process.platform !== "win32") {
    for (const name of ["result.json", "update.log"]) {
      assert.equal((await stat(path.join(f.directory, name))).mode & 0o777, 0o600);
    }
    assert.equal((await stat(path.join(f.directory, "claimed"))).mode & 0o777, 0o700);
  }
}

test("request validation accepts quoted absolute paths and rejects unsafe PIDs and paths", async (t) => {
  const f = await fixture(t);
  assert.equal(validateRequest(f.request, f.directory), f.request);
  for (const value of [null, [], {}, "invalid"]) {
    assert.throws(() => validateRequest(value, f.directory), /Invalid companion PID/);
  }
  for (const parentPid of [undefined, null, "123", 0, 1, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateRequest({ ...f.request, parentPid }, f.directory), /Invalid companion PID/);
  }
  for (const key of ["installRoot", "appPath", "home", "node", "qmd"]) {
    for (const value of [undefined, null, 123, {}, "", "relative/path", "/bad\0path", "/bad\npath", "/bad\tpath", "/bad\x1fpath"]) {
      assert.throws(() => validateRequest({ ...f.request, [key]: value }, f.directory), new RegExp(`Invalid ${key}`));
    }
  }
});

test("handoff must be outside both replaced trees, but sibling prefix paths are valid", async (t) => {
  const f = await fixture(t);
  for (const replaced of [path.join(f.request.installRoot, "app"), f.request.appPath]) {
    for (const directory of [replaced, path.join(replaced, "nested/handoff"), path.join(replaced, "nested/../handoff")]) {
      assert.throws(() => validateRequest(f.request, directory), /overlaps a replacement path/);
    }
    assert.equal(validateRequest(f.request, `${replaced}-handoff`), f.request);
  }
});

test("update environment is an explicit noninteractive allowlist with no inherited secrets", async (t) => {
  const f = await fixture(t);
  const poisoned = {
    AWS_SECRET_ACCESS_KEY: "fixture-secret", GITHUB_TOKEN: "fixture-token", NODE_OPTIONS: "--inspect",
    SSH_AUTH_SOCK: "/fixture/socket", GIT_CONFIG_GLOBAL: "/fixture/config", HTTPS_PROXY: "http://fixture.invalid",
    JUMPYBRAIN_API_KEY: "fixture-api-key", JUMPYBRAIN_CLI_CONFIG: "/wrong/config", PATH: "/wrong/bin",
  };
  const previous = Object.fromEntries(Object.keys(poisoned).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, poisoned);
    assert.deepEqual(updateEnvironment(f.request), {
      HOME: f.request.home,
      PATH: `${path.dirname(f.request.node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      LANG: "en_US.UTF-8",
      JUMPYBRAIN_QMD_BIN: f.request.qmd,
      JUMPYBRAIN_CLI_CONFIG: path.join(f.request.installRoot, "cli-config.json"),
      JUMPYBRAIN_NO_UPDATE_CHECK: "1",
      GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/false", SSH_ASKPASS: "/usr/bin/false", GCM_INTERACTIVE: "never",
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("wait requires exact authorization AND a dead parent, with a bounded timeout", { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  for (const [proceed, alive] of [[null, false], ["update", false], ["wrong\n", false], ["update\n", true]]) {
    await rm(path.join(f.directory, "proceed"), { force: true });
    if (proceed !== null) await writeFile(path.join(f.directory, "proceed"), proceed);
    let probes = 0;
    const started = performance.now();
    await assert.rejects(waitForExit(f.request, f.directory, {
      timeoutMs: 35, pollMs: 5,
      alive(pid) { assert.equal(pid, f.request.parentPid); probes++; return alive; },
    }), /did not authorize and finish shutdown in time.*No update was started/);
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 25, "wait must poll rather than fail immediately");
    assert.ok(elapsed < 2000, "short timeout must not use the production 45-second deadline");
    if (proceed !== "update\n") assert.equal(probes, 0, "no PID probing without authorization");
    else assert.ok(probes > 0);
  }
});

test("wait observes authorization arriving later and polls until the parent exits", { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  let probes = 0;
  let settled = false;
  const waiting = waitForExit(f.request, f.directory, {
    timeoutMs: 2000, pollMs: 5, alive: () => ++probes < 3,
  }).then(() => { settled = true; });
  await pause(20);
  assert.equal(settled, false);
  assert.equal(probes, 0);
  await writeFile(path.join(f.directory, "proceed"), "update\n");
  await waiting;
  assert.equal(probes, 3);
});

test("authorized wait does not resolve until a real fixture child has exited", { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const exited = once(child, "exit");
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; });
  await once(child, "spawn");
  assert.equal(processAlive(child.pid), true);
  await writeFile(path.join(f.directory, "proceed"), "update\n");
  let settled = false;
  const waiting = waitForExit({ ...f.request, parentPid: child.pid }, f.directory, { timeoutMs: 2000, pollMs: 5 })
    .then(() => { settled = true; });
  await pause(25);
  assert.equal(settled, false);
  child.kill();
  await exited;
  await waiting;
  assert.equal(processAlive(child.pid), false);
});

test("successful update waits, preserves quoted custom-root argv, and opens only after updater success", { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  const events = [];
  let release;
  const updaterDone = new Promise((resolve) => { release = resolve; });
  let started;
  const updaterStarted = new Promise((resolve) => { started = resolve; });
  const updating = runUpdate(f.requestPath, {
    async wait(request, directory) {
      assert.deepEqual(request, f.request);
      assert.equal(directory, f.directory);
      assert.equal(await readFile(path.join(directory, "ready"), "utf8"), "ready\n");
      await writeFile(path.join(directory, "proceed"), "update\n");
      events.push("shutdown");
    },
    async run(command, args, options, output) {
      assert.deepEqual(options, { cwd: f.directory, env: updateEnvironment(f.request) });
      if (command === f.request.node) {
        assert.deepEqual(args, [path.join(f.request.installRoot, "app/dist/cli.js"), "update",
          "--install-root", f.request.installRoot, "--home", f.request.home]);
        events.push("updater-start");
        started();
        await updaterDone;
        output(Buffer.from("fixture updater output\n"));
        events.push("updater-success");
      } else {
        assert.equal(command, "/usr/bin/open");
        assert.deepEqual(args, [f.request.appPath]);
        assert.deepEqual(events, ["shutdown", "updater-start", "updater-success"]);
        events.push("open");
      }
      return { code: 0, signal: null };
    },
  });
  await updaterStarted;
  await pause(10);
  assert.deepEqual(events, ["shutdown", "updater-start"], "open must not race the unresolved updater");
  release();
  assert.equal(await updating, 0);
  assert.deepEqual(events, ["shutdown", "updater-start", "updater-success", "open"]);
  await assertFinished(f, "success", /fixture updater output[\s\S]*Update succeeded[\s\S]*Done/);
});

test("nonzero, signalled, and unknown updater failures never reopen and retain diagnostics", async (t) => {
  for (const result of [{ code: 42, signal: null }, { code: null, signal: "SIGTERM" }, { code: null, signal: null }]) {
    const f = await fixture(t);
    const calls = [];
    assert.equal(await runUpdate(f.requestPath, {
      wait: async () => {},
      async run(command, args, options, output) {
        calls.push(command);
        output("fixture failure detail\n");
        return result;
      },
    }), 1);
    assert.deepEqual(calls, [f.request.node]);
    await assertFinished(f, "failed", /fixture failure detail[\s\S]*Updater failed/);
    assert.ok((await readFile(path.join(f.directory, "update.log"), "utf8")).includes(`(${result.signal || (result.code ?? "unknown")})`));
  }
});

test("handoff timeout starts no updater and cleans launchers while preserving result/log/claim", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  assert.equal(await runUpdate(f.requestPath, {
    wait: (request, directory) => waitForExit(request, directory, { timeoutMs: 25, pollMs: 5, alive: () => false }),
    async run() { calls++; return { code: 0 }; },
  }), 1);
  assert.equal(calls, 0);
  await assertFinished(f, "failed", /No update was started/);
});

test("exclusive claim refuses duplicate invocation without touching the existing log or request", async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.directory, "claimed"));
  await writeFile(path.join(f.directory, "update.log"), "first runner log\n");
  const before = await readFile(f.requestPath, "utf8");
  let calls = 0;
  await assert.rejects(runUpdate(f.requestPath, {
    wait: async () => { calls++; }, run: async () => { calls++; return { code: 0 }; },
  }), { code: "EEXIST" });
  assert.equal(calls, 0);
  assert.equal(await readFile(path.join(f.directory, "update.log"), "utf8"), "first runner log\n");
  assert.equal(await readFile(f.requestPath, "utf8"), before);
  await assert.rejects(stat(path.join(f.directory, "ready")), { code: "ENOENT" });
});

test("invalid requests fail before claiming or invoking any handoff/process seam", async (t) => {
  for (const content of ["not JSON", JSON.stringify({ parentPid: 1 })]) {
    const f = await fixture(t);
    await writeFile(f.requestPath, content);
    let calls = 0;
    await assert.rejects(runUpdate(f.requestPath, {
      wait: async () => { calls++; }, run: async () => { calls++; return { code: 0 }; },
    }));
    assert.equal(calls, 0);
    await assert.rejects(stat(path.join(f.directory, "claimed")), { code: "ENOENT" });
  }
});

test("spawn rejection records failure, never reopens, and cleans temporary handoff files", async (t) => {
  const f = await fixture(t);
  const calls = [];
  assert.equal(await runUpdate(f.requestPath, {
    wait: async () => {},
    async run(command) { calls.push(command); throw Object.assign(new Error("spawn fixture ENOENT"), { code: "ENOENT" }); },
  }), 1);
  assert.deepEqual(calls, [f.request.node]);
  await assertFinished(f, "failed", /spawn fixture ENOENT/);
});

test("reopening failure records that the update succeeded without retrying", async (t) => {
  const f = await fixture(t);
  const calls = [];
  assert.equal(await runUpdate(f.requestPath, {
    wait: async () => {},
    async run(command) { calls.push(command); return { code: command === f.request.node ? 0 : 1 }; },
  }), 1);
  assert.deepEqual(calls, [f.request.node, "/usr/bin/open"]);
  await assertFinished(f, "failed", /Update succeeded, but reopening failed/);
});

test("runProcess forwards fixture stdout/stderr, reports exit status, and rejects spawn errors", async (t) => {
  const f = await fixture(t);
  const chunks = [];
  const result = await runProcess(process.execPath, ["-e",
    `process.stdout.write("fixture stdout\\n"); process.stderr.write("fixture stderr\\n"); process.exitCode = 7;`,
  ], { cwd: f.directory, env: updateEnvironment(f.request) }, (data) => chunks.push(data));
  assert.deepEqual(result, { code: 7, signal: null });
  const output = Buffer.concat(chunks).toString();
  assert.match(output, /fixture stdout/);
  assert.match(output, /fixture stderr/);
  await assert.rejects(runProcess(path.join(f.root, "nonexistent-executable"), [], { cwd: f.directory }, () => {}), { code: "ENOENT" });
});

test("runner acknowledges authorization with a live PID and bounded expiry; revocation prevents update", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.directory, "proceed"), "update\n");
  const waiting = waitForExit(f.request, f.directory, { timeoutMs: 2000, pollMs: 5, alive: () => true });
  const rejected = assert.rejects(waiting, /cancelled.*No update was started/);
  let ack;
  for (let n = 0; n < 100 && !ack; n++) {
    try { ack = JSON.parse(await readFile(path.join(f.directory, "acknowledged"), "utf8")); } catch { await pause(10); }
  }
  assert.equal(ack.pid, process.pid);
  assert.ok(ack.expires > Date.now() && ack.expires <= Date.now() + 2000);
  await writeFile(path.join(f.directory, "cancelled"), "cancelled\n");
  await rejected;
});

test("SIGTERM after readiness revokes handshake and exits without starting an updater", { timeout: 5000, skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t);
  const helper = new URL("../integrations/macos-companion/menu-update.mjs", import.meta.url);
  const child = spawn(process.execPath, [helper.pathname, f.requestPath], { stdio: "ignore" });
  const exited = once(child, "exit");
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; });
  for (let n = 0; n < 100; n++) {
    try { await stat(path.join(f.directory, "ready")); break; } catch { await pause(10); }
  }
  await stat(path.join(f.directory, "ready"));
  // Acknowledge first so the signal regression also covers a stale ack marker.
  await writeFile(path.join(f.directory, "proceed"), "update\n");
  for (let n = 0; n < 100; n++) {
    try { await stat(path.join(f.directory, "acknowledged")); break; } catch { await pause(10); }
  }
  await stat(path.join(f.directory, "acknowledged"));
  child.kill("SIGTERM");
  assert.deepEqual(await exited, [1, null]);
  await assertFinished(f, "failed", /cancelled.*No update was started/, ["cancelled"]);
  assert.doesNotMatch(await readFile(path.join(f.directory, "update.log"), "utf8"), /Updating installed CLI/);
});

// Real launchd → Terminal → runner survival and success/failure native relaunch
// are separately exercised by integrations/macos-companion/smoke_menu_update.py.
// This unit suite never launches Terminal or touches real launchd jobs.
