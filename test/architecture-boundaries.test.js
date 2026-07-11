import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertNoImportEdges,
  importEdgesForFile,
  importsIn,
  sourceFiles,
  sourceFilesFor,
  sourceImportGraph,
  sourceRelative,
  srcRoot,
} from "./source-graph-helpers.js";

const staleTopLevelSourceDirs = new Set(["canonical", "setup", "retrieval", "processing", "writing", "qmd", "client", "logging"]);
const staleServerProtocolFiles = new Set(["http", "auto-index", "idempotency", "state"]);

function isCliPath(file) {
  return file === "src/cli.ts" || file.startsWith("src/cli/");
}

function isAppPath(file) {
  return file.startsWith("src/app/");
}

function isServerPath(file) {
  return file.startsWith("src/server/");
}

function isHttpProtocolAdapterPath(file) {
  return file === "src/adapters/http-protocol.ts";
}

function isHttpClientAdapterPath(file) {
  return file === "src/adapters/http-client" || file.startsWith("src/adapters/http-client/");
}

function isHttpServerAdapterPath(file) {
  return file === "src/adapters/http-server" || file.startsWith("src/adapters/http-server/");
}

function isInfrastructureAdapterPath(file) {
  return file.startsWith("src/adapters/logging/") || file.startsWith("src/adapters/package-info/");
}

function isQmdPath(file) {
  return file === "src/adapters/qmd" || file.startsWith("src/adapters/qmd/");
}

function isQmdAdapterInternalPath(file) {
  return isQmdPath(file) && file !== "src/adapters/qmd/index.ts";
}

function topLevelSourceDir(file) {
  return /^src\/([^/]+)/.exec(file)?.[1];
}

function isStaleArchitecturePath(file) {
  const topLevel = topLevelSourceDir(file);
  if (topLevel && staleTopLevelSourceDirs.has(topLevel)) return true;
  if (file === ["src", "package-info.ts"].join("/")) return true;

  const serverFile = /^src\/server\/([^/.]+)(?:\.ts)?$/.exec(file)?.[1];
  return serverFile !== undefined && staleServerProtocolFiles.has(serverFile);
}

function sourceLayer(file) {
  if (file === "src/index.ts") return "package-entrypoint";
  if (isCliPath(file)) return "cli-boundary";
  if (isServerPath(file)) return "server-boundary";
  if (isAppPath(file)) return "app-use-case";
  if (isHttpProtocolAdapterPath(file)) return "http-protocol-adapter";
  if (isHttpClientAdapterPath(file)) return "http-client-adapter";
  if (isHttpServerAdapterPath(file)) return "http-server-adapter";
  if (isInfrastructureAdapterPath(file)) return "infrastructure-adapter";
  if (file.startsWith("src/runtime/")) return "runtime-app";
  if (isQmdPath(file)) return "qmd-adapter";
  if (file.startsWith("src/core/") || file === "src/types.ts") return "core-domain";
  return undefined;
}

const approvedLayerImports = new Map([
  ["package-entrypoint", new Set(["runtime-app"])],
  ["cli-boundary", new Set(["cli-boundary", "runtime-app", "http-client-adapter", "server-boundary", "core-domain", "infrastructure-adapter"])],
  ["http-protocol-adapter", new Set(["http-protocol-adapter"])],
  ["http-client-adapter", new Set(["http-client-adapter", "http-protocol-adapter", "core-domain"])],
  ["server-boundary", new Set(["server-boundary", "app-use-case", "core-domain", "http-server-adapter", "infrastructure-adapter"])],
  ["http-server-adapter", new Set(["http-server-adapter", "http-protocol-adapter", "app-use-case", "core-domain", "infrastructure-adapter"])],
  ["runtime-app", new Set(["runtime-app", "app-use-case", "core-domain", "infrastructure-adapter"])],
  ["app-use-case", new Set(["app-use-case", "core-domain", "qmd-adapter"])],
  ["qmd-adapter", new Set(["qmd-adapter", "core-domain"])],
  ["core-domain", new Set(["core-domain"])],
  ["infrastructure-adapter", new Set(["infrastructure-adapter"])],
]);

test("package entrypoint reaches runtime without importing CLI or server code", async () => {
  const graph = await sourceImportGraph(`${srcRoot}/index.ts`);

  assert.ok(graph.includes("src/runtime/index.ts"), `package entrypoint should re-export runtime: ${graph.join(", ")}`);
  assert.equal(graph.some(isCliPath), false, `package entrypoint graph must not include CLI command parsing: ${graph.join(", ")}`);
  assert.equal(graph.some(isServerPath), false, `package entrypoint graph must not include server-only boundary: ${graph.join(", ")}`);
});

test("public runtime keeps graphMemory on the local package surface", async () => {
  const runtime = await readFile(path.join(srcRoot, "runtime", "index.ts"), "utf8");
  const packageEntry = await readFile(path.join(srcRoot, "index.ts"), "utf8");
  assert.match(runtime, /export \{[^}]*\bgraphMemory\b[^}]*\} from "\.\.\/app\/local-memory\/index\.js";/s);
  assert.match(packageEntry, /export \* from "\.\/runtime\/index\.js";/);
});

test("stale pre-refactor source module paths stay absent and unreferenced", async () => {
  const files = await sourceFiles(srcRoot);
  const relativeFiles = files.map(sourceRelative).sort();
  assert.deepEqual(relativeFiles.filter(isStaleArchitecturePath), [], "stale top-level compatibility and pre-adapter source modules must not reappear");

  const edges = (await Promise.all(files.map(importEdgesForFile))).flat();
  assertNoImportEdges(
    edges,
    (edge) => isStaleArchitecturePath(edge.target ?? edge.specifier.replace(/^\.\//, "src/")),
    "source imports must not reference stale compatibility or pre-adapter module paths",
  );
});

test("canonical, memory-root, provenance, and retrieval-policy implementations live under core submodules", () => {
  const requiredCoreFiles = [
    "src/core/canonical/index.ts",
    "src/core/canonical/markdown-store.ts",
    "src/core/memory-root/index.ts",
    "src/core/provenance.ts",
    "src/core/retrieval-policy/index.ts",
  ];

  for (const file of requiredCoreFiles) {
    assert.equal(existsSync(path.join(srcRoot, "..", file)), true, `${file} should exist`);
  }
});

test("source imports follow the approved CLI/app/core/adapters layer graph", async () => {
  const files = await sourceFiles(srcRoot);
  const edges = (await Promise.all(files.map(importEdgesForFile))).flat();

  assertNoImportEdges(
    edges,
    (edge) => {
      if (!edge.target) return false;
      const fromLayer = sourceLayer(edge.from);
      const toLayer = sourceLayer(edge.target);
      if (!fromLayer || !toLayer) return false;
      return !approvedLayerImports.get(fromLayer)?.has(toLayer);
    },
    "source imports must follow the approved CLI/app/core/adapters layer graph",
  );
});

test("CLI entrypoint stays a small shim over command modules", async () => {
  const requiredCliModules = [
    "src/cli/index.ts",
    "src/cli/commands.ts",
    "src/cli/recipes.ts",
    "src/cli/remote-access-policy.ts",
    "src/cli/doctor.ts",
    "src/cli/serve.ts",
    "src/cli/usage.ts",
    "src/cli/memory-target.ts",
    "src/cli/formatting.ts",
  ];

  for (const file of requiredCliModules) {
    assert.equal(existsSync(path.join(srcRoot, "..", file)), true, `${file} should exist`);
  }

  const entrypoint = await readFile(path.join(srcRoot, "cli.ts"), "utf8");
  assert.match(entrypoint, /import \{ runCli \} from "\.\/cli\/index\.js";/, "CLI binary source should delegate to the CLI module barrel");
  assert.equal(entrypoint.split("\n").filter((line) => line.trim()).length <= 8, true, "src/cli.ts should remain a small executable shim");
});

test("source module directories have co-located docs and avoid module READMEs", async () => {
  assert.equal(existsSync(path.join(srcRoot, "architecture.docs.md")), true, "src/architecture.docs.md documents the module docs convention");

  const files = await sourceFiles(srcRoot);
  const directories = new Set(files.map((file) => path.dirname(sourceRelative(file))).filter((dir) => dir !== "src"));
  const missingDocs = [];
  const readmes = [];
  const invalidDocs = [];

  for (const relativeDir of [...directories].sort()) {
    const absolute = path.join(srcRoot, "..", relativeDir);
    const entries = await readdir(absolute, { withFileTypes: true });
    const docs = entries.filter((entry) => entry.isFile() && entry.name.endsWith("docs.md"));

    if (docs.length === 0) missingDocs.push(`${relativeDir}/*docs.md`);
    if (entries.some((entry) => entry.isFile() && entry.name === "README.md")) readmes.push(`${relativeDir}/README.md`);

    for (const doc of docs) {
      const text = await readFile(path.join(absolute, doc.name), "utf8");
      if (!text.includes("\n## Responsibilities\n") || !text.includes("\n## Non-responsibilities\n")) invalidDocs.push(`${relativeDir}/${doc.name}`);
    }
  }

  assert.deepEqual(missingDocs, [], "each source directory containing TypeScript must have a co-located *docs.md file");
  assert.deepEqual(readmes, [], "module docs use *docs.md files instead of per-module README.md files");
  assert.deepEqual(invalidDocs, [], "module docs must include responsibilities and non-responsibilities sections");
});

test("core and domain modules stay independent of CLI, server, targets, and QMD internals", async () => {
  const domainFiles = await sourceFilesFor("core");

  const offenders = new Set();
  for (const file of domainFiles) {
    const graph = await sourceImportGraph(file);
    for (const imported of graph) {
      if (isCliPath(imported) || isServerPath(imported) || isHttpClientAdapterPath(imported) || isHttpServerAdapterPath(imported) || isInfrastructureAdapterPath(imported) || isQmdPath(imported)) {
        offenders.add(`${sourceRelative(file)} -> ${imported}`);
      }
    }
  }

  assert.deepEqual(
    [...offenders].sort(),
    [],
    "core/domain import graphs must not reach CLI, server, HTTP, logging/package metadata, targets/client, or QMD adapter internals",
  );
});

test("writing workflow orchestration lives in app use cases while core keeps pure policy", async () => {
  const requiredCorePolicyFiles = [
    "src/core/writing/markdown-file.ts",
    "src/core/writing/metadata.ts",
    "src/core/writing/wrapup-policy.ts",
  ];
  const requiredAppWorkflowFiles = [
    "src/app/writing/local-writer.ts",
    "src/app/writing/remote-writer.ts",
  ];

  for (const file of [...requiredCorePolicyFiles, ...requiredAppWorkflowFiles]) {
    assert.equal(existsSync(path.join(srcRoot, "..", file)), true, `${file} should exist`);
  }

  const files = await sourceFiles(srcRoot);
  const edges = (await Promise.all(files.map(importEdgesForFile))).flat();

  assertNoImportEdges(
    edges,
    (edge) => edge.target !== undefined && edge.from.startsWith("src/core/") && edge.target.startsWith("src/app/"),
    "core writing policy must not import app-level write workflows",
  );
});

test("local memory and processing orchestration lives in app use cases", async () => {
  const requiredAppUseCaseFiles = [
    "src/app/local-memory/index.ts",
    "src/app/processing/index.ts",
    "src/app/processing/processor.ts",
  ];

  for (const file of requiredAppUseCaseFiles) {
    assert.equal(existsSync(path.join(srcRoot, "..", file)), true, `${file} should exist`);
  }

  const appImports = [
    ...await importsIn("app/local-memory"),
    ...await importsIn("app/processing"),
  ];

  assertNoImportEdges(
    appImports,
    (edge) => edge.target !== undefined && isQmdAdapterInternalPath(edge.target),
    "local-memory and processing use cases must import QMD through src/adapters/qmd/index.ts, not adapter internals",
  );
});

test("server-memory orchestration lives in app use cases behind thin HTTP routes", async () => {
  const requiredAppUseCaseFiles = [
    "src/app/server-memory/index.ts",
    "src/app/server-memory/auto-index.ts",
    "src/app/server-memory/state.ts",
    "src/app/server-memory/idempotency.ts",
  ];
  const compatibilityFiles = [
    "src/adapters/http-server/auto-index.ts",
    "src/adapters/http-server/state.ts",
    "src/adapters/http-server/idempotency.ts",
  ];

  for (const file of [...requiredAppUseCaseFiles, ...compatibilityFiles]) {
    assert.equal(existsSync(path.join(srcRoot, "..", file)), true, `${file} should exist`);
  }

  for (const file of compatibilityFiles) {
    const text = await readFile(path.join(srcRoot, "..", file), "utf8");
    assert.match(text.trim(), /^export \* from "\.\.\/\.\.\/app\/server-memory\//, `${file} should be a thin compatibility export to app server-memory use cases`);
  }

  const httpRouteImports = [
    ...await importsIn("adapters/http-server/index.ts"),
    ...await importsIn("adapters/http-server/routes.ts"),
  ];
  assert.ok(
    httpRouteImports.some((edge) => edge.target === "src/app/server-memory/index.ts"),
    "HTTP server routes should import the app server-memory seam",
  );
  assertNoImportEdges(
    httpRouteImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/runtime/") || edge.target.startsWith("src/app/writing/")),
    "HTTP server routes should call server-memory app seams instead of runtime or writing workflows directly",
  );

  const serverMemoryImports = await importsIn("app/server-memory");
  assertNoImportEdges(
    serverMemoryImports,
    (edge) => edge.target !== undefined && (isHttpServerAdapterPath(edge.target) || edge.target.startsWith("src/runtime/")),
    "server-memory app use cases must not depend on HTTP route adapters or runtime compatibility surfaces",
  );
});

test("CLI modules do not import the QMD adapter directly", async () => {
  const cliImports = [
    ...await importsIn("cli.ts"),
    ...await importsIn("cli"),
  ];

  assertNoImportEdges(
    cliImports,
    (edge) => edge.target !== undefined && isQmdPath(edge.target),
    "CLI modules must call runtime through the local transport and must not import src/adapters/qmd/ directly",
  );
});

test("server modules do not import CLI command parsing code", async () => {
  const serverFiles = await sourceFilesFor("server");
  const offenders = new Set();

  for (const file of serverFiles) {
    const graph = await sourceImportGraph(file);
    for (const imported of graph) {
      if (isCliPath(imported)) offenders.add(`${sourceRelative(file)} -> ${imported}`);
    }
  }

  assert.deepEqual(
    [...offenders].sort(),
    [],
    "server import graphs must not reach CLI command parsing or CLI helper modules",
  );
});

test("app writing, local-memory, and core canonical boundaries stay explicit", async () => {
  const appWritingImports = await importsIn("app/writing");
  assertNoImportEdges(
    appWritingImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/app/local-memory/") || isQmdPath(edge.target)),
    "app writing workflows must not import local-memory retrieval or QMD modules",
  );

  const localMemoryImports = await importsIn("app/local-memory");
  assertNoImportEdges(
    localMemoryImports,
    (edge) => edge.target !== undefined && edge.target.startsWith("src/app/writing/"),
    "local-memory use cases must not import writing workflows",
  );

  const canonicalImports = await importsIn("core/canonical");
  assertNoImportEdges(
    canonicalImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/app/") || edge.target.startsWith("src/core/writing/") || isQmdPath(edge.target)),
    "core canonical modules must stay app-, writer-, and QMD-agnostic",
  );
});
