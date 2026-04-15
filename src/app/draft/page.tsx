import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, getTier } from "@/lib/constants";
import { DraftBoard } from "@/components/draft/DraftBoard";

async function getBrawlers() {
  return cached("brawlers:for-draft", CACHE_TTL.BRAWLERS, async () => {
    const brawlers = await prisma.brawler.findMany({
      include: { mapStats: true },
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
        type: b.type as any,
        hp: b.hp,
        iconUrl: b.iconUrl,
        winRate: Math.round(avgWin * 10) / 10,
        pickRate: Math.round(avgPick * 10) / 10,
        banRate: Math.round(avgBan * 10) / 10,
        tier: getTier(avgWin),
      };
    });
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
