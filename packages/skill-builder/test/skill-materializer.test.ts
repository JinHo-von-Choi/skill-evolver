import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillMaterializer } from "../src/skill-materializer.js";
import { META_SKILL } from "../src/meta-skill.js";
import type { SkillProposal, Skill } from "@nerdvana/evolver-core";

/* ------------------------------------------------------------------ */
/*  Mock Anthropic SDK                                                 */
/* ------------------------------------------------------------------ */

function createMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as any;
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const CREATE_PROPOSAL: SkillProposal = {
  action:      "create",
  skillName:   "test-writer",
  trigger:     "When the user asks to write a unit test",
  description: "Generates unit tests for Python functions",
  rationale:   "Multiple failures in test generation tasks",
};

const EDIT_PROPOSAL: SkillProposal = {
  action:      "edit",
  skillName:   "test-writer",
  trigger:     "When the user asks to write a unit test",
  description: "Improved unit test generation with edge cases",
  rationale:   "Previous version missed boundary conditions",
  editTarget:  "test-writer",
};

const PARENT_SKILLS: Skill[] = [
  {
    name:    "code-reviewer",
    trigger: "When the user asks for a code review",
    content: "---\nname: code-reviewer\n---\nReview code.",
  },
];

const MOCK_RESPONSE_WITH_SCRIPTS = `
Here is the generated skill:

\`\`\`markdown
---
name: test-writer
description: Generates unit tests for Python functions
trigger: When the user asks to write a unit test
---

# Test Writer

## Steps
1. Read the target function
2. Identify input types and return type
3. Generate test cases
4. Validate: tests compile without errors
\`\`\`

\`\`\`typescript:scripts/validate.ts
console.log("validating tests...");
\`\`\`

\`\`\`python:scripts/run-tests.py
import subprocess
subprocess.run(["pytest", "-v"])
\`\`\`
`;

const MOCK_RESPONSE_SIMPLE = `
\`\`\`markdown
---
name: test-writer
description: Generates unit tests
trigger: When the user asks to write a unit test
---

# Test Writer

Write unit tests following Given-When-Then pattern.
\`\`\`
`;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("SkillMaterializer", () => {
  describe("build()", () => {
    it("create 제안에서 정상적으로 Skill을 생성한다", async () => {
      const mockClient   = createMockClient(MOCK_RESPONSE_WITH_SCRIPTS);
      const materializer = new SkillMaterializer({ client: mockClient });

      const skill = await materializer.build(CREATE_PROPOSAL, PARENT_SKILLS);

      expect(skill.name).toBe("test-writer");
      expect(skill.trigger).toBe("When the user asks to write a unit test");
      expect(skill.content).toContain("name: test-writer");
      expect(skill.content).toContain("# Test Writer");
      expect(skill.scripts).toBeDefined();
      expect(skill.scripts!["scripts/validate.ts"]).toContain("validating tests");
      expect(skill.scripts!["scripts/run-tests.py"]).toContain("pytest");

      /** LLM 호출 파라미터 검증 */
      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-haiku-4-5");
      expect(callArgs.system).toContain(META_SKILL);
      expect(callArgs.system).toContain("code-reviewer");
      expect(callArgs.messages[0].content).toContain("create");
      expect(callArgs.messages[0].content).toContain("test-writer");
    });

    it("edit 제안에서 editTarget이 프롬프트에 포함된다", async () => {
      const mockClient   = createMockClient(MOCK_RESPONSE_SIMPLE);
      const materializer = new SkillMaterializer({ client: mockClient });

      const skill = await materializer.build(EDIT_PROPOSAL, []);

      expect(skill.name).toBe("test-writer");

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain("edit");
      expect(callArgs.messages[0].content).toContain("Edit Target: test-writer");
    });

    it("scripts가 없는 응답에서 scripts 필드가 생략된다", async () => {
      const mockClient   = createMockClient(MOCK_RESPONSE_SIMPLE);
      const materializer = new SkillMaterializer({ client: mockClient });

      const skill = await materializer.build(CREATE_PROPOSAL, []);

      expect(skill.scripts).toBeUndefined();
    });

    it("빈 proposal 필드도 정상 처리된다", async () => {
      const emptyProposal: SkillProposal = {
        action:      "create",
        skillName:   "",
        trigger:     "",
        description: "",
        rationale:   "",
      };
      const mockClient   = createMockClient(MOCK_RESPONSE_SIMPLE);
      const materializer = new SkillMaterializer({ client: mockClient });

      const skill = await materializer.build(emptyProposal, []);

      expect(skill.name).toBe("");
      expect(skill.trigger).toBe("");
      expect(skill.content).toBeTruthy();
    });

    it("PluginContext가 프롬프트에 반영된다", async () => {
      const mockClient   = createMockClient(MOCK_RESPONSE_SIMPLE);
      const materializer = new SkillMaterializer({ client: mockClient });
      const ctx          = { relatedSkills: ["error-handler"] };

      await materializer.build(CREATE_PROPOSAL, [], ctx);

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain("Additional Context");
      expect(callArgs.messages[0].content).toContain("error-handler");
    });

    it("사용자 지정 모델이 LLM 호출에 반영된다", async () => {
      const mockClient   = createMockClient(MOCK_RESPONSE_SIMPLE);
      const materializer = new SkillMaterializer({
        client: mockClient,
        model:  "claude-sonnet-4-6",
      });

      await materializer.build(CREATE_PROPOSAL, []);

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-sonnet-4-6");
    });
  });

  describe("parseResponse()", () => {
    let materializer: SkillMaterializer;

    beforeEach(() => {
      materializer = new SkillMaterializer({
        client: createMockClient(""),
      });
    });

    it("markdown 펜스에서 SKILL.md 내용을 추출한다", () => {
      const skill = materializer.parseResponse(MOCK_RESPONSE_WITH_SCRIPTS, CREATE_PROPOSAL);
      expect(skill.content).toContain("name: test-writer");
      expect(skill.content).not.toContain("```");
    });

    it("여러 scripts를 올바르게 파싱한다", () => {
      const skill = materializer.parseResponse(MOCK_RESPONSE_WITH_SCRIPTS, CREATE_PROPOSAL);
      expect(Object.keys(skill.scripts!)).toHaveLength(2);
      expect(skill.scripts!["scripts/validate.ts"]).toBeTruthy();
      expect(skill.scripts!["scripts/run-tests.py"]).toBeTruthy();
    });

    it("markdown 펜스가 없으면 fallback으로 전체 텍스트 사용", () => {
      const rawText = "---\nname: fallback\n---\nSome content.";
      const skill   = materializer.parseResponse(rawText, CREATE_PROPOSAL);
      expect(skill.content).toContain("name: fallback");
    });

    it("frontmatter도 없으면 원문 그대로 반환", () => {
      const rawText = "Just plain text skill content.";
      const skill   = materializer.parseResponse(rawText, CREATE_PROPOSAL);
      expect(skill.content).toBe("Just plain text skill content.");
    });
  });
});
