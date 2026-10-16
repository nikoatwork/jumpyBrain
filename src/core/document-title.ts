/** Shared exact-title policy for canonical renames, references and graph lookup. */
export function normalizedDocumentTitle(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase().normalize("NFC") : "";
}
