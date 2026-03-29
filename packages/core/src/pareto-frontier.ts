import type { Program, ParetoFrontierConfig } from "./types.js";

/**
 * 고정 용량 Pareto Frontier.
 * 라운드로빈 부모 선택, 최저 점수 퇴출 정책.
 */
export class ParetoFrontier {
  private programs:        Program[] = [];
  private roundRobinIndex: number    = 0;
  private readonly capacity: number;

  constructor(private readonly config: ParetoFrontierConfig) {
    this.capacity = config.capacity;
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
   * 라운드로빈 방식으로 부모 프로그램 선택.
   */
  selectParent(): Program {
    if (this.programs.length === 0) {
      throw new Error("Frontier is empty, cannot select parent");
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

  getAll(): Program[] {
    return [...this.programs];
  }

  size(): number {
    return this.programs.length;
  }
}
