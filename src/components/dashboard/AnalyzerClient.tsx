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

  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {};
    brawlers.forEach((b) => {
      counts[b.type] = (counts[b.type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [brawlers]);

  const tierDist = useMemo(() => {
    const counts: Record<string, number> = {};
    brawlers.forEach((b) => {
      counts[b.tier] = (counts[b.tier] || 0) + 1;
    });
    const order = { S: 0, A: 1, B: 2, C: 3 };
    return Object.entries(counts).sort(
      (a, b) => (order as any)[a[0]] - (order as any)[b[0]]
    );
  }, [brawlers]);

  const strongAgainst = useMemo(() => {
    if (!selected) return [];
    const info = COUNTER_MATRIX[selected.type as BrawlerType];
    if (!info) return [];
    return brawlers
      .filter((b) => info.strongVs.includes(b.type as BrawlerType) && b.id !== selected.id)
      .slice(0, 4);
  }, [selected, brawlers]);

  const weakAgainst = useMemo(() => {
    if (!selected) return [];
    const info = COUNTER_MATRIX[selected.type as BrawlerType];
    if (!info) return [];
    return brawlers
      .filter((b) => info.weakVs.includes(b.type as BrawlerType) && b.id !== selected.id)
      .slice(0, 4);
  }, [selected, brawlers]);

  return (
    <div>
      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="text-sm font-medium mb-3">Type distribution</div>
          {typeDist.map(([type, count]) => (
            <div key={type} className="flex items-center gap-3 mb-2.5">
              <span
                className="w-24 text-xs font-medium"
                style={{ color: (TYPE_COLORS as any)[type] }}
              >
                {(TYPE_LABELS as any)[type] || type}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / 10) * 100}%`,
                    background: (TYPE_COLORS as any)[type],
                  }}
                />
              </div>
              <span className="text-xs text-text-secondary w-5 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="text-sm font-medium mb-3">Tier distribution</div>
          {tierDist.map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-3 mb-2.5">
              <span
                className="w-8 text-xs font-semibold px-1.5 py-0.5 rounded text-center"
                style={{
                  background: (TIER_COLORS as any)[tier] + "22",
                  color: (TIER_COLORS as any)[tier],
                }}
              >
                {tier}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / 12) * 100}%`,
                    background: (TIER_COLORS as any)[tier],
                  }}
                />
              </div>
              <span className="text-xs text-text-secondary w-5 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Brawler deep dive */}
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-3">Brawler deep dive</div>

        <div className="flex gap-1.5 flex-wrap mb-4">
          {brawlers.map((b) => (
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
              {/* xs (22px) — keeps the picker chips compact */}
              <BrawlerPortrait
                name={b.name}
                iconUrl={b.iconUrl}
                externalId={b.externalId}
                size="xs"
              />
              {b.name}
            </button>
          ))}
        </div>

        {selected && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-3 mb-4">
              {/* lg (56px) — anchors the deep-dive header. Was an empty
                  flex container in the old version, finally filled. */}
              <BrawlerPortrait
                name={selected.name}
                iconUrl={selected.iconUrl}
                externalId={selected.externalId}
                size="lg"
              />
              <div>
                <div className="text-base font-medium">{selected.name}</div>
                <div className="flex gap-2 mt-1">
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

            {/* Stats — Ban rate card removed. We have no real ban data
                from the API, so it was always showing 0%. */}
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
