/**
 * 스킬을 Claude Code 플러그인 디렉토리 규격으로 배치한다.
 *
 *   <pluginDir>/.claude-plugin/plugin.json
 *   <pluginDir>/skills/<name>/SKILL.md
 *   <pluginDir>/skills/<name>/<script paths...>
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { Skill } from "@nerdvana/evolver-core";

export const PLUGIN_NAME = "evolver-skills";

export function sanitizeSkillName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "skill";
}

/**
 * SKILL.md 앞머리에 name, description이 반드시 있도록 보정한다.
 * 앞머리가 없으면 새로 만들고, 있으면 누락된 필드만 채운다.
 */
export function ensureFrontmatter(skill: Skill, dirName: string): string {
  const description = JSON.stringify(skill.trigger || skill.name);
  const match       = skill.content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);

  if (!match) {
    return `---\nname: ${dirName}\ndescription: ${description}\n---\n\n${skill.content}`;
  }

  let block = match[1];
  if (!/^name:/m.test(block))        block = `name: ${dirName}\n${block}`;
  if (!/^description:/m.test(block)) block = `${block}\ndescription: ${description}`;

  return `---\n${block}\n---${match[2]}${skill.content.slice(match[0].length)}`;
}

function resolveInside(root: string, relative: string): string {
  const base   = resolve(root);
  const target = resolve(base, relative);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Skill script path escapes skill directory: ${relative}`);
  }
  return target;
}

export async function deployPlugin(skills: Skill[], pluginDir: string): Promise<void> {
  const manifestDir = join(pluginDir, ".claude-plugin");
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, "plugin.json"),
    JSON.stringify({ name: PLUGIN_NAME, version: "0.0.0", description: "Skills under evolution" }),
    "utf-8",
  );

  for (const skill of skills) {
    const dirName  = sanitizeSkillName(skill.name);
    const skillDir = join(pluginDir, "skills", dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), ensureFrontmatter(skill, dirName), "utf-8");

    for (const [file, content] of Object.entries(skill.scripts ?? {})) {
      const target = resolveInside(skillDir, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    }
  }
}
