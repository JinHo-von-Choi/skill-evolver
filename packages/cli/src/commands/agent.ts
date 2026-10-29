import fs   from "node:fs";
import path from "node:path";
import { Command } from "commander";
import YAML from "yaml";

const SELF_IMMUNIZER_SKILL = `---
name: self-immunizer
description: 명령 실행이나 테스트 실패를 해결한 뒤 실행 로그에서 회귀 태스크를 만들고 재발 방지 스킬을 진화시킨다.
---

# Self Immunizer

1. 명령이나 테스트가 실패하면 입력, 오류, 해결 방법과 성공 결과를 로그에 남긴다. JSONL은 행마다 객체를 사용하며 prompt 또는 command, error, status, exit_code, output 필드를 기록한다. 성공 재시도에도 동일한 prompt 또는 command를 기록한다.
2. 실패 원인을 해결하고 관련 테스트로 결과를 확인한다. evolver 자체의 실패나 진화 실행 중 발생한 실패로 이 절차를 재귀 호출하지 않는다.
3. 이 스킬 옆의 config.yaml을 읽는다. 상대 경로는 작업 프로젝트 루트 기준이다. LOG_PATH에는 실행 로그 경로, TASK_DIR에는 harvest.out, SKILLS_DIR에는 evolve.skills_dir 값을 지정한다. 기존 태스크셋이 있으면 새 세션용 TASK_DIR을 사용한다.
4. 프로젝트 루트에서 태스크를 추출한다.

\`\`\`sh
evolver harvest --log "$LOG_PATH" --out "$TASK_DIR" --format auto
\`\`\`

5. train/과 validation/의 input 및 expected를 확인한다. expected가 null이면 검증된 성공 결과로 채운다. 태스크가 없으면 종료한다. config.yaml의 scorer는 기본 fuzzy이며 태스크에 맞는 채점 기준을 사용한다.
6. evolver 실행 파일과 ANTHROPIC_API_KEY가 준비되어 있는지 확인한다. 아래 옵션은 기본값이며 이 스킬의 config.yaml에 맞춰 adapter, runs, max_iterations, budget_limit을 적용한다.

\`\`\`sh
evolver evolve --task-dir "$TASK_DIR" --skills-dir "$SKILLS_DIR" --adapter claude-code --runs 3 --max-iterations 10 --budget-limit 5
\`\`\`

7. 생성된 스킬과 검증 점수를 확인하고 이후 같은 종류의 작업에 적용한다.
`;

function writeIfMissing(file: string, content: string): void {
  try {
    fs.writeFileSync(file, content, { encoding: "utf-8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!fs.statSync(file).isFile()) throw new Error(`파일 경로가 아닙니다: ${file}`);
  }
}

export function makeAgentCommand(): Command {
  const install = new Command("install")
    .description("self-immunizer 스킬과 기본 설정 설치")
    .option("--target <path>", "스킬 설치 디렉토리", "./.skills")
    .action((opts: { target: string }, command: Command) => {
      try {
        const skillDir = path.join(opts.target, "self-immunizer");
        fs.mkdirSync(skillDir, { recursive: true });
        writeIfMissing(path.join(skillDir, "SKILL.md"), SELF_IMMUNIZER_SKILL);
        writeIfMissing(path.join(skillDir, "config.yaml"), YAML.stringify({
          harvest: {
            out: ".evolver/harvested-tasks",
            format: "auto",
          },
          evolve: {
            task_dir: ".evolver/harvested-tasks",
            skills_dir: opts.target,
            adapter: "claude-code",
            runs: 3,
            max_iterations: 10,
            budget_limit: 5,
          },
        }));
        console.log(`self-immunizer 스킬 설치: ${skillDir}`);
      } catch (error) {
        command.error(`agent install 실패: ${(error as Error).message}`);
      }
    });

  return new Command("agent")
    .description("에이전트 자가 면역 스킬 설치 및 관리")
    .addCommand(install);
}
