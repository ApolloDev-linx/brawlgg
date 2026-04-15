import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, getTier, TYPE_COLORS, TYPE_LABELS, TIER_COLORS, COUNTER_MATRIX } from "@/lib/constants";
import { AnalyzerClient } from "@/components/dashboard/AnalyzerClient";

async function getAnalyzerData() {
  return cached("analyzer:data", CACHE_TTL.META, async () => {
    const brawlers = await prisma.brawler.findMany({
      include: { mapStats: true },
      orderBy: { name: "asc" },
    });

    return brawlers.map((b) => {
      const stats = b.mapStats;
      const avgWin = stats.length > 0 ? stats.reduce((s, st) => s + st.winRate, 0) / stats.length : 50;
      const avgPick = stats.length > 0 ? stats.reduce((s, st) => s + st.pickRate, 0) / stats.length : 0;
      const avgBan = stats.length > 0 ? stats.reduce((s, st) => s + st.banRate, 0) / stats.length : 0;

      return {
        id: b.id,
        name: b.name,
        role: b.role,
        type: b.type,
        hp: b.hp,
        winRate: Math.round(avgWin * 10) / 10,
        pickRate: Math.round(avgPick * 10) / 10,
        banRate: Math.round(avgBan * 10) / 10,
        tier: getTier(avgWin),
      };
    });
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
