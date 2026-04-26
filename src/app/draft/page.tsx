import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";
import { safeTier } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import { DraftBoard } from "@/components/draft/DraftBoard";

async function getBrawlers() {
  return cached("brawlers:for-draft:v2", CACHE_TTL.BRAWLERS, async () => {
    // Reads from BrawlerStat (computed from raw BattleRecord), not from
    // averaging MapBrawlerStat. Avoids the map-filtering bias that was
    // skewing draft suggestions toward brawlers with unmapped-game distortion.
    const brawlers = await getAllBrawlerSummaries();

    return brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      role: b.role,
      type: b.type as any,
      hp: b.hp,
      iconUrl: b.iconUrl,
      externalId: b.externalId,
      winRate: b.winRate,
      pickRate: b.pickRate,
      banRate: b.banRate,
      // safeTier: S requires ≥1000 battles. Stops a 500-battle 54.6% brawler
      // (Jae-Yong, Mr. P, etc.) from inheriting the same loud badge as
      // confirmed-meta brawlers with 2000+ battles (Mandy, Nani).
      tier: safeTier(b.winRate, b.totalBattles),
    }));
  });
}

export default async function DraftPage() {
  let brawlers: Awaited<ReturnType<typeof getBrawlers>>;

  try {
    brawlers = await getBrawlers();
  } catch {
    brawlers = [];
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Draft simulator</h1>
        <p className="text-sm text-text-secondary">
          Simulate ranked draft with AI-powered pick and ban suggestions
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
        <DraftBoard brawlers={brawlers} />
      )}
    </div>
  );
}
