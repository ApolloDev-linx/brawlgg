import { FeaturedCard } from "@/components/dashboard/FeaturedCard";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, TIER_COLORS } from "@/lib/constants";
import { safeTier } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface BrawlerSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  iconUrl: string | null;
  externalId: number | null;
  winRate: number;
  pickRate: number;
  tier: string;
  totalBattles: number;
  isReal: boolean;
  impact: number;
}

async function getDashboardData() {
  return cached("dashboard:overview:v3", CACHE_TTL.META, async () => {
    const brawlers = await getAllBrawlerSummaries();
    const summaries: BrawlerSummary[] = brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      role: b.role,
      iconUrl: b.iconUrl,
      externalId: b.externalId,
      winRate: b.winRate,
      pickRate: b.pickRate,
      tier: safeTier(b.winRate, b.totalBattles),
      totalBattles: b.totalBattles,
      isReal: b.isReal,
      impact: Math.round((b.winRate * b.pickRate) / 100 * 100) / 100,
    }));
    const mapCount = await prisma.map.count({ where: { active: true } });
    return { summaries, mapCount };
  });
}

export default async function DashboardPage() {
  let data: { summaries: BrawlerSummary[]; mapCount: number };
  try {
    data = await getDashboardData();
  } catch {
    data = { summaries: [], mapCount: 0 };
  }
  const { summaries, mapCount } = data;

 // Top in meta bumped from 8 to 10
  const topMeta = [...summaries].sort((a, b) => b.impact - a.impact).slice(0, 10);
  const topPicked = [...summaries].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);
  const topWinRate = [...summaries]
    .filter((b) => b.isReal)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  // Worst brawler — same isReal filter as Highest WR so a 5-battle
  // brawler doesn't accidentally get pinned to the wall of shame.
  // Sorted ascending by winRate; bottom of the real-sample list wins.
  const worstBrawler =
    [...summaries]
      .filter((b) => b.isReal)
      .sort((a, b) => a.winRate - b.winRate)[0] || null;

  const topMetaBrawler = topMeta[0];
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
            <div className="bg-bg-secondary rounded-xl p-4">
              <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
                Active brawlers
              </div>
              <div className="text-2xl font-medium tracking-tight">
                {summaries.length}
              </div>
              <div className="text-[11px] text-text-secondary mt-1">
                in current meta
              </div>
            </div>
            <FeaturedCard
              worstBrawler={
                worstBrawler
                  ? {
                      id: worstBrawler.id,
                      name: worstBrawler.name,
                      iconUrl: worstBrawler.iconUrl,
                      externalId: worstBrawler.externalId,
                      winRate: worstBrawler.winRate,
                      pickRate: worstBrawler.pickRate,
                    }
                  : null
              }
            />            <div className="bg-bg-secondary rounded-xl p-4 flex flex-col">
              <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
                Top meta brawler
              </div>
              {topMetaBrawler ? (
                <div className="flex items-center gap-2.5">
                  <BrawlerPortrait
                    name={topMetaBrawler.name}
                    iconUrl={topMetaBrawler.iconUrl}
                    externalId={topMetaBrawler.externalId}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <div
                      className="text-base font-medium tracking-tight truncate"
                      style={{ color: "#EF9F27" }}
                    >
                      {topMetaBrawler.name}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5">
                      {topMetaBrawler.winRate}% WR · {topMetaBrawler.pickRate}% pick
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-2xl font-medium tracking-tight">N/A</div>
              )}
            </div>
            <div className="bg-bg-secondary rounded-xl p-4">
              <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
                Maps tracked
              </div>
              <div className="text-2xl font-medium tracking-tight">
                {mapCount}
              </div>
              <div className="text-[11px] text-text-secondary mt-1">
                across 7 modes
              </div>
            </div>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top in meta */}
            <div className="bg-bg-primary border border-border rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-medium">Top in meta</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-widest">
                  win × pick
                </div>
              </div>

              <div className="grid grid-cols-[16px_28px_1fr_28px_48px_48px] gap-2 items-center text-[10px] text-text-tertiary uppercase tracking-wide pb-2 border-b border-border">
                <span>#</span>
                <span></span>
                <span>Brawler</span>
                <span></span>
                <span className="text-right">Win</span>
                <span className="text-right">Pick</span>
              </div>

              {topMeta.map((b, i) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[16px_28px_1fr_28px_48px_48px] gap-2 items-center py-2"
                  style={{
                    borderBottom:
                      i < topMeta.length - 1
                        ? "1px solid var(--border-color)"
                        : "none",
                  }}
                >
                  <span className="text-xs text-text-tertiary font-mono">
                    {i + 1}
                  </span>
                  <BrawlerPortrait
                    name={b.name}
                    iconUrl={b.iconUrl}
                    externalId={b.externalId}
                    size="sm"
                  />
                  <span className="text-sm font-medium">{b.name}</span>
                  <span
                    className="text-xs font-semibold rounded-md text-center inline-flex items-center justify-center"
                    style={{
                      background: (TIER_COLORS as any)[b.tier] + "22",
                      color: (TIER_COLORS as any)[b.tier],
                      width: 22,
                      height: 22,
                    }}
                  >
                    {b.tier}
                  </span>
                  <span
                    className="text-sm font-semibold text-right"
                    style={{
                      color: b.winRate > 52 ? "#5DCAA5" : "var(--text-primary)",
                    }}
                  >
                    {b.winRate}%
                  </span>
                  <span className="text-sm text-text-secondary text-right">
                    {b.pickRate}%
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              {/* Most picked */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Most picked</div>
                {topPicked.map((b) => (
                  <div
                    key={b.id}
                    className="grid grid-cols-[26px_70px_1fr_44px] items-center gap-3 py-1.5"
                  >
                    <BrawlerPortrait
                      name={b.name}
                      iconUrl={b.iconUrl}
                      externalId={b.externalId}
                      size="sm"
                    />
                    <span className="text-sm font-medium truncate">
                      {b.name}
                    </span>
                    <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(b.pickRate / 15) * 100}%`,
                          background: "#85B7EB",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-text-primary text-right">
                      {b.pickRate}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Highest win rate */}
             <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Highest win rate</div>                {topWinRate.map((b) => (
                  <div
                    key={b.id}
                    className="grid grid-cols-[26px_70px_1fr_44px] items-center gap-3 py-1.5"
                  >
                    <BrawlerPortrait
                      name={b.name}
                      iconUrl={b.iconUrl}
                      externalId={b.externalId}
                      size="sm"
                    />
                    <span className="text-sm font-medium truncate">
                      {b.name}
                    </span>
                    <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, ((b.winRate - 48) / 10) * 100))}%`,
                          background: "#5DCAA5",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-mono text-right"
                      style={{ color: "#5DCAA5" }}
                    >
                      {b.winRate}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-6 flex flex-wrap gap-3">
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
            <Link
              href="/methodology"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors ml-auto"
            >
              How our stats work →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
