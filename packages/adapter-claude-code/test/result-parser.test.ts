import { describe, it, expect } from "vitest";
import { ResultParser }         from "../src/result-parser.js";

describe("ResultParser", () => {
  it("정상 JSON 출력을 파싱한다", () => {
    const stdout = JSON.stringify({ result: "hello world" });
    const result = ResultParser.parse("t1", stdout, "", 100);

    expect(result.taskId).toBe("t1");
    expect(result.output).toBe("hello world");
    expect(result.durationMs).toBe(100);
    expect(result.error).toBeUndefined();
  });

  it("tokenUsage가 포함된 JSON을 파싱한다", () => {
    const stdout = JSON.stringify({
      result: "answer",
      usage:  { input: 500, output: 200 },
    });
    const result = ResultParser.parse("t2", stdout, "", 50);

    expect(result.output).toBe("answer");
    expect(result.tokenUsage).toEqual({ input: 500, output: 200 });
  });

  it("JSON 파싱 실패 시 raw stdout을 output으로 사용한다", () => {
    const stdout = "plain text response";
    const result = ResultParser.parse("t3", stdout, "", 30);

    expect(result.output).toBe("plain text response");
    expect(result.score).toBe(0);
  });

  it("stderr만 있고 stdout이 비어있으면 에러 결과를 반환한다", () => {
    const result = ResultParser.parse("t4", "", "command not found", 10);

    expect(result.output).toBeNull();
    expect(result.error).toBe("command not found");
    expect(result.score).toBe(0);
  });

  it("stdout과 stderr 모두 있으면 stdout 파싱 + stderr 보존한다", () => {
    const stdout = JSON.stringify({ result: "ok" });
    const result = ResultParser.parse("t5", stdout, "warning: deprecated", 20);

    expect(result.output).toBe("ok");
    expect(result.error).toBe("warning: deprecated");
  });

  it("result 필드가 없는 JSON은 전체 객체를 output으로 유지한다", () => {
    const stdout = JSON.stringify({ answer: 42 });
    const result = ResultParser.parse("t6", stdout, "", 15);

    expect(result.output).toEqual({ answer: 42 });
  });
});
