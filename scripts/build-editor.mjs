import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const result = await build({
  entryPoints: ["src/adapters/http-server/browser-entry.ts"],
  bundle: true, minify: true, platform: "browser", format: "iife", globalName: "JumpyBrainBrowser", target: "es2022",
  define: { "process.env.NODE_ENV": '"production"', __JUMPYBRAIN_VERSION__: JSON.stringify(version) },
  legalComments: "eof", write: false, metafile: true,
});
// Safe to embed inside a nonce-protected script, even if dependencies contain HTML.
const bundle = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await writeFile("dist/adapters/http-server/editor-bundle.js", bundle);
const packages = new Set(Object.keys(result.metafile.inputs).flatMap((file) => {
  const match = file.match(/^node_modules\/(?:@[^/]+\/[^/]+|[^/]+)/);
  return match ? [match[0]] : [];
}));
const notices = await Promise.all([...packages].sort().map(async (folder) => `${folder}\n\n${await readFile(`${folder}/LICENSE`, "utf8")}`));
await writeFile("dist/adapters/http-server/editor-LICENSES.txt", notices.join("\n\n---\n\n"));
console.log(`Lexical editor: ${Buffer.byteLength(bundle)} bytes minified, ${gzipSync(bundle).length} bytes gzip (${packages.size} bundled packages).`);
