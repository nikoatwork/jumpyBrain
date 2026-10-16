import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../uninstall.sh", import.meta.url));
for (const [name, body, status] of [
  ["success", "exit 0", 0],
  ["failure", "exit 7", 7],
  ["signal", 'kill -TERM "$PPID"; exit 0', 143],
]) {
  test(`downloaded uninstall cleans its scratch directory on ${name}`, { skip: process.platform === "win32" }, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-uninstall-shell-"));
    try {
      const tools = path.join(temp, "tools");
      const scratch = path.join(temp, "scratch");
      await mkdir(tools);
      await mkdir(scratch);
      await writeFile(path.join(tools, "mktemp"), '#!/bin/sh\nexec /usr/bin/mktemp -d "$TMPDIR/uninstall.XXXXXX"\n', { mode: 0o755 });
      await writeFile(path.join(tools, "node"), `#!/bin/sh\ntest -f "$1" || exit 99\n${body}\n`, { mode: 0o755 });
      await writeFile(path.join(tools, "curl"), '#!/bin/sh\nprintf "// offline fixture\\n" > "$4"\n', { mode: 0o755 });
      const result = spawnSync("sh", [script], {
        cwd: temp, encoding: "utf8", timeout: 5000,
        env: { ...process.env, TMPDIR: scratch, PATH: `${tools}:${process.env.PATH}` },
      });
      assert.equal(result.status, status, result.stderr);
      assert.deepEqual(await readdir(scratch), []);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}
