import { describe, it, expect } from "vitest";
import { summarize, isSignificantImprovement, tCritical95 } from "../src/stats.js";

describe("summarize", () => {
  it("빈 배열은 0으로 요약한다", () => {
    expect(summarize([])).toEqual({ mean: 0, stddev: 0, ci95: [0, 0], samples: [] });
  });

  it("표본 1개는 표준편차 0, 신뢰구간은 한 점", () => {
    const s = summarize([0.7]);
    expect(s.mean).toBeCloseTo(0.7);
    expect(s.stddev).toBe(0);
    expect(s.ci95).toEqual([0.7, 0.7]);
  });

  it("표본 표준편차와 t 기반 95% 신뢰구간을 계산한다", () => {
    const s = summarize([0.6, 0.8, 1.0]);
    expect(s.mean).toBeCloseTo(0.8);
    expect(s.stddev).toBeCloseTo(0.2);
    const half = tCritical95(2) * 0.2 / Math.sqrt(3);
    expect(s.ci95[0]).toBeCloseTo(0.8 - half);
    expect(s.ci95[1]).toBeCloseTo(0.8 + half);
  });
});

describe("isSignificantImprovement", () => {
  it("평균 차이가 margin 이하면 거부한다", () => {
    expect(isSignificantImprovement(summarize([0.5]), summarize([0.5]))).toBe(false);
    expect(isSignificantImprovement(summarize([0.55]), summarize([0.5]), 0.1)).toBe(false);
  });

  it("단일 측정이면 평균 차이만 비교한다", () => {
    expect(isSignificantImprovement(summarize([0.6]), summarize([0.5]))).toBe(true);
  });

  it("분산이 0인 반복 측정이면 개선을 인정한다", () => {
    expect(isSignificantImprovement(summarize([0.9, 0.9, 0.9]), summarize([0.5, 0.5, 0.5]))).toBe(true);
  });

  it("노이즈에 묻히는 소폭 개선은 거부한다", () => {
    const parent    = summarize([0.4, 0.7, 0.5]);
    const candidate = summarize([0.5, 0.8, 0.4]);
    expect(candidate.mean).toBeGreaterThan(parent.mean);
    expect(isSignificantImprovement(candidate, parent)).toBe(false);
  });

  it("분산 대비 충분히 큰 개선은 인정한다", () => {
    const parent    = summarize([0.50, 0.52, 0.48]);
    const candidate = summarize([0.80, 0.82, 0.78]);
    expect(isSignificantImprovement(candidate, parent)).toBe(true);
  });
});
