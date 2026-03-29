/**
 * FailureAnalyzer: 실패 패턴 분류 및 그룹핑
 *
 * 유사한 에러 메시지/카테고리를 가진 실패들을 그룹으로 묶고
 * 각 그룹의 패턴을 요약 텍스트로 생성한다.
 */

import type { Failure } from "@nerdvana/evolver-core";

export interface FailureGroup {
  pattern:  string;
  failures: Failure[];
  summary:  string;
}

/**
 * 에러 메시지에서 가변적인 부분(경로, 숫자, 따옴표 내 문자열)을 제거하여
 * 비교 가능한 정규화된 키를 생성한다.
 */
function normalizeError(error: string): string {
  return error
    .replace(/\/[\w./\\-]+/g, "<path>")
    .replace(/\d+/g, "<n>")
    .replace(/"[^"]*"/g, '"<str>"')
    .replace(/'[^']*'/g, "'<str>'")
    .trim();
}

/**
 * 실패 목록을 에러 패턴 + 카테고리 기준으로 그룹핑한다.
 * O(n) 단일 패스.
 */
export function groupByPattern(failures: Failure[]): FailureGroup[] {
  if (failures.length === 0) return [];

  const buckets = new Map<string, Failure[]>();

  for (const f of failures) {
    const errorKey  = f.result.error ? normalizeError(f.result.error) : "(no-error)";
    const category  = f.task.category ?? "(uncategorized)";
    const bucketKey = `${category}::${errorKey}`;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = [];
      buckets.set(bucketKey, bucket);
    }
    bucket.push(f);
  }

  const groups: FailureGroup[] = [];
  for (const [key, bucket] of buckets) {
    groups.push({
      pattern:  key,
      failures: bucket,
      summary:  summarize(key, bucket),
    });
  }

  return groups;
}

/**
 * 그룹별 패턴 요약 텍스트를 생성한다.
 */
function summarize(pattern: string, failures: Failure[]): string {
  const [category, errorKey] = pattern.split("::", 2);
  const scores    = failures.map(f => f.result.score);
  const avgScore  = scores.reduce((a, b) => a + b, 0) / scores.length;
  const taskIds   = failures.map(f => f.task.id).slice(0, 5);
  const taskList  = taskIds.join(", ") + (failures.length > 5 ? ` (+${failures.length - 5} more)` : "");

  const lines = [
    `[${category}] ${failures.length} failure(s), avg score: ${avgScore.toFixed(2)}`,
    `  Error pattern: ${errorKey}`,
    `  Tasks: ${taskList}`,
  ];

  if (failures[0]?.result.error) {
    lines.push(`  Sample error: ${failures[0].result.error.slice(0, 200)}`);
  }

  return lines.join("\n");
}
