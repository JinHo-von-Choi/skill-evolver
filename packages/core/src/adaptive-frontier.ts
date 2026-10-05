import type { AdaptiveFrontierConfig, DiversityMetrics, Program } from "./types.js";
import { ParetoFrontier } from "./pareto-frontier.js";

/**
 * Pareto Frontier k 자동 조정.
 * 다양성 지표 기반으로 frontier 용량을 동적으로 확장/축소.
 *
 * 규칙:
 *   skillOverlapRate > 0.6              -> k += 1 (다양성 부족, 탐색 확대)
 *   scoreVariance > 0.3 AND overlap < 0.3 -> k -= 1 (충분히 다양, 집중)
 *   minCapacity <= k <= maxCapacity
 */
export class AdaptiveFrontier extends ParetoFrontier {
  private readonly minCapacity: number;
  private readonly maxCapacity: number;

  constructor(config: AdaptiveFrontierConfig, rng?: () => number) {
    super(config, rng);
    this.minCapacity = config.minCapacity;
    this.maxCapacity = config.maxCapacity;
  }

  /**
   * 다양성 지표를 평가하여 frontier 용량(k)을 조정.
   * EvolutionLoop에서 5 이터레이션마다 호출.
   */
  evaluateAndAdjust(metrics: DiversityMetrics): void {
    if (metrics.skillOverlapRate > 0.6) {
      this._capacity = Math.min(this._capacity + 1, this.maxCapacity);
    } else if (metrics.scoreVariance > 0.3 && metrics.skillOverlapRate < 0.3) {
      this._capacity = Math.max(this._capacity - 1, this.minCapacity);
      this.trim();
    }
  }

  /**
   * 현재 frontier의 다양성 지표를 계산한다.
   */
  computeMetrics(): DiversityMetrics {
    return computeDiversity(this.getAll());
  }
}

/**
 * frontier 프로그램들의 스킬 겹침률(쌍별 Jaccard 평균), 점수 분산, 평균 세대를 계산한다.
 */
export function computeDiversity(programs: Program[]): DiversityMetrics {
  const n = programs.length;
  if (n === 0) return { skillOverlapRate: 0, scoreVariance: 0, avgGeneration: 0 };

  const meanScore = programs.reduce((a, p) => a + p.score, 0) / n;
  const scoreVariance = programs.reduce((a, p) => a + (p.score - meanScore) ** 2, 0) / n;
  const avgGeneration = programs.reduce((a, p) => a + p.generation, 0) / n;

  let sum   = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = new Set(programs[i].skills.map((s) => s.name));
      const b = new Set(programs[j].skills.map((s) => s.name));
      let inter = 0;
      for (const name of a) if (b.has(name)) inter++;
      const union = a.size + b.size - inter;
      sum += union === 0 ? 1 : inter / union;
      pairs++;
    }
  }

  return {
    skillOverlapRate: pairs === 0 ? 0 : sum / pairs,
    scoreVariance,
    avgGeneration,
  };
}
