import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Program, SkillProposal, Task } from "@nerdvana/evolver-core";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { LlmSurrogateVerifier } from "../src/surrogate-verifier.js";

const PROPOSAL: SkillProposal = {
  action:      "create",
  skillName:   "handle-null-access",
  trigger:     "When accessing a property of undefined fails",
  description: "Adds null guards before property access",
  rationale:   "Repeated failures reading properties of undefined values",
};

const PROGRAM: Program = {
  id:         "gen1-base",
  generation: 1,
  skills:     [
    { name: "math-helper", trigger: "math problems", content: "# Math\nSolve arithmetic." },
  ],
  score:      0.5,
  branch:     "main",
};

const TASKS: Task[] = [
  { id: "v1", input: "5+5", expected: "10" },
];

const VALID_RESULT = {
  approved:            false,
  confidence:          0.85,
  reason:              "Trigger overlaps math-helper; risk of conflicting activation",
  edgeCasesIdentified: ["empty input", "non-numeric input"],
  sideEffectRisk:      "medium",
};

function respond(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: "text", text }] });
}

describe("LlmSurrogateVerifier", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("정상적인 JSON 응답을 VerificationResult로 파싱한다", async () => {
    respond(JSON.stringify(VALID_RESULT));

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    const result   = await verifier.verify(PROPOSAL, PROGRAM, TASKS);

    expect(result.approved).toBe(false);
    expect(result.confidence).toBeCloseTo(0.85);
    expect(result.reason).toContain("math-helper");
    expect(result.edgeCasesIdentified).toEqual(["empty input", "non-numeric input"]);
    expect(result.sideEffectRisk).toBe("medium");
    expect(result.gsoViolations).toBeUndefined();
  });

  it("제안, 기존 스킬, 검증 태스크를 유저 메시지에 담는다", async () => {
    respond(JSON.stringify(VALID_RESULT));

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    await verifier.verify(PROPOSAL, PROGRAM, TASKS);

    const userContent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userContent).toContain("handle-null-access");
    expect(userContent).toContain("math-helper");
    expect(userContent).toContain("v1");
  });

  it("markdown 펜스로 감싸인 JSON도 파싱한다", async () => {
    respond("```json\n" + JSON.stringify(VALID_RESULT) + "\n```");

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    const result   = await verifier.verify(PROPOSAL, PROGRAM, TASKS);

    expect(result.approved).toBe(false);
  });

  it("잘못된 JSON 응답에 대해 에러를 던진다", async () => {
    respond("I cannot verify that");

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    await expect(
      verifier.verify(PROPOSAL, PROGRAM, TASKS),
    ).rejects.toThrow("Failed to parse LLM response");
  });

  it("필수 필드가 누락된 JSON에 대해 에러를 던진다", async () => {
    respond(JSON.stringify({ approved: true }));

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    await expect(
      verifier.verify(PROPOSAL, PROGRAM, TASKS),
    ).rejects.toThrow("missing required fields");
  });

  it("confidence가 범위 밖이면 0~1로 클램프한다", async () => {
    respond(JSON.stringify({
      ...VALID_RESULT,
      approved:       true,
      confidence:     1.7,
      sideEffectRisk: "high",
    }));

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    const result   = await verifier.verify(PROPOSAL, PROGRAM, TASKS);

    expect(result.confidence).toBe(1);
    expect(result.approved).toBe(true);
    expect(result.sideEffectRisk).toBe("high");
  });

  it("허용되지 않는 sideEffectRisk는 필드를 생략한다", async () => {
    respond(JSON.stringify({ ...VALID_RESULT, sideEffectRisk: "catastrophic" }));

    const verifier = new LlmSurrogateVerifier({ apiKey: "test-key" });
    const result   = await verifier.verify(PROPOSAL, PROGRAM, TASKS);

    expect(result.gsoViolations).toBeUndefined();
    expect(result.sideEffectRisk).toBeUndefined();
  });

  it("기본 모델은 claude-sonnet-4-6이고 설정으로 바꿀 수 있다", async () => {
    respond(JSON.stringify(VALID_RESULT));
    await new LlmSurrogateVerifier({ apiKey: "k" }).verify(PROPOSAL, PROGRAM, TASKS);
    expect(mockCreate.mock.calls[0][0].model).toBe("claude-sonnet-4-6");

    respond(JSON.stringify(VALID_RESULT));
    await new LlmSurrogateVerifier({ apiKey: "k", model: "claude-haiku-4-5" }).verify(PROPOSAL, PROGRAM, TASKS);
    expect(mockCreate.mock.calls[1][0].model).toBe("claude-haiku-4-5");
  });
});
