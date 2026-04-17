import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCounters } from "@/services/counter-engine";
import { getTier } from "@/lib/constants";
import type { BrawlerWithStats } from "@/types/brawler";

export const dynamic = "force-dynamic";


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enemyIds } = body as { enemyIds: string[] };

    if (!enemyIds || !Array.isArray(enemyIds) || enemyIds.length === 0) {
      return NextResponse.json(
        { error: "enemyIds must be a non-empty array of brawler IDs" },
        { status: 400 }
      );
    }

    const allBrawlers = await prisma.brawler.findMany({
      include: { mapStats: true },
    });

    const brawlersWithStats: BrawlerWithStats[] = allBrawlers.map((b) => {
      const stats = b.mapStats;
      const avgWin =
        stats.length > 0
          ? stats.reduce((s, st) => s + st.winRate, 0) / stats.length
          : 50;
      const avgPick =
        stats.length > 0
          ? stats.reduce((s, st) => s + st.pickRate, 0) / stats.length
          : 0;
      const avgBan =
        stats.length > 0
          ? stats.reduce((s, st) => s + st.banRate, 0) / stats.length
          : 0;

      return {
        id: b.id,
        name: b.name,
        role: b.role,
        type: b.type as any,
        hp: b.hp,
        iconUrl: b.iconUrl,
        winRate: Math.round(avgWin * 10) / 10,
        pickRate: Math.round(avgPick * 10) / 10,
        banRate: Math.round(avgBan * 10) / 10,
        tier: getTier(avgWin),
      };
    });

    const enemies = brawlersWithStats.filter((b) => enemyIds.includes(b.id));

    if (enemies.length === 0) {
      return NextResponse.json(
        { error: "No valid enemy brawler IDs provided" },
        { status: 400 }
      );
    }

    const counters = computeCounters(enemies, brawlersWithStats).slice(0, 10);

    return NextResponse.json({ counters });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to compute counters", detail: error.message },
      { status: 500 }
    );
  }
}
