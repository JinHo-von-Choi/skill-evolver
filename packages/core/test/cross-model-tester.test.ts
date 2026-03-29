import { describe, it, expect } from "vitest";
import { CrossModelTester } from "../src/cross-model-tester.js";
import type {
  Executor,
  Task,
  Skill,
  Program,
  ExecutionResult,
  CrossModelTestConfig,
} from "../src/types.js";

const tasks: Task[] = [
  { id: "t1", input: "2+2", expected: "4" },
  { id: "t2", input: "3+3", expected: "6" },
];

const skills: Skill[] = [
  { name: "math-skill", trigger: "math problems", content: "# Math\nSolve math." },
];

function makeExecutor(score: number, name?: string): Executor {
  const executor: Executor & { name?: string } = {
    async run(_program: Program, runTasks: Task[]): Promise<ExecutionResult[]> {
      return runTasks.map((t) => ({
        taskId:     t.id,
        output:     "answer",
        score,
        durationMs: 50,
      }));
    },
  };
  if (name) executor.name = name;
  return executor;
}

function makeConfig(sourceScore: number, targetScores: number[]): CrossModelTestConfig {
  return {
    sourceAdapter:  makeExecutor(sourceScore, "source"),
    targetAdapters: targetScores.map((s, i) => makeExecutor(s, `target-${i}`)),
    tasks,
    skills,
  };
}

describe("CrossModelTester", () => {
  it("소스 어댑터와 타겟 어댑터 모두에서 스킬 실행", async () => {
    const tester = new CrossModelTester(makeConfig(0.8, [0.7]));
    const result = await tester.run();

    expect(result.source.score).toBe(0.8);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].score).toBe(0.7);
    expect(result.transferRate).toBeGreaterThanOrEqual(0);
  });

  it("transferRate 계산 (source: 0.8, target: 0.7 -> 0.875)", async () => {
    const tester = new CrossModelTester(makeConfig(0.8, [0.7]));
    const result = await tester.run();

    expect(result.transferRate).toBeCloseTo(0.875, 2);
  });

  it("여러 타겟 어댑터의 transferRate 평균", async () => {
    const tester = new CrossModelTester(makeConfig(0.8, [0.8, 0.4]));
    const result = await tester.run();

    expect(result.targets).toHaveLength(2);
    // (0.8/0.8 + 0.4/0.8) / 2 = (1.0 + 0.5) / 2 = 0.75
    expect(result.transferRate).toBeCloseTo(0.75, 2);
  });

  it("delta는 target score - source score", async () => {
    const tester = new CrossModelTester(makeConfig(0.8, [0.7]));
    const result = await tester.run();

    expect(result.targets[0].delta).toBeCloseTo(-0.1, 5);
  });

  it("source score 0이면 transferRate 0", async () => {
    const tester = new CrossModelTester(makeConfig(0, [0.5]));
    const result = await tester.run();

    expect(result.source.score).toBe(0);
    expect(result.transferRate).toBe(0);
  });

  it("빈 targetAdapters는 에러", () => {
    expect(() => new CrossModelTester({
      sourceAdapter:  makeExecutor(0.8),
      targetAdapters: [],
      tasks,
      skills,
    })).toThrow("targetAdapters must contain at least one adapter");
  });

  it("어댑터 name 속성 반영", async () => {
    const tester = new CrossModelTester(makeConfig(0.8, [0.7]));
    const result = await tester.run();

    expect(result.source.adapter).toBe("source");
    expect(result.targets[0].adapter).toBe("target-0");
  });
});
