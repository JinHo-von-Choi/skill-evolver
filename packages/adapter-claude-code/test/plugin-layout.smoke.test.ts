import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deployPlugin, PLUGIN_NAME } from "../src/skill-deployer.js";

const hasClaude = spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;

/**
 * 실제 claude CLI가 배치 결과를 플러그인으로 인식하고 스킬을 나열하는지 확인한다.
 * API 호출 없이 오프라인으로 동작하며, claude 바이너리가 없으면 건너뛴다.
 */
describe.skipIf(!hasClaude)("Claude Code 플러그인 배치 스모크", () => {
  it("배치한 스킬을 claude가 로드한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolver-layout-"));
    try {
      await deployPlugin(
        [{ name: "demo-skill", trigger: "when demoing", content: "# Demo\n1. do it" }],
        dir,
      );
      const out = execFileSync(
        "claude",
        ["--plugin-dir", dir, "plugin", "details", PLUGIN_NAME],
        { encoding: "utf-8", timeout: 60_000 },
      );
      expect(out).toMatch(/Skills \(1\)\s+demo-skill/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
