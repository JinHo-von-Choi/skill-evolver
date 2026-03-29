import { describe, it, expect } from "vitest";
import { FeedbackHistory } from "../src/feedback-history.js";
import type { FeedbackEntry, SkillProposal } from "../src/types.js";

function makeProposal(name: string): SkillProposal {
  return {
    action:      "create",
    skillName:   name,
    trigger:     `trigger for ${name}`,
    description: `desc for ${name}`,
    rationale:   `rationale for ${name}`,
  };
}

function makeEntry(iteration: number, name: string, accepted: boolean): FeedbackEntry {
  return {
    iteration,
    proposal:    makeProposal(name),
    accepted,
    scoreBefore: 0.5,
    scoreAfter:  accepted ? 0.7 : 0.5,
    delta:       accepted ? 0.2 : 0,
    timestamp:   Date.now(),
  };
}

describe("FeedbackHistory", () => {
  it("log 및 getAll", () => {
    const history = new FeedbackHistory();
    const entry   = makeEntry(1, "skill-a", true);
    history.log(entry);

    expect(history.getAll()).toHaveLength(1);
    expect(history.getAll()[0].proposal.skillName).toBe("skill-a");
  });

  it("isDuplicate: 동일 스킬 이름 + action 중복 감지", () => {
    const history = new FeedbackHistory();
    history.log(makeEntry(1, "skill-a", false));

    expect(history.isDuplicate(makeProposal("skill-a"))).toBe(true);
    expect(history.isDuplicate(makeProposal("skill-b"))).toBe(false);
  });

  it("toJSON / fromJSON 라운드트립", () => {
    const history = new FeedbackHistory();
    history.log(makeEntry(1, "skill-a", true));
    history.log(makeEntry(2, "skill-b", false));

    const json     = history.toJSON();
    const restored = FeedbackHistory.fromJSON(json);

    expect(restored.getAll()).toHaveLength(2);
    expect(restored.getAll()[0].proposal.skillName).toBe("skill-a");
    expect(restored.isDuplicate(makeProposal("skill-b"))).toBe(true);
  });

  it("빈 history에서 isDuplicate는 false", () => {
    const history = new FeedbackHistory();
    expect(history.isDuplicate(makeProposal("any"))).toBe(false);
  });
});
