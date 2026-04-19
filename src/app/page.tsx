import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, TIER_COLORS, TYPE_COLORS, TYPE_LABELS } from "@/lib/constants";
import { getTier } from "@/lib/constants";
import { aggregateBrawlerStats } from "@/lib/stats-utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface BrawlerSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: string;
}

async function getDashboardData() {
  return cached("dashboard:overview", CACHE_TTL.META, async () => {
    const brawlers = await prisma.brawler.findMany({
      include: {
        mapStats: true,
      },
    });

    const summaries: BrawlerSummary[] = brawlers.map((b) => {
      const agg = aggregateBrawlerStats(b.mapStats);

      return {
        id: b.id,
        name: b.name,
        type: b.type,
        role: b.role,
        winRate: agg.winRate,
        pickRate: agg.pickRate,
        banRate: agg.banRate,
        tier: getTier(agg.winRate),
      };
    });

    const mapCount = await prisma.map.count({ where: { active: true } });

    return { summaries, mapCount };
  });
}

export default async function DashboardPage() {
  let data: { summaries: BrawlerSummary[]; mapCount: number };

  try {
    data = await getDashboardData();
  } catch {
    // Fallback when DB is not connected
    data = { summaries: [], mapCount: 0 };
  }

  const { summaries, mapCount } = data;
  const topWinRate = [...summaries].sort((a, b) => b.winRate - a.winRate).slice(0, 8);
  const topPicked = [...summaries].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);
  const topBanned = [...summaries].sort((a, b) => b.banRate - a.banRate).slice(0, 5);
  const avgWin = summaries.length > 0
    ? Math.round((summaries.reduce((s, b) => s + b.winRate, 0) / summaries.length) * 10) / 10
    : 0;
  const mostBanned = topBanned[0];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Meta overview</h1>
        <p className="text-sm text-text-secondary">
          Current season competitive statistics
        </p>
      </div>

      {summaries.length === 0 ? (
        <div className="bg-bg-secondary rounded-xl p-8 text-center">
          <p className="text-text-secondary text-sm mb-2">
            No data loaded yet. Run the seed command to populate the database:
          </p>
          <code className="text-xs bg-bg-tertiary px-3 py-1.5 rounded-md font-mono">
            npm run db:seed
          </code>
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-bg-secondary rounded-lg p-4">
              <div className="text-xs text-text-secondary mb-1">Active brawlers</div>
              <div className="text-xl font-medium">{summaries.length}</div>
              <div className="text-[11px] text-text-tertiary">in current meta</div>
            </div>
            <div className="bg-bg-secondary rounded-lg p-4">
              <div className="text-xs text-text-secondary mb-1">Avg win rate</div>
              <div className="text-xl font-medium" style={{ color: "#5DCAA5" }}>
                {avgWin}%
              </div>
            </div>
            <div className="bg-bg-secondary rounded-lg p-4">
              <div className="text-xs text-text-secondary mb-1">Most banned</div>
              <div className="text-xl font-medium" style={{ color: "#ED93B1" }}>
                {mostBanned?.name || "N/A"}
              </div>
              <div className="text-[11px] text-text-tertiary">
                {mostBanned ? `${mostBanned.banRate}% ban rate` : ""}
              </div>
            </div>
            <div className="bg-bg-secondary rounded-lg p-4">
              <div className="text-xs text-text-secondary mb-1">Maps tracked</div>
              <div className="text-xl font-medium">{mapCount}</div>
              <div className="text-[11px] text-text-tertiary">across 7 modes</div>
            </div>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top win rates */}
            <div className="bg-bg-primary border border-border rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Top win rates</div>
              {topWinRate.map((b, i) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 py-1.5"
                  style={{
                    borderBottom:
                      i < topWinRate.length - 1
                        ? "1px solid var(--border-color)"
                        : "none",
                  }}
                >
                  <span className="text-xs text-text-tertiary w-4 text-right">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium flex-1">{b.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: (TIER_COLORS as any)[b.tier] + "22",
                      color: (TIER_COLORS as any)[b.tier],
                    }}
                  >
                    {b.tier}
                  </span>
                  <span
                    className="text-sm font-medium w-12 text-right"
                    style={{
                      color: b.winRate > 52 ? "#5DCAA5" : "var(--text-primary)",
                    }}
                  >
                    {b.winRate}%
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              {/* Most picked */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Most picked</div>
                {topPicked.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 mb-2">
                    <span className="text-xs flex-1">{b.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(b.pickRate / 15) * 100}%`,
                          background: "#85B7EB",
                        }}
                      />
                    </div>
                    <span className="text-xs text-text-secondary w-9 text-right">
                      {b.pickRate}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Most banned */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Most banned</div>
                {topBanned.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 mb-2">
                    <span className="text-xs flex-1">{b.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(b.banRate / 12) * 100}%`,
                          background: "#ED93B1",
                        }}
                      />
                    </div>
                    <span className="text-xs text-text-secondary w-9 text-right">
                      {b.banRate}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/maps"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              View all maps →
            </Link>
            <Link
              href="/counter"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Counter picker →
            </Link>
            <Link
              href="/draft"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Draft simulator →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
