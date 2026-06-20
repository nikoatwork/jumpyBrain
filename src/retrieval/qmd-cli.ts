import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export const QMD_COLLECTION = "jumpybrain";

export function derivedRoot(root: string): string {
  return path.join(root, ".jumpybrain");
}

export function manifestPath(root: string): string {
  return path.join(derivedRoot(root), "index.json");
}

export async function rebuildQmdCliCollection(root: string, options: { embed: boolean; sourceRoot?: string }): Promise<void> {
  const derived = derivedRoot(root);
  const sourceRoot = options.sourceRoot ?? root;
  await rm(path.join(derived, "qmd-cache"), { recursive: true, force: true });
  await rm(path.join(derived, "qmd-config"), { recursive: true, force: true });
  await mkdir(path.join(derived, "qmd-cache"), { recursive: true });
  await mkdir(path.join(derived, "qmd-config"), { recursive: true });
  await mkdir(path.join(derived, "qmd-home"), { recursive: true });

  runQmd(root, ["collection", "add", sourceRoot, "--name", QMD_COLLECTION, "--mask", "**/*.md"]);
  runQmd(root, ["update"]);

  if (options.embed) runQmd(root, ["embed"]);
}

export function runQmd(root: string, args: string[]): { stdout: string; stderr: string } {
  const derived = derivedRoot(root);
  const result = spawnSync("qmd", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      HOME: path.join(derived, "qmd-home"),
      XDG_CACHE_HOME: path.join(derived, "qmd-cache"),
      QMD_CONFIG_DIR: path.join(derived, "qmd-config"),
      GGML_METAL_NO_RESIDENCY: process.env.QMD_METAL_KEEP_RESIDENCY ? process.env.GGML_METAL_NO_RESIDENCY : "1",
    },
  });

  if (result.error && result.error.message.includes("ENOENT")) {
    throw new Error("qmd CLI is required. Install with: npm install -g @tobilu/qmd");
  }

  if (result.status !== 0) {
    throw new Error(`qmd ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

export function qmdVirtualPathToRelative(file: string): string | undefined {
  const prefix = `qmd://${QMD_COLLECTION}/`;
  if (!file.startsWith(prefix)) return undefined;
  return decodeURIComponent(file.slice(prefix.length));
}

export function normalizeQmdLookupPath(file: string): string {
  return file.toLowerCase().replace(/_/g, "-");
}
