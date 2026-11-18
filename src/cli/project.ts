import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { configuredCapture, MEMORY_CONFIG_FILE } from "../core/memory-root/index.js";
import { stringArg, type ParsedCliArgs } from "./args.js";
import { removeTrustedProject, trustedProject, writeTrustedProject } from "./project-trust.js";
import { discoverProject, installedRoot, resolveCliTarget } from "./targets.js";

const USAGE = "Use jumpybrain project status [--json], project trust [--root <memory-root>] [--allow-capture] [--json] or project untrust [--root <memory-root>] [--json].";

/**
 * Shows which brain commands run from this directory will use, and records the
 * user's device-local approval of a project memory. Approval is the user's
 * decision: agents report the need and never run trust on their own.
 */
export async function projectCli(args: ParsedCliArgs): Promise<void> {
  const action = args._[1];
  const allowed = action === "status" ? ["json"] : action === "trust" ? ["json", "root", "allow-capture"] : action === "untrust" ? ["json", "root"] : undefined;
  if (!allowed || args._.length !== 2 || Object.keys(args).some(key => key !== "_" && !allowed.includes(key))) throw new Error(USAGE);
  if (args["allow-capture"] !== undefined && args["allow-capture"] !== true) throw new Error("--allow-capture takes no value.");
  installedRoot(); // A malformed install manifest fails before any approval changes.
  const report = action === "status" ? await projectStatus() : action === "trust" ? await trust(args) : untrust(args);
  console.log(args.json ? JSON.stringify(report) : formatReport(report));
}

export interface ProjectStatus {
  target: { kind: "local"; root?: string; source?: string } | { kind: "remote"; url: string; source?: string } | { error: string };
  project: null | { root: string; trusted: boolean; capture: { requested: "ask" | "durable"; approved: boolean; effective: "ask" | "durable" } | { error: string } };
  personalRoot: string | null;
  changed?: "trusted" | "untrusted" | "unchanged";
}

async function projectStatus(root?: string): Promise<ProjectStatus> {
  const personalRoot = installedRoot() ?? null;
  let target: ProjectStatus["target"];
  try { target = resolveCliTarget({ _: [] }); } catch (error) { target = { error: error instanceof Error ? error.message : String(error) }; }
  let project = root;
  // An unreadable folder here is already explained by target.error when it matters.
  if (!project) try { project = discoverProject(personalRoot ?? undefined); } catch { project = undefined; }
  return { target, project: project ? await describe(project, target) : null, personalRoot };
}

/** Capture is effective only for the brain commands here actually select, so a write cannot land elsewhere. */
async function describe(root: string, target: ProjectStatus["target"]): Promise<NonNullable<ProjectStatus["project"]>> {
  const approval = trustedProject(root);
  let capture: NonNullable<ProjectStatus["project"]>["capture"];
  try {
    const requested = await configuredCapture(root);
    const approved = approval?.allowCapture === true;
    const selected = "kind" in target && target.kind === "local" && target.root !== undefined && sameRoot(target.root, root);
    capture = { requested, approved, effective: requested === "durable" && approved && selected ? "durable" : "ask" };
  } catch (error) { capture = { error: error instanceof Error ? error.message : String(error) }; }
  return { root, trusted: Boolean(approval), capture };
}

function sameRoot(candidate: string, root: string): boolean {
  try { return realpathSync(candidate) === root; } catch { return false; }
}

async function trust(args: ParsedCliArgs): Promise<ProjectStatus> {
  const root = selectedProject(args);
  const personal = installedRoot();
  if (personal && sameRoot(personal, root)) throw new Error("This is the personal brain from your installation; it needs no project approval, and capture there keeps its explicit-request rule.");
  await configuredCapture(root); // A malformed policy is rejected before it can be approved.
  writeTrustedProject(root, args["allow-capture"] === true);
  return { ...await projectStatus(root), changed: "trusted" };
}

function untrust(args: ParsedCliArgs): ProjectStatus {
  const root = selectedProject(args, false);
  const removed = removeTrustedProject(root);
  return { target: { kind: "local", root }, project: null, personalRoot: installedRoot() ?? null, changed: removed ? "untrusted" : "unchanged" };
}

/** An explicit --root, else the project found from this directory. Never initializes. */
function selectedProject(args: ParsedCliArgs, requireConfig = true): string {
  const explicit = args.root === undefined ? undefined : stringArg(args, "root").trim();
  if (args.root !== undefined && !explicit) throw new Error("--root must not be empty.");
  let root = explicit ? path.resolve(explicit) : discoverProject(installedRoot());
  if (!root) throw new Error("No project memory found from this directory. Pass --root <memory-root>.");
  if (explicit) {
    if (!existsSync(root)) {
      if (requireConfig) throw new Error(`Memory root does not exist: ${JSON.stringify(root)}.`);
      return root;
    }
    root = realpathSync(root);
  }
  if (requireConfig && !existsSync(path.join(root, MEMORY_CONFIG_FILE))) {
    throw new Error(`${JSON.stringify(root)} is not an initialized memory root (no ${MEMORY_CONFIG_FILE}). Run jumpybrain init --root <memory-root> first.`);
  }
  return root;
}

function formatReport(report: ProjectStatus): string {
  const lines: string[] = [];
  if (report.changed === "trusted") lines.push(`Approved project memory on this device: ${report.project?.root}`);
  if (report.changed === "untrusted") lines.push(`Removed approval for ${(report.target as { root: string }).root}`);
  if (report.changed === "unchanged") lines.push(`${(report.target as { root: string }).root} was not approved; nothing changed.`);
  if (report.changed === "untrusted" || report.changed === "unchanged") return lines.join("\n");
  const target = report.target;
  lines.push("error" in target ? `Commands here: no brain selected. ${target.error}`
    : target.kind === "remote" ? `Commands here use remote ${target.url} (${target.source}).`
    : `Commands here use ${target.root ?? "a brain found by recipe discovery"} (${target.source}).`);
  if (report.project) {
    const { capture } = report.project;
    lines.push(`Project memory: ${report.project.root} — ${report.project.trusted ? "approved on this device" : "not approved on this device"}.`);
    lines.push("error" in capture ? `Capture policy: ${capture.error}`
      : `Capture: ${capture.effective === "durable" ? "agents may save durable project decisions and findings without asking" : "ask before saving"} (project requests ${capture.requested}; device capture approval ${capture.approved ? "given" : "not given"}).`);
  } else lines.push("No project memory found from this directory.");
  lines.push(`Personal brain: ${report.personalRoot ?? "not configured by a managed installation"}.`);
  return lines.join("\n");
}
