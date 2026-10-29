import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { Skill, SkillProposal } from "@nerdvana/evolver-core";
import { HarnessCompiler } from "../src/index.js";

const PROPOSAL: SkillProposal = {
  action: "create",
  skillName: "report-writer",
  trigger: "When the user asks for a report",
  description: "Writes a report from source data",
  rationale: "Reports need output validation",
};

const SKILL: Skill = {
  name: PROPOSAL.skillName,
  trigger: PROPOSAL.trigger,
  content: "---\nname: report-writer\n---\n\n# Report Writer\n\n## Steps\n1. Read the source data\n2. Write the report\n\n## Notes\nKeep the report concise.",
};

describe("HarnessCompiler", () => {
  it.each([undefined, {}])("scripts가 %j이면 preflight와 validate를 합성한다", (scripts) => {
    const skill = { ...SKILL, scripts };
    const compiled = new HarnessCompiler().compileHarness(skill, PROPOSAL);

    expect(Object.keys(compiled.scripts!).sort()).toEqual([
      "scripts/preflight.sh",
      "scripts/validate.sh",
    ]);
    expect(compiled.name).toBe(skill.name);
    expect(compiled.trigger).toBe(skill.trigger);
    expect(skill).toEqual({ ...SKILL, scripts });

    const directory = mkdtempSync(join(tmpdir(), "evolver-harness-"));
    try {
      const output = join(directory, "report.txt");
      const missing = join(directory, "missing.txt");
      const run = (path: string, args: string[]) => spawnSync("bash", ["-s", "--", ...args], {
        input: compiled.scripts![path],
        cwd: directory,
        encoding: "utf8",
      });

      writeFileSync(output, "Report contents");
      expect(run("scripts/preflight.sh", [output]).status).toBe(0);
      expect(run("scripts/preflight.sh", [missing]).status).toBe(1);
      expect(run("scripts/validate.sh", [output]).status).toBe(0);
      expect(run("scripts/validate.sh", [missing]).status).toBe(1);
      writeFileSync(output, "");
      expect(run("scripts/validate.sh", [output]).status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("기존 validate 스크립트를 보존하고 중복 생성하지 않는다", () => {
    const scripts = {
      "scripts/validate.ts": 'console.log("validate report");',
      "scripts/render.py": 'print("render report")',
    };
    const compiled = new HarnessCompiler().compileHarness({ ...SKILL, scripts }, PROPOSAL);

    expect(compiled.scripts).toEqual({
      ...scripts,
      "scripts/preflight.sh": expect.any(String),
    });
    expect(compiled.content).toContain("`scripts/validate.ts`");
    expect(compiled.content).not.toContain("scripts/validate.sh");
    expect(Object.keys(scripts)).toHaveLength(2);
  });

  it("preflight는 첫 단계 앞에, validate는 마지막 단계 뒤에 삽입한다", () => {
    const compiler = new HarnessCompiler();
    const compiled = compiler.compileHarness(SKILL, PROPOSAL);
    const { content } = compiled;

    expect(content.startsWith("---\nname: report-writer\n---")).toBe(true);
    expect(content.indexOf("## Steps")).toBeLessThan(content.indexOf("scripts/preflight.sh"));
    expect(content.indexOf("scripts/preflight.sh")).toBeLessThan(content.indexOf("1. Read the source data"));
    expect(content.indexOf("2. Write the report")).toBeLessThan(content.indexOf("scripts/validate.sh"));
    expect(content.indexOf("scripts/validate.sh")).toBeLessThan(content.indexOf("## Notes"));
    expect(content).toContain("1. Read the source data\n2. Write the report");
    expect(content.endsWith("## Notes\nKeep the report concise.")).toBe(true);
    expect(compiler.compileHarness(compiled, PROPOSAL)).toEqual(compiled);
  });
});
