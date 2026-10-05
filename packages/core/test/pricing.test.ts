import { describe, it, expect } from "vitest";
import { estimateCostUsd, resolvePricing, FALLBACK_PRICING } from "../src/pricing.js";

describe("pricing", () => {
  it("모델 계열별 단가를 적용한다", () => {
    const usage = { input: 1_000_000, output: 1_000_000 };
    expect(estimateCostUsd(usage, "claude-haiku-4-5")).toBeCloseTo(6);
    expect(estimateCostUsd(usage, "claude-sonnet-4-6")).toBeCloseTo(18);
    expect(estimateCostUsd(usage, "claude-opus-4-1")).toBeCloseTo(90);
  });

  it("알 수 없는 모델과 미지정은 기본 단가를 쓴다", () => {
    expect(resolvePricing(undefined)).toEqual(FALLBACK_PRICING);
    expect(resolvePricing("some-other-model")).toEqual(FALLBACK_PRICING);
  });

  it("재정의 단가가 기본 단가보다 우선한다", () => {
    const overrides = { "claude-haiku": { inputPerMTok: 10, outputPerMTok: 20 } };
    expect(estimateCostUsd({ input: 1_000_000, output: 0 }, "claude-haiku-4-5", overrides)).toBeCloseTo(10);
  });
});
