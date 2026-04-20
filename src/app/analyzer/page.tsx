import { cached } from "@/lib/redis";
import { CACHE_TTL, TYPE_COLORS, TYPE_LABELS, TIER_COLORS, COUNTER_MATRIX } from "@/lib/constants";
import { safeTier } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import { AnalyzerClient } from "@/components/dashboard/AnalyzerClient";

async function getAnalyzerData() {
  return cached("analyzer:data:v2", CACHE_TTL.META, async () => {
    // Reads from BrawlerStat (computed from raw BattleRecord), not from
    // averaging MapBrawlerStat. Avoids the map-filtering bias that was
    // tilting type/tier distributions and brawler deep-dive numbers.
    const brawlers = await getAllBrawlerSummaries();

    return brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      role: b.role,
      type: b.type,
      hp: b.hp,
      winRate: b.winRate,
      pickRate: b.pickRate,
      // safeTier: kept in lockstep with the other pages so the tier
      // distribution chart shows a consistent view of S/A/B/C counts.
      tier: safeTier(b.winRate, b.totalBattles),
    }));
  });
}

export default async function AnalyzerPage() {
  let brawlers: Awaited<ReturnType<typeof getAnalyzerData>>;

  try {
    brawlers = await getAnalyzerData();
  } catch {
    brawlers = [];
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Meta analyzer</h1>
        <p className="text-sm text-text-secondary">
          Deep analysis of brawler types, tiers, and matchup dynamics
        </p>
      </div>

      {brawlers.length === 0 ? (
        <div className="bg-bg-secondary rounded-xl p-8 text-center text-sm text-text-secondary">
          No data. Run{" "}
          <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs font-mono">
            npm run db:seed
          </code>{" "}
          first.
        </div>
      ) : (
        <AnalyzerClient brawlers={brawlers} />
      )}
    </div>
  );
}
