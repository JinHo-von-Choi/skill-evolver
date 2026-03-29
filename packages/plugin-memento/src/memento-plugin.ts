/**
 * MementoPlugin -- memento-mcp 기억 시스템과 EvolutionLoop를 연동하는 플러그인.
 *
 * onFailure:        과거 유사 에러 recall
 * onProposal:       과거 스킬 이력 recall
 * onEvaluation:     스킬 성과 remember
 * onFrontierUpdate: frontier 스냅샷 remember
 */

import type {
  Plugin,
  PluginContext,
  Failure,
  SkillProposal,
  EvaluationResult,
  Program,
} from "@nerdvana/evolver-core";

import type { MementoClient } from "./memento-client.js";

export class MementoPlugin implements Plugin {
  readonly name = "memento";
  readonly hooks;

  constructor(private readonly client: MementoClient) {
    this.hooks = {
      onFailure:        this.onFailure.bind(this),
      onProposal:       this.onProposal.bind(this),
      onEvaluation:     this.onEvaluation.bind(this),
      onFrontierUpdate: this.onFrontierUpdate.bind(this),
    };
  }

  private async onFailure(failures: Failure[]): Promise<PluginContext> {
    const keywords = failures.flatMap((f) => {
      const parts: string[] = [];
      if (f.result.error) parts.push(f.result.error);
      if (f.task.category) parts.push(f.task.category);
      return parts;
    });

    if (keywords.length === 0) return {};

    try {
      const memories = await this.client.recall({ keywords, type: "error" });
      return { relatedFailures: memories.fragments };
    } catch {
      return {};
    }
  }

  private async onProposal(proposal: SkillProposal): Promise<PluginContext> {
    try {
      const memories = await this.client.recall({
        keywords: [proposal.skillName],
        topic:    "skill_evolution",
      });
      return { relatedSkills: memories.fragments };
    } catch {
      return {};
    }
  }

  private async onEvaluation(result: EvaluationResult): Promise<void> {
    try {
      await this.client.remember({
        content:    `Skill "${result.skillName}" eval: score ${result.score}, delta ${result.delta}, accepted ${result.accepted}`,
        topic:      "skill_evolution",
        type:       result.delta > 0 ? "fact" : "error",
        importance: Math.min(1, Math.abs(result.delta) * 2),
      });
    } catch {
      /* 기억 저장 실패는 진화 루프를 중단시키지 않는다 */
    }
  }

  private async onFrontierUpdate(frontier: Program[]): Promise<void> {
    try {
      const summary = frontier
        .map((p) => `${p.id}(${p.score.toFixed(3)})`)
        .join(", ");
      await this.client.remember({
        content:    `Frontier: ${summary}`,
        topic:      "skill_evolution",
        type:       "fact",
        importance: 0.3,
      });
    } catch {
      /* 기억 저장 실패는 진화 루프를 중단시키지 않는다 */
    }
  }
}
