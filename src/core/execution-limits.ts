/** Pure finite operation budgets; hosts own environment selection and transport. */
export const MEMORY_EXECUTION_DEFAULTS = Object.freeze({ search: 60_000, index: 600_000 });
export function memoryExecutionDeadlineMs(kind: 'search' | 'index', value?: number): number {
  const timeout = value ?? MEMORY_EXECUTION_DEFAULTS[kind];
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new Error('Execution timeout must be a positive integer no larger than 2147483647 ms.');
  return timeout;
}
export function memoryTransportDeadlineMs(kind: 'search' | 'index', backendTimeoutMs?: number): number {
  return Math.min(2_147_483_647, memoryExecutionDeadlineMs(kind, backendTimeoutMs) + 10_000);
}
