import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const adapter = new URL("../dist/adapters/qmd/qmd-lifecycle.js", import.meta.url).href;
const run = (code, args) => new Promise((resolve, reject) => {
  execFile(process.execPath, ["--input-type=module", "-e", code, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr || error.message)); else resolve(stdout);
  });
});

test("competing dead-owner reclaimers never remove a live lock or overlap publication", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".jumpybrain"));
  // A real exited PID, not an assumed platform PID maximum.
  const pid = Number(await run("console.log(process.pid)", []));
  await writeFile(path.join(root, ".jumpybrain/index.lock"), JSON.stringify({ pid, token: randomUUID() }));
  const code = `
    import { withQmdLock } from ${JSON.stringify(adapter)};
    import { openSync, closeSync, unlinkSync, appendFileSync } from 'node:fs';
    import path from 'node:path';
    const root = process.argv[1];
    for (let i = 0; i < 3; i++) await withQmdLock(root, async () => {
      const critical = path.join(root, 'critical');
      const fd = openSync(critical, 'wx'); closeSync(fd);
      await new Promise(resolve => setTimeout(resolve, 15));
      appendFileSync(path.join(root, 'events'), process.pid + '\\n');
      unlinkSync(critical);
    });
  `;
  await Promise.all(Array.from({ length: 10 }, () => run(code, [root])));
  assert.equal((await readFile(path.join(root, "events"), "utf8")).trim().split("\n").length, 30);
});
