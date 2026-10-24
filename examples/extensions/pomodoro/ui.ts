import type { ExtensionUIFactory, Json } from "jumpybrain/extensions.js";

type Snapshot = { mode: "focus" | "break"; remainingMs: number; deadline: number | null; durationMs: number; completed: "focus" | "break" | null };
function snapshot(value: Json): Snapshot {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (value.mode !== "focus" && value.mode !== "break") || typeof value.remainingMs !== "number" ||
      typeof value.durationMs !== "number" || (value.deadline !== null && typeof value.deadline !== "number")) throw new Error("Invalid Pomodoro state.");
  return value as unknown as Snapshot;
}

const activate: ExtensionUIFactory = api => {
  const panels = new Set<() => void>();
  const unregister = api.registerPanel("timer", (container, initial, context) => {
    const doc = container.ownerDocument;
    let timer = snapshot(initial);
    let disposed = false;
    let busy = false;
    let expiryRequested = false;
    const live = () => !disposed && !context.signal.aborted;
    const card = doc.createElement("section");
    card.setAttribute("aria-label", "Pomodoro timer");
    Object.assign(card.style, { display: "grid", gap: "18px", padding: "8px 0", color: "var(--ink)", minWidth: "0" });
    const heading = doc.createElement("p");
    heading.textContent = "A little focus. A little breathing room.";
    Object.assign(heading.style, { margin: "0", color: "var(--ink-soft)", textAlign: "center" });
    const modes = doc.createElement("div"); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "Timer mode");
    Object.assign(modes.style, { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" });
    const face = doc.createElement("div");
    Object.assign(face.style, { display: "grid", gap: "10px", padding: "24px 12px", borderRadius: "24px", background: "var(--control-fill)", border: "1px solid var(--line)", textAlign: "center" });
    const caption = doc.createElement("span"); Object.assign(caption.style, { color: "var(--accent)", fontWeight: "600" });
    const clock = doc.createElement("div"); clock.setAttribute("role", "timer"); clock.setAttribute("aria-live", "off");
    Object.assign(clock.style, { fontSize: "clamp(48px, 14vw, 76px)", lineHeight: "1.1", fontWeight: "700", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" });
    const progress = doc.createElement("progress"); progress.max = 1; progress.setAttribute("aria-label", "Interval elapsed");
    Object.assign(progress.style, { width: "100%", height: "8px", accentColor: "var(--accent)" });
    face.append(caption, clock, progress);
    const controls = doc.createElement("div");
    Object.assign(controls.style, { display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px" });
    const status = doc.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    Object.assign(status.style, { margin: "0", textAlign: "center", color: "var(--ink-soft)" });
    const hint = doc.createElement("p");
    hint.textContent = "25 minutes of focus, then a 5-minute break. Start each interval when you’re ready. Switching modes resets the timer. You can close this panel and come back.";
    Object.assign(hint.style, { margin: "0", fontSize: "13px", lineHeight: "1.6", color: "var(--ink-soft)" });
    const listeners: Array<() => void> = [];
    function button(label: string, parent: HTMLElement, action: () => void) {
      const element = doc.createElement("button"); element.type = "button"; element.className = "quiet-button"; element.textContent = label;
      Object.assign(element.style, { border: "1px solid var(--line-strong)", borderRadius: "999px", padding: "10px 18px", color: "var(--ink)", fontWeight: "600" });
      element.addEventListener("click", action); listeners.push(() => element.removeEventListener("click", action)); parent.append(element); return element;
    }
    const focus = button("Focus · 25 min", modes, () => { void execute({ action: "mode", mode: "focus" }); });
    const rest = button("Break · 5 min", modes, () => { void execute({ action: "mode", mode: "break" }); });
    const toggle = button("Start focus", controls, () => { void execute({ action: timer.deadline === null ? "start" : "pause" }); });
    const reset = button("Reset", controls, () => { void execute({ action: "reset" }); });
    toggle.style.borderColor = "var(--accent)";
    card.append(heading, modes, face, controls, status, hint); container.append(card);

    function render() {
      if (!live()) return;
      const remaining = timer.deadline === null ? timer.remainingMs : Math.min(timer.remainingMs, Math.max(0, timer.deadline - Date.now()));
      const seconds = Math.ceil(remaining / 1000);
      clock.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
      clock.setAttribute("aria-label", `${timer.mode === "focus" ? "Focus" : "Break"}: ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`);
      progress.value = Math.max(0, Math.min(1, 1 - remaining / timer.durationMs));
      caption.textContent = timer.mode === "focus" ? "✦ Time to focus" : "❀ Room to breathe";
      focus.setAttribute("aria-pressed", String(timer.mode === "focus")); rest.setAttribute("aria-pressed", String(timer.mode === "break"));
      focus.style.background = timer.mode === "focus" ? "var(--surface-hover)" : "var(--control-fill)";
      rest.style.background = timer.mode === "break" ? "var(--surface-hover)" : "var(--control-fill)";
      toggle.textContent = timer.deadline !== null ? "Pause" : (timer.remainingMs < timer.durationMs ? "Resume" : "Start " + timer.mode);
      for (const element of [focus, rest, toggle, reset]) element.disabled = busy;
      if (timer.deadline !== null && remaining === 0 && !busy && !expiryRequested) {
        expiryRequested = true;
        void execute({ action: "status" });
      }
    }
    function describe() {
      status.textContent = timer.completed === "focus" ? "Focus complete. Take a breath, then start your break." :
        timer.completed === "break" ? "Break complete. Ready for a fresh focus?" :
        timer.deadline !== null ? (timer.mode === "focus" ? "One thing at a time. You’ve got this." : "Stretch, sip, look away from the screen.") :
        timer.remainingMs < timer.durationMs ? "Paused. Pick it up when you’re ready." : "Ready when you are.";
    }
    async function execute(input: Json) {
      if (!live() || busy) return;
      busy = true; render();
      try {
        const result = await context.execute("control", input);
        if (!live()) return;
        if (!result?.panel || result.panel.id !== "timer") throw new Error("Missing timer state.");
        timer = snapshot(result.panel.data); expiryRequested = false; describe();
      } catch {
        if (live()) status.textContent = "Timer could not sync. Reopen Pomodoro to recover its saved state.";
        // Do not create a repeating request loop when completion cannot be saved.
      } finally { busy = false; render(); }
    }
    describe(); render();
    const interval = setInterval(render, 250);
    const wake = () => render();
    doc.addEventListener("visibilitychange", wake);
    function dispose() {
      if (disposed) return;
      disposed = true; clearInterval(interval); listeners.splice(0).forEach(remove => remove());
      doc.removeEventListener("visibilitychange", wake); context.signal.removeEventListener("abort", dispose);
      card.remove(); panels.delete(dispose);
    }
    panels.add(dispose); context.signal.addEventListener("abort", dispose, { once: true });
    if (context.signal.aborted) dispose();
    return dispose;
  });
  api.onDispose(() => { unregister(); for (const dispose of panels) dispose(); });
};
export default activate;
