/**
 * /debug/stats
 *
 * Self-consistency check. For every brawler, shows four independent numbers:
 *
 *   1. RAW         — computed directly from BattleRecord (tracked modes only).
 *                    Ground truth.
 *   2. BRAWLERSTAT — what's stored in the BrawlerStat table, computed by
 *                    `computeBrawlerStats()` in stat-aggregator.ts on every
 *                    aggregation run. Should match RAW within ±0.5pp;
 *                    drift here = bug in computeBrawlerStats.
 *   3. USER WR     — what /, /counter, /draft, /analyzer actually display
 *                    (BrawlerStat shrunk by Bayesian prior=50). Will diverge
 *                    from RAW for low-sample brawlers — that's the prior
 *                    pulling them toward 50%, not a bug.
 *   4. MAP-AGG WR  — what you'd get if you pooled MapBrawlerStat rows
 *                    weighted by sampleSize. NOT used by user-facing pages
 *                    anymore — kept here as a visualization of the
 *                    map-filtering bias we built BrawlerStat to avoid.
 *
 * Health definition:
 *   A row is "healthy" if RAW and BRAWLERSTAT agree within 0.5pp. They share
 *   the same SQL data, so any drift is a real bug. The Map-Agg column being
 *   off from RAW is *expected* and is exactly the bias signal — that's how
 *   much each brawler was being misrepresented before the BrawlerStat path
 *   was added.
 */

import { prisma } from "@/lib/prisma";
import { aggregateBrawlerStats } from "@/lib/stats-utils";
import { getAllBrawlerSummaries } from "@/lib/brawler-stats-reader";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

// Tight threshold — Raw and BrawlerStat are computed from the same SQL
// data, so they should match to floating-point precision. Anything above
// this is a real bug in computeBrawlerStats.
const WR_AGREEMENT_THRESHOLD = 0.5;

interface Row {
  name: string;
  rawBattles: number;
  rawWins: number;
  rawWinRate: number | null;

  // BrawlerStat — the new source of truth, what user pages now read from
  storedBattles: number;
  storedWinRateRaw: number;       // BrawlerStat without prior — should match Raw
  shownWinRate: number;           // BrawlerStat with prior=50 — what users see

  // MapBrawlerStat aggregated (prior=0) — informational only.
  // Difference from Raw shows the bias the BrawlerStat path was built to fix.
  mapAggSampleSize: number;
  mapAggWinRate: number;

  status: "ok" | "stat-drift" | "ingestion-gap" | "no-data";
  storedDelta: number | null;     // critical drift: BrawlerStat vs Raw
  mapAggDelta: number | null;     // informational: how much bias was fixed
  mapDropPercent: number;
}

async function getVerificationData() {
  // ---- 1. Raw truth from BattleRecord -------------------------------------
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

  // ---- 2. BrawlerStat (stored, what user pages read) ----------------------
  // Pull both unshrunk and shrunk views in one go. getAllBrawlerSummaries(0)
  // returns the raw computed value (no prior), getAllBrawlerSummaries(50)
  // returns what the dashboard et al. actually display.
  const brawlers = await prisma.brawler.findMany({
    include: { mapStats: true, stat: true },
    orderBy: { name: "asc" },
  });

  const [summariesRaw, summariesShown] = await Promise.all([
    getAllBrawlerSummaries(0),
    getAllBrawlerSummaries(),
  ]);
  const rawById = new Map(summariesRaw.map((s) => [s.id, s]));
  const shownById = new Map(summariesShown.map((s) => [s.id, s]));

  // ---- 3. Build rows ------------------------------------------------------
  const rows: Row[] = brawlers.map((b) => {
    const raw = rawByName.get(b.name);
    const rawBattlesCount = raw?.battles ?? 0;
    const rawWinsCount = raw?.wins ?? 0;
    const rawWinRate =
      rawBattlesCount > 0
        ? Math.round((rawWinsCount / rawBattlesCount) * 1000) / 10
        : null;

    // What's stored in the BrawlerStat table (no prior — should match Raw)
    const storedRaw = rawById.get(b.id);
    const storedShown = shownById.get(b.id);
    const storedBattles = b.stat?.totalBattles ?? 0;
    const storedWinRateRaw = storedRaw?.winRate ?? 50;
    const shownWinRate = storedShown?.winRate ?? 50;

    // Map-aggregated view — kept as informational column, not status signal
    const mapAgg = aggregateBrawlerStats(b.mapStats, 0);

    const mapDropPercent =
      rawBattlesCount > 0
        ? Math.round(
            ((rawBattlesCount - mapAgg.sampleSize) / rawBattlesCount) * 1000
          ) / 10
        : 0;

    // Status logic — driven by BrawlerStat vs Raw (both computed from the
    // same SQL, drift = real bug). Map-agg drift is expected.
    let status: Row["status"];
    let storedDelta: number | null = null;
    let mapAggDelta: number | null = null;

    if (rawBattlesCount === 0 && storedBattles === 0) {
      status = "no-data";
    } else if (rawBattlesCount > 0 && storedBattles === 0) {
      // Raw has battles but the BrawlerStat row is empty — name mismatch
      // in computeBrawlerStats's lookup table.
      status = "ingestion-gap";
    } else if (rawWinRate !== null) {
      storedDelta = Math.round((storedWinRateRaw - rawWinRate) * 10) / 10;
      mapAggDelta = Math.round((mapAgg.winRate - rawWinRate) * 10) / 10;
      status =
        Math.abs(storedDelta) <= WR_AGREEMENT_THRESHOLD ? "ok" : "stat-drift";
    } else {
      status = "no-data";
    }

    return {
      name: b.name,
      rawBattles: rawBattlesCount,
      rawWins: rawWinsCount,
      rawWinRate,
      storedBattles,
      storedWinRateRaw,
      shownWinRate,
      mapAggSampleSize: mapAgg.sampleSize,
      mapAggWinRate: mapAgg.winRate,
      status,
      storedDelta,
      mapAggDelta,
      mapDropPercent,
    };
  });

  rows.sort((a, b) => b.rawBattles - a.rawBattles);

  // ---- 4. Aggregate counters / freshness ---------------------------------
  const totalBattles = await prisma.battleRecord.count();
  const trackedBattles = await prisma.battleRecord.count({
    where: { gameMode: { in: TRACKED_MODES } },
  });
  const excludedByMode = totalBattles - trackedBattles;

  // BrawlerStat captures all tracked-mode battles, so the "captured" count
  // for the new source of truth is the sum of storedBattles across rows.
  const totalStoredBattles = rows.reduce((s, r) => s + r.storedBattles, 0);
  const storedCapturedPercent =
    totalBattles > 0
      ? Math.round((totalStoredBattles / totalBattles) * 1000) / 10
      : 0;

  // Same calc for map-agg, kept to show the historical bias gap.
  const totalMapAggSamples = rows.reduce(
    (s, r) => s + r.mapAggSampleSize,
    0
  );
  const mapAggCapturedPercent =
    totalBattles > 0
      ? Math.round((totalMapAggSamples / totalBattles) * 1000) / 10
      : 0;

  // Battles in tracked modes that aren't tied to a known map row.
  // Under the new architecture these DO count toward brawler-level stats
  // via BrawlerStat — they're only excluded from the per-map page.
  const mapPageOnlyExcluded = trackedBattles - totalMapAggSamples;

  const realStatRows = await prisma.mapBrawlerStat.count({
    where: { isReal: true },
  });
  const latestMapAgg = await prisma.mapBrawlerStat.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });
  const latestBrawlerStat = await prisma.brawlerStat.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });

  const healthyRows = rows.filter((r) => r.status === "ok").length;
  const driftRows = rows.filter((r) => r.status === "stat-drift").length;
  const gapRows = rows.filter((r) => r.status === "ingestion-gap").length;
  const noDataRows = rows.filter((r) => r.status === "no-data").length;

  return {
    rows,
    totals: {
      totalBattles,
      trackedBattles,
      excludedByMode,
      mapPageOnlyExcluded,
      totalStoredBattles,
      storedCapturedPercent,
      totalMapAggSamples,
      mapAggCapturedPercent,
      totalBrawlers: brawlers.length,
      realStatRows,
      latestMapAgg: latestMapAgg?.computedAt ?? null,
      latestBrawlerStat: latestBrawlerStat?.computedAt ?? null,
      healthyRows,
      driftRows,
      gapRows,
      noDataRows,
    },
  };
}

function statusBadge(status: Row["status"], delta: number | null) {
  if (status === "ok") {
    return (
      <span style={{ color: "#5DCAA5" }}>
        ✓ {delta !== null && delta > 0 ? "+" : ""}
        {delta ?? 0}pp
      </span>
    );
  }
  if (status === "stat-drift") {
    return (
      <span style={{ color: "#ED93B1" }}>
        ✗ off by {delta !== null && delta > 0 ? "+" : ""}
        {delta}pp
      </span>
    );
  }
  if (status === "ingestion-gap") {
    return <span style={{ color: "#F09595" }}>⚠ name mismatch</span>;
  }
  return <span style={{ color: "#B4B2A9" }}>— no data</span>;
}

export default async function DebugStatsPage() {
  const { rows, totals } = await getVerificationData();

  // Healthy-rows tile color — green if everything's clean, yellow on any
  // stat-drift or ingestion-gap. "No data" rows don't affect health.
  const hasIssues = totals.driftRows > 0 || totals.gapRows > 0;

  // Denominator excludes "no data" brawlers so the ratio reads naturally
  // (101/101 instead of 101/102 when one brawler simply has no battles yet).
  const ratableBrawlers = totals.totalBrawlers - totals.noDataRows;

  const formatTimestamp = (d: Date | null) =>
    d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never";

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium mb-1">Stats verification</h1>
          <p className="text-sm text-text-secondary">
            Does what the BrawlerStat table stores match the raw battles
            it was computed from?
          </p>
        </div>
        <Link
          href="/debug/maps"
          className="text-xs text-text-secondary hover:text-text-primary border border-border rounded-md px-3 py-1.5 whitespace-nowrap"
        >
          Inspect maps →
        </Link>
      </div>

      {/* Summary tiles — original four-tile layout. "Counted in meta" is
          now 100% (vs 83.7% under the old MapBrawlerStat-only path) because
          BrawlerStat ignores the map filter. "Excluded" only counts the
          truly excluded battles (non-competitive modes); the ~30k
          tracked-but-unmapped battles still count toward meta — they only
          drop out of /maps. See the blue box below for the full breakdown. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Total battles</div>
          <div className="text-xl font-medium">
            {totals.totalBattles.toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">
            raw in BattleRecord
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">
            Counted in meta
          </div>
          <div
            className="text-xl font-medium"
            style={{ color: "#5DCAA5" }}
          >
            {totals.totalStoredBattles.toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">
            {totals.storedCapturedPercent}% of total
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Excluded</div>
          <div className="text-xl font-medium" style={{ color: "#FAC775" }}>
            {totals.excludedByMode.toLocaleString()}
          </div>
          <div className="text-[11px] text-text-tertiary">
            Showdown, 5v5, novelty
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Winrate match</div>
          <div
            className="text-xl font-medium"
            style={{ color: hasIssues ? "#FAC775" : "#5DCAA5" }}
          >
            {totals.healthyRows}/{ratableBrawlers}
          </div>
          <div className="text-[11px] text-text-tertiary">
            raw ≈ stored
          </div>
        </div>
      </div>

      {/* Blue explainer box — preserved from original design.
          Header reframed for the new architecture: meta now captures
          everything tracked, the only true exclusion is non-competitive
          modes. The 30k by-map number still lives here for transparency
          but is clearly labeled as map-page-only, not a meta exclusion. */}
      <div
        className="mb-6 p-4 rounded-lg border"
        style={{
          background: "rgba(133, 183, 235, 0.06)",
          borderColor: "rgba(133, 183, 235, 0.2)",
        }}
      >
        <div className="text-sm font-medium mb-2" style={{ color: "#85B7EB" }}>
          What's excluded from meta stats — and why
        </div>
        <div className="text-xs text-text-secondary space-y-1">
          <div>
            <strong>{totals.excludedByMode.toLocaleString()}</strong> battles
            excluded by mode — not in the 9 tracked competitive modes (Gem
            Grab, Brawl Ball, Bounty, Heist, Hot Zone, Knockout, Siege,
            Wipeout, Duels). Showdown, 5v5 events, and novelty modes stay
            in BattleRecord as raw data but don't count toward meta stats.
          </div>
          <div>
            An additional{" "}
            <strong>{totals.mapPageOnlyExcluded.toLocaleString()}</strong>{" "}
            tracked-mode battles aren't tied to a known map row — mostly
            5v5 Brawl Ball events the API tags as "brawlBall" with no clean
            3v3/5v5 distinction, plus retired Siege maps and long-tail maps
            Brawlify lists under different names. These DO count toward
            brawler-level meta stats via BrawlerStat; they're only excluded
            from the per-map rankings on /maps.
          </div>
          <div className="pt-1 text-text-tertiary">
            Intentional — we track classic 3v3 ranked competitive. Raw
            battles stay in BattleRecord for transparency and forkability.
          </div>
        </div>
      </div>

      {/* Freshness */}
      <div className="text-xs text-text-tertiary mb-4 flex flex-wrap gap-x-6 gap-y-1">
        <span>BrawlerStat last computed: {formatTimestamp(totals.latestBrawlerStat)}</span>
        <span>MapBrawlerStat last computed: {formatTimestamp(totals.latestMapAgg)}</span>
      </div>

      <div className="bg-bg-primary border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-bg-secondary text-text-secondary">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Brawler</th>
              <th className="text-right px-3 py-2 font-medium">Tracked</th>
              <th className="text-right px-3 py-2 font-medium">W / L</th>
              <th className="text-right px-3 py-2 font-medium">Raw WR</th>
              <th
                className="text-right px-3 py-2 font-medium"
                title="What's stored in BrawlerStat, no prior. Should match Raw WR exactly."
              >
                BrawlerStat WR
              </th>
              <th
                className="text-right px-3 py-2 font-medium"
                title="What users see on /, /counter, /draft, /analyzer (BrawlerStat with prior=50)"
              >
                User WR
              </th>
              <th
                className="text-right px-3 py-2 font-medium"
                title="What MapBrawlerStat aggregation would produce. Differs from Raw because of map filtering — this is the historical bias."
              >
                Map-Agg (Δ)
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
                    r.status === "stat-drift"
                      ? "rgba(237, 147, 177, 0.05)"
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
                  {r.storedBattles > 0
                    ? `${r.storedWinRateRaw}% (${r.storedBattles.toLocaleString()})`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-tertiary">
                  {r.shownWinRate}%
                </td>
                <td
                  className="px-3 py-2 text-right font-mono text-text-tertiary"
                  title={
                    r.mapAggDelta !== null
                      ? `${r.mapDropPercent}% of battles dropped by map filter`
                      : undefined
                  }
                >
                  {r.mapAggSampleSize > 0 ? (
                    <>
                      {r.mapAggWinRate}%{" "}
                      {r.mapAggDelta !== null && (
                        <span
                          style={{
                            color:
                              Math.abs(r.mapAggDelta) > 1
                                ? "#FAC775"
                                : "#B4B2A9",
                          }}
                        >
                          ({r.mapAggDelta > 0 ? "+" : ""}
                          {r.mapAggDelta})
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {statusBadge(r.status, r.storedDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-text-secondary space-y-2">
        <div>
          <span style={{ color: "#5DCAA5" }}>✓ Xpp</span> — BrawlerStat
          agrees with Raw within ±0.5pp. The aggregation pipeline is healthy.
        </div>
        <div>
          <span style={{ color: "#ED93B1" }}>✗ off by Xpp</span> —
          BrawlerStat diverges from Raw by more than 0.5pp. Real bug in
          computeBrawlerStats — both numbers come from the same SQL data,
          so they should match almost exactly.
        </div>
        <div>
          <span style={{ color: "#F09595" }}>⚠ name mismatch</span> — Raw
          shows battles but BrawlerStat row is empty. Likely a brawler-name
          canonicalization bug between BattleRecord and the Brawler table.
        </div>
        <div className="pt-2 text-text-tertiary">
          <strong>User WR</strong> is what the dashboard / counter / draft /
          analyzer pages display. It applies a Bayesian prior of 50 virtual
          50/50 games to BrawlerStat, so brawlers with thin data are pulled
          toward 50% — this is intentional shrinkage, not drift.{" "}
          <strong>Map-Agg (Δ)</strong> is what you'd see if those pages
          still pooled MapBrawlerStat rows. The delta is the magnitude of
          the map-filtering bias the BrawlerStat path was built to fix —
          large yellow values mean that brawler was being meaningfully
          misrepresented before.
        </div>
      </div>
    </div>
  );
}
