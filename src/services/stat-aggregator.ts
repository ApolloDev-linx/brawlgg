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

  // Group: mapName → brawlerName → { wins, total }
  const grouped = new Map<string, Map<string, { wins: number; total: number; brawlerId: string | null }>>();

  for (const b of battles) {
    if (!grouped.has(b.mapName)) grouped.set(b.mapName, new Map());
    const mapGroup = grouped.get(b.mapName)!;

    if (!mapGroup.has(b.brawlerName)) {
      mapGroup.set(b.brawlerName, { wins: 0, total: 0, brawlerId: b.brawlerId });
    }
    const entry = mapGroup.get(b.brawlerName)!;
    entry.total++;
    if (b.result === "victory") entry.wins++;
    if (!entry.brawlerId && b.brawlerId) entry.brawlerId = b.brawlerId;
  }

  // Load our map records to match by name
  const dbMaps = await prisma.map.findMany({ select: { id: true, name: true } });
  const mapIdByName = new Map<string, string>();
  for (const m of dbMaps) mapIdByName.set(m.name.toLowerCase(), m.id);

  // Load brawler records for fallback name→id resolution
  const dbBrawlers = await prisma.brawler.findMany({ select: { id: true, name: true } });
  const brawlerIdByName = new Map<string, string>();
  for (const b of dbBrawlers) brawlerIdByName.set(b.name.toLowerCase(), b.id);

  const processedMaps = new Set<string>();

  for (const [mapName, brawlerMap] of grouped) {
    const mapId = mapIdByName.get(mapName.toLowerCase());
    if (!mapId) continue; // map not in our DB yet — skip

    processedMaps.add(mapName);

    // Compute total picks on this map to derive pick rates
    const totalPicksOnMap = Array.from(brawlerMap.values()).reduce(
      (s, v) => s + v.total,
      0
    );

    for (const [brawlerName, stats] of brawlerMap) {
      const brawlerId =
        stats.brawlerId ?? brawlerIdByName.get(brawlerName.toLowerCase()) ?? null;
      if (!brawlerId) continue; // can't link to a known brawler

      const winRate = stats.total > 0
        ? Math.round((stats.wins / stats.total) * 1000) / 10
        : 50;

      const pickRate = totalPicksOnMap > 0
        ? Math.round((stats.total / totalPicksOnMap) * 1000) / 10
        : 0;

      // We don't have ban data from battle logs — keep existing ban rate if isReal already
      // or leave at 0 until we have a real source
      const isReal = stats.total >= MIN_SAMPLE;
      const tier = getTier(winRate);
      const pickCategory = getPickCategory(winRate, pickRate, 0);

      try {
        const existing = await prisma.mapBrawlerStat.findUnique({
          where: { mapId_brawlerId: { mapId, brawlerId } },
        });

        if (existing) {
          // Only overwrite simulated stats OR update existing real stats
          if (!existing.isReal || isReal) {
            await prisma.mapBrawlerStat.update({
              where: { mapId_brawlerId: { mapId, brawlerId } },
              data: {
                winRate,
                pickRate,
                // preserve existing banRate if we don't have real data for it
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
      } catch (err) {
        // continue on individual failures
      }
    }
  }

  result.mapsProcessed = processedMaps.size;
  return result;
}
