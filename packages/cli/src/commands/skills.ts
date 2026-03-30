/**
 * evolver skills 커맨드 그룹
 *
 * - list:   skills/ 디렉토리의 스킬 목록 출력
 * - export: 스킬을 다른 에이전트 포맷으로 변환
 */

import fs   from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { CrossModelTester } from "@nerdvana/evolver-core";
import type { Executor, Skill } from "@nerdvana/evolver-core";

const DEFAULT_TEST_ADAPTER_CONFIG = {
  name:        "",
  command:     "claude",
  skillsPath:  ".claude/skills",
  skillFormat: "markdown" as const,
  timeout:     60_000,
  concurrency: 3,
};

interface SkillInfo {
  name:    string;
  trigger: string;
}

function scanSkills(skillsDir: string): SkillInfo[] {
  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    const content = fs.readFileSync(skillMd, "utf-8");
    const trigger = extractFrontmatter(content, "description") ?? "(no trigger)";

    skills.push({ name: entry.name, trigger });
  }

  return skills;
}

function extractFrontmatter(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function convertToCursorrules(skillsDir: string, skills: SkillInfo[]): string {
  const sections: string[] = [];

  for (const skill of skills) {
    const skillMd = path.join(skillsDir, skill.name, "SKILL.md");
    const content = fs.readFileSync(skillMd, "utf-8");
    const body    = content.replace(/^---[\s\S]*?---\n?/, "").trim();

    sections.push(`## ${skill.name}\n\n${body}`);
  }

  return `# Agent Skills\n\n${sections.join("\n\n---\n\n")}`;
}

function makeListCommand(defaultDir: string): Command {
  return new Command("list")
    .description("List discovered skills")
    .option("--skills-dir <path>", "Skills directory", defaultDir)
    .action((opts) => {
      const skills = scanSkills(opts.skillsDir);
      if (skills.length === 0) {
        console.log("No skills found in", opts.skillsDir);
        return;
      }

      console.log(`Found ${skills.length} skill(s):\n`);
      for (const s of skills) {
        console.log(`  ${s.name.padEnd(30)} ${s.trigger}`);
      }
    });
}

function makeExportCommand(defaultDir: string): Command {
  return new Command("export")
    .description("Export skills to another agent format")
    .option("--skills-dir <path>",  "Skills directory", defaultDir)
    .option("--format <fmt>",       "Output format (cursor)", "cursor")
    .option("--output <path>",      "Output file path")
    .action((opts) => {
      const skills = scanSkills(opts.skillsDir);
      if (skills.length === 0) {
        console.log("No skills to export.");
        return;
      }

      let output: string;
      if (opts.format === "cursor") {
        output = convertToCursorrules(opts.skillsDir, skills);
      } else {
        console.error(`Unknown format: ${opts.format}. Available: cursor`);
        process.exit(1);
      }

      if (opts.output) {
        fs.writeFileSync(opts.output, output, "utf-8");
        console.log(`Exported ${skills.length} skill(s) to ${opts.output}`);
      } else {
        console.log(output);
      }
    });
}

async function resolveTestAdapter(name: string): Promise<Executor> {
  if (name === "claude-code") {
    const mod = await import("@nerdvana/evolver-adapter-claude-code");
    return new mod.ClaudeCodeExecutor({
      ...DEFAULT_TEST_ADAPTER_CONFIG,
      name:    "claude-code",
      command: "claude",
    });
  }
  if (name === "cursor") {
    const mod = await import("@nerdvana/evolver-adapter-cursor");
    return new mod.CursorExecutor({
      ...DEFAULT_TEST_ADAPTER_CONFIG,
      name:       "cursor",
      command:    "cursor",
      skillsPath: ".cursor/rules",
    });
  }
  if (name === "codex") {
    const mod = await import("@nerdvana/evolver-adapter-codex");
    return new mod.CodexExecutor({
      ...DEFAULT_TEST_ADAPTER_CONFIG,
      name:    "codex",
      command: "codex",
    });
  }
  throw new Error(`Unknown adapter: ${name}. Available: claude-code, cursor, codex`);
}

function loadSkillsFromDir(skillsDir: string): Skill[] {
  const infos = scanSkills(skillsDir);
  return infos.map((info) => {
    const skillMd = path.join(skillsDir, info.name, "SKILL.md");
    const content = fs.readFileSync(skillMd, "utf-8");
    return { name: info.name, trigger: info.trigger, content };
  });
}

function makeTestCommand(defaultDir: string): Command {
  return new Command("test")
    .description("Test skills across different model adapters")
    .option("--skills-dir <path>",   "Skills directory", defaultDir)
    .option("--task-dir <path>",     "Tasks directory for cross-model test")
    .option("--cross-model",         "Run cross-model transfer test")
    .option("--source <adapter>",    "Source adapter name", "claude-code")
    .option("--target <adapters>",   "Comma-separated target adapter names", "cursor,codex")
    .action(async (opts) => {
      if (!opts.crossModel) {
        console.log("Use --cross-model to run transfer tests.");
        return;
      }

      if (!opts.taskDir) {
        console.error("Error: --task-dir is required for cross-model test");
        process.exit(1);
      }

      const { loadTasks, loadConfig } = await import("../task-loader.js");
      const taskConfig    = loadConfig(opts.taskDir);
      const scorerScript  = taskConfig.scorer_script
        ? path.resolve(opts.taskDir, taskConfig.scorer_script)
        : undefined;
      const tasks         = loadTasks(opts.taskDir, "validation", taskConfig.scorer, scorerScript);

      if (tasks.length === 0) {
        console.error("Error: No validation tasks found in", opts.taskDir + "/validation/");
        process.exit(1);
      }

      const skills         = loadSkillsFromDir(opts.skillsDir);
      const sourceAdapter  = await resolveTestAdapter(opts.source);
      const targetNames    = (opts.target as string).split(",").map((s: string) => s.trim());
      const targetAdapters = await Promise.all(targetNames.map((n: string) => resolveTestAdapter(n)));

      console.log(`Cross-model test: ${opts.source} -> ${targetNames.join(", ")}`);
      console.log(`Skills: ${skills.map((s: Skill) => s.name).join(", ")}`);
      console.log(`Tasks: ${tasks.length}\n`);

      const tester = new CrossModelTester({ sourceAdapter, targetAdapters, tasks, skills });
      const result = await tester.run();

      console.log(`Source (${result.source.adapter}): ${result.source.score.toFixed(4)}`);
      for (const t of result.targets) {
        const delta = t.delta >= 0 ? `+${t.delta.toFixed(4)}` : t.delta.toFixed(4);
        console.log(`Target (${t.adapter}): ${t.score.toFixed(4)} (${delta})`);
      }
      console.log(`\nTransfer rate: ${(result.transferRate * 100).toFixed(1)}%`);
    });
}

export function makeSkillsCommand(): Command {
  const defaultDir = "./skills";

  return new Command("skills")
    .description("Manage discovered skills")
    .addCommand(makeListCommand(defaultDir))
    .addCommand(makeExportCommand(defaultDir))
    .addCommand(makeTestCommand(defaultDir));
}
