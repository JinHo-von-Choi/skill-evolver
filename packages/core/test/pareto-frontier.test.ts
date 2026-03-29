import { describe, it, expect } from "vitest";
import { ParetoFrontier } from "../src/pareto-frontier.js";
import type { Program } from "../src/types.js";

function makeProgram(id: string, score: number, generation = 0): Program {
  return { id, generation, skills: [], score, branch: "main" };
}

describe("ParetoFrontier", () => {
  it("빈 frontier에 프로그램 추가", () => {
    const frontier = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    const accepted = frontier.update(makeProgram("p1", 0.8));

    expect(accepted).toBe(true);
    expect(frontier.size()).toBe(1);
    expect(frontier.getAll()[0].id).toBe("p1");
  });

  it("용량 초과 시 최저 점수 프로그램 퇴출", () => {
    const frontier = new ParetoFrontier({ capacity: 2, selectionStrategy: "round-robin" });
    frontier.update(makeProgram("p1", 0.5));
    frontier.update(makeProgram("p2", 0.8));
    const accepted = frontier.update(makeProgram("p3", 0.9));

    expect(accepted).toBe(true);
    expect(frontier.size()).toBe(2);
    const ids = frontier.getAll().map((p) => p.id);
    expect(ids).toContain("p2");
    expect(ids).toContain("p3");
    expect(ids).not.toContain("p1");
  });

  it("최저 점수보다 낮은 프로그램 거부", () => {
    const frontier = new ParetoFrontier({ capacity: 2, selectionStrategy: "round-robin" });
    frontier.update(makeProgram("p1", 0.7));
    frontier.update(makeProgram("p2", 0.8));
    const accepted = frontier.update(makeProgram("p3", 0.5));

    expect(accepted).toBe(false);
    expect(frontier.size()).toBe(2);
  });

  it("라운드로빈 선택", () => {
    const frontier = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    frontier.update(makeProgram("p1", 0.6));
    frontier.update(makeProgram("p2", 0.7));
    frontier.update(makeProgram("p3", 0.8));

    const first  = frontier.selectParent();
    const second = frontier.selectParent();
    const third  = frontier.selectParent();
    const fourth = frontier.selectParent();

    expect(first.id).toBe("p1");
    expect(second.id).toBe("p2");
    expect(third.id).toBe("p3");
    expect(fourth.id).toBe("p1");
  });

  it("best: 최고 점수 프로그램 반환", () => {
    const frontier = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    frontier.update(makeProgram("p1", 0.6));
    frontier.update(makeProgram("p2", 0.9));
    frontier.update(makeProgram("p3", 0.7));

    const best = frontier.best();
    expect(best.id).toBe("p2");
    expect(best.score).toBe(0.9);
  });

  it("빈 frontier에서 selectParent 시 에러", () => {
    const frontier = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    expect(() => frontier.selectParent()).toThrow();
  });

  it("빈 frontier에서 best 시 에러", () => {
    const frontier = new ParetoFrontier({ capacity: 3, selectionStrategy: "round-robin" });
    expect(() => frontier.best()).toThrow();
  });
});
