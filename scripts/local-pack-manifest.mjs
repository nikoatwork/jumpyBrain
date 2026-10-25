const distFile = (...segments) => ["package", "dist", ...segments].join("/");
const moduleFiles = (...segments) => [`${distFile(...segments)}.js`, `${distFile(...segments)}.d.ts`];
const distDirPrefix = (...segments) => `${distFile(...segments)}/`;

export const requiredLocalPackFiles = Object.freeze([
  "package/package.json",
  "package/extensions.js",
  "package/extensions.d.ts",
  "package/docs/extensions.md",
  ...moduleFiles("extensions", "index"),
  ...moduleFiles("app", "extensions", "index"),
  ...moduleFiles("adapters", "extensions", "index"),
  ...moduleFiles("adapters", "extensions", "registry"),
  ...moduleFiles("adapters", "extensions", "prepare"),
  ...moduleFiles("adapters", "extensions", "validation"),
  ...moduleFiles("cli", "extensions"),
  ...["candy-pink", "pomodoro"].flatMap(id => ["jumpybrain-extension.json", "main.ts", "README.md", ...(id === "pomodoro" ? ["ui.ts"] : [])].map(file => `package/examples/extensions/${id}/${file}`)),
  "package/examples/extensions/ember-plum/jumpybrain-extension.json",
  "package/examples/extensions/ember-plum/main.ts",
  "package/examples/extensions/related-notes/jumpybrain-extension.json",
  "package/examples/extensions/related-notes/main.ts",
  "package/examples/extensions/related-notes/ui.ts",
  ...['package.json', 'package-lock.json', 'install.mjs', 'desktop-install.py', 'application.mjs', 'updater.mjs', 'update-worker.mjs',
    'update-policy.mjs', 'update-cli.mjs', 'update-control.mjs', 'update-inline.mjs', 'update-release.mjs', 'update-transaction.py', 'update-window.mjs', 'update-preload.cjs', 'update.html', 'update.css',
    'update-renderer.js', 'assets/app-icon.icns'].map(file => `package/integrations/electron/${file}`),
  "package/install.sh",
  "package/uninstall.sh",
  "package/scripts/public-install.mjs",
  "package/scripts/public-uninstall.mjs",
  "package/integrations/macos-companion/Companion.swift",
  "package/integrations/macos-companion/uninstall.py",
  "package/docs/logseq-migration.md",
  "package/docs/obsidian-migration.md",
  ...moduleFiles("app", "migration", "obsidian-discovery"),
  ...moduleFiles("core", "migration", "obsidian"),
  ...moduleFiles("core", "migration", "shared"),
  ...moduleFiles("cli", "migrate"),
  ...moduleFiles("app", "migration", "index"),
  ...moduleFiles("app", "migration", "discovery"),
  ...moduleFiles("app", "migration", "filesystem"),
  ...moduleFiles("app", "migration", "transaction"),
  ...moduleFiles("core", "migration", "index"),
  ...moduleFiles("core", "migration", "types"),
  ...moduleFiles("core", "migration", "body"),
  "package/scripts/remote-target-origin.mjs",
  "package/scripts/qmd-install-check.mjs",
  "package/scripts/macos-companion.mjs",
  "package/integrations/macos-companion/update.py",
  "package/integrations/macos-companion/lifecycle.py",
  "package/integrations/macos-companion/install.py",
  "package/integrations/macos-companion/menu-update.mjs",
  "package/integrations/macos-companion/update-check.mjs",
  "package/integrations/macos-companion/gateway.mjs",
  "package/integrations/macos-companion/extensions-gateway.mjs",
  "package/integrations/macos-companion/connections.mjs",
  "package/integrations/macos-companion/switch-coordinator.mjs",
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
  ...moduleFiles("app", "local-memory", "connections"),
  ...moduleFiles("core", "document-id-format"),
  ...moduleFiles("app", "dream", "index"),
  ...moduleFiles("app", "processing", "index"),
  ...moduleFiles("app", "processing", "ensure-ids"),
  ...moduleFiles("app", "processing", "processor"),
  ...moduleFiles("app", "server-memory", "index"),
  ...moduleFiles("app", "server-memory", "daily-note"),
  ...moduleFiles("app", "server-memory", "auto-index"),
  ...moduleFiles("app", "server-memory", "dream"),
  ...moduleFiles("app", "server-memory", "state"),
  ...moduleFiles("app", "server-memory", "idempotency"),
  ...moduleFiles("adapters", "http-protocol"),
  ...moduleFiles("adapters", "http-client", "index"),
  ...moduleFiles("adapters", "http-server", "index"),
  ...moduleFiles("adapters", "http-server", "routes"),
  ...moduleFiles("adapters", "http-server", "graph-page"),
  ...moduleFiles("adapters", "http-server", "browser-entry"),
  ...moduleFiles("adapters", "http-server", "browser-commands"),
  ...moduleFiles("adapters", "http-server", "extensions-browser"),
  ...moduleFiles("adapters", "http-server", "extensions-view"),
  ...moduleFiles("adapters", "http-server", "browser-theme"),
  ...moduleFiles("adapters", "http-server", "browser-transport"),
  ...moduleFiles("adapters", "http-server", "document-controller"),
  ...moduleFiles("adapters", "http-server", "map-controller"),
  ...moduleFiles("adapters", "http-server", "reference-policy"),
  ...moduleFiles("adapters", "http-server", "notes-browser"),
  ...moduleFiles("adapters", "http-server", "companion-browser"),
  ...moduleFiles("adapters", "http-server", "dream-handoff"),
  distFile("adapters", "http-server", "editor-bundle.js"),
  distFile("adapters", "http-server", "extensions-bundle.js"),
  distFile("adapters", "http-server", "editor-LICENSES.txt"),
  distFile("adapters", "http-server", "feedback-config.json"),
  ...moduleFiles("adapters", "http-server", "feedback-delivery"),
  ...moduleFiles("adapters", "http-server", "auto-index"),
  ...moduleFiles("adapters", "http-server", "state"),
  ...moduleFiles("adapters", "http-server", "idempotency"),
  ...moduleFiles("adapters", "logging", "index"),
  ...moduleFiles("adapters", "package-info", "index"),
  ...moduleFiles("adapters", "qmd", "index"),
  ...moduleFiles("adapters", "qmd", "qmd-lifecycle"),
  ...moduleFiles("adapters", "qmd", "qmd-worker"),
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

export const forbiddenLocalPackPathPrefixes = Object.freeze([...staleTopLevelDistDirs.map((dir) => distDirPrefix(dir)), 'package/integrations/electron/node_modules/']);

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
