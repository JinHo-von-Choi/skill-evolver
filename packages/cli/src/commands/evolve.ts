/**
 * evolver evolve 커맨드
 *
 * 태스크를 로드하고 EvolutionLoop를 실행한다.
 */

import { Command }        from "commander";
import { EvolutionLoop }  from "@evolver/core";
import { LlmProposer }    from "@evolver/proposer";
import type { EvolutionConfig, Executor, SkillBuilder, Plugin } from "@evolver/core";
import { loadConfig, loadTasks }    from "../task-loader.js";
import { saveState }                from "../state.js";

async function resolveAdapter(name: string): Promise<Executor> {
  if (name === "claude-code") {
    const mod = await import("@evolver/adapter-claude-code");
    return new mod.ClaudeCodeExecutor();
  }
  if (name === "cursor") {
    const mod = await import("@evolver/adapter-cursor");
    return new mod.CursorExecutor();
  }
  if (name === "codex") {
    const mod = await import("@evolver/adapter-codex");
    return new mod.CodexExecutor();
  }
  throw new Error(`Unknown adapter: ${name}. Available: claude-code, cursor, codex`);
}

async function resolvePlugins(opts: { plugin?: string; mementoUrl?: string; mementoKey?: string }): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  if (opts.plugin === "memento") {
    if (!opts.mementoUrl || !opts.mementoKey) {
      throw new Error("--memento-url and --memento-key are required when using --plugin memento");
    }
    const mod = await import("@evolver/plugin-memento");
    const client = new mod.MementoClient({ url: opts.mementoUrl, accessKey: opts.mementoKey });
    plugins.push(new mod.MementoPlugin(client));
  }

  return plugins;
}

async function resolveSkillBuilder(model?: string): Promise<SkillBuilder> {
  const mod = await import("@evolver/skill-builder");
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
    .option("--max-iterations <n>",              "Max evolution iterations", "10")
    .option("--failure-threshold <n>",           "Score threshold for failure", "0.5")
    .option("--plugin <name>",                   "Plugin to load (e.g. memento)")
    .option("--memento-url <url>",               "Memento MCP server URL")
    .option("--memento-key <key>",               "Memento MCP access key")
    .action(async (opts) => {
      const taskConfig   = loadConfig(opts.taskDir);
      const trainTasks   = loadTasks(opts.taskDir, "train", taskConfig.scorer);
      const valTasks     = loadTasks(opts.taskDir, "validation", taskConfig.scorer);

      if (trainTasks.length === 0) {
        console.error("Error: No training tasks found in", opts.taskDir + "/train/");
        process.exit(1);
      }

      console.log(`Loaded ${trainTasks.length} training tasks, ${valTasks.length} validation tasks`);

      const executor     = await resolveAdapter(opts.adapter);
      const proposer     = new LlmProposer({ model: opts.proposerModel });
      const skillBuilder = await resolveSkillBuilder(opts.builderModel);
      const plugins      = await resolvePlugins(opts);

      const config: EvolutionConfig = {
        maxIterations:    parseInt(opts.maxIterations, 10),
        epochs:           1.5,
        failureThreshold: parseFloat(opts.failureThreshold),
        frontier: {
          capacity:          parseInt(opts.frontierCapacity, 10),
          selectionStrategy: "round-robin",
        },
        runs:             parseInt(opts.runs, 10),
        budgetLimit:      opts.budgetLimit ? parseFloat(opts.budgetLimit) : undefined,
        maxSkills:        20,
      };

      const loop = new EvolutionLoop({
        executor,
        proposer,
        skillBuilder,
        trainTasks,
        validationTasks: valTasks,
        config,
        plugins,
      });

      console.log("Starting evolution loop...");
      const report = await loop.run();

      printReport(report);

      saveState({
        lastRun:   new Date().toISOString(),
        report,
        skillsDir: opts.skillsDir,
      });

      console.log("\nState saved to .evolver/state.json");
    });
}

function printReport(report: { bestProgram: { id: string; score: number; skills: { name: string }[] }; iterations: number; totalCostUsd: number; frontier: { id: string; score: number }[]; history: { proposal: { skillName: string }; accepted: boolean; delta: number }[] }): void {
  console.log("\n=== Evolution Report ===");
  console.log(`Iterations:  ${report.iterations}`);
  console.log(`Total cost:  $${report.totalCostUsd.toFixed(4)}`);
  console.log(`Best score:  ${report.bestProgram.score.toFixed(4)}`);
  console.log(`Best skills: ${report.bestProgram.skills.map(s => s.name).join(", ") || "(none)"}`);

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
