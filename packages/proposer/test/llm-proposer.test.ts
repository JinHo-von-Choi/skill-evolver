import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Failure, FeedbackEntry, SkillProposal } from "@nerdvana/evolver-core";

const VALID_PROPOSAL: SkillProposal = {
  action:      "create",
  skillName:   "handle-type-error",
  trigger:     "When a TypeError occurs in object property access",
  description: "Adds null checks before property access",
  rationale:   "Multiple failures caused by accessing properties of undefined",
};

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { LlmProposer } from "../src/llm-proposer.js";

function makeFail(taskId: string, error: string): Failure {
  return {
    task:   { id: taskId, input: "x", expected: "y" },
    result: { taskId, output: null, score: 0, error, durationMs: 50 },
  };
}

function makeHistory(entries: Array<{ name: string; accepted: boolean; delta: number }>): FeedbackEntry[] {
  return entries.map((e, i) => ({
    iteration:   i,
    proposal:    { action: "create" as const, skillName: e.name, trigger: "t", description: "d", rationale: "r" },
    accepted:    e.accepted,
    scoreBefore: 0.5,
    scoreAfter:  0.5 + e.delta,
    delta:       e.delta,
    timestamp:   Date.now(),
  }));
}

describe("LlmProposer", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("정상적인 JSON 응답에서 SkillProposal을 파싱한다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_PROPOSAL) }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    const result   = await proposer.propose(
      [makeFail("t1", "TypeError: Cannot read property 'x'")],
      [],
    );

    expect(result).toEqual(VALID_PROPOSAL);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("히스토리가 시스템 프롬프트에 주입된다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_PROPOSAL) }],
    });

    const history = makeHistory([
      { name: "old-skill", accepted: false, delta: -0.1 },
    ]);

    const proposer = new LlmProposer({ apiKey: "test-key" });
    await proposer.propose(
      [makeFail("t1", "Error: fail")],
      history,
    );

    const callArgs    = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain("old-skill");
    expect(userContent).toContain("REJECTED");
  });

  it("플러그인 컨텍스트가 메시지에 포함된다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_PROPOSAL) }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    await proposer.propose(
      [makeFail("t1", "Error: fail")],
      [],
      { memento: { relatedSkills: ["debug-helper"] } },
    );

    const userContent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userContent).toContain("debug-helper");
  });

  it("markdown 펜스로 감싸인 JSON도 파싱한다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(VALID_PROPOSAL) + "\n```" }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    const result   = await proposer.propose([makeFail("t1", "Error")], []);
    expect(result.skillName).toBe("handle-type-error");
  });

  it("잘못된 JSON 응답에 대해 에러를 던진다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "I cannot help with that" }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    await expect(
      proposer.propose([makeFail("t1", "Error")], []),
    ).rejects.toThrow("Failed to parse LLM response");
  });

  it("필수 필드가 누락된 JSON에 대해 에러를 던진다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ action: "create", skillName: "x" }) }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    await expect(
      proposer.propose([makeFail("t1", "Error")], []),
    ).rejects.toThrow("missing required fields");
  });

  it("기본 모델은 claude-sonnet-4-6이다", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_PROPOSAL) }],
    });

    const proposer = new LlmProposer({ apiKey: "test-key" });
    await proposer.propose([makeFail("t1", "Error")], []);

    expect(mockCreate.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });
});
