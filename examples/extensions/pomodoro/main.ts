import type { ExtensionFactory, Json } from "jumpybrain/extensions.js";

type Mode = "focus" | "break";
type Timer = { version: 1; mode: Mode; remainingMs: number; deadline: number | null; completed: Mode | null };
const duration = (mode: Mode) => (mode === "focus" ? 25 : 5) * 60_000;
const fresh = (mode: Mode = "focus"): Timer => ({ version: 1, mode, remainingMs: duration(mode), deadline: null, completed: null });
const object = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function restore(value: Json | undefined): Timer {
  const state = object(value);
  if (state.version !== 1 || (state.mode !== "focus" && state.mode !== "break") ||
      typeof state.remainingMs !== "number" || !Number.isFinite(state.remainingMs) || state.remainingMs <= 0 || state.remainingMs > duration(state.mode) ||
      (state.deadline !== null && (typeof state.deadline !== "number" || !Number.isSafeInteger(state.deadline) || state.deadline <= 0)) ||
      (state.completed !== null && state.completed !== "focus" && state.completed !== "break")) return fresh();
  return { version: 1, mode: state.mode, remainingMs: state.remainingMs, deadline: state.deadline as number | null, completed: state.completed };
}

const activate: ExtensionFactory = api => {
  // One device-local timer, with no brain/document data or retained invocation context.
  // Serialize read/modify/write across tabs; no gateway background interval is needed.
  let pending = Promise.resolve();
  const run = (input: Json) => {
    const task = pending.then(async () => {
      let timer = restore(await api.state.get("timer-v1"));
      const now = Date.now();
      if (timer.deadline !== null && timer.deadline <= now) {
        const completed = timer.mode;
        timer = { ...fresh(completed === "focus" ? "break" : "focus"), completed };
      }
      const request = object(input);
      const action = request.action ?? "status";
      switch (action) {
        case "status": break;
        case "start":
          if (timer.deadline === null) timer = { ...timer, deadline: now + timer.remainingMs, completed: null };
          break;
        case "pause":
          if (timer.deadline !== null) timer = { ...timer, remainingMs: Math.min(timer.remainingMs, timer.deadline - now), deadline: null };
          break;
        case "reset": timer = fresh(timer.mode); break;
        case "mode":
          if (request.mode !== "focus" && request.mode !== "break") throw new Error("Choose focus or break.");
          timer = fresh(request.mode);
          break;
        default: throw new Error("Unknown Pomodoro action.");
      }
      await api.state.set("timer-v1", timer);
      return { panel: { id: "timer", data: { ...timer, durationMs: duration(timer.mode), now } } };
    });
    pending = task.then(() => {}, () => {});
    return task;
  };
  api.registerPanel({ id: "timer", title: "Pomodoro" });
  api.registerCommand({ id: "open", title: "Pomodoro", slot: "sidebar.actions", handler: () => run(null) });
  api.registerCommand({ id: "control", title: "Pomodoro controls", handler: input => run(input) });
};
export default activate;
