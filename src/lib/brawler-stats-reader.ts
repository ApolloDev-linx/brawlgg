/**
 * brawler-stats-reader.ts
 *
 * Single read path for brawler-level stats used by the dashboard, counter
 * picker, draft simulator, and analyzer.
 *
 * Reads from BrawlerStat (which is computed from raw BattleRecord) instead
 * of averaging MapBrawlerStat rows. This avoids the map-filtering bias
 * where battles on maps not in our Map table get dropped from per-map
 * aggregation but should still count toward a brawler's overall WR.
 *
 * The same Bayesian prior shrinkage we use elsewhere is applied here so
 * brand-new brawlers with tiny samples don't top dashboards with fake
 * 100% WRs.
 */

import { prisma } from "@/lib/prisma";

export interface BrawlerSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  hp: number;
  iconUrl: string | null;
  winRate: number;     // shrunk via prior
  pickRate: number;    // raw, no shrinkage
  banRate: number;
  totalBattles: number;
  isReal: boolean;
}

const DEFAULT_PRIOR_GAMES = 50;

function shrinkWinRate(wins: number, total: number, prior: number): number {
  if (total + prior === 0) return 50;
  const adjusted = ((wins + prior / 2) / (total + prior)) * 100;
  return Math.round(adjusted * 10) / 10;
}

/**
 * Pull every brawler with their canonical stat row, optionally with the
 * Bayesian prior applied. Pass `prior = 0` for raw numbers (debug pages).
 */
export async function getAllBrawlerSummaries(
  prior: number = DEFAULT_PRIOR_GAMES
): Promise<BrawlerSummary[]> {
  const brawlers = await prisma.brawler.findMany({
    include: { stat: true },
    orderBy: { name: "asc" },
  });

  return brawlers.map((b) => {
    const s = b.stat;
    const wins = s?.totalWins ?? 0;
    const total = s?.totalBattles ?? 0;
    const winRate = total > 0 ? shrinkWinRate(wins, total, prior) : 50;

    return {
      id: b.id,
      name: b.name,
      type: b.type,
      role: b.role,
      hp: b.hp,
      iconUrl: b.iconUrl,
      winRate,
      pickRate: s?.pickRate ?? 0,
      banRate: s?.banRate ?? 0,
      totalBattles: total,
      isReal: s?.isReal ?? false,
    };
  });
}
