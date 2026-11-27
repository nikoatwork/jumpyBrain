import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fixture = fileURLToPath(new URL("./fixtures/fake-qmd-lifecycle/", import.meta.url));
const app = new URL("../dist/app/local-memory/index.js", import.meta.url).href;
const qmdCli = new URL("../dist/adapters/qmd/qmd-cli.js", import.meta.url).href;
const rootKey = root => createHash("sha256").update(path.resolve(root)).digest("hex");

async function setup(t, { indexDir } = {}) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-index-location-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const pkg = path.join(temp, "qmd");
  await cp(fixture, pkg, { recursive: true });
  await copyFile(path.join(pkg, "database.cjs.fixture"), path.join(pkg, "database.cjs"));
  await mkdir(path.join(pkg, "dist"));
  for (const name of ["index", "store", "llm", "collections"]) {
    await copyFile(path.join(pkg, "sdk", `${name}.js.fixture`), path.join(pkg, "dist", `${name}.js`));
  }
  const sqlite = path.join(pkg, "node_modules", "better-sqlite3");
  await mkdir(sqlite, { recursive: true });
  await copyFile(path.join(pkg, "sqlite/package.json"), path.join(sqlite, "package.json"));
  await copyFile(path.join(pkg, "sqlite/index.js.fixture"), path.join(sqlite, "index.js"));
  const bin = path.join(pkg, "bin/qmd");
  await chmod(bin, 0o755);
  const root = path.join(temp, "memory");
  await mkdir(root);
  const env = {
    ...process.env,
    JUMPYBRAIN_QMD_BIN: bin,
    JUMPYBRAIN_QMD_EMBED: "",
    QMD_EMBED_MODEL: "",
    ...(indexDir ? { JUMPYBRAIN_INDEX_DIR: indexDir } : {}),
  };
  function run(action, options = {}) {
    const program = `
      import * as app from ${JSON.stringify(app)};
      const [root, action, options] = JSON.parse(process.argv[1]);
      try {
        const result = action === "index" ? await app.indexMemory(root, options)
          : action === "ensure" ? await app.ensureMemoryIndexed(root, options)
          : action === "status" ? await app.memoryStatus(root)
          : action === "search" ? await app.searchMemory(root, options.query, 10, options)
          : (() => { throw new Error("unknown fixture action"); })();
        process.stdout.write(JSON.stringify(result));
      } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
    `;
    return new Promise((resolve, reject) => {
      execFile(process.execPath, ["--input-type=module", "-e", program, JSON.stringify([root, action, options])],
        { env, timeout: 20000 }, (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
        });
    });
  }
  const put = async (file, content) => {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  return { temp, pkg, root, env, run, put };
}

test("index path helpers keep the default layout and key a custom directory per root", async () => {
  const { indexStateRoot, derivedRoot } = await import(qmdCli);
  const root = path.join(path.sep, "srv", "jumpybrain", "memory");
  assert.equal(indexStateRoot(root, {}), derivedRoot(root));
  assert.equal(indexStateRoot(root, { JUMPYBRAIN_INDEX_DIR: "" }), derivedRoot(root));
  assert.equal(indexStateRoot(root, { JUMPYBRAIN_INDEX_DIR: "   " }), derivedRoot(root));
  const base = path.join(path.sep, "data", "jumpybrain-index");
  const keyed = path.join(base, "index", rootKey(root));
  assert.equal(indexStateRoot(root, { JUMPYBRAIN_INDEX_DIR: base }), keyed);
  assert.equal(indexStateRoot(path.join(root, "notes", ".."), { JUMPYBRAIN_INDEX_DIR: `${base}${path.sep}` }), keyed);
  assert.notEqual(indexStateRoot(path.join(path.sep, "other", "memory"), { JUMPYBRAIN_INDEX_DIR: base }), keyed);
  let thrown;
  try { indexStateRoot(root, { JUMPYBRAIN_INDEX_DIR: "bad\0path" }); } catch (error) { thrown = error; }
  assert.match(thrown?.message ?? "", /JUMPYBRAIN_INDEX_DIR/);
});

test("custom index directory keeps the canonical root clean and searchable", async t => {
  const indexDir = path.join(os.tmpdir(), `jb-index-dir-${process.pid}-${Date.now()}`);
  t.after(() => rm(indexDir, { recursive: true, force: true }));
  const f = await setup(t, { indexDir });
  await f.put("notes/quartz.md", "---\ntitle: Quartz guide\n---\nquartz qualified evidence\n");
  await f.put("notes/plain.md", "plain unrelated prose\n");
  const before = await readFile(path.join(f.root, "notes/quartz.md"), "utf8");
  const keyed = path.join(indexDir, "index", rootKey(f.root));
  const result = await f.run("index");
  assert.equal(result.readiness.freshness, "fresh");
  assert.equal(existsSync(path.join(keyed, "index.json")), true);
  assert.equal(existsSync(path.join(keyed, "qmd-cache", "qmd", "index.sqlite")), true);
  assert.equal(existsSync(path.join(keyed, "qmd-config", "index.yml")), true);
  assert.equal(existsSync(path.join(keyed, "qmd-home")), true);
  assert.equal(existsSync(path.join(f.root, ".jumpybrain")), false);
  const search = await f.run("search", { query: "quartz" });
  assert.equal(search.readiness.freshness, "fresh");
  assert.deepEqual(search.results.map(r => r.provenance.file), ["notes/quartz.md"]);
  assert.equal(await readFile(path.join(f.root, "notes/quartz.md"), "utf8"), before);
  t.after(() => rm(indexDir, { recursive: true, force: true }));
});

test("a removed or emptied index directory is rebuilt on the next maintenance read", async t => {
  const indexDir = path.join(os.tmpdir(), `jb-index-dir-rebuild-${process.pid}-${Date.now()}`);
  t.after(() => rm(indexDir, { recursive: true, force: true }));
  const f = await setup(t, { indexDir });
  await f.put("notes/anchor.md", "anchor qualification passage\n");
  await f.run("index");
  const keyed = path.join(indexDir, "index", rootKey(f.root));
  const manifest = JSON.parse(await readFile(path.join(keyed, "index.json"), "utf8"));
  await rm(keyed, { recursive: true, force: true });
  // An empty (recreated but index-less) directory behaves like a missing one.
  await mkdir(keyed, { recursive: true });
  const status = await f.run("status");
  assert.equal(status.readiness.freshness, "missing");
  const search = await f.run("search", { query: "anchor" });
  assert.equal(search.readiness.freshness, "fresh");
  assert.deepEqual(search.results.map(r => r.provenance.file), ["notes/anchor.md"]);
  const rebuilt = JSON.parse(await readFile(path.join(keyed, "index.json"), "utf8"));
  assert.notEqual(rebuilt.generation, manifest.generation);
  t.after(() => rm(indexDir, { recursive: true, force: true }));
});

test("two roots sharing one index directory keep separate per-root indexes", async t => {
  const indexDir = path.join(os.tmpdir(), `jb-index-dir-shared-${process.pid}-${Date.now()}`);
  t.after(() => rm(indexDir, { recursive: true, force: true }));
  const first = await setup(t, { indexDir });
  const secondRoot = path.join(first.temp, "second-memory");
  await mkdir(secondRoot);
  const secondEnv = { ...first.env };
  const program = (action, options, root) => new Promise((resolve, reject) => {
    execFile(process.execPath, ["--input-type=module", "-e", `
      import * as app from ${JSON.stringify(app)};
      const [root, action, options] = JSON.parse(process.argv[1]);
      try {
        const result = action === "index" ? await app.indexMemory(root, options)
          : action === "search" ? await app.searchMemory(root, options.query, 10, options)
          : (() => { throw new Error("unknown fixture action"); })();
        process.stdout.write(JSON.stringify(result));
      } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
    `, JSON.stringify([root, action, options])], { env: secondEnv, timeout: 20000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
    });
  });
  await first.put("notes/first-only.md", "alpha exclusive evidence\n");
  await mkdir(path.join(secondRoot, "notes"), { recursive: true });
  await writeFile(path.join(secondRoot, "notes/second-only.md"), "beta exclusive evidence\n");
  const firstIndex = await first.run("index");
  const secondIndex = await program("index", {}, secondRoot);
  assert.equal(firstIndex.readiness.freshness, "fresh");
  assert.equal(secondIndex.readiness.freshness, "fresh");
  const keys = [rootKey(first.root), rootKey(secondRoot)];
  for (const key of keys) {
    assert.equal(existsSync(path.join(indexDir, "index", key, "qmd-cache", "qmd", "index.sqlite")), true);
  }
  assert.deepEqual((await first.run("search", { query: "exclusive" })).results.map(r => r.provenance.file), ["notes/first-only.md"]);
  assert.deepEqual((await program("search", { query: "exclusive" }, secondRoot)).results.map(r => r.provenance.file), ["notes/second-only.md"]);
  // Removing one root's index never disturbs the other root.
  await rm(path.join(indexDir, "index", rootKey(first.root)), { recursive: true, force: true });
  const survivor = await program("search", { query: "exclusive" }, secondRoot);
  assert.deepEqual(survivor.results.map(r => r.provenance.file), ["notes/second-only.md"]);
  assert.equal(survivor.readiness.freshness, "fresh");
  t.after(() => rm(indexDir, { recursive: true, force: true }));
});

test("default layout is unchanged when JUMPYBRAIN_INDEX_DIR is not set", async t => {
  const f = await setup(t);
  await f.put("notes/default.md", "default layout evidence\n");
  const result = await f.run("index");
  assert.equal(result.readiness.freshness, "fresh");
  assert.equal(existsSync(path.join(f.root, ".jumpybrain", "index.json")), true);
  assert.equal(existsSync(path.join(f.root, ".jumpybrain", "qmd-cache", "qmd", "index.sqlite")), true);
  const search = await f.run("search", { query: "layout" });
  assert.deepEqual(search.results.map(r => r.provenance.file), ["notes/default.md"]);
});
