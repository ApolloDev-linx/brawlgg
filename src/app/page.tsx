import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, TIER_COLORS, TYPE_COLORS, TYPE_LABELS } from "@/lib/constants";
import { safeTier } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface BrawlerSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  winRate: number;
  pickRate: number;
  tier: string;
  totalBattles: number;
  isReal: boolean;
  impact: number; // winRate × pickRate — meta dominance score
}

// Two-letter initials for the chip column (PDF dashboard mockup uses
// these — `Sp Spike`, `Sh Shelly`, etc). Just first two letters of the
// canonical name with the second letter lowercased; reads cleanly even
// for "El Primo" → "El", "Mr. P" → "Mr".
function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const first = trimmed[0].toUpperCase();
  // Skip past spaces / punctuation to find a real second character
  const rest = trimmed.slice(1).replace(/[^a-zA-Z]/g, "");
  const second = (rest[0] || trimmed[0]).toLowerCase();
  return first + second;
}

// Initials chip — small monospace-feeling badge shown next to brawler
// names in the right-column bar lists and the Top in meta table.
// Matches PDF page 1 spec.
function InitialsChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center justify-center text-[10px] font-semibold rounded-md border border-border"
      style={{
        background: "var(--bg-tertiary)",
        color: "var(--text-secondary)",
        width: 26,
        height: 22,
        letterSpacing: "-0.02em",
      }}
    >
      {initials(name)}
    </span>
  );
}

async function getDashboardData() {
  return cached("dashboard:overview:v2", CACHE_TTL.META, async () => {
    // Reads from BrawlerStat (computed from raw BattleRecord), not from
    // averaging MapBrawlerStat. This is what fixes Lou/Sam looking like
    // top-3 — they were artifacts of map-filtering bias.
    const brawlers = await getAllBrawlerSummaries();

    const summaries: BrawlerSummary[] = brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      role: b.role,
      winRate: b.winRate,
      pickRate: b.pickRate,
      // safeTier: S requires both winRate ≥ 54 AND ≥1000 battles. Stops
      // small-sample brawlers from inheriting the loudest badge on thin
      // data. See stats-utils.ts for rationale.
      tier: safeTier(b.winRate, b.totalBattles),
      totalBattles: b.totalBattles,
      isReal: b.isReal,
      // Impact = how much this brawler shapes competitive play.
      // A 56% WR brawler with 0.3% pick rate is statistically strong but
      // basically invisible in real games. A 53% WR brawler with 5% pick
      // rate is meta-defining. Multiplying surfaces the latter.
      // Divide by 100 just to keep the number in a reasonable range
      // (e.g. 53.8 × 5.6 / 100 = 3.01 instead of 301).
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
    // Fallback when DB is not connected
    data = { summaries: [], mapCount: 0 };
  }
  const { summaries, mapCount } = data;

  // Top in meta = sorted by impact (winRate × pickRate). Answers
  // "which brawlers are actually shaping the meta" rather than
  // "which brawler has the highest raw WR" (which favors niche picks).
  const topMeta = [...summaries].sort((a, b) => b.impact - a.impact).slice(0, 8);
  const topPicked = [...summaries].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);

  // Highest win rate replaces the old "Most banned" card. Filters to real-
  // sample brawlers so the list can't be topped by a 2-0 statistical mirage.
  const topWinRate = [...summaries]
    .filter((b) => b.isReal)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  const avgWin = summaries.length > 0
    ? Math.round((summaries.reduce((s, b) => s + b.winRate, 0) / summaries.length) * 10) / 10
    : 0;

  // Top meta brawler fills what used to be the "Most banned" tile. We have
  // no real ban data from the API, so the old tile was always showing
  // "8-Bit · 0% ban rate" or similar — a broken signal. This replaces it
  // with a real insight: who's actually dominating competitive play.
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
          {/* Metric cards — PDF page 1 spec: uppercase micro labels, larger
              metric numbers, gold for top-meta brawler, teal for win rate */}
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
            <div className="bg-bg-secondary rounded-xl p-4">
              <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
                Avg win rate
              </div>
              <div
                className="text-2xl font-medium tracking-tight"
                style={{ color: "#5DCAA5" }}
              >
                {avgWin}%
              </div>
              <div className="text-[11px] text-text-secondary mt-1">
                across 7 modes
              </div>
            </div>
            <div className="bg-bg-secondary rounded-xl p-4">
              <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
                Top meta brawler
              </div>
              <div
                className="text-2xl font-medium tracking-tight"
                style={{ color: "#EF9F27" }}
              >
                {topMetaBrawler?.name || "N/A"}
              </div>
              <div className="text-[11px] text-text-secondary mt-1">
                {topMetaBrawler
                  ? `${topMetaBrawler.winRate}% WR · ${topMetaBrawler.pickRate}% pick`
                  : ""}
              </div>
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
            {/* Top in meta — ranked by win × pick (impact / dominance).
                Adds initials chip column per PDF page 1 mockup. */}
            <div className="bg-bg-primary border border-border rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-medium">Top in meta</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-widest">
                  win × pick
                </div>
              </div>

              {/* Header row — adds an extra col for the initials chip */}
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
                  <InitialsChip name={b.name} />
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
                      color: b.winRate > 52
                        ? "#5DCAA5"
                        : "var(--text-primary)",
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
              {/* Most picked — bar list with initials chip per PDF mockup.
                  Bars in accent-blue (sniper-color, but used here as the
                  "pick" semantic). */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Most picked</div>
                {topPicked.map((b) => (
                  <div
                    key={b.id}
                    className="grid grid-cols-[26px_70px_1fr_44px] items-center gap-3 py-1.5"
                  >
                    <InitialsChip name={b.name} />
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
              {/* Highest win rate — replaces the old "Most banned" card.
                  We have no real ban data from the API, so that card was
                  always empty. This fills the space with a real insight:
                  who's actually winning the most when they show up.
                  Filtered to real-sample brawlers so a 2-0 curiosity can't
                  top the list. Bar fills based on how far above 48% the
                  brawler is; 58% maxes the bar. Bars in teal (positive
                  win-rate semantic) — value is also colored teal to match
                  the PDF mockup. */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm font-medium">Highest win rate</div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-widest">
                    real samples only
                  </div>
                </div>
                {topWinRate.map((b) => (
                  <div
                    key={b.id}
                    className="grid grid-cols-[26px_70px_1fr_44px] items-center gap-3 py-1.5"
                  >
                    <InitialsChip name={b.name} />
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
          {/* Footer links — /methodology is the public explainer for how
              every number on this page is computed. Put it right next to
              the tool links so skeptical users find it naturally. */}
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
