import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suggestPick, computeAdvantage } from "@/services/draft-engine";
import { getTier } from "@/lib/constants";
import { aggregateBrawlerStats } from "@/lib/stats-utils";
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
      const agg = aggregateBrawlerStats(b.mapStats);

      return {
        id: b.id,
        name: b.name,
        role: b.role,
        type: b.type as any,
        hp: b.hp,
        iconUrl: b.iconUrl,
        winRate: agg.winRate,
        pickRate: agg.pickRate,
        banRate: agg.banRate,
        tier: getTier(agg.winRate),
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
