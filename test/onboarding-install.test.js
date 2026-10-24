import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installFakeQmd } from "./fake-qmd-helper.js";

const repo = new URL("..", import.meta.url).pathname;
const installer = path.join(repo, "scripts/public-install.mjs");

test("onboarding preview is truthful and installed shell/agent examples preserve literal paths", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "jb-onboarding-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, "Project with spaces");
  const home = path.join(temporary, 'home \' " $& $(touch QUOTING_BROKE) `touch BACKTICKS_BROKE`');
  await mkdir(project);
  const installRoot = path.join(home, ".jumpybrain");
  const { bin } = await installFakeQmd(temporary);
  await writeFile(bin, '#!/usr/bin/env node\nconsole.log(process.argv.includes("--version") ? "qmd 2.8.3" : "[]");\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, JUMPYBRAIN_QMD_BIN: bin };
  const run = (command, args, input) => {
    const result = spawnSync(command, args, { cwd: project, env, input, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  const args = [installer, "--source", repo, "--home", home, "--install-root", installRoot,
    "--scope", "project", "--cwd", project, "--integrations", "all", "--skip-build", "--skip-qmd-install"];
  const preview = run(process.execPath, [...args, "--dry-run"]);
  assert.match(preview, /Dry run: planning/);
  assert.match(preview, /dry run complete\. No changes made/);
  assert.match(preview, /Integrations planned \(would install\)/);
  assert.doesNotMatch(preview, /jumpyBrain install complete|Integrations installed|Then ask:/);
  assert.equal(existsSync(installRoot), false);
  assert.equal(existsSync(path.join(project, "memory")), false);
  assert.equal(existsSync(path.join(project, ".claude")), false);

  const installed = run(process.execPath, args);
  assert.match(installed, /jumpyBrain install complete/);
  assert.match(installed, /Local text search is ready/);
  assert.match(installed, /Restart or reload any assistant/);
  assert.match(installed, /In a fresh session, ask:/);
  const lines = installed.split("\n");
  const verify = lines[lines.findIndex(line => line.startsWith("Try (")) + 1];
  assert.match(run("sh", ["-c", verify]), /No memory matches found/);
  const pathCommand = lines.find(line => line.startsWith("export PATH="));
  const cli = path.join(installRoot, "bin/jumpybrain");
  assert.equal(run("sh", ["-c", pathCommand + '\ncommand -v jumpybrain']).trim(), cli);

  const skill = await readFile(path.join(project, ".claude/skills/jumpybrain-memory/SKILL.md"), "utf8");
  assert.doesNotMatch(skill, /__JUMPYBRAIN_/);
  assert.equal(await readFile(path.join(project, ".agents/skills/jumpybrain-memory/SKILL.md"), "utf8"), skill);
  const remember = skill.split("\n").find(line => line.includes(" remember --root ")).trim().replace(/^\|\s*/, "").replace("<short title>", "Onboarding decision");
  const saved = JSON.parse(run("sh", ["-c", remember + " --json"], "Weekly releases apply only to synthetic Aurora.\n"));
  assert.equal(saved.saved, true);
  const canonical = await readFile(path.join(project, "memory", saved.file), "utf8");
  assert.match(canonical, /Weekly releases apply only to synthetic Aurora/);
  const recall = skill.split("\n").find(line => line.includes(" recall --root ")).replace("<current task/topic>", "Aurora");
  assert.equal(JSON.parse(run("sh", ["-c", recall])).kind, "recall");
  const pi = await readFile(path.join(project, ".pi/extensions/jumpybrain-memory.ts"), "utf8");
  for (const [constant, expected] of [["LOCAL_MEMORY_ROOT", path.join(project, "memory")], ["JUMPYBRAIN_BIN", cli]]) {
    const literal = pi.match(new RegExp(`const ${constant} = .*? \\|\\| (.*);`))[1];
    assert.equal(JSON.parse(literal), expected, "Pi receives literal JS strings, not shell syntax");
  }
  for (const name of ["QUOTING_BROKE", "BACKTICKS_BROKE"]) assert.equal(existsSync(path.join(project, name)), false);
});
