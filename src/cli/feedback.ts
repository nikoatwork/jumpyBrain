import { randomUUID } from "node:crypto";
import { readSync } from "node:fs";
import { createFeedbackForwarder, FeedbackUnavailableError, validateFeedback } from "../adapters/feedback/index.js";
import type { ParsedCliArgs } from "./args.js";

export async function feedbackCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) {
    console.log([
      'Usage: jumpybrain feedback [--message "..."] [--dry-run] [--id <UUID-v4>] [--json]',
      "Without --message, read text from stdin (up to 4,000 characters).",
      "Sends supplied text to jumpyBrain developers through the configured support relay.",
      "No automatic logs, notes or credentials are attached. No memory root or app is required.",
      "--dry-run previews the report without network access. Use --id only for a deliberate retry of the same report.",
      "Agents: send only with user authorization; include version, reproduction, expected and actual behavior, excluding private data.",
    ].join("\n"));
    return;
  }

  const message = typeof args.message === "string" ? args.message : readFeedbackStdin();
  if (!message.trim() || message.length > 4000) throw new Error("Feedback must contain 1–4,000 characters of non-blank text.");
  const report = validateFeedback({ id: args.id ?? randomUUID(), message, diagnostics: null });
  if (args["dry-run"]) {
    if (args.json) console.log(JSON.stringify({ dryRun: true, report }));
    else console.log(`Feedback preview (not sent):\n${JSON.stringify(report, null, 2)}`);
    return;
  }

  try {
    await createFeedbackForwarder()(report);
  } catch (error) {
    const unavailable = error instanceof FeedbackUnavailableError;
    const message = unavailable
      ? "Feedback delivery is not configured. Keep your message and check JUMPYBRAIN_FEEDBACK_URL."
      : "Feedback delivery could not be confirmed. Keep your message; do not retry automatically. For a deliberate retry of the same message, reuse this report ID with --id.";
    if (args.json) console.log(JSON.stringify({ accepted: false, id: report.id, error: { code: unavailable ? "feedback_unavailable" : "feedback_unconfirmed", message } }));
    else console.error(`${message}\nReport ID: ${report.id}`);
    process.exitCode = 1;
    return;
  }
  if (args.json) console.log(JSON.stringify({ accepted: true, id: report.id }));
  else console.log(`Feedback accepted by the support service. Report ID: ${report.id}`);
}

function readFeedbackStdin(): string {
  if (process.stdin.isTTY) throw new Error("Supply --message or pipe feedback text on stdin. See jumpybrain feedback --help.");
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(4096);
  let size = 0;
  for (;;) {
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (!count) break;
    size += count;
    if (size > 16000) throw new Error("Feedback exceeds the 4,000-character message limit.");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks).toString("utf8");
}
