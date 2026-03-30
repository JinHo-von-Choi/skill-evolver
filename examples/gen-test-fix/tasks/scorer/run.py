#!/usr/bin/env python3
"""
gen-test / fix 태스크 커스텀 스코러.

에이전트 출력에서 Python 코드블록을 추출하고 pytest로 실행하여 채점한다.
exit 0 → 1.0, 그 외 → 0.0
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import yaml


def extract_code_blocks(text: str) -> list[str]:
    """마크다운 코드블록에서 Python 코드 추출."""
    pattern = r"```(?:python)?\n(.*?)```"
    return re.findall(pattern, text, re.DOTALL)


def build_gen_test_file(task: dict, agent_output: str) -> str:
    """gen-test: 타깃 함수 + 에이전트가 생성한 테스트 코드를 합친 파일."""
    # 원본 input에서 구현 코드 추출
    impl_blocks = extract_code_blocks(task["input"])
    impl_code = impl_blocks[0] if impl_blocks else ""

    # 에이전트 출력에서 테스트 코드 추출
    test_blocks = extract_code_blocks(agent_output)
    test_code = test_blocks[0] if test_blocks else agent_output.strip()

    return f"{impl_code}\n\n{test_code}"


def build_fix_file(task: dict, agent_output: str) -> str:
    """fix: 에이전트가 수정한 함수 + 검증 assert."""
    # 에이전트 출력에서 수정된 함수 추출
    fixed_blocks = extract_code_blocks(agent_output)
    fixed_code = fixed_blocks[0] if fixed_blocks else agent_output.strip()

    # task input에서 실패 테스트(assert 블록) 추출
    input_blocks = extract_code_blocks(task["input"])
    assert_code = input_blocks[1] if len(input_blocks) > 1 else ""

    return f"{fixed_code}\n\n{assert_code}"


def run_pytest(code: str, task_id: str) -> float:
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, f"test_{task_id.replace('-', '_')}.py")
        with open(test_file, "w") as f:
            f.write(code)

        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_file, "-q", "--tb=short"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return 1.0 if result.returncode == 0 else 0.0


def score(task: dict, agent_output: str) -> float:
    category = task.get("category", "")
    task_id  = task.get("id", "task")

    try:
        if category == "gen-test":
            code = build_gen_test_file(task, agent_output)
        elif category == "fix":
            code = build_fix_file(task, agent_output)
        else:
            return 0.0

        return run_pytest(code, task_id)

    except Exception as e:
        print(f"[scorer] error: {e}", file=sys.stderr)
        return 0.0


if __name__ == "__main__":
    # CLI: python run.py <task.yaml|task.json> <agent_output.txt>
    if len(sys.argv) != 3:
        print("usage: run.py <task.yaml|task.json> <agent_output.txt>")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        content = f.read()
        try:
            task = json.loads(content)
        except json.JSONDecodeError:
            task = yaml.safe_load(content)

    with open(sys.argv[2]) as f:
        output = f.read()

    result = score(task, output)
    print(f"score: {result}")
