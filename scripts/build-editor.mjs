import { build, transform } from "esbuild";
import { readFile, writeFile, readdir, cp, rm, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { resolveFeedbackUrl } from './feedback-config.mjs';

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const { version } = pkg;
// Compact CLI, backend-ownership and local retrieval/app artifacts. Keep source, declarations,
// identifiers, syntax and legal notices; no new bundle or runtime dependency.
for (const directory of ["cli", "adapters/backend-host", "app/backend-host", "adapters/qmd", "app/local-memory", "app", "app/collaboration", "adapters/http-server"]) {
  for (const name of await readdir(`dist/${directory}`)) {
    if (!name.endsWith(".js")) continue;
    if (directory === "adapters/http-server" && !["collaboration-editor.js", "live-editor-session.js", "generation-feedback.js", "document-retained-versions.js"].includes(name)) continue;
    // The frozen retrieval evaluator instruments these exact emitted seams.
    if (["adapters/qmd/qmd-query.js", "adapters/qmd/qmd-driver.js", "app/local-memory/compact.js"].includes(`${directory}/${name}`)) continue;
    const file = `dist/${directory}/${name}`;
    const result = await transform(await readFile(file, "utf8"), {
      minifyWhitespace: true, minifyIdentifiers: false, minifySyntax: false,
      target: "node22", legalComments: "inline",
    });
    await writeFile(file, result.code);
  }
}
// Public routing configuration only; the native helper deliberately drops shell env.
const feedbackUrl = resolveFeedbackUrl(pkg);
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
// Executable-extension presentation is a desktop-only optional surface. Keep it
// out of the ordinary hosted editor bundle and its existing weight budget.
const extensionResult = await build({
  entryPoints: ["src/adapters/http-server/extensions-browser.ts"],
  bundle: true, minify: true, platform: "browser", format: "iife", globalName: "JumpyBrainExtensionBrowser", target: "es2022",
  legalComments: "eof", write: false,
});
const extensionBundle = extensionResult.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await writeFile("dist/adapters/http-server/extensions-bundle.js", extensionBundle);
// The drawing editor is a separate lazy application: an isolated frame loads it
// only when a drawing is opened, so the note editor bundle and its gate are unchanged.
const drawingOut = "dist/adapters/http-server/drawing-app";
await rm(drawingOut, { recursive: true, force: true });
const drawingStubs = { name: "drawing-stubs", setup(setup) {
  // English only, and no Mermaid import: both are large optional downloads.
  setup.onResolve({ filter: /\/locales\/[^/]+\.js$/ }, (args) => /\/locales\/en-/.test(args.path) ? null : { path: "empty", namespace: "drawing-stub" });
  setup.onResolve({ filter: /^@excalidraw\/mermaid-to-excalidraw$/ }, () => ({ path: "empty", namespace: "drawing-stub" }));
  setup.onLoad({ filter: /.*/, namespace: "drawing-stub" }, () => ({ contents: "export default {};", loader: "js" }));
} };
const drawingResult = await build({
  entryPoints: [{ in: "src/adapters/http-server/drawing-frame-entry.ts", out: "drawing" },
    { in: "src/adapters/http-server/drawing-frame-assets.ts", out: "boot" },
    { in: "node_modules/@excalidraw/excalidraw/dist/prod/index.css", out: "drawing" }],
  bundle: true, minify: true, platform: "browser", format: "esm", splitting: true, target: "es2022", conditions: ["production"],
  outdir: drawingOut, chunkNames: "chunk-[hash]", assetNames: "fonts/[name]-[hash]", loader: { ".woff2": "file" },
  define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", metafile: true, plugins: [drawingStubs],
});
// Canvas fonts load on demand from this origin. The 12 MB CJK handwriting face is
// left out; CJK text falls back to system fonts.
const drawingFonts = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
for (const family of await readdir(drawingFonts)) {
  if (family !== "Xiaolai") await cp(`${drawingFonts}/${family}`, `${drawingOut}/fonts/${family}`, { recursive: true });
}
const noticePackages = (inputs) => new Set(Object.keys(inputs).flatMap((file) => {
  const match = file.match(/^node_modules\/(?:@[^/]+\/[^/]+|[^/]+)/);
  return match ? [match[0]] : [];
}));
const drawingNotices = [];
for (const folder of [...noticePackages(drawingResult.metafile.inputs)].sort()) {
  const names = (await readdir(folder)).filter((name) => /^licen[sc]e/i.test(name));
  const text = names.length ? await readFile(`${folder}/${names[0]}`, "utf8")
    : `License: ${JSON.parse(await readFile(`${folder}/package.json`, "utf8")).license ?? "see package"}`;
  drawingNotices.push(`${folder}\n\n${text}`);
}
await writeFile(`${drawingOut}/LICENSES.txt`, drawingNotices.join("\n\n---\n\n"));
let drawingBytes = 0;
for (const name of await readdir(drawingOut, { recursive: true })) {
  const info = await stat(`${drawingOut}/${name}`);
  if (info.isFile()) drawingBytes += info.size;
}
const drawingEntry = await readFile(`${drawingOut}/drawing.js`);
const packages = new Set(Object.keys(result.metafile.inputs).flatMap((file) => {
  const match = file.match(/^node_modules\/(?:@[^/]+\/[^/]+|[^/]+)/);
  return match ? [match[0]] : [];
}));
const notices = await Promise.all([...packages].sort().map(async (folder) => `${folder}\n\n${await readFile(`${folder}/LICENSE`, "utf8")}`));
await writeFile("dist/adapters/http-server/editor-LICENSES.txt", notices.join("\n\n---\n\n"));
console.log(`Lexical editor: ${Buffer.byteLength(bundle)} bytes minified, ${gzipSync(bundle).length} bytes gzip (${packages.size} bundled packages).`);
console.log(`Drawing editor (lazy frame): ${drawingBytes} bytes on disk, entry ${drawingEntry.length} bytes minified, ${gzipSync(drawingEntry).length} bytes gzip.`);
console.log(`Optional desktop extensions UI: ${Buffer.byteLength(extensionBundle)} bytes minified, ${gzipSync(extensionBundle).length} bytes gzip.`);

// npm omits the root lockfile; carry the exact release dependency graph with built assets.
await writeFile("dist/runtime-package-lock.json", await readFile("package-lock.json"));

// Desktop updates copy dist without installing the root dependency graph. Ship
// the JS-only WebSocket transport with it; optional native accelerators are off.
await build({
  entryPoints: ["src/adapters/websocket/index.ts"], outfile: "dist/adapters/websocket/index.js",
  bundle: true, platform: "node", format: "esm", target: "node22", legalComments: "eof",
  banner: { js: "import { createRequire as __jbCreateRequire } from 'node:module'; const require = __jbCreateRequire(import.meta.url);" },
  define: { "process.env.WS_NO_BUFFER_UTIL": '"1"', "process.env.WS_NO_UTF_8_VALIDATE": '"1"' },
});
await writeFile("dist/adapters/websocket/ws-LICENSE.txt", await readFile("node_modules/ws/LICENSE"));
