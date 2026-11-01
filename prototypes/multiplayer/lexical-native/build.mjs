import { build } from "../../../node_modules/esbuild/lib/main.js";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const editorFile = path.join(root, "src/adapters/http-server/lexical-editor.ts");
const editorSource = await readFile(editorFile, "utf8");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const replacements = [
  ["  const api = {\n", "  const api = {\n    __m1: { editor, sources, serialize },\n"],
  ["registerHistory(editor, history, 300)", "(() => () => {})()"],
];
let instrumented = editorSource;
for (const [before, after] of replacements) {
  if (instrumented.split(before).length !== 2) throw new Error("Prototype instrumentation guard failed: " + before);
  instrumented = instrumented.replace(before, after);
}
const rootRequire = createRequire(path.join(root, "package.json"));
const nativeRequire = createRequire(path.join(directory, "package.json"));

export async function buildPrototype() {
  const options = {
    bundle: true, write: false,
    platform: "browser", format: "iife", target: "es2022", minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "guarded-real-editor-prototype-hooks", setup(builder) {
      builder.onResolve({ filter: /^(?:lexical$|@lexical\/)/ }, (args) => ({
        path: args.path === "@lexical/yjs" ? nativeRequire.resolve(args.path) : rootRequire.resolve(args.path),
      }));
      builder.onLoad({ filter: /lexical-editor\.ts$/ }, (args) => args.path === editorFile
        ? { contents: instrumented, loader: "ts", resolveDir: path.dirname(editorFile) } : undefined);
    } }],
  };
  const result = await build({ ...options, entryPoints: [path.join(directory, "browser.ts")] });
  const control = await build({ ...options, stdin: {
    contents: 'import { createNoteEditor } from "../../../src/adapters/http-server/lexical-editor.ts"; Object.assign(window, { createNativeControl: createNoteEditor });',
    resolveDir: directory, loader: "ts",
  } });
  const bytes = result.outputFiles[0].contents;
  const controlBytes = control.outputFiles[0].contents;
  return {
    script: result.outputFiles[0].text,
    metrics: { minifiedBytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength,
      editorOnlyMinifiedBytes: controlBytes.byteLength, editorOnlyGzipBytes: gzipSync(controlBytes).byteLength,
      incrementalGzipBytes: gzipSync(bytes).byteLength - gzipSync(controlBytes).byteLength,
      sourceSha256: hash(editorSource), instrumentedSha256: hash(instrumented),
      bindings: "@lexical/yjs@0.51.0 (V1 stable), yjs@13.6.33",
      hooks: replacements.map(([before]) => before.trim()),
      limitations: ["Prototype-only exact-guarded hooks expose private editor state.", "Existing local history is disabled only in this generated bundle; Yjs UndoManager owns collaborative undo.", "No production source or shared dist is edited."] },
  };
}
