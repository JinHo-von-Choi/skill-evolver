import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs   from "node:fs";
import os   from "node:os";
import path from "node:path";
import YAML from "yaml";
import { makeAgentCommand } from "../src/commands/agent.js";
import { makeEvolveCommand } from "../src/commands/evolve.js";

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolver-agent-"));
  originalCwd = process.cwd();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function command() {
  const cmd = makeAgentCommand().exitOverride();
  for (const subcommand of cmd.commands) subcommand.exitOverride().configureOutput({ writeErr: () => {} });
  return cmd;
}

describe("agent install", () => {
  it("지정한 디렉토리에 스킬과 실행 가능한 CLI 옵션 설정을 생성한다", async () => {
    const target = path.join(tmpDir, "custom skills", "nested");
    await command().parseAsync(["install", "--target", target], { from: "user" });
    const skillDir = path.join(target, "self-immunizer");
    expect(fs.readdirSync(skillDir).sort()).toEqual(["SKILL.md", "config.yaml"]);

    const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
    const frontmatter = YAML.parse(skill.split("---")[1]);
    expect(frontmatter.name).toBe("self-immunizer");
    expect(frontmatter.description).toBeTruthy();
    expect(skill).toContain("evolver harvest");
    expect(skill).toContain("evolver evolve");
    const config = YAML.parse(fs.readFileSync(path.join(skillDir, "config.yaml"), "utf-8"));
    expect(config.harvest.out).toBe(config.evolve.task_dir);
    expect(config.evolve.skills_dir).toBe(target);

    const evolve = makeEvolveCommand().action(() => {}).exitOverride();
    const args = Object.entries(config.evolve).flatMap(([key, value]) => [`--${key.replaceAll("_", "-")}`, String(value)]);
    await evolve.parseAsync(args, { from: "user" });
    expect(evolve.opts().taskDir).toBe(config.harvest.out);
    expect(evolve.opts().skillsDir).toBe(target);
  });

  it("기본 .skills 디렉토리에 설치한다", async () => {
    process.chdir(tmpDir);
    await command().parseAsync(["install"], { from: "user" });
    expect(fs.existsSync(path.join(tmpDir, ".skills", "self-immunizer", "SKILL.md"))).toBe(true);
  });

  it("재설치 시 사용자가 편집한 파일을 보존한다", async () => {
    const target = path.join(tmpDir, "skills");
    await command().parseAsync(["install", "--target", target], { from: "user" });
    const skillPath = path.join(target, "self-immunizer", "SKILL.md");
    const configPath = path.join(target, "self-immunizer", "config.yaml");
    fs.writeFileSync(skillPath, "custom skill");
    fs.writeFileSync(configPath, "custom: true\n");
    await command().parseAsync(["install", "--target", target], { from: "user" });
    expect(fs.readFileSync(skillPath, "utf-8")).toBe("custom skill");
    expect(YAML.parse(fs.readFileSync(configPath, "utf-8"))).toEqual({ custom: true });
  });

  it("파일 경로를 설치 대상으로 지정하면 실패한다", async () => {
    const target = path.join(tmpDir, "file");
    fs.writeFileSync(target, "keep");
    await expect(command().parseAsync(["install", "--target", target], { from: "user" }))
      .rejects.toThrow("agent install 실패");
    expect(fs.readFileSync(target, "utf-8")).toBe("keep");
  });
});
