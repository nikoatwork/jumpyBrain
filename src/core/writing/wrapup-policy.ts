export const WRAPUP_REQUIRED_SECTIONS = [
  "Findings",
  "Decisions",
  "Conflicts / Corrections",
  "Open Questions",
] as const;

export type WrapupRequiredSection = typeof WRAPUP_REQUIRED_SECTIONS[number];

export interface WrapupValidation {
  valid: boolean;
  missingSections: string[];
  emptySections: string[];
}

export function validateWrapupBody(body: string): WrapupValidation {
  const sectionMatches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => ({
    title: normalizeHeading(match[1] ?? ""),
    index: match.index ?? 0,
  }));

  const missingSections = WRAPUP_REQUIRED_SECTIONS.filter((required) => !sectionMatches.some((match) => match.title === normalizeHeading(required)));
  const emptySections = WRAPUP_REQUIRED_SECTIONS.filter((required) => {
    const matchIndex = sectionMatches.findIndex((match) => match.title === normalizeHeading(required));
    if (matchIndex === -1) return false;
    const start = sectionMatches[matchIndex].index;
    const next = sectionMatches[matchIndex + 1]?.index ?? body.length;
    const sectionText = body.slice(start, next).split(/\r?\n/).slice(1).join("\n").trim();
    return sectionText.length === 0;
  });

  return {
    valid: missingSections.length === 0 && emptySections.length === 0,
    missingSections,
    emptySections,
  };
}

export function wrapupValidationMessage(validation: WrapupValidation): string {
  const parts = ["Invalid wrapup Markdown."];
  if (validation.missingSections.length > 0) {
    parts.push(`Missing required sections: ${validation.missingSections.map((section) => `## ${section}`).join(", ")}.`);
  }
  if (validation.emptySections.length > 0) {
    parts.push(`Empty required sections: ${validation.emptySections.map((section) => `## ${section}`).join(", ")}. Use '- None captured.' when intentionally empty.`);
  }
  return parts.join(" ");
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
