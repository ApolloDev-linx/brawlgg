import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  syncBrawlerData,
  syncCounterMatchups,
  syncMapBrawlerStats,
} from "@/services/brawler-sync";
import { syncMaps } from "@/services/map-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const start = Date.now();

  try {
    // 1. Brawlers (and counter matchups + per-map stat seeds if new brawlers)
    const brawlerResult = await syncBrawlerData(prisma);
    let matchups = 0;
    let stats = 0;
    if (brawlerResult.created > 0) {
      const matchupResult = await syncCounterMatchups(prisma);
      matchups = matchupResult.total;
      stats = await syncMapBrawlerStats(prisma);
    }

    // 2. Maps — must run before aggregate cron so new maps aren't dropped
    //    by the map-filter step in stat-aggregator. Previously this only
    //    ran via scripts/pipeline.ts locally, which meant prod's Map
    //    table drifted out of date and battles silently went unmatched.
    const mapResult = await syncMaps(prisma);

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - start,
      brawlers: {
        source: brawlerResult.source,
        total: brawlerResult.total,
        created: brawlerResult.created,
        updated: brawlerResult.updated,
      },
      maps: {
        fetched: mapResult.fetched,
        tracked: mapResult.filteredIn,
        created: mapResult.created,
        updated: mapResult.updated,
        skipped: mapResult.skipped,
        untrackedModes: mapResult.unmatchedModes,
      },
      matchups,
      stats,
      errors: [...brawlerResult.errors, ...mapResult.errors],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - start },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
