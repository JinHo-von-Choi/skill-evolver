/**
 * HeuristicVerifier: 규칙 기반 대리 검증기.
 *
 * 제안된 스킬의 trigger · description · rationale을 검사해
 * GSO(Generalizable Skill Optimization) 위반 — 즉 특정 작업 환경에
 * 종속된 하드코딩 — 을 탐지한다. 위반이 하나도 없으면 승인한다.
 */

import type {
  Program,
  SkillProposal,
  Task,
  VerificationResult,
  Verifier,
} from "./types.js";

interface GsoRule {
  name:   string;
  pattern: RegExp;
}

const SYSTEM_DIR_NAMES = "home|Users|root|var|tmp|opt|etc|usr|srv|mnt|media|workspace";
const DATA_FILE_EXTENSIONS = "json|yaml|yml|csv|tsv|log|txt|toml|ini|env|sqlite|db|parquet|xml|pkl|dump";

const GSO_RULES: GsoRule[] = [
  {
    name:    "absolute-path",
    pattern: new RegExp(`(?:\\/|\\\\)?(?:\\b(?:${SYSTEM_DIR_NAMES})[\\\\/][\\w.\\\\/-]+|[A-Za-z]:\\\\[^\\s"'\\x60]+)`, "g"),
  },
  {
    name:    "relative-path",
    pattern: /(?:\.\.?\/)[\w./-]+\.[A-Za-z]\w*/g,
  },
  {
    name:    "concrete-filename",
    pattern: new RegExp(`\\b[\\w][\\w.-]*\\.(?:${DATA_FILE_EXTENSIONS})\\b`, "g"),
  },
  {
    name:    "task-identifier",
    pattern: /\b(?:task|case|item|sample|seed|query|batch)[_-]?\d+\b|\bt\d+\b/g,
  },
  {
    name:    "uuid-identifier",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
  },
];

const CHECKED_FIELDS = [
  ["trigger", (p: SkillProposal) => p.trigger],
  ["description", (p: SkillProposal) => p.description],
  ["rationale", (p: SkillProposal) => p.rationale],
] as const;

export class HeuristicVerifier implements Verifier {
  async verify(
    proposal: SkillProposal,
    _program: Program,
    _validationTasks?: Task[],
  ): Promise<VerificationResult> {
    const violations: string[] = [];

    for (const [fieldName, getField] of CHECKED_FIELDS) {
      const fields = getField(proposal);
      for (const rule of GSO_RULES) {
        for (const match of fields.matchAll(rule.pattern)) {
          violations.push(`${rule.name}: ${JSON.stringify(match[0])} (${fieldName})`);
        }
      }
    }

    if (violations.length === 0) {
      return {
        approved:      true,
        confidence:    1,
        reason:        "No GSO violations detected: no hardcoded paths, filenames, or task-specific identifiers.",
        gsoViolations: [],
      };
    }

    return {
      approved:      false,
      confidence:    1,
      reason:        `GSO violations: ${violations.join("; ")}`,
      gsoViolations: violations,
    };
  }
}
