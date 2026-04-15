"use client";

import { useState } from "react";
import { TIER_COLORS, TYPE_COLORS, TYPE_LABELS, MODE_ICONS } from "@/lib/constants";

interface BrawlerStat {
  id: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: string;
  pickCategory: string | null;
  brawler: {
    id: string;
    name: string;
    role: string;
    type: string;
    hp: number;
  };
}

interface MapData {
  id: string;
  name: string;
  gameMode: { id: string; name: string; icon: string };
  brawlerStats: BrawlerStat[];
}

interface ModeData {
  id: string;
  name: string;
  icon: string;
}

export function MapList({
  maps,
  modes,
}: {
  maps: MapData[];
  modes: ModeData[];
}) {
  const [modeFilter, setModeFilter] = useState("All");
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);

  const filtered =
    modeFilter === "All"
      ? maps
      : maps.filter((m) => m.gameMode.name === modeFilter);

  if (selectedMap) {
    return (
      <MapDetail map={selectedMap} onBack={() => setSelectedMap(null)} />
    );
  }

  return (
    <div>
      {/* Mode filter */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <FilterButton
          label="All"
          active={modeFilter === "All"}
          onClick={() => setModeFilter("All")}
        />
        {modes.map((m) => (
          <FilterButton
            key={m.id}
            label={m.name}
            active={modeFilter === m.name}
            onClick={() => setModeFilter(m.name)}
          />
        ))}
      </div>

      {/* Map grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((map) => {
          const topBrawler = map.brawlerStats[0]?.brawler;
          return (
            <button
              key={map.id}
              onClick={() => setSelectedMap(map)}
              className="bg-bg-primary border border-border rounded-xl p-4 text-left transition-colors hover:border-border-hover"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono bg-bg-secondary px-1.5 py-0.5 rounded text-text-tertiary">
                  {MODE_ICONS[map.gameMode.name] || "??"}
                </span>
                <div>
                  <div className="text-sm font-medium">{map.name}</div>
                  <div className="text-xs text-text-secondary">
                    {map.gameMode.name}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                {map.brawlerStats.slice(0, 5).map((s) => (
                  <span
                    key={s.id}
                    title={s.brawler.name}
                    className="text-[10px] bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary"
                  >
                    {s.brawler.name.slice(0, 3)}
                  </span>
                ))}
              </div>
              {topBrawler && (
                <div className="text-[11px] text-text-tertiary mt-2">
                  Best: {topBrawler.name} (
                  {map.brawlerStats[0]?.winRate}% WR)
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs transition-all border"
      style={{
        background: active ? "var(--text-primary)" : "var(--bg-primary)",
        color: active ? "var(--bg-primary)" : "var(--text-secondary)",
        borderColor: active ? "var(--text-primary)" : "var(--border-color)",
      }}
    >
      {label}
    </button>
  );
}

function MapDetail({
  map,
  onBack,
}: {
  map: MapData;
  onBack: () => void;
}) {
  const stats = map.brawlerStats;
  const firstPick = stats.find((s) => s.pickCategory === "first_pick") || stats[0];
  const safePick = stats.find((s) => s.pickCategory === "safe") || stats[1];
  const riskPick = stats.find((s) => s.pickCategory === "high_risk") || stats[stats.length - 1];

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-text-secondary hover:text-text-primary mb-4 bg-transparent border-none p-0"
      >
        &larr; Back to maps
      </button>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs font-mono bg-bg-secondary px-2 py-1 rounded text-text-tertiary">
          {MODE_ICONS[map.gameMode.name] || "??"}
        </span>
        <div>
          <h2 className="text-lg font-medium">{map.name}</h2>
          <span className="text-sm text-text-secondary">
            {map.gameMode.name}
          </span>
        </div>
      </div>

      {/* Pick category cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {firstPick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">
              Best first pick
            </div>
            <div className="text-base font-medium" style={{ color: "#EF9F27" }}>
              {firstPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary">
              {firstPick.winRate}% win rate
            </div>
          </div>
        )}
        {safePick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">
              Safest pick
            </div>
            <div className="text-base font-medium" style={{ color: "#5DCAA5" }}>
              {safePick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary">
              Consistent in all matchups
            </div>
          </div>
        )}
        {riskPick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">
              High risk / reward
            </div>
            <div className="text-base font-medium" style={{ color: "#ED93B1" }}>
              {riskPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary">
              Situational but strong
            </div>
          </div>
        )}
      </div>

      {/* Stats table */}
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-3">
          Top brawlers on {map.name}
        </div>

        {/* Header */}
        <div className="grid grid-cols-[24px_1fr_50px_80px_56px_56px_56px] gap-2 items-center text-xs text-text-secondary pb-2 border-b border-border">
          <span>#</span>
          <span>Brawler</span>
          <span>Tier</span>
          <span>Type</span>
          <span className="text-right">Win</span>
          <span className="text-right">Pick</span>
          <span className="text-right">Ban</span>
        </div>

        {/* Rows */}
        {stats.map((s, i) => (
          <div
            key={s.id}
            className="grid grid-cols-[24px_1fr_50px_80px_56px_56px_56px] gap-2 items-center py-2"
            style={{
              borderBottom:
                i < stats.length - 1
                  ? "1px solid var(--border-color)"
                  : "none",
            }}
          >
            <span className="text-xs text-text-tertiary">{i + 1}</span>
            <span className="text-sm font-medium">{s.brawler.name}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded w-fit"
              style={{
                background: (TIER_COLORS as any)[s.tier] + "22",
                color: (TIER_COLORS as any)[s.tier],
              }}
            >
              {s.tier}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded w-fit"
              style={{
                background:
                  (TYPE_COLORS as any)[s.brawler.type] + "18",
                color: (TYPE_COLORS as any)[s.brawler.type],
              }}
            >
              {(TYPE_LABELS as any)[s.brawler.type] || s.brawler.type}
            </span>
            <span
              className="text-sm font-medium text-right"
              style={{
                color:
                  s.winRate > 53
                    ? "#5DCAA5"
                    : s.winRate < 48
                      ? "#F09595"
                      : "var(--text-primary)",
              }}
            >
              {s.winRate}%
            </span>
            <span className="text-sm text-right text-text-secondary">
              {s.pickRate}%
            </span>
            <span className="text-sm text-right text-text-secondary">
              {s.banRate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
