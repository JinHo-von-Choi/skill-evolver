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
  SkillProposal,
  ScoreStats,
  LlmUsage,
  HoldoutReport,
} from "./types.js";
import { ParetoFrontier }    from "./pareto-frontier.js";
import { AdaptiveFrontier }  from "./adaptive-frontier.js";
import { summarize, isSignificantImprovement } from "./stats.js";
import { estimateCostUsd }   from "./pricing.js";
import { FeedbackHistory }   from "./feedback-history.js";
import { CostTracker }       from "./cost-tracker.js";
import { ConflictDetector }  from "./conflict-detector.js";

export interface EvolutionLoopOptions {
  executor:        Executor;
  proposer:        Proposer;
  skillBuilder:    SkillBuilder;
  trainTasks:      Task[];
  validationTasks: Task[];
  /** 최종 일반화 성능 측정용 hold-out 셋. 진화 중 채택 판단에는 쓰이지 않는다. */
  holdoutTasks?:   Task[];
  config:          EvolutionConfig;
  plugins?:        Plugin[];
}

interface Evaluation {
  results: ExecutionResult[];
  stats:   ScoreStats;
}

/**
 * 메인 진화 루프 오케스트레이터.
 *
 * 1. 베이스라인 측정 (스킬 없는 상태)
 * 2. 반복: 부모 선택 -> 훈련 실행 -> 실패 수집 -> 제안 -> 스킬 빌드 -> 검증 -> frontier 갱신
 *    후보는 부모 대비 통계적으로 유의하게 개선된 경우에만 채택한다.
 * 3. hold-out 셋이 있으면 베이스라인과 최고 프로그램을 최종 비교
 * 4. 리포트 반환
 */
export class EvolutionLoop {
  private readonly executor:        Executor;
  private readonly proposer:        Proposer;
  private readonly skillBuilder:    SkillBuilder;
  private readonly trainTasks:      Task[];
  private readonly validationTasks: Task[];
  private readonly holdoutTasks:    Task[];
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
    this.holdoutTasks    = opts.holdoutTasks ?? [];
    this.config          = opts.config;
    this.plugins         = opts.plugins ?? [];
    this.frontier          = this.createFrontier(opts.config);
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
    const baseEval = await this.evaluate(baseline, this.validationTasks, 0);
    baseline.score      = baseEval.stats.mean;
    baseline.scoreStats = baseEval.stats;
    this.frontier.update(baseline);

    let iterations = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations = i + 1;

      await this.callPluginHook("onIterationStart", {
        iteration: i,
        frontier:  this.frontier.getAll(),
        history:   this.history.getAll(),
        costSoFar: this.costTracker.total(),
      });

      this.maybeAdjustFrontier(i);

      const parent    = this.frontier.selectParent();
      const trainEval = await this.evaluate(parent, this.trainTasks, i);
      if (this.costTracker.isOverBudget()) break;

      const taskById = new Map(this.trainTasks.map((t) => [t.id, t]));
      const failures: Failure[] = [];
      for (const r of trainEval.results) {
        const task = taskById.get(r.taskId);
        if (task && r.score < this.config.failureThreshold) {
          failures.push({ task, result: r });
        }
      }

      if (failures.length === 0) continue;

      let pluginCtx: PluginContext = {};
      for (const plugin of this.plugins) {
        if (plugin.hooks?.onFailure) {
          const ctx = await plugin.hooks.onFailure(failures);
          pluginCtx = { ...pluginCtx, ...ctx };
        }
      }

      let proposal: SkillProposal;
      try {
        proposal = await this.proposer.propose(failures, this.history.getAll(), pluginCtx);
      } catch (err) {
        console.warn(`[evolver] Proposer failed at iteration ${i}: ${errorMessage(err)}`);
        continue;
      } finally {
        this.recordLlmUsage(i, this.proposer.drainUsage?.());
      }
      if (this.costTracker.isOverBudget()) break;

      if (this.history.isDuplicate(proposal)) continue;

      let proposalCtx: PluginContext = {};
      for (const plugin of this.plugins) {
        if (plugin.hooks?.onProposal) {
          const ctx = await plugin.hooks.onProposal(proposal);
          proposalCtx = { ...proposalCtx, ...ctx };
        }
      }

      const editTarget = proposal.action === "edit"
        ? (proposal.editTarget ?? proposal.skillName)
        : undefined;
      const conflicts = this.conflictDetector.check(
        { name: proposal.skillName, trigger: proposal.trigger, content: "" },
        parent.skills.filter((s) => s.name !== editTarget && s.name !== proposal.skillName),
      );
      if (conflicts.length > 0) {
        console.warn(`[evolver] Skipping proposal "${proposal.skillName}": ${conflicts[0].message}`);
        continue;
      }

      let skill: Skill;
      try {
        skill = await this.skillBuilder.build(proposal, parent.skills, proposalCtx);
      } catch (err) {
        console.warn(`[evolver] Skill build failed for "${proposal.skillName}": ${errorMessage(err)}`);
        continue;
      } finally {
        this.recordLlmUsage(i, this.skillBuilder.drainUsage?.());
      }
      if (this.costTracker.isOverBudget()) break;

      const candidate = this.makeCandidate(parent, skill, i + 1, proposal);

      const valEval = await this.evaluate(candidate, this.validationTasks, i);
      candidate.score      = valEval.stats.mean;
      candidate.scoreStats = valEval.stats;

      const scoreBefore = parent.score;
      const scoreAfter  = candidate.score;
      const delta       = scoreAfter - scoreBefore;
      const improved    = parent.scoreStats
        ? isSignificantImprovement(valEval.stats, parent.scoreStats, this.config.acceptanceMargin ?? 0)
        : delta > (this.config.acceptanceMargin ?? 0);
      const accepted    = improved && this.frontier.update(candidate);

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

    const best    = this.frontier.best();
    const holdout = await this.evaluateHoldout(baseline, best, iterations);

    return {
      bestProgram:  best,
      baseline,
      frontier:     this.frontier.getAll(),
      iterations,
      totalCostUsd: this.costTracker.total(),
      history:      this.history.getAll(),
      durationMs:   Date.now() - startTime,
      ...(holdout ? { holdout } : {}),
    };
  }

  private createFrontier(config: EvolutionConfig): ParetoFrontier {
    const f = config.frontier;
    if ("adaptive" in f && f.adaptive) {
      return new AdaptiveFrontier(f);
    }
    return new ParetoFrontier(f);
  }

  private maybeAdjustFrontier(iteration: number): void {
    if (!(this.frontier instanceof AdaptiveFrontier)) return;
    const interval = this.config.adaptiveInterval ?? 5;
    if (iteration === 0 || iteration % interval !== 0) return;
    this.frontier.evaluateAndAdjust(this.frontier.computeMetrics());
  }

  private async evaluateHoldout(
    baseline:   Program,
    best:       Program,
    iterations: number,
  ): Promise<HoldoutReport | undefined> {
    if (this.holdoutTasks.length === 0) return undefined;
    if (this.costTracker.isOverBudget()) {
      console.warn("[evolver] Skipping hold-out evaluation: budget exceeded");
      return undefined;
    }

    const baseEval = await this.evaluate(baseline, this.holdoutTasks, iterations);
    const bestEval = best.id === baseline.id
      ? baseEval
      : await this.evaluate(best, this.holdoutTasks, iterations);

    return {
      baseline: baseEval.stats,
      best:     bestEval.stats,
      delta:    bestEval.stats.mean - baseEval.stats.mean,
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

  /**
   * 새 스킬을 반영한 후보 프로그램을 만든다.
   * edit 제안은 editTarget 스킬을 같은 위치에서 교체하고, 이름이 같은 스킬은 중복시키지 않는다.
   */
  private makeCandidate(parent: Program, skill: Skill, generation: number, proposal: SkillProposal): Program {
    const targetName = proposal.action === "edit"
      ? (proposal.editTarget ?? proposal.skillName)
      : undefined;

    const skills:   Skill[] = [];
    let   replaced          = false;
    for (const existing of parent.skills) {
      if (existing.name === skill.name || existing.name === targetName) {
        if (!replaced) {
          skills.push(skill);
          replaced = true;
        }
        continue;
      }
      skills.push(existing);
    }
    if (!replaced) skills.push(skill);

    return {
      id:         `gen${generation}-${skill.name}`,
      generation,
      parentId:   parent.id,
      skills,
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
   * 프로그램을 runs 횟수만큼 반복 실행한다.
   * 런별 평균 점수를 표본으로 평균, 표준편차, 95% 신뢰구간을 계산하고,
   * 모든 런의 토큰 사용량을 비용에 반영한다.
   */
  private async evaluate(
    program:   Program,
    tasks:     Task[],
    iteration: number,
  ): Promise<Evaluation> {
    const runs = Math.max(1, this.config.runs);

    const allResults: ExecutionResult[][] = [];
    for (let r = 0; r < runs; r++) {
      const results = await this.executor.run(program, tasks);
      this.recordCost(iteration, results);
      allResults.push(results);
    }

    const samples = allResults.map((run) => this.averageScore(run));
    const stats   = summarize(samples);

    if (runs === 1) {
      return { results: allResults[0], stats };
    }

    const lastResults = allResults[allResults.length - 1];
    const merged      = lastResults.map((res) => {
      const scores = allResults.map(
        (run) => run.find((r) => r.taskId === res.taskId)?.score ?? 0,
      );
      return { ...res, score: scores.reduce((a, b) => a + b, 0) / scores.length };
    });

    return { results: merged, stats };
  }

  private recordCost(iteration: number, results: { tokenUsage?: { input: number; output: number } }[]): void {
    for (const r of results) {
      if (r.tokenUsage) {
        this.costTracker.record({
          iteration,
          tokenUsage: r.tokenUsage,
          costUsd:    estimateCostUsd(r.tokenUsage, this.config.executorModel, this.config.pricing),
          timestamp:  Date.now(),
        });
      }
    }
  }

  private recordLlmUsage(iteration: number, usages: LlmUsage[] | undefined): void {
    for (const u of usages ?? []) {
      this.costTracker.record({
        iteration,
        tokenUsage: { input: u.input, output: u.output },
        costUsd:    estimateCostUsd(u, u.model, this.config.pricing),
        timestamp:  Date.now(),
      });
    }
  }

  private async callPluginHook(hook: "onIterationStart", arg: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks?.[hook];
      if (fn) await (fn as (arg: unknown) => Promise<void>)(arg);
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
