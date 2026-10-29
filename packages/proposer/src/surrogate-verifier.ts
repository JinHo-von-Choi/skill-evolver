/**
 * LlmSurrogateVerifier: LLM 기반 대리 검증기.
 *
 * 실제 평가를 실행하기 전에 제안된 스킬과 기존 프로그램(스킬들)의
 * 조합을 분석해 부작용, 스킬 간 충돌, 회귀 위험을 판단한다.
 * 결과는 VerificationResult JSON으로 파싱해 반환한다.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Program,
  SkillProposal,
  Task,
  VerificationResult,
  Verifier,
} from "@nerdvana/evolver-core";

export interface LlmSurrogateVerifierConfig {
  model?:  string;
  apiKey?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a surrogate verifier for an LLM agent skill evolution framework.

Your job: decide whether a PROPOSED skill (create or edit) may safely proceed to real evaluation, given the agent's existing skills. Focus on:
- Side effects between the proposed skill and existing skills (overlapping triggers that fight each other, conflicting instructions, regressions to already-working skills).
- Whether the proposal is a targeted, generalizable improvement rather than an overfit hack.

Rules:
- Respond ONLY with a single JSON object (no markdown fences, no explanation).
- The JSON must conform to this schema:
  {
    "approved":             true | false,
    "confidence":           <number, 0.0-1.0>,
    "reason":               "<short justification>",
    "edgeCasesIdentified":  ["<edge case>", "..."],
    "sideEffectRisk":       "low" | "medium" | "high"
  }`;

export class LlmSurrogateVerifier implements Verifier {
  private readonly client: Anthropic;
  private readonly model:  string;

  constructor(config: LlmSurrogateVerifierConfig = {}) {
    this.model  = config.model ?? DEFAULT_MODEL;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async verify(
    proposal: SkillProposal,
    program:  Program,
    validationTasks?: Task[],
  ): Promise<VerificationResult> {
    const skillBlock = program.skills.length > 0
      ? program.skills
        .map((s) => `- ${s.name} (trigger: ${s.trigger})\n  content: ${s.content.slice(0, 200)}`)
        .join("\n")
      : "(no existing skills)";

    const taskBlock = validationTasks && validationTasks.length > 0
      ? validationTasks
        .map((t) => `- ${t.id}: ${String(t.input).slice(0, 120)}`)
        .join("\n")
      : "(no validation tasks provided)";

    const userMessage = [
      "## Existing Program",
      `id: ${program.id}, generation: ${program.generation}, score: ${program.score}`,
      skillBlock,
      "",
      "## Proposed Skill",
      `action:      ${proposal.action}`,
      `skillName:   ${proposal.skillName}`,
      `trigger:     ${proposal.trigger}`,
      `description: ${proposal.description}`,
      `rationale:   ${proposal.rationale}`,
      ...(proposal.editTarget ? [`editTarget:  ${proposal.editTarget}`] : []),
      "",
      "## Planned Validation Tasks",
      taskBlock,
      "",
      "Verify whether this proposal may safely proceed to real evaluation.",
    ].join("\n");

    const response = await this.client.messages.create({
      model:      this.model,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    return parseVerification(text);
  }
}

function parseVerification(text: string): VerificationResult {
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.approved !== "boolean" || typeof obj.reason !== "string") {
    throw new Error(`Invalid VerificationResult shape: missing required fields`);
  }

  const confidence = typeof obj.confidence === "number"
    ? Math.min(1, Math.max(0, obj.confidence))
    : 0;

  const edgeCases = Array.isArray(obj.edgeCasesIdentified)
    ? obj.edgeCasesIdentified.filter((e): e is string => typeof e === "string")
    : undefined;

  const riskRaw   = typeof obj.sideEffectRisk === "string" ? obj.sideEffectRisk : undefined;
  const riskValid = riskRaw === "low" || riskRaw === "medium" || riskRaw === "high";

  return {
    approved:   obj.approved,
    confidence,
    reason:     obj.reason,
    ...(edgeCases && edgeCases.length > 0 ? { edgeCasesIdentified: edgeCases } : {}),
    ...(riskValid ? { sideEffectRisk: riskRaw } : {}),
  };
}
