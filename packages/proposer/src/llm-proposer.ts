/**
 * LlmProposer: LLM 기반 스킬 제안 생성기
 *
 * 실패 그룹 분석 결과 + 히스토리 + 플러그인 컨텍스트를 기반으로
 * Anthropic API를 호출하여 SkillProposal을 생성한다.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Failure,
  FeedbackEntry,
  PluginContext,
  Proposer,
  SkillProposal,
} from "@nerdvana/evolver-core";
import { groupByPattern } from "./failure-analyzer.js";

export interface LlmProposerConfig {
  model?:  string;
  apiKey?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a skill evolution proposer for an LLM agent framework.

Your job: analyze failure patterns from agent task executions and propose a NEW or EDITED skill that would help the agent handle these failures better.

Rules:
- Respond ONLY with a single JSON object (no markdown fences, no explanation).
- The JSON must conform to this schema:
  {
    "action": "create" | "edit",
    "skillName": "<kebab-case name>",
    "trigger": "<when this skill should activate>",
    "description": "<what the skill does>",
    "rationale": "<why this addresses the failures>",
    "editTarget": "<existing skill name, only if action=edit>"
  }
- If previous proposals for the same pattern failed, propose a different approach.
- Prefer targeted, specific skills over broad generic ones.
- Skill names must be kebab-case, 2-5 words.`;

export class LlmProposer implements Proposer {
  private readonly client: Anthropic;
  private readonly model:  string;

  constructor(config: LlmProposerConfig = {}) {
    this.model  = config.model ?? DEFAULT_MODEL;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async propose(
    failures: Failure[],
    history:  FeedbackEntry[],
    context?: PluginContext,
  ): Promise<SkillProposal> {
    const groups       = groupByPattern(failures);
    const groupSummary = groups.map(g => g.summary).join("\n\n");

    const historyBlock = history.length > 0
      ? formatHistory(history)
      : "(no prior proposals)";

    const contextBlock = context && Object.keys(context).length > 0
      ? `\n\nPlugin context:\n${JSON.stringify(context, null, 2)}`
      : "";

    const userMessage = [
      "## Failure Analysis",
      groupSummary,
      "",
      "## Prior Proposal History",
      historyBlock,
      contextBlock,
      "",
      "Propose a skill to address these failures.",
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

    return parseProposal(text);
  }
}

function formatHistory(history: FeedbackEntry[]): string {
  const recent = history.slice(-10);
  return recent.map(h => {
    const status = h.accepted ? "ACCEPTED" : "REJECTED";
    const delta  = h.delta >= 0 ? `+${h.delta.toFixed(2)}` : h.delta.toFixed(2);
    return `- [${status}] "${h.proposal.skillName}" (delta: ${delta})`;
  }).join("\n");
}

function parseProposal(text: string): SkillProposal {
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

  if (!obj.action || !obj.skillName || !obj.trigger || !obj.description || !obj.rationale) {
    throw new Error(`Invalid SkillProposal shape: missing required fields`);
  }

  if (obj.action !== "create" && obj.action !== "edit") {
    throw new Error(`Invalid action: ${obj.action}`);
  }

  return {
    action:      obj.action,
    skillName:   String(obj.skillName),
    trigger:     String(obj.trigger),
    description: String(obj.description),
    rationale:   String(obj.rationale),
    ...(obj.editTarget ? { editTarget: String(obj.editTarget) } : {}),
  };
}
