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

  it("부모와 점수가 같은 후보는 채택하지 않는다", async () => {
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 2 }),
    });
    const report = await loop.run();

    expect(report.history.length).toBeGreaterThan(0);
    expect(report.history.every((h) => !h.accepted)).toBe(true);
    expect(report.frontier.map((p) => p.id)).toEqual(["baseline"]);
  });

  it("부모보다 개선된 후보는 채택한다", async () => {
    const executor: Executor = {
      async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
        return tasks.map((t) => {
          if (trainTaskIds.has(t.id)) return makeResult(t.id, 0.3);
          return makeResult(t.id, program.skills.length > 0 ? 0.9 : 0.4);
        });
      },
    };
    const loop = new EvolutionLoop({
      executor,
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 1 }),
    });
    const report = await loop.run();

    expect(report.history[0].accepted).toBe(true);
    expect(report.bestProgram.skills).toHaveLength(1);
    expect(report.bestProgram.score).toBeCloseTo(0.9);
    expect(report.baseline.score).toBeCloseTo(0.4);
  });

  it("runs > 1이면 표준편차와 신뢰구간을 보고한다", async () => {
    let call = 0;
    const executor: Executor = {
      async run(_p: Program, tasks: Task[]): Promise<ExecutionResult[]> {
        const score = [0.6, 0.8, 1.0][call++ % 3];
        return tasks.map((t) => makeResult(t.id, score));
      },
    };
    const loop = new EvolutionLoop({
      executor,
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 0, runs: 3 }),
    });
    const report = await loop.run();
    const stats  = report.baseline.scoreStats!;

    expect(stats.samples).toHaveLength(3);
    expect(stats.mean).toBeCloseTo(0.8);
    expect(stats.stddev).toBeCloseTo(0.2);
    expect(stats.ci95[0]).toBeLessThan(stats.mean);
    expect(stats.ci95[1]).toBeGreaterThan(stats.mean);
  });

  it("모든 런의 토큰 사용량을 비용에 반영한다", async () => {
    const executor = makeMockExecutor(0.3, 0.8, true);
    const loop = new EvolutionLoop({
      executor,
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 0, runs: 3 }),
    });
    const report = await loop.run();

    /* baseline: 검증 태스크 1개 x 3런, 런당 1000 in / 500 out (sonnet 단가) */
    const perRun = (1000 * 3 + 500 * 15) / 1_000_000;
    expect(report.totalCostUsd).toBeCloseTo(perRun * 3);
  });

  it("proposer와 builder의 LLM 비용도 집계한다", async () => {
    const proposer: Proposer = {
      ...makeMockProposer(),
      drainUsage: () => [{ model: "claude-sonnet-4-6", input: 1_000_000, output: 0 }],
    };
    const builder: SkillBuilder = {
      ...makeMockSkillBuilder(),
      drainUsage: () => [{ model: "claude-haiku-4-5", input: 1_000_000, output: 0 }],
    };
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer,
      skillBuilder:    builder,
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 1 }),
    });
    const report = await loop.run();

    expect(report.totalCostUsd).toBeCloseTo(3 + 1);
  });

  it("proposer 호출 중 비용이 예산을 넘으면 빌드 전에 중단한다", async () => {
    const build = vi.fn(async () => ({ name: "x", trigger: "t", content: "c" }));
    const proposer: Proposer = {
      ...makeMockProposer(),
      drainUsage: () => [{ model: "claude-opus-4-1", input: 1_000_000, output: 0 }],
    };
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer,
      skillBuilder:    { build },
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 3, budgetLimit: 1 }),
    });
    await loop.run();

    expect(build).not.toHaveBeenCalled();
  });

  it("proposer가 실패해도 루프는 계속된다", async () => {
    const proposer: Proposer = {
      async propose() { throw new Error("bad json"); },
    };
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer,
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 2 }),
    });
    const report = await loop.run();

    expect(report.iterations).toBe(2);
    expect(report.history).toHaveLength(0);
  });

  it("edit 제안은 editTarget 스킬을 교체하고 중복을 만들지 않는다", async () => {
    const seen: Program[] = [];
    const executor: Executor = {
      async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
        seen.push(program);
        return tasks.map((t) => {
          if (trainTaskIds.has(t.id)) return makeResult(t.id, 0.3);
          return makeResult(t.id, 0.4 + 0.2 * program.generation);
        });
      },
    };
    const proposals: SkillProposal[] = [
      { action: "create", skillName: "math", trigger: "alpha beta", description: "d", rationale: "r" },
      { action: "edit",   skillName: "math-v2", trigger: "gamma delta", description: "d2", rationale: "r2", editTarget: "math" },
    ];
    let n = 0;
    const proposer: Proposer = { async propose() { return proposals[n++]; } };
    const builder: SkillBuilder = {
      async build(p) { return { name: p.skillName, trigger: p.trigger, content: `# ${p.skillName}` }; },
    };

    const loop = new EvolutionLoop({
      executor,
      proposer,
      skillBuilder:    builder,
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 2, frontier: { capacity: 5, selectionStrategy: "round-robin" } }),
    });
    await loop.run();

    const edited = seen.find((p) => p.id === "gen2-math-v2");
    expect(edited).toBeDefined();
    expect(edited!.skills.map((s) => s.name)).toEqual(["math-v2"]);
  });

  it("hold-out 셋이 있으면 베이스라인 대비 최종 성능을 보고한다", async () => {
    const holdout: Task[] = [{ id: "h1", input: "1+1", expected: "2" }];
    const executor: Executor = {
      async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
        return tasks.map((t) => {
          if (t.id === "h1")             return makeResult(t.id, program.skills.length > 0 ? 0.7 : 0.2);
          if (trainTaskIds.has(t.id))    return makeResult(t.id, 0.3);
          return makeResult(t.id, program.skills.length > 0 ? 0.9 : 0.4);
        });
      },
    };
    const loop = new EvolutionLoop({
      executor,
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      holdoutTasks:    holdout,
      config:          makeConfig({ maxIterations: 1 }),
    });
    const report = await loop.run();

    expect(report.holdout).toBeDefined();
    expect(report.holdout!.baseline.mean).toBeCloseTo(0.2);
    expect(report.holdout!.best.mean).toBeCloseTo(0.7);
    expect(report.holdout!.delta).toBeCloseTo(0.5);
  });

  it("hold-out 셋이 없으면 holdout 필드를 생략한다", async () => {
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 1 }),
    });
    expect((await loop.run()).holdout).toBeUndefined();
  });

  it("adaptive 설정이면 주기마다 frontier 용량을 조정한다", async () => {
    const seen: number[] = [];
    const onIterationStart = async (ctx: IterationContext) => { seen.push(ctx.frontier.length); };
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.9, 0.8),
      proposer:        makeMockProposer(),
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({
        maxIterations:    4,
        adaptiveInterval: 2,
        frontier: { capacity: 3, selectionStrategy: "round-robin", adaptive: true, minCapacity: 1, maxCapacity: 5 },
      }),
      plugins: [{ name: "probe", hooks: { onIterationStart } }],
    });
    const report = await loop.run();

    expect(report.iterations).toBe(4);
    expect(seen).toHaveLength(4);
  });

  it("인증 오류는 즉시 중단하고 사유를 보고한다", async () => {
    const propose = vi.fn(async () => { throw Object.assign(new Error("invalid x-api-key"), { status: 401 }); });
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer:        { propose },
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      holdoutTasks:    [{ id: "h1", input: "x", expected: "y" }],
      config:          makeConfig({ maxIterations: 10 }),
    });
    const report = await loop.run();

    expect(propose).toHaveBeenCalledTimes(1);
    expect(report.iterations).toBe(1);
    expect(report.abortReason).toMatch(/invalid x-api-key/);
    expect(report.holdout).toBeUndefined();
  });

  it("일반 오류가 연속 한도를 넘으면 중단한다", async () => {
    const propose = vi.fn(async () => { throw new Error("bad json"); });
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer:        { propose },
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 10, maxConsecutiveLlmFailures: 3 }),
    });
    const report = await loop.run();

    expect(propose).toHaveBeenCalledTimes(3);
    expect(report.abortReason).toMatch(/3 consecutive failures/);
  });

  it("성공하면 연속 실패 횟수가 초기화된다", async () => {
    let n = 0;
    const base = makeMockProposer();
    const proposer: Proposer = {
      async propose(f, h, c) {
        n++;
        if (n % 2 === 1) throw new Error("flaky");
        return base.propose(f, h, c);
      },
    };
    const loop = new EvolutionLoop({
      executor:        makeMockExecutor(0.3, 0.8),
      proposer,
      skillBuilder:    makeMockSkillBuilder(),
      trainTasks,
      validationTasks: valTasks,
      config:          makeConfig({ maxIterations: 6, maxConsecutiveLlmFailures: 2 }),
    });
    const report = await loop.run();

    expect(report.abortReason).toBeUndefined();
    expect(report.iterations).toBe(6);
  });
});

