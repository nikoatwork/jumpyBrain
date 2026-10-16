import { randomInt, randomUUID } from 'node:crypto';

export class ControlError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new ControlError(code, message, status); };
const validTab = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);

// One authority, no optimistic tab expiry. Anonymous request scopes pin their target.
export class SwitchCoordinator {
  generation = randomInt(1, 2 ** 47);
  tabs = new Map();
  retired = new Map();
  pending = null;
  inFlight = 0;
  closing = false;
  constructor({ timeoutMs = 15000 } = {}) { this.timeoutMs = timeoutMs; }
  state() { return { generation: this.generation, phase: this.pending ? 'preparing' : 'idle', switchId: this.pending?.id ?? null }; }
  fence(generation) {
    if (generation !== this.generation || this.closing) fail('stale_generation', 'This tab belongs to an old brain session. Reopen from the companion menu.');
  }
  register(id, generation) {
    this.fence(generation);
    if (!validTab(id)) fail('invalid_tab', 'Invalid editor tab.', 400);
    if (!this.tabs.has(id) && this.tabs.size >= 128) fail('tab_limit', 'Close unused companion tabs before opening more.', 429);
    if (!this.tabs.has(id)) {
      if (this.pending?.committing) fail('switch_busy', 'Brain activation is in progress. Retry shortly.');
      this.tabs.set(id, { acknowledged: null });
    }
  }
  poll(id, generation) {
    // Only tabs that positively saved in this process may learn an activation
    // via their old generation. A restarted coordinator instead fences drafts.
    if (!this.closing && this.retired.get(generation)?.has(id)) return;
    this.fence(generation);
    if (!this.tabs.has(id)) fail('stale_generation', 'This editor tab is no longer registered.');
  }
  unregister(id, generation) {
    this.fence(generation);
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (this.pending && tab.acknowledged !== this.pending.id) this.pending.reject(new ControlError('tab_left', 'A tab closed before confirming its save. Retry switching.'));
    this.tabs.delete(id);
    this.check();
  }
  acknowledge(id, switchId, ok) {
    const pending = this.pending;
    if (!pending || pending.id !== switchId || pending.committing) fail('switch_expired', 'The switch is no longer waiting for saves.');
    const tab = this.tabs.get(id);
    if (!tab || typeof ok !== 'boolean') fail('invalid_ack', 'Invalid save acknowledgement.', 400);
    if (!ok) { pending.reject(new ControlError('save_blocked', 'A tab has unsaved or unconfirmed work. Resolve it before switching.')); return; }
    tab.acknowledged = switchId;
    this.check();
  }
  enter(generation, tabId, native = false) {
    this.fence(generation);
    if (!native) {
      this.poll(tabId, generation);
      if (this.pending && this.tabs.get(tabId).acknowledged === this.pending.id) fail('switch_busy', 'This tab has confirmed its save; wait for activation.');
    }
    if (this.pending?.committing || (native && this.pending)) fail('switch_busy', 'A brain switch is in progress.');
    this.inFlight++;
    let done = false;
    return () => { if (!done) { done = true; this.inFlight--; this.check(); } };
  }
  check() {
    const pending = this.pending;
    if (!pending || pending.committing || this.inFlight) return;
    if ([...this.tabs.values()].every((tab) => tab.acknowledged === pending.id)) {
      pending.committing = true; // Synchronous admission fence before persistence/activation awaits.
      pending.resolve();
    }
  }
  async switch(targetId, activate) {
    if (this.pending || this.closing) fail('switch_busy', 'Another switch or shutdown is in progress.');
    const pending = { id: randomUUID(), targetId, committing: false };
    const barrier = new Promise((resolve, reject) => { pending.resolve = resolve; pending.reject = reject; });
    this.pending = pending;
    const timer = setTimeout(() => pending.reject(new ControlError('save_timeout', 'A tab did not confirm its save. Wake or close unused tabs, then retry.')), this.timeoutMs);
    try {
      this.check();
      await barrier;
      clearTimeout(timer);
      await activate();
      this.retired.set(this.generation, new Set(this.tabs.keys()));
      if (this.retired.size > 32) this.retired.delete(this.retired.keys().next().value);
      this.generation++;
      this.tabs.clear(); // Old generation can never dispatch on the new target.
    } finally {
      clearTimeout(timer);
      if (this.pending === pending) this.pending = null;
    }
  }
  close() {
    this.closing = true;
    this.pending?.reject(new ControlError('shutting_down', 'The companion is shutting down.', 503));
  }
}
