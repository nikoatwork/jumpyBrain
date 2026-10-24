import type { ExtensionFactory, ExtensionContext, Json } from "jumpybrain/extensions.js";

/** Explicit, bounded retrieval. Titles and user input are untrusted search text. */
export function relatedQuery(input: Json, context: ExtensionContext): string {
  const value = input && typeof input === "object" && !Array.isArray(input) && typeof input.query === "string" ? input.query : context.document?.title || "";
  // A single line bounds the explicit query; the normal search parser still owns its semantics.
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}
const activate: ExtensionFactory = api => {
  api.registerPanel({ id: "results", title: "Related notes" });
  api.registerCommand({
    id: "open", title: "Related notes", shortcut: "Mod+Shift+R", slot: "note.actions",
    async handler(input, context) {
      const query = relatedQuery(input, context);
      if (context.signal.aborted) return;
      if (!query) return { panel: { id: "results", data: { query, results: [], state: "missing", message: "Open a saved note or enter a query to find related notes." } } };
      try {
        const packet = await context.memory.search({ query, limit: 9 });
        if (context.signal.aborted) return;
        const seen = new Set<string>();
        const results = packet.results.filter(result => {
          if (result.id === context.document?.id || seen.has(result.id)) return false;
          seen.add(result.id); return true;
        }).slice(0, 8).map(result => ({ id: result.id, title: result.title.slice(0, 200), snippet: result.snippet.slice(0, 600) }));
        return { panel: { id: "results", data: { query, results, state: "ready", stale: Boolean(packet.stale), partial: Boolean(packet.partial) } } };
      } catch {
        if (context.signal.aborted) return;
        return { panel: { id: "results", data: { query, results: [], state: "offline", message: "Search is unavailable. Check the connection and try again." } } };
      }
    },
  });
};
export default activate;
