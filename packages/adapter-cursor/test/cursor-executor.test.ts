import { describe, it, expect, vi, beforeEach } from "vitest";

import type { AdapterConfig, Program, Task } from "@nerdvana/evolver-core";

/** child_process mock */
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

/** fs/promises mock */
const writtenFiles = new Map<string, string>();

vi.mock("node:fs/promises", () => ({
  mkdir:     vi.fn(async () => {}),
  writeFile: vi.fn(async (path: string, content: string) => {
    writtenFiles.set(path, content);
  }),
  rm: vi.fn(async () => {}),
}));

import { execFile } from "node:child_process";
import { CursorExecutor } from "../src/cursor-executor.js";

const mockExecFile = vi.mocked(execFile);

/* ------------------------------------------------------------------ */
/*  테스트 픽스처                                                       */
/* ------------------------------------------------------------------ */

const TEST_CONFIG: AdapterConfig = {
  name:        "cursor",
  command:     "/usr/bin/cursor",
  skillsPath:  "/tmp/skills",
  skillFormat: "markdown",
  timeout:     30_000,
  concurrency: 2,
};

const TEST_PROGRAM: Program = {
  id:         "prog-1",
  generation: 0,
  skills: [
    { name: "math-solver", trigger: "수학 문제", content: "# Math Solver\n풀이 스킬" },
    { name: "code-gen",    trigger: "코드 생성",  content: "# Code Gen\n코드 생성 스킬" },
  ],
  score:  0,
  branch: "main",
};

const TEST_TASKS: Task[] = [
  { id: "task-1", input: "1 + 1 = ?",      expected: "2" },
  { id: "task-2", input: "hello",           expected: "hello", scorer: "exact-match" },
  { id: "task-3", input: "say something",   expected: "something", scorer: "fuzzy" },
];

/* ------------------------------------------------------------------ */
/*  헬퍼: execFile mock 응답 설정                                       */
/* ------------------------------------------------------------------ */

function mockExecResponse(stdout: string, stderr = "") {
  mockExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
      setImmediate(() => callback(null, stdout, stderr));
      return {} as ReturnType<typeof execFile>;
    },
  );
}

function mockExecError(message: string, killed = false) {
  mockExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
      const err      = Object.assign(new Error(message), { killed });
      setImmediate(() => callback(err, "", message));
      return {} as ReturnType<typeof execFile>;
    },
  );
}

/* ------------------------------------------------------------------ */
/*  테스트                                                              */
/* ------------------------------------------------------------------ */

describe("CursorExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writtenFiles.clear();
  });

  it(".cursorrules와 rules/ 파일을 배치한다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    const fileNames = [...writtenFiles.keys()].map((p) => p.split("/").pop());
    expect(fileNames).toContain(".cursorrules");
    expect(fileNames).toContain("math-solver.md");
    expect(fileNames).toContain("code-gen.md");
  });

  it(".cursorrules에 스킬 참조가 포함된다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    const cursorrules = [...writtenFiles.entries()]
      .find(([k]) => k.endsWith(".cursorrules"))?.[1] ?? "";

    expect(cursorrules).toContain("math-solver");
    expect(cursorrules).toContain("code-gen");
    expect(cursorrules).toContain("@rules/");
  });

  it("각 태스크에 대해 execFile을 호출한다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    await executor.run(TEST_PROGRAM, TEST_TASKS);

    expect(mockExecFile).toHaveBeenCalledTimes(TEST_TASKS.length);
  });

  it("--cli와 --output-format json 인자를 전달한다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    const callArgs = mockExecFile.mock.calls[0];
    const args     = callArgs[1] as string[];
    expect(args).toContain("--cli");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
  });

  it("cwd를 작업 디렉토리로 설정한다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    const callArgs = mockExecFile.mock.calls[0];
    const opts     = callArgs[2] as { cwd?: string };
    expect(opts.cwd).toContain("evolver-cursor-");
  });

  it("exact-match scorer로 정확히 채점한다", async () => {
    mockExecResponse(JSON.stringify({ result: "2" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    const results  = await executor.run(TEST_PROGRAM, [
      { id: "t1", input: "1+1", expected: "2" },
    ]);

    expect(results[0].score).toBe(1);
  });

  it("fuzzy scorer로 부분 매칭을 채점한다", async () => {
    mockExecResponse(JSON.stringify({ result: "say something nice" }));

    const executor = new CursorExecutor(TEST_CONFIG);
    const results  = await executor.run(TEST_PROGRAM, [
      { id: "t1", input: "say", expected: "something", scorer: "fuzzy" },
    ]);

    expect(results[0].score).toBe(0.5);
  });

  it("타임아웃 시 에러 결과를 반환한다", async () => {
    mockExecError("TIMEOUT", true);

    const executor = new CursorExecutor(TEST_CONFIG);
    const results  = await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    expect(results[0].error).toContain("TIMEOUT");
    expect(results[0].score).toBe(0);
  });

  it("concurrency 설정에 따라 배치 실행한다", async () => {
    let concurrentCalls = 0;
    let maxConcurrent   = 0;

    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
        setImmediate(() => {
          concurrentCalls--;
          callback(null, JSON.stringify({ result: "ok" }), "");
        });
        return {} as ReturnType<typeof execFile>;
      },
    );

    const config   = { ...TEST_CONFIG, concurrency: 2 };
    const executor = new CursorExecutor(config);
    await executor.run(TEST_PROGRAM, TEST_TASKS);

    /** 3 tasks, concurrency 2 -> 첫 배치 2개, 두번째 배치 1개 */
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("tokenUsage를 JSON 응답에서 추출한다", async () => {
    mockExecResponse(JSON.stringify({
      result: "answer",
      usage:  { input: 100, output: 50 },
    }));

    const executor = new CursorExecutor(TEST_CONFIG);
    const results  = await executor.run(TEST_PROGRAM, [
      { id: "t1", input: "test", expected: "answer" },
    ]);

    expect(results[0].tokenUsage).toEqual({ input: 100, output: 50 });
  });

  it("stderr만 있고 stdout이 비면 에러 결과를 반환한다", async () => {
    mockExecResponse("", "some error occurred");

    const executor = new CursorExecutor(TEST_CONFIG);
    const results  = await executor.run(TEST_PROGRAM, [TEST_TASKS[0]]);

    expect(results[0].output).toBeNull();
    expect(results[0].error).toBe("some error occurred");
    expect(results[0].score).toBe(0);
  });
});
