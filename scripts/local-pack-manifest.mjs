const distFile = (...segments) => ["package", "dist", ...segments].join("/");
const moduleFiles = (...segments) => [`${distFile(...segments)}.js`, `${distFile(...segments)}.d.ts`];
const distDirPrefix = (...segments) => `${distFile(...segments)}/`;

export const requiredLocalPackFiles = Object.freeze([
  "package/package.json",
  "package/scripts/remote-target-origin.mjs",
  distFile("cli.js"),
  distFile("index.js"),
  distFile("cli", "index.js"),
  distFile("cli", "commands.js"),
  distFile("cli", "dream.js"),
  distFile("cli", "recipes.js"),
  distFile("cli", "remote-access-policy.js"),
  distFile("cli", "args.js"),
  distFile("cli", "doctor.js"),
  distFile("cli", "formatting.js"),
  distFile("cli", "instructions.js"),
  distFile("cli", "local-transport.js"),
  distFile("cli", "memory-commands.js"),
  distFile("cli", "memory-target.js"),
  distFile("cli", "memory-write.js"),
  distFile("cli", "serve.js"),
  distFile("cli", "stdin.js"),
  distFile("cli", "targets.js"),
  distFile("cli", "update.js"),
  distFile("cli", "usage.js"),
  ...moduleFiles("app", "writing", "index"),
  ...moduleFiles("app", "writing", "filesystem"),
  ...moduleFiles("app", "writing", "local-writer"),
  ...moduleFiles("app", "writing", "remote-writer"),
  ...moduleFiles("app", "local-memory", "index"),
  ...moduleFiles("app", "dream", "index"),
  ...moduleFiles("app", "processing", "index"),
  ...moduleFiles("app", "processing", "ensure-ids"),
  ...moduleFiles("app", "processing", "processor"),
  ...moduleFiles("app", "server-memory", "index"),
  ...moduleFiles("app", "server-memory", "auto-index"),
  ...moduleFiles("app", "server-memory", "dream"),
  ...moduleFiles("app", "server-memory", "state"),
  ...moduleFiles("app", "server-memory", "idempotency"),
  ...moduleFiles("adapters", "http-protocol"),
  ...moduleFiles("adapters", "http-client", "index"),
  ...moduleFiles("adapters", "http-server", "index"),
  ...moduleFiles("adapters", "http-server", "routes"),
  ...moduleFiles("adapters", "http-server", "auto-index"),
  ...moduleFiles("adapters", "http-server", "state"),
  ...moduleFiles("adapters", "http-server", "idempotency"),
  ...moduleFiles("adapters", "logging", "index"),
  ...moduleFiles("adapters", "package-info", "index"),
  ...moduleFiles("adapters", "qmd", "index"),
  ...moduleFiles("core", "index"),
  ...moduleFiles("core", "canonical", "index"),
  ...moduleFiles("core", "canonical", "markdown-store"),
  ...moduleFiles("core", "frontmatter"),
  ...moduleFiles("core", "dream", "index"),
  ...moduleFiles("core", "memory-root", "index"),
  ...moduleFiles("core", "provenance"),
  ...moduleFiles("core", "retrieval-policy", "index"),
  ...moduleFiles("core", "writing", "index"),
  ...moduleFiles("core", "writing", "document-id-stamping"),
  ...moduleFiles("core", "writing", "markdown-file"),
  ...moduleFiles("core", "writing", "metadata"),
  ...moduleFiles("core", "writing", "wrapup-policy"),
  ...moduleFiles("runtime", "index"),
  ...moduleFiles("server", "index"),
]);

const staleTopLevelDistDirs = ["canonical", "setup", "retrieval", "processing", "writing", "qmd", "client", "logging"];
const staleServerProtocolModules = ["http", "auto-index", "idempotency", "state"];

export const forbiddenLocalPackPathPrefixes = Object.freeze(staleTopLevelDistDirs.map((dir) => distDirPrefix(dir)));

export const forbiddenLocalPackFiles = Object.freeze([
  ...moduleFiles("package-info"),
  ...staleServerProtocolModules.flatMap((name) => moduleFiles("server", name)),
]);

export function validateLocalPackFiles(files) {
  const fileSet = new Set(files);
  const missing = requiredLocalPackFiles.filter((file) => !fileSet.has(file));
  const staleExact = forbiddenLocalPackFiles.filter((file) => fileSet.has(file));
  const staleByPrefix = files.filter((file) => forbiddenLocalPackPathPrefixes.some((prefix) => file.startsWith(prefix)));
  const stale = [...new Set([...staleExact, ...staleByPrefix])].sort();

  if (missing.length > 0 || stale.length > 0) {
    throw new Error(localPackValidationMessage({ missing, stale }));
  }

  return { required: requiredLocalPackFiles.length, stale: 0 };
}

export function localPackValidationMessage({ missing = [], stale = [] }) {
  const lines = ["Local CLI package contents are invalid."];
  if (missing.length > 0) {
    lines.push("Missing required files:", ...missing.map((file) => `- ${file}`));
  }
  if (stale.length > 0) {
    lines.push("Stale pre-refactor files must not be packed:", ...stale.map((file) => `- ${file}`));
  }
  return lines.join("\n");
}
