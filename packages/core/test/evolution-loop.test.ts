import { describe, it, expect, vi } from "vitest";
import { EvolutionLoop } from "../src/evolution-loop.js";
import type {
  Executor,
  Proposer,
  SkillBuilder,
  Task,
  ExecutionResult,
  SkillProposal,
  Skill,
  Program,
  Plugin,
  EvolutionConfig,
  Failure,
  FeedbackEntry,
  PluginContext,
  IterationContext,
  EvaluationResult,
} from "../src/types.js";

const trainTasks: Task[] = [
  { id: "t1", input: "2+2", expected: "4" },
  { id: "t2", input: "3+3", expected: "6" },
];

const valTasks: Task[] = [
  { id: "v1", input: "5+5", expected: "10" },
];

const trainTaskIds = new Set(trainTasks.map((t) => t.id));

function makeResult(taskId: string, score: number, withTokens = false): ExecutionResult {
  return {
    taskId,
    output:     "answer",
    score,
    durationMs: 100,
    ...(withTokens ? { tokenUsage: { input: 1000, output: 500 } } : {}),
  };
}

function makeConfig(overrides?: Partial<EvolutionConfig>): EvolutionConfig {
  return {
    maxIterations:    3,
    epochs:           1,
    failureThreshold: 0.5,
    frontier:         { capacity: 3, selectionStrategy: "round-robin" },
    runs:             1,
    maxSkills:        20,
    ...overrides,
  };
}

/**
 * tasks의 id로 train/val 구분하여 점수 할당.
 */
function makeMockExecutor(trainScore: number, valScore: number, withTokens = false): Executor {
  return {
    async run(_program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
      return tasks.map((t) => {
        const score = trainTaskIds.has(t.id) ? trainScore : valScore;
        return makeResult(t.id, score, withTokens);
      });
    },
  };
}

/**
 * 호출마다 고유한 스킬 이름 반환하여 isDuplicate 회피.
 */
function makeMockProposer(): Proposer {
  let counter = 0;
  return {
    async propose(_failures: Failure[], _history: FeedbackEntry[], _ctx?: PluginContext): Promise<SkillProposal> {
      counter++;
      return {
        action:      "create",
        skillName:   `math-skill-${counter}`,
        trigger:     "math problems",
        description: "Solves math",
        rationale:   "Failures in math",
      };
    },
  };
}

function makeMockSkillBuilder(): SkillBuilder {
  let counter = 0;
  return {
    async build(proposal: SkillProposal, _parentSkills: Skill[], _ctx?: PluginContext): Promise<Skill> {
      counter++;
      return {
        name:    proposal.skillName,
        trigger: "math problems",
        content: "# Math Skill\nSolve math problems.",
      };
    },
  };
}

describe("EvolutionLoop", () => {
  it("1 이터레이션 정상 실행", async () => {
    const executor     = makeMockExecutor(0.3, 0.8);
    const proposer     = makeMockProposer();
    const skillBuilder = makeMockSkillBuilder();

    const loop   = new EvolutionLoop({
      executor,
      proposer,
      skillBuilder,
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 1 }),
    });
    const report = await loop.run();

    expect(report.iterations).toBe(1);
    expect(report.bestProgram).toBeDefined();
    expect(report.bestProgram.score).toBeGreaterThan(0);
    expect(report.frontier.length).toBeGreaterThan(0);
    expect(report.history.length).toBeGreaterThan(0);
  });

  it("플러그인 훅 호출 확인", async () => {
    const onIterationStart = vi.fn(async (_ctx: IterationContext) => {});
    const onFailure        = vi.fn(async (_f: Failure[]) => ({ hint: "try harder" }) as PluginContext);
    const onProposal       = vi.fn(async (_p: SkillProposal) => ({}) as PluginContext);
    const onEvaluation     = vi.fn(async (_r: EvaluationResult) => {});
    const onFrontierUpdate = vi.fn(async (_f: Program[]) => {});

    const plugin: Plugin = {
      name:  "test-plugin",
      hooks: { onIterationStart, onFailure, onProposal, onEvaluation, onFrontierUpdate },
    };

    const executor     = makeMockExecutor(0.3, 0.8);
    const proposer     = makeMockProposer();
    const skillBuilder = makeMockSkillBuilder();

    const loop = new EvolutionLoop({
      executor,
      proposer,
      skillBuilder,
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 1 }),
      plugins:         [plugin],
    });
    await loop.run();

    expect(onIterationStart).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onProposal).toHaveBeenCalledTimes(1);
    expect(onEvaluation).toHaveBeenCalledTimes(1);
    expect(onFrontierUpdate).toHaveBeenCalledTimes(1);
  });

  it("예산 초과 조기 종료", async () => {
    const executor     = makeMockExecutor(0.3, 0.8, true);
    const proposer     = makeMockProposer();
    const skillBuilder = makeMockSkillBuilder();

    const loop = new EvolutionLoop({
      executor,
      proposer,
      skillBuilder,
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 10, budgetLimit: 0.001 }),
    });
    const report = await loop.run();

    expect(report.iterations).toBeLessThan(10);
    expect(report.totalCostUsd).toBeGreaterThan(0);
  });
});
