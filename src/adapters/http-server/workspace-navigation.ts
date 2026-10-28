type NavigationEntry = { url: string; index: number };
type NavigationOptions = {
  initial: NavigationEntry;
  beforeLeave(): Promise<boolean>;
  blocked?(): boolean;
  scope?(url: string): string;
  resume?(): void;
  go(delta: number): void;
  push(entry: NavigationEntry): void;
  show(url: string): void;
  onChange?(): void;
};

// Undo a history traversal before flushing a draft, then replay it only on success.
// This preserves both history entries on failed saves instead of replacing the target URL.
export function createPageNavigation(options: NavigationOptions) {
  let current = options.initial;
  let position = current.index;
  let busy = false;
  let restoring: { resolve: () => void; promise: Promise<void> } | null = null;
  let committing: NavigationEntry | null = null;
  let requested = false;
  const isApp = (entry: NavigationEntry) => !/^\/settings\/?(?:\?|$)/.test(entry.url);
  let trail = isApp(current) ? [current] : [];
  const changed = () => options.onChange?.();
  function remember(entry: NavigationEntry) {
    trail = trail.filter((item) => item.index < entry.index);
    if (!isApp(entry)) return;
    if (trail.at(-1)?.url === entry.url) trail.pop();
    trail = [...trail, entry].slice(-6);
  }
  function availability() {
    const enabled = !busy && !requested && !options.blocked?.() && isApp(current);
    return {
      back: Boolean(enabled && trail.some((item) => item.index < current.index)),
      forward: Boolean(enabled && trail.some((item) => item.index > current.index)),
    };
  }
  function traverse(direction: -1 | 1) {
    if (!availability()[direction === -1 ? "back" : "forward"]) return;
    const entry = direction === -1
      ? trail.filter((item) => item.index < current.index).at(-1)
      : trail.find((item) => item.index > current.index);
    if (!entry) return;
    requested = true;
    changed();
    options.go(entry.index - current.index);
  }
  function restore() {
    if (position === current.index && !restoring) return Promise.resolve();
    if (!restoring) {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      restoring = { resolve, promise };
      options.go(current.index - position);
    }
    return restoring.promise;
  }
  async function navigate(destination: string | (() => string | Promise<string>)) {
    if (busy || requested || options.blocked?.()) return false;
    if (typeof destination !== "function" && (options.scope ? options.scope(destination) : destination) === current.url) return false;
    busy = true;
    changed();
    let applied = false;
    try {
      const allowed = await options.beforeLeave();
      await restore();
      if (!allowed) return false;
      // Creation runs only after saving the current draft, under the same history lock.
      const destinationUrl = typeof destination === "function" ? await destination() : destination;
      const url = options.scope ? options.scope(destinationUrl) : destinationUrl;
      await restore();
      // A resolved self-reference still applies its validated payload, without a new entry.
      if (url === current.url) { options.show(url); applied = true; return true; }
      current = { url, index: current.index + 1 };
      position = current.index;
      remember(current);
      options.push(current);
      options.show(url);
      applied = true;
      return true;
    } finally {
      // A rejected create may race Back/Forward too: restore before unlocking editing.
      await restore();
      busy = false;
      if (!applied && options.resume) options.resume();
      changed();
    }
  }
  async function pop(entry: NavigationEntry) {
    requested = false;
    position = entry.index;
    if (restoring) {
      if (position === current.index) {
        const done = restoring.resolve;
        restoring = null;
        done();
      } else options.go(current.index - position);
      return;
    }
    if (committing) {
      // If another traversal races the replay, honor the actual entry, after the same save guard.
      current = entry;
      committing = null;
      busy = false;
      if (isApp(entry) && !trail.some((item) => item.index === entry.index)) trail = [entry];
      options.show(entry.url);
      changed();
      return;
    }
    if (busy) { await restore(); return; }
    busy = true;
    changed();
    await restore();
    const allowed = await options.beforeLeave();
    await restore();
    if (!allowed) { busy = false; options.resume?.(); changed(); return; }
    committing = entry;
    options.go(entry.index - current.index);
  }
  return {
    navigate, pop, availability,
    back() {
      // Settings keeps its own browser/desktop Back behavior.
      if (!isApp(current)) { if (!busy && !options.blocked?.()) options.go(-1); }
      else traverse(-1);
    },
    forward() { traverse(1); },
    sync: changed,
    isBusy: () => busy || requested,
    reset(entry: NavigationEntry) {
      current = entry; position = entry.index; requested = false;
      trail = isApp(entry) ? [entry] : [];
      changed();
    },
  };
}
