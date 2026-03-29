/**
 * SkillMaterializer: SkillProposal을 구체적 Skill 객체로 변환.
 * Anthropic SDK로 LLM을 호출하여 SKILL.md 내용과 scripts를 생성한다.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Skill, SkillBuilder, SkillProposal, PluginContext } from "@evolver/core";
import { META_SKILL } from "./meta-skill.js";

const DEFAULT_MODEL  = "claude-haiku-4-5";
const MAX_TOKENS     = 4096;

interface SkillMaterializerOptions {
  model?:  string;
  client?: Anthropic;
}

export class SkillMaterializer implements SkillBuilder {
  private readonly model:  string;
  private readonly client: Anthropic;

  constructor(options: SkillMaterializerOptions = {}) {
    this.model  = options.model ?? DEFAULT_MODEL;
    this.client = options.client ?? new Anthropic();
  }

  async build(
    proposal:     SkillProposal,
    parentSkills: Skill[],
    context?:     PluginContext,
  ): Promise<Skill> {
    const systemPrompt = this.buildSystemPrompt(parentSkills);
    const userPrompt   = this.buildUserPrompt(proposal, context);

    const response = await this.client.messages.create({
      model:      this.model,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return this.parseResponse(text, proposal);
  }

  private buildSystemPrompt(parentSkills: Skill[]): string {
    const parts = [
      "You are an expert skill author for LLM agents.",
      "Generate a complete SKILL.md file following the best practices below.",
      "",
      META_SKILL,
    ];

    if (parentSkills.length > 0) {
      parts.push("");
      parts.push("## Existing Skills (avoid trigger overlap)");
      for (const skill of parentSkills) {
        parts.push(`- ${skill.name}: trigger="${skill.trigger}"`);
      }
    }

    return parts.join("\n");
  }

  private buildUserPrompt(proposal: SkillProposal, context?: PluginContext): string {
    const parts = [
      `Action: ${proposal.action}`,
      `Skill Name: ${proposal.skillName}`,
      `Trigger: ${proposal.trigger}`,
      `Description: ${proposal.description}`,
      `Rationale: ${proposal.rationale}`,
    ];

    if (proposal.action === "edit" && proposal.editTarget) {
      parts.push(`Edit Target: ${proposal.editTarget}`);
    }

    if (context && Object.keys(context).length > 0) {
      parts.push("");
      parts.push("Additional Context:");
      parts.push(JSON.stringify(context, null, 2));
    }

    parts.push("");
    parts.push("Generate the SKILL.md content. Wrap SKILL.md in ```markdown ... ``` fences.");
    parts.push("If helper scripts are needed, wrap each in ```<lang>:<filename> ... ``` fences (e.g., ```typescript:validate.ts ... ```).");

    return parts.join("\n");
  }

  /**
   * LLM 응답에서 SKILL.md 내용과 scripts를 파싱한다.
   *
   * 기대 형식:
   * ```markdown
   * ---
   * name: ...
   * ---
   * ...
   * ```
   *
   * ```typescript:scripts/validate.ts
   * ...
   * ```
   */
  parseResponse(text: string, proposal: SkillProposal): Skill {
    const skillContent = this.extractSkillContent(text);
    const scripts      = this.extractScripts(text);

    return {
      name:    proposal.skillName,
      trigger: proposal.trigger,
      content: skillContent,
      ...(Object.keys(scripts).length > 0 && { scripts }),
    };
  }

  private extractSkillContent(text: string): string {
    const markdownMatch = text.match(/```markdown\s*\n([\s\S]*?)```/);
    if (markdownMatch) {
      return markdownMatch[1].trim();
    }

    /** fallback: frontmatter 블록이 있으면 전체 텍스트 사용 */
    if (text.includes("---")) {
      return text.trim();
    }

    return text.trim();
  }

  private extractScripts(text: string): Record<string, string> {
    const scripts: Record<string, string> = {};
    const scriptPattern = /```(?:typescript|python|bash|sh):([^\s]+)\s*\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;
    while ((match = scriptPattern.exec(text)) !== null) {
      const filename = match[1].trim();
      const content  = match[2].trim();
      scripts[filename] = content;
    }

    return scripts;
  }
}
