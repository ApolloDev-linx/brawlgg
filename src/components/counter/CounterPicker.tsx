"use client";

import { useState, useMemo } from "react";
import { computeCounters } from "@/services/counter-engine";
import {
  COUNTER_MATRIX,
  TYPE_COLORS,
  TYPE_LABELS,
  TIER_COLORS,
} from "@/lib/constants";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import type { BrawlerWithStats } from "@/types/brawler";

export function CounterPicker({
  brawlers,
}: {
  brawlers: BrawlerWithStats[];
}) {
  const [enemyPicks, setEnemyPicks] = useState<BrawlerWithStats[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const counters = useMemo(() => {
    if (enemyPicks.length === 0) return [];
    return computeCounters(enemyPicks, brawlers).slice(0, 8);
  }, [enemyPicks, brawlers]);

  function addEnemy(b: BrawlerWithStats) {
    if (enemyPicks.length < 3 && !enemyPicks.find((e) => e.id === b.id)) {
      setEnemyPicks([...enemyPicks, b]);
    }
    setShowPicker(false);
  }

  return (
    <div>
      {/* Competitive triangle */}
      <div className="bg-bg-primary border border-border rounded-xl p-4 mb-5">
        <div className="text-sm font-medium mb-3">Competitive triangle</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {(["lane", "tank", "thrower"] as const).map((type) => {
            const info = COUNTER_MATRIX[type];
            return (
              <div
                key={type}
                className="p-3 rounded-lg text-center"
                style={{
                  background: TYPE_COLORS[type] + "0a",
                  border: `1px solid ${TYPE_COLORS[type]}25`,
                }}
              >
                <div
                  className="font-medium mb-1.5"
                  style={{ color: TYPE_COLORS[type] }}
                >
                  {TYPE_LABELS[type]}
                </div>
                <div style={{ color: "#5DCAA5" }}>
                  Beats: {info.strongVs.map((t) => TYPE_LABELS[t]).join(", ")}
                </div>
                <div style={{ color: "#F09595" }} className="mt-0.5">
                  Loses to: {info.weakVs.map((t) => TYPE_LABELS[t]).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enemy team slots */}
      <div className="mb-5">
        <div className="text-sm font-medium mb-3">
          Enemy team (select up to 3)
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          {[0, 1, 2].map((i) => {
            const pick = enemyPicks[i];
            return (
              <div
                key={i}
                onClick={() => {
                  if (pick)
                    setEnemyPicks(enemyPicks.filter((_, idx) => idx !== i));
                }}
                className="w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
                style={{
                  border: `1.5px dashed ${pick ? TYPE_COLORS[pick.type] || "#888" : "var(--border-hover)"}`,
                  background: pick
                    ? (TYPE_COLORS[pick.type] || "#888") + "0a"
                    : "var(--bg-secondary)",
                  cursor: pick ? "pointer" : "default",
                }}
              >
                {pick ? (
                  <>
                    {/* md portrait (36px) sits cleanly inside 80x80 slot */}
                    <BrawlerPortrait
                      name={pick.name}
                      iconUrl={pick.iconUrl}
                      externalId={pick.externalId}
                      size="md"
                    />
                    <span className="text-[11px] font-medium leading-tight">
                      {pick.name}
                    </span>
                  </>
                ) : (
                  <span className="text-lg text-text-tertiary">?</span>
                )}
              </div>
            );
          })}
          {enemyPicks.length < 3 && (
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="px-4 py-2 border border-border-hover rounded-lg bg-bg-primary text-sm"
            >
              + Add brawler
            </button>
          )}
          {enemyPicks.length > 0 && (
            <button
              onClick={() => setEnemyPicks([])}
              className="px-4 py-2 rounded-lg text-xs"
              style={{
                background: "rgba(240, 149, 149, 0.1)",
                color: "#F09595",
                border: "none",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Brawler picker */}
      {showPicker && (
        <div className="bg-bg-primary border border-border rounded-xl p-4 mb-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
            {brawlers
              .filter((b) => !enemyPicks.find((e) => e.id === b.id))
              .map((b) => (
                <button
                  key={b.id}
                  onClick={() => addEnemy(b)}
                  className="p-2 border border-border rounded-lg bg-bg-secondary flex flex-col items-center gap-1 text-center transition-colors hover:border-border-hover"
                >
                  {/* md (36px) — fills the 80px tile nicely */}
                  <BrawlerPortrait
                    name={b.name}
                    iconUrl={b.iconUrl}
                    externalId={b.externalId}
                    size="md"
                  />
                  <span className="text-xs font-medium">{b.name}</span>
                  <span
                    className="text-[10px]"
                    style={{ color: TYPE_COLORS[b.type] }}
                  >
                    {TYPE_LABELS[b.type]}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Counter results */}
      {counters.length > 0 && (
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="text-sm font-medium mb-3">Recommended counters</div>
          {counters.map((c, i) => {
            const strongVsNames = enemyPicks
              .filter((e) => COUNTER_MATRIX[c.type]?.strongVs.includes(e.type))
              .map((e) => e.name);
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 py-2.5"
                style={{
                  borderBottom:
                    i < counters.length - 1
                      ? "1px solid var(--border-color)"
                      : "none",
                }}
              >
                <span className="text-xs text-text-tertiary w-4 text-right">
                  {i + 1}
                </span>
                {/* sm (26px) — same row scale as dashboard */}
                <BrawlerPortrait
                  name={c.name}
                  iconUrl={c.iconUrl}
                  externalId={c.externalId}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: TIER_COLORS[c.tier] + "22",
                        color: TIER_COLORS[c.tier],
                      }}
                    >
                      {c.tier}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: TYPE_COLORS[c.type] + "18",
                        color: TYPE_COLORS[c.type],
                      }}
                    >
                      {TYPE_LABELS[c.type]}
                    </span>
                  </div>
                  {strongVsNames.length > 0 && (
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: "#5DCAA5" }}
                    >
                      Strong vs: {strongVsNames.join(", ")}
                    </div>
                  )}
                  {c.reasons.length > 0 && (
                    <div className="text-[11px] text-text-tertiary mt-0.5">
                      {c.reasons[0]}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className="text-sm font-medium"
                    style={{
                      color:
                        c.counterScore > 3
                          ? "#5DCAA5"
                          : c.counterScore > 1
                            ? "#EF9F27"
                            : "var(--text-secondary)",
                    }}
                  >
                    {c.counterScore > 0 ? "+" : ""}
                    {c.counterScore}
                  </div>
                  <div className="text-[10px] text-text-tertiary">score</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
