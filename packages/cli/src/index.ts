import { Command }           from "commander";
import { makeEvolveCommand } from "./commands/evolve.js";
import { makeStatusCommand } from "./commands/status.js";
import { makeSkillsCommand } from "./commands/skills.js";
import { makeHarvestCommand } from "./commands/harvest.js";
import { makeAgentCommand } from "./commands/agent.js";

const program = new Command()
  .name("evolver")
  .description("LLM agent skill evolution framework")
  .version("0.3.0");

program.addCommand(makeEvolveCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeSkillsCommand());
program.addCommand(makeHarvestCommand());
program.addCommand(makeAgentCommand());

program.parse();
