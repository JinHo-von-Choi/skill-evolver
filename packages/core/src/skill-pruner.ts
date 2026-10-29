import { ConflictDetector } from "./conflict-detector.js";
import type { FeedbackEntry, PruneResult, Skill, SkillPruner } from "./types.js";

export interface HeuristicSkillPrunerConfig {
  similarityThreshold?: number;
  minAttempts?: number;
  similarityFn?: (a: string, b: string) => number;
}

/** 피드백 성과와 트리거 중복도를 이용한 후방 지식 정리. */
export class HeuristicSkillPruner implements SkillPruner {
  private readonly detector: ConflictDetector;
  private readonly minAttempts: number;

  constructor(config: HeuristicSkillPrunerConfig = {}) {
    const threshold = config.similarityThreshold ?? 0.85;
    this.minAttempts = config.minAttempts ?? 3;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new RangeError("similarityThreshold must be between 0 and 1");
    }
    if (!Number.isInteger(this.minAttempts) || this.minAttempts < 1) {
      throw new RangeError("minAttempts must be a positive integer");
    }
    this.detector = new ConflictDetector({
      maxSkills: Infinity,
      similarityThreshold: threshold,
      similarityFn: config.similarityFn,
    });
  }

  async prune(skills: Skill[], history: FeedbackEntry[] = []): Promise<PruneResult> {
    const stats = new Map<string, { attempts: number; totalDelta: number; successes: number }>();
    for (const entry of history) {
      const name = entry.proposal.action === "edit"
        ? (entry.proposal.editTarget ?? entry.proposal.skillName)
        : entry.proposal.skillName;
      const stat = stats.get(name) ?? { attempts: 0, totalDelta: 0, successes: 0 };
      stat.attempts++;
      stat.totalDelta += entry.delta;
      if (entry.accepted) stat.successes++;
      stats.set(name, stat);
    }

    const pruned = new Set<string>();
    const reasons: string[] = [];
    const ranked = skills.map((skill, index) => {
      const stat = stats.get(skill.name);
      const meanDelta = stat ? stat.totalDelta / stat.attempts : 0;
      if (stat && stat.attempts >= this.minAttempts && (meanDelta < 0 || stat.successes === 0)) {
        pruned.add(skill.name);
        reasons.push(`Pruned "${skill.name}": ${stat.attempts} attempts, mean delta ${meanDelta.toFixed(4)}, success rate ${stat.successes}/${stat.attempts}.`);
      }
      return { skill, index, meanDelta };
    }).sort((a, b) => b.meanDelta - a.meanDelta || a.index - b.index);

    // 이력이 없는 스킬의 평균은 0으로 간주하며, 동률이면 입력 순서를 따른다.
    // 유지할 대표만 비교하므로 이미 제거된 스킬이 다른 스킬을 제거하지 않는다.
    const representatives: Skill[] = [];
    for (const { skill } of ranked) {
      if (pruned.has(skill.name)) continue;
      const overlap = this.detector.check(skill, representatives)[0];
      if (overlap) {
        pruned.add(skill.name);
        reasons.push(`Pruned "${skill.name}": duplicate of "${overlap.existingSkill}" (similarity ${overlap.similarity!.toFixed(4)}), lower or tied mean delta.`);
      } else {
        representatives.push(skill);
      }
    }

    return {
      keptSkills: skills.filter((skill) => !pruned.has(skill.name)),
      prunedSkills: [...new Set(skills.filter((skill) => pruned.has(skill.name)).map((skill) => skill.name))],
      rationale: reasons.join(" ") || "No redundant or underperforming skills found.",
    };
  }
}
