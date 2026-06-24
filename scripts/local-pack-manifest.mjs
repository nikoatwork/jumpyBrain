export const requiredLocalPackFiles = Object.freeze([
  "package/package.json",
  "package/dist/cli.js",
  "package/dist/index.js",
  "package/dist/package-info.js",
  "package/dist/cli/formatting.js",
  "package/dist/cli/local-transport.js",
  "package/dist/core/index.js",
  "package/dist/core/index.d.ts",
  "package/dist/runtime/index.js",
  "package/dist/runtime/index.d.ts",
  "package/dist/qmd/index.js",
  "package/dist/qmd/index.d.ts",
  "package/dist/server/index.js",
  "package/dist/server/index.d.ts",
]);

export const forbiddenLocalPackFiles = Object.freeze([
  "package/dist/retrieval/qmd-cli.js",
  "package/dist/retrieval/qmd-cli.d.ts",
  "package/dist/retrieval/qmd-driver.js",
  "package/dist/retrieval/qmd-driver.d.ts",
  "package/dist/retrieval/qmd-query.js",
  "package/dist/retrieval/qmd-query.d.ts",
  "package/dist/retrieval/qmd-ranking.js",
  "package/dist/retrieval/qmd-ranking.d.ts",
  "package/dist/retrieval/qmd-snippets.js",
  "package/dist/retrieval/qmd-snippets.d.ts",
]);

export function validateLocalPackFiles(files) {
  const fileSet = new Set(files);
  const missing = requiredLocalPackFiles.filter((file) => !fileSet.has(file));
  const stale = forbiddenLocalPackFiles.filter((file) => fileSet.has(file));

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
