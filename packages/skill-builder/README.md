# @evolver/skill-builder

> Materializes skill proposals into concrete SKILL.md files via LLM generation.

## Installation

```bash
pnpm add @evolver/skill-builder
```

## Usage

```typescript
import { SkillMaterializer, META_SKILL } from "@evolver/skill-builder";

// Create a skill builder (implements @evolver/core SkillBuilder interface)
const builder = new SkillMaterializer({
  model: "claude-haiku-4-5", // optional, default
});

// Build a Skill from a SkillProposal
const skill = await builder.build(proposal, parentSkills, pluginContext);
// skill: { name, trigger, content, scripts? }

// Access the meta-skill prompt for custom use
console.log(META_SKILL);
```

## API

### `SkillMaterializer`

Calls the Anthropic API with the META_SKILL best-practice prompt to generate SKILL.md content and optional helper scripts from a `SkillProposal`.

```typescript
new SkillMaterializer(options?: { model?: string; client?: Anthropic })
builder.build(
  proposal:     SkillProposal,
  parentSkills: Skill[],
  context?:     PluginContext,
): Promise<Skill>
builder.parseResponse(text: string, proposal: SkillProposal): Skill
```

The LLM response is expected to contain:
- A ```` ```markdown ``` ```` block with SKILL.md content (YAML frontmatter + body)
- Optional ```` ```typescript:filename ``` ```` blocks for helper scripts

### `META_SKILL`

Exported constant string containing skill authoring best practices. Covers SKILL.md structure, trigger rules, procedural instructions, content guidelines, and script conventions. Injected as system prompt during skill generation.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `"claude-haiku-4-5"` | Anthropic model for skill generation |
| `client` | `Anthropic` | auto-created | Custom Anthropic SDK client instance |

## Testing

```bash
pnpm test
```
