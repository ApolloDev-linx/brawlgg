import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, getTier } from "@/lib/constants";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await cached("api:brawlers", CACHE_TTL.BRAWLERS, async () => {
      // Stats come from BrawlerStat (no map-filtering bias).
      // Counter matchups are pulled separately and joined by id —
      // they live on a different relation that getAllBrawlerSummaries
      // doesn't load.
      const [summaries, brawlersWithCounters] = await Promise.all([
        getAllBrawlerSummaries(),
        prisma.brawler.findMany({
          select: {
            id: true,
            counterAs: {
              include: { counter: { select: { name: true } } },
              orderBy: { advantageScore: "desc" },
              take: 5,
            },
          },
        }),
      ]);

      const countersById = new Map(
        brawlersWithCounters.map((b) => [
          b.id,
          b.counterAs.map((c) => ({
            name: c.counter.name,
            score: c.advantageScore,
            reason: c.reason,
          })),
        ])
      );

      return summaries.map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        type: b.type,
        hp: b.hp,
        iconUrl: b.iconUrl,
        winRate: b.winRate,
        pickRate: b.pickRate,
        banRate: b.banRate,
        tier: getTier(b.winRate),
        counters: countersById.get(b.id) ?? [],
      }));
    });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch brawlers", detail: error.message },
      { status: 500 }
    );
  }
}
