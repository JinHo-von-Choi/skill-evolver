import { readFileSync }      from "node:fs";
import { Command }           from "commander";
import { makeEvolveCommand } from "./commands/evolve.js";
import { makeStatusCommand } from "./commands/status.js";
import { makeSkillsCommand } from "./commands/skills.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

const program = new Command()
  .name("evolver")
  .description("LLM agent skill evolution framework")
  .version(pkg.version);

program.addCommand(makeEvolveCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeSkillsCommand());

program.parse();
