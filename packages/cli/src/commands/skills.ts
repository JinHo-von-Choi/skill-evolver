/**
 * evolver skills 커맨드 그룹
 *
 * - list:   skills/ 디렉토리의 스킬 목록 출력
 * - export: 스킬을 다른 에이전트 포맷으로 변환
 */

import fs   from "node:fs";
import path from "node:path";
import { Command } from "commander";

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

export function makeSkillsCommand(): Command {
  const defaultDir = "./skills";

  return new Command("skills")
    .description("Manage discovered skills")
    .addCommand(makeListCommand(defaultDir))
    .addCommand(makeExportCommand(defaultDir));
}
