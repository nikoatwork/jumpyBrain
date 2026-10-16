#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const unknown = (detail) => ({ status: "unknown", detail });

// Deliberately do not inherit Git config injection, helpers, proxies, tracing,
// askpass, or alternate object/repository paths from the launching environment.
export function gitEnvironment() {
  return {
    PATH: "/usr/bin:/bin",
    HOME: "/dev/null",
    XDG_CONFIG_HOME: "/dev/null",
    LANG: "C",
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/usr/bin/false",
    SSH_ASKPASS: "/usr/bin/false",
    GCM_INTERACTIVE: "never",
    GIT_ALLOW_PROTOCOL: "https",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
  };
}

export function httpsSource(value) {
  if (typeof value !== "string" || value.length > 4096 ||
      !value.startsWith("https://") || /[\s\\\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null;
    // Keep the exact recorded URL: do not guess that differently spelled paths
    // (or repositories with/without .git) identify the same installed source.
    return value;
  } catch {
    return null;
  }
}

export function validateManifest(manifest, installRoot) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      manifest.installer !== "jumpybrain-installer" || manifest.version !== 1 ||
      !["global", "project"].includes(manifest.scope) ||
      !["auto", "all", "none"].includes(manifest.integrationMode)) return false;
  const expected = {
    installRoot,
    appDir: path.join(installRoot, "app"),
    binDir: path.join(installRoot, "bin"),
    cliPath: path.join(installRoot, "bin", "jumpybrain"),
    cliConfigPath: path.join(installRoot, "cli-config.json"),
  };
  return Object.entries(expected).every(([key, value]) => {
    if (key === "cliConfigPath" && manifest[key] === undefined) return true;
    return typeof manifest[key] === "string" && path.isAbsolute(manifest[key]) &&
      path.resolve(manifest[key]) === value;
  });
}

// The CLI updater defaults to master, not the remote's default branch/HEAD.
export function refPlan(value) {
  if (value == null) value = "master";
  if (typeof value !== "string") return null;
  const ref = value.trim();
  if (HASH.test(ref)) return { commit: ref.toLowerCase() };
  // Abbreviated object IDs and revision expressions are not stable provenance.
  if (!ref || ref.length > 1024 || /^[a-f0-9]{7,}$/i.test(ref) || (ref === "HEAD" || ref === "@") ||
      /[\s\x00-\x20\x7f~^:?*\[\\]/.test(ref) || ref.includes("..") ||
      ref.includes("@{") || ref.startsWith("-") || ref.endsWith(".") ||
      ref.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) return null;
  if (ref.startsWith("refs/") && !/^refs\/(heads|tags)\//.test(ref)) return null;
  const branch = ref.startsWith("refs/tags/") ? null : ref.startsWith("refs/heads/") ? ref : `refs/heads/${ref}`;
  const tag = ref.startsWith("refs/heads/") ? null : ref.startsWith("refs/tags/") ? ref : `refs/tags/${ref}`;
  return { patterns: [branch, tag, tag && `${tag}^{}`].filter(Boolean), branch, tag };
}

export function compareRemote(head, plan, output) {
  if (!HASH.test(head) || !plan || typeof output !== "string") return unknown("Cannot resolve the recorded ref.");
  const refs = new Map();
  for (const line of output.trim().split("\n").filter(Boolean)) {
    const fields = line.split("\t");
    if (fields.length !== 2 || !HASH.test(fields[0]) || refs.has(fields[1])) return unknown("Cannot resolve the recorded ref.");
    refs.set(fields[1], fields[0].toLowerCase());
  }
  const branch = refs.get(plan.branch);
  const tag = refs.get(plan.tag);
  const peeled = plan.tag && refs.get(`${plan.tag}^{}`);
  if ((branch && (tag || peeled)) || (peeled && !tag)) return unknown("The recorded ref is ambiguous.");
  const target = branch || peeled || tag;
  if (!target || target.length !== head.length) return unknown("The recorded ref is not advertised.");
  return { status: target === head.toLowerCase() ? "current" : "available" };
}

/** Read-only, best-effort comparison. runCommand is the sole subprocess test seam. */
export async function checkForUpdates(installRoot, { runCommand = spawnSync } = {}) {
  if (typeof installRoot !== "string" || !path.isAbsolute(installRoot)) return unknown("An absolute install root is required.");
  installRoot = path.resolve(installRoot);
  try {
    const manifestPath = path.join(installRoot, "install-manifest.json");
    const stat = await lstat(manifestPath);
    if (!stat.isFile() || stat.size > 64 * 1024) return unknown("Invalid managed install manifest.");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validateManifest(manifest, installRoot)) return unknown("Invalid managed install manifest.");
    const source = httpsSource(manifest.source);
    if (!source) return unknown("Only recorded HTTPS sources can be checked.");
    const plan = refPlan(manifest.ref);
    if (!plan) return unknown("The recorded ref cannot be checked safely.");
    try {
      await lstat(path.join(installRoot, ".installer-lock"));
      return unknown("An installation update is in progress.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const appDir = path.join(installRoot, "app");
    const gitDir = path.join(appDir, ".git");
    // Local-copy installs have no .git. Do not discover a parent checkout or
    // follow a linked worktree/symlink into unrelated source or metadata.
    if (await realpath(appDir) !== path.join(await realpath(installRoot), "app") ||
        !(await lstat(gitDir)).isDirectory() ||
        !(await lstat(path.join(gitDir, "config"))).isFile()) return unknown("Installed Git provenance is unavailable.");

    function git(args, remote = false) {
      const result = runCommand("/usr/bin/git", args, {
        cwd: "/",
        env: gitEnvironment(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        timeout: remote ? 8000 : 2000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
      });
      if (result.error || result.status !== 0 || result.signal || typeof result.stdout !== "string") throw new Error("Git unavailable");
      return result.stdout;
    }
    // --git-dir=/dev/null prevents ANY repository config from affecting config
    // reads or network access. Includes are also disabled for the origin read.
    const origins = git(["--git-dir=/dev/null", "config", "--no-includes", "--file", path.join(gitDir, "config"),
      "--null", "--get-all", "remote.origin.url"]).split("\0");
    if (origins.length !== 2 || origins[1] !== "" || httpsSource(origins[0]) !== source) return unknown("Installed origin does not match the recorded source.");
    // No object peeling: HEAD^{commit} can trigger a partial-clone lazy fetch.
    const head = git([`--git-dir=${gitDir}`, "rev-parse", "--verify", "HEAD"]).trim().toLowerCase();
    if (!HASH.test(head)) return unknown("Installed Git revision is unavailable.");
    if (plan.commit) return head === plan.commit ? { status: "current" } : unknown("Installed revision differs from the pinned commit.");
    const output = git(["--git-dir=/dev/null",
      "-c", "credential.helper=", "-c", "core.askPass=",
      "-c", "http.followRedirects=false", "-c", "http.sslVerify=true",
      "-c", "protocol.allow=never", "-c", "protocol.https.allow=always",
      "ls-remote", "--exit-code", "--", source, ...plan.patterns], true);
    return compareRemote(head, plan, output);
  } catch {
    // Never disclose stderr, URLs, paths, config, credentials, or error strings.
    return unknown("Update information is unavailable.");
  }
}

export async function main(argv = process.argv.slice(2)) {
  const result = argv.length === 1 ? await checkForUpdates(argv[0]) : unknown("An absolute install root is required.");
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
