import { describe, it, expect } from "vitest";
import { ParetoFrontier } from "../src/pareto-frontier.js";
import { AdaptiveFrontier, computeDiversity } from "../src/adaptive-frontier.js";
import type { Program } from "../src/types.js";

function prog(id: string, score: number, skills: string[] = [], generation = 0): Program {
  return {
    id, generation, score, branch: "main",
    skills: skills.map((name) => ({ name, trigger: name, content: "" })),
  };
}

describe("tournament 선택", () => {
  it("무작위 두 후보 중 높은 점수를 고른다", () => {
    const seq = [0, 0.99];
    let i = 0;
    const f = new ParetoFrontier(
      { capacity: 3, selectionStrategy: "tournament" },
      () => seq[i++ % seq.length],
    );
    f.update(prog("low", 0.2));
    f.update(prog("high", 0.9));

    expect(f.selectParent().id).toBe("high");
  });

  it("round-robin은 순환한다", () => {
    const f = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    f.update(prog("a", 0.1));
    f.update(prog("b", 0.2));
    expect([f.selectParent().id, f.selectParent().id, f.selectParent().id]).toEqual(["a", "b", "a"]);
  });
});

describe("computeDiversity", () => {
  it("스킬 구성이 같으면 겹침률 1", () => {
    const m = computeDiversity([prog("a", 0.5, ["x", "y"]), prog("b", 0.7, ["x", "y"])]);
    expect(m.skillOverlapRate).toBe(1);
    expect(m.scoreVariance).toBeCloseTo(0.01);
  });

  it("스킬이 서로 다르면 겹침률 0", () => {
    const m = computeDiversity([prog("a", 0.5, ["x"]), prog("b", 0.5, ["y"])]);
    expect(m.skillOverlapRate).toBe(0);
  });

  it("빈 frontier는 모두 0", () => {
    expect(computeDiversity([])).toEqual({ skillOverlapRate: 0, scoreVariance: 0, avgGeneration: 0 });
  });
});

describe("AdaptiveFrontier 축소", () => {
  it("용량이 줄면 낮은 점수 프로그램을 제거한다", () => {
    const f = new AdaptiveFrontier({
      capacity: 3, selectionStrategy: "round-robin", adaptive: true, minCapacity: 2, maxCapacity: 5,
    });
    f.update(prog("a", 0.1));
    f.update(prog("b", 0.5));
    f.update(prog("c", 0.9));

    f.evaluateAndAdjust({ skillOverlapRate: 0.1, scoreVariance: 0.5, avgGeneration: 1 });

    expect(f.capacity).toBe(2);
    expect(f.getAll().map((p) => p.id).sort()).toEqual(["b", "c"]);
  });
});
