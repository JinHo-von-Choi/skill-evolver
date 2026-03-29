/**
 * OpenAI Codex CLI 어댑터.
 *
 * shell injection 방지를 위해 child_process.execFile만 사용하며,
 * 모든 인자는 배열로 전달한다.
 */

import { execFile }   from "node:child_process";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
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
import { getScorer } from "@nerdvana/evolver-core";

import { SkillConverter } from "./skill-converter.js";

/* ------------------------------------------------------------------ */
/*  AGENTS.md 배치 헬퍼                                                 */
/* ------------------------------------------------------------------ */

async function deployAgentsMd(
  skills:    Program["skills"],
  targetDir: string,
): Promise<string> {
  await mkdir(targetDir, { recursive: true });
  const agentsMd = SkillConverter.mergeAgentsMd(skills);
  const filePath = join(targetDir, "AGENTS.md");
  await writeFile(filePath, agentsMd, "utf-8");
  return filePath;
}

/* ------------------------------------------------------------------ */
/*  커스텀 스코러 실행                                                   */
/* ------------------------------------------------------------------ */

async function runCustomScorer(
  scriptPath: string,
  task:       Task,
  output:     string,
): Promise<number> {
  const tmpDir     = await mkdtemp(join(tmpdir(), "evolver-scorer-"));
  const taskFile   = join(tmpDir, "task.json");
  const outputFile = join(tmpDir, "output.txt");

  try {
    await writeFile(taskFile,   JSON.stringify(task), "utf-8");
    await writeFile(outputFile, output,               "utf-8");

    return new Promise((resolve) => {
      execFile(
        "python3",
        [scriptPath, taskFile, outputFile],
        { timeout: 30_000 },
        (_err, stdout) => {
          const match = stdout.match(/score:\s*([\d.]+)/);
          resolve(match ? parseFloat(match[1]) : 0);
        },
      );
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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
/*  결과 파서                                                           */
/* ------------------------------------------------------------------ */

function parseCodexOutput(
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

  const result: ExecutionResult = {
    taskId,
    output,
    score:      0,
    durationMs,
  };

  if (stderr) {
    result.error = stderr;
  }

  /** Codex JSON 응답에서 result 필드가 있으면 승격 */
  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    if ("result" in obj) {
      result.output = obj.result;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  CodexExecutor                                                      */
/* ------------------------------------------------------------------ */

export class CodexExecutor implements Executor {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
    const workDir = join(tmpdir(), `evolver-codex-${randomUUID()}`);

    try {
      await deployAgentsMd(program.skills, workDir);

      const results: ExecutionResult[] = [];
      const { concurrency, timeout, command } = this.config;

      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch    = tasks.slice(i, i + concurrency);
        const promises = batch.map((task) => this.executeTask(command, task, workDir, timeout));
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
    workDir:  string,
    timeout:  number,
  ): Promise<ExecutionResult> {
    const prompt = typeof task.input === "string"
      ? task.input
      : JSON.stringify(task.input);

    const args = [
      "--quiet",
      "--approval-mode", "full-auto",
      prompt,
    ];

    const start = Date.now();
    const { stdout, stderr } = await execFileAsync(command, args, timeout, workDir);
    const durationMs = Date.now() - start;

    const result = parseCodexOutput(task.id, stdout, stderr, durationMs);

    const taskExt = task as unknown as Record<string, unknown>;
    if (task.scorer === "custom" && taskExt["scorerScript"]) {
      result.score = await runCustomScorer(
        String(taskExt["scorerScript"]),
        task,
        String(result.output ?? ""),
      );
    } else {
      const scorer = getScorer(task.scorer);
      result.score = scorer(result.output, task.expected);
    }

    return result;
  }
}
