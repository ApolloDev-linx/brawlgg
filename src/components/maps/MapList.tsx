"use client";

import { useState } from "react";
import { TIER_COLORS, TYPE_COLORS, TYPE_LABELS, MODE_ICONS } from "@/lib/constants";
import {
  pickFirstPick,
  pickSafest,
  pickHighRiskHighReward,
} from "@/lib/stats-utils";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import { MapImage } from "@/components/MapImage";

interface BrawlerStat {
  id: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  sampleSize: number;
  isReal: boolean;
  tier: string;
  pickCategory: string | null;
  brawler: {
    id: string;
    name: string;
    role: string;
    type: string;
    hp: number;
    iconUrl: string | null;
    externalId: number | null;
  };
}

interface MapData {
  id: string;
  name: string;
  imageUrl: string | null; // NEW — pulled through prisma.map.findMany scalars
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

      {/* Map grid — image banner at top, then mode/name header,
          top-5 brawler portrait strip, "Best:" line. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((map) => {
          const topBrawler = map.brawlerStats[0]?.brawler;
          return (
            <button
              key={map.id}
              onClick={() => setSelectedMap(map)}
              className="bg-bg-primary border border-border rounded-xl overflow-hidden text-left transition-colors hover:border-border-hover flex flex-col"
            >
              {/* Map image banner */}
              <MapImage
                name={map.name}
                imageUrl={map.imageUrl}
                modeName={map.gameMode.name}
                size="card"
                className="rounded-none"
              />
              <div className="p-4">
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
                {/* Top 5 brawler portraits */}
                <div className="flex gap-1">
                  {map.brawlerStats.slice(0, 5).map((s) => (
                    <BrawlerPortrait
                      key={s.id}
                      name={s.brawler.name}
                      iconUrl={s.brawler.iconUrl}
                      externalId={s.brawler.externalId}
                      size="xs"
                    />
                  ))}
                </div>
                {topBrawler && (
                  <div className="text-[11px] text-text-tertiary mt-2">
                    Best: {topBrawler.name}{" "}
                    <span className="font-mono">
                      ({map.brawlerStats[0]?.winRate}% WR)
                    </span>
                  </div>
                )}
              </div>
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
  const firstPick = pickFirstPick(stats);
  const safePick = pickSafest(stats);
  const riskPick = pickHighRiskHighReward(stats);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-text-secondary hover:text-text-primary mb-4 bg-transparent border-none p-0"
      >
        &larr; Back to maps
      </button>

      {/* Hero banner — full width, ~200px tall */}
      <div className="mb-5">
        <MapImage
          name={map.name}
          imageUrl={map.imageUrl}
          modeName={map.gameMode.name}
          size="hero"
        />
      </div>

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
            <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
              Best first pick
            </div>
            <div className="text-base font-medium" style={{ color: "#EF9F27" }}>
              {firstPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5 font-mono">
              {firstPick.winRate}% WR · {firstPick.pickRate}% pick
            </div>
          </div>
        )}
        {safePick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
              Safest pick
            </div>
            <div className="text-base font-medium" style={{ color: "#5DCAA5" }}>
              {safePick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5 font-mono">
              {safePick.winRate}% WR · {safePick.pickRate}% pick
            </div>
          </div>
        )}
        {riskPick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
              High risk / reward
            </div>
            <div className="text-base font-medium" style={{ color: "#ED93B1" }}>
              {riskPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5 font-mono">
              {riskPick.winRate}% WR · {riskPick.pickRate}% pick (niche)
            </div>
          </div>
        )}
      </div>

      {/* Stats table */}
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-3">
          Top brawlers on {map.name}
        </div>
        <div className="grid grid-cols-[20px_28px_28px_1fr_120px_60px_56px] gap-3 items-center text-[10px] text-text-tertiary uppercase tracking-widest pb-2 border-b border-border">
          <span>#</span>
          <span></span>
          <span>Brawler</span>
          <span></span>
          <span>Type</span>
          <span className="text-right">Win%</span>
          <span className="text-right">Pick%</span>
        </div>
        {stats.map((s, i) => (
          <div
            key={s.id}
            className="grid grid-cols-[20px_28px_28px_1fr_120px_60px_56px] gap-3 items-center py-2"
            style={{
              borderBottom:
                i < stats.length - 1
                  ? "1px solid var(--border-color)"
                  : "none",
            }}
          >
            <span className="text-xs text-text-tertiary font-mono">
              {i + 1}
            </span>
            <span
              className="text-xs font-semibold rounded-md w-[22px] h-[22px] inline-flex items-center justify-center"
              style={{
                background: (TIER_COLORS as any)[s.tier] + "22",
                color: (TIER_COLORS as any)[s.tier],
              }}
            >
              {s.tier}
            </span>
            <BrawlerPortrait
              name={s.brawler.name}
              iconUrl={s.brawler.iconUrl}
              externalId={s.brawler.externalId}
              size="sm"
            />
            <span className="text-sm font-medium truncate">
              {s.brawler.name}
            </span>
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-md w-fit"
              style={{
                background: (TYPE_COLORS as any)[s.brawler.type] + "22",
                color: (TYPE_COLORS as any)[s.brawler.type],
              }}
            >
              {(TYPE_LABELS as any)[s.brawler.type] || s.brawler.type}
            </span>
            <span
              className="text-sm font-semibold font-mono text-right"
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
            <span className="text-sm text-right text-text-secondary font-mono">
              {s.pickRate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
