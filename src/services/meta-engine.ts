import { prisma } from "@/lib/prisma";
import { getTier } from "@/lib/constants";
import { aggregateBrawlerStats } from "@/lib/stats-utils";
import type { MetaOverview, MetaSnapshot } from "@/types/meta";

/**
 * Get the current meta overview aggregated from the latest data.
 */
export async function getMetaOverview(): Promise<MetaOverview> {
  const brawlers = await prisma.brawler.findMany({
    include: {
      mapStats: {
        orderBy: { computedAt: "desc" },
        take: 1,
      },
    },
  });

  // Aggregate stats across all maps for each brawler (weighted by sampleSize)
  const snapshots: MetaSnapshot[] = brawlers.map((b) => {
    const agg = aggregateBrawlerStats(b.mapStats);

    return {
      brawlerId: b.id,
      brawlerName: b.name,
      winRate: agg.winRate,
      pickRate: agg.pickRate,
      banRate: agg.banRate,
      tier: getTier(agg.winRate),
      snapshotDate: new Date().toISOString(),
    };
  });

  const sorted = [...snapshots].sort((a, b) => b.winRate - a.winRate);
  const avgWinRate =
    snapshots.length > 0
      ? snapshots.reduce((s, sn) => s + sn.winRate, 0) / snapshots.length
      : 50;

  const mostBanned = [...snapshots].sort((a, b) => b.banRate - a.banRate)[0];
  const mostPicked = [...snapshots].sort((a, b) => b.pickRate - a.pickRate)[0];

  return {
    totalBrawlers: brawlers.length,
    avgWinRate: Math.round(avgWinRate * 10) / 10,
    mostBanned: mostBanned
      ? { name: mostBanned.brawlerName, banRate: mostBanned.banRate }
      : { name: "N/A", banRate: 0 },
    mostPicked: mostPicked
      ? { name: mostPicked.brawlerName, pickRate: mostPicked.pickRate }
      : { name: "N/A", pickRate: 0 },
    topWinRates: sorted.slice(0, 10),
    topPicked: [...snapshots]
      .sort((a, b) => b.pickRate - a.pickRate)
      .slice(0, 5),
    topBanned: [...snapshots]
      .sort((a, b) => b.banRate - a.banRate)
      .slice(0, 5),
  };
}

/**
 * Record a daily meta snapshot for all brawlers.
 * Called by the daily cron job.
 */
export async function recordMetaSnapshot(): Promise<void> {
  const overview = await getMetaOverview();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const snap of overview.topWinRates) {
    await prisma.metaSnapshot.upsert({
      where: {
        brawlerId_snapshotDate: {
          brawlerId: snap.brawlerId,
          snapshotDate: today,
        },
      },
      update: {
        winRate: snap.winRate,
        pickRate: snap.pickRate,
        banRate: snap.banRate,
        tier: snap.tier,
      },
      create: {
        brawlerId: snap.brawlerId,
        winRate: snap.winRate,
        pickRate: snap.pickRate,
        banRate: snap.banRate,
        tier: snap.tier,
        snapshotDate: today,
      },
    });
  }
}

/**
 * Get historical meta trend for a specific brawler.
 */
export async function getBrawlerTrend(
  brawlerId: string,
  days = 30
): Promise<MetaSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.metaSnapshot.findMany({
    where: {
      brawlerId,
      snapshotDate: { gte: since },
    },
    include: { brawler: true },
    orderBy: { snapshotDate: "asc" },
  });

  return snapshots.map((s) => ({
    brawlerId: s.brawlerId,
    brawlerName: s.brawler.name,
    winRate: s.winRate,
    pickRate: s.pickRate,
    banRate: s.banRate,
    tier: s.tier as any,
    snapshotDate: s.snapshotDate.toISOString(),
  }));
}
