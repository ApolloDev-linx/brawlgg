import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suggestPick, computeAdvantage } from "@/services/draft-engine";
import { getTier } from "@/lib/constants";
import type { BrawlerWithStats } from "@/types/brawler";
import type { DraftState } from "@/types/meta";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bans, myPicks, enemyPicks, currentPhase, currentTurn } =
      body as DraftState;

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

    const draftState: DraftState = {
      bans: bans || [],
      myPicks: myPicks || [],
      enemyPicks: enemyPicks || [],
      currentPhase: currentPhase || "ban",
      currentTurn: currentTurn || "my",
    };

    const suggestions = suggestPick(draftState, brawlersWithStats);

    const myBrawlers = draftState.myPicks
      .map((id) => brawlersWithStats.find((b) => b.id === id))
      .filter(Boolean) as BrawlerWithStats[];
    const enemyBrawlers = draftState.enemyPicks
      .map((id) => brawlersWithStats.find((b) => b.id === id))
      .filter(Boolean) as BrawlerWithStats[];

    const advantage = computeAdvantage(myBrawlers, enemyBrawlers);

    return NextResponse.json({ suggestions, advantage });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to compute suggestions", detail: error.message },
      { status: 500 }
    );
  }
}
