// One presentation path for CLI failures. Plain mode prints the message to
// stderr. Machine mode (a successfully parsed --json memory/recipe/board
// command) prints exactly one `{ "error": {...} }` object to stdout. Both exit 1.
// Only the message and validated, non-secret metadata are serialized: never the
// Error object, its stack, its causes' messages or a remote response body.

export interface CliErrorPacket {
  error: {
    code: string;
    message: string;
    /** HTTP status of a remote failure, or the client's equivalent for its own deadline/cancellation. */
    status?: number;
    /** Validated Retry-After guidance in whole seconds; absent when no usable hint was given. */
    retryAfterSeconds?: number;
  };
}

const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const MAX_CAUSE_DEPTH = 4;

export function cliErrorPacket(error: unknown): CliErrorPacket {
  const message = error instanceof Error ? error.message : String(error);
  // Explanations that rewrite a failure keep the original as `cause`; metadata comes from the first error carrying a safe code.
  let source: Record<string, unknown> | undefined;
  const seen = new Set<unknown>();
  for (let current: unknown = error; current && typeof current === "object" && !seen.has(current) && seen.size < MAX_CAUSE_DEPTH; current = (current as { cause?: unknown }).cause) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_CODE.test(code)) { source = current as Record<string, unknown>; break; }
  }
  const status = source?.status;
  const retryAfterSeconds = source?.retryAfterSeconds;
  return {
    error: {
      code: typeof source?.code === "string" ? source.code : "command_failed",
      message,
      ...(Number.isSafeInteger(status) && (status as number) >= 400 && (status as number) <= 599 ? { status: status as number } : {}),
      ...(Number.isSafeInteger(retryAfterSeconds) && (retryAfterSeconds as number) >= 0 ? { retryAfterSeconds: retryAfterSeconds as number } : {}),
    },
  };
}

export function presentCliFailure(error: unknown, json: boolean): void {
  process.exitCode = 1;
  if (json) process.stdout.write(`${JSON.stringify(cliErrorPacket(error), null, 2)}\n`);
  else console.error(error instanceof Error ? error.message : String(error));
}
