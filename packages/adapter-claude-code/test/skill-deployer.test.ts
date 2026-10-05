import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

const written = new Map<string, string>();

vi.mock("node:fs/promises", () => ({
  mkdir:     vi.fn(async () => {}),
  writeFile: vi.fn(async (path: string, content: string) => { written.set(path, content); }),
}));

import { deployPlugin, ensureFrontmatter, sanitizeSkillName } from "../src/skill-deployer.js";

const skill = (over: Partial<{ name: string; trigger: string; content: string; scripts: Record<string, string> }> = {}) => ({
  name: "demo", trigger: "when demoing", content: "# Body", ...over,
});

describe("sanitizeSkillName", () => {
  it("kebab-case로 정규화하고 경로 구분자를 제거한다", () => {
    expect(sanitizeSkillName("My Skill_v2")).toBe("my-skill-v2");
    expect(sanitizeSkillName("../evil/name")).toBe("evil-name");
    expect(sanitizeSkillName("///")).toBe("skill");
  });
});

describe("ensureFrontmatter", () => {
  it("앞머리가 없으면 name과 description을 만든다", () => {
    const out = ensureFrontmatter(skill(), "demo");
    expect(out.startsWith("---\nname: demo\ndescription: \"when demoing\"\n---\n")).toBe(true);
    expect(out.endsWith("# Body")).toBe(true);
  });

  it("앞머리에 빠진 필드만 채운다", () => {
    const out = ensureFrontmatter(skill({ content: "---\ntrigger: x\n---\n# Body" }), "demo");
    expect(out).toContain("name: demo");
    expect(out).toContain("description: \"when demoing\"");
    expect(out).toContain("trigger: x");
    expect(out.endsWith("# Body")).toBe(true);
  });

  it("이미 완전한 앞머리는 그대로 둔다", () => {
    const content = "---\nname: demo\ndescription: custom\n---\n# Body";
    expect(ensureFrontmatter(skill({ content }), "demo")).toBe(content);
  });
});

describe("deployPlugin", () => {
  beforeEach(() => written.clear());

  it("매니페스트, SKILL.md, 스크립트를 배치한다", async () => {
    await deployPlugin([skill({ scripts: { "scripts/check.py": "print(1)" } })], "/p");

    expect(JSON.parse(written.get(join("/p", ".claude-plugin", "plugin.json"))!).name).toBe("evolver-skills");
    expect(written.has(join("/p", "skills", "demo", "SKILL.md"))).toBe(true);
    expect(written.get(join("/p", "skills", "demo", "scripts", "check.py"))).toBe("print(1)");
  });

  it("스킬 디렉토리 밖으로 나가는 스크립트 경로를 거부한다", async () => {
    await expect(
      deployPlugin([skill({ scripts: { "../../escape.sh": "x" } })], "/p"),
    ).rejects.toThrow(/escapes/);
  });
});
