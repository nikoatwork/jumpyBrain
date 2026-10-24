import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkedFile, contained, ExtensionPackageError } from "./validation.js";
import { cacheBytes, isExtensionSafeMode, pruneExtensionCache, type InstalledExtension, type PreparedExtension } from "./registry.js";

let preparations = 0;

/** esbuild is intentionally imported only by this explicit preparation path. */
export async function prepareExtension(directory: string, entry: InstalledExtension): Promise<PreparedExtension> {
  if (await isExtensionSafeMode(directory)) throw new ExtensionPackageError("Extension safe mode prevents compilation.");
  if (await pruneExtensionCache(directory, entry.manifest.id, entry.prepared?.revision) >= 8) throw new ExtensionPackageError("Extension cache revision limit reached; close other hosts and reload.");
  const sourceRoot = await realpath(entry.source);
  const sdk = await realpath(fileURLToPath(new URL("../../extensions/index.js", import.meta.url)));
  const { build, stop } = await import("esbuild");
  preparations++;
  const revision = randomUUID();
  const parent = path.join(directory, "cache", entry.manifest.id);
  const temporary = path.join(parent, `.${revision}.tmp`);
  const destination = path.join(parent, revision);
  try {
    await mkdir(temporary, { recursive: true, mode: 0o700 });
    const common: import("esbuild").BuildOptions = {
      absWorkingDir: sourceRoot, bundle: true, write: false, logLevel: "silent", sourcemap: false, legalComments: "inline", charset: "utf8",
      plugins: [{ name: "local-extension-boundary", setup(builder) {
        builder.onResolve({ filter: /^jumpybrain\/extensions(?:\.js)?$/ }, () => ({ path: sdk }));
        builder.onLoad({ filter: /.*/, namespace: "file" }, async (args) => {
          const file = await realpath(args.path);
          if (file !== sdk && !contained(sourceRoot, file)) throw new ExtensionPackageError("Extension imports must stay within the package and its local dependencies.");
          return undefined;
        });
      } }],
    };
    const main = await build({ ...common, entryPoints: [await checkedFile(sourceRoot, entry.manifest.main)], platform: "node", target: "node22", format: "esm", banner: { js: 'import { createRequire as __jbCreateRequire } from "node:module"; const require = __jbCreateRequire(import.meta.url);' } });
    let bytes = main.outputFiles![0].contents.byteLength;
    if (bytes > 4194304) throw new ExtensionPackageError("Prepared extension exceeds the 4 MiB revision limit.");
    let uiOutput: Uint8Array | undefined;
    if (entry.manifest.ui) {
      const ui = await build({ ...common, entryPoints: [await checkedFile(sourceRoot, entry.manifest.ui)], platform: "browser", target: "es2022", format: "iife", globalName: "__jumpyBrainExtensionUI", footer: { js: `globalThis.JumpyBrainExtensions.register(${JSON.stringify(entry.manifest.id)}, __jumpyBrainExtensionUI.default);` } });
      bytes += ui.outputFiles![0].contents.byteLength;
      if (bytes > 4194304) throw new ExtensionPackageError("Prepared extension exceeds the 4 MiB revision limit.");
      uiOutput = ui.outputFiles![0].contents;
    }
    if (await cacheBytes(directory) + bytes > 268435456) throw new ExtensionPackageError("Extension cache exceeds 256 MiB; stop the host and remove unused cached revisions before reloading.");
    await writeFile(path.join(temporary, "main.mjs"), main.outputFiles![0].contents, { mode: 0o600 });
    if (uiOutput) await writeFile(path.join(temporary, "ui.js"), uiOutput, { mode: 0o600 });
    // Do not publish incomplete or safe-mode preparations.
    if (await isExtensionSafeMode(directory)) throw new ExtensionPackageError("Extension safe mode prevents compilation.");
    await rename(temporary, destination);
    return { revision };
  } catch (error) {
    if (error instanceof ExtensionPackageError) throw error;
    throw new ExtensionPackageError("Extension compilation failed; check package entries and local dependencies.", { cause: error });
  } finally {
    try { await rm(temporary, { recursive: true, force: true }); }
    finally { preparations--; if (preparations === 0) stop(); }
  }
}
