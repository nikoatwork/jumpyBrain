#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const PRIVATE_PATH_PREFIXES = [
  ".dogfood-memory/",
  ".jumpybrain/",
];

const PRIVATE_BASENAMES = new Set([
  "AGENTS.md",
  "AGENTS.local.md",
  "jumpybrain.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".npmrc",
]);

const SECRET_EXTENSIONS = new Set([".pem", ".p12", ".pfx", ".key"]);

const CONTENT_SCAN_EXEMPT_PATHS = new Set([
  "scripts/precommit-guard.mjs",
  "test/precommit-guard.test.js",
]);

const CONTENT_PATTERN_ALLOWANCES = [
  {
    file: "README.md",
    patternName: "personal Coolify/domain URL",
    text: "https://demojumpybrain.juttu.co",
  },
];

const HIGH_CONFIDENCE_PATTERNS = [
  { name: "private key block", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  { name: "GitHub token", regex: /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "GitLab token", regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: "OpenAI-style API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/ },
  { name: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "AWS access key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "personal Coolify/domain URL", regex: /\b(?:coolify\.)?juttu\.co\b/i },
];

// Task logs are committed public project history. Keep operational notes useful,
// but scrub live deployment identifiers before archiving or committing them.
const PUBLIC_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ROOT_AT_IPV4 = /\broot@(\d{1,3}(?:\.\d{1,3}){3})\b/i;
const LOCAL_SSH_PATH = /(?:^|[\s`])~\/\.ssh\/(?!<|\.\.\.)[A-Za-z0-9._-]+/;

const SECRET_ASSIGNMENT = /^\s*(?:export\s+)?([A-Z0-9_]*(?:API_?KEY|API_?KEYS|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*(["']?)([^"'\s#]+)\2/i;

const ALLOWED_PLACEHOLDER_VALUES = new Set([
  "...",
  "<api-key>",
  "<remote-api-key>",
  "<generate-a-long-random-secret>",
  "<paste-long-random-secret>",
  "<same-secret-as-jumpybrain_server_api_keys>",
  "client-key",
  "key-one,key-two",
  "one",
  "two",
  "secret",
]);

export function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function blockedPathReason(filePath) {
  const normalized = normalizePath(filePath);
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (PRIVATE_PATH_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
    return "private/generated local state must not be committed";
  }

  if (PRIVATE_BASENAMES.has(basename)) {
    return `${basename} is local/private and must not be committed`;
  }

  if (/^\.env(?:\..+)?$/.test(basename) && basename !== ".env.example") {
    return "environment files must not be committed; commit .env.example only";
  }

  if (SECRET_EXTENSIONS.has(extensionOf(basename))) {
    return "key/certificate material must not be committed";
  }

  return undefined;
}

export function scanText(filePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
      if (pattern.regex.test(withAllowedOccurrencesRemoved(filePath, line, pattern.name))) {
        findings.push({ file: filePath, line: index + 1, reason: pattern.name });
      }
    }

    const assignment = line.match(SECRET_ASSIGNMENT);
    if (assignment) {
      const value = assignment[3].trim();
      if (looksLikeRealSecretValue(value)) {
        findings.push({ file: filePath, line: index + 1, reason: `possible committed secret assignment for ${assignment[1]}` });
      }
    }

    if (isTaskLogPath(filePath)) {
      findings.push(...scanTaskLogOperationalBreadcrumbs(filePath, line, index + 1));
    }
  }

  return findings;
}

function withAllowedOccurrencesRemoved(filePath, line, patternName) {
  let result = line;
  for (const allowance of CONTENT_PATTERN_ALLOWANCES) {
    if (normalizePath(filePath) === allowance.file && patternName === allowance.patternName) {
      result = result.replaceAll(allowance.text, "");
    }
  }
  return result;
}

function scanTaskLogOperationalBreadcrumbs(filePath, line, lineNumber) {
  const findings = [];
  const rootLogin = line.match(ROOT_AT_IPV4);
  if (rootLogin && isPublicIPv4(rootLogin[1])) {
    findings.push({ file: filePath, line: lineNumber, reason: "task log contains root SSH login to public IP" });
  }

  if (LOCAL_SSH_PATH.test(line)) {
    findings.push({ file: filePath, line: lineNumber, reason: "task log contains local SSH key path" });
  }

  for (const match of line.matchAll(PUBLIC_IPV4)) {
    if (isPublicIPv4(match[0])) {
      findings.push({ file: filePath, line: lineNumber, reason: "task log contains public IPv4 deployment identifier" });
      break;
    }
  }

  return findings;
}

function isTaskLogPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized.startsWith("tasks/todo/") || normalized.startsWith("tasks/done/");
}

function isPublicIPv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first >= 224) return false;
  return true;
}

export function looksLikeRealSecretValue(value) {
  const lower = value.toLowerCase();
  if (!value || value.includes("<") || value.includes(">")) return false;
  if (/^\$\{?[A-Z_][A-Z0-9_]*\}?$/i.test(value)) return false;
  if (ALLOWED_PLACEHOLDER_VALUES.has(lower)) return false;
  if (lower.includes("example") || lower.includes("placeholder")) return false;
  return value.length >= 8;
}

export function isLikelyText(buffer) {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return !sample.includes(0);
}

export function shouldScanContent(filePath) {
  return !CONTENT_SCAN_EXEMPT_PATHS.has(normalizePath(filePath));
}

export function stagedFileNames() {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], { encoding: "buffer" });
  return output.toString("utf8").split("\0").filter(Boolean);
}

export function stagedFileContent(filePath) {
  return execFileSync("git", ["show", `:${filePath}`], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 });
}

export function runGuard({ files = stagedFileNames(), stderr = process.stderr } = {}) {
  const failures = [];

  for (const file of files) {
    const pathReason = blockedPathReason(file);
    if (pathReason) failures.push({ file, line: 0, reason: pathReason });

    let buffer;
    try {
      buffer = stagedFileContent(file);
    } catch (error) {
      failures.push({ file, line: 0, reason: `could not read staged content: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }

    if (!isLikelyText(buffer) || !shouldScanContent(file)) continue;
    failures.push(...scanText(file, buffer.toString("utf8")));
  }

  if (failures.length > 0) {
    stderr.write("precommit-guard blocked this commit:\n");
    for (const failure of failures) {
      const location = failure.line > 0 ? `${failure.file}:${failure.line}` : failure.file;
      stderr.write(`- ${location} — ${failure.reason}\n`);
    }
    stderr.write("\nIf this is intentional, move private data to env/Coolify secrets or rename committed examples to *.example.*.\n");
    return 1;
  }

  return 0;
}

function extensionOf(basename) {
  const index = basename.lastIndexOf(".");
  return index <= 0 ? "" : basename.slice(index).toLowerCase();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runGuard();
}
