import type { Program, ParetoFrontierConfig } from "./types.js";

/**
 * 고정 용량 Pareto Frontier.
 * 라운드로빈 부모 선택, 최저 점수 퇴출 정책.
 */
export class ParetoFrontier {
  protected programs:      Program[] = [];
  private roundRobinIndex: number    = 0;
  protected _capacity:     number;

  get capacity(): number {
    return this._capacity;
  }

  constructor(
    protected readonly config: ParetoFrontierConfig,
    private readonly rng:      () => number = Math.random,
  ) {
    this._capacity = config.capacity;
  }

  /**
   * 프로그램을 frontier에 추가 시도.
   * 용량 미만이면 무조건 추가. 용량 도달 시 최저 점수보다 높아야 교체.
   */
  update(program: Program): boolean {
    if (this.programs.length < this.capacity) {
      this.programs.push(program);
      return true;
    }

    let   minIdx   = 0;
    let   minScore = this.programs[0].score;
    for (let i = 1; i < this.programs.length; i++) {
      if (this.programs[i].score < minScore) {
        minScore = this.programs[i].score;
        minIdx   = i;
      }
    }

    if (program.score <= minScore) {
      return false;
    }

    this.programs[minIdx] = program;

    if (this.roundRobinIndex >= this.programs.length) {
      this.roundRobinIndex = 0;
    }

    return true;
  }

  /**
   * 설정된 전략으로 부모 프로그램 선택.
   * round-robin: 순환. tournament: 무작위 2개 중 높은 점수.
   */
  selectParent(): Program {
    if (this.programs.length === 0) {
      throw new Error("Frontier is empty, cannot select parent");
    }

    if (this.config.selectionStrategy === "tournament" && this.programs.length > 1) {
      const a = this.programs[Math.floor(this.rng() * this.programs.length)];
      const b = this.programs[Math.floor(this.rng() * this.programs.length)];
      return a.score >= b.score ? a : b;
    }

    const selected       = this.programs[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.programs.length;
    return selected;
  }

  /**
   * 최고 점수 프로그램 반환.
   */
  best(): Program {
    if (this.programs.length === 0) {
      throw new Error("Frontier is empty");
    }

    let bestProgram = this.programs[0];
    for (let i = 1; i < this.programs.length; i++) {
      if (this.programs[i].score > bestProgram.score) {
        bestProgram = this.programs[i];
      }
    }
    return bestProgram;
  }

  /**
   * 용량 초과분을 낮은 점수부터 제거한다.
   */
  protected trim(): void {
    while (this.programs.length > this._capacity) {
      let minIdx = 0;
      for (let i = 1; i < this.programs.length; i++) {
        if (this.programs[i].score < this.programs[minIdx].score) minIdx = i;
      }
      this.programs.splice(minIdx, 1);
    }
    if (this.roundRobinIndex >= this.programs.length) {
      this.roundRobinIndex = 0;
    }
  }

  getAll(): Program[] {
    return [...this.programs];
  }

  size(): number {
    return this.programs.length;
  }
}
