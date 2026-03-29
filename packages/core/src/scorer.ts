import type { ScorerType } from "./types.js";

export type ScorerFn = (output: unknown, expected: unknown) => number;

export function exactMatch(output: unknown, expected: unknown): number {
  if (output === expected) return 1;
  try {
    return JSON.stringify(output) === JSON.stringify(expected) ? 1 : 0;
  } catch {
    return 0;
  }
}

export function fuzzy(output: unknown, expected: unknown): number {
  const outStr = String(output).toLowerCase();
  const expStr = String(expected).toLowerCase();
  if (outStr === expStr) return 1;
  if (outStr.includes(expStr) || expStr.includes(outStr)) return 0.5;
  return 0;
}

const SCORERS: Record<string, ScorerFn> = {
  "exact-match": exactMatch,
  "fuzzy":       fuzzy,
};

export function getScorer(type: ScorerType = "exact-match"): ScorerFn {
  return SCORERS[type] ?? exactMatch;
}
