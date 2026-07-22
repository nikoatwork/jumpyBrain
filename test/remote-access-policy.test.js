import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeRemoteTargetOrigin as normalizeInstallerRemoteTargetOrigin } from "../scripts/remote-target-origin.mjs";
import {
  loadRemoteAccessPolicy,
  normalizeRemoteTargetOrigin,
  remoteAccessPolicyConfigPath,
  validateRemoteAccessPolicyConfig,
} from "../dist/cli/remote-access-policy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");
const policyError = /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/;

test("remote target origin normalization uses effective HTTP origin identity and matches the installer helper", () => {
  const equivalent = [
    "HTTPS://Memory.Example.COM",
    "https://memory.example.com:443/",
    "https://memory.example.com/some/path?tenant=one#fragment",
  ];
  const normalizers = [normalizeRemoteTargetOrigin, normalizeInstallerRemoteTargetOrigin];
  for (const normalize of normalizers) {
    assert.deepEqual(equivalent.map(normalize), equivalent.map(() => "https://memory.example.com"));
    assert.equal(normalize("http://memory.example.com:80/path"), "http://memory.example.com");
    assert.equal(normalize("https://memory.example.com:8443"), "https://memory.example.com:8443");
    assert.throws(() => normalize("ssh://memory.example.com"), /HTTP or HTTPS/);
    assert.throws(() => normalize("https://user:secret@memory.example.com"), /embedded credentials/);
    assert.throws(() => normalize("not a URL"), /Invalid remote target URL/);
  }
});

test("policy config validation is strict and canonicalizes entries", () => {
  assert.deepEqual(validateRemoteAccessPolicyConfig({
    schemaVersion: 1,
    remoteTargets: [{ origin: "HTTPS://Memory.Example.COM:443/path", access: "read-only" }],
  }), {
    schemaVersion: 1,
    remoteTargets: [{ origin: "https://memory.example.com", access: "read-only" }],
  });
  assert.throws(() => validateRemoteAccessPolicyConfig({ schemaVersion: 2, remoteTargets: [] }), /unsupported/);
  assert.throws(() => validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: [], extra: true }), /exactly/);
  assert.throws(() => validateRemoteAccessPolicyConfig({ schemaVersion: 1, remoteTargets: [{ origin: "https://a.example", access: "write" }] }), /read-only/);
  assert.throws(() => validateRemoteAccessPolicyConfig({
    schemaVersion: 1,
    remoteTargets: [
      { origin: "https://a.example", access: "read-only" },
      { origin: "HTTPS://A.EXAMPLE:443/path", access: "read-only" },
    ],
  }), /duplicate normalized origin/);
});

test("policy config path honors explicit environment override before the default home", () => {
  assert.equal(remoteAccessPolicyConfigPath({ env: {}, home: "/tmp/example-home" }), "/tmp/example-home/.jumpybrain/cli-config.json");
  assert.equal(remoteAccessPolicyConfigPath({ env: { JUMPYBRAIN_CLI_CONFIG: "./custom-policy.json" }, home: "/ignored" }), path.resolve("custom-policy.json"));
  assert.throws(() => remoteAccessPolicyConfigPath({ env: { JUMPYBRAIN_CLI_CONFIG: " " } }), /non-empty file path/);
});

test("missing policy is writable by default while malformed existing policy fails closed", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-policy-config-"));
  const configPath = path.join(temp, "cli-config.json");
  try {
    assert.equal(await loadRemoteAccessPolicy(configPath), null);
    await writeFile(configPath, "{bad json\n", "utf8");
    await assert.rejects(loadRemoteAccessPolicy(configPath), /Remote commands fail closed/);

    const result = runCli(["status", "--target-url", "https://memory.example"], {
      JUMPYBRAIN_CLI_CONFIG: configPath,
      JUMPYBRAIN_API_KEY: "",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid jumpyBrain CLI policy config/);
    assert.doesNotMatch(result.stderr, /JUMPYBRAIN_API_KEY is required/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("read-only target command matrix allows retrieval and blocks mutations before credentials or files", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-policy-matrix-"));
  const configPath = path.join(temp, "cli-config.json");
  const target = "https://memory.example/path?alias=one#ignored";
  try {
    await writeFile(configPath, JSON.stringify({
      schemaVersion: 1,
      remoteTargets: [{ origin: "HTTPS://MEMORY.EXAMPLE:443", access: "read-only" }],
    }), "utf8");
    const env = { JUMPYBRAIN_CLI_CONFIG: configPath, JUMPYBRAIN_API_KEY: "" };
    const reads = [
      ["status"], ["tree"], ["overview"], ["search", "--query", "x"], ["recall", "--topic", "x"],
      ["show", "--id", "mem_test"], ["dream", "--status"],
      ["run", "memory:status"], ["run", "memory:tree"], ["run", "memory:overview"],
      ["run", "memory:search", "--query", "x"], ["run", "memory:recall", "--topic", "x"],
      ["run", "memory:show", "--id", "mem_test"],
    ];
    for (const args of reads) {
      const result = runCli([...args, "--target-url", target], env);
      assert.notEqual(result.status, 0, args.join(" "));
      assert.doesNotMatch(result.stderr, policyError, args.join(" "));
      assert.match(result.stderr, /JUMPYBRAIN_API_KEY is required/, args.join(" "));
    }

    const mutations = [
      ["index"], ["remember"], ["wrapup", "--title", "x"], ["update", "--id", "mem_test", "--if-match", "sha256:x"], ["process", "--mode", "lint"],
      ["dream"], ["dream", "--complete", "dream_test"], ["dream", "--abandon", "dream_test"],
      ["dream", "--apply-manifest", path.join(temp, "missing.json")],
      ["dream", "--status", "--complete", "dream_test"], ["dream", "--status", "--abandon", "dream_test"],
      ["run", "memory:index"], ["run", "memory:remember"], ["run", "memory:wrapup", "--title", "x"],
      ["run", "memory:update", "--id", "mem_test", "--if-match", "sha256:x"], ["run", "memory:process", "--mode", "lint"],
      ["future-command"],
    ];
    for (const args of mutations) {
      const result = runCli([...args, "--remote-url", target], env, "stdin must not be consumed");
      assert.notEqual(result.status, 0, args.join(" "));
      assert.match(result.stderr, policyError, args.join(" "));
      assert.doesNotMatch(result.stderr, /JUMPYBRAIN_API_KEY is required|ENOENT|missing\.json/, args.join(" "));
    }

    const unlisted = runCli(["remember", "--target-url", "https://other.example"], env, "body");
    assert.doesNotMatch(unlisted.stderr, policyError);
    assert.match(unlisted.stderr, /JUMPYBRAIN_API_KEY is required/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function runCli(args, env, input) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
}
