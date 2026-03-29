import type {
  CrossModelTestConfig,
  CrossModelResult,
  Executor,
  Task,
  Skill,
  Program,
  ExecutionResult,
} from "./types.js";

/**
 * 모델 A에서 진화한 스킬을 모델 B에서 검증하는 크로스 모델 전이 테스터.
 *
 * 1. sourceAdapter에서 스킬 실행 -> source score
 * 2. targetAdapters 각각에서 동일 스킬 실행 -> target scores
 * 3. transferRate = avg(target score / source score)
 */
export class CrossModelTester {
  private readonly sourceAdapter:  Executor;
  private readonly targetAdapters: Executor[];
  private readonly tasks:          Task[];
  private readonly skills:         Skill[];

  constructor(config: CrossModelTestConfig) {
    if (config.targetAdapters.length === 0) {
      throw new Error("targetAdapters must contain at least one adapter");
    }
    this.sourceAdapter  = config.sourceAdapter;
    this.targetAdapters = config.targetAdapters;
    this.tasks          = config.tasks;
    this.skills         = config.skills;
  }

  async run(): Promise<CrossModelResult> {
    const program = this.buildProgram();

    const sourceResults = await this.sourceAdapter.run(program, this.tasks);
    const sourceScore   = this.averageScore(sourceResults);

    const targets: Array<{ adapter: string; score: number; delta: number }> = [];

    for (let i = 0; i < this.targetAdapters.length; i++) {
      const adapter       = this.targetAdapters[i];
      const targetResults = await adapter.run(program, this.tasks);
      const targetScore   = this.averageScore(targetResults);
      targets.push({
        adapter: this.adapterName(adapter, i),
        score:   targetScore,
        delta:   targetScore - sourceScore,
      });
    }

    const transferRate = sourceScore === 0
      ? 0
      : targets.reduce((sum, t) => sum + t.score / sourceScore, 0) / targets.length;

    return {
      source: {
        adapter: this.adapterName(this.sourceAdapter, -1),
        score:   sourceScore,
      },
      targets,
      transferRate,
    };
  }

  private buildProgram(): Program {
    return {
      id:         "cross-model-test",
      generation: 0,
      skills:     this.skills,
      score:      0,
      branch:     "main",
    };
  }

  private averageScore(results: ExecutionResult[]): number {
    if (results.length === 0) return 0;
    let sum = 0;
    for (const r of results) sum += r.score;
    return sum / results.length;
  }

  private adapterName(adapter: Executor, index: number): string {
    return (adapter as { name?: string }).name ?? `adapter-${index}`;
  }
}
