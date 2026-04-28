"use client";

import { useMemo, useState } from "react";
import {
  TIER_COLORS,
  TYPE_COLORS,
  TYPE_LABELS,
  MODE_ICONS,
  MODE_COLORS,
} from "@/lib/constants";
import {
  pickFirstPick,
  pickSafest,
  pickHighRiskHighReward,
} from "@/lib/stats-utils";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import { MapImage } from "@/components/MapImage";

/* -------------------------------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------------------------------- */

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
  imageUrl: string | null;
  gameMode: { id: string; name: string; icon: string };
  brawlerStats: BrawlerStat[];
}

interface ModeData {
  id: string;
  name: string;
  icon: string;
}

type Layout = "grouped" | "flat";

/* -------------------------------------------------------------------------- */
/* SAFE HELPERS */
/* -------------------------------------------------------------------------- */

const FALLBACK_MODE_COLOR = "#B4B2A9";

function safeLookup<T>(
  obj: Record<string, T> | undefined,
  key: string,
  fallback: T
): T {
  if (!obj || typeof obj !== "object") return fallback;
  return obj[key] ?? fallback;
}

function modeColor(modeName: string): string {
  return safeLookup(MODE_COLORS, modeName, FALLBACK_MODE_COLOR);
}

function modeGlyph(modeName: string): string {
  return safeLookup(
    MODE_ICONS,
    modeName,
    modeName.slice(0, 2).toUpperCase()
  );
}

/* safer top pick */
function getTopBrawler(stats: BrawlerStat[]): BrawlerStat | null {
  if (!stats || stats.length === 0) return null;

  return (
    stats.find((b) => b.isReal) ||
    stats.reduce((best, curr) =>
      curr.winRate > best.winRate ? curr : best
    )
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN COMPONENT */
/* -------------------------------------------------------------------------- */

export function MapList({
  maps,
  modes,
}: {
  maps: MapData[];
  modes: ModeData[];
}) {
  const [modeFilter, setModeFilter] = useState("All");
  const [layout, setLayout] = useState<Layout>("grouped");
  const [selectedMap, setSelectedMap] = useState<MapData | null>(null);

  const filtered = useMemo(() => {
    if (modeFilter === "All") return maps;
    return maps.filter((m) => m.gameMode.name === modeFilter);
  }, [maps, modeFilter]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, MapData[]>();

    for (const m of filtered) {
      const key = m.gameMode.name;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(m);
    }

    return Array.from(buckets.entries())
      .map(([name, maps]) => ({ name, maps }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  if (selectedMap) {
    return <MapDetail map={selectedMap} onBack={() => setSelectedMap(null)} />;
  }

  const showSections = layout === "grouped" && modeFilter === "All";

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1.5 flex-wrap flex-1">
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

        <LayoutToggle value={layout} onChange={setLayout} />
      </div>

      {showSections ? (
        <div className="flex flex-col gap-6">
          {grouped.map(({ name, maps }) => (
            <ModeSection
              key={name}
              modeName={name}
              maps={maps}
              onSelect={setSelectedMap}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((map) => (
            <MapCard key={map.id} map={map} onClick={() => setSelectedMap(map)} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="p-6 text-center text-sm text-text-secondary">
          No maps match this filter.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MODE SECTION */
/* -------------------------------------------------------------------------- */

function ModeSection({
  modeName,
  maps,
  onSelect,
}: {
  modeName: string;
  maps: MapData[];
  onSelect: (m: MapData) => void;
}) {
  const color = modeColor(modeName);
  const glyph = modeGlyph(modeName);

  return (
    <section>
      <header
        className="flex items-center gap-2 px-3 py-2 mb-3 rounded-r-md"
        style={{
          background: color + "10",
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color }}>
          {glyph}
        </span>
        <span className="text-sm font-medium" style={{ color }}>
          {modeName}
        </span>
        <span className="ml-auto text-xs text-text-tertiary">
          {maps.length} maps
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {maps.map((map) => (
          <MapCard key={map.id} map={map} onClick={() => onSelect(map)} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* MAP CARD */
/* -------------------------------------------------------------------------- */

function MapCard({
  map,
  onClick,
}: {
  map: MapData;
  onClick: () => void;
}) {
  const top = getTopBrawler(map.brawlerStats);
  const color = modeColor(map.gameMode.name);

  return (
    <button
      onClick={onClick}
      className="border rounded-xl overflow-hidden flex flex-col transition"
      style={{ ["--hover-color" as any]: color }}
    >
      <div className="relative">
        <MapImage name={map.name} imageUrl={map.imageUrl} modeName={map.gameMode.name} size="portrait" />

        {top && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/80">
            <BrawlerPortrait
              name={top.brawler.name}
              iconUrl={top.brawler.iconUrl}
              externalId={top.brawler.externalId}
              size="xs"
            />
            <span className="text-xs font-mono">{top.winRate}%</span>
          </div>
        )}

        <span className="absolute bottom-2 left-2 text-xs font-mono">
          {modeGlyph(map.gameMode.name)}
        </span>
      </div>

      <div className="p-3">
        <div className="text-sm font-medium">{map.name}</div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* TOGGLES */
/* -------------------------------------------------------------------------- */

function LayoutToggle({
  value,
  onChange,
}: {
  value: Layout;
  onChange: (v: Layout) => void;
}) {
  return (
    <div className="flex border rounded-lg overflow-hidden">
      <ToggleButton active={value === "grouped"} onClick={() => onChange("grouped")}>
        Grouped
      </ToggleButton>
      <ToggleButton active={value === "flat"} onClick={() => onChange("flat")}>
        Flat
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: any) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs"
      style={{
        background: active ? "white" : "transparent",
        color: active ? "black" : "gray",
      }}
    >
      {children}
    </button>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: any) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded text-xs border"
      style={{
        background: active ? "white" : "transparent",
        color: active ? "black" : "gray",
      }}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* MAP DETAIL (UNCHANGED CORE) */
/* -------------------------------------------------------------------------- */

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
      {/* Back */}
      <button
        onClick={onBack}
        className="text-sm text-text-secondary hover:text-text-primary mb-4 bg-transparent border-none p-0"
      >
        &larr; Back to maps
      </button>

      {/* Hero */}
      <div className="mb-5">
        <MapImage
          name={map.name}
          imageUrl={map.imageUrl}
          modeName={map.gameMode.name}
          size="hero"
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs font-mono bg-bg-secondary px-2 py-1 rounded text-text-tertiary">
          {modeGlyph(map.gameMode.name)}
        </span>
        <div>
          <h2 className="text-lg font-medium">{map.name}</h2>
          <span className="text-sm text-text-secondary">
            {map.gameMode.name}
          </span>
        </div>
      </div>

      {/* Picks */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {firstPick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-[10px] text-text-tertiary uppercase mb-2">
              Best first pick
            </div>
            <div className="text-base font-medium text-yellow-400">
              {firstPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary font-mono">
              {firstPick.winRate}% WR · {firstPick.pickRate}% pick
            </div>
          </div>
        )}

        {safePick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-[10px] text-text-tertiary uppercase mb-2">
              Safest pick
            </div>
            <div className="text-base font-medium text-green-400">
              {safePick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary font-mono">
              {safePick.winRate}% WR · {safePick.pickRate}% pick
            </div>
          </div>
        )}

        {riskPick && (
          <div className="bg-bg-secondary rounded-lg p-4">
            <div className="text-[10px] text-text-tertiary uppercase mb-2">
              High risk / reward
            </div>
            <div className="text-base font-medium text-pink-400">
              {riskPick.brawler.name}
            </div>
            <div className="text-[11px] text-text-tertiary font-mono">
              {riskPick.winRate}% WR · {riskPick.pickRate}% pick (niche)
            </div>
          </div>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-3">
          Top brawlers on {map.name}
        </div>

        <div className="grid grid-cols-[20px_28px_28px_1fr_120px_60px_56px] gap-3 text-[10px] text-text-tertiary pb-2 border-b">
          <span>#</span>
          <span></span>
          <span></span>
          <span>Brawler</span>
          <span>Type</span>
          <span className="text-right">Win%</span>
          <span className="text-right">Pick%</span>
        </div>

        {stats.map((s, i) => {
          const tierColor = safeLookup(TIER_COLORS as any, s.tier, "#888");

          return (
            <div
              key={s.id}
              className="grid grid-cols-[20px_28px_28px_1fr_120px_60px_56px] gap-3 items-center py-2 border-b last:border-none"
            >
              <span className="text-xs font-mono">{i + 1}</span>

              <span
                className="text-xs font-semibold rounded w-[22px] h-[22px] flex items-center justify-center"
                style={{
                  background: tierColor + "22",
                  color: tierColor,
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

              <span className="text-sm truncate">
                {s.brawler.name}
              </span>

              <span
                className="text-[11px] px-2 py-0.5 rounded"
                style={{
                  background:
                    safeLookup(TYPE_COLORS as any, s.brawler.type, "#555") + "22",
                  color: safeLookup(TYPE_COLORS as any, s.brawler.type, "#ccc"),
                }}
              >
                {safeLookup(TYPE_LABELS as any, s.brawler.type, s.brawler.type)}
              </span>

              <span className="text-sm font-mono text-right">
                {s.winRate}%
              </span>

              <span className="text-sm text-right font-mono">
                {s.pickRate}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
