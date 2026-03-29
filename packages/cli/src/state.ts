/**
 * .evolver/state.json 상태 영속화
 */

import fs   from "node:fs";
import path from "node:path";
import type { EvolutionReport } from "@evolver/core";

const STATE_DIR  = ".evolver";
const STATE_FILE = "state.json";

export interface EvolverState {
  lastRun:    string;
  report:     EvolutionReport;
  skillsDir?: string;
}

function statePath(): string {
  return path.join(process.cwd(), STATE_DIR, STATE_FILE);
}

export function saveState(state: EvolverState): void {
  const dir = path.join(process.cwd(), STATE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf-8");
}

export function loadState(): EvolverState | null {
  const p = statePath();
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}
