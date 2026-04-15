/**
 * Recompute win rates and tier assignments.
 * Run every 2 hours via cron.
 *
 * In production, this would pull from match data.
 * For now it recalculates tiers from existing map stats.
 */

import { PrismaClient } from "@prisma/client";

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

    // Group by brawler
    const brawlerStats: Record<
      string,
      { wins: number[]; picks: number[]; bans: number[] }
    > = {};

    for (const s of stats) {
      if (!brawlerStats[s.brawlerId]) {
        brawlerStats[s.brawlerId] = { wins: [], picks: [], bans: [] };
      }
      brawlerStats[s.brawlerId].wins.push(s.winRate);
      brawlerStats[s.brawlerId].picks.push(s.pickRate);
      brawlerStats[s.brawlerId].bans.push(s.banRate);
    }

    // Update tiers in map stats
    for (const [brawlerId, data] of Object.entries(brawlerStats)) {
      const avgWin =
        data.wins.reduce((s, v) => s + v, 0) / data.wins.length;
      const tier = getTier(avgWin);

      await prisma.mapBrawlerStat.updateMany({
        where: { brawlerId },
        data: { tier },
      });
    }

    // Record daily snapshot
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [brawlerId, data] of Object.entries(brawlerStats)) {
      const avgWin =
        data.wins.reduce((s, v) => s + v, 0) / data.wins.length;
      const avgPick =
        data.picks.reduce((s, v) => s + v, 0) / data.picks.length;
      const avgBan =
        data.bans.reduce((s, v) => s + v, 0) / data.bans.length;

      await prisma.metaSnapshot.upsert({
        where: {
          brawlerId_snapshotDate: { brawlerId, snapshotDate: today },
        },
        update: {
          winRate: Math.round(avgWin * 10) / 10,
          pickRate: Math.round(avgPick * 10) / 10,
          banRate: Math.round(avgBan * 10) / 10,
          tier: getTier(avgWin),
        },
        create: {
          brawlerId,
          winRate: Math.round(avgWin * 10) / 10,
          pickRate: Math.round(avgPick * 10) / 10,
          banRate: Math.round(avgBan * 10) / 10,
          tier: getTier(avgWin),
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
