/**
 * Cursor CLI 어댑터.
 *
 * shell injection 방지를 위해 child_process.execFile만 사용하며,
 * 모든 인자는 배열로 전달한다.
 *
 * 1. program.skills를 SkillConverter로 변환
 * 2. 임시 디렉토리에 .cursorrules + rules/ 배치
 * 3. cursor CLI 실행
 * 4. 결과 파싱 및 채점
 */

import { execFile }   from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join }       from "node:path";
import { tmpdir }     from "node:os";
import { randomUUID } from "node:crypto";

import type {
  AdapterConfig,
  Executor,
  ExecutionResult,
  Program,
  ScorerType,
  Task,
} from "@nerdvana/evolver-core";

import { SkillConverter } from "./skill-converter.js";

/* ------------------------------------------------------------------ */
/*  Scorer 구현                                                        */
/* ------------------------------------------------------------------ */

type ScorerFn = (output: unknown, expected: unknown) => number;

function exactMatch(output: unknown, expected: unknown): number {
  if (output === expected) return 1;
  try {
    return JSON.stringify(output) === JSON.stringify(expected) ? 1 : 0;
  } catch {
    return 0;
  }
}

function fuzzy(output: unknown, expected: unknown): number {
  const outStr = String(output).toLowerCase();
  const expStr = String(expected).toLowerCase();
  if (outStr === expStr) return 1;
  if (outStr.includes(expStr) || expStr.includes(outStr)) return 0.5;
  return 0;
}

const SCORERS: Record<string, ScorerFn> = {
  "exact-match": exactMatch,
  "fuzzy":       fuzzy,
};

function getScorer(type: ScorerType = "exact-match"): ScorerFn {
  return SCORERS[type] ?? exactMatch;
}

/* ------------------------------------------------------------------ */
/*  스킬 배치 헬퍼                                                      */
/* ------------------------------------------------------------------ */

async function deployCursorSkills(
  skills:    Program["skills"],
  workDir:   string,
): Promise<void> {
  const rulesDir = join(workDir, "rules");
  await mkdir(rulesDir, { recursive: true });

  const cursorrules = SkillConverter.mergeCursorRules(skills);
  await writeFile(join(workDir, ".cursorrules"), cursorrules, "utf-8");

  const rulesMap = SkillConverter.buildRulesMap(skills);
  for (const [fileName, content] of Object.entries(rulesMap)) {
    await writeFile(join(rulesDir, fileName), content, "utf-8");
  }
}

/* ------------------------------------------------------------------ */
/*  execFile Promise 래퍼 (shell 미사용 -- injection 안전)              */
/* ------------------------------------------------------------------ */

interface ExecResult {
  stdout: string;
  stderr: string;
}

function execFileAsync(
  command:   string,
  args:      string[],
  timeoutMs: number,
  cwd?:      string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            resolve({ stdout: stdout ?? "", stderr: `TIMEOUT: process killed after ${timeoutMs}ms` });
          } else {
            resolve({ stdout: stdout ?? "", stderr: stderr ?? error.message });
          }
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
        }
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/*  결과 파싱                                                           */
/* ------------------------------------------------------------------ */

function parseResult(
  taskId:     string,
  stdout:     string,
  stderr:     string,
  durationMs: number,
): ExecutionResult {
  if (stderr && !stdout.trim()) {
    return { taskId, output: null, score: 0, error: stderr, durationMs };
  }

  const trimmed = stdout.trim();
  let output: unknown;

  try {
    output = JSON.parse(trimmed);
  } catch {
    output = trimmed;
  }

  const result: ExecutionResult = { taskId, output, score: 0, durationMs };

  if (stderr) {
    result.error = stderr;
  }

  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    if (obj.usage && typeof obj.usage === "object") {
      const usage = obj.usage as Record<string, unknown>;
      if (typeof usage.input === "number" && typeof usage.output === "number") {
        result.tokenUsage = { input: usage.input, output: usage.output };
      }
    }
    if ("result" in obj) {
      result.output = obj.result;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  CursorExecutor                                                     */
/* ------------------------------------------------------------------ */

export class CursorExecutor implements Executor {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
    const workDir = join(tmpdir(), `evolver-cursor-${randomUUID()}`);

    try {
      await deployCursorSkills(program.skills, workDir);

      const results: ExecutionResult[] = [];
      const { concurrency, timeout, command } = this.config;

      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch        = tasks.slice(i, i + concurrency);
        const promises     = batch.map((task) => this.executeTask(command, task, workDir, timeout));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      return results;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeTask(
    command: string,
    task:    Task,
    workDir: string,
    timeout: number,
  ): Promise<ExecutionResult> {
    const prompt = typeof task.input === "string"
      ? task.input
      : JSON.stringify(task.input);

    const args = [
      "--cli",
      "--output-format", "json",
      prompt,
    ];

    const start = Date.now();
    const { stdout, stderr } = await execFileAsync(command, args, timeout, workDir);
    const durationMs = Date.now() - start;

    const result = parseResult(task.id, stdout, stderr, durationMs);

    const scorer = getScorer(task.scorer);
    result.score = scorer(result.output, task.expected);

    return result;
  }
}
