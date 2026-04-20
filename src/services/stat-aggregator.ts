/**
 * stat-aggregator.ts
 *
 * Reads raw BattleRecord data and computes real win/pick/ban rates,
 * then updates two tables:
 *
 *   1. MapBrawlerStat — per-map win/pick rates (one row per map×brawler).
 *      Powers the map meta page. Subject to map-filtering: battles whose
 *      mapName isn't in our Map table get dropped here.
 *
 *   2. BrawlerStat — overall win/pick rates per brawler (one row per
 *      brawler). Powers the dashboard / counter / draft / analyzer.
 *      Computed from raw BattleRecord with NO map filter, so the totals
 *      include battles on tracked-mode maps not in our Map table — fixes
 *      the dashboard bias where map-averaged WRs misrepresented brawlers
 *      with skewed performance on unmapped maps.
 *
 * Called by the aggregate cron job and by scripts/pipeline.ts.
 *
 * Philosophy:
 *   - BattleRecord is a raw log. The harvester stores whatever it ingests.
 *   - Aggregation filters at READ time, not write time. That way we can
 *     adjust what gets counted (add Showdown later, drop a mode, etc.)
 *     without ever re-harvesting or deleting data.
 *   - Only battles whose gameMode is in TRACKED_MODES make it into stats.
 *     Everything else stays in BattleRecord as raw data for potential
 *     future use but is excluded from the competitive meta view.
 *
 * What counts as "competitive" for our product:
 *   - Classic 3v3: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone,
 *                  Knockout, Siege
 *   - Plus:        Wipeout (3v3 variant), Duels (1v1 skill)
 *   - Excluded:    5v5/2v2 events, Showdown, novelty modes
 *
 * Note on 5v5 contamination:
 *   The Brawl Stars API returns mode="brawlBall" for both 3v3 Brawl Ball
 *   AND 5v5 Brawl Ball events (like "Insane Streamer"). There's no clean
 *   mode-level way to distinguish them. We handle this by relying on the
 *   Map table — 5v5 event maps aren't in our Map table (map-sync filters
 *   them out), so those battles naturally don't match any map row and
 *   get excluded from per-map stats. They DO still count toward overall
 *   BrawlerStat totals though, since the brawler still played them.
 */

import { prisma } from "@/lib/prisma";

// Must match COMPETITIVE_MODES in scripts/harvest.ts and
// src/services/leaderboard-harvester.ts
const TRACKED_MODES = new Set([
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
  "wipeout",
  "duels",
]);

const MIN_SAMPLE = 50;

function getTier(winRate: number): string {
  if (winRate >= 54) return "S";
  if (winRate >= 51) return "A";
  if (winRate >= 48) return "B";
  return "C";
}

function getPickCategory(
  winRate: number,
  pickRate: number,
  banRate: number
): string | null {
  if (winRate >= 54 && pickRate >= 8) return "first_pick";
  if (winRate >= 51 && banRate < 3) return "safe";
  if (winRate >= 53 && banRate >= 5) return "high_risk";
  return null;
}

export interface AggregationResult {
  mapsProcessed: number;
  brawlersUpdated: number;
  realStatsCount: number;
  totalBattles: number;
  /** Battles that passed mode filtering and mapped to a known Map row. */
  battlesCounted: number;
  /** Battles whose gameMode isn't in our tracked list (5v5, novelty, etc.) */
  battlesExcludedByMode: number;
  /** Battles with a tracked mode but a mapName we don't have in the Map table. */
  battlesExcludedByMap: number;
  /** Top 10 excluded (mode, map, count) for diagnostics. */
  excludedModesBreakdown: { mode: string; count: number }[];
}

export async function aggregateStats(): Promise<AggregationResult> {
  const result: AggregationResult = {
    mapsProcessed: 0,
    brawlersUpdated: 0,
    realStatsCount: 0,
    totalBattles: 0,
    battlesCounted: 0,
    battlesExcludedByMode: 0,
    battlesExcludedByMap: 0,
    excludedModesBreakdown: [],
  };

  // Pull everything — gameMode now included so we can filter at read time.
  const battles = await prisma.battleRecord.findMany({
    select: {
      mapName: true,
      gameMode: true,
      brawlerName: true,
      brawlerId: true,
      result: true,
    },
  });
  result.totalBattles = battles.length;
  if (battles.length === 0) return result;

  // Track exclusion reasons so the debug pages can explain the gap.
  const excludedByMode: Record<string, number> = {};

  // Group: mapName → brawlerName → { wins, total, brawlerId }
  // Only includes battles whose gameMode is in TRACKED_MODES.
  const grouped: Record <
    string,
    Record<string, { wins: number; total: number; brawlerId: string | null }>
  > = {};

  for (const b of battles) {
    // Filter 1: mode allowlist
    if (!TRACKED_MODES.has(b.gameMode)) {
      result.battlesExcludedByMode++;
      excludedByMode[b.gameMode] = (excludedByMode[b.gameMode] ?? 0) + 1;
      continue;
    }

    if (!grouped[b.mapName]) grouped[b.mapName] = {};
    const mapGroup = grouped[b.mapName];
    if (!mapGroup[b.brawlerName]) {
      mapGroup[b.brawlerName] = { wins: 0, total: 0, brawlerId: b.brawlerId };
    }
    const entry = mapGroup[b.brawlerName];
    entry.total++;
    if (b.result === "victory") entry.wins++;
    if (!entry.brawlerId && b.brawlerId) entry.brawlerId = b.brawlerId;
  }

  // Build breakdown sorted by count desc, top 10
  result.excludedModesBreakdown = Object.entries(excludedByMode)
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dbMaps = await prisma.map.findMany({ select: { id: true, name: true } });
  const mapIdByName: Record<string, string> = {};
  for (const m of dbMaps) mapIdByName[m.name.toLowerCase()] = m.id;

  const dbBrawlers = await prisma.brawler.findMany({ select: { id: true, name: true } });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) brawlerIdByName[b.name.toLowerCase()] = b.id;

  const processedMaps = new Set<string>();

  for (const mapName of Object.keys(grouped)) {
    const mapId = mapIdByName[mapName.toLowerCase()];
    if (!mapId) {
      // Count battles on unmatched maps toward the by-map exclusion tally
      const brawlerMap = grouped[mapName];
      for (const bname of Object.keys(brawlerMap)) {
        result.battlesExcludedByMap += brawlerMap[bname].total;
      }
      continue;
    }

    processedMaps.add(mapName);
    const brawlerMap = grouped[mapName];

    const totalPicksOnMap = Object.values(brawlerMap).reduce(
      (s, v) => s + v.total,
      0
    );

    for (const brawlerName of Object.keys(brawlerMap)) {
      const stats = brawlerMap[brawlerName];
      const brawlerId =
        stats.brawlerId ?? brawlerIdByName[brawlerName.toLowerCase()] ?? null;

      if (!brawlerId) continue;

      const winRate = stats.total > 0
        ? Math.round((stats.wins / stats.total) * 1000) / 10
        : 50;

      const pickRate = totalPicksOnMap > 0
        ? Math.round((stats.total / totalPicksOnMap) * 1000) / 10
        : 0;

      const isReal = stats.total >= MIN_SAMPLE;
      const tier = getTier(winRate);
      const pickCategory = getPickCategory(winRate, pickRate, 0);

      result.battlesCounted += stats.total;

      try {
        const existing = await prisma.mapBrawlerStat.findUnique({
          where: { mapId_brawlerId: { mapId, brawlerId } },
        });

        if (existing) {
          if (!existing.isReal || isReal) {
            await prisma.mapBrawlerStat.update({
              where: { mapId_brawlerId: { mapId, brawlerId } },
              data: {
                winRate,
                pickRate,
                banRate: existing.isReal ? existing.banRate : 0,
                tier,
                pickCategory,
                sampleSize: stats.total,
                isReal,
                computedAt: new Date(),
              },
            });
            result.brawlersUpdated++;
            if (isReal) result.realStatsCount++;
          }
        } else {
          await prisma.mapBrawlerStat.create({
            data: {
              mapId,
              brawlerId,
              winRate,
              pickRate,
              banRate: 0,
              tier,
              pickCategory,
              sampleSize: stats.total,
              isReal,
            },
          });
          result.brawlersUpdated++;
          if (isReal) result.realStatsCount++;
        }
      } catch {
        // continue on individual failures
      }
    }
  }

  result.mapsProcessed = processedMaps.size;

  // Compute brawler-level totals from raw BattleRecord (no map filtering).
  // Powers the dashboard, counter, draft, and analyzer pages — separate
  // from the per-map MapBrawlerStat work above. Cheap (~1-2s).
  await computeBrawlerStats();

  return result;
}

/**
 * Compute brawler-level totals directly from BattleRecord.
 *
 * Why this exists separately from per-map aggregation:
 *   - Per-map (MapBrawlerStat) drops battles whose mapName isn't in
 *     our Map table — currently ~18% of data
 *   - Averaging MapBrawlerStat rows weighted by sampleSize then INHERITS
 *     that bias, so a brawler that performs differently on
 *     unmapped-but-tracked maps shows up wrong on the dashboard
 *   - This function pools EVERY tracked-mode battle, no map filtering,
 *     so the dashboard / counter / draft / analyzer see honest numbers
 *
 * Run after the per-map aggregation in the same pass.
 */
export async function computeBrawlerStats(): Promise<{
  brawlersUpdated: number;
  realStatsCount: number;
}> {
  const battlesByBrawler = await prisma.battleRecord.groupBy({
    by: ["brawlerName"],
    _count: { _all: true },
    where: { gameMode: { in: Array.from(TRACKED_MODES) } },
  });

  const winsByBrawler = await prisma.battleRecord.groupBy({
    by: ["brawlerName"],
    _count: { _all: true },
    where: {
      gameMode: { in: Array.from(TRACKED_MODES) },
      result: "victory",
    },
  });

  const totalsByName = new Map<string, { battles: number; wins: number }>();
  for (const r of battlesByBrawler) {
    totalsByName.set(r.brawlerName, { battles: r._count._all, wins: 0 });
  }
  for (const r of winsByBrawler) {
    const existing = totalsByName.get(r.brawlerName);
    if (existing) existing.wins = r._count._all;
  }

  // Total tracked-mode battles across all brawlers — denominator for pickRate
  const totalTrackedBattles = Array.from(totalsByName.values()).reduce(
    (s, v) => s + v.battles,
    0
  );

  const brawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });

  // Lookup by lowercased name (the canonicalization layer means brawlerName
  // in BattleRecord and name in Brawler should agree case-insensitively).
  const battleByLowerName = new Map<string, { battles: number; wins: number }>();
  for (const [name, totals] of totalsByName) {
    battleByLowerName.set(name.toLowerCase(), totals);
  }

  let brawlersUpdated = 0;
  let realStatsCount = 0;

  for (const b of brawlers) {
    const totals = battleByLowerName.get(b.name.toLowerCase()) ?? {
      battles: 0,
      wins: 0,
    };
    const winRate =
      totals.battles > 0
        ? Math.round((totals.wins / totals.battles) * 1000) / 10
        : 50;
    const pickRate =
      totalTrackedBattles > 0
        ? Math.round((totals.battles / totalTrackedBattles) * 1000) / 10
        : 0;
    const isReal = totals.battles >= MIN_SAMPLE;
    if (isReal) realStatsCount++;

    await prisma.brawlerStat.upsert({
      where: { brawlerId: b.id },
      update: {
        totalBattles: totals.battles,
        totalWins: totals.wins,
        winRate,
        pickRate,
        banRate: 0, // placeholder until we add real ban data
        isReal,
        computedAt: new Date(),
      },
      create: {
        brawlerId: b.id,
        totalBattles: totals.battles,
        totalWins: totals.wins,
        winRate,
        pickRate,
        banRate: 0,
        isReal,
      },
    });
    brawlersUpdated++;
  }

  return { brawlersUpdated, realStatsCount };
}
