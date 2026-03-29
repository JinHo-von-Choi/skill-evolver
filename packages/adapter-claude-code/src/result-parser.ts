import type { ExecutionResult } from "@nerdvana/evolver-core";

/**
 * Claude Code CLI의 stdout/stderr를 ExecutionResult로 변환한다.
 *
 * --print 모드 JSON 출력을 파싱하며, JSON 파싱 실패 시 raw stdout을 output으로 사용.
 */
export class ResultParser {
  static parse(
    taskId:     string,
    stdout:     string,
    stderr:     string,
    durationMs: number,
  ): ExecutionResult {
    if (stderr && !stdout.trim()) {
      return {
        taskId,
        output:     null,
        score:      0,
        error:      stderr,
        durationMs,
      };
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

    /** Claude Code JSON 응답에서 tokenUsage 추출 (존재할 경우) */
    if (typeof output === "object" && output !== null) {
      const obj = output as Record<string, unknown>;
      if (obj.usage && typeof obj.usage === "object") {
        const usage = obj.usage as Record<string, unknown>;
        if (typeof usage.input === "number" && typeof usage.output === "number") {
          result.tokenUsage = {
            input:  usage.input  as number,
            output: usage.output as number,
          };
        }
      }
      /** result 필드가 있으면 실제 output으로 승격 */
      if ("result" in obj) {
        result.output = obj.result;
      }
    }

    return result;
  }
}
