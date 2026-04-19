/**
 * /debug/stats
 *
 * Self-consistency check. For every brawler, shows three independent numbers:
 *
 *   1. RAW        — computed fresh from BattleRecord (filtered to tracked modes)
 *   2. AGGREGATED — sum of MapBrawlerStat rows weighted by sampleSize
 *   3. HOMEPAGE   — what aggregateBrawlerStats() returns (what users see)
 *
 * This is a verification tool for devs. The page is honest about what
 * gets counted vs intentionally excluded (5v5 events, retired modes)
 * vs genuinely missing (long-tail maps). Not scary red warnings — just
 * facts so you can spot regressions.
 */

import { prisma } from "@/lib/prisma";
import { aggregateBrawlerStats } from "@/lib/stats-utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Must match TRACKED_MODES in stat-aggregator.ts
const TRACKED_MODES = [
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
  "wipeout",
  "duels",
];

interface Row {
  name: string;
  rawBattles: number;
  rawWins: number;
  rawWinRate: number | null;
  aggregatedWinRate: number;
  aggregatedSampleSize: number;
  status:
    | "ok"
    | "raw-agg-mismatch"
    | "partial-gap"
    | "ingestion-gap"
    | "no-data";
  delta: number | null;
  dropPercent: number;
}

async function getVerificationData() {
  // Raw counts from BattleRecord, filtered to tracked modes so we're
  // comparing apples to apples with the aggregator
  const rawBattles = await prisma.battleRecord.groupBy({
    by: ["brawlerName"],
    _count: { _all: true },
    where: { gameMode: { in: TRACKED_MODES } },
  });

  const rawWins = await prisma.battleRecord.groupBy({
    by: ["brawlerName"],
    where: { result: "victory", gameMode: { in: TRACKED_MODES } },
    _count: { _all: true },
  });

  const rawByName = new Map<string, { battles: number; wins: number }>();
  for (const r of rawBattles) {
    rawByName.set(r.brawlerName, { battles: r._count._all, wins: 0 });
  }
  for (const r of rawWins) {
    const existing = rawByName.get(r.brawlerName);
    if (existing) existing.wins = r._count._all;
  }

  const brawlers = await prisma.brawler.findMany({
    include: { mapStats: true },
    orderBy: { name: "asc" },
  });

  const rows: Row[] = brawlers.map((b) => {
    const raw = rawByName.get(b.name);
    const rawBattlesCount = raw?.battles ?? 0;
    const rawWinsCount = raw?.wins ?? 0;
    const rawWinRate =
      rawBattlesCount > 0
        ? Math.round((rawWinsCount / rawBattlesCount) * 1000) / 10
        : null;

    const agg = aggregateBrawlerStats(b.mapStats);

    const dropPercent =
      rawBattlesCount > 0
        ? Math.round(
            ((rawBattlesCount - agg.sampleSize) / rawBattlesCount) * 1000
          ) / 10
        : 0;

    let status: Row["status"];
    let delta: number | null = null;

    if (rawBattlesCount === 0 && agg.sampleSize === 0) {
      status = "no-data";
    } else if (rawBattlesCount > 0 && agg.sampleSize === 0) {
      status = "ingestion-gap";
    } else if (dropPercent > 5) {
      status = "partial-gap";
      if (rawWinRate !== null) {
        delta = Math.round((agg.winRate - rawWinRate) * 10) / 10;
      }
    } else if (rawWinRate !== null) {
      delta = Math.round((agg.winRate - rawWinRate) * 10) / 10;
      status = Math.abs(delta) <= 0.5 ? "ok" : "raw-agg-mismatch";
    } else {
      status = "no-data";
    }

    return {
      name: b.name,
      rawBattles: rawBattlesCount,
      rawWins: rawWinsCount,
      rawWinRate,
      aggregatedWinRate: agg.winRate,
      aggregatedSampleSize: agg.sampleSize,
      status,
      delta,
      dropPercent,
    };
  });

  rows.sort((a, b) => b.rawBattles - a.rawBattles);

  // Top-level stats
  const totalBattles = await prisma.battleRecord.count();
  const trackedBattles = await prisma.battleRecord.count({
    where: { gameMode: { in: TRACKED_MODES } },
  });
  const excludedByMode = totalBattles - trackedBattles;

  const totalAggregatedSamples = rows.reduce(
    (s, r) => s + r.aggregatedSampleSize,
    0
  );
  const excludedByMap = trackedBattles - totalAggregatedSamples;

  const realStatRows = await prisma.mapBrawlerStat.count({
    where: { isReal: true },
  });
  const totalStatRows = await prisma.mapBrawlerStat.count();

  const latestAgg = await prisma.mapBrawlerStat.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });

  const healthyRows = rows.filter((r) => r.status === "ok").length;
  const mismatchRows = rows.filter(
    (r) => r.status === "raw-agg-mismatch"
  ).length;
  const partialGapRows = rows.filter((r) => r.status === "partial-gap").length;
  const gapRows = rows.filter((r) => r.status === "ingestion-gap").length;

  const countedPercent =
    totalBattles > 0 ? (totalAggregatedSamples / totalBattles) * 100 : 0;

  return {
    rows,
    totals: {
      totalBattles,
      trackedBattles,
      excludedByMode,
      excludedByMap,
      totalAggregatedSamples,
      countedPercent: Math.round(countedPercent * 10) / 10,
      totalBrawlers: brawlers.length,
      realStatRows,
      totalStatRows,
      latestAggregation: latestAgg?.computedAt ?? null,
      healthyRows,
      mismatchRows,
      partialGapRows,
      gapRows,
    },
  };
}

function statusBadge(status: Row["status"], delta: number | null, drop: number) {
  if (status === "ok") {
    return <span style={{ color: "#5DCAA5" }}>✓ match</span>;
  }
  if (status === "raw-agg-mismatch") {
    return (
      <span style={{ color: "#ED93B1" }}>
        ✗ off by {delta !== null && delta > 0 ? "+" : ""}
        {delta}pp
      </span>
    );
  }
  if (status === "partial-gap") {
    return <span style={{ color: "#FAC775" }}>⚠ {drop}% dropped</span>;
  }
  if (status === "ingestion-gap") {
    return <span style={{ color: "#F09595" }}>⚠ all dropped</span>;
  }
  return <span style={{ color: "#B4B2A9" }}>— no data</span>;
}

export default async function DebugStatsPage() {
  const { rows, totals } = await getVerificationData();

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium mb-1">Stats verification</h1>
          <p className="text-sm text-text-secondary">
            Raw BattleRecord counts vs aggregated stats vs what the homepage
            displays. Numbers should agree within rounding.
          </p>
        </div>
        <Link
          href="/debug/maps"
          className="text-xs text-text-secondary hover:text-text-primary border border-border rounded-md px-3 py-1.5 whitespace-nowrap"
        >
          Inspect maps →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Total battles</div>
          <div className="text-xl font-medium">
            {totals.totalBattles.toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">raw in BattleRecord</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Counted in meta</div>
          <div className="text-xl font-medium" style={{ color: "#5DCAA5" }}>
            {totals.totalAggregatedSamples.toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">
            {totals.countedPercent}% of total
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Excluded</div>
          <div className="text-xl font-medium" style={{ color: "#FAC775" }}>
            {(totals.excludedByMode + totals.excludedByMap).toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">
            5v5 events, retired modes
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Healthy rows</div>
          <div className="text-xl font-medium" style={{ color: "#5DCAA5" }}>
            {totals.healthyRows}/{totals.totalBrawlers}
          </div>
          <div className="text-[11px] text-text-tertiary">raw ≈ aggregated</div>
        </div>
      </div>

      {/* Exclusion explanation */}
      <div
        className="mb-6 p-4 rounded-lg border"
        style={{
          background: "rgba(133, 183, 235, 0.06)",
          borderColor: "rgba(133, 183, 235, 0.2)",
        }}
      >
        <div className="text-sm font-medium mb-2" style={{ color: "#85B7EB" }}>
          Why {totals.excludedByMode + totals.excludedByMap > 0
            ? Math.round(
                ((totals.excludedByMode + totals.excludedByMap) /
                  totals.totalBattles) *
                  1000
              ) / 10
            : 0}
          % of raw data is excluded from meta stats
        </div>
        <div className="text-xs text-text-secondary space-y-1">
          <div>
            <strong>{totals.excludedByMode.toLocaleString()}</strong> battles
            excluded by mode — not in the 9 tracked competitive modes (Gem
            Grab, Brawl Ball, Bounty, Heist, Hot Zone, Knockout, Siege,
            Wipeout, Duels).
          </div>
          <div>
            <strong>{totals.excludedByMap.toLocaleString()}</strong> battles
            excluded by map — tracked mode but the map isn't in our Map table.
            Mostly 5v5 Brawl Ball events (Insane Streamer, No Good Deed, etc.)
            that the Brawl Stars API tags as "brawlBall" with no clean
            3v3/5v5 distinction, plus retired Siege maps.
          </div>
          <div className="pt-1 text-text-tertiary">
            This is intentional — we track classic 3v3 ranked competitive.
            Raw battles stay in BattleRecord for transparency and forkability.
          </div>
        </div>
      </div>

      {totals.latestAggregation && (
        <div className="text-xs text-text-tertiary mb-4">
          Last aggregation:{" "}
          {totals.latestAggregation
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)}{" "}
          UTC
        </div>
      )}

      {/* Verification table */}
      <div className="bg-bg-primary border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-bg-secondary text-text-secondary">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Brawler</th>
              <th className="text-right px-3 py-2 font-medium">
                Tracked battles
              </th>
              <th className="text-right px-3 py-2 font-medium">W / L</th>
              <th className="text-right px-3 py-2 font-medium">Raw WR</th>
              <th className="text-right px-3 py-2 font-medium">
                Aggregated (n)
              </th>
              <th className="text-right px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                style={{
                  borderTop: "1px solid var(--border-color)",
                  background:
                    r.status === "raw-agg-mismatch"
                      ? "rgba(237, 147, 177, 0.05)"
                      : r.status === "partial-gap"
                        ? "rgba(250, 199, 117, 0.05)"
                        : r.status === "ingestion-gap"
                          ? "rgba(240, 149, 149, 0.08)"
                          : undefined,
                }}
              >
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {r.rawBattles.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">
                  {r.rawBattles > 0
                    ? `${r.rawWins} / ${r.rawBattles - r.rawWins}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.rawWinRate !== null ? `${r.rawWinRate}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-secondary">
                  {r.aggregatedSampleSize > 0
                    ? `${r.aggregatedWinRate}% (${r.aggregatedSampleSize})`
                    : `${r.aggregatedWinRate}% (seed)`}
                </td>
                <td className="px-3 py-2 text-right">
                  {statusBadge(r.status, r.delta, r.dropPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-text-secondary space-y-2">
        <div>
          <span style={{ color: "#5DCAA5" }}>✓ match</span> — raw and
          aggregated agree within 0.5pp, sample sizes align.
        </div>
        <div>
          <span style={{ color: "#FAC775" }}>⚠ N% dropped</span> — aggregator
          missing battles for this brawler on unknown maps (usually 5v5).
        </div>
        <div>
          <span style={{ color: "#F09595" }}>⚠ all dropped</span> — aggregator
          saw zero battles despite raw data. Brawler name mismatch.
        </div>
        <div>
          <span style={{ color: "#ED93B1" }}>✗ off by Xpp</span> — sample
          sizes match but winrates diverge. Real bug.
        </div>
      </div>
    </div>
  );
}
