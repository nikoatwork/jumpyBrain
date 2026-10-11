/** Explicit ISO dates only; Date.parse alone silently rolls invalid calendar days forward. */
export function metadataDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
  if (!match || match[0] !== value || value.startsWith("0000-")) return undefined;
  const day = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}
