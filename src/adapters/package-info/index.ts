import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Capture identity when this runtime loads, before an updater can replace the
// package at the same path. A running old backend must keep reporting its build.
const executingVersion = readPackageVersion();

export function packageVersion(): Promise<string> {
  return executingVersion;
}

async function readPackageVersion(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageJson = path.resolve(here, "../../..", "package.json");
  try {
    const parsed = JSON.parse(await readFile(packageJson, "utf8")) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
