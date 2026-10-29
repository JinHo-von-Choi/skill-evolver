/**
 * HarnessCompiler: 스킬에 결정론적 실행 하네스(deterministic verification harness)를 합성.
 * preflight(환경/도구/경로 점검)와 validate(실행 결과 검증) 스크립트를 자동 생성하고,
 * 스킬 본문에 하네스 실행 절차를 삽입한다.
 */

import type { Skill, SkillProposal } from "@nerdvana/evolver-core";

const PREFLIGHT_PATH = "scripts/preflight.sh";
const VALIDATE_PATH  = "scripts/validate.sh";

export class HarnessCompiler {
  /**
   * 스킬에 결정론적 검증 스크립트가 없으면 제안 내용에 맞는 하네스 스크립트를
   * 합성하여 skill.scripts에 추가하고, 본문에 실행 절차를 삽입한다.
   * 이미 하네스 스크립트가 있는 유형은 건드리지 않는다.
   */
  compileHarness(skill: Skill, proposal: SkillProposal): Skill {
    const scripts  = { ...(skill.scripts ?? {}) };
    const compiled = { ...skill, scripts };

    if (!this.hasPreflight(scripts)) {
      scripts[PREFLIGHT_PATH] = this.synthesizePreflight(proposal);
    }
    if (!this.hasValidate(scripts)) {
      scripts[VALIDATE_PATH] = this.synthesizeValidate(proposal);
    }

    compiled.content = this.weaveProcedure(compiled.content, scripts);
    return compiled;
  }

  private hasPreflight(scripts: Record<string, string>): boolean {
    return Object.keys(scripts).some((path) => /preflight/i.test(path));
  }

  private hasValidate(scripts: Record<string, string>): boolean {
    return Object.keys(scripts).some((path) => /validate|verify|check|test/i.test(path));
  }

  private synthesizePreflight(proposal: SkillProposal): string {
    const skillName = proposal.skillName || "skill";
    return `#!/usr/bin/env bash
# preflight for ${skillName}: environment, tool availability and path validity.
# Exit 0 = ready to run. Exit non-zero = abort before running the skill.
set -u

fail() {
  echo "PREFLIGHT FAILED: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_command bash
require_command ${skillName === "run-tests" ? "pytest" : "ls"}

# Working directory must be present and readable.
[ -d "$PWD" ] || fail "working directory is not accessible"
[ -r "$PWD" ] || fail "working directory is not readable"

# Task-relevant paths passed as arguments must exist.
for path in "$@"; do
  if [ -n "$path" ] && [ ! -e "$path" ]; then
    fail "path does not exist: $path"
  fi
done

echo "PREFLIGHT OK"
exit 0
`;
  }

  private synthesizeValidate(proposal: SkillProposal): string {
    const skillName = proposal.skillName || "skill";
    return `#!/usr/bin/env bash
# validate for ${skillName}: verify execution outputs, file state and exit code.
# Exit 0 = output accepted. Exit non-zero = result rejected.
set -u

fail() {
  echo "VALIDATION FAILED: $1" >&2
  exit 1
}

# Output path is given as the first argument; it must exist and be non-empty.
output="$1"
[ -n "$output" ] || fail "no output path provided"
[ -e "$output" ] || fail "output does not exist: $output"

if [ -s "$output" ]; then
  echo "VALIDATION OK: output is present and non-empty"
  exit 0
fi

echo "VALIDATION FAILED: output is empty: $output" >&2
exit 1
`;
  }

  /**
   * 본문에 하네스 실행 절차가 누락되어 있으면 지침 단계에 삽입한다.
   */
  private weaveProcedure(content: string, scripts: Record<string, string>): string {
    let updated = content;

    const preflightPath = Object.keys(scripts).find((p) => /preflight/i.test(p));
    if (preflightPath && !updated.includes(preflightPath)) {
      const step =
        `- Before executing any task step, run \`${preflightPath}\`. ` +
        `If it exits with a non-zero code, resolve the reported condition or stop the task; do not continue on a failed preflight.\n`;
      updated = this.insertStep(updated, step, "first");
    }

    const validatePath = Object.keys(scripts).find((p) => /validate/i.test(p));
    if (validatePath && !updated.includes(validatePath)) {
      const step =
        `- After producing the result, run \`${validatePath}\` on the output. ` +
        `A non-zero exit code means the result is invalid; fix the problem or discard the result. Never declare completion without passing this validation.\n`;
      updated = this.insertStep(updated, step, "last");
    }

    return updated;
  }

  /**
   * 단계 삽입 우선순위: validate는 마지막 지침 뒤, preflight는 첫 지침 앞.
   */
  private insertStep(content: string, step: string, position: "first" | "last"): string {
    const lines       = content.split("\n");
    const firstHeading = lines.findIndex((line) => /^#{1,6}\s/.test(line));
    const firstStep    = lines.findIndex((line) => /^\s*(?:[-*]|\d+\.)\s/.test(line));
    const lastStep     = lines.reduceRight((found, line, index) => {
      return found === -1 && /^\s*(?:[-*]|\d+\.)\s/.test(line) ? index : found;
    }, -1);

    const insertAt =
      position === "first"
        ? (firstStep !== -1 ? firstStep : (firstHeading === -1 ? lines.length : firstHeading + 1))
        : (lastStep !== -1  ? lastStep + 1 : (firstHeading === -1 ? lines.length : firstHeading + 1));

    lines.splice(insertAt, 0, step.trimEnd());
    return lines.join("\n");
  }
}
