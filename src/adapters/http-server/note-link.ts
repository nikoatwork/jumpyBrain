// Brain-relative Markdown note links, e.g. `[ICP](../pages/icp.md)`, `[x](./x.md)`
// or `[x](pages/x.md)`. The source stays canonical Markdown; activation resolves the
// destination against the linking note's folder (notes-browser resolveNoteLinkFile)
// and opens that note. No schemes, absolute paths or escaping the brain root.

const SOURCE = /^\[[^\]]*\]\(([^()\s]+)\)$/;

/** The destination of a note link (`.md`, optional `#fragment`), or null for any other link. */
export function noteLinkDestination(source: string): string | null {
  const destination = SOURCE.exec(source)?.[1];
  if (!destination || destination.startsWith("/") || destination.includes(":")) return null;
  return /\.md$/i.test(destination.split("#")[0]) ? destination : null;
}
