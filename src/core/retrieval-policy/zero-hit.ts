/** Static advisory code in `retrieval.warnings`; it never marks retrieval partial. */
export const FEWER_KEYWORDS_HINT = "no_matches_try_fewer_keywords";

/** Outcomes of lexical discovery that still completed; any other warning has its own explanation. */
const LEXICAL_OUTCOMES = new Set(["query_constraints_lexical_only", "keyword_query_relaxed", "read_only_index", "read_only_lexical_fallback"]);

export interface ZeroHitFacts {
  /** Search rows before caller-side filters or byte budgets. */
  results: number;
  /** Result count asked of the backend; zero never ran a search. */
  requested: number;
  /** Distinct query keywords as the lexical backend counts them. */
  keywords: number;
  readOnly: boolean;
  modes: ReadonlyArray<"lexical" | "semantic">;
  /** Every other retrieval warning already recorded for this search. */
  warnings: readonly string[];
}

/**
 * True only for a completed, fresh, lexical-only search of several keywords that matched nothing.
 * Stale, failed, temporal or semantic outcomes carry their own warnings and get no keyword advice.
 */
export function fewerKeywordsHintApplies(facts: ZeroHitFacts): boolean {
  if (facts.results !== 0 || facts.requested < 1 || facts.keywords < 2) return false;
  if (!facts.warnings.every(warning => LEXICAL_OUTCOMES.has(warning))) return false;
  return facts.readOnly || !facts.modes.includes("semantic") || facts.warnings.includes("query_constraints_lexical_only");
}
