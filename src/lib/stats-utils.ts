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
