/**
 * 태스크 YAML 로더
 *
 * tasks/ 디렉토리에서 config.yaml, train/, validation/ 파일을 읽어
 * Task[] 배열로 변환한다.
 */

import fs   from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Task, ScorerType } from "@evolver/core";

export interface TaskConfig {
  scorer?:     ScorerType;
  categories?: string[];
}

/**
 * config.yaml을 파싱한다.
 */
export function loadConfig(taskDir: string): TaskConfig {
  const configPath = path.join(taskDir, "config.yaml");
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf-8");
  return YAML.parse(raw) ?? {};
}

/**
 * 지정된 서브디렉토리의 YAML 파일을 Task[] 로 로드한다.
 */
export function loadTasks(taskDir: string, subDir: string, defaultScorer?: ScorerType): Task[] {
  const dir = path.join(taskDir, subDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  const tasks: Task[] = [];

  for (const file of files) {
    const raw    = fs.readFileSync(path.join(dir, file), "utf-8");
    const parsed = YAML.parse(raw);
    if (!parsed) continue;

    const id = parsed.id ?? path.basename(file, path.extname(file));

    tasks.push({
      id,
      input:    parsed.input,
      expected: parsed.expected,
      category: parsed.category,
      scorer:   parsed.scorer ?? defaultScorer,
    });
  }

  return tasks;
}
