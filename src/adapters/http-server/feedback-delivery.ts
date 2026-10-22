import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

export interface FeedbackReport { id: string; message: string; diagnostics: string | null }
export type FeedbackSender = (report: FeedbackReport) => Promise<void>;
const MAX_BYTES = 65536;
class FeedbackUnavailableError extends Error {}

export function validateFeedback(value: unknown): FeedbackReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_feedback");
  const report = value as FeedbackReport;
  if (Object.keys(report).some(key => !["id", "message", "diagnostics"].includes(key))
    || typeof report.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(report.id)
    || typeof report.message !== "string" || !report.message.trim() || report.message.length > 4000
    || (report.diagnostics !== null && (typeof report.diagnostics !== "string" || Buffer.byteLength(report.diagnostics) > 24000))) throw new Error("invalid_feedback");
  return { id: report.id, message: report.message, diagnostics: report.diagnostics };
}

// Used by both authenticated browser hosts. No memory credential is forwarded.
function configuredEndpoint(): string | undefined {
  if (process.env.JUMPYBRAIN_FEEDBACK_URL !== undefined) return process.env.JUMPYBRAIN_FEEDBACK_URL || undefined;
  try { return JSON.parse(readFileSync(new URL("./feedback-config.json", import.meta.url), "utf8")).url || undefined; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export function createFeedbackForwarder(endpoint = configuredEndpoint(), fetchImpl = fetch): FeedbackSender {
  const destination = endpoint ? new URL(endpoint) : null;
  if (destination && (destination.protocol !== "https:" || destination.username || destination.password || destination.hash)) throw new Error("Feedback URL must use HTTPS without credentials or a fragment.");
  return async report => {
    if (!destination) throw new FeedbackUnavailableError("feedback_unavailable");
    const response = await fetchImpl(destination, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(validateFeedback(report)) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("feedback_unconfirmed"); }
    const result = await boundedJson(response);
    if (result?.accepted !== true || result.id !== report.id) throw new Error("feedback_unconfirmed");
  };
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("feedback_unconfirmed");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new Error("feedback_unconfirmed");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel(); }
}

export function createFeedbackHandler(send?: FeedbackSender) {
  // Per-host admission; the public relay also applies its own global limit.
  let active = 0, attempts = 0, windowStart = Date.now();
  return async (request: IncomingMessage, response: ServerResponse) => {
    const reply = (status: number, packet: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(packet));
    };
    const fail = (status: number, code: string) => reply(status, { error: { code, message: "Feedback delivery could not be confirmed. Your message has been kept." } });
    if (request.method !== "POST") { response.setHeader("Allow", "POST"); fail(405, "method_not_allowed"); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) { fail(415, "invalid_feedback"); return; }
    if (Date.now() - windowStart >= 3600_000) { attempts = 0; windowStart = Date.now(); }
    if (active >= 4 || attempts >= 100) { response.setHeader("Retry-After", "3600"); fail(429, "feedback_rate_limited"); return; }
    active++; attempts++;
    try {
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BYTES) { fail(413, "feedback_too_large"); return; }
        chunks.push(Buffer.from(chunk));
      }
      let report: FeedbackReport;
      try { report = validateFeedback(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { fail(400, "invalid_feedback"); return; }
      try { if (!send) throw new FeedbackUnavailableError("feedback_unavailable"); await send(report); }
      catch (error) { fail(503, error instanceof FeedbackUnavailableError ? "feedback_unavailable" : "feedback_unconfirmed"); return; }
      reply(200, { accepted: true, id: report.id });
    } finally { active--; }
  };
}

// Only the central relay calls the provider; desktop packages contain no mail key.
export function createAgentMailSender({ apiKey, inbox, fetchImpl = fetch }: { apiKey: string; inbox: string; fetchImpl?: typeof fetch }): FeedbackSender {
  if (!apiKey.trim() || !inbox.trim()) throw new Error("AgentMail key and sending inbox are required.");
  return async value => {
    const report = validateFeedback(value);
    const response = await fetchImpl(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `jumpybrain-feedback-${report.id}` },
      body: JSON.stringify({ to: ["jumpybrain@agentmail.to"], subject: "jumpyBrain beta feedback", text: report.message,
        ...(report.diagnostics === null ? {} : { attachments: [{ filename: "jumpybrain-diagnostics.txt", content_type: "text/plain", content: Buffer.from(report.diagnostics).toString("base64") }] }) }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("feedback_unconfirmed"); }
    const result = await boundedJson(response);
    if (typeof result?.message_id !== "string" || !result.message_id) throw new Error("feedback_unconfirmed");
  };
}
