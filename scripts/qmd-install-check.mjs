#!/usr/bin/env node
// Installer-only capability check. Never imports QMD or initializes models/state.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const QMD_PACKAGE = "@tobilu/qmd@2.8.3";
export const QMD_VERSION = "2.8.3";

export function checkQmdInstallation(binary = "qmd", env = process.env) {
  try {
    const candidate = path.isAbsolute(binary) || binary.includes(path.sep) ? binary
      : (env.PATH ?? "").split(path.delimiter).map(dir => path.join(dir, binary)).find(file => existsSync(file));
    if (!candidate) return false;
    let dir = path.dirname(realpathSync(candidate));
    while (true) {
      const manifest = path.join(dir, "package.json");
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        if (pkg.name === "@tobilu/qmd") {
          if (pkg.version !== QMD_VERSION || !["index.js", "store.js", "llm.js"].every(file => statSync(path.join(dir, "dist", file)).isFile())) return false;
          const result = spawnSync(candidate, ["--version"], { encoding: "utf8", env, timeout: 10_000 });
          const version = result.stdout?.trim().match(/^(?:qmd\s+)?v?(\d+\.\d+\.\d+)(?:\s+\([a-f0-9]+\))?$/i)?.[1];
          return result.status === 0 && version === QMD_VERSION;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  } catch { return false; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!checkQmdInstallation(process.argv[2] || "qmd")) {
    console.error(`Install ${QMD_PACKAGE} with CLI and SDK together; check JUMPYBRAIN_QMD_BIN/PATH.`);
    process.exitCode = 1;
  }
}
