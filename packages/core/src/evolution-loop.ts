import type {
  Executor,
  Proposer,
  SkillBuilder,
  Task,
  Plugin,
  EvolutionConfig,
  EvolutionReport,
  Program,
  Failure,
  PluginContext,
  EvaluationResult,
  ExecutionResult,
  FeedbackEntry,
  Skill,
} from "./types.js";
import { ParetoFrontier }    from "./pareto-frontier.js";
import { FeedbackHistory }   from "./feedback-history.js";
import { CostTracker }       from "./cost-tracker.js";
import { ConflictDetector }  from "./conflict-detector.js";

export interface EvolutionLoopOptions {
  executor:        Executor;
  proposer:        Proposer;
  skillBuilder:    SkillBuilder;
  trainTasks:      Task[];
  validationTasks: Task[];
  config:          EvolutionConfig;
  plugins?:        Plugin[];
}

/**
 * 메인 진화 루프 오케스트레이터.
 *
 * 1. 베이스라인 측정 (스킬 없는 상태)
 * 2. 반복: 부모 선택 -> 훈련 실행 -> 실패 수집 -> 제안 -> 스킬 빌드 -> 검증 -> frontier 갱신
 * 3. 리포트 반환
 */
export class EvolutionLoop {
  private readonly executor:        Executor;
  private readonly proposer:        Proposer;
  private readonly skillBuilder:    SkillBuilder;
  private readonly trainTasks:      Task[];
  private readonly validationTasks: Task[];
  private readonly config:          EvolutionConfig;
  private readonly plugins:         Plugin[];
  private readonly frontier:          ParetoFrontier;
  private readonly history:           FeedbackHistory;
  private readonly costTracker:       CostTracker;
  private readonly conflictDetector:  ConflictDetector;

  constructor(opts: EvolutionLoopOptions) {
    this.executor        = opts.executor;
    this.proposer        = opts.proposer;
    this.skillBuilder    = opts.skillBuilder;
    this.trainTasks      = opts.trainTasks;
    this.validationTasks = opts.validationTasks;
    this.config          = opts.config;
    this.plugins         = opts.plugins ?? [];
    this.frontier          = new ParetoFrontier(opts.config.frontier);
    this.history           = new FeedbackHistory();
    this.costTracker       = new CostTracker({ budgetLimit: opts.config.budgetLimit });
    this.conflictDetector  = new ConflictDetector({
      maxSkills:           opts.config.maxSkills,
      similarityThreshold: 0.8,
    });
  }

  async run(): Promise<EvolutionReport> {
    const startTime = Date.now();

    const baseline = this.makeBaselineProgram();
    const { results: baselineResults, avgScore: baselineScore } =
      await this.runWithAveraging(baseline, this.validationTasks, this.config.runs);
    baseline.score = baselineScore;
    this.frontier.update(baseline);
    this.recordCost(0, baselineResults);

    let iterations = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations = i + 1;

      await this.callPluginHook("onIterationStart", {
        iteration: i,
        frontier:  this.frontier.getAll(),
        history:   this.history.getAll(),
        costSoFar: this.costTracker.total(),
      });

      const parent       = this.frontier.selectParent();
      const { results: trainResults } =
        await this.runWithAveraging(parent, this.trainTasks, this.config.runs);
      this.recordCost(i, trainResults);

      const failures: Failure[] = trainResults
        .filter((r) => r.score < this.config.failureThreshold)
        .map((r) => ({
          task:   this.trainTasks.find((t) => t.id === r.taskId)!,
          result: r,
        }));

      if (failures.length === 0) continue;

      let pluginCtx: PluginContext = {};
      for (const plugin of this.plugins) {
        if (plugin.hooks?.onFailure) {
          const ctx = await plugin.hooks.onFailure(failures);
          pluginCtx = { ...pluginCtx, ...ctx };
        }
      }

      const proposal = await this.proposer.propose(failures, this.history.getAll(), pluginCtx);

      if (this.history.isDuplicate(proposal)) continue;

      let proposalCtx: PluginContext = {};
      for (const plugin of this.plugins) {
        if (plugin.hooks?.onProposal) {
          const ctx = await plugin.hooks.onProposal(proposal);
          proposalCtx = { ...proposalCtx, ...ctx };
        }
      }

      const conflicts = this.conflictDetector.check(
        { name: proposal.skillName, trigger: proposal.trigger, content: "" },
        parent.skills,
      );
      if (conflicts.length > 0) {
        console.warn(`[evolver] Skipping proposal "${proposal.skillName}": ${conflicts[0].message}`);
        continue;
      }

      const skill     = await this.skillBuilder.build(proposal, parent.skills, proposalCtx);
      const candidate = this.makeCandidate(parent, skill, i + 1);

      const { results: valResults, avgScore: candidateScore } =
        await this.runWithAveraging(candidate, this.validationTasks, this.config.runs);
      this.recordCost(i, valResults);
      candidate.score = candidateScore;

      const scoreBefore = parent.score;
      const scoreAfter  = candidate.score;
      const delta       = scoreAfter - scoreBefore;
      const accepted    = this.frontier.update(candidate);

      const entry: FeedbackEntry = {
        iteration:   i,
        proposal,
        accepted,
        scoreBefore,
        scoreAfter,
        delta,
        timestamp:   Date.now(),
      };
      this.history.log(entry);

      const evalResult: EvaluationResult = {
        programId: candidate.id,
        skillName: skill.name,
        score:     candidate.score,
        delta,
        accepted,
      };

      for (const plugin of this.plugins) {
        if (plugin.hooks?.onEvaluation) {
          await plugin.hooks.onEvaluation(evalResult);
        }
      }

      for (const plugin of this.plugins) {
        if (plugin.hooks?.onFrontierUpdate) {
          await plugin.hooks.onFrontierUpdate(this.frontier.getAll());
        }
      }

      if (this.costTracker.isOverBudget()) break;
    }

    return {
      bestProgram:  this.frontier.best(),
      frontier:     this.frontier.getAll(),
      iterations,
      totalCostUsd: this.costTracker.total(),
      history:      this.history.getAll(),
      durationMs:   Date.now() - startTime,
    };
  }

  private makeBaselineProgram(): Program {
    return {
      id:         "baseline",
      generation: 0,
      skills:     [],
      score:      0,
      branch:     "main",
    };
  }

  private makeCandidate(parent: Program, skill: Skill, generation: number): Program {
    return {
      id:         `gen${generation}-${skill.name}`,
      generation,
      parentId:   parent.id,
      skills:     [...parent.skills, skill],
      score:      0,
      branch:     parent.branch,
    };
  }

  private averageScore(results: { score: number }[]): number {
    if (results.length === 0) return 0;
    let sum = 0;
    for (const r of results) sum += r.score;
    return sum / results.length;
  }

  /**
   * 프로그램을 runs 횟수만큼 반복 실행하여 평균 점수를 계산한다.
   * runs=1이면 단일 실행과 동일.
   */
  private async runWithAveraging(
    program: Program,
    tasks:   Task[],
    runs:    number,
  ): Promise<{ results: ExecutionResult[]; avgScore: number }> {
    if (runs <= 1) {
      const results = await this.executor.run(program, tasks);
      return { results, avgScore: this.averageScore(results) };
    }

    const allResults: ExecutionResult[][] = [];
    for (let r = 0; r < runs; r++) {
      allResults.push(await this.executor.run(program, tasks));
    }

    const lastResults    = allResults[allResults.length - 1];
    const mergedResults  = lastResults.map((res) => {
      const scores       = allResults.map(
        (run) => run.find((r) => r.taskId === res.taskId)?.score ?? 0,
      );
      const avgTaskScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { ...res, score: avgTaskScore };
    });

    return {
      results:  mergedResults,
      avgScore: this.averageScore(mergedResults),
    };
  }

  private recordCost(iteration: number, results: { tokenUsage?: { input: number; output: number } }[]): void {
    for (const r of results) {
      if (r.tokenUsage) {
        this.costTracker.record({
          iteration,
          tokenUsage: r.tokenUsage,
          costUsd:    this.estimateCost(r.tokenUsage),
          timestamp:  Date.now(),
        });
      }
    }
  }

  private estimateCost(usage: { input: number; output: number }): number {
    return (usage.input * 0.003 + usage.output * 0.015) / 1000;
  }

  private async callPluginHook(hook: "onIterationStart", arg: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks?.[hook];
      if (fn) await (fn as (arg: unknown) => Promise<void>)(arg);
    }
  }
}
