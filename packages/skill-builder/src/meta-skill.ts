/**
 * MetaSkill: 스킬 작성 best practice를 담은 부트스트랩 프롬프트.
 * SkillMaterializer가 LLM 호출 시 시스템 프롬프트에 주입한다.
 */

export const META_SKILL = `
# Skill Authoring Best Practices

## SKILL.md Structure
Every skill MUST have YAML frontmatter with the following fields:
\`\`\`yaml
---
name: <skill-name>          # kebab-case, unique across the skill set
description: <1-2 sentences> # what the skill does
trigger: <when to activate>  # specific, non-overlapping condition
---
\`\`\`

## Trigger Rules
- Triggers must be specific and non-overlapping with existing skills
- Use concrete keywords or patterns, not vague conditions like "when needed"
- A trigger should activate for ONE well-defined situation
- Avoid triggers that subsume other skills' triggers
- Examples of good triggers:
  - "When the user asks to write a unit test for a Python function"
  - "When a TypeScript type error mentions 'cannot assign to readonly'"
- Examples of bad triggers:
  - "When coding" (too broad)
  - "When there is an error" (overlaps with many skills)

## Procedural Instructions
- Write instructions as numbered steps, not declarative statements
- Each step should be a concrete, verifiable action
- Include validation checkpoints between major steps
- Specify expected outputs and failure conditions
- Example:
  1. Read the target file to understand existing code structure
  2. Identify the function signature and return type
  3. Write test cases covering: happy path, edge cases, error cases
  4. Verify: all tests should compile without type errors

## Content Guidelines
- Keep skills focused on ONE capability
- Avoid skills that try to do everything
- Reference specific tools, commands, or APIs when applicable
- Include "do NOT" sections for common mistakes
- Keep total content under 2000 tokens for efficiency

## Scripts (Optional)
- Helper scripts go in a scripts/ directory
- Scripts should be self-contained and idempotent
- Name scripts descriptively: validate-input.ts, parse-output.py
- Scripts must handle errors gracefully with non-zero exit codes
`.trim();
