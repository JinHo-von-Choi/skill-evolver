import { describe, it, expect } from "vitest";
import { groupByPattern } from "../src/failure-analyzer.js";
import type { Failure } from "@evolver/core";

function makeFail(overrides: Partial<{
  taskId: string; category: string; error: string; score: number;
}> = {}): Failure {
  return {
    task: {
      id:       overrides.taskId  ?? "t1",
      input:    "test input",
      expected: "test expected",
      category: overrides.category,
    },
    result: {
      taskId:     overrides.taskId ?? "t1",
      output:     null,
      score:      overrides.score  ?? 0,
      error:      overrides.error  ?? "Error: something failed",
      durationMs: 100,
    },
  };
}

describe("groupByPattern", () => {
  it("빈 입력에 대해 빈 배열 반환", () => {
    expect(groupByPattern([])).toEqual([]);
  });

  it("동일 에러 패턴의 실패를 하나의 그룹으로 묶는다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", error: "TypeError: Cannot read property 'foo' of undefined" }),
      makeFail({ taskId: "t2", error: "TypeError: Cannot read property 'bar' of undefined" }),
    ];

    const groups = groupByPattern(failures);
    expect(groups).toHaveLength(1);
    expect(groups[0].failures).toHaveLength(2);
  });

  it("다른 에러 패턴은 별도 그룹으로 분리한다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", error: "TypeError: Cannot read property 'foo'" }),
      makeFail({ taskId: "t2", error: "SyntaxError: unexpected token" }),
    ];

    const groups = groupByPattern(failures);
    expect(groups).toHaveLength(2);
  });

  it("카테고리가 다르면 같은 에러라도 별도 그룹으로 분리한다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", category: "math",   error: "Error: wrong answer" }),
      makeFail({ taskId: "t2", category: "coding", error: "Error: wrong answer" }),
    ];

    const groups = groupByPattern(failures);
    expect(groups).toHaveLength(2);
  });

  it("숫자/경로가 다른 에러를 동일 패턴으로 정규화한다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", error: "Error at line 42 in /src/foo.ts" }),
      makeFail({ taskId: "t2", error: "Error at line 99 in /src/bar.ts" }),
    ];

    const groups = groupByPattern(failures);
    expect(groups).toHaveLength(1);
  });

  it("summary에 실패 수와 평균 점수가 포함된다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", score: 0.2 }),
      makeFail({ taskId: "t2", score: 0.4 }),
    ];

    const groups  = groupByPattern(failures);
    const summary = groups[0].summary;
    expect(summary).toContain("2 failure(s)");
    expect(summary).toContain("avg score: 0.30");
  });

  it("에러가 없는 실패도 그룹핑한다", () => {
    const failures: Failure[] = [
      makeFail({ taskId: "t1", error: undefined as unknown as string }),
    ];
    /* error가 undefined이면 result.error가 falsy */
    failures[0].result.error = undefined;

    const groups = groupByPattern(failures);
    expect(groups).toHaveLength(1);
    expect(groups[0].pattern).toContain("(no-error)");
  });
});
