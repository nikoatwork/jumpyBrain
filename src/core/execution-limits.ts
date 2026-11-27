/** Pure finite operation budgets; hosts own environment selection and transport. */
export const MEMORY_EXECUTION_DEFAULTS = Object.freeze({ search: 60_000, index: 600_000 });
export function memoryExecutionDeadlineMs(kind: 'search' | 'index', value?: number): number {
  const timeout = value ?? MEMORY_EXECUTION_DEFAULTS[kind];
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new Error('Execution timeout must be a positive integer no larger than 2147483647 ms.');
  return timeout;
}
/** How long a warm smart-search model stays loaded after its last use; 0 keeps it while the host runs. */
export const SMART_SEARCH_IDLE_DEFAULT_MS = 30 * 60_000;
export function smartSearchIdleMs(value?: number | string): number {
  // An empty or fractional string must not silently become 0 ("never unload").
  const idle = value === undefined ? SMART_SEARCH_IDLE_DEFAULT_MS : typeof value === 'string' ? (/^\s*\d+\s*$/.test(value) ? Number(value) : NaN) : value;
  if (!Number.isSafeInteger(idle) || idle < 0 || idle > 2_147_483_647) throw new Error('JUMPYBRAIN_SMART_SEARCH_IDLE_MS must be a whole number of milliseconds from 0 (keep the model loaded while the backend runs) to 2147483647.');
  return idle;
}
export function memoryTransportDeadlineMs(kind: 'search' | 'index', backendTimeoutMs?: number): number {
  return Math.min(2_147_483_647, memoryExecutionDeadlineMs(kind, backendTimeoutMs) + 10_000);
}
