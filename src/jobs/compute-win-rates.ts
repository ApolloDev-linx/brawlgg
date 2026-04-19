/**
 * Recompute win rates and tier assignments.
 * Run every 2 hours via cron.
 *
 * Pulls per-map stats, weights them by sampleSize to get a correct
 * brawler-level win rate, then updates tier and writes a daily snapshot.
 */

import { PrismaClient } from "@prisma/client";
import { aggregateBrawlerStats, WeightedStat } from "@/lib/stats-utils";

const prisma = new PrismaClient();

function getTier(winRate: number): string {
  if (winRate >= 54) return "S";
  if (winRate >= 51) return "A";
  if (winRate >= 48) return "B";
  return "C";
}

export async function computeWinRates() {
  console.log("[compute-win-rates] Starting...");

  try {
    const stats = await prisma.mapBrawlerStat.findMany();

    // Group per-map rows by brawler, keeping sampleSize so we can weight
    const brawlerStats: Record<string, WeightedStat[]> = {};

    for (const s of stats) {
      if (!brawlerStats[s.brawlerId]) brawlerStats[s.brawlerId] = [];
      brawlerStats[s.brawlerId].push({
        winRate: s.winRate,
        pickRate: s.pickRate,
        banRate: s.banRate,
        sampleSize: s.sampleSize,
      });
    }

    // Update tiers in map stats using weighted brawler-level win rate
    for (const [brawlerId, rows] of Object.entries(brawlerStats)) {
      const agg = aggregateBrawlerStats(rows);
      const tier = getTier(agg.winRate);

      await prisma.mapBrawlerStat.updateMany({
        where: { brawlerId },
        data: { tier },
      });
    }

    // Record daily snapshot
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [brawlerId, rows] of Object.entries(brawlerStats)) {
      const agg = aggregateBrawlerStats(rows);

      await prisma.metaSnapshot.upsert({
        where: {
          brawlerId_snapshotDate: { brawlerId, snapshotDate: today },
        },
        update: {
          winRate: agg.winRate,
          pickRate: agg.pickRate,
          banRate: agg.banRate,
          tier: getTier(agg.winRate),
        },
        create: {
          brawlerId,
          winRate: agg.winRate,
          pickRate: agg.pickRate,
          banRate: agg.banRate,
          tier: getTier(agg.winRate),
          snapshotDate: today,
        },
      });
    }

    console.log(
      `[compute-win-rates] Updated ${Object.keys(brawlerStats).length} brawlers`
    );
  } catch (error) {
    console.error("[compute-win-rates] Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  computeWinRates();
}
