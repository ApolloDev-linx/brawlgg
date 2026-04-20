import { NextResponse } from "next/server";
import { suggestPick, computeAdvantage } from "@/services/draft-engine";
import { getTier } from "@/lib/constants";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import type { BrawlerWithStats } from "@/types/brawler";
import type { DraftState } from "@/types/meta";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bans, myPicks, enemyPicks, currentPhase, currentTurn } =
      body as DraftState;

    // Reads from BrawlerStat (no map-filtering bias). The draft engine
    // now sees the same numbers the /draft page renders on initial load,
    // so suggestions stay consistent across pick/ban turns.
    const summaries = await getAllBrawlerSummaries();

    const brawlersWithStats: BrawlerWithStats[] = summaries.map((b) => ({
      id: b.id,
      name: b.name,
      role: b.role,
      type: b.type as any,
      hp: b.hp,
      iconUrl: b.iconUrl,
      winRate: b.winRate,
      pickRate: b.pickRate,
      banRate: b.banRate,
      tier: getTier(b.winRate),
    }));

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
