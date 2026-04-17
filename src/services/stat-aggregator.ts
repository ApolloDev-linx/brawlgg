/**
 * stat-aggregator.ts
 *
 * Reads raw BattleRecord data and computes real win/pick/ban rates,
 * then updates MapBrawlerStat. Rows with enough real data (MIN_SAMPLE)
 * are marked isReal=true and replace simulated stats.
 *
 * Called by the aggregate cron job every 2 hours.
 */

import { prisma } from "@/lib/prisma";

// Minimum battles before we trust the data and mark isReal=true
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
}

export async function aggregateStats(): Promise<AggregationResult> {
  const result: AggregationResult = {
    mapsProcessed: 0,
    brawlersUpdated: 0,
    realStatsCount: 0,
    totalBattles: 0,
  };

  // Pull all battle records grouped by map + brawler
  const battles = await prisma.battleRecord.findMany({
    select: {
      mapName: true,
      brawlerName: true,
      brawlerId: true,
      result: true,
    },
  });

  result.totalBattles = battles.length;
  if (battles.length === 0) return result;

  // Group: mapName → brawlerName → { wins, total, brawlerId }
  // Using plain objects instead of Map to avoid TS downlevelIteration issues
  const grouped: Record<string, Record<string, { wins: number; total: number; brawlerId: string | null }>> = {};

  for (const b of battles) {
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

  const dbMaps = await prisma.map.findMany({ select: { id: true, name: true } });
  const mapIdByName: Record<string, string> = {};
  for (const m of dbMaps) mapIdByName[m.name.toLowerCase()] = m.id;

  const dbBrawlers = await prisma.brawler.findMany({ select: { id: true, name: true } });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) brawlerIdByName[b.name.toLowerCase()] = b.id;

  const processedMaps = new Set<string>();

  for (const mapName of Object.keys(grouped)) {
    const mapId = mapIdByName[mapName.toLowerCase()];
    if (!mapId) continue;

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
  return result;
}
