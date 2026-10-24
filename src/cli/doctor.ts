import type { RetrievalReadiness } from "../types.js";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { packageVersion } from "../adapters/package-info/index.js";
import { stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { memoryRootInspectionMessage } from "./targets.js";

interface DoctorCheck {
  ok: boolean;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  cli: DoctorCheck & { version: string };
  node: DoctorCheck & { version: string };
  qmd: DoctorCheck & { binary: string };
  memoryRoot: DoctorCheck & { root: string; initialized?: boolean; compatible?: boolean; readiness?: RetrievalReadiness };
  integrations: Record<string, DoctorCheck & { path: string }>;
  integrationsScope: "global";
  projectRoot?: string;
  projectIntegrations?: DoctorReport["integrations"];
}

export async function doctorReport(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<DoctorReport> {
  const version = await packageVersion();
  const root = stringArg(args, "root", false).trim() || process.env.JUMPYBRAIN_MEMORY_ROOT || path.join(os.homedir(), ".jumpybrain", "memory");
  const override = process.env.JUMPYBRAIN_QMD_BIN?.trim();
  const qmdBin = override || "qmd";
  const qmdCheck = spawnSync(qmdBin, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024 });
  const qmdVersion = qmdCheck.status === 0 ? qmdCheck.stdout.trim().match(/^(?:qmd\s+)?v?(\d+\.\d+\.\d+)(?:\s+\([a-f0-9]+\))?$/i)?.[1] : undefined;
  const qmdOk = qmdVersion === "2.8.3";
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
      ok: status.compatible,
      message: status.compatible ? "Memory root is compatible." : status.message ?? "Memory root is not compatible.",
    };
  } catch (error) {
    memoryRoot = { root, ok: false, message: memoryRootInspectionMessage(error, root) ?? "Unable to inspect memory root readiness." };
  }

  const report: DoctorReport = {
    ok: false,
    cli: { ok: true, version, message: `jumpybrain ${version}` },
    node: { ok: nodeMajor >= 22, version: process.version, message: nodeMajor >= 22 ? `Node ${process.version}` : `Node >=22 is required; current ${process.version}` },
    qmd: {
      ok: qmdOk,
      binary: qmdBin,
      message: qmdOk ? "QMD 2.8.3 is available (version probe only; CLI/SDK are required for retrieval)." : `${override ? "The selected JUMPYBRAIN_QMD_BIN override failed the QMD 2.8.3 version check. Correct it or run `unset JUMPYBRAIN_QMD_BIN` to use normal resolution, then retry. " : ""}QMD 2.8.3 is required for local/server indexing and recall. If still unavailable, install with \`npm install -g @tobilu/qmd@2.8.3\` or set JUMPYBRAIN_QMD_BIN.`,
    },
    memoryRoot,
    integrations,
    integrationsScope: "global",
    ...(projectRoot ? { projectRoot, projectIntegrations: integrationChecks(projectRoot, true) } : {}),
  };
  report.ok = report.cli.ok && report.node.ok && report.qmd.ok && report.memoryRoot.ok;
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
    `- Memory root: ${statusIcon(report.memoryRoot.ok)} ${report.memoryRoot.root} — ${report.memoryRoot.message}`,
    ...(report.memoryRoot.readiness ? [`- Readiness: ${report.memoryRoot.readiness.freshness}; modes: ${report.memoryRoot.readiness.modes.join(", ") || "none"}; embeddings: ${report.memoryRoot.readiness.embedding}`] : []),
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
