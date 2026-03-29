# gen-test + fix Example

`gen-test`와 `fix` 스킬을 대상으로 한 실제 실행 가능한 태스크 셋.

## 태스크 구성

| ID | 카테고리 | 내용 |
|----|----------|------|
| gen-001 | gen-test | `find_max` 함수 테스트 생성 |
| gen-002 | gen-test | `divide` 함수 테스트 생성 |
| gen-003 | gen-test | `Stack` 클래스 테스트 생성 |
| fix-001 | fix | `is_palindrome` 공백/특수문자 처리 버그 수정 |
| fix-002 | fix | `flatten` append → extend 버그 수정 |
| fix-003 | fix | `count_words` 대소문자 정규화 누락 수정 |
| gen-010 | gen-test | `is_prime` 함수 테스트 생성 (validation) |
| gen-011 | gen-test | `binary_search` 함수 테스트 생성 (validation) |
| fix-010 | fix | `two_sum` 자기 참조 인덱스 버그 수정 (validation) |

## 채점 방식

에이전트 출력에서 Python 코드블록을 추출 → 임시 파일로 저장 → `pytest` 실행.
exit code 0이면 1.0, 아니면 0.0.

## 실행

```bash
evolver evolve \
  --task-dir ./examples/gen-test-fix/tasks \
  --adapter claude-code \
  --runs 3 \
  --budget-limit 5 \
  --failure-threshold 0.5
```
