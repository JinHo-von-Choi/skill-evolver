import { describe, it, expect } from "vitest";
import { CostTracker } from "../src/cost-tracker.js";
import type { CostRecord } from "../src/types.js";

function makeRecord(iteration: number, input: number, output: number, costUsd: number): CostRecord {
  return { iteration, tokenUsage: { input, output }, costUsd, timestamp: Date.now() };
}

describe("CostTracker", () => {
  it("record 및 total", () => {
    const tracker = new CostTracker();
    tracker.record(makeRecord(1, 1000, 500, 0.01));
    tracker.record(makeRecord(2, 2000, 800, 0.03));

    expect(tracker.total()).toBeCloseTo(0.04);
  });

  it("byIteration: 이터레이션별 비용 집계", () => {
    const tracker = new CostTracker();
    tracker.record(makeRecord(1, 1000, 500, 0.01));
    tracker.record(makeRecord(1, 500, 200, 0.005));
    tracker.record(makeRecord(2, 2000, 800, 0.03));

    const byIter = tracker.byIteration();
    expect(byIter.get(1)).toBeCloseTo(0.015);
    expect(byIter.get(2)).toBeCloseTo(0.03);
  });

  it("isOverBudget: 예산 초과 감지", () => {
    const tracker = new CostTracker({ budgetLimit: 0.05 });
    tracker.record(makeRecord(1, 1000, 500, 0.03));
    expect(tracker.isOverBudget()).toBe(false);

    tracker.record(makeRecord(2, 2000, 800, 0.03));
    expect(tracker.isOverBudget()).toBe(true);
  });

  it("budgetLimit 미설정 시 isOverBudget는 항상 false", () => {
    const tracker = new CostTracker();
    tracker.record(makeRecord(1, 100000, 50000, 100));
    expect(tracker.isOverBudget()).toBe(false);
  });

  it("빈 tracker의 total은 0", () => {
    const tracker = new CostTracker();
    expect(tracker.total()).toBe(0);
  });
});
