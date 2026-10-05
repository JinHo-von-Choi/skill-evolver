/**
 * 재시도해도 소용없는 LLM 호출 오류(인증, 권한, 엔드포인트 없음)인지 판별한다.
 * Anthropic SDK 오류는 status 필드와 클래스 이름으로 식별한다.
 */
export function isFatalLlmError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 401 || status === 403 || status === 404) return true;

  const name = err instanceof Error ? err.constructor.name : "";
  return /AuthenticationError|PermissionDeniedError|NotFoundError/.test(name);
}
