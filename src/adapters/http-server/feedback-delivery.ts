import type { IncomingMessage, ServerResponse } from "node:http";
import { FeedbackUnavailableError, validateFeedback, type FeedbackReport, type FeedbackSender } from "../feedback/index.js";

export { createAgentMailSender, createFeedbackForwarder, validateFeedback, type FeedbackReport, type FeedbackSender } from "../feedback/index.js";

const MAX_BYTES = 65536;

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
