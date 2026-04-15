import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, getTier } from "@/lib/constants";

export async function GET() {
  try {
    const data = await cached("api:brawlers", CACHE_TTL.BRAWLERS, async () => {
      const brawlers = await prisma.brawler.findMany({
        include: {
          mapStats: true,
          counterAs: {
            include: { counter: true },
            orderBy: { advantageScore: "desc" },
            take: 5,
          },
        },
        orderBy: { name: "asc" },
      });

      return brawlers.map((b) => {
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
          type: b.type,
          hp: b.hp,
          iconUrl: b.iconUrl,
          winRate: Math.round(avgWin * 10) / 10,
          pickRate: Math.round(avgPick * 10) / 10,
          banRate: Math.round(avgBan * 10) / 10,
          tier: getTier(avgWin),
          counters: b.counterAs.map((c) => ({
            name: c.counter.name,
            score: c.advantageScore,
            reason: c.reason,
          })),
        };
      });
    });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch brawlers", detail: error.message },
      { status: 500 }
    );
  }
}
