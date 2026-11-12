#!/usr/bin/env node
// commit-msg hook: commits carry only human authorship. Strips AI-tool
// co-author trailers and "Generated with" footers so no assistant is ever
// credited as a GitHub contributor. Run via .githooks/commit-msg.
import { readFileSync, writeFileSync } from "node:fs";

const AI = /claude|anthropic|codex|openai|chatgpt|\bgpt\b|mistral|\bvibe\b|gemini|google-labs|copilot|cursor(agent)?\b|devin|aider|jules|windsurf|codeium|amazon q|kiro/i;
const isAiLine = (line) =>
  (/^\s*co-authored-by:/i.test(line) && AI.test(line)) ||
  (/generated (with|by)/i.test(line) && AI.test(line));

export function stripAiAttribution(message) {
  const kept = message.split("\n").filter((line) => !isAiLine(line));
  while (kept.length && kept.at(-1).trim() === "") kept.pop();
  return kept.join("\n") + "\n";
}

const file = process.argv[2];
if (file) {
  const original = readFileSync(file, "utf8");
  const cleaned = stripAiAttribution(original);
  if (cleaned !== original) writeFileSync(file, cleaned);
}
