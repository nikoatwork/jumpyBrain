import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { rememberMemory } from "../dist/app/writing/local-writer.js";
import { writeRemoteMemoryNote } from "../dist/app/writing/remote-writer.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { mergeMemoryDocumentUpdate } from "../dist/core/writing/index.js";
import { repoRoot } from "./source-graph-helpers.js";

async function disposableRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-dream-writing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

for (const [name, create] of [["local", rememberMemory], ["remote", writeRemoteMemoryNote]]) {
  test(`${name} creates dream pages with boolean metadata, IDs and ordinary timestamps`, async (t) => {
    const root = await disposableRoot(t);
    const result = await create(root, { type: "page", title: "Synthetic topic map", body: "Historical evidence: [[notes/source]].", dream: true });
    const content = await readFile(path.join(root, result.file), "utf8");
    const { frontmatter } = parseFrontmatter(content);
    assert.match(result.file, /^pages\/.+\.md$/);
    assert.match(result.id, /^mem_/);
    assert.equal(frontmatter.id, result.id);
    assert.equal(frontmatter.type, "page");
    assert.equal(frontmatter.dream, true);
    assert.equal(frontmatter.confidence, "agent-drafted");
    assert.equal(frontmatter.review, "user-review-recommended");
    assert.match(content, /^dream: true$/m);
    assert.equal(frontmatter.created_at, frontmatter.updated_at);
    assert.ok(Number.isFinite(Date.parse(frontmatter.created_at)));

    for (const dream of ["true", "false", 1, null]) {
      await assert.rejects(create(root, { type: "page", title: "Invalid marker", body: "Evidence", dream }), /dream must be a boolean/);
    }
    const ordinary = await create(root, { type: "page", title: "Ordinary page", body: "Evidence" });
    assert.equal(Object.hasOwn(parseFrontmatter(await readFile(path.join(root, ordinary.file), "utf8")).frontmatter, "dream"), false);
  });
}

test("document updates preserve an omitted dream marker without making it protected metadata", () => {
  const existing = '---\nid: "mem_61000000-0000-4000-8000-000000000001"\ntype: "page"\ndream: true\ncreated_at: "2026-01-01T00:00:00.000Z"\n---\nOld evidence\n';
  const omitted = mergeMemoryDocumentUpdate(existing, "Updated evidence");
  assert.equal(omitted.frontmatter.dream, true);
  assert.equal(omitted.frontmatter.type, "page");
  assert.equal(omitted.frontmatter.id, parseFrontmatter(existing).frontmatter.id);
  const disabled = mergeMemoryDocumentUpdate(existing, "---\ndream: false\n---\nExplicitly reclassified");
  assert.equal(disabled.frontmatter.dream, false);
  // Classification is independent of bucket/type, and is not an edit ACL.
  const original = mergeMemoryDocumentUpdate(existing.replace('type: "page"', 'type: "note"').replace("dream: true\n", ""), "---\ndream: true\n---\nAuthorized original edit");
  assert.equal(original.frontmatter.type, "note");
  assert.equal(original.frontmatter.dream, true);
});

test("CLI dream page create/update retains identity, rejects stale hashes and refreshes derived metadata on index", async (t) => {
  const root = await disposableRoot(t);
  // No model/provider calls: this tests canonical/index metadata lifecycle, not QMD ranking.
  const qmd = path.join(root, "synthetic-qmd");
  await writeFile(qmd, '#!/bin/sh\ncase "$1" in\n  collection|update) exit 0 ;;\n  *) echo "unexpected QMD call: $1" >&2; exit 1 ;;\nesac\n');
  await chmod(qmd, 0o755);
  const env = { ...process.env, HOME: root, JUMPYBRAIN_QMD_BIN: qmd, JUMPYBRAIN_QMD_EMBED: "false" };
  const run = (args, input, success = true) => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, "dist/cli.js"), ...args, "--root", root, "--json"], { env, encoding: "utf8", input });
    if (success) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, result.stdout);
    return result;
  };
  const json = (args, input) => JSON.parse(run(args, input).stdout);
  const manifest = async () => JSON.parse(await readFile(path.join(root, ".jumpybrain/index.json"), "utf8"));
  json(["init"]);
  const created = json(["remember", "--type", "page", "--dream", "--title", "Synthetic dream map"], "First synthetic evidence.");
  assert.equal(created.indexed, true);
  assert.match(created.file, /^pages\//);
  const shown = json(["show", "--id", created.id]);
  assert.equal(shown.frontmatter.dream, true);
  const indexedBefore = (await manifest()).documents.find((entry) => entry.relativePath === created.file);
  assert.equal(indexedBefore.frontmatter.dream, true);
  assert.equal(indexedBefore.frontmatter.id, created.id);

  const revised = shown.content.replace("First synthetic evidence.", "Expanded synthetic evidence.");
  const updated = json(["update", "--id", created.id, "--if-match", shown.contentHash], revised);
  assert.equal(updated.id, created.id);
  assert.equal(updated.file, created.file);
  assert.equal(updated.indexed, false);
  assert.equal(updated.index.stale, true);
  assert.equal((await manifest()).documents.find((entry) => entry.relativePath === created.file).frontmatter.updated_at, indexedBefore.frontmatter.updated_at);
  assert.match(run(["update", "--id", created.id, "--if-match", shown.contentHash], "Stale overwrite", false).stderr, /content hash is stale/);
  const after = json(["show", "--id", created.id]);
  assert.equal(after.frontmatter.dream, true);
  assert.equal(after.frontmatter.id, created.id);
  assert.equal(after.frontmatter.type, "page");
  assert.equal(after.contentHash, updated.newContentHash);
  assert.match(after.content, /Expanded synthetic evidence/);
  run(["index"]);
  const indexedAfter = (await manifest()).documents.find((entry) => entry.relativePath === created.file);
  assert.equal(indexedAfter.frontmatter.dream, true);
  assert.equal(indexedAfter.frontmatter.updated_at, after.frontmatter.updated_at);
  assert.notEqual(indexedAfter.frontmatter.updated_at, indexedBefore.frontmatter.updated_at);
  assert.match(run(["remember", "--type", "page", "--dream", "false-ish", "--title", "Rejected"], "Evidence", false).stderr, /--dream must be a boolean/);
});
