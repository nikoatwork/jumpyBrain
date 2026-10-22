// Browser-only policy for newly entered references. Transport and document/session
// ownership stay with the host; canonical title uniqueness stays with the server.
import { referenceRanges, type ReferenceRange } from "./reference-ranges.js";
import { safeReferenceTitle } from "./reference-policy.js";
import { isValidMemoryDocumentId } from "../../core/document-id-format.js";

// Active ranges come from the editor's single-leaf classifier, not a second
// Markdown parser. A context edit elsewhere must not create old unresolved links.
export function completedReferenceTitles(before: string, after: string, active: readonly ReferenceRange[]): string[] {
  if (before === after) return [];
  let start = 0, oldEnd = before.length, end = after.length;
  while (start < oldEnd && start < end && before[start] === after[start]) start++;
  while (oldEnd > start && end > start && before[oldEnd - 1] === after[end - 1]) { oldEnd--; end--; }
  const edited = [...new Set(active.filter((range) => end > start
    ? range.start < end && range.end > start
    : range.start < start && range.end > start).map((range) => range.title))];
  // Removing surrounding code/escape syntax can activate an old literal, but
  // only newly completed literal occurrences count as entering a reference.
  if (!edited.length) return [];
  const oldCounts = literalCounts(before), newCounts = literalCounts(after);
  return edited.filter((title) => (newCounts.get(title) || 0) > (oldCounts.get(title) || 0));
}
function literalCounts(source: string) {
  const counts = new Map<string, number>();
  for (const match of source.matchAll(/\[\[([^\[\]\r\n]+)\]\]/g)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return counts;
}

export type ReferenceCreationResult = { status: string; id?: string; created?: boolean; [key: string]: unknown };
export type ReferenceCreationState = { pending: string[]; errors: { title: string; message: string }[]; busy: boolean };
export function createReferenceCreation(options: {
  getSession(): unknown;
  isEnabled(): boolean;
  ensure(title: string, signal: AbortSignal): Promise<ReferenceCreationResult>;
  onChange?(state: ReferenceCreationState): void;
  onCreated?(result: ReferenceCreationResult, title: string): void;
}) {
  type Entry = { ready: boolean; requiredCount: number; error?: string };
  const entries = new Map<string, Entry>();
  let session = options.getSession(), generation = 0, destroyed = false;
  let controller: AbortController | null = null, running: Promise<boolean> | null = null;
  let sourceConfirmed = false;
  let savedTitles = new Map<string, number>(), currentTitles = new Map<string, number>();
  const state: ReferenceCreationState = { pending: [], errors: [], busy: false };
  function notify() {
    state.pending = [...entries.keys()];
    state.errors = [...entries].flatMap(([title, entry]) => entry.error ? [{ title, message: entry.error }] : []);
    state.busy = controller !== null;
    options.onChange?.(state);
  }
  function reset() {
    generation++; controller?.abort(); controller = null; running = null;
    entries.clear(); savedTitles.clear(); currentTitles.clear();
    sourceConfirmed = false;
    session = options.getSession(); notify();
  }
  function valid() {
    if (destroyed) return false;
    if (!Object.is(session, options.getSession())) reset();
    return options.isEnabled();
  }
  function present(markdown: string) {
    const counts = new Map<string, number>();
    for (const range of referenceRanges(markdown)) counts.set(range.title, (counts.get(range.title) || 0) + 1);
    return counts;
  }
  // Wait for a clean confirmed body. Counts alone cannot prove that an external
  // same-title occurrence confirms a newly entered local link during a rebase.
  function eligible(title: string, entry: Entry) { return sourceConfirmed && (savedTitles.get(title) || 0) >= entry.requiredCount && (currentTitles.get(title) || 0) >= entry.requiredCount; }
  async function drain(): Promise<boolean> {
    if (!valid()) return entries.size === 0;
    if (running) return running;
    const runGeneration = generation;
    const run = (async () => {
      for (;;) {
        if (destroyed || generation !== runGeneration || !Object.is(session, options.getSession()) || !options.isEnabled()) return false;
        const next = [...entries].find(([, entry]) => entry.ready && !entry.error);
        if (!next) return entries.size === 0;
        const [title, entry] = next;
        if (!eligible(title, entry)) { entries.delete(title); notify(); continue; }
        const request = new AbortController(); controller = request; notify();
        try {
          const result = await options.ensure(title, request.signal);
          if (generation !== runGeneration || !Object.is(session, options.getSession()) || destroyed) return false;
          if (result.status !== "found" || !isValidMemoryDocumentId(result.id)) {
            entry.error = result.status === "ambiguous" ? "Several pages share this title. Rename the reference or choose an existing page."
              : result.status === "unopenable" ? "This title belongs to a page that cannot be opened."
              : "Page creation could not be confirmed. Retry to check the saved title.";
          } else {
            entries.delete(title);
            if (result.created) options.onCreated?.(result, title);
          }
        } catch {
          if (generation !== runGeneration || !Object.is(session, options.getSession()) || destroyed) return false;
          entry.error = "Page creation could not be confirmed. Retry to check the saved title.";
        } finally {
          if (generation === runGeneration && controller === request) { controller = null; notify(); }
        }
      }
    })();
    running = run;
    try { return await run; }
    finally { if (running === run) { running = null; notify(); } }
  }
  function saved(savedMarkdown: string, currentMarkdown: string, rebased = false) {
    if (!valid()) return Promise.resolve(entries.size === 0);
    savedTitles = present(savedMarkdown); currentTitles = present(currentMarkdown);
    sourceConfirmed = savedMarkdown === currentMarkdown;
    for (const [title, entry] of entries) {
      const count = currentTitles.get(title) || 0;
      // A safe rebase preserves local edits but can remove an older same-title
      // occurrence elsewhere. Adjust only existing intent, never enqueue input.
      if (rebased && count) entry.requiredCount = Math.min(entry.requiredCount, count);
      if (count < entry.requiredCount) entries.delete(title);
      else entry.ready = eligible(title, entry);
    }
    notify(); return drain();
  }
  return {
    state,
    completed(titles: readonly string[], sourceMarkdown?: string) {
      if (!valid()) return;
      const sourceTitles = sourceMarkdown === undefined ? null : present(sourceMarkdown);
      for (const title of titles) if (safeReferenceTitle(title) && !entries.has(title)) entries.set(title, {
        ready: false, requiredCount: Math.max(1, sourceTitles?.get(title) || 0),
      });
      notify();
    },
    saved: (savedMarkdown: string, currentMarkdown = savedMarkdown) => saved(savedMarkdown, currentMarkdown),
    rebase: (savedMarkdown: string, currentMarkdown: string) => saved(savedMarkdown, currentMarkdown, true),
    settle: drain,
    retry() {
      if (!valid()) return Promise.resolve(entries.size === 0);
      for (const [title, entry] of entries) if (entry.error && eligible(title, entry)) delete entry.error;
      notify(); return drain();
    },
    hasPending() { return entries.size > 0 || controller !== null; },
    reset,
    destroy() { destroyed = true; reset(); },
  };
}
