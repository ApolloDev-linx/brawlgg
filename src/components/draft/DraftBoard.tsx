"use client";

import { useState, useMemo } from "react";
import { suggestPick, computeAdvantage } from "@/services/draft-engine";
import { TIER_COLORS, TYPE_COLORS } from "@/lib/constants";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import type { BrawlerWithStats } from "@/types/brawler";
import type { DraftState } from "@/types/meta";

const MAX_BANS = 4;

export function DraftBoard({
  brawlers,
}: {
  brawlers: BrawlerWithStats[];
}) {
  const [bans, setBans] = useState<string[]>([]);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [enemyPicks, setEnemyPicks] = useState<string[]>([]);
  const [phase, setPhase] = useState<"ban" | "pick">("ban");
  const [turn, setTurn] = useState<"my" | "enemy">("my");

  const brawlerMap = useMemo(() => {
    const m = new Map<string, BrawlerWithStats>();
    brawlers.forEach((b) => m.set(b.id, b));
    return m;
  }, [brawlers]);

  const unavailable = new Set([...bans, ...myPicks, ...enemyPicks]);
  const available = brawlers.filter((b) => !unavailable.has(b.id));

  const draftState: DraftState = {
    bans,
    myPicks,
    enemyPicks,
    currentPhase: phase,
    currentTurn: turn,
  };

  const suggestions = useMemo(
    () => suggestPick(draftState, brawlers),
    [bans, myPicks, enemyPicks, phase, turn, brawlers]
  );

  const myBrawlers = myPicks
    .map((id) => brawlerMap.get(id))
    .filter(Boolean) as BrawlerWithStats[];
  const enemyBrawlers = enemyPicks
    .map((id) => brawlerMap.get(id))
    .filter(Boolean) as BrawlerWithStats[];
  const advantage = computeAdvantage(myBrawlers, enemyBrawlers);

  const done = myPicks.length === 3 && enemyPicks.length === 3;

  function handlePick(b: BrawlerWithStats) {
    if (done) return;
    if (phase === "ban") {
      const newBans = [...bans, b.id];
      setBans(newBans);
      if (newBans.length >= MAX_BANS) {
        setPhase("pick");
        setTurn("my");
      } else {
        setTurn(turn === "my" ? "enemy" : "my");
      }
    } else {
      if (turn === "my" && myPicks.length < 3) {
        setMyPicks([...myPicks, b.id]);
        setTurn("enemy");
      } else if (turn === "enemy" && enemyPicks.length < 3) {
        setEnemyPicks([...enemyPicks, b.id]);
        setTurn("my");
      }
    }
  }

  function reset() {
    setBans([]);
    setMyPicks([]);
    setEnemyPicks([]);
    setPhase("ban");
    setTurn("my");
  }

  return (
    <div>
      {/* Status bar */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-secondary">
          Phase:{" "}
          <span
            className="font-medium"
            style={{ color: phase === "ban" ? "#ED93B1" : "#5DCAA5" }}
          >
            {phase === "ban"
              ? "Banning"
              : `Picking -- ${turn === "my" ? "Your" : "Enemy"} turn`}
          </span>
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 border border-border rounded-lg text-xs text-text-secondary bg-bg-primary"
        >
          Reset draft
        </button>
      </div>

      {/* Teams display */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 mb-5">
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="text-xs font-medium mb-2" style={{ color: "#5DCAA5" }}>
            Your team
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => {
              const b = myPicks[i] ? brawlerMap.get(myPicks[i]) : null;
              return <Slot key={i} brawler={b || null} color="#5DCAA5" />;
            })}
          </div>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-[11px] text-text-tertiary">Advantage</span>
          <span
            className="text-lg font-medium"
            style={{
              color:
                advantage > 0
                  ? "#5DCAA5"
                  : advantage < 0
                    ? "#F09595"
                    : "var(--text-secondary)",
            }}
          >
            {advantage > 0 ? "+" : ""}
            {advantage}
          </span>
          {bans.length > 0 && (
            <div className="flex gap-1 mt-1">
              {bans.map((id) => {
                const b = brawlerMap.get(id);
                return (
                  <span
                    key={id}
                    className="text-[10px] text-text-tertiary line-through"
                  >
                    {b?.name.slice(0, 3)}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="text-xs font-medium mb-2" style={{ color: "#F09595" }}>
            Enemy team
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => {
              const b = enemyPicks[i]
                ? brawlerMap.get(enemyPicks[i])
                : null;
              return <Slot key={i} brawler={b || null} color="#F09595" />;
            })}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && !done && (
        <div
          className="rounded-lg p-3 mb-4 text-xs"
          style={{
            background: "rgba(133, 183, 235, 0.08)",
            border: "1px solid rgba(133, 183, 235, 0.2)",
          }}
        >
          <span className="font-medium" style={{ color: "#85B7EB" }}>
            Suggested {phase === "ban" ? "bans" : "picks"}:{" "}
          </span>
          {suggestions.map((s, i) => (
            <span key={s.brawler.id} style={{ color: "#85B7EB" }}>
              {s.brawler.name}
              {i < suggestions.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}

      {/* Done state */}
      {done ? (
        <div className="text-center py-8 bg-bg-primary border border-border rounded-xl">
          <div className="text-base font-medium mb-2">Draft complete</div>
          <div
            className="text-sm"
            style={{
              color:
                advantage > 0
                  ? "#5DCAA5"
                  : advantage < 0
                    ? "#F09595"
                    : "var(--text-secondary)",
            }}
          >
            {advantage > 0
              ? "Your team has the advantage"
              : advantage < 0
                ? "Enemy team has the advantage"
                : "Evenly matched"}
          </div>
          <button
            onClick={reset}
            className="mt-4 px-5 py-2 border border-border rounded-lg text-sm bg-bg-primary"
          >
            New draft
          </button>
        </div>
      ) : (
        /* Brawler picker grid */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
          {available.map((b) => (
            <button
              key={b.id}
              onClick={() => handlePick(b)}
              className="p-2 border border-border rounded-lg bg-bg-secondary flex flex-col items-center gap-1 transition-colors hover:border-border-hover"
            >
              {/* sm (26px) — fits cleanly in 72px tiles */}
              <BrawlerPortrait
                name={b.name}
                iconUrl={b.iconUrl}
                externalId={b.externalId}
                size="sm"
              />
              <span className="text-xs font-medium">{b.name}</span>
              <span
                className="text-[10px] px-1 rounded"
                style={{
                  background: TIER_COLORS[b.tier] + "22",
                  color: TIER_COLORS[b.tier],
                }}
              >
                {b.tier}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Slot({
  brawler,
  color,
}: {
  brawler: BrawlerWithStats | null;
  color: string;
}) {
  return (
    // h-20 (was h-[68px]) — bumped to fit portrait + name + winrate without crowding
    <div
      className="w-16 h-20 rounded-lg flex flex-col items-center justify-center gap-0.5"
      style={{
        border: `1.5px dashed ${brawler ? color : "var(--border-hover)"}`,
        background: brawler ? color + "08" : "var(--bg-secondary)",
      }}
    >
      {brawler ? (
        <>
          <BrawlerPortrait
            name={brawler.name}
            iconUrl={brawler.iconUrl}
            externalId={brawler.externalId}
            size="sm"
          />
          <span className="text-[11px] font-medium leading-tight">
            {brawler.name}
          </span>
          <span className="text-[10px] text-text-secondary leading-tight">
            {brawler.winRate}%
          </span>
        </>
      ) : (
        <span className="text-text-tertiary">?</span>
      )}
    </div>
  );
}
