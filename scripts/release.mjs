#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { nextReleaseVersion, releaseOptions } from "./release-policy.mjs";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const capture = (command, args) => execFileSync(command, args, { cwd, encoding: "utf8" }).trimEnd();
const run = (command, args) => execFileSync(command, args, { cwd, stdio: "inherit" });
try {
  const options = releaseOptions(process.argv.slice(2));
  const current = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")).version;
  const next = nextReleaseVersion(current, options.bump, options.approveMajor);
  const tag = `v${next}`;
  if (capture("git", ["status", "--porcelain"])) throw new Error("Commit current work first; releases require a clean working tree.");
  if (capture("git", ["branch", "--show-current"]) !== "master") throw new Error("Release from master.");
  if (capture("git", ["tag", "--list", tag])) throw new Error(`Tag ${tag} already exists; inspect/resume that release instead of overwriting it.`);
  console.log(`Release ${current} → ${next}: validate, pack, commit, tag, push, publish${next.startsWith("0.") ? " (beta)" : ""}.`);
  if (options.dryRun) process.exit(0);
  run("gh", ["auth", "status"]);
  run("git", ["fetch", "origin", "master", "--tags"]);
  // Remote fetch can reveal an existing tag absent from the local preflight.
  if (capture("git", ["tag", "--list", tag])) throw new Error(`Remote tag ${tag} already exists.`);
  run("git", ["merge-base", "--is-ancestor", "origin/master", "HEAD"]);
  const repository = capture("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  run("npm", ["version", next, "--no-git-tag-version", "--ignore-scripts"]);
  run("npm", ["test"]);
  run("npm", ["run", "cli:pack"]);
  const changes = capture("git", ["status", "--porcelain"]);
  if (changes.split("\n").some(line => !["package.json", "package-lock.json"].includes(line.slice(3)))) {
    throw new Error("Files changed during release beyond version metadata; inspect them before committing or publishing.");
  }
  run("git", ["add", "--", "package.json", "package-lock.json"]);
  run("npm", ["run", "guard:staged"]);
  run("git", ["commit", "-m", `release: ${tag}${next.startsWith("0.") ? " (beta)" : ""}`]);
  run("git", ["tag", "-a", tag, "-m", `jumpyBrain ${tag}`]);
  run("git", ["push", "--atomic", "origin", "HEAD:refs/heads/master", `refs/tags/${tag}`]);
  const pack = JSON.parse(readFileSync(path.join(cwd, ".local-pack/latest.json"), "utf8"));
  const notes = path.join(cwd, "docs/releases", `${tag}.md`);
  run("gh", ["release", "create", tag, pack.tarballPath, "--repo", repository, "--verify-tag",
    "--title", `jumpyBrain ${tag}${next.startsWith("0.") ? " (beta)" : ""}`,
    ...(existsSync(notes) ? ["--notes-file", notes] : ["--generate-notes"]),
    ...(next.startsWith("0.") ? ["--prerelease"] : [])]);
} catch (error) {
  console.error(error.message);
  console.error("Release stopped. Existing commits/tags are not reset or deleted; see docs/releases.md for recovery.");
  process.exitCode = 1;
}
