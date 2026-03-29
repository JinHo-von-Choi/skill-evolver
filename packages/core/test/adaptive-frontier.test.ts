import { describe, it, expect } from "vitest";
import { AdaptiveFrontier } from "../src/adaptive-frontier.js";
import type { Program, AdaptiveFrontierConfig } from "../src/types.js";

function makeProgram(id: string, score: number, generation = 0): Program {
  return { id, generation, skills: [], score, branch: "main" };
}

function makeConfig(overrides?: Partial<AdaptiveFrontierConfig>): AdaptiveFrontierConfig {
  return {
    capacity:          3,
    selectionStrategy: "round-robin",
    adaptive:          true,
    minCapacity:       2,
    maxCapacity:       7,
    ...overrides,
  };
}

describe("AdaptiveFrontier", () => {
  it("ParetoFrontier 기본 동작 상속", () => {
    const af = new AdaptiveFrontier(makeConfig());
    af.update(makeProgram("p1", 0.8));

    expect(af.size()).toBe(1);
    expect(af.capacity).toBe(3);
  });

  it("겹침률 높으면 k 확장", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 3 }));
    af.evaluateAndAdjust({ skillOverlapRate: 0.8, scoreVariance: 0.01, avgGeneration: 3 });

    expect(af.capacity).toBe(4);
  });

  it("분산 높고 겹침률 낮으면 k 축소", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 5 }));
    af.evaluateAndAdjust({ skillOverlapRate: 0.2, scoreVariance: 0.5, avgGeneration: 3 });

    expect(af.capacity).toBe(4);
  });

  it("겹침률/분산 모두 조건 미달 시 k 유지", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 4 }));
    af.evaluateAndAdjust({ skillOverlapRate: 0.4, scoreVariance: 0.2, avgGeneration: 3 });

    expect(af.capacity).toBe(4);
  });

  it("maxCapacity 경계 준수", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 7, maxCapacity: 7 }));
    af.evaluateAndAdjust({ skillOverlapRate: 0.9, scoreVariance: 0.01, avgGeneration: 3 });

    expect(af.capacity).toBe(7);
  });

  it("minCapacity 경계 준수", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 2, minCapacity: 2 }));
    af.evaluateAndAdjust({ skillOverlapRate: 0.1, scoreVariance: 0.8, avgGeneration: 3 });

    expect(af.capacity).toBeGreaterThanOrEqual(2);
    expect(af.capacity).toBe(2);
  });

  it("연속 조정 누적", () => {
    const af = new AdaptiveFrontier(makeConfig({ capacity: 3 }));

    af.evaluateAndAdjust({ skillOverlapRate: 0.8, scoreVariance: 0.01, avgGeneration: 1 });
    expect(af.capacity).toBe(4);

    af.evaluateAndAdjust({ skillOverlapRate: 0.7, scoreVariance: 0.01, avgGeneration: 2 });
    expect(af.capacity).toBe(5);

    af.evaluateAndAdjust({ skillOverlapRate: 0.1, scoreVariance: 0.5, avgGeneration: 3 });
    expect(af.capacity).toBe(4);
  });
});
