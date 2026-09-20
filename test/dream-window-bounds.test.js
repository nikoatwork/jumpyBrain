import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDreamWindow } from "../dist/app/dream/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";

const logger = { info() {}, warn() {}, error() {}, log() {} };

test("oversized frontmatter cannot bypass window packet metadata bounds", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-window-bounds-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "notes"));
  const content = `---\ndate: 2024-02-29\nid: "${"i".repeat(8000)}"\ntitle: "${"t".repeat(8000)}"\nextra: "${"x".repeat(1024 * 1024)}"\ntags: ["alpha", "beta"]\n---\nSource body.\n`;
  const file = path.join(root, "notes", "source.md");
  await writeFile(file, content);
  const packet = await getDreamWindow({ root, request: { from: "2024-02-29", days: 1, bytesPerFile: 32, maxTotalBytes: 32 } });
  assert.equal(packet.files.length, 1);
  const evidence = packet.files[0];
  assert.ok(Buffer.byteLength(JSON.stringify(evidence.frontmatter)) <= 4096);
  assert.equal(evidence.frontmatter.extra, undefined);
  assert.equal(evidence.frontmatter.date, "2024-02-29");
  assert.equal(evidence.title, "");
  assert.equal(evidence.id, undefined);
  assert.equal(evidence.returnedBytes, 32);
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) < 10000);
  assert.match(packet.warnings.join("\n"), /oversized packet metadata omitted/);
  assert.equal(await readFile(file, "utf8"), content);
});

test("dream window filesystem failures never expose server-local paths", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-window-private-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // Enumeration raises ENOTDIR with an absolute path; do not publish the raw error message.
  await writeFile(path.join(root, "notes"), "not a directory");
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["synthetic-key"], port: 0, autoIndex: false, logger });
  t.after(() => server.close());
  const response = await fetch(`${server.url}/memories/all/dream/window`, { headers: { Authorization: "Bearer synthetic-key" } });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "dream_failed");
  assert.equal(JSON.stringify(body).includes(root), false);
  assert.doesNotMatch(JSON.stringify(body), /ENOTDIR|scandir/);
});
