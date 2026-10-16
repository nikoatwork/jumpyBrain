import assert from "node:assert/strict";
import test from "node:test";
import { blockedPathReason, looksLikeRealSecretValue, scanText, shouldScanContent } from "../scripts/precommit-guard.mjs";

test("precommit guard blocks private local paths", () => {
  assert.match(blockedPathReason("AGENTS.md"), /local\/private/);
  assert.equal(blockedPathReason("tasks/todo/plan.md"), undefined);
  assert.match(blockedPathReason(".dogfood-memory/jumpybrain.json"), /private\/generated/);
  assert.match(blockedPathReason(".env.local"), /environment files/);
  assert.equal(blockedPathReason(".env.example"), undefined);
});

test("precommit guard allows documented placeholders", () => {
  assert.equal(looksLikeRealSecretValue("<generate-a-long-random-secret>"), false);
  assert.equal(looksLikeRealSecretValue("client-key"), false);
  assert.equal(looksLikeRealSecretValue("example-token"), false);
  assert.equal(looksLikeRealSecretValue("$JUMPYBRAIN_PUBLIC_DEMO_KEY"), false);
});

test("precommit guard exempts its own fixtures from content scanning", () => {
  assert.equal(shouldScanContent("scripts/precommit-guard.mjs"), false);
  assert.equal(shouldScanContent("test/precommit-guard.test.js"), false);
  assert.equal(shouldScanContent("docs/deploy.md"), true);
});

test("precommit guard flags likely secrets and personal deployment URLs", () => {
  const findings = scanText("deploy.md", [
    "JUMPYBRAIN_SERVER_API_KEYS=super-real-token-12345",
    "https://coolify.juttu.co/project/example",
    "-----BEGIN PRIVATE KEY-----",
  ].join("\n"));

  assert.deepEqual(findings.map((finding) => finding.line), [1, 2, 3]);
  assert.match(findings[0].reason, /possible committed secret assignment/);
  assert.match(findings[1].reason, /personal Coolify/);
  assert.match(findings[2].reason, /private key/);
});

test("precommit guard allows only the intentional public demo host in the README", () => {
  assert.deepEqual(scanText("README.md", "https://demojumpybrain.juttu.co/graph"), []);

  const docsFindings = scanText("docs/deploy.md", "https://demojumpybrain.juttu.co/graph");
  const otherHostFindings = scanText("README.md", "https://coolify.juttu.co/project/example");
  const mixedLineFindings = scanText("README.md", "Demo: https://demojumpybrain.juttu.co/graph; admin: https://coolify.juttu.co/project/example");

  assert.match(docsFindings[0].reason, /personal Coolify/);
  assert.match(otherHostFindings[0].reason, /personal Coolify/);
  assert.match(mixedLineFindings[0].reason, /personal Coolify/);
});

test("precommit guard flags public operational breadcrumbs in task logs", () => {
  const findings = scanText("tasks/done/tasks-cloud.md", [
    "Deployed to VPS 89.167.65.196 with root@89.167.65.196.",
    "Created SSH key at ~/.ssh/jumpybrain-coolify-server.",
    "Allowed placeholder root@<server-ip>, ~/.ssh/..., and localhost 127.0.0.1 examples.",
  ].join("\n"));

  assert.deepEqual(findings.map((finding) => finding.line), [1, 1, 2]);
  assert.match(findings[0].reason, /root SSH login/);
  assert.match(findings[1].reason, /public IPv4/);
  assert.match(findings[2].reason, /SSH key path/);
});

test("precommit guard keeps operational breadcrumb checks scoped to task logs", () => {
  assert.deepEqual(scanText("docs/vps-deploy.md", "Connect to root@203.0.113.10 from ~/.ssh/example-key."), []);
});
