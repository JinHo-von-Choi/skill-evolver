/**
 * evolver evolve 커맨드
 *
 * 태스크를 로드하고 EvolutionLoop를 실행한다.
 */

import path                       from "node:path";
import { mkdir, writeFile }        from "node:fs/promises";
import { Command }                 from "commander";
import { EvolutionLoop }           from "@nerdvana/evolver-core";
import { LlmProposer }             from "@nerdvana/evolver-proposer";
import type { EvolutionConfig, EvolutionReport, Executor, SkillBuilder, Plugin, Program, ScoreStats } from "@nerdvana/evolver-core";
import { loadConfig, loadTasks }    from "../task-loader.js";
import { saveState }                from "../state.js";

const DEFAULT_ADAPTER_CONFIG = {
  name:        "",
  command:     "claude",
  skillsPath:  ".claude/skills",
  skillFormat: "markdown" as const,
  timeout:     60_000,
  concurrency: 3,
};

async function resolveAdapter(name: string): Promise<Executor> {
  if (name === "claude-code") {
    const mod = await import("@nerdvana/evolver-adapter-claude-code");
    return new mod.ClaudeCodeExecutor({ ...DEFAULT_ADAPTER_CONFIG, name: "claude-code", command: "claude" });
  }
  if (name === "cursor") {
    const mod = await import("@nerdvana/evolver-adapter-cursor");
    return new mod.CursorExecutor({ ...DEFAULT_ADAPTER_CONFIG, name: "cursor", command: "cursor", skillsPath: ".cursor/rules" });
  }
  if (name === "codex") {
    const mod = await import("@nerdvana/evolver-adapter-codex");
    return new mod.CodexExecutor({ ...DEFAULT_ADAPTER_CONFIG, name: "codex", command: "codex", skillsPath: "." });
  }
  throw new Error(`Unknown adapter: ${name}. Available: claude-code, cursor, codex`);
}

async function resolvePlugins(opts: { plugin?: string; mementoUrl?: string; mementoKey?: string }): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  if (opts.plugin === "memento") {
    if (!opts.mementoUrl || !opts.mementoKey) {
      throw new Error("--memento-url and --memento-key are required when using --plugin memento");
    }
    const mod = await import("@nerdvana/evolver-plugin-memento");
    const client = new mod.MementoClient({ url: opts.mementoUrl, accessKey: opts.mementoKey });
    plugins.push(new mod.MementoPlugin(client));
  }

  return plugins;
}

async function resolveSkillBuilder(model?: string): Promise<SkillBuilder> {
  const mod = await import("@nerdvana/evolver-skill-builder");
  return new mod.SkillMaterializer(model ? { model } : undefined);
}

export function makeEvolveCommand(): Command {
  return new Command("evolve")
    .description("Run the skill evolution loop")
    .requiredOption("--task-dir <path>",         "Path to tasks directory")
    .option("--skills-dir <path>",               "Path to output skills directory", "./skills")
    .option("--adapter <name>",                  "Executor adapter", "claude-code")
    .option("--proposer-model <model>",          "Model for proposer LLM", "claude-sonnet-4-6")
    .option("--builder-model <model>",           "Model for skill builder LLM", "claude-haiku-4-5")
    .option("--runs <n>",                        "Number of runs per evaluation", "3")
    .option("--budget-limit <usd>",              "Max budget in USD")
    .option("--frontier-capacity <n>",           "Pareto frontier capacity", "3")
    .option("--adaptive-frontier",               "Adjust frontier capacity from diversity metrics")
    .option("--frontier-min <n>",                "Minimum capacity when adaptive", "2")
    .option("--frontier-max <n>",                "Maximum capacity when adaptive", "7")
    .option("--selection <strategy>",            "Parent selection (round-robin | tournament)", "round-robin")
    .option("--acceptance-margin <n>",           "Minimum mean score gain over parent to accept a candidate", "0")
    .option("--executor-model <model>",          "Model used by the executor (cost estimation)")
    .option("--max-iterations <n>",              "Max evolution iterations", "10")
    .option("--failure-threshold <n>",           "Score threshold for failure", "0.5")
    .option("--plugin <name>",                   "Plugin to load (e.g. memento)")
    .option("--memento-url <url>",               "Memento MCP server URL")
    .option("--memento-key <key>",               "Memento MCP access key")
    .action(async (opts) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
        console.error("Set it with: export ANTHROPIC_API_KEY=your-key");
        process.exit(1);
      }

      const taskConfig   = loadConfig(opts.taskDir);
      const trainTasks   = loadTasks(opts.taskDir, "train",      taskConfig.scorer, taskConfig.scorer_script ? path.resolve(opts.taskDir, taskConfig.scorer_script) : undefined);
      const valTasks     = loadTasks(opts.taskDir, "validation", taskConfig.scorer, taskConfig.scorer_script ? path.resolve(opts.taskDir, taskConfig.scorer_script) : undefined);

      const holdoutTasks = loadTasks(opts.taskDir, "holdout",    taskConfig.scorer, taskConfig.scorer_script ? path.resolve(opts.taskDir, taskConfig.scorer_script) : undefined);

      if (trainTasks.length === 0) {
        console.error("Error: No training tasks found in", opts.taskDir + "/train/");
        process.exit(1);
      }

      console.log(`Loaded ${trainTasks.length} training tasks, ${valTasks.length} validation tasks, ${holdoutTasks.length} hold-out tasks`);
      if (valTasks.length > 0 && valTasks.length < 5) {
        console.warn("Warning: fewer than 5 validation tasks; candidate acceptance will be noisy.");
      }
      if (holdoutTasks.length === 0) {
        console.warn("Warning: no holdout/ tasks found; generalization of the best skills will not be measured.");
      }

      const executor     = await resolveAdapter(opts.adapter);
      const proposer     = new LlmProposer({ model: opts.proposerModel });
      const skillBuilder = await resolveSkillBuilder(opts.builderModel);
      const plugins      = await resolvePlugins(opts);

      if (opts.selection !== "round-robin" && opts.selection !== "tournament") {
        console.error(`Error: --selection must be "round-robin" or "tournament", got "${opts.selection}"`);
        process.exit(1);
      }

      const capacity  = parseInt(opts.frontierCapacity, 10);
      const frontier: EvolutionConfig["frontier"] = opts.adaptiveFrontier
        ? {
            capacity,
            selectionStrategy: opts.selection,
            adaptive:          true,
            minCapacity:       parseInt(opts.frontierMin, 10),
            maxCapacity:       parseInt(opts.frontierMax, 10),
          }
        : { capacity, selectionStrategy: opts.selection };

      const config: EvolutionConfig = {
        maxIterations:    parseInt(opts.maxIterations, 10),
        epochs:           1.5,
        failureThreshold: parseFloat(opts.failureThreshold),
        frontier,
        runs:             parseInt(opts.runs, 10),
        budgetLimit:      opts.budgetLimit ? parseFloat(opts.budgetLimit) : undefined,
        maxSkills:        20,
        acceptanceMargin: parseFloat(opts.acceptanceMargin),
        executorModel:    opts.executorModel,
      };

      const loop = new EvolutionLoop({
        executor,
        proposer,
        skillBuilder,
        trainTasks,
        validationTasks: valTasks,
        holdoutTasks,
        config,
        plugins,
      });

      console.log("Starting evolution loop...");
      const report = await loop.run();

      printReport(report);

      if (report.bestProgram.skills.length > 0) {
        await saveSkills(report.bestProgram, opts.skillsDir);
        console.log(`\nSaved ${report.bestProgram.skills.length} skill(s) to ${opts.skillsDir}/`);
      }

      saveState({
        lastRun:   new Date().toISOString(),
        report,
        skillsDir: opts.skillsDir,
      });

      console.log("\nState saved to .evolver/state.json");
    });
}

async function saveSkills(program: Program, skillsDir: string): Promise<void> {
  await mkdir(skillsDir, { recursive: true });
  for (const skill of program.skills) {
    const skillDirPath = path.join(skillsDir, skill.name);
    await mkdir(skillDirPath, { recursive: true });
    await writeFile(path.join(skillDirPath, "SKILL.md"), skill.content, "utf-8");
  }
}

export function formatStats(stats: ScoreStats | undefined, fallback: number): string {
  if (!stats) return fallback.toFixed(4);
  if (stats.samples.length < 2) return `${stats.mean.toFixed(4)} (n=1)`;
  const [lo, hi] = stats.ci95;
  return `${stats.mean.toFixed(4)} +/- ${stats.stddev.toFixed(4)} (95% CI ${lo.toFixed(4)}..${hi.toFixed(4)}, n=${stats.samples.length})`;
}

type ReportView = Pick<EvolutionReport, "bestProgram" | "iterations" | "totalCostUsd" | "frontier" | "history"> &
  Partial<Pick<EvolutionReport, "baseline" | "holdout">>;

export function printReport(report: ReportView): void {
  console.log("\n=== Evolution Report ===");
  console.log(`Iterations:  ${report.iterations}`);
  console.log(`Total cost:  $${report.totalCostUsd.toFixed(4)}`);
  if (report.baseline) {
    console.log(`Baseline:    ${formatStats(report.baseline.scoreStats, report.baseline.score)}`);
  }
  console.log(`Best score:  ${formatStats(report.bestProgram.scoreStats, report.bestProgram.score)}`);
  console.log(`Best skills: ${report.bestProgram.skills.map(s => s.name).join(", ") || "(none)"}`);

  if (report.holdout) {
    const sign = report.holdout.delta >= 0 ? "+" : "";
    console.log("\n--- Hold-out ---");
    console.log(`  baseline: ${formatStats(report.holdout.baseline, report.holdout.baseline.mean)}`);
    console.log(`  best:     ${formatStats(report.holdout.best, report.holdout.best.mean)}`);
    console.log(`  delta:    ${sign}${report.holdout.delta.toFixed(4)}`);
  }

  console.log("\n--- Frontier ---");
  for (const p of report.frontier) {
    console.log(`  ${p.id}: ${p.score.toFixed(4)}`);
  }

  console.log("\n--- History ---");
  for (const h of report.history) {
    const status = h.accepted ? "+" : "-";
    const delta  = h.delta >= 0 ? `+${h.delta.toFixed(3)}` : h.delta.toFixed(3);
    console.log(`  [${status}] ${h.proposal.skillName} (${delta})`);
  }
}
