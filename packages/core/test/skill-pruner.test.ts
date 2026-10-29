import { describe, expect, it } from "vitest";
import { HeuristicSkillPruner, type FeedbackEntry, type Skill, type SkillPruner } from "../src/index.js";

function skill(name: string, trigger = name): Skill {
  return { name, trigger, content: "" };
}

function feedback(name: string, delta: number, accepted = delta > 0): FeedbackEntry {
  return {
    iteration: 1,
    proposal: { action: "create", skillName: name, trigger: name, description: "", rationale: "" },
    accepted, scoreBefore: 0.5, scoreAfter: 0.5 + delta, delta, timestamp: 1,
  };
}

describe("HeuristicSkillPruner", () => {
  const pruner: SkillPruner = new HeuristicSkillPruner();

  it("중복 스킬 중 평균 delta가 높은 스킬을 순서에 관계없이 유지한다", async () => {
    const weak = skill("weak", "solve math equations");
    const strong = skill("strong", "solve math equations");
    const history = [feedback("weak", 0.1), feedback("strong", 0.3)];
    for (const skills of [[weak, strong], [strong, weak]]) {
      const result = await pruner.prune(skills, history);
      expect(result.keptSkills).toEqual([strong]);
      expect(result.prunedSkills).toEqual(["weak"]);
      expect(result.rationale).toContain('duplicate of "strong"');
    }
  });

  it("누적 delta 대신 평균 delta로 중복을 비교한다", async () => {
    const skills = [skill("frequent", "math"), skill("better", "math")];
    const history = [feedback("frequent", 0.2), feedback("frequent", 0.2), feedback("better", 0.3)];
    expect((await pruner.prune(skills, history)).prunedSkills).toEqual(["frequent"]);
  });

  it("최소 3회 시도 후 평균 delta가 음수인 스킬을 제거한다", async () => {
    const skills = [skill("bad"), skill("good")];
    const result = await pruner.prune(skills, [feedback("bad", 0.1), feedback("bad", -0.2), feedback("bad", -0.2)]);
    expect(result.keptSkills).toEqual([skills[1]]);
    expect(result.prunedSkills).toEqual(["bad"]);
    expect(result.rationale).toContain("3 attempts");
  });

  it("평균 delta가 양수여도 채택 성공률이 0이면 제거한다", async () => {
    const result = await pruner.prune([skill("bad")], Array.from({ length: 3 }, () => feedback("bad", 0.1, false)));
    expect(result.prunedSkills).toEqual(["bad"]);
    expect(result.keptSkills).toEqual([]);
    expect(result.rationale).toContain("success rate 0/3");
  });

  it("시도 부족과 비음수 평균·양수 성공률은 유지한다", async () => {
    const skills = [skill("new"), skill("neutral")];
    const history = [feedback("new", -1), feedback("new", -1), feedback("neutral", 0.2), feedback("neutral", -0.2), feedback("neutral", 0)];
    expect((await pruner.prune(skills, history)).keptSkills).toEqual(skills);
  });

  it("이력이 없거나 비어 있으면 동률 중복의 첫 스킬을 유지한다", async () => {
    const skills = [skill("first", "math"), skill("second", "math"), skill("other")];
    for (const history of [undefined, []]) {
      const result = await pruner.prune(skills, history);
      expect(result.keptSkills).toEqual([skills[0], skills[2]]);
      expect(result.prunedSkills).toEqual(["second"]);
    }
  });

  it("기본 중복 임계값 0.85 이상에만 프루닝한다", async () => {
    const skills = [skill("a", "one two three four five six"), skill("b", "one two three four five six seven")];
    expect((await pruner.prune(skills)).prunedSkills).toEqual(["b"]);
    expect((await new HeuristicSkillPruner({ similarityThreshold: 0.9 }).prune(skills)).keptSkills).toEqual(skills);
  });

  it("최소 시도 횟수와 커스텀 유사도를 설정할 수 있다", async () => {
    const custom = new HeuristicSkillPruner({ minAttempts: 1, similarityFn: () => 1 });
    const skills = [skill("bad"), skill("first"), skill("second")];
    expect((await custom.prune(skills, [feedback("bad", -0.1)])).keptSkills).toEqual([skills[1]]);
  });

  it("editTarget의 이력을 집계하고 다른 스킬의 이력은 섞지 않는다", async () => {
    const entry = feedback("proposal-name", -0.1);
    entry.proposal.action = "edit";
    entry.proposal.editTarget = "target";
    const result = await pruner.prune([skill("target"), skill("unrelated")], [entry, entry, entry]);
    expect(result.prunedSkills).toEqual(["target"]);
    expect(result.keptSkills.map((s) => s.name)).toEqual(["unrelated"]);
  });

  it("이미 제거된 중간 스킬을 통해 연쇄적으로 제거하지 않는다", async () => {
    const custom = new HeuristicSkillPruner({ similarityFn: (a, b) => Math.abs(Number(a) - Number(b)) <= 1 ? 1 : 0 });
    const skills = [skill("a", "1"), skill("b", "2"), skill("c", "3")];
    expect((await custom.prune(skills)).keptSkills).toEqual([skills[0], skills[2]]);
  });

  it("빈 스킬 목록과 빈 트리거를 처리한다", async () => {
    expect(await pruner.prune([])).toMatchObject({ keptSkills: [], prunedSkills: [], rationale: expect.any(String) });
    const skills = [skill("a", ""), skill("b", "")];
    expect((await pruner.prune(skills)).keptSkills).toEqual(skills);
  });

  it("입력 스킬과 피드백을 변경하지 않고 유지 스킬의 입력 순서를 보존한다", async () => {
    const skills = [skill("a"), skill("b")];
    const history = [feedback("a", 0.1), feedback("b", 0.4)];
    const before = structuredClone({ skills, history });
    const result = await pruner.prune(skills, history);
    expect(result.keptSkills).toEqual(skills);
    expect(result.keptSkills[0]).toBe(skills[0]);
    expect({ skills, history }).toEqual(before);
  });

  it("잘못된 설정은 거부한다", () => {
    for (const minAttempts of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => new HeuristicSkillPruner({ minAttempts })).toThrow(RangeError);
    }
    for (const similarityThreshold of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => new HeuristicSkillPruner({ similarityThreshold })).toThrow(RangeError);
    }
  });
});
