import type { ModelPricing } from "./types.js";

/**
 * 모델 계열별 기본 단가 (USD / 백만 토큰).
 * 정확한 청구 금액이 아닌 예산 통제용 추정치이며, 필요 시 EvolutionConfig.pricing 으로 재정의한다.
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-opus":   { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet": { inputPerMTok: 3,  outputPerMTok: 15 },
  "claude-haiku":  { inputPerMTok: 1,  outputPerMTok: 5  },
};

export const FALLBACK_PRICING: ModelPricing = DEFAULT_PRICING["claude-sonnet"];

export function resolvePricing(
  model:     string | undefined,
  overrides: Record<string, ModelPricing> = {},
): ModelPricing {
  if (!model) return FALLBACK_PRICING;

  const tables = [overrides, DEFAULT_PRICING];
  for (const table of tables) {
    if (table[model]) return table[model];
    const key = Object.keys(table)
      .filter((k) => model.startsWith(k) || model.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (key) return table[key];
  }
  return FALLBACK_PRICING;
}

export function estimateCostUsd(
  usage:     { input: number; output: number },
  model?:    string,
  overrides?: Record<string, ModelPricing>,
): number {
  const p = resolvePricing(model, overrides);
  return (usage.input * p.inputPerMTok + usage.output * p.outputPerMTok) / 1_000_000;
}
