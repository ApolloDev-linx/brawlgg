/**
 * /debug/maps
 *
 * Shows which map names are being dropped by the aggregator.
 *
 * Three sections:
 *   1. UNMATCHED — mapNames in BattleRecord with no matching Map row.
 *                  These battles are silently dropped by stat-aggregator.
 *                  Fix: add them to SEED_MAPS (prisma/seed.ts) or handle
 *                  name normalization in the aggregator.
 *   2. MATCHED   — mapNames that DO align with a Map row. The battles
 *                  that actually make it into MapBrawlerStat come from here.
 *   3. UNUSED    — Map rows with zero BattleRecord hits. Probably rotated
 *                  out or never appeared in any harvested battle log.
 */

import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getMapDiagnostics() {
  // All distinct mapNames in BattleRecord with counts
  const battleMaps = await prisma.battleRecord.groupBy({
    by: ["mapName", "gameMode"],
    _count: { _all: true },
  });

  // All Map rows
  const mapRows = await prisma.map.findMany({
    select: { id: true, name: true, active: true, gameModeId: true },
  });

  const mapNameLowerSet = new Set(mapRows.map((m) => m.name.toLowerCase()));
  const mapNameLowerToRow = new Map(
    mapRows.map((m) => [m.name.toLowerCase(), m])
  );

  // Bucket battle-record map names
  const unmatched: {
    mapName: string;
    gameMode: string;
    battles: number;
  }[] = [];
  const matched: {
    mapName: string;
    gameMode: string;
    battles: number;
    active: boolean;
  }[] = [];

  // Collapse (mapName, gameMode) duplicates
  const nameToCount = new Map<string, { battles: number; gameMode: string }>();
  for (const row of battleMaps) {
    const key = row.mapName;
    const existing = nameToCount.get(key);
    if (existing) {
      existing.battles += row._count._all;
    } else {
      nameToCount.set(key, {
        battles: row._count._all,
        gameMode: row.gameMode,
      });
    }
  }

  for (const [mapName, info] of nameToCount.entries()) {
    const lookup = mapName.toLowerCase();
    const mapRow = mapNameLowerToRow.get(lookup);
    if (mapRow) {
      matched.push({
        mapName,
        gameMode: info.gameMode,
        battles: info.battles,
        active: mapRow.active,
      });
    } else {
      unmatched.push({
        mapName,
        gameMode: info.gameMode,
        battles: info.battles,
      });
    }
  }

  unmatched.sort((a, b) => b.battles - a.battles);
  matched.sort((a, b) => b.battles - a.battles);

  // Unused Map rows (in Map table but zero battles)
  const recordedNames = new Set(
    Array.from(nameToCount.keys()).map((n) => n.toLowerCase())
  );
  const unused = mapRows
    .filter((m) => !recordedNames.has(m.name.toLowerCase()))
    .map((m) => ({ name: m.name, active: m.active }));

  const totalBattles = await prisma.battleRecord.count();
  const unmatchedBattles = unmatched.reduce((s, r) => s + r.battles, 0);
  const matchedBattles = matched.reduce((s, r) => s + r.battles, 0);

  return {
    unmatched,
    matched,
    unused,
    totals: {
      totalBattles,
      unmatchedBattles,
      matchedBattles,
      unmatchedPercent:
        totalBattles > 0
          ? Math.round((unmatchedBattles / totalBattles) * 1000) / 10
          : 0,
      unmatchedMapCount: unmatched.length,
      matchedMapCount: matched.length,
      unusedMapCount: unused.length,
    },
  };
}

export default async function DebugMapsPage() {
  const { unmatched, matched, unused, totals } = await getMapDiagnostics();

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium mb-1">Map ingestion diagnostics</h1>
          <p className="text-sm text-text-secondary">
            Which map names in BattleRecord match your Map table, and which are
            being silently dropped by the aggregator.
          </p>
        </div>
        <Link
          href="/debug/stats"
          className="text-xs text-text-secondary hover:text-text-primary border border-border rounded-md px-3 py-1.5 whitespace-nowrap"
        >
          ← Back to stats
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Total battles</div>
          <div className="text-xl font-medium">
            {totals.totalBattles.toLocaleString()}
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">
            Unmatched maps
          </div>
          <div
            className="text-xl font-medium"
            style={{
              color: totals.unmatchedMapCount > 0 ? "#FAC775" : "#5DCAA5",
            }}
          >
            {totals.unmatchedMapCount}
          </div>
          <div className="text-[11px] text-text-tertiary">
            dropping battles
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">
            Battles dropped
          </div>
          <div
            className="text-xl font-medium"
            style={{
              color: totals.unmatchedPercent > 0 ? "#ED93B1" : "#5DCAA5",
            }}
          >
            {totals.unmatchedPercent}%
          </div>
          <div className="text-[11px] text-text-tertiary">
            {totals.unmatchedBattles.toLocaleString()} lost
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-xs text-text-secondary mb-1">Unused Map rows</div>
          <div className="text-xl font-medium">{totals.unusedMapCount}</div>
          <div className="text-[11px] text-text-tertiary">
            no battles seen
          </div>
        </div>
      </div>

      {/* Unmatched — the problem */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" style={{ color: "#FAC775" }}>
            ⚠ Unmatched map names ({unmatched.length})
          </h2>
          <span className="text-xs text-text-tertiary">
            these battles are being dropped by the aggregator
          </span>
        </div>
        {unmatched.length === 0 ? (
          <div className="bg-bg-secondary rounded-xl p-6 text-center text-sm text-text-secondary">
            No unmatched map names. Every battle is landing in a known map. ✓
          </div>
        ) : (
          <div
            className="bg-bg-primary border rounded-xl overflow-hidden"
            style={{ borderColor: "rgba(250, 199, 117, 0.3)" }}
          >
            <table className="w-full text-xs">
              <thead className="bg-bg-secondary text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Map name</th>
                  <th className="text-left px-3 py-2 font-medium">Mode</th>
                  <th className="text-right px-3 py-2 font-medium">
                    Battles dropped
                  </th>
                  <th className="text-right px-3 py-2 font-medium">% of total</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((r) => {
                  const percent =
                    totals.totalBattles > 0
                      ? Math.round(
                          (r.battles / totals.totalBattles) * 1000
                        ) / 10
                      : 0;
                  return (
                    <tr
                      key={r.mapName}
                      style={{
                        borderTop: "1px solid var(--border-color)",
                        background: "rgba(250, 199, 117, 0.04)",
                      }}
                    >
                      <td className="px-3 py-2 font-mono font-medium">
                        {r.mapName}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {r.gameMode}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.battles.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary">
                        {percent}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Matched — the working ones */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" style={{ color: "#5DCAA5" }}>
            ✓ Matched map names ({matched.length})
          </h2>
          <span className="text-xs text-text-tertiary">
            battles on these maps reach the aggregator
          </span>
        </div>
        <div className="bg-bg-primary border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg-secondary text-text-secondary">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Map name</th>
                <th className="text-left px-3 py-2 font-medium">Mode</th>
                <th className="text-right px-3 py-2 font-medium">Battles</th>
                <th className="text-right px-3 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {matched.map((r) => (
                <tr
                  key={r.mapName}
                  style={{ borderTop: "1px solid var(--border-color)" }}
                >
                  <td className="px-3 py-2 font-mono font-medium">
                    {r.mapName}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.gameMode}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.battles.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {r.active ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unused Map rows */}
      {unused.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-secondary">
              Unused Map rows ({unused.length})
            </h2>
            <span className="text-xs text-text-tertiary">
              in your Map table but zero battles seen
            </span>
          </div>
          <div className="bg-bg-primary border border-border rounded-xl p-4">
            <div className="flex flex-wrap gap-2">
              {unused.map((m) => (
                <span
                  key={m.name}
                  className="text-xs font-mono px-2 py-1 rounded bg-bg-tertiary text-text-secondary"
                  title={m.active ? "active" : "inactive"}
                >
                  {m.name}
                  {!m.active && " (inactive)"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* How to fix */}
      <div className="bg-bg-secondary rounded-xl p-4 text-xs text-text-secondary space-y-2">
        <div className="font-medium text-text-primary">How to fix unmatched maps</div>
        <div>
          1. Copy the unmatched map names above into{" "}
          <code className="bg-bg-tertiary px-1 rounded font-mono">
            SEED_MAPS
          </code>{" "}
          in{" "}
          <code className="bg-bg-tertiary px-1 rounded font-mono">
            src/lib/constants.ts
          </code>
          , each with its correct game mode.
        </div>
        <div>
          2. Run{" "}
          <code className="bg-bg-tertiary px-1 rounded font-mono">
            npm run db:seed
          </code>{" "}
          to upsert the new Map rows.
        </div>
        <div>
          3. Re-run the aggregator:{" "}
          <code className="bg-bg-tertiary px-1 rounded font-mono">
            npx tsx scripts/aggregate.ts
          </code>
          .
        </div>
        <div>
          4. Refresh the{" "}
          <Link href="/debug/stats" className="underline">
            stats page
          </Link>{" "}
          — dropped % should fall to near zero.
        </div>
      </div>
    </div>
  );
}
