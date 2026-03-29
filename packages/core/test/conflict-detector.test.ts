import { describe, it, expect } from "vitest";
import { ConflictDetector } from "../src/conflict-detector.js";
import type { Skill, ConflictResult } from "../src/types.js";

function makeSkill(name: string, trigger: string): Skill {
  return { name, trigger, content: "" };
}

describe("ConflictDetector", () => {
  it("트리거 겹침 감지 (Jaccard 유사도)", () => {
    const detector  = new ConflictDetector({ maxSkills: 20, similarityThreshold: 0.5 });
    const existing  = [makeSkill("math-solver", "solve math problems and equations")];
    const newSkill  = makeSkill("equation-solver", "solve equations and math formulas");

    const conflicts = detector.check(newSkill, existing);
    const overlap   = conflicts.find((c) => c.type === "trigger-overlap");

    expect(overlap).toBeDefined();
    expect(overlap!.existingSkill).toBe("math-solver");
    expect(overlap!.similarity).toBeGreaterThan(0);
  });

  it("트리거 겹침 없음", () => {
    const detector = new ConflictDetector({ maxSkills: 20, similarityThreshold: 0.5 });
    const existing = [makeSkill("math-solver", "solve math problems")];
    const newSkill = makeSkill("translator", "translate text between languages");

    const conflicts = detector.check(newSkill, existing);
    expect(conflicts.filter((c) => c.type === "trigger-overlap")).toHaveLength(0);
  });

  it("maxSkills 용량 경고", () => {
    const detector = new ConflictDetector({ maxSkills: 2, similarityThreshold: 0.5 });
    const existing = [
      makeSkill("a", "trigger a"),
      makeSkill("b", "trigger b"),
    ];
    const newSkill = makeSkill("c", "completely different trigger");

    const conflicts = detector.check(newSkill, existing);
    const capacity  = conflicts.find((c) => c.type === "capacity");

    expect(capacity).toBeDefined();
    expect(capacity!.message).toContain("2");
  });

  it("빈 기존 스킬 목록에서 충돌 없음", () => {
    const detector = new ConflictDetector({ maxSkills: 20, similarityThreshold: 0.5 });
    const conflicts = detector.check(makeSkill("new", "some trigger"), []);
    expect(conflicts).toHaveLength(0);
  });
});
