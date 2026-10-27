// Browser support evidence: schema construction, never arbitrary console/log capture.
import { createDiagnosticBuffer, diagnosticOperation, diagnosticCode, diagnosticId, statusCode, diagnosticErrorKind, supportReport, type DiagnosticSnapshot } from "../diagnostics/events.js";
declare const __JUMPYBRAIN_VERSION__: string;
declare const __JUMPYBRAIN_BUILD__: string;
export const FEEDBACK_EMAIL = "jumpybrain@agentmail.to";
const SUBJECT = "jumpyBrain beta feedback";
const MAX_MESSAGE = 4000;
export const MAX_FEEDBACK_BYTES = 65536;
export function diagnosticBuildInfo() {
  return { version: typeof __JUMPYBRAIN_VERSION__ === "string" ? __JUMPYBRAIN_VERSION__ : "beta", build: typeof __JUMPYBRAIN_BUILD__ === "string" ? __JUMPYBRAIN_BUILD__ : "unavailable" };
}
export function createFeedbackDiagnostics(now = () => new Date()) {
  const buffer = createDiagnosticBuffer("browser");
  const freshId = () => "d_" + Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("");
  const session = freshId();
  const probes = new WeakMap<Response, { id: string; started: number }>();
  const event = (operation: string, details: Record<string, unknown> = {}) => buffer.record({ at: now().toISOString(), component: "browser", session, operation, ...diagnosticBuildInfo(), severity: "info", outcome: "ok", code: "none", ...details });
  return {
    event,
    begin() { return { id: freshId(), started: performance.now() }; },
    finish(url: string, method: string, probe: { id: string; started: number }, response?: Response, aborted = false) {
      if (response) probes.set(response, probe);
      const outcome = response ? response.ok ? "ok" : "failed" : aborted ? "aborted" : "failed";
      event(diagnosticOperation(url, method), { request: probe.id, status: response?.status, durationMs: performance.now() - probe.started,
        outcome, severity: outcome === "ok" ? "info" : "warn", code: response ? statusCode(response.status) : aborted ? "aborted" : "network" });
    },
    result(url: string, method: string, response: Response, payload: unknown) {
      if (!payload || typeof payload !== "object") return;
      const packet = payload as { error?: { code?: unknown }; indexing?: { status?: unknown }; saved?: boolean };
      const code = diagnosticCode(packet.error?.code);
      const indexing = packet.indexing?.status;
      if (!response.ok || packet.saved === true || indexing === "failed") event(diagnosticOperation(url, method), {
        request: probes.get(response)?.id ?? diagnosticId(response.headers?.get("X-JumpyBrain-Request")), status: response.status,
        outcome: !response.ok ? "failed" : indexing === "failed" ? "pending" : packet.saved === true ? "ok" : "pending",
        severity: !response.ok || indexing === "failed" ? "warn" : "info",
        code: !response.ok ? code === "unknown" ? statusCode(response.status) : code : indexing === "failed" ? "index_failed" : indexing === "pending" ? "pending" : "saved",
      });
    },
    record(url: string, method: string, outcome: number | "failed" | "aborted") {
      event(diagnosticOperation(url, method), { status: typeof outcome === "number" ? outcome : undefined, outcome: typeof outcome === "number" ? outcome < 400 ? "ok" : "failed" : outcome,
        severity: typeof outcome === "number" && outcome < 400 ? "info" : "warn", code: typeof outcome === "number" ? statusCode(outcome) : outcome === "aborted" ? "aborted" : "network" });
    },
    snapshot(context: { view: string; connection: string; companion: boolean }, userAgent: string, hostSources: DiagnosticSnapshot[] = [], hostInfo?: unknown) {
      const browser = /Electron\/([\d.]+)/.exec(userAgent) ?? /(Firefox|Edg|Chrome|Version)\/([\d.]+)/.exec(userAgent);
      const platform = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Macintosh/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "other";
      const sources = hostSources.filter((s) => s && typeof s === "object" && Array.isArray(s.events));
      const info = hostInfo && typeof hostInfo === "object" ? hostInfo as Record<string, unknown> : {};
      const hostRuntime = { version: typeof info.version === "string" && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(info.version) ? info.version.slice(0, 50) : "unavailable",
        build: typeof info.build === "string" && /^[a-f0-9]{16}$/.test(info.build) ? info.build : "unavailable" };
      return JSON.stringify({ ...supportReport([buffer.snapshot(), ...sources], 21000), app: "jumpyBrain", ...diagnosticBuildInfo(), hostRuntime,
        generatedAt: now().toISOString(), platform, browser: browser ? browser[0] : "other", companion: context.companion === true,
        view: ["home", "note", "graph", "settings"].includes(context.view) ? context.view : "other",
        connection: ["checking", "connected", "disconnected", "unavailable"].includes(context.connection) ? context.connection : "other",
        coverage: context.companion ? "local_host_only_no_remote_server_logs" : "browser_only_no_server_access", browserHistory: "current_tab_only" });
    },
  };
}

function base64(text: string) {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
}
function encodedPart(text: string) { return base64(text).match(/.{1,76}/g)?.join("\r\n") ?? ""; }

export function feedbackEmailDraft(message: string, diagnostics: string | null): string {
  // Base64 parts cannot contain this boundary; user input never enters headers.
  const boundary = "jumpybrain-feedback-boundary";
  const lines = [`To: ${FEEDBACK_EMAIL}`, `Subject: ${SUBJECT}`, "X-Unsent: 1", "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    encodedPart(message.slice(0, MAX_MESSAGE).replace(/\r?\n/g, "\r\n"))];
  if (diagnostics !== null) lines.push(`--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Disposition: attachment; filename="jumpybrain-diagnostics.txt"', "Content-Transfer-Encoding: base64", "", encodedPart(diagnostics));
  lines.push(`--${boundary}--`, "");
  const draft = lines.join("\r\n");
  if (new TextEncoder().encode(draft).length > MAX_FEEDBACK_BYTES) throw new Error("Feedback exceeds the email draft limit. Shorten the message or exclude diagnostics.");
  return draft;
}

export function feedbackMailto(message: string, diagnostics: string | null): string {
  const body = new TextDecoder().decode(new TextEncoder().encode(message.slice(0, MAX_MESSAGE))) + (diagnostics === null ? "" : "\n\nDiagnostic log (inline):\n" + diagnostics);
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}

export function installFeedback(options: {
  document: Document; window: Window; diagnostics: ReturnType<typeof createFeedbackDiagnostics>;
  context: () => { view: string; connection: string; companion: boolean };
  onOpen?: () => void;
  onSubmitted?: (id: string) => void;
  submit?: (report: { id: string; message: string; diagnostics: string | null }, signal: AbortSignal) => Promise<unknown>;
  collectHost?: (signal: AbortSignal) => Promise<{ sources?: DiagnosticSnapshot[]; runtime?: unknown }>;
}) {
  const { document, window, diagnostics } = options;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = element<HTMLDialogElement>("feedback-dialog");
  const message = element<HTMLTextAreaElement>("feedback-message");
  const include = element<HTMLInputElement>("feedback-include-logs");
  const status = element<HTMLElement>("feedback-status");
  const send = element<HTMLButtonElement>("feedback-send");
  let sending = false;
  let submission: { id: string; message: string; diagnostics: string | null } | null = null;
  let snapshot = "", openSequence = 0, collecting = false;
  let collection: AbortController | null = null;
  function update() {
    send.disabled = sending || collecting || !message.value.trim();
    send.textContent = sending ? "Sending…" : "Send feedback";
    message.disabled = sending;
    include.disabled = sending;
    element<HTMLButtonElement>("feedback-close").disabled = sending;
    dialog.dataset.collecting = String(collecting);
    status.hidden = !status.textContent;
  }
  function close(restoreFocus = true) {
    if (sending && restoreFocus) return;
    if (!dialog.open) return;
    openSequence++; collection?.abort(); collection = null; collecting = false;
    dialog.close();
    snapshot = "";
    if (restoreFocus) element("open-feedback").focus({ preventScroll: true });
  }
  element("open-feedback").addEventListener("click", () => {
    if (sending || dialog.open || document.querySelector("dialog[open]")) return;
    options.onOpen?.();
    snapshot = submission?.diagnostics ?? diagnostics.snapshot(options.context(), window.navigator.userAgent);
    status.textContent = "";
    update();
    dialog.showModal();
    message.focus();
    if (include.checked && !submission) void collect();
  });
  send.addEventListener("click", async () => {
    if (sending || collecting || !dialog.open || !message.value.trim()) return;
    const report = { message: message.value, diagnostics: include.checked ? snapshot : null };
    if (!submission || submission.message !== report.message || submission.diagnostics !== report.diagnostics) {
      submission = { id: window.crypto.randomUUID(), ...report };
    }
    const pending = submission, token = openSequence;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    sending = true; update();
    status.textContent = "";
    try {
      if (!options.submit) throw new Error("unavailable");
      const result = await options.submit(pending, controller.signal) as { accepted?: boolean; id?: string };
      if (result?.accepted !== true || result.id !== pending.id) throw new Error("unconfirmed");
      if (submission === pending) { submission = null; message.value = ""; }
      if (dialog.open && token === openSequence) {
        sending = false;
        close();
        options.onSubmitted?.(pending.id);
      }
    } catch (error) {
      if (dialog.open && token === openSequence) status.textContent = (error as { code?: string })?.code === "feedback_unavailable"
        ? "Feedback is temporarily unavailable. Your message is still here."
        : "Couldn’t confirm delivery. Your message is still here. Try again.";
    } finally {
      window.clearTimeout(timer); sending = false; update();
    }
  });
  async function collect() {
    if (!options.collectHost || !dialog.open || !include.checked) return;
    collection?.abort();
    const token = ++openSequence, controller = new AbortController(); collection = controller;
    const timer = window.setTimeout(() => controller.abort(), 2000);
    collecting = true; update();
    try {
      const host = await Promise.race([options.collectHost(controller.signal), new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("diagnostics unavailable")), { once: true });
      })]);
      if (controller.signal.aborted || !dialog.open || token !== openSequence || !include.checked) return;
      snapshot = diagnostics.snapshot(options.context(), window.navigator.userAgent, Array.isArray(host?.sources) ? host.sources : [], host?.runtime);
      update();
    } catch {
      if (dialog.open && token === openSequence && include.checked) {
        snapshot = diagnostics.snapshot(options.context(), window.navigator.userAgent, [{ component: "gateway", availability: "unavailable", events: [], dropped: 0, failures: 1, truncatedBytes: 0 }]);
        update();
      }
    } finally { window.clearTimeout(timer); if (collection === controller) { collection = null; collecting = false; if (dialog.open) update(); } }
  }
  element("feedback-close").addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  // Keep global shortcuts away from the note while composing feedback.
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  message.addEventListener("input", update);
  include.addEventListener("change", () => {
    if (!include.checked) { openSequence++; collection?.abort(); collection = null; collecting = false; }
    update();
    if (include.checked) void collect();
  });
  // Error messages/stacks may contain note text or credentials; record only the event.
  window.addEventListener("error", (event) => diagnostics.event("exception", { severity: "error", outcome: "failed", code: diagnosticErrorKind(event.error),
    location: event.filename?.startsWith(window.location.origin + "/") ? "shell" : undefined, line: event.lineno, column: event.colno }));
  window.addEventListener("unhandledrejection", (event) => diagnostics.event("rejection", { severity: "error", outcome: "failed", code: diagnosticErrorKind(event.reason) }));
  return { close, isOpen: () => dialog.open };
}

export const feedbackMarkup = String.raw`
<dialog id="feedback-dialog" class="document-dialog" aria-labelledby="feedback-title">
  <button id="feedback-close" class="icon-button" type="button" aria-label="Close feedback"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
  <h2 id="feedback-title">Feedback</h2>
  <textarea id="feedback-message" aria-label="Your feedback" maxlength="4000" placeholder="What could be better?"></textarea>
  <div class="feedback-options">
    <label class="feedback-check"><input id="feedback-include-logs" type="checkbox" checked /> Include logs</label>
    <span class="feedback-info">
      <button class="icon-button" type="button" aria-label="About diagnostic logs" aria-describedby="feedback-logs-info"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v6M12 7v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <span id="feedback-logs-info" role="tooltip">App version and recent errors help us troubleshoot. No note content, searches, passwords or raw logs.</span>
    </span>
  </div>
  <div class="dialog-actions">
    <button id="feedback-send" class="button button-primary" type="button">Send feedback</button>
  </div>
  <p id="feedback-status" role="status" aria-live="polite" hidden></p>
</dialog>`;

export const feedbackStyles = String.raw`
  #feedback-dialog p { color: var(--ink-soft); font-size: var(--text-body); overflow-wrap: anywhere; }
  #feedback-dialog { position: relative; width: min(440px, calc(100vw - var(--space-8))); }
  #feedback-title { margin: 0 var(--space-10) var(--space-5) 0; }
  #feedback-close { position: absolute; top: var(--space-4); right: var(--space-4); border-color: transparent; background: transparent; }
  #feedback-message { min-height: 140px; margin: 0 0 var(--space-3); resize: vertical; }
  #feedback-dialog .feedback-options { display: flex; align-items: center; gap: var(--space-1); }
  #feedback-dialog .feedback-check { display: flex; align-items: center; gap: var(--space-2); }
  #feedback-include-logs { width: 16px; height: 16px; accent-color: var(--accent); }
  #feedback-dialog .feedback-info { position: relative; display: inline-flex; }
  #feedback-dialog .feedback-info button { border-color: transparent; background: transparent; }
  #feedback-logs-info { visibility: hidden; position: absolute; z-index: 1; bottom: calc(100% + var(--space-1)); left: 50%; transform: translateX(-50%); width: min(240px, calc(100vw - var(--space-16))); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink-soft); font-size: var(--text-caption); line-height: 1.5; box-shadow: var(--shadow-sm); pointer-events: none; }
  #feedback-dialog .feedback-info:hover #feedback-logs-info, #feedback-dialog .feedback-info:focus-within #feedback-logs-info { visibility: visible; }
  #feedback-dialog .dialog-actions { justify-content: flex-end; margin-top: var(--space-4); }
  #feedback-status { margin: var(--space-3) 0 0; }
`;
