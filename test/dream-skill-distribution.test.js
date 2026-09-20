import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const skillPath = "skills/how-to-dream/SKILL.md";
const read = (file) => readFile(path.join(root, file), "utf8");
const shellBlocks = (text) => [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);

async function scratch(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-skill-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("how-to-dream is a portable 80–120 line skill with explicit triggers", async () => {
  const skill = await read(skillPath);
  const lines = skill.trimEnd().split("\n");
  assert.ok(lines.length >= 80 && lines.length <= 120, `${lines.length} lines`);
  assert.match(skill, /^---\nname: how-to-dream\ndescription: .+\n---\n/);
  assert.match(skill, /when the user asks/);
  assert.match(skill, /JUMPYBRAIN_MEMORY_ROOT/);
  assert.match(skill, /Ask if ambiguous/);
  assert.doesNotMatch(skill, /\/Users\/|\/home\/[a-zA-Z]|[A-Z]:\\Users\\|__JUMPYBRAIN_/);
});

test("skill examples use supported commands and only the window/create/edit flag contract", async () => {
  const skill = await read(skillPath);
  const commands = await read("src/cli/commands.ts");
  const allowed = {
    status: ["root", "json"],
    dream: ["root", "from", "days", "date-basis", "offset", "max-files", "bytes-per-file", "max-total-bytes", "out", "json"],
    recall: ["root", "topic", "depth", "limit", "json"],
    search: ["root", "query", "depth", "limit", "json"],
    show: ["root", "id", "json"],
    remember: ["root", "type", "dream", "title"],
    update: ["root", "id", "if-match"],
    index: ["root"],
  };
  const examples = [...skill.matchAll(/jumpybrain ([a-z-]+)([^\n`]*)/g)];
  assert.ok(examples.length >= 12);
  for (const [, command, args] of examples) {
    assert.ok(Object.hasOwn(allowed, command), `unsupported command: ${command}`);
    assert.ok(commands.includes(`"${command}"`), `not dispatched: ${command}`);
    for (const [, flag] of args.matchAll(/--([a-z-]+)/g)) {
      assert.ok(allowed[command].includes(flag), `unsupported ${command} --${flag}`);
    }
  }
  const runnable = shellBlocks(skill).join("\n");
  assert.match(runnable, /remember --root "\$ROOT" --type page --dream --title "Topic map" < body\.md/);
  assert.match(runnable, /show --root "\$ROOT" --id "\$ID" --json/);
  assert.match(runnable, /update --root "\$ROOT" --id "\$ID" --if-match "\$HASH" < revised\.md/);
  assert.doesNotMatch(runnable, /--(?:status|complete|abandon|force|apply-manifest)\b/);
  assert.match(runnable, /--from t-0d --days 3/);
  assert.match(runnable, /--from t-1d --days 3/);
  assert.match(runnable, /--from 2022-05-01 --days 3/);
  assert.match(runnable, /--date-basis modified/);
  assert.match(runnable, /--from t-3d --days 3/);
});

test("skill retains permission, preservation, provenance, and bounded-review caveats", async () => {
  const skill = await read(skillPath);
  for (const pattern of [
    /explicit permission before global\/team\/remote writes, including indexing/,
    /read permission is not write permission/,
    /work-only scope/,
    /ten source files.*five follow-up reads.*two page writes.*ten minutes/,
    /untrusted data/,
    /source notes\/journals and non-dream human-authored pages alone/,
    /soft preservation, not an ACL/,
    /existing relevant dream page over duplicating/,
    /old task is still open/,
    /not independent corroboration/,
    /no-op/,
    /Evidence period:/,
    /dream: true/,
    /dream: false/,
    /stale hash, re-show/,
    /missing-ID sources/,
    /unread\/truncated evidence/,
    /Concurrent edits can shift offsets/,
    /not a snapshot, exact coverage proof/,
    /no completion step/,
  ]) assert.match(skill, pattern);
});

test("skill is discoverable and repository-relative links resolve", async () => {
  for (const file of ["README.md", "docs/agent-workflows.md", "docs/install.md", "skills/jumpybrain-memory/SKILL.md"]) {
    const text = await read(file);
    assert.match(text, /how-to-dream/);
    const links = [...text.matchAll(/\]\(([^)]+how-to-dream[^)]*)\)/g)];
    assert.ok(links.length, `no skill link in ${file}`);
    for (const [, target] of links) {
      if (/^https?:/.test(target)) continue;
      await access(path.resolve(root, path.dirname(file), target.split("#")[0]));
    }
  }
});

test("user docs teach window reads rather than runnable legacy batch commands", async () => {
  for (const file of ["docs/agent-workflows.md", "docs/cli-commands.md", "docs/technical.md", "docs/shared-memory-protocol.md"]) {
    const text = await read(file);
    assert.match(text, /window/);
    assert.match(text, /UTC/);
    assert.match(text, /Legacy|legacy/);
    assert.match(text, /concurrent edits|Concurrent edits/);
    for (const block of shellBlocks(text)) {
      for (const line of block.split("\n").filter((line) => /jumpybrain dream\b/.test(line))) {
        assert.doesNotMatch(line, /--(?:status|complete|abandon|force|apply-manifest)\b/, `${file}: ${line}`);
        assert.match(line, /--from/);
      }
    }
  }
});

test("optional documented copy installs only the skill into a disposable project", async (t) => {
  const dir = await scratch(t);
  const source = path.join(dir, skillPath);
  await mkdir(path.dirname(source), { recursive: true });
  await copyFile(path.join(root, skillPath), source);
  const docs = await read("docs/install.md");
  const section = docs.split("### Optional how-to-dream skill\n")[1].split("### Installer options")[0];
  assert.match(section, /does \*\*not\*\* silently/);
  assert.match(section, /not installer-managed ownership/);
  const [script] = shellBlocks(section);
  assert.ok(script);
  const result = spawnSync("bash", ["-e", "-c", script], {
    cwd: dir, encoding: "utf8", env: { ...process.env, HOME: dir }, input: "n\n",
  });
  assert.equal(result.status, 0, result.stderr);
  const installed = path.join(dir, ".agents/skills/how-to-dream/SKILL.md");
  assert.equal(await readFile(installed, "utf8"), await read(skillPath));
  assert.deepEqual((await readdir(dir)).sort(), [".agents", "skills"]);
  assert.deepEqual(await readdir(path.dirname(installed)), ["SKILL.md"]);
  // A rerun with the documented interactive copy must not silently clobber edits.
  await writeFile(installed, "User customization\n");
  const retry = spawnSync("bash", ["-e", "-c", script], {
    cwd: dir, encoding: "utf8", env: { ...process.env, HOME: dir }, input: "n\n",
  });
  // BSD cp reports a declined overwrite as 1; GNU cp may report 0.
  assert.ok([0, 1].includes(retry.status), retry.stderr);
  assert.equal(await readFile(installed, "utf8"), "User customization\n");
});

test("npm package includes both skills and their discovery/install documentation without running installers", async (t) => {
  const dir = await scratch(t);
  const pkg = JSON.parse(await read("package.json"));
  assert.ok(pkg.files.includes("skills"));
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", path.join(dir, "cache")], {
    cwd: root, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(packed.status, 0, packed.stderr);
  const files = new Set(JSON.parse(packed.stdout)[0].files.map((file) => file.path));
  for (const file of [skillPath, "skills/jumpybrain-memory/SKILL.md", "docs/install.md", "docs/agent-workflows.md", "docs/cli-commands.md", "README.md"]) {
    assert.ok(files.has(file), `not packed: ${file}`);
  }
});
