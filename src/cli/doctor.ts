import type { RetrievalReadiness } from "../types.js";
import { existsSync } from "node:fs";
import { inspectLocalSearchEngine } from "../runtime/index.js";
import os from "node:os";
import path from "node:path";
import { packageVersion } from "../adapters/package-info/index.js";
import { stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { memoryRootInspectionMessage, resolveCliTarget } from "./targets.js";

interface DoctorCheck {
  ok: boolean;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  cli: DoctorCheck & { version: string };
  node: DoctorCheck & { version: string };
  qmd: DoctorCheck & { binary: string };
  retrievalProbe: { status: "not_run" | "passed" | "empty" | "failed"; mode: "lexical"; message: string; warnings?: string[] };
  memoryRoot: DoctorCheck & { root: string; source?: string; initialized?: boolean; compatible?: boolean; semanticSetup?: import("../types.js").SemanticSetupStatus; readiness?: RetrievalReadiness };
  integrations: Record<string, DoctorCheck & { path: string }>;
  integrationsScope: "global";
  projectRoot?: string;
  projectIntegrations?: DoctorReport["integrations"];
}

export async function doctorReport(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<DoctorReport> {
  const probeQuery = stringArg(args, "probe-query", false);
  if (args["probe-query"] !== undefined && (!probeQuery.trim() || probeQuery.length > 512)) throw new Error("--probe-query requires 1–512 characters of nonblank query text.");
  const version = await packageVersion();
  const target = resolveCliTarget(args, { fallbackRoot: path.join(os.homedir(), ".jumpybrain", "memory") });
  if (target.kind !== "local") throw new Error("doctor inspects local roots only.");
  const root = target.root!;
  const engine = inspectLocalSearchEngine();
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const integrations = integrationChecks(os.homedir(), false);
  // Explicit roots establish only this scope, never unrelated cwd/ancestor projects.
  const explicitRoot = stringArg(args, "root", false).trim();
  const projectRoot = explicitRoot ? (path.basename(path.resolve(explicitRoot)) === "memory" ? path.dirname(path.resolve(explicitRoot)) : path.resolve(explicitRoot)) : undefined;

  let memoryRoot: DoctorReport["memoryRoot"];
  try {
    const status = await localMemory.memoryRootStatus(root);
    memoryRoot = {
      root: status.root,
      initialized: status.initialized,
      compatible: status.compatible,
      readiness: status.readiness,
      semanticSetup: status.semanticSetup,
      ok: status.compatible,
      message: status.compatible ? "Memory root is compatible." : status.message ?? "Memory root is not compatible.",
    };
  } catch (error) {
    memoryRoot = { root, ok: false, message: memoryRootInspectionMessage(error, root) ?? "Unable to inspect memory root readiness." };
  }

  const retrievalProbe: DoctorReport["retrievalProbe"] = { status: "not_run", mode: "lexical", message: "Retrieval not tested; use --probe-query <text> for a read-only lexical check." };
  if (probeQuery) {
    retrievalProbe.status = "failed";
    retrievalProbe.message = "Read-only lexical probe failed or was unavailable; inspect engine/root readiness and published index state. No repair attempted.";
    if (engine.ok && memoryRoot.compatible) try {
      const result = await localMemory.searchMemory(root, probeQuery, 1, { readOnly: true, refresh: false, timeoutMs: 5000 });
      retrievalProbe.status = result.results.length ? "passed" : "empty";
      retrievalProbe.warnings = result.retrieval?.warnings ?? [];
      retrievalProbe.message = "Read-only lexical execution succeeded; " + (result.results.length ? "a result was returned." : "no result was returned.") + " Semantic inference, relevance and answer correctness are untested.";
    } catch { /* Never print query, matches, raw backend errors or private paths. */ }
  }

  const report: DoctorReport = {
    ok: false,
    cli: { ok: true, version, message: `jumpybrain ${version}` },
    node: { ok: nodeMajor >= 22, version: process.version, message: nodeMajor >= 22 ? `Node ${process.version}` : `Node >=22 is required; current ${process.version}` },
    qmd: engine,
    retrievalProbe,
    memoryRoot: { ...memoryRoot, source: target.source },
    integrations,
    integrationsScope: "global",
    ...(projectRoot ? { projectRoot, projectIntegrations: integrationChecks(projectRoot, true) } : {}),
  };
  report.ok = report.cli.ok && report.node.ok && report.qmd.ok && report.memoryRoot.ok && retrievalProbe.status !== "failed";
  return report;
}

function integrationChecks(home: string, project: boolean): DoctorReport["integrations"] {
  const paths = {
    codex: path.join(home, ".agents", "skills", "jumpybrain-memory", "SKILL.md"),
    claude: path.join(home, ".claude", "skills", "jumpybrain-memory", "SKILL.md"),
    pi: path.join(home, ".pi", ...(project ? [] : ["agent"]), "extensions", "jumpybrain-memory.ts"),
  };
  return Object.fromEntries(Object.entries(paths).map(([name, file]) => {
    const present = existsSync(file);
    return [name, { path: file, ok: present, message: present ? "file present; host activation not checked" : "file not found in this scope" }];
  }));
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `jumpyBrain doctor: ${report.ok ? "ok" : "attention needed"}`,
    `- CLI: ${statusIcon(report.cli.ok)} ${report.cli.message}`,
    `- Node: ${statusIcon(report.node.ok)} ${report.node.message}`,
    `- QMD: ${statusIcon(report.qmd.ok)} ${report.qmd.message}`,
    `- Memory root: ${statusIcon(report.memoryRoot.ok)} ${report.memoryRoot.root} (${report.memoryRoot.source}) — ${report.memoryRoot.message}`,
    ...(report.memoryRoot.semanticSetup ? [`- Semantic setup: ${report.memoryRoot.semanticSetup.state}${report.memoryRoot.semanticSetup.nextAction ? ". " + report.memoryRoot.semanticSetup.nextAction : ""}`] : []),
    ...(report.memoryRoot.readiness ? [`- Readiness: ${report.memoryRoot.readiness.freshness}; modes: ${report.memoryRoot.readiness.modes.join(", ") || "none"}; embeddings: ${report.memoryRoot.readiness.embedding}`] : []),
    "- Modes/coverage describe index metadata, not verified inference or relevance; lexical-only retrieval can miss paraphrases.",
    `- Retrieval probe: ${report.retrievalProbe.status} — ${report.retrievalProbe.message}`,
    ...(report.retrievalProbe.warnings?.length ? [`  Warnings: ${report.retrievalProbe.warnings.join(", ")}`] : []),
    "- Global integration file presence (optional; host activation not checked):",
  ];
  for (const [name, check] of Object.entries(report.integrations)) {
    lines.push(`  - ${name}: ${statusIcon(check.ok)} ${check.path} (${check.message})`);
  }
  if (report.projectIntegrations) {
    lines.push(`- Project integration file presence at ${report.projectRoot} (optional; host activation not checked):`);
    for (const [name, check] of Object.entries(report.projectIntegrations)) {
      lines.push(`  - ${name}: ${statusIcon(check.ok)} ${check.path} (${check.message})`);
    }
  } else lines.push("- Project integrations not inspected; pass --root to establish a scope.");
  return lines.join("\n");
}

function statusIcon(ok: boolean): string {
  return ok ? "ok" : "missing";
}
