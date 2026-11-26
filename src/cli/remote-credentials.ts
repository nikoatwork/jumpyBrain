import { brainKeyCandidates, BrainKeyBindingError, brainKeyVariable, brainUrlVariable, credentialsEnvFileDisplay, keyFingerprint, remoteKeyCandidates, resolveBrainKey, resolveRemoteKey, type RemoteKey } from "../adapters/credentials/env-file.js";

// Remote access-key presentation for the CLI. Messages name where a key came
// from and a short fingerprint (length, last four characters of long keys),
// never the key itself.

/** Non-secret summary for status output. */
export function remoteKeySummary(key: RemoteKey) {
  return { source: key.source, variable: key.variable, ...(key.file ? { file: key.file } : {}), ...keyFingerprint(key.key) };
}

export function describeRemoteKey(key: RemoteKey): string {
  const print = keyFingerprint(key.key);
  const where = key.source === "environment" ? "JUMPYBRAIN_API_KEY from the environment"
    : key.source === "brain-environment" ? `${key.variable} from the environment`
    : key.source === "brain-env-file" ? `${key.variable} in ${key.file}`
    : key.source === "app-connection" ? key.variable.startsWith("JUMPYBRAIN_KEY_")
      ? `the key the jumpyBrain app saved for this URL, ${key.variable} in ${key.file}`
      : `the key the jumpyBrain app uses for this URL, which refers to ${key.variable} in ${key.file}`
    : `JUMPYBRAIN_API_KEY in ${key.file}`;
  return `${where} (${print.length} chars${print.last4 ? `, ends …${print.last4}` : ""})`;
}

const issueHint = "Ask the server admin for a key (they issue one with `jumpybrain access issue` on the server, or under Access keys in the app)";

function setKeyHint(source: RemoteKey["source"] | undefined, file: string, brain?: string): string {
  if (brain) {
    const variable = brainKeyVariable(brain);
    if (source === "brain-environment") return `replace ${variable} where it is exported, or unset it and ${brainUrlVariable(brain)} to use the key saved for this brain`;
    return `save it with: printf '%s' "$KEY" | jumpybrain brains key ${brain} --key-stdin (stored as ${variable}, bound to the brain's URL, in ${file})`;
  }
  if (source === "environment") return "replace JUMPYBRAIN_API_KEY where it is exported (a shell profile such as ~/.zshenv, ~/.zshrc or ~/.bash_profile, or your agent's settings), or unset it to use the key saved in the jumpyBrain app";
  if (source === "app-connection") return "re-enter it for this connection in the jumpyBrain app, or export JUMPYBRAIN_API_KEY";
  if (source === "env-file") return `replace JUMPYBRAIN_API_KEY in ${file}, or save this connection in the jumpyBrain app`;
  return `export it as JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app (keys are shared via ${file})`;
}

/** The key the CLI sends to `url`, or an actionable error that never contains a key. */
export async function remoteCredential(url: string, brain?: string): Promise<RemoteKey> {
  // A named brain only uses a key bound to its name or its exact URL, never JUMPYBRAIN_API_KEY.
  let key: RemoteKey | null;
  try { key = brain ? await resolveBrainKey(brain, url) : await resolveRemoteKey(url); }
  catch (error) {
    if (!(error instanceof BrainKeyBindingError) || !brain) throw error;
    throw Object.assign(new Error(`No usable access key for brain ${JSON.stringify(brain)} (${url}); nothing was sent: ${error.message}. To fix: ${setKeyHint(undefined, credentialsEnvFileDisplay(), brain)}.`), { code: "credential_unavailable" });
  }
  const file = credentialsEnvFileDisplay();
  if (!key && brain) {
    throw Object.assign(new Error(`No access key for brain ${JSON.stringify(brain)} (${url}); nothing was sent. A named brain uses only a key bound to its URL: ${brainKeyVariable(brain)} with ${brainUrlVariable(brain)} in the environment or in ${file}, else the key the jumpyBrain app saved for this exact URL. JUMPYBRAIN_API_KEY is not used for named brains. To fix: ${setKeyHint(undefined, file, brain)}. ${issueHint}.`), { code: "credential_unavailable" });
  }
  if (!key) throw new Error(`No access key for ${url}. Set JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app (keys are shared via ${file}). ${issueHint}.`);
  // fetch cannot put these in a header and would fail with an unrelated ByteString error.
  if (/[\u0000-\u001f\u007f]|[^\u0000-ÿ]/.test(key.key)) {
    throw new Error(`Cannot send ${describeRemoteKey(key)}: it contains characters an access key cannot have, such as smart quotes or a line break. Copy the key again as plain text, then ${setKeyHint(key.source, file, brain)}.`);
  }
  return key;
}

/**
 * Explains a 401/403 from a remote target: which key was sent, other keys the
 * CLI could have used, the precedence, and how to recover. `undefined` when
 * the error is not about the access key.
 */
export async function remoteAuthFailure(error: unknown, url: string, brain?: string): Promise<Error | undefined> {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  const reason = typeof code === "string" && code ? code : `http_${status}`;
  if (status !== 401 && !(status === 403 && (reason === "read_only" || reason === "admin_required"))) return undefined;
  const { keys, fileProblem, mismatches } = brain ? await brainKeyCandidates(brain, url) : { ...await remoteKeyCandidates(url), mismatches: [] as string[] };
  const used = keys[0];
  if (!used) return undefined;
  const file = credentialsEnvFileDisplay();
  const lines = status === 401
    ? [`${url} rejected the access key (HTTP 401 ${reason}). The server does not recognize it: it may be mistyped, revoked, or issued by another server.`]
    : [`${url} accepted the access key, but it does not allow this command (HTTP 403 ${reason}): ${reason === "read_only" ? "it grants reader access only" : "it needs an admin key"}.`];
  lines.push(`Key used: ${describeRemoteKey(used)}.`);
  for (const other of keys.slice(1)) {
    lines.push(`Not used: ${describeRemoteKey(other)}${other.key === used.key ? " (the same key)" : ""}.`);
  }
  if (/^["'‘’“”]|["'‘’“”]$|\s/.test(used.key)) lines.push("The key contains quote marks or spaces; check that the line setting it does not add extra quotes.");
  for (const mismatch of mismatches) lines.push(`Not used: ${mismatch}.`);
  if (fileProblem) lines.push(`Not checked: ${fileProblem}`);
  lines.push(brain
    ? `Key order for brain ${JSON.stringify(brain)}: ${brainKeyVariable(brain)} with ${brainUrlVariable(brain)} in the environment, then the same pair in ${file}, then the key the jumpyBrain app saved for this exact URL; a key is used only with a matching ${brainUrlVariable(brain)}. JUMPYBRAIN_API_KEY is never used for a named brain.`
    : `Key order: JUMPYBRAIN_API_KEY in the environment, then the key the jumpyBrain app saved for this exact URL, then JUMPYBRAIN_API_KEY in ${file}.`);
  const need = status === 401 ? "a valid key" : reason === "read_only" ? "a writer key" : "an admin key";
  const selector = brain ? `--brain ${brain}` : `--target-url ${url}`;
  lines.push(`To fix: ${issueHint.replace("Ask", "ask").replace("for a key", `for ${need}`)}, then ${setKeyHint(used.source, file, brain)}.${status === 401 ? ` Check with: jumpybrain status ${selector}` : ` See what this key may do: jumpybrain access whoami ${selector}`}`);
  return Object.assign(new Error(lines.join("\n"), { cause: error }), { status, code: reason });
}
