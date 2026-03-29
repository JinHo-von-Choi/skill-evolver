import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import { loadConfig, loadTasks } from "../src/task-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolver-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("config.yaml이 없으면 빈 객체를 반환한다", () => {
    expect(loadConfig(tmpDir)).toEqual({});
  });

  it("config.yaml에서 scorer를 파싱한다", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.yaml"),
      "scorer: exact-match\ncategories:\n  - math\n  - coding\n",
    );
    const config = loadConfig(tmpDir);
    expect(config.scorer).toBe("exact-match");
    expect(config.categories).toEqual(["math", "coding"]);
  });
});

describe("loadTasks", () => {
  it("서브디렉토리가 없으면 빈 배열을 반환한다", () => {
    expect(loadTasks(tmpDir, "train")).toEqual([]);
  });

  it("YAML 파일에서 Task를 로드한다", () => {
    const trainDir = path.join(tmpDir, "train");
    fs.mkdirSync(trainDir);
    fs.writeFileSync(
      path.join(trainDir, "task-001.yaml"),
      "input: 'What is 2+2?'\nexpected: '4'\ncategory: math\n",
    );
    fs.writeFileSync(
      path.join(trainDir, "task-002.yaml"),
      "id: custom-id\ninput: 'Hello'\nexpected: 'Hi'\n",
    );

    const tasks = loadTasks(tmpDir, "train", "exact-match");

    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe("task-001");
    expect(tasks[0].input).toBe("What is 2+2?");
    expect(tasks[0].expected).toBe("4");
    expect(tasks[0].category).toBe("math");
    expect(tasks[0].scorer).toBe("exact-match");

    expect(tasks[1].id).toBe("custom-id");
    expect(tasks[1].scorer).toBe("exact-match");
  });

  it("태스크 자체에 scorer가 있으면 기본값을 오버라이드한다", () => {
    const trainDir = path.join(tmpDir, "train");
    fs.mkdirSync(trainDir);
    fs.writeFileSync(
      path.join(trainDir, "task-001.yaml"),
      "input: x\nexpected: y\nscorer: llm-judge\n",
    );

    const tasks = loadTasks(tmpDir, "train", "exact-match");
    expect(tasks[0].scorer).toBe("llm-judge");
  });

  it("파일을 알파벳 순으로 정렬하여 로드한다", () => {
    const trainDir = path.join(tmpDir, "train");
    fs.mkdirSync(trainDir);
    fs.writeFileSync(path.join(trainDir, "b-task.yaml"), "input: b\nexpected: b\n");
    fs.writeFileSync(path.join(trainDir, "a-task.yaml"), "input: a\nexpected: a\n");

    const tasks = loadTasks(tmpDir, "train");
    expect(tasks[0].id).toBe("a-task");
    expect(tasks[1].id).toBe("b-task");
  });
});
