import { describe, it, expect } from "vitest";
import { makeEvolveCommand } from "../src/commands/evolve.js";
import { makeStatusCommand } from "../src/commands/status.js";
import { makeSkillsCommand } from "../src/commands/skills.js";

describe("evolve command", () => {
  it("필수 옵션 --task-dir이 정의되어 있다", () => {
    const cmd     = makeEvolveCommand();
    const options = cmd.options.map(o => o.long);
    expect(options).toContain("--task-dir");
    expect(options).toContain("--adapter");
    expect(options).toContain("--proposer-model");
    expect(options).toContain("--builder-model");
    expect(options).toContain("--runs");
    expect(options).toContain("--budget-limit");
    expect(options).toContain("--frontier-capacity");
    expect(options).toContain("--max-iterations");
    expect(options).toContain("--failure-threshold");
  });

  it("기본값이 올바르게 설정되어 있다", () => {
    const cmd = makeEvolveCommand();
    const optMap = new Map(cmd.options.map(o => [o.long, o.defaultValue]));
    expect(optMap.get("--adapter")).toBe("claude-code");
    expect(optMap.get("--proposer-model")).toBe("claude-sonnet-4-6");
    expect(optMap.get("--runs")).toBe("3");
    expect(optMap.get("--frontier-capacity")).toBe("3");
  });
});

describe("status command", () => {
  it("커맨드가 올바르게 생성된다", () => {
    const cmd = makeStatusCommand();
    expect(cmd.name()).toBe("status");
  });
});

describe("skills command", () => {
  it("서브커맨드 list와 export가 존재한다", () => {
    const cmd      = makeSkillsCommand();
    const subNames = cmd.commands.map(c => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("export");
  });
});
