import type { DynamicGating, GatingConfig, Skill } from "./types.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with",
  "is", "are", "be", "this", "that", "it", "i", "me", "my", "you", "your",
  "can", "could", "would", "please", "help",
]);

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => !STOP_WORDS.has(token)));
}

/** 선두 YAML frontmatter의 일반 문자열·인용 문자열·블록 description을 읽는다. */
function description(content: string): string {
  const frontmatter = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
  if (!frontmatter) return "";
  const value = frontmatter.match(/^description:[ \t]*(.*)((?:\r?\n[ \t]+[^\r\n]*)*)/m);
  if (!value) return "";
  const scalar = value[1].trim();
  if (/^[>|][+-]?(?:\s+#.*)?$/.test(scalar)) return value[2].trim();
  if (scalar.startsWith('"') || scalar.startsWith("'")) {
    const quote = scalar[0];
    return scalar.slice(1, scalar.lastIndexOf(quote));
  }
  return scalar.replace(/\s+#.*$/, "") + value[2];
}

/** 태스크와 트리거·description의 토큰 Dice 점수(0~1)로 스킬을 선택한다. */
export class ContextGating implements DynamicGating {
  private readonly maxActiveSkills: number;
  private readonly threshold: number;

  constructor(config: GatingConfig = {}) {
    this.maxActiveSkills = config.maxActiveSkills ?? 5;
    this.threshold = config.threshold ?? 0.1;
    if (!Number.isInteger(this.maxActiveSkills) || this.maxActiveSkills < 0) {
      throw new RangeError("maxActiveSkills must be a non-negative integer");
    }
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold > 1) {
      throw new RangeError("threshold must be between 0 and 1");
    }
  }

  selectSkills(taskInput: string, skills: Skill[]): Skill[] {
    const input = tokenize(taskInput);
    if (input.size === 0 || this.maxActiveSkills === 0) return [];

    return skills.map((skill, index) => {
      const tokens = tokenize(`${skill.trigger} ${description(skill.content)}`);
      let overlap = 0;
      for (const token of input) {
        if (tokens.has(token)) overlap++;
      }
      const score = (2 * overlap) / (input.size + tokens.size);
      return { skill, index, score };
    })
      .filter(({ score }) => score > 0 && score >= this.threshold)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, this.maxActiveSkills)
      .map(({ skill }) => skill);
  }
}
