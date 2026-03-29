import type { CostRecord } from "./types.js";

export interface CostTrackerOptions {
  budgetLimit?: number;
}

/**
 * 이터레이션별 LLM 토큰/비용 집계.
 */
export class CostTracker {
  private records: CostRecord[] = [];
  private readonly budgetLimit?: number;

  constructor(options?: CostTrackerOptions) {
    this.budgetLimit = options?.budgetLimit;
  }

  record(entry: CostRecord): void {
    this.records.push(entry);
  }

  total(): number {
    let sum = 0;
    for (const r of this.records) {
      sum += r.costUsd;
    }
    return sum;
  }

  byIteration(): Map<number, number> {
    const map = new Map<number, number>();
    for (const r of this.records) {
      map.set(r.iteration, (map.get(r.iteration) ?? 0) + r.costUsd);
    }
    return map;
  }

  isOverBudget(): boolean {
    if (this.budgetLimit == null) return false;
    return this.total() > this.budgetLimit;
  }
}
