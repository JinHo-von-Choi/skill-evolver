import type { ScoreStats } from "./types.js";

/** 양측 95% t 분포 임계값 (자유도 1~30). */
const T_CRIT_95: readonly number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical95(df: number): number {
  if (df < 1) return Infinity;
  if (df <= T_CRIT_95.length) return T_CRIT_95[df - 1];
  return 1.96;
}

/**
 * 표본 점수 배열의 평균, 표본 표준편차, 95% 신뢰구간을 계산한다.
 * 표본이 1개이면 표준편차는 0, 신뢰구간은 평균 한 점으로 둔다.
 */
export function summarize(samples: number[]): ScoreStats {
  const n = samples.length;
  if (n === 0) {
    return { mean: 0, stddev: 0, ci95: [0, 0], samples: [] };
  }

  const mean = samples.reduce((a, b) => a + b, 0) / n;
  if (n === 1) {
    return { mean, stddev: 0, ci95: [mean, mean], samples: [...samples] };
  }

  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stddev   = Math.sqrt(variance);
  const half     = tCritical95(n - 1) * stddev / Math.sqrt(n);

  return { mean, stddev, ci95: [mean - half, mean + half], samples: [...samples] };
}

/**
 * 후보가 부모보다 유의하게 개선되었는지 판정한다.
 *
 * 평균 차이가 margin을 초과해야 하며, 양쪽 모두 2회 이상 측정된 경우에는
 * Welch 방식의 95% 신뢰구간 하한이 margin을 넘어야 한다.
 * 측정 분산이 0인 결정적 평가에서는 평균 차이만 비교한다.
 */
export function isSignificantImprovement(
  candidate: ScoreStats,
  parent:    ScoreStats,
  margin:    number = 0,
): boolean {
  const diff = candidate.mean - parent.mean;
  if (diff <= margin) return false;

  const nC = candidate.samples.length;
  const nP = parent.samples.length;
  if (nC < 2 || nP < 2) return true;

  const vC = candidate.stddev ** 2 / nC;
  const vP = parent.stddev    ** 2 / nP;
  const se = Math.sqrt(vC + vP);
  if (se === 0) return true;

  const df = (vC + vP) ** 2 / (vC ** 2 / (nC - 1) + vP ** 2 / (nP - 1));
  const lowerBound = diff - tCritical95(Math.max(1, Math.floor(df))) * se;
  return lowerBound > margin;
}
