import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoImportEdges,
  importsIn,
  sourceFilesFor,
  sourceImportGraph,
  sourceRelative,
} from "./source-graph-helpers.js";

function isCliPath(file) {
  return file === "src/cli.ts" || file.startsWith("src/cli/");
}

function isServerPath(file) {
  return file.startsWith("src/server/");
}

function isQmdPath(file) {
  return file === "src/qmd" || file.startsWith("src/qmd/");
}

function isTargetClientPath(file) {
  return file === "src/targets/client" || file === "src/targets/client.ts" || file.startsWith("src/targets/client/");
}

test("core and domain modules stay independent of CLI, server, targets, and QMD internals", async () => {
  const domainFiles = [
    ...await sourceFilesFor("core"),
    ...await sourceFilesFor("canonical"),
    ...await sourceFilesFor("setup"),
    ...await sourceFilesFor("writing"),
    ...await sourceFilesFor("retrieval/depth-policy.ts"),
  ];

  const offenders = new Set();
  for (const file of domainFiles) {
    const graph = await sourceImportGraph(file);
    for (const imported of graph) {
      if (isCliPath(imported) || isServerPath(imported) || isTargetClientPath(imported) || isQmdPath(imported)) {
        offenders.add(`${sourceRelative(file)} -> ${imported}`);
      }
    }
  }

  assert.deepEqual(
    [...offenders].sort(),
    [],
    "core/domain import graphs must not reach CLI, server, targets/client, or QMD adapter internals",
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
    "CLI modules must call runtime through the local transport and must not import src/qmd/ directly",
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

test("writing, retrieval, and canonical layer boundaries stay explicit", async () => {
  const writingImports = await importsIn("writing");
  assertNoImportEdges(
    writingImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/retrieval/") || isQmdPath(edge.target)),
    "writing modules must not import retrieval or QMD modules",
  );

  const retrievalImports = await importsIn("retrieval");
  assertNoImportEdges(
    retrievalImports,
    (edge) => edge.target !== undefined && edge.target.startsWith("src/writing/"),
    "retrieval modules must not import writing modules",
  );

  const canonicalImports = await importsIn("canonical");
  assertNoImportEdges(
    canonicalImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/retrieval/") || edge.target.startsWith("src/writing/") || isQmdPath(edge.target)),
    "canonical modules must stay retrieval-, writer-, and QMD-agnostic",
  );
});
