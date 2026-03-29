/**
 * Claude Code CLI 어댑터.
 *
 * shell injection 방지를 위해 child_process.execFile만 사용하며,
 * 모든 인자는 배열로 전달한다.
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
} from "@evolver/core";

import { ResultParser } from "./result-parser.js";

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

async function deploySkills(
  skills:    Program["skills"],
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  for (const skill of skills) {
    const filePath = join(targetDir, `${skill.name}.md`);
    await writeFile(filePath, skill.content, "utf-8");
  }
}

/* ------------------------------------------------------------------ */
/*  execFile Promise 래퍼 (shell 미사용 — injection 안전)               */
/* ------------------------------------------------------------------ */

interface ExecResult {
  stdout: string;
  stderr: string;
}

function execFileAsync(
  command:   string,
  args:      string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
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
/*  ClaudeCodeExecutor                                                 */
/* ------------------------------------------------------------------ */

export class ClaudeCodeExecutor implements Executor {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
    const workDir  = join(tmpdir(), `evolver-${randomUUID()}`);
    const skillDir = join(workDir, "skills");

    try {
      await deploySkills(program.skills, skillDir);

      const results: ExecutionResult[] = [];
      const { concurrency, timeout, command } = this.config;

      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch    = tasks.slice(i, i + concurrency);
        const promises = batch.map((task) => this.executeTask(command, task, skillDir, timeout));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      return results;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeTask(
    command:  string,
    task:     Task,
    skillDir: string,
    timeout:  number,
  ): Promise<ExecutionResult> {
    const prompt = typeof task.input === "string"
      ? task.input
      : JSON.stringify(task.input);

    const args = [
      "--print",
      "--output-format", "json",
      "--skill-path", skillDir,
      prompt,
    ];

    const start = Date.now();
    const { stdout, stderr } = await execFileAsync(command, args, timeout);
    const durationMs = Date.now() - start;

    const result = ResultParser.parse(task.id, stdout, stderr, durationMs);

    const scorer   = getScorer(task.scorer);
    result.score   = scorer(result.output, task.expected);

    return result;
  }
}
