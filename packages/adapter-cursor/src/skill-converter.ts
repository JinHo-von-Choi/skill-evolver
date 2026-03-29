/**
 * SKILL.md 형식을 Cursor의 .cursorrules + rules/*.md 형식으로 변환한다.
 */

import type { Skill } from "@nerdvana/evolver-core";

export interface CursorRulesOutput {
  cursorrules: string;
  rules:       Record<string, string>;
}

export class SkillConverter {
  /**
   * 단일 스킬을 .cursorrules 참조 + rules/ 파일로 변환한다.
   *
   * .cursorrules에는 스킬 이름, 트리거, rules/ 파일 참조를 기록하고,
   * rules/{name}.md에 실제 스킬 콘텐츠를 배치한다.
   */
  static toCursorRules(skill: Skill): CursorRulesOutput {
    const ruleFileName = `${skill.name}.md`;

    const cursorrules = [
      `# Skill: ${skill.name}`,
      ``,
      `Trigger: ${skill.trigger}`,
      ``,
      `@rules/${ruleFileName}`,
      ``,
    ].join("\n");

    const rules: Record<string, string> = {
      [ruleFileName]: skill.content,
    };

    return { cursorrules, rules };
  }

  /**
   * 여러 스킬을 하나의 .cursorrules 문자열로 병합한다.
   *
   * 각 스킬은 섹션으로 분리되며, 대응하는 rules/ 파일을 참조한다.
   */
  static mergeCursorRules(skills: Skill[]): string {
    const sections = skills.map((skill) => {
      const ruleFileName = `${skill.name}.md`;
      return [
        `## ${skill.name}`,
        ``,
        `Trigger: ${skill.trigger}`,
        ``,
        `@rules/${ruleFileName}`,
      ].join("\n");
    });

    return sections.join("\n\n") + "\n";
  }

  /**
   * 여러 스킬에서 rules/ 디렉토리에 배치할 파일 맵을 생성한다.
   */
  static buildRulesMap(skills: Skill[]): Record<string, string> {
    const rules: Record<string, string> = {};
    for (const skill of skills) {
      rules[`${skill.name}.md`] = skill.content;
    }
    return rules;
  }
}
