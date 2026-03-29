import { describe, it, expect, vi, beforeEach } from "vitest";
import { MementoPlugin } from "../src/memento-plugin.js";
import type { MementoClient } from "../src/memento-client.js";
import type { Failure, SkillProposal, EvaluationResult, Program } from "@evolver/core";

function createMockClient(): MementoClient {
  return {
    remember: vi.fn(async () => ({ id: "mock-id" })),
    recall:   vi.fn(async () => ({ fragments: [] })),
    forget:   vi.fn(async () => ({ success: true })),
  } as unknown as MementoClient;
}

describe("MementoPlugin", () => {
  let client: ReturnType<typeof createMockClient>;
  let plugin: MementoPlugin;

  beforeEach(() => {
    client = createMockClient();
    plugin = new MementoPlugin(client);
  });

  it("name = 'memento'", () => {
    expect(plugin.name).toBe("memento");
  });

  it("hooks 프로퍼티에 4개 훅 등록", () => {
    expect(plugin.hooks.onFailure).toBeTypeOf("function");
    expect(plugin.hooks.onProposal).toBeTypeOf("function");
    expect(plugin.hooks.onEvaluation).toBeTypeOf("function");
    expect(plugin.hooks.onFrontierUpdate).toBeTypeOf("function");
  });

  describe("onFailure", () => {
    it("실패 키워드로 recall(type: 'error') 호출", async () => {
      const failures: Failure[] = [
        {
          task:   { id: "t1", input: "", expected: "", category: "math" },
          result: { taskId: "t1", output: "", score: 0.2, error: "timeout", durationMs: 100 },
        },
      ];

      (client.recall as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        fragments: [{ id: "f1", content: "past error", type: "error" }],
      });

      const ctx = await plugin.hooks.onFailure(failures);

      expect(client.recall).toHaveBeenCalledWith({
        keywords: ["timeout", "math"],
        type:     "error",
      });
      expect(ctx).toEqual({
        relatedFailures: [{ id: "f1", content: "past error", type: "error" }],
      });
    });

    it("키워드 없으면 recall 스킵", async () => {
      const failures: Failure[] = [
        {
          task:   { id: "t1", input: "", expected: "" },
          result: { taskId: "t1", output: "", score: 0.2, durationMs: 100 },
        },
      ];

      const ctx = await plugin.hooks.onFailure(failures);

      expect(client.recall).not.toHaveBeenCalled();
      expect(ctx).toEqual({});
    });

    it("recall 실패 시 빈 컨텍스트 반환", async () => {
      const failures: Failure[] = [
        {
          task:   { id: "t1", input: "", expected: "", category: "code" },
          result: { taskId: "t1", output: "", score: 0.1, durationMs: 100 },
        },
      ];

      (client.recall as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

      const ctx = await plugin.hooks.onFailure(failures);
      expect(ctx).toEqual({});
    });
  });

  describe("onProposal", () => {
    it("스킬명으로 recall(topic: 'skill_evolution') 호출", async () => {
      const proposal: SkillProposal = {
        action:      "create",
        skillName:   "search-verifier",
        trigger:     "web search",
        description: "verify search results",
        rationale:   "improve accuracy",
      };

      (client.recall as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        fragments: [{ id: "s1", content: "prev search skill", type: "fact" }],
      });

      const ctx = await plugin.hooks.onProposal(proposal);

      expect(client.recall).toHaveBeenCalledWith({
        keywords: ["search-verifier"],
        topic:    "skill_evolution",
      });
      expect(ctx).toEqual({
        relatedSkills: [{ id: "s1", content: "prev search skill", type: "fact" }],
      });
    });

    it("recall 실패 시 빈 컨텍스트 반환", async () => {
      const proposal: SkillProposal = {
        action: "create", skillName: "x", trigger: "t", description: "d", rationale: "r",
      };

      (client.recall as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fail"));

      const ctx = await plugin.hooks.onProposal(proposal);
      expect(ctx).toEqual({});
    });
  });

  describe("onEvaluation", () => {
    it("양수 delta -> fact 타입으로 remember", async () => {
      const result: EvaluationResult = {
        programId: "gen1-skill",
        skillName: "search-verifier",
        score:     0.85,
        delta:     0.15,
        accepted:  true,
      };

      await plugin.hooks.onEvaluation(result);

      expect(client.remember).toHaveBeenCalledWith({
        content:    'Skill "search-verifier" eval: score 0.85, delta 0.15, accepted true',
        topic:      "skill_evolution",
        type:       "fact",
        importance: 0.3,
      });
    });

    it("음수 delta -> error 타입으로 remember", async () => {
      const result: EvaluationResult = {
        programId: "gen2-skill",
        skillName: "bad-skill",
        score:     0.3,
        delta:     -0.2,
        accepted:  false,
      };

      await plugin.hooks.onEvaluation(result);

      expect(client.remember).toHaveBeenCalledWith({
        content:    'Skill "bad-skill" eval: score 0.3, delta -0.2, accepted false',
        topic:      "skill_evolution",
        type:       "error",
        importance: 0.4,
      });
    });

    it("importance 상한 1.0 클램핑", async () => {
      const result: EvaluationResult = {
        programId: "gen3",
        skillName: "big-delta",
        score:     0.9,
        delta:     0.8,
        accepted:  true,
      };

      await plugin.hooks.onEvaluation(result);

      const call = (client.remember as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.importance).toBeLessThanOrEqual(1);
    });

    it("remember 실패해도 예외 전파 안 함", async () => {
      (client.remember as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fail"));

      const result: EvaluationResult = {
        programId: "gen1", skillName: "s", score: 0.5, delta: 0.1, accepted: true,
      };

      await expect(plugin.hooks.onEvaluation(result)).resolves.toBeUndefined();
    });
  });

  describe("onFrontierUpdate", () => {
    it("frontier 스냅샷을 remember", async () => {
      const frontier: Program[] = [
        { id: "a", generation: 1, skills: [], score: 0.8, branch: "main" },
        { id: "b", generation: 2, skills: [], score: 0.75, branch: "main" },
      ];

      await plugin.hooks.onFrontierUpdate(frontier);

      expect(client.remember).toHaveBeenCalledWith({
        content:    "Frontier: a(0.800), b(0.750)",
        topic:      "skill_evolution",
        type:       "fact",
        importance: 0.3,
      });
    });

    it("remember 실패해도 예외 전파 안 함", async () => {
      (client.remember as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

      await expect(plugin.hooks.onFrontierUpdate([])).resolves.toBeUndefined();
    });
  });
});
