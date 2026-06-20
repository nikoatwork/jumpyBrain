#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const bumpOrVersion = args[0] ?? "prerelease";
const passthrough = args.slice(1);

const result = spawnSync("npm", ["version", bumpOrVersion, "--no-git-tag-version", ...passthrough], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  stdio: "pipe",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
