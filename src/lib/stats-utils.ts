/**
 * stats-utils.ts
 *
 * Shared helpers for aggregating per-map brawler stats into a single
 * brawler-level summary, plus pick-callout selectors for map detail
 * pages.
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
 *
 * `priorGames` adds N virtual 50/50 games to the brawler's total before
 * computing the win rate. This shrinks tiny-sample brawlers toward 50%
 * so a brand-new brawler with 3-0 doesn't show up on dashboard
 * leaderboards as "100% win rate." Matches what `wilsonScoreLowerBound`
 * uses on the map page (default 50) for consistent behavior across
 * the app.
 *
 * Pick rate and ban rate are not shrunk — those are pure ratios over
 * total picks/bans, where small samples don't produce misleading
 * outliers the same way win rate does.
 *
 * Pass `priorGames = 0` to get the unshrunk weighted average. Use this
 * for verification/debug pages where you're comparing to raw SQL.
 *
 * Results are rounded to one decimal place for display.
 */
export function aggregateBrawlerStats(
  stats: WeightedStat[],
  priorGames = 50
): AggregatedStats {
  const totalSamples = stats.reduce((s, st) => s + st.sampleSize, 0);

  if (totalSamples === 0) {
    return { winRate: 50, pickRate: 0, banRate: 0, sampleSize: 0 };
  }

  // Weighted-average win rate from real data, then shrink toward 50%
  // using the Bayesian prior. Equivalent to:
  //   adjusted = (realWins + prior/2) / (realGames + prior)
  const observedWinRate =
    stats.reduce((s, st) => s + st.winRate * st.sampleSize, 0) / totalSamples;

  const observedWins = (observedWinRate / 100) * totalSamples;
  const adjustedWinRate =
    ((observedWins + priorGames / 2) / (totalSamples + priorGames)) * 100;

  const pickRate =
    stats.reduce((s, st) => s + st.pickRate * st.sampleSize, 0) / totalSamples;
  const banRate =
    stats.reduce((s, st) => s + st.banRate * st.sampleSize, 0) / totalSamples;

  return {
    winRate: Math.round(adjustedWinRate * 10) / 10,
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

// ---------------------------------------------------------------------------
// Map-detail pick selectors
// ---------------------------------------------------------------------------
//
// These replace the old `pickCategory` field set by the aggregator. That
// field used a banRate threshold for the "high risk" category, but since
// banRate is hardcoded to 0 in the pipeline (we have no real ban data
// from the API), the threshold never matched and the card always fell
// back to `stats[stats.length - 1]` — i.e. the WORST brawler on the map
// got displayed as "high risk / reward." The other two categories drifted
// for similar reasons.
//
// The new selectors take the map's brawler list (already Wilson-sorted by
// the page) and pick three callouts using only data we actually have:
// observed win rate, observed pick rate, and whether the row crosses the
// real-sample threshold.
//
// Thresholds are tuning knobs — bump them if too many maps hit the empty
// fallback, lower if every map shows the same brawler in two cards.

export interface MapPickRow {
  winRate: number;
  pickRate: number;
  sampleSize: number;
  isReal: boolean;
}

/**
 * "Best first pick" — top of the map's Wilson-sorted list, restricted to
 * brawlers with a real sample. Falls back to stats[0] only if no brawler
 * on the map has crossed MIN_SAMPLE yet (fresh maps in the rotation).
 *
 * Returns null only if the map has zero brawler rows at all.
 */
export function pickFirstPick<T extends MapPickRow>(stats: T[]): T | null {
  return stats.find((s) => s.isReal) ?? stats[0] ?? null;
}

/**
 * "Safest pick" — the consensus call. Above-average win rate AND popular
 * enough that the result isn't a curiosity. Both checks matter:
 *   - high WR + low pick = niche meta call ("high risk / reward" territory)
 *   - high pick + low WR = popular trap, not safe
 * Among brawlers that pass both, the most-picked is the one the
 * community has converged on as a reliable choice.
 *
 * Returns null if no brawler on this map qualifies — preferable to faking
 * a "safe pick" we can't actually back with data.
 */
export function pickSafest<T extends MapPickRow>(stats: T[]): T | null {
  const candidates = stats.filter(
    (s) => s.isReal && s.winRate >= 51 && s.pickRate >= 3
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.pickRate - a.pickRate)[0];
}

/**
 * "High risk / high reward" — under-the-radar but punching above weight.
 * Low pick rate (niche / off-meta) but high observed win rate when chosen.
 * The isReal filter prevents a 3-0 statistical mirage from getting
 * promoted as a pro pick.
 *
 * Returns null if no brawler on this map qualifies.
 */
export function pickHighRiskHighReward<T extends MapPickRow>(
  stats: T[]
): T | null {
  const candidates = stats.filter(
    (s) => s.isReal && s.winRate >= 53 && s.pickRate < 3
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.winRate - a.winRate)[0];
}
