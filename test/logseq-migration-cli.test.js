import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseArgs } from "../dist/cli/args.js";
import { migrateCli } from "../dist/cli/migrate.js";
import { migrateLogseq } from "../dist/runtime/index.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const body = "- SYNTHETIC_BODY_NOT_FOR_STDOUT\r\n\tproperty:: value\r\n\t- TODO [[Missing page]] ![image](../assets/image.png)";

function invoke(args, { ok = true, env = {} } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, JUMPYBRAIN_API_KEY: "", JUMPYBRAIN_QMD_BIN: "/nonexistent/migration-must-not-index", ...env },
    timeout: 15000,
  });
  if (ok) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0, "Expected migration failure");
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_BODY_NOT_FOR_STDOUT/);
  return result;
}

async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpybrain-logseq-cli-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = path.join(temp, "graph with 'quote");
  const root = path.join(temp, "memory with 'quote");
  for (const dir of ["pages/nested", "journals", "assets", "logseq/bak"]) {
    await mkdir(path.join(source, dir), { recursive: true });
  }
  await writeFile(path.join(source, "pages/nested/Example.md"), body);
  await writeFile(path.join(source, "journals/2026_09_19.md"), "- Synthetic journal\n\t- {{query (task TODO)}}\n");
  await writeFile(path.join(source, "assets/image.png"), "synthetic omitted asset");
  await writeFile(path.join(source, "logseq/bak/old.md"), "synthetic omitted backup");
  await writeFile(path.join(source, "logseq/config.edn"), "{}\n");
  await writeFile(path.join(source, "root.md"), "synthetic omitted root document");
  await writeFile(path.join(source, "pages/not-markdown.txt"), "synthetic omitted text");
  return { temp, source, root, args: ["migrate", "logseq", "--source", source, "--root", root] };
}

function quote(value) {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

test("Logseq CLI human and JSON dry-runs are compact, quoted, body-free and non-mutating", async (t) => {
  const { source, root, args } = await fixture(t);
  const human = invoke([...args, "--fail-on-conflict"]);
  assert.match(human.stdout, /dry-run: 1 pages.*1 journals/);
  assert.match(human.stdout, /create 2, overwrite 0, delete 0, unchanged 0/);
  assert.ok(human.stdout.includes(`Destination: ${root}`));
  assert.match(human.stdout, /assets.*configuration.*backups.*omitted/);
  assert.match(human.stdout, /source wins.*overwritten.*delete/s);
  assert.ok(human.stdout.includes(`Apply: jumpybrain migrate logseq --source ${quote(source)} --root ${quote(root)} --apply --fail-on-conflict`));
  const packet = JSON.parse(invoke([...args, "--json"]).stdout);
  assert.equal(packet.dryRun, true);
  assert.equal(packet.applied, false);
  assert.equal(packet.indexed, false);
  assert.equal(packet.sourceDocuments, 2);
  assert.equal(packet.outputDocuments, 2);
  assert.equal(packet.created, 2);
  assert.equal(packet.entries.length, 2);
  assert.ok(Array.isArray(packet.warnings));
  assert.deepEqual(packet.errors, []);
  assert.equal(path.isAbsolute(packet.manifest), false);
  for (const entry of packet.entries) {
    assert.equal(path.isAbsolute(entry.sourcePath), false);
    assert.equal(path.isAbsolute(entry.outputPath), false);
    assert.equal(entry.body, undefined);
    assert.equal(entry.content, undefined);
  }
  assert.equal(existsSync(root), false);
  assert.equal(await readFile(path.join(source, "pages/nested/Example.md"), "utf8"), body);
});

test("Logseq CLI applies without QMD, reruns without duplicates, overwrites conflicts and reconciles removals", async (t) => {
  const { source, root, args } = await fixture(t);
  const first = JSON.parse(invoke([...args, "--apply", "--json"]).stdout);
  assert.equal(first.applied, true);
  assert.equal(first.dryRun, false);
  assert.equal(first.created, 2);
  assert.equal(first.indexed, false);
  assert.ok(existsSync(path.join(root, first.manifest)));
  const output = path.join(root, "notes/nested/Example.md");
  const original = await readFile(output, "utf8");
  assert.ok(original.endsWith(body));
  const id = original.match(/^id:.*$/m)?.[0];
  assert.ok(id);
  const unchanged = JSON.parse(invoke([...args, "--apply", "--json"]).stdout);
  assert.equal(unchanged.unchanged, 2);
  assert.equal(unchanged.created + unchanged.overwritten + unchanged.deleted, 0);
  await writeFile(output, original + "\nSynthetic destination-only edit\n");
  invoke([...args, "--apply", "--fail-on-conflict", "--json"], { ok: false });
  assert.match(await readFile(output, "utf8"), /destination-only edit/);
  const replaced = JSON.parse(invoke([...args, "--apply", "--json"]).stdout);
  assert.equal(replaced.overwritten, 1);
  assert.equal((await readFile(output, "utf8")).match(/^id:.*$/m)?.[0], id);
  assert.ok((await readFile(output, "utf8")).endsWith(body));
  assert.equal(await readFile(path.join(source, "pages/nested/Example.md"), "utf8"), body);
  const changedBody = body + "\r\n- Synthetic source refresh";
  await writeFile(path.join(source, "pages/nested/Example.md"), changedBody);
  const refreshed = JSON.parse(invoke([...args, "--apply", "--json"]).stdout);
  assert.equal(refreshed.overwritten, 1);
  assert.equal(refreshed.created, 0);
  assert.ok((await readFile(output, "utf8")).endsWith(changedBody));
  assert.equal((await readFile(output, "utf8")).match(/^id:.*$/m)?.[0], id);
  await writeFile(path.join(root, "notes/unrelated.md"), "Unrelated destination document\n");
  await rm(path.join(source, "pages/nested/Example.md"));
  const removed = JSON.parse(invoke([...args, "--apply", "--json"]).stdout);
  assert.equal(removed.deleted, 1);
  assert.equal(existsSync(output), false);
  assert.equal(existsSync(path.join(root, "notes/unrelated.md")), true);
  const human = invoke([...args, "--apply"]);
  assert.match(human.stdout, /Index not rebuilt/);
  assert.ok(human.stdout.includes(`jumpybrain index --root ${quote(root)}`));
});

test("Logseq CLI rejects missing paths, unsupported arguments and invalid booleans", async (t) => {
  const { root, args } = await fixture(t);
  for (const invalid of [
    ["migrate"], ["migrate", "other"], ["migrate", "logseq"],
    ["migrate", "logseq", "--source", "--root", root],
    ["migrate", "logseq", "--source", "", "--root", root],
    [...args, "--apply", "no"], [...args, "--apply=falsey"],
    [...args, "--json", "0"], [...args, "--fail-on-conflict", "yes"],
    [...args, "--source", "second-source"], [...args, "--apply", "--apply"],
    [...args, "--unknown"], [...args, "extra"],
    ["--root", root, "migrate", "logseq", "--source", "synthetic", "--apply", "no"],
  ]) invoke(invalid, { ok: false });
  const packet = JSON.parse(invoke([...args, "--apply", "false", "--json=true", "--fail-on-conflict=false"]).stdout);
  assert.equal(packet.dryRun, true);
  assert.equal(existsSync(root), false);
  assert.equal(parseArgs([...args, "--apply=true"]).apply, true);
});

test("Logseq CLI rejects remote flags before broken policy, credentials or network", async (t) => {
  const { temp, args, root } = await fixture(t);
  const config = path.join(temp, "invalid-policy.json");
  await writeFile(config, "NOT JSON");
  for (const flag of ["--target-url", "--remote-url"]) {
    for (const suffix of [[flag, "http://127.0.0.1:1"], [flag], [`${flag}=http://127.0.0.1:1`]]) {
      const failure = invoke([...args, "--apply", ...suffix], { ok: false, env: { JUMPYBRAIN_CLI_CONFIG: config } });
      assert.match(failure.stderr, /local-only/);
      assert.doesNotMatch(failure.stderr, /JUMPYBRAIN_API_KEY|ECONNREFUSED|NOT JSON|read.only policy/i);
    }
  }
  assert.equal(existsSync(root), false);
});

test("Logseq CLI reports missing or non-directory sources without creating output", async (t) => {
  const { temp, root } = await fixture(t);
  const file = path.join(temp, "not-directory.md");
  await writeFile(file, body);
  for (const source of [path.join(temp, "missing"), file]) {
    const result = invoke(["migrate", "logseq", "--source", source, "--root", root, "--apply"], { ok: false });
    assert.match(result.stdout + result.stderr, /source|directory|ENOENT|ENOTDIR/i);
  }
  assert.equal(existsSync(root), false);
});

test("Logseq CLI JSON is the unchanged app result and forwards explicit options", async () => {
  assert.equal(typeof migrateLogseq, "function");
  const result = {
    dryRun: true, applied: false, root: "/synthetic-memory", sourceDocuments: 0, outputDocuments: 0,
    pages: 0, journals: 0, created: 0, overwritten: 0, deleted: 0, unchanged: 0,
    sourceBytes: 0, outputBytes: 0, warnings: [], errors: [], entries: [], manifest: ".jumpybrain/synthetic.json", indexed: false,
  };
  const messages = [];
  const original = console.log;
  console.log = (message) => messages.push(message);
  try {
    await migrateCli(parseArgs(["migrate", "logseq", "--source", "/synthetic-graph", "--root", "/synthetic-memory", "--json", "--fail-on-conflict"]), {
      migrateLogseq: async (source, root, options) => {
        assert.equal(source, "/synthetic-graph");
        assert.equal(root, "/synthetic-memory");
        assert.deepEqual(options, { apply: false, failOnConflict: true });
        return result;
      },
    });
  } finally {
    console.log = original;
  }
  assert.deepEqual(JSON.parse(messages[0]), result);
});


test("Logseq CLI rejects likely database mirrors and custom source directories", async (t) => {
  const { source, root, args } = await fixture(t);
  const marker = path.join(source, "db.sqlite");
  await writeFile(marker, "synthetic database marker; not a database");
  const db = invoke([...args, "--apply"], { ok: false });
  assert.match(db.stdout + db.stderr, /unsupported.*(?:database|mirror)/i);
  assert.equal(existsSync(root), false);
  await rm(marker);
  await writeFile(path.join(source, "logseq/config.edn"), '{:pages-directory "custom-pages"}');
  const custom = invoke([...args, "--apply"], { ok: false });
  assert.match(custom.stdout + custom.stderr, /custom.*directories.*not supported/i);
  assert.equal(existsSync(root), false);
});
