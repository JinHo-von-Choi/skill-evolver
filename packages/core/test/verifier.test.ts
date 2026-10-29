import { describe, it, expect } from "vitest";
import { HeuristicVerifier } from "../src/verifier.js";
import type { Program, SkillProposal, VerificationResult } from "../src/types.js";

function makeProposal(overrides?: Partial<SkillProposal>): SkillProposal {
  return {
    action:      "create",
    skillName:   "fix-null-access",
    trigger:     "When accessing a property of an undefined object fails",
    description: "Adds null guards before property access",
    rationale:   "Repeated failures reading properties of undefined values",
    ...overrides,
  };
}

const program: Program = {
  id:         "gen1-test",
  generation: 1,
  skills:     [],
  score:      0.5,
  branch:     "main",
};

async function verifyBoosted(proposal: SkillProposal): Promise<VerificationResult> {
  return new HeuristicVerifier().verify(proposal, program);
}

describe("HeuristicVerifier", () => {
  it("일반화 가능한 제안은 승인한다", async () => {
    const result = await verifyBoosted(makeProposal());

    expect(result.approved).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.gsoViolations).toHaveLength(0);
  });

  it("절대 경로 하드코딩은 기각한다", async () => {
    const result = await verifyBoosted(makeProposal({
      rationale: "Reads /home/nirna/jobs/data/projects.csv when the parser fails",
    }));

    expect(result.approved).toBe(false);
    expect(result.gsoViolations!.some((v) => v.includes("absolute-path"))).toBe(true);
    expect(result.gsoViolations!.some((v) => v.includes("rationale"))).toBe(true);
    expect(result.reason).toContain("/home/nirna/jobs/data/projects.csv");
  });

  it("상대 경로 하드코딩은 기각한다", async () => {
    const result = await verifyBoosted(makeProposal({
      trigger: "When parsing ./test-data/sample.json fails",
    }));

    expect(result.approved).toBe(false);
    expect(result.gsoViolations!.some((v) => v.includes("relative-path"))).toBe(true);
  });

  it("구체적 파일명 하드코딩은 기각한다", async () => {
    const result = await verifyBoosted(makeProposal({
      description: "Loads rows from test.json and compares them with output.csv",
    }));

    expect(result.approved).toBe(false);
    expect(result.gsoViolations!.some((v) => v.includes("concrete-filename"))).toBe(true);
    expect(result.gsoViolations!.some((v) => v.includes("test.json"))).toBe(true);
  });

  it("태스크 고유 식별자 하드코딩은 기각한다", async () => {
    const result = await verifyBoosted(makeProposal({
      trigger: "When task-42 or t7 fails to execute",
    }));

    expect(result.approved).toBe(false);
    expect(result.gsoViolations!.some((v) => v.includes("task-identifier"))).toBe(true);
  });

  it("여러 필드의 위반을 모두 수집한다", async () => {
    const result = await verifyBoosted(makeProposal({
      trigger:     "When ./configs/rules.yaml changes",
      description: "Saves results to output.log",
      rationale:   "Fixes failures on case-17",
    }));

    expect(result.approved).toBe(false);
    expect(result.gsoViolations!.some((v) => v.includes("trigger"))).toBe(true);
    expect(result.gsoViolations!.some((v) => v.includes("description"))).toBe(true);
    expect(result.gsoViolations!.some((v) => v.includes("rationale"))).toBe(true);
    expect(result.gsoViolations!.length).toBeGreaterThanOrEqual(3);
  });

  it("스킬명에 위반이 있어도 검사 대상 필드 밖이면 승인한다", async () => {
    const result = await verifyBoosted(makeProposal({
      skillName: "export-test-json",
    }));

    expect(result.approved).toBe(true);
  });
});
