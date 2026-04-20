/**
 * stats-utils.ts
 *
 * Shared helpers for aggregating per-map brawler stats into a single
 * brawler-level summary.
 *
 * Why this file exists:
 *   MapBrawlerStat rows can be either real (sampleSize > 0, isReal=true) or
 *   seeded placeholders (sampleSize = 0, isReal=false). A naive arithmetic
 *   mean across rows lets a seeded 57% row drag a real 47% row toward the
 *   middle, so the homepage would show a different number than the SQL
 *   query against real battles.
 *
 *   aggregateBrawlerStats() weights each map row by its sampleSize, which
 *   is mathematically equivalent to pooling all battles and computing
 *   wins/total directly. Seeded rows (sampleSize=0) contribute nothing.
 *
 * If every row is seeded (total sampleSize == 0) we fall back to neutral
 * placeholders (50% win rate, 0 pick/ban rate). This matches the existing
 * behavior so the UI doesn't crash on empty brawlers.
 */

export interface WeightedStat {
  sampleSize: number;
  winRate: number;
  pickRate: number;
  banRate: number;
}

export interface AggregatedStats {
  winRate: number;
  pickRate: number;
  banRate: number;
  sampleSize: number;
}

/**
 * Pool a list of per-map stat rows into a single weighted average.
 * Results are rounded to one decimal place for display.
 */
export function aggregateBrawlerStats(stats: WeightedStat[]): AggregatedStats {
  const totalSamples = stats.reduce((s, st) => s + st.sampleSize, 0);
  if (totalSamples === 0) {
    return { winRate: 50, pickRate: 0, banRate: 0, sampleSize: 0 };
  }
  const winRate =
    stats.reduce((s, st) => s + st.winRate * st.sampleSize, 0) / totalSamples;
  const pickRate =
    stats.reduce((s, st) => s + st.pickRate * st.sampleSize, 0) / totalSamples;
  const banRate =
    stats.reduce((s, st) => s + st.banRate * st.sampleSize, 0) / totalSamples;
  return {
    winRate: Math.round(winRate * 10) / 10,
    pickRate: Math.round(pickRate * 10) / 10,
    banRate: Math.round(banRate * 10) / 10,
    sampleSize: totalSamples,
  };
}

/**
 * True if the aggregate is backed by enough real battles to trust.
 * Mirrors MIN_SAMPLE in stat-aggregator.ts. Use this in the UI to decide
 * whether to show a confidence indicator / "seeded" badge.
 */
export const MIN_TRUSTED_SAMPLE = 50;

export function isTrustedSample(sampleSize: number): boolean {
  return sampleSize >= MIN_TRUSTED_SAMPLE;
}

/**
 * Wilson score lower bound (95% confidence) with optional Bayesian prior.
 *
 * Use this to RANK brawlers on a map, not to display their win rate.
 * It answers "what's the lowest plausible true win rate given this many
 * games?" — so 2/2 (100% raw) gets pulled down hard while 700/1000
 * (70% raw) stays close to its observed rate.
 *
 * `priorGames` adds that many virtual 50/50 games before computing, which
 * shrinks tiny samples toward the population mean. Without a prior, a 5-0
 * record Wilson-scores higher than a 44-33 record (statistically defensible
 * but unintuitive). With priorGames=50, the 5-0 becomes effectively 30-25
 * and sinks to where a reasonable viewer expects it to be.
 *
 * Reddit uses the same Wilson formula (without a prior) to rank comments.
 *
 * Returns 0..1. Multiply by 100 for a percentage.
 */
export function wilsonScoreLowerBound(
  wins: number,
  total: number,
  priorGames = 0
): number {
  const w = wins + priorGames / 2;
  const n = total + priorGames;
  if (n === 0) return 0;
  const z = 1.96; // 95% confidence
  const p = w / n;
  const z2 = z * z;
  const numerator =
    p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  const denominator = 1 + z2 / n;
  return numerator / denominator;
}
