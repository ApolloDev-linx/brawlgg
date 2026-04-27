"use client";

import { useState, useMemo } from "react";
import { TYPE_COLORS, TYPE_LABELS, TIER_COLORS, COUNTER_MATRIX } from "@/lib/constants";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import type { BrawlerType } from "@/types/brawler";

interface BrawlerData {
  id: string;
  name: string;
  role: string;
  type: string;
  hp: number;
  winRate: number;
  pickRate: number;
  tier: string;
  iconUrl: string | null;
  externalId: number | null;
}

export function AnalyzerClient({ brawlers }: { brawlers: BrawlerData[] }) {
  const [selected, setSelected] = useState<BrawlerData | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const total = brawlers.length;

  // Type distribution — sorted descending, bar widths scaled relative
  // to the largest type. Previous bug: hardcoded denominator of 10
  // meant any type with >10 brawlers blew past the card boundary.
  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {};
    brawlers.forEach((b) => {
      counts[b.type] = (counts[b.type] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = entries.length > 0 ? entries[0][1] : 1;
    return entries.map(([type, count]) => ({
      type,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      barPct: max > 0 ? (count / max) * 100 : 0,
    }));
  }, [brawlers, total]);

  // Tier distribution — same scaling fix. Sorted S→C in display order
  // (not by count) so the visual reads like a tier list.
  const tierDist = useMemo(() => {
    const counts: Record<string, number> = {};
    brawlers.forEach((b) => {
      counts[b.tier] = (counts[b.tier] || 0) + 1;
    });
    const order = { S: 0, A: 1, B: 2, C: 3 } as const;
    const entries = Object.entries(counts).sort(
      (a, b) => (order as any)[a[0]] - (order as any)[b[0]]
    );
    const max = Math.max(...entries.map((e) => e[1]), 1);
    return entries.map(([tier, count]) => ({
      tier,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      barPct: (count / max) * 100,
    }));
  }, [brawlers, total]);

  // Picker filter — search by name + optional type narrowing
  const filteredBrawlers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brawlers.filter((b) => {
      if (typeFilter && b.type !== typeFilter) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [brawlers, search, typeFilter]);

  const strongAgainst = useMemo(() => {
    if (!selected) return [];
    const info = COUNTER_MATRIX[selected.type as BrawlerType];
    if (!info) return [];
    return brawlers
      .filter(
        (b) =>
          info.strongVs.includes(b.type as BrawlerType) && b.id !== selected.id
      )
      .slice(0, 4);
  }, [selected, brawlers]);

  const weakAgainst = useMemo(() => {
    if (!selected) return [];
    const info = COUNTER_MATRIX[selected.type as BrawlerType];
    if (!info) return [];
    return brawlers
      .filter(
        (b) =>
          info.weakVs.includes(b.type as BrawlerType) && b.id !== selected.id
      )
      .slice(0, 4);
  }, [selected, brawlers]);

  // Available types for filter row — derived from the dataset so it
  // adjusts automatically if a new type ever gets added in constants.ts
  const availableTypes = useMemo(
    () => Array.from(new Set(brawlers.map((b) => b.type))),
    [brawlers]
  );

  return (
    <div>
      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Type distribution */}
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-sm font-medium">Type distribution</div>
            <div className="text-[10px] text-text-tertiary uppercase tracking-widest">
              {total} brawlers
            </div>
          </div>
          {typeDist.map(({ type, count, pct, barPct }) => (
            <div key={type} className="flex items-center gap-3 mb-2.5">
              <span
                className="w-20 text-xs font-medium shrink-0"
                style={{ color: (TYPE_COLORS as any)[type] }}
              >
                {(TYPE_LABELS as any)[type] || type}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barPct}%`,
                    background: (TYPE_COLORS as any)[type],
                  }}
                />
              </div>
              <span className="text-xs font-mono text-text-secondary w-16 text-right shrink-0">
                {count}{" "}
                <span className="text-text-tertiary">({pct}%)</span>
              </span>
            </div>
          ))}
        </div>

        {/* Tier distribution */}
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-sm font-medium">Tier distribution</div>
            <div className="text-[10px] text-text-tertiary uppercase tracking-widest">
              S → C
            </div>
          </div>
          {tierDist.map(({ tier, count, pct, barPct }) => (
            <div key={tier} className="flex items-center gap-3 mb-2.5">
              <span
                className="w-8 text-xs font-semibold px-1.5 py-0.5 rounded text-center shrink-0"
                style={{
                  background: (TIER_COLORS as any)[tier] + "22",
                  color: (TIER_COLORS as any)[tier],
                }}
              >
                {tier}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barPct}%`,
                    background: (TIER_COLORS as any)[tier],
                  }}
                />
              </div>
              <span className="text-xs font-mono text-text-secondary w-16 text-right shrink-0">
                {count}{" "}
                <span className="text-text-tertiary">({pct}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Brawler deep dive */}
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-medium">Brawler deep dive</div>
          <div className="text-[10px] text-text-tertiary uppercase tracking-widest font-mono">
            {filteredBrawlers.length} of {total}
          </div>
        </div>

        {/* Search + type filter row */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brawlers..."
            className="text-xs px-3 py-1.5 rounded-md bg-bg-secondary border border-border focus:border-border-hover focus:outline-none transition-colors"
            style={{ width: 200 }}
          />
          <div className="flex gap-1 flex-wrap">
            <FilterPill
              label="All"
              active={typeFilter === null}
              onClick={() => setTypeFilter(null)}
            />
            {availableTypes.map((type) => (
              <FilterPill
                key={type}
                label={(TYPE_LABELS as any)[type] || type}
                active={typeFilter === type}
                onClick={() =>
                  setTypeFilter(typeFilter === type ? null : type)
                }
                color={(TYPE_COLORS as any)[type]}
              />
            ))}
          </div>
          {(search || typeFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter(null);
              }}
              className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors px-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Brawler chips — scroll-capped so the picker doesn't take over */}
        <div className="flex gap-1.5 flex-wrap mb-4 max-h-64 overflow-y-auto pr-1">
          {filteredBrawlers.length === 0 ? (
            <div className="text-xs text-text-tertiary py-4">
              No brawlers match — try clearing the search or filter.
            </div>
          ) : (
            filteredBrawlers.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelected(b)}
                className="px-2 py-1 rounded-md text-xs flex items-center gap-1.5 transition-all"
                style={{
                  border: `1px solid ${selected?.id === b.id ? (TYPE_COLORS as any)[b.type] : "var(--border-color)"}`,
                  background:
                    selected?.id === b.id
                      ? (TYPE_COLORS as any)[b.type] + "18"
                      : "var(--bg-secondary)",
                }}
              >
                <BrawlerPortrait
                  name={b.name}
                  iconUrl={b.iconUrl}
                  externalId={b.externalId}
                  size="xs"
                />
                {b.name}
              </button>
            ))
          )}
        </div>

        {selected && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-3 mb-4">
              <BrawlerPortrait
                name={selected.name}
                iconUrl={selected.iconUrl}
                externalId={selected.externalId}
                size="lg"
              />
              <div>
                <div className="text-base font-medium">{selected.name}</div>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: (TIER_COLORS as any)[selected.tier] + "22",
                      color: (TIER_COLORS as any)[selected.tier],
                    }}
                  >
                    {selected.tier}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: (TYPE_COLORS as any)[selected.type] + "18",
                      color: (TYPE_COLORS as any)[selected.type],
                    }}
                  >
                    {(TYPE_LABELS as any)[selected.type]}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {selected.role} -- {selected.hp} HP
                  </span>
                </div>
              </div>
            </div>

            {/* Stats — Ban rate card removed earlier; we have no real
                ban data from the API. Grid stays at 2 cols. */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="text-[11px] text-text-secondary">Win rate</div>
                <div
                  className="text-lg font-medium"
                  style={{
                    color:
                      selected.winRate > 52
                        ? "#5DCAA5"
                        : selected.winRate < 48
                          ? "#F09595"
                          : undefined,
                  }}
                >
                  {selected.winRate}%
                </div>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="text-[11px] text-text-secondary">Pick rate</div>
                <div className="text-lg font-medium">{selected.pickRate}%</div>
              </div>
            </div>

            {/* Matchups */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div
                  className="text-xs font-medium mb-2"
                  style={{ color: "#5DCAA5" }}
                >
                  Strong against
                </div>
                {strongAgainst.length > 0 ? (
                  strongAgainst.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 text-xs mb-1.5 text-text-secondary"
                    >
                      <BrawlerPortrait
                        name={b.name}
                        iconUrl={b.iconUrl}
                        externalId={b.externalId}
                        size="sm"
                      />
                      <span>
                        {b.name} ({(TYPE_LABELS as any)[b.type]})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-text-tertiary">
                    No strong matchups
                  </div>
                )}
              </div>
              <div>
                <div
                  className="text-xs font-medium mb-2"
                  style={{ color: "#F09595" }}
                >
                  Weak against
                </div>
                {weakAgainst.length > 0 ? (
                  weakAgainst.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 text-xs mb-1.5 text-text-secondary"
                    >
                      <BrawlerPortrait
                        name={b.name}
                        iconUrl={b.iconUrl}
                        externalId={b.externalId}
                        size="sm"
                      />
                      <span>
                        {b.name} ({(TYPE_LABELS as any)[b.type]})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-text-tertiary">
                    No weak matchups
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact filter pill — used for both the type filter row in the deep
// dive picker. Color-tinted variant matches the type's color when active.
function FilterPill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md text-[11px] transition-all border"
      style={{
        background: active
          ? color
            ? color + "18"
            : "var(--text-primary)"
          : "var(--bg-secondary)",
        color: active
          ? color || "var(--bg-primary)"
          : "var(--text-secondary)",
        borderColor: active
          ? color || "var(--text-primary)"
          : "var(--border-color)",
      }}
    >
      {label}
    </button>
  );
}
