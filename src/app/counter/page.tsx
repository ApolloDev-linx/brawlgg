import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";
import { safeTier } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import { CounterPicker } from "@/components/counter/CounterPicker";

async function getBrawlers() {
  return cached("brawlers:all-with-stats:v2", CACHE_TTL.BRAWLERS, async () => {
    // Reads from BrawlerStat (computed from raw BattleRecord), not from
    // averaging MapBrawlerStat. Avoids the map-filtering bias that was
    // silently affecting which counters showed up as recommended picks.
    const brawlers = await getAllBrawlerSummaries();

    return brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      role: b.role,
      type: b.type as any,
      hp: b.hp,
      iconUrl: b.iconUrl,
      winRate: b.winRate,
      pickRate: b.pickRate,
      banRate: b.banRate,
      // safeTier: consistent across dashboard / draft / counter / analyzer
      // so a brawler's tier badge is the same badge everywhere it appears.
      tier: safeTier(b.winRate, b.totalBattles),
    }));
  });
}

export default async function CounterPage() {
  let brawlers: Awaited<ReturnType<typeof getBrawlers>>;

  try {
    brawlers = await getBrawlers();
  } catch {
    brawlers = [];
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Counter system</h1>
        <p className="text-sm text-text-secondary">
          Select enemy brawlers to find optimal counters based on competitive
          matchup logic
        </p>
      </div>

      {brawlers.length === 0 ? (
        <div className="bg-bg-secondary rounded-xl p-8 text-center text-sm text-text-secondary">
          No brawler data. Run{" "}
          <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs font-mono">
            npm run db:seed
          </code>{" "}
          first.
        </div>
      ) : (
        <CounterPicker brawlers={brawlers} />
      )}
    </div>
  );
}
