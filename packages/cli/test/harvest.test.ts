import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs   from "node:fs";
import os   from "node:os";
import path from "node:path";
import { makeHarvestCommand } from "../src/commands/harvest.js";
import { loadConfig, loadTasks } from "../src/task-loader.js";

let tmpDir: string;
let outDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolver-harvest-"));
  outDir = path.join(tmpDir, "tasks");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function command() {
  return makeHarvestCommand().exitOverride().configureOutput({ writeErr: () => {} });
}

async function harvest(content: string, format?: string, filename = "session.log") {
  const log = path.join(tmpDir, filename);
  fs.writeFileSync(log, content);
  const args = ["--log", log, "--out", outDir];
  if (format) args.push("--format", format);
  await command().parseAsync(args, { from: "user" });
  const config = loadConfig(outDir);
  return {
    config,
    train: loadTasks(outDir, "train", config.scorer),
    validation: loadTasks(outDir, "validation", config.scorer),
  };
}

describe("harvest command", () => {
  it("JSONL 실패 입력과 오류를 YAML로 저장하고 성공 재시도를 연결한다", async () => {
    const records = [
      { command: "pnpm test", error: "AssertionError: expected 2", exit_code: 1 },
      { command: "unrelated", status: "SUCCESS", output: "unrelated result" },
      { command: "pnpm test", status: "SUCCESS", exit_code: 0, output: "All tests passed" },
      { prompt: "Fix compilation", status: "ERROR", message: "TS2307: missing module", resolution: "Build passed" },
      { command: "node app.js", exitCode: "2", stderr: "Cannot find module" },
      { command: "lint", error: { message: "invalid syntax", line: 4 } },
      { command: "check", "exit code": -1 },
      { command: "healthy", status: "OK", error: null, exit_code: 0 },
      { command: "healthy again", error: false, exit_code: "0" },
    ];
    const { config, train, validation } = await harvest(records.map(r => JSON.stringify(r)).join("\r\n"), "jsonl");

    expect(config).toEqual({ scorer: "fuzzy", categories: ["harvested"] });
    expect(train).toHaveLength(4);
    expect(validation).toHaveLength(1);
    const tasks = [...train, ...validation];
    expect(new Set(tasks.map(task => task.id)).size).toBe(5);
    expect(train[0].input).toContain("pnpm test");
    expect(train[0].input).toContain("AssertionError: expected 2");
    expect(train[0].input).not.toContain("All tests passed");
    expect(train[0].expected).toBe("All tests passed");
    expect(train[1]).toMatchObject({ expected: "Build passed", scorer: "fuzzy" });
    expect(train[1].input).toContain("TS2307");
    expect(train[2].input).toContain("Cannot find module");
    expect(train[2].input).toContain("Exit code: 2");
    expect(train[2].expected).toBeNull();
    expect(train[3].input).toContain("invalid syntax");
    expect(validation[0].input).toContain("Exit code: -1");
  });

  it("입력 이벤트 다음에 기록된 오류와 성공 결과를 연결한다", async () => {
    const { train } = await harvest([
      { prompt: "Compile the project" },
      { status: "ERROR", error: "Missing type" },
      { status: "RESOLVED", output: "Types compiled" },
    ].map(r => JSON.stringify(r)).join("\n"));
    expect(train[0].input).toContain("Compile the project");
    expect(train[0].expected).toBe("Types compiled");
  });

  it("명시한 expected는 후속 성공 결과로 덮어쓰지 않는다", async () => {
    const { train } = await harvest([
      { command: "check", error: "Failed", expected: "Correct answer" },
      { command: "check", exit_code: 0, output: "Different answer" },
    ].map(r => JSON.stringify(r)).join("\n"));
    expect(train[0].expected).toBe("Correct answer");
  });

  it("text 오류 블록과 스택을 수집하고 성공 종료를 제외한다", async () => {
    const { train, validation } = await harvest([
      "$ pnpm test",
      "\x1b[31mERROR assertion failed\x1b[0m",
      "    at test.ts:12:3",
      "Exit code: 1",
      "",
      "Command: pnpm build",
      "FAILED compilation",
      "  missing dependency",
      "INFO retrying",
      "Exit code: 0",
      "",
      "$ lint",
      "Exit code: 2",
      "Command: healthy",
      "Exit code: 0",
    ].join("\n"), "text");

    expect(train).toHaveLength(2);
    expect(validation).toHaveLength(1);
    expect(train[0].input).toContain("pnpm test");
    expect(train[0].input).toContain("at test.ts:12:3");
    expect(train[0].input).toContain("Exit code: 1");
    expect(train[1].input).toContain("pnpm build");
    expect(train[1].input).toContain("missing dependency");
    expect(train[1].input).not.toContain("INFO retrying");
    expect(validation[0].input).toContain("lint");
    expect(validation[0].input).not.toContain("Exit code: 0");
    expect([...train, ...validation].every(task => task.expected === null)).toBe(true);
  });

  it("빈 줄 없는 독립적인 오류도 분리한다", async () => {
    const { train, validation } = await harvest("ERROR first\n  stack one\nFAILED second\n  stack two\n");
    expect(train).toHaveLength(1);
    expect(validation).toHaveLength(1);
    expect(train[0].input).not.toContain("second");
    expect(validation[0].input).toContain("stack two");
  });

  it.each(["session.jsonl", "session.log"])("auto가 %s의 JSONL 내용과 BOM을 인식한다", async filename => {
    const { train, validation } = await harvest('\uFEFF\n{"prompt":"solve","error":"failure"}\n\n', undefined, filename);
    expect(train).toHaveLength(1);
    expect(validation).toEqual([]);
  });

  it("명시한 text 형식은 확장자보다 우선한다", async () => {
    const { train } = await harvest("ERROR failure", "text", "session.jsonl");
    expect(train).toHaveLength(1);
  });

  it.each(["", "INFO done\nExit code: 0\n", '{"status":"SUCCESS","error":null}\n'])("실패가 없으면 빈 태스크셋을 생성한다", async content => {
    const { train, validation } = await harvest(content);
    expect(train).toEqual([]);
    expect(validation).toEqual([]);
    expect(fs.statSync(path.join(outDir, "train")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(outDir, "validation")).isDirectory()).toBe(true);
  });

  it("존재하지 않는 로그 경로는 출력 생성 전에 실패한다", async () => {
    await expect(command().parseAsync(["--log", path.join(tmpDir, "missing"), "--out", outDir], { from: "user" }))
      .rejects.toThrow(/harvest 실패:.*ENOENT/);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it.each(["invalid JSON", "null", "[]"])("잘못된 JSONL 행은 행 번호와 함께 실패한다: %s", async line => {
    await expect(harvest(`{"error":"first"}\n${line}\n`, "jsonl")).rejects.toThrow(/JSONL 2행/);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("기존 출력 태스크셋을 덮어쓰지 않는다", async () => {
    await harvest("ERROR first");
    const original = fs.readFileSync(path.join(outDir, "train", "harvest-0001.yaml"), "utf-8");
    await expect(harvest("ERROR second")).rejects.toThrow("출력 디렉토리가 비어 있지 않습니다");
    expect(fs.readFileSync(path.join(outDir, "train", "harvest-0001.yaml"), "utf-8")).toBe(original);
  });

  it("필수 로그 옵션과 허용된 형식을 검사한다", async () => {
    await expect(command().parseAsync([], { from: "user" })).rejects.toThrow("required option");
    await expect(command().parseAsync(["--log", "unused", "--format", "csv"], { from: "user" }))
      .rejects.toThrow("Allowed choices");
    expect(command().opts()).toMatchObject({ out: ".evolver/harvested-tasks", format: "auto" });
  });
});
