import { describe, it, expect } from "vitest";

import type { Skill } from "@nerdvana/evolver-core";

import { SkillConverter } from "../src/skill-converter.js";

describe("SkillConverter", () => {
  it("SKILL.md를 .cursorrules 형식으로 변환", () => {
    const skill: Skill = {
      name:    "search-protocol",
      trigger: "web research questions",
      content: "# Search Protocol\n\nAlways verify with 3+ sources",
    };

    const converted = SkillConverter.toCursorRules(skill);

    expect(converted.cursorrules).toContain("search-protocol");
    expect(converted.cursorrules).toContain("Trigger: web research questions");
    expect(converted.cursorrules).toContain("@rules/search-protocol.md");
    expect(converted.rules["search-protocol.md"]).toContain("Always verify");
  });

  it("여러 스킬을 하나의 .cursorrules로 병합", () => {
    const skills: Skill[] = [
      { name: "a", trigger: "t1", content: "c1" },
      { name: "b", trigger: "t2", content: "c2" },
    ];

    const merged = SkillConverter.mergeCursorRules(skills);

    expect(merged).toContain("## a");
    expect(merged).toContain("## b");
    expect(merged).toContain("Trigger: t1");
    expect(merged).toContain("Trigger: t2");
    expect(merged).toContain("@rules/a.md");
    expect(merged).toContain("@rules/b.md");
  });

  it("buildRulesMap으로 rules/ 파일 맵을 생성", () => {
    const skills: Skill[] = [
      { name: "x", trigger: "tx", content: "content-x" },
      { name: "y", trigger: "ty", content: "content-y" },
    ];

    const rulesMap = SkillConverter.buildRulesMap(skills);

    expect(rulesMap["x.md"]).toBe("content-x");
    expect(rulesMap["y.md"]).toBe("content-y");
  });

  it("빈 스킬 배열로 병합하면 빈 문자열에 가까운 결과", () => {
    const merged = SkillConverter.mergeCursorRules([]);
    expect(merged).toBe("\n");
  });
});
