import { Command }           from "commander";
import { makeEvolveCommand } from "./commands/evolve.js";
import { makeStatusCommand } from "./commands/status.js";
import { makeSkillsCommand } from "./commands/skills.js";

const program = new Command()
  .name("evolver")
  .description("LLM agent skill evolution framework")
  .version("0.1.0");

program.addCommand(makeEvolveCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeSkillsCommand());

program.parse();
