#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, ".local-pack");
const packageJsonPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));

await mkdir(outDir, { recursive: true });
run("npm", ["run", "build"]);

const pack = run("npm", ["pack", "--pack-destination", outDir], { capture: true });
const tarballName = pack.stdout.trim().split(/\r?\n/).findLast((line) => line.endsWith(".tgz"));
if (!tarballName) throw new Error(`npm pack did not report a tarball name. stdout:\n${pack.stdout}`);

const tarballPath = path.join(outDir, tarballName);
const metadata = {
  name: pkg.name,
  version: pkg.version,
  tarball: tarballName,
  tarballPath,
  createdAt: new Date().toISOString(),
  installCommand: `npm install -D ${JSON.stringify(tarballPath)}`,
};

await writeFile(path.join(outDir, "latest.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log(`Packed ${pkg.name}@${pkg.version}`);
console.log(tarballPath);
console.log(`Install with: ${metadata.installCommand}`);

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
