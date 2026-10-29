import fs   from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import YAML from "yaml";
import type { Task } from "@nerdvana/evolver-core";

type LogRecord = Record<string, unknown>;

function display(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function exitCode(record: LogRecord): number | undefined {
  const value = record.exit_code ?? record.exitCode ?? record["exit code"];
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const code = Number(value);
  return Number.isFinite(code) ? code : undefined;
}

function makeTask(index: number, input: string, error: string, expected: unknown = null): Task {
  return {
    id:       `harvest-${String(index + 1).padStart(4, "0")}`,
    input:    `입력:\n${input || "실행 로그의 실패를 해결하시오."}\n\n실패:\n${error}`,
    expected,
    category: "harvested",
    scorer:   "fuzzy",
  };
}

function parseJsonl(content: string): Task[] {
  const tasks: Task[] = [];
  const pending = new Map<string, Task[]>();
  let lastInput = "";

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`JSONL ${index + 1}행: 올바른 JSON이 아닙니다.`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`JSONL ${index + 1}행: JSON 객체가 필요합니다.`);
    }

    const record = parsed as LogRecord;
    const explicitInput = record.prompt ?? record.command;
    const input = explicitInput == null ? lastInput : display(explicitInput);
    if (explicitInput != null) lastInput = input;
    const code = exitCode(record);
    const status = String(record.status ?? "").toUpperCase();
    const hasError = record.error != null && record.error !== false && record.error !== "";
    const failed = hasError || status === "ERROR" || status === "FAILED" || (code !== undefined && code !== 0);

    if (failed) {
      const details: string[] = [];
      if (hasError) details.push(display(record.error));
      for (const key of ["stderr", "message", "output"]) {
        if (record[key] != null && record[key] !== "") details.push(display(record[key]));
      }
      if (code !== undefined && code !== 0) details.push(`Exit code: ${code}`);
      if (!details.length) details.push(`Status: ${status}`);
      const task = makeTask(tasks.length, input, [...new Set(details)].join("\n"),
        record.expected ?? record.resolution ?? record.solution ?? null);
      tasks.push(task);
      if (task.expected === null && input) {
        pending.set(input, [...(pending.get(input) ?? []), task]);
      }
    } else if (code === 0 || ["SUCCESS", "OK", "PASSED", "RESOLVED"].includes(status)) {
      const expected = record.expected ?? record.resolution ?? record.solution ?? record.output ?? record.result ?? record.message;
      if (expected != null) {
        for (const task of pending.get(input) ?? []) task.expected = expected;
        pending.delete(input);
      }
    }
  }
  return tasks;
}

function parseText(content: string): Task[] {
  const tasks: Task[] = [];
  let input = "";
  let block: string[] = [];
  const flush = () => {
    if (block.length) tasks.push(makeTask(tasks.length, input, block.join("\n")));
    block = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\x1b\[[0-9;]*m/g, "");
    const command = line.match(/^\s*(?:[$>]\s+|(?:command|prompt)\s*:\s*)(.+)$/i);
    if (command) {
      flush();
      input = command[1];
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const exit = line.match(/\bexit[ _]code\s*[:=]?\s*(-?\d+)\b/i);
    const failed = /\b(?:ERROR|FAILED)\b/i.test(line) || (exit !== null && Number(exit[1]) !== 0);
    if (failed) {
      // 비정상 종료 코드는 앞선 스택 트레이스와 같은 실패에 속한다.
      if (!exit && block.length && !/^\s/.test(line)) flush();
      block.push(line);
      if (exit) flush();
    } else if (exit || /\b(?:INFO|WARN|SUCCESS|PASSED)\b/.test(line)) {
      flush();
    } else if (block.length) {
      block.push(line);
    }
  }
  flush();
  return tasks;
}

export function makeHarvestCommand(): Command {
  return new Command("harvest")
    .description("실행 로그 또는 트랜스크립트(JSONL)에서 실패-해결 사이클을 추출하여 진화 태스크셋 생성")
    .requiredOption("--log <path>", "로그 또는 JSONL 파일 경로")
    .option("--out <path>", "출력 태스크 디렉토리", ".evolver/harvested-tasks")
    .addOption(new Option("--format <type>", "입력 형식").choices(["auto", "jsonl", "text"]).default("auto"))
    .action((opts: { log: string; out: string; format: string }, command: Command) => {
      try {
        const content = fs.readFileSync(opts.log, "utf-8").replace(/^\uFEFF/, "");
        const format = opts.format === "auto"
          ? (path.extname(opts.log).toLowerCase() === ".jsonl" || content.trimStart().startsWith("{") ? "jsonl" : "text")
          : opts.format;
        const tasks = format === "jsonl" ? parseJsonl(content) : parseText(content);
        if (fs.existsSync(opts.out) && fs.readdirSync(opts.out).length > 0) {
          throw new Error(`출력 디렉토리가 비어 있지 않습니다: ${opts.out}`);
        }

        const validationCount = tasks.length > 1 ? Math.max(1, Math.floor(tasks.length * 0.2)) : 0;
        const trainCount = tasks.length - validationCount;
        for (const split of ["train", "validation"]) fs.mkdirSync(path.join(opts.out, split), { recursive: true });
        for (const [index, task] of tasks.entries()) {
          const split = index < trainCount ? "train" : "validation";
          fs.writeFileSync(path.join(opts.out, split, `${task.id}.yaml`), YAML.stringify(task), "utf-8");
        }
        fs.writeFileSync(path.join(opts.out, "config.yaml"), YAML.stringify({
          scorer: "fuzzy",
          categories: ["harvested"],
        }), "utf-8");
        console.log(`태스크 ${tasks.length}개 생성: train ${trainCount}, validation ${validationCount} (${opts.out})`);
        const unresolved = tasks.filter(task => task.expected === null).length;
        if (unresolved) console.log(`해결 결과가 없는 태스크 ${unresolved}개의 expected를 evolve 실행 전에 지정하세요.`);
      } catch (error) {
        command.error(`harvest 실패: ${(error as Error).message}`);
      }
    });
}
