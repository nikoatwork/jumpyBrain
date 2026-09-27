import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkForUpdates, compareRemote, gitEnvironment, httpsSource, refPlan, validateManifest,
} from "../integrations/macos-companion/update-check.mjs";

const SOURCE = "https://github.com/example/project.git";
const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);
const TAG = "c".repeat(40);
const helper = fileURLToPath(new URL("../integrations/macos-companion/update-check.mjs", import.meta.url));

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const gitDir = path.join(app, ".git");
  await mkdir(gitDir, { recursive: true });
  await writeFile(path.join(gitDir, "config"), `[remote "origin"]\n  url = ${SOURCE}\n`);
  const manifest = {
    version: 1, installer: "jumpybrain-installer", source: SOURCE, ref: null,
    scope: "global", integrationMode: "auto", installRoot: root, appDir: app,
    binDir: path.join(root, "bin"), cliPath: path.join(root, "bin", "jumpybrain"),
    ...overrides,
  };
  const save = () => writeFile(path.join(root, "install-manifest.json"), JSON.stringify(manifest));
  await save();
  return { root, app, gitDir, manifest, save };
}

function commands({ origin = SOURCE, head = HEAD, remote = `${HEAD}\trefs/heads/master\n`, fail } = {}) {
  const calls = [];
  return {
    calls,
    runCommand(command, args, options) {
      calls.push({ command, args, options });
      const operation = args.includes("ls-remote") ? "remote" : args.includes("config") ? "origin" : "head";
      if (operation === fail) return { status: null, error: new Error("secret-token"), stderr: "secret-token" };
      return { status: 0, stdout: operation === "origin" ? `${origin}\0` : operation === "head" ? `${head}\n` : remote };
    },
  };
}

async function snapshot(dir) {
  const result = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(name) : (await readFile(name)).toString("base64");
  }
  return result;
}

test("default master is current or available, never remote HEAD or package version", async (t) => {
  const f = await fixture(t, { installedVersion: "999.0.0" });
  for (const [hash, status] of [[HEAD, "current"], [NEXT, "available"]]) {
    const seam = commands({ remote: `${hash}\trefs/heads/master\n` });
    assert.deepEqual(await checkForUpdates(f.root, seam), { status });
    assert.deepEqual(seam.calls.at(-1).args.slice(-3), ["refs/heads/master", "refs/tags/master", "refs/tags/master^{}"]);
  }
});

test("explicit branch, lightweight tag, and peeled annotated tag comparisons", async (t) => {
  const f = await fixture(t);
  for (const [ref, remote, status] of [
    ["release/next", `${NEXT}\trefs/heads/release/next\n`, "available"],
    ["refs/heads/stable", `${HEAD}\trefs/heads/stable\n`, "current"],
    ["v1", `${HEAD}\trefs/tags/v1\n`, "current"],
    ["v1", `${TAG}\trefs/tags/v1\n${HEAD}\trefs/tags/v1^{}\n`, "current"],
    ["refs/tags/v1", `${TAG}\trefs/tags/v1\n${NEXT}\trefs/tags/v1^{}\n`, "available"],
  ]) {
    f.manifest.ref = ref;
    await f.save();
    assert.deepEqual(await checkForUpdates(f.root, commands({ remote })), { status }, ref);
  }
});

test("ambiguous branches/tags, missing refs, malformed output, and orphan peeled tags are unknown", () => {
  for (const output of [
    `${HEAD}\trefs/heads/master\n${HEAD}\trefs/tags/master\n`,
    `${HEAD}\trefs/heads/master\n${NEXT}\trefs/tags/master^{}\n`,
    `${HEAD}\trefs/tags/master^{}\n`,
    `${HEAD}\trefs/heads/master\n${HEAD}\trefs/heads/master\n`,
    `${HEAD}\trefs/heads/other\n`, "", "secret-token", `not-a-hash\trefs/heads/master\n`,
  ]) assert.equal(compareRemote(HEAD, refPlan(null), output).status, "unknown");
});

test("full commit pins only report current when matching and never contact network", async (t) => {
  const f = await fixture(t);
  for (const [ref, status] of [[HEAD.toUpperCase(), "current"], [NEXT, "unknown"]]) {
    f.manifest.ref = ref;
    await f.save();
    const seam = commands();
    assert.equal((await checkForUpdates(f.root, seam)).status, status);
    assert.equal(seam.calls.length, 2);
  }
});

test("SHA-256 IDs are compared without assuming SHA-1", () => {
  const sha256 = "d".repeat(64);
  assert.deepEqual(refPlan(sha256), { commit: sha256 });
  assert.equal(compareRemote(sha256, refPlan(null), `${sha256}\trefs/heads/master\n`).status, "current");
  assert.equal(compareRemote(HEAD, refPlan(null), `${sha256}\trefs/heads/master\n`).status, "unknown");
});

test("unsafe/unsupported ref expressions are rejected before Git", async (t) => {
  const f = await fixture(t);
  for (const ref of ["", "  ", "HEAD", "@", "abcdef0", "--upload-pack=evil", "master~1", "master^{commit}",
    "a..b", "a b", "a\nb", "a\0b", "a:b", "a?b", "a*b", "a[b", "a\\b", "a@{1}", "/bad", "bad/",
    "a//b", ".bad", "a/.bad", "a.lock", "bad.", "refs/remotes/origin/master", 123, {}]) {
    f.manifest.ref = ref;
    await f.save();
    const seam = commands();
    assert.equal((await checkForUpdates(f.root, seam)).status, "unknown", JSON.stringify(ref));
    assert.equal(seam.calls.length, 0);
  }
  assert.deepEqual(refPlan("  stable  ").patterns, ["refs/heads/stable", "refs/tags/stable", "refs/tags/stable^{}"]);
});

test("local, SSH, custom protocols, credential URLs and absent sources are unknown", async (t) => {
  const f = await fixture(t);
  for (const source of [undefined, null, "", "/tmp/source", "file:///tmp/source", "git@github.com:example/repo.git",
    "ssh://git@github.com/example/repo", "http://github.com/example/repo", "ext::sh -c evil", "https::evil",
    "https://user:secret@example.com/repo", "https://example.com/repo?token=secret", "https://example.com/repo#secret",
    "https://example.com/\nsecret", "https://example.com\\@evil.test/repo", "https://", {}]) {
    f.manifest.source = source;
    await f.save();
    const seam = commands();
    const result = await checkForUpdates(f.root, seam);
    assert.equal(result.status, "unknown", JSON.stringify(source));
    assert.equal(seam.calls.length, 0);
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
  assert.equal(httpsSource("https://EXAMPLE.com:443/repo.git"), "https://EXAMPLE.com:443/repo.git");
});

test("manifest ownership, schema, paths and root are checked before commands", async (t) => {
  const f = await fixture(t);
  const original = { ...f.manifest };
  for (const [key, value] of [["installer", undefined], ["installer", "other"], ["version", 2],
    ["installRoot", "/other"], ["appDir", "/other"], ["binDir", "bin"], ["cliPath", "/other"],
    ["cliConfigPath", "/other"], ["scope", "other"], ["integrationMode", "other"]]) {
    const invalid = { ...original, [key]: value };
    await writeFile(path.join(f.root, "install-manifest.json"), JSON.stringify(invalid));
    const seam = commands();
    assert.equal((await checkForUpdates(f.root, seam)).status, "unknown", key);
    assert.equal(seam.calls.length, 0);
  }
  for (const invalid of [null, [], {}, "bad"]) assert.equal(validateManifest(invalid, f.root), false);
  assert.equal(validateManifest(original, f.root), true);
  for (const content of ["not json secret-token", "[]", "x".repeat(65537)]) {
    await writeFile(path.join(f.root, "install-manifest.json"), content);
    assert.equal((await checkForUpdates(f.root)).status, "unknown");
  }
  await rm(path.join(f.root, "install-manifest.json"));
  assert.equal((await checkForUpdates(f.root)).status, "unknown");
  for (const root of [undefined, "relative", "", {}]) assert.equal((await checkForUpdates(root)).status, "unknown");
});

test("mismatched, missing and duplicate origin provenance cannot authorize a network check", async (t) => {
  const f = await fixture(t);
  for (const origin of ["https://example.com/other.git", `${SOURCE}/`, SOURCE.replace(".git", ""), "", `${SOURCE}\0${SOURCE}`, "ssh://example.com/repo"]) {
    const seam = commands({ origin });
    assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
    assert.equal(seam.calls.length, 1);
  }
  const seam = commands({ head: "invalid secret-token" });
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  assert.equal(seam.calls.length, 2);
});

test("missing metadata, worktree indirection and escaping app symlinks are unknown", async (t) => {
  const f = await fixture(t);
  await rm(f.gitDir, { recursive: true });
  const seam = commands();
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  await writeFile(f.gitDir, "gitdir: /other/.git");
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  await rm(f.gitDir);
  const other = path.join(f.root, "other");
  await mkdir(path.join(other, ".git"), { recursive: true });
  await symlink(path.join(other, ".git"), f.gitDir);
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  await rm(f.app, { recursive: true });
  await symlink(other, f.app);
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  assert.equal(seam.calls.length, 0);
});

test("installer lock avoids observations during replacement", async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, ".installer-lock"));
  const seam = commands();
  assert.equal((await checkForUpdates(f.root, seam)).status, "unknown");
  assert.equal(seam.calls.length, 0);
});

test("subprocess failures, timeouts and exceptions are quiet unknown results", async (t) => {
  const f = await fixture(t);
  for (const fail of ["origin", "head", "remote"]) {
    const result = await checkForUpdates(f.root, commands({ fail }));
    assert.equal(result.status, "unknown");
    assert.ok(!JSON.stringify(result).includes("secret-token"));
  }
  const result = await checkForUpdates(f.root, { runCommand() { throw new Error("secret-token"); } });
  assert.equal(result.status, "unknown");
  assert.ok(!JSON.stringify(result).includes("secret-token"));
});

test("commands are bounded, noninteractive, shell-free and isolate network Git configuration", async (t) => {
  const f = await fixture(t);
  const seam = commands();
  const before = await snapshot(f.root);
  assert.equal((await checkForUpdates(f.root, seam)).status, "current");
  assert.deepEqual(await snapshot(f.root), before);
  assert.equal(seam.calls.length, 3);
  for (const { command, args, options } of seam.calls) {
    assert.equal(command, "/usr/bin/git");
    assert.equal(options.shell, false);
    assert.equal(options.cwd, "/");
    assert.ok(options.timeout > 0 && options.timeout <= 8000);
    assert.equal(options.killSignal, "SIGKILL");
    assert.equal(options.maxBuffer, 1024 * 1024);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    assert.deepEqual(options.env, gitEnvironment());
    assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(options.env.GIT_ALLOW_PROTOCOL, "https");
    assert.equal(options.env.GIT_CONFIG_GLOBAL, "/dev/null");
    assert.equal(options.env.GIT_CONFIG_NOSYSTEM, "1");
    assert.equal(options.env.HOME, "/dev/null");
    assert.ok(!args.some((arg) => ["fetch", "checkout", "pull", "clone"].includes(arg)));
  }
  assert.ok(seam.calls[0].args.includes("--no-includes"));
  const remote = seam.calls.at(-1).args;
  assert.equal(remote[0], "--git-dir=/dev/null");
  for (const setting of ["credential.helper=", "core.askPass=", "http.followRedirects=false", "http.sslVerify=true",
    "protocol.allow=never", "protocol.https.allow=always"]) assert.ok(remote.includes(setting));
  assert.equal(remote[remote.indexOf(SOURCE) - 1], "--");
});

test("real Git reads only the installed origin and HEAD; malicious rewrites/helpers are not used", async (t) => {
  const f = await fixture(t);
  await rm(f.gitDir, { recursive: true });
  const git = (args) => {
    const result = spawnSync("/usr/bin/git", args, { cwd: f.app, env: gitEnvironment(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "--quiet"]);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false",
    "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
  git(["remote", "add", "origin", SOURCE]);
  const head = git(["rev-parse", "HEAD"]);
  const marker = path.join(f.root, "must-not-exist");
  git(["config", "url.ext::evil.insteadOf", "https://"]);
  git(["config", "credential.helper", `!touch '${marker}'`]);
  const included = path.join(f.root, "included-config");
  await writeFile(included, `[remote "origin"]\nurl = https://unrelated.invalid/repo.git\n`);
  git(["config", "include.path", included]);
  const before = await snapshot(f.root);
  let networkCalls = 0;
  const result = await checkForUpdates(f.root, {
    runCommand(command, args, options) {
      if (!args.includes("ls-remote")) return spawnSync(command, args, options);
      networkCalls++;
      // Ask the actual isolated Git process to show all effective config instead
      // of doing network I/O; neither repository settings nor includes can leak.
      const config = spawnSync(command, [...args.slice(0, args.indexOf("ls-remote")), "config", "--list"], options);
      assert.equal(config.status, 0, config.stderr);
      assert.ok(!config.stdout.includes("evil"));
      assert.ok(!config.stdout.includes("touch"));
      assert.ok(!config.stdout.includes("unrelated"));
      return { status: 0, stdout: `${head}\trefs/heads/master\n` };
    },
  });
  assert.deepEqual(result, { status: "current" });
  assert.equal(networkCalls, 1);
  assert.deepEqual(await snapshot(f.root), before);
});

test("CLI prints one sanitized JSON record and exits zero for expected unknown", async (t) => {
  const f = await fixture(t, { source: "/local/source/secret-token" });
  for (const args of [[], ["relative"], [f.root], [f.root, "extra"]]) {
    const result = spawnSync(process.execPath, [helper, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).status, "unknown");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.ok(!result.stdout.includes("secret-token"));
  }
});
