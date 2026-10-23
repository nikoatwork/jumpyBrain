export interface SearchMaintenancePacket {
  index?: { lastIndexedAt?: string; stale?: boolean };
  readiness?: { freshness?: string };
  maintenance?: { enabled: boolean; indexing: boolean; failed: boolean };
}

export type SearchMaintenanceState =
  | "updating"
  | "failed"
  | "unavailable"
  | "ready";

/** Observes host publication only; this never starts an index mutation. */
export function installSearchMaintenance(options: {
  document: Document;
  window: Window;
  scope(): string;
  enabled(): boolean;
  read(signal: AbortSignal): Promise<SearchMaintenancePacket>;
  onFresh(): void;
  onState(state: SearchMaintenanceState): void;
}) {
  const { document, window } = options;
  let stopped = false;
  let timer: number | undefined;
  let active:
    | { scope: string; controller: AbortController; promise: Promise<void> }
    | undefined;
  let observedScope: string | undefined;
  let generation: string | undefined;
  let needsFresh = false;
  let previousState: SearchMaintenanceState | undefined;

  const eligible = () =>
    !stopped && document.visibilityState !== "hidden" && options.enabled();
  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }
  function suspend() {
    clearTimer();
    const pending = active;
    active = undefined;
    pending?.controller.abort();
  }
  function emit(state: SearchMaintenanceState) {
    if (previousState !== state) {
      previousState = state;
      options.onState(state);
    }
  }
  function schedule() {
    clearTimer();
    if (eligible())
      timer = window.setTimeout(() => {
        timer = undefined;
        void check();
      }, 10_000);
  }

  function check(): Promise<void> {
    if (!eligible()) {
      suspend();
      return Promise.resolve();
    }
    const scope = options.scope();
    if (active?.scope === scope) return active.promise;
    suspend();
    if (observedScope !== scope) {
      observedScope = scope;
      generation = undefined;
      needsFresh = false;
      previousState = undefined;
    }
    const controller = new AbortController();
    const job = { scope, controller, promise: undefined! as Promise<void> };
    active = job;
    job.promise = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const deadline = window.setTimeout(() => controller.abort(), 5_000);
      let cancel!: () => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        cancel = () => reject(new Error("status_aborted"));
        controller.signal.addEventListener("abort", cancel, { once: true });
        if (controller.signal.aborted) cancel();
      });
      const current = () =>
        active === job && eligible() && options.scope() === scope;
      try {
        const packet = await Promise.race([
          options.read(controller.signal),
          aborted,
        ]);
        if (!current()) return;
        const fresh =
          packet.readiness?.freshness === "fresh" &&
          packet.index?.stale !== true;
        if (fresh) {
          // Current source readiness wins over historical automatic failures.
          emit("ready");
          const next = packet.index?.lastIndexedAt;
          if (next) {
            const changed = generation !== undefined && next !== generation;
            const recover = needsFresh;
            generation = next;
            needsFresh = false;
            if ((changed || recover) && current()) options.onFresh();
          }
        } else {
          needsFresh = true;
          const maintenance = packet.maintenance;
          if (maintenance?.failed) emit("failed");
          else if (maintenance?.enabled || maintenance?.indexing)
            emit("updating");
          else emit("unavailable");
        }
      } catch {
        if (current()) {
          needsFresh = true;
          emit("unavailable");
        }
      } finally {
        window.clearTimeout(deadline);
        controller.signal.removeEventListener("abort", cancel);
        if (active === job) {
          active = undefined;
          schedule();
        }
      }
    });
    return job.promise;
  }

  const visibility = () => {
    if (document.visibilityState === "hidden") suspend();
    else void check();
  };
  const focus = () => {
    void check();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", focus);
  window.addEventListener("pageshow", focus);
  window.addEventListener("pagehide", suspend);
  void check();
  return {
    check,
    resume: schedule,
    suspend,
    stop() {
      stopped = true;
      suspend();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("pagehide", suspend);
    },
  };
}
