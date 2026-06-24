#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { forbiddenLocalPackFiles, requiredLocalPackFiles, validateLocalPackFiles } from "./local-pack-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, ".local-pack");
const packageJsonPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));

await mkdir(outDir, { recursive: true });
run("npm", ["run", "build"]);

const pack = run("npm", ["pack", "--pack-destination", outDir, "--json"], { capture: true });
const packInfo = parsePackInfo(pack.stdout);
const tarballName = packInfo.filename;
const tarballPath = path.join(outDir, tarballName);
const tarballFiles = listTarballFiles(tarballPath);
validateLocalPackFiles(tarballFiles);

const metadata = {
  name: pkg.name,
  version: pkg.version,
  bin: pkg.bin,
  tarball: tarballName,
  tarballPath,
  createdAt: new Date().toISOString(),
  installCommand: `npm install -D ${JSON.stringify(tarballPath)}`,
  verifiedFiles: requiredLocalPackFiles,
  forbiddenFilesChecked: forbiddenLocalPackFiles,
};

await writeFile(path.join(outDir, "latest.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log(`Packed ${pkg.name}@${pkg.version}`);
console.log(tarballPath);
console.log(`Verified ${requiredLocalPackFiles.length} required CLI/runtime files and rejected stale QMD retrieval paths.`);
console.log(`Install with: ${metadata.installCommand}`);

function parsePackInfo(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const [info] = Array.isArray(parsed) ? parsed : [];
    if (info?.filename) return info;
  } catch (error) {
    throw new Error(`npm pack did not return parseable JSON: ${error.message}\nstdout:\n${stdout}`);
  }
  throw new Error(`npm pack did not report a tarball filename. stdout:\n${stdout}`);
}

function listTarballFiles(tarballPath) {
  return run("tar", ["-tf", tarballPath], { capture: true }).stdout.trim().split(/\r?\n/).filter(Boolean);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    process.exit(result.status ?? 1);
  }

  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
