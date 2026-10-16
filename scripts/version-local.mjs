#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nextReleaseVersion, releaseOptions } from "./release-policy.mjs";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const options = releaseOptions(process.argv.slice(2));
const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const next = nextReleaseVersion(current, options.bump, options.approveMajor);
if (options.dryRun) console.log(`${current} → ${next}`);
else execFileSync("npm", ["version", next, "--no-git-tag-version", "--ignore-scripts"], { cwd, stdio: "inherit" });
