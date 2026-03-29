import type { Skill, ConflictResult } from "./types.js";

export interface ConflictDetectorConfig {
  maxSkills:           number;
  similarityThreshold: number;
}

/**
 * 스킬 트리거 조건 겹침 검사.
 * Jaccard 유사도 기반 트리거 토큰 비교.
 */
export class ConflictDetector {
  constructor(private readonly config: ConflictDetectorConfig) {}

  /**
   * 새 스킬과 기존 스킬 목록 간 충돌 검사.
   * trigger-overlap: Jaccard 유사도가 임계값 이상인 경우.
   * capacity: 기존 스킬 수가 maxSkills 이상인 경우.
   */
  check(newSkill: Skill, existingSkills: Skill[]): ConflictResult[] {
    const results:   ConflictResult[] = [];
    const newTokens = this.tokenize(newSkill.trigger);

    for (const existing of existingSkills) {
      const existingTokens = this.tokenize(existing.trigger);
      const similarity     = this.jaccard(newTokens, existingTokens);

      if (similarity >= this.config.similarityThreshold) {
        results.push({
          type:          "trigger-overlap",
          existingSkill: existing.name,
          similarity,
          message:       `Trigger overlap with "${existing.name}" (similarity: ${similarity.toFixed(2)})`,
        });
      }
    }

    if (existingSkills.length >= this.config.maxSkills) {
      results.push({
        type:    "capacity",
        message: `Skill capacity reached: ${existingSkills.length}/${this.config.maxSkills}`,
      });
    }

    return results;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)
    );
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;

    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
