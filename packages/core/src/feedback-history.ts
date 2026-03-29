import type { FeedbackEntry, SkillProposal } from "./types.js";

/**
 * 누적 제안/결과/점수 이력 관리.
 * 중복 제안 방지 기능 포함.
 */
export class FeedbackHistory {
  private entries: FeedbackEntry[] = [];

  log(entry: FeedbackEntry): void {
    this.entries.push(entry);
  }

  getAll(): FeedbackEntry[] {
    return [...this.entries];
  }

  /**
   * 동일 스킬 이름 + action 조합이 이미 제안된 적 있으면 중복으로 판단.
   */
  isDuplicate(proposal: SkillProposal): boolean {
    return this.entries.some(
      (e) => e.proposal.skillName === proposal.skillName && e.proposal.action === proposal.action
    );
  }

  toJSON(): string {
    return JSON.stringify(this.entries);
  }

  static fromJSON(json: string): FeedbackHistory {
    const history = new FeedbackHistory();
    const parsed  = JSON.parse(json) as FeedbackEntry[];
    for (const entry of parsed) {
      history.entries.push(entry);
    }
    return history;
  }
}
