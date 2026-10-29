import { describe, expect, it } from "vitest";
import { ContextGating, type DynamicGating, type Skill } from "../src/index.js";

function skill(name: string, trigger = name, content = ""): Skill {
  return { name, trigger, content };
}

describe("ContextGating", () => {
  const gating: DynamicGating = new ContextGating();

  it("태스크와 관련된 스킬만 선택한다", () => {
    const skills = [skill("math", "solve equations"), skill("translation", "translate text")];
    expect(gating.selectSkills("please solve math equations", skills)).toEqual([skills[0]]);
  });

  it("점수 내림차순으로 정렬하고 동점에서는 입력 순서를 유지한다", () => {
    const skills = [skill("partial", "math"), skill("exact", "solve math equations"), skill("tie", "equations")];
    expect(gating.selectSkills("solve math equations", skills)).toEqual([skills[1], skills[0], skills[2]]);
  });

  it("기본 최대 5개와 지정된 maxActiveSkills를 적용한다", () => {
    const skills = Array.from({ length: 7 }, (_, i) => skill(`skill-${i}`, "math"));
    expect(gating.selectSkills("math", skills)).toEqual(skills.slice(0, 5));
    expect(new ContextGating({ maxActiveSkills: 2 }).selectSkills("math", skills)).toEqual(skills.slice(0, 2));
    expect(new ContextGating({ maxActiveSkills: 0 }).selectSkills("math", skills)).toEqual([]);
  });

  it("threshold 경계를 포함하고 미달 점수를 제외한다", () => {
    const skills = [skill("half", "alpha gamma"), skill("exact", "alpha beta")];
    expect(new ContextGating({ threshold: 0.5 }).selectSkills("alpha beta", skills)).toEqual([skills[1], skills[0]]);
    expect(new ContextGating({ threshold: 0.51 }).selectSkills("alpha beta", skills)).toEqual([skills[1]]);
    expect(new ContextGating({ threshold: 1 }).selectSkills("alpha beta", skills)).toEqual([skills[1]]);
  });

  it("기본 threshold 0.1 미만은 제외한다", () => {
    const skills = [skill("verbose", `match ${Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ")}`)];
    expect(gating.selectSkills("match", skills)).toEqual([]);
    expect(new ContextGating({ threshold: 0.05 }).selectSkills("match", skills)).toEqual(skills);
  });

  it.each([
    "description: database indexing",
    'description: "database indexing"',
    "description: 'database indexing'",
    "description: >\n  database\n  indexing",
    "description: |-\n  database\n  indexing",
  ])("frontmatter description으로 선택한다: %s", (field) => {
    const skills = [skill("database", "", `---\nname: database\n${field}\n---\n# Body`)];
    expect(gating.selectSkills("database indexing", skills)).toEqual(skills);
  });

  it("CRLF frontmatter를 지원하고 본문·다른 필드는 비교하지 않는다", () => {
    const skills = [skill("match", "", "---\r\ndescription: database\r\n---\r\n"), skill("body", "", "---\nname: database\n---\ndescription: database")];
    expect(gating.selectSkills("database", skills)).toEqual([skills[0]]);
  });

  it("대소문자·문장부호를 정규화하고 한글 토큰도 비교한다", () => {
    const skills = [skill("sql", "SQL, database!"), skill("korean", "데이터베이스 쿼리 최적화")];
    expect(gating.selectSkills("sql DATABASE", skills)).toEqual([skills[0]]);
    expect(gating.selectSkills("쿼리 최적화", skills)).toEqual([skills[1]]);
  });

  it("빈 입력·모호한 입력·비매칭에는 빈 배열을 반환한다", () => {
    const skills = [skill("math"), skill("empty", "")];
    for (const input of ["", "   ", "!!!", "please help me", "unrelated"]) {
      expect(gating.selectSkills(input, skills)).toEqual([]);
    }
    expect(gating.selectSkills("math", [])).toEqual([]);
    expect(new ContextGating({ threshold: 0 }).selectSkills("unrelated", skills)).toEqual([]);
  });

  it("반복 토큰으로 점수가 부풀지 않고 입력을 변경하지 않는다", () => {
    const skills = [skill("partial", "math math"), skill("exact", "math equations")];
    const before = structuredClone(skills);
    expect(gating.selectSkills("math equations math", skills)).toEqual([skills[1], skills[0]]);
    expect(skills).toEqual(before);
  });

  it("잘못된 설정을 거부한다", () => {
    for (const maxActiveSkills of [-1, 1.5, NaN, Infinity]) {
      expect(() => new ContextGating({ maxActiveSkills })).toThrow(RangeError);
    }
    for (const threshold of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => new ContextGating({ threshold })).toThrow(RangeError);
    }
  });
});
