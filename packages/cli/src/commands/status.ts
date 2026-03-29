/**
 * evolver status 커맨드
 *
 * .evolver/state.json에서 마지막 실행 상태를 출력한다.
 */

import { Command }    from "commander";
import { loadState }  from "../state.js";

export function makeStatusCommand(): Command {
  return new Command("status")
    .description("Show current evolution status")
    .action(() => {
      const state = loadState();
      if (!state) {
        console.log("No evolution state found. Run 'evolver evolve' first.");
        return;
      }

      const { report } = state;
      console.log(`Last run:        ${state.lastRun}`);
      console.log(`Iterations:      ${report.iterations}`);
      console.log(`Total cost:      $${report.totalCostUsd.toFixed(4)}`);
      console.log(`Best program:    ${report.bestProgram.id} (score: ${report.bestProgram.score.toFixed(4)})`);
      console.log(`Frontier size:   ${report.frontier.length}`);
      console.log(`History entries: ${report.history.length}`);
      console.log(`Duration:        ${(report.durationMs / 1000).toFixed(1)}s`);

      if (report.bestProgram.skills.length > 0) {
        console.log("\nBest skills:");
        for (const s of report.bestProgram.skills) {
          console.log(`  - ${s.name}: ${s.trigger}`);
        }
      }
    });
}
