import { build } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
// Public routing configuration only; the native helper deliberately drops shell env.
const feedbackUrl = process.env.JUMPYBRAIN_FEEDBACK_URL ?? "";
if (feedbackUrl) {
  const url = new URL(feedbackUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Feedback URL must use HTTPS without credentials or a fragment.");
}
await writeFile("dist/adapters/http-server/feedback-config.json", JSON.stringify({ url: feedbackUrl }));
const fingerprint = createHash("sha256").update(version);
fingerprint.update(feedbackUrl);
for (const name of (await readdir("src", { recursive: true })).filter((name) => name.endsWith(".ts")).sort()) fingerprint.update(name).update(await readFile(`src/${name}`));
const buildId = fingerprint.digest("hex").slice(0, 16);
await writeFile("dist/adapters/diagnostics/build-info.json", JSON.stringify({ version, build: buildId }));
const result = await build({
  entryPoints: ["src/adapters/http-server/browser-entry.ts"],
  bundle: true, minify: true, platform: "browser", format: "iife", globalName: "JumpyBrainBrowser", target: "es2022",
  define: { "process.env.NODE_ENV": '"production"', __JUMPYBRAIN_VERSION__: JSON.stringify(version), __JUMPYBRAIN_BUILD__: JSON.stringify(buildId) },
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
