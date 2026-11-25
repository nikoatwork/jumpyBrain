import type { SemanticSetupStatus } from "../types.js";

/** Plain-words name of the search a brain uses; `semanticSetup` stays the precise machine state. */
export interface SearchModeSummary {
  mode: "keyword" | "smart";
  ready: boolean;
  summary: string;
}

const MB = 1_000_000;
export const formatMegabytes = (bytes: number): string => `${Math.round(bytes / MB)} MB`;

export function searchModeSummary(setup: SemanticSetupStatus | undefined): SearchModeSummary | undefined {
  if (!setup) return undefined;
  switch (setup.state) {
    case "lexical": return { mode: "keyword", ready: true, summary: "keyword search (smart search is off; jumpybrain smart-search explains what turning it on downloads)" };
    case "ready": return { mode: "smart", ready: true, summary: "smart search (matching words, plus notes that say the same thing in other words)" };
    case "incomplete": return { mode: "smart", ready: false, summary: "smart search is on but this brain's index is not finished; searches fall back to keyword matches until it is" };
    case "unavailable": return { mode: "smart", ready: false, summary: "smart search is on but its model is missing on this computer; searches fall back to keyword matches" };
    case "failed": return { mode: "smart", ready: false, summary: "smart search is on but its last index failed; searches fall back to keyword matches" };
  }
}

/** One line for status/doctor text output. */
export function formatSearchLine(setup: SemanticSetupStatus | undefined): string | undefined {
  const search = searchModeSummary(setup);
  if (!search) return undefined;
  return `Search: ${search.summary}${!search.ready && setup?.nextAction ? `. Next: ${setup.nextAction}` : ""}`;
}

/** Outcome first, then what it costs. Shared by smart-search output. */
export function smartSearchExplanation(downloadBytes: number): string[] {
  return [
    "Smart search also finds notes that say the same thing in other words, not only notes with matching words.",
    `- Download: a ${formatMegabytes(downloadBytes)} language model (EmbeddingGemma 300M), once per computer, from Hugging Face.`,
    `- Disk: about ${formatMegabytes(downloadBytes)} under ~/.jumpybrain/models, plus up to the same again while downloading.`,
    "- Runs: on this computer only, while indexing and searching; it uses extra memory then.",
    "- Network and privacy: smart search sends none of your notes anywhere; only the one-time model download uses the internet. (A cloud assistant you use can still send recalled excerpts to its provider.)",
    "- Undo: jumpybrain smart-search off switches back to keyword search; add --remove-model to free the disk space.",
  ];
}
