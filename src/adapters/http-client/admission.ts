// Admission refusals (rate refusal, busy execution queue, unavailable service),
// normalized once for every remote client path. Messages are static: neither a
// proxy's body nor an arbitrary server message reaches the caller here, and a
// retry delay is reported only when a valid Retry-After header supplied one.
// Nothing in this module waits or retries.

/** Longest delay accepted from Retry-After. Larger values are treated as no claimed delay. */
export const MAX_RETRY_AFTER_SECONDS = 86_400;

const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;

/** Application codes that already mean "capacity refused" and stay distinguishable on any status. */
const APPLICATION_ADMISSION_CODES = new Set(["execution_overloaded"]);

export interface AdmissionFailure {
  code: "rate_limited" | "service_unavailable" | "execution_overloaded";
  message: string;
  retryAfterSeconds?: number;
}

/**
 * Returns the header text when it is one delta-seconds value or one IMF-fixdate
 * HTTP-date within bounds; otherwise undefined. Used to forward only safe hints.
 */
export function validRetryAfterHeader(value: unknown, now = Date.now()): string | undefined {
  return typeof value === "string" && parseRetryAfter(value, now) !== undefined ? value.trim() : undefined;
}

/**
 * Bounded, nonnegative whole seconds from a Retry-After header. Missing, malformed,
 * repeated (comma-joined), negative, fractional or over-limit values give undefined.
 * An HTTP-date in the past gives 0: the server's suggested wait has elapsed.
 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (typeof value !== "string" || !Number.isFinite(now)) return undefined;
  const text = value.trim();
  if (!text || text.length > 64) return undefined;
  if (/^\d+$/u.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : undefined;
  }
  if (!IMF_FIXDATE.test(text)) return undefined;
  const at = Date.parse(text);
  // Round-tripping rejects impossible calendar dates that Date.parse would normalize.
  if (!Number.isFinite(at) || new Date(at).toUTCString() !== text) return undefined;
  const seconds = Math.ceil((at - now) / 1000);
  return seconds > MAX_RETRY_AFTER_SECONDS ? undefined : Math.max(0, seconds);
}

/**
 * Classifies an HTTP failure as an admission refusal. `code` is the remote
 * application code when the body carried a valid one. Returns undefined for
 * every other failure so existing handling stays unchanged.
 */
export function admissionFailure(status: number, code: string | undefined, headers?: Headers, now = Date.now()): AdmissionFailure | undefined {
  const normalized = code !== undefined && APPLICATION_ADMISSION_CODES.has(code) ? "execution_overloaded"
    : status === 429 ? "rate_limited"
    : status === 503 && code === undefined ? "service_unavailable"
    : undefined;
  if (!normalized) return undefined;
  const retryAfterSeconds = parseRetryAfter(headers?.get("retry-after"), now);
  const message = ADMISSION_MESSAGES[normalized](status) + retryHint(retryAfterSeconds);
  return { code: normalized, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}

const NO_RETRY = "jumpyBrain did not retry; if this was a write, confirm the note's current state before trying again.";

const ADMISSION_MESSAGES: Record<AdmissionFailure["code"], (status: number) => string> = {
  rate_limited: () => `The shared brain or a proxy in front of it refused this request because too many requests arrived (HTTP 429). That deployment sets its own request limits. ${NO_RETRY}`,
  service_unavailable: () => `The shared brain or a proxy in front of it is temporarily unavailable (HTTP 503). ${NO_RETRY}`,
  execution_overloaded: status => `Memory execution queue is full; retry shortly (HTTP ${status}). This is the brain's search/index capacity, not a request quota. ${NO_RETRY}`,
};

function retryHint(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  if (seconds === 0) return " The server's suggested wait has already passed.";
  return ` The server suggested waiting ${seconds} second${seconds === 1 ? "" : "s"}; that is guidance, not a guarantee.`;
}
