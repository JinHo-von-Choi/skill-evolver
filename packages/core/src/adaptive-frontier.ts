import type { AdaptiveFrontierConfig, DiversityMetrics } from "./types.js";
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

  constructor(config: AdaptiveFrontierConfig) {
    super(config);
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
    }
  }
}
