#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".git")) {
  throw new Error("This script must be run from the repository root.");
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
console.log("Configured git core.hooksPath=.githooks");
console.log("pre-commit will run: node scripts/precommit-guard.mjs");
console.log("commit-msg will run: node scripts/commit-msg-guard.mjs (strips AI co-author trailers)");
