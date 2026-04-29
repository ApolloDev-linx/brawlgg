"use client";

import { useState, useMemo } from "react";
import { suggestPick, computeAdvantage } from "@/services/draft-engine";
import { TIER_COLORS } from "@/lib/constants";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import type { BrawlerWithStats } from "@/types/brawler";
import type { DraftState } from "@/types/meta";

/* -------------------------------------------------------------------------- */
/* Draft constants                                                            */
/* -------------------------------------------------------------------------- */
//
// Ranked Brawl Stars uses 3 bans per side (6 total). Bumped from the
// previous 4 so the horseshoe arc has clean 3-per-side symmetry and the
// flow matches what the user actually sees in-game.
//
// Ban order alternates teams: my, enemy, my, enemy, my, enemy.
// Pick order alternates: my, enemy, my, enemy, my, enemy.
// (First-pick advantage is a real thing in BS — keeping "my" first
// keeps the suggestion UX honest: when the panel says "your turn",
// it really is your strategic decision to make.)

const MAX_BANS = 6;
const MAX_PICKS_PER_SIDE = 3;

// Side colors — kept identical to the previous version so anywhere else
// in the app that uses #5DCAA5 / #F09595 (the methodology page, the
// counter rows) stays visually coherent with the draft board.
const COLOR_MY = "#5DCAA5";
const COLOR_ENEMY = "#F09595";

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

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

  const done =
    myPicks.length === MAX_PICKS_PER_SIDE &&
    enemyPicks.length === MAX_PICKS_PER_SIDE;

  // Which ban slot is "next"? Slots alternate my/enemy by index parity:
  // even index = my team's ban, odd index = enemy team's ban.
  // The active slot is bans.length (zero-indexed), gated by current turn.
  const nextBanIndex = phase === "ban" ? bans.length : -1;
  const nextMyPickIndex =
    phase === "pick" && turn === "my" ? myPicks.length : -1;
  const nextEnemyPickIndex =
    phase === "pick" && turn === "enemy" ? enemyPicks.length : -1;

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
      if (turn === "my" && myPicks.length < MAX_PICKS_PER_SIDE) {
        setMyPicks([...myPicks, b.id]);
        setTurn("enemy");
      } else if (
        turn === "enemy" &&
        enemyPicks.length < MAX_PICKS_PER_SIDE
      ) {
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

  // Ban-slot owner by index (0,2,4 = my; 1,3,5 = enemy). Used both for
  // the pulse color and so a hypothetical "remove ban" feature later
  // can know whose ban it was.
  const banOwner = (i: number): "my" | "enemy" => (i % 2 === 0 ? "my" : "enemy");

  const phaseLabel = done
    ? "Draft complete"
    : phase === "ban"
      ? `Ban phase · ${turn === "my" ? "your" : "enemy"} turn`
      : `Pick phase · ${turn === "my" ? "your" : "enemy"} turn`;

  return (
    <div>
      {/* Status bar — kept simple, info now lives in the arena viz */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-secondary">
          <span
            className="font-medium"
            style={{
              color: done
                ? "var(--text-primary)"
                : phase === "ban"
                  ? "#ED93B1"
                  : turn === "my"
                    ? COLOR_MY
                    : COLOR_ENEMY,
            }}
          >
            {phaseLabel}
          </span>
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 border border-border rounded-lg text-xs text-text-secondary bg-bg-primary"
        >
          Reset draft
        </button>
      </div>

      {/* The arena — bans arc, advantage gauge, facing pick rosters */}
      <DraftArena
        bans={bans}
        myPicks={myPicks}
        enemyPicks={enemyPicks}
        brawlerMap={brawlerMap}
        advantage={advantage}
        nextBanIndex={nextBanIndex}
        nextMyPickIndex={nextMyPickIndex}
        nextEnemyPickIndex={nextEnemyPickIndex}
        banOwner={banOwner}
      />

      {/* Suggestions — three contextual cards instead of one comma line.
          Uses the `reason` field that the engine already returns and the
          old UI wasn't displaying. */}
      {suggestions.length > 0 && !done && (
        <SuggestionCards
          suggestions={suggestions}
          phase={phase}
          turn={turn}
          onPick={handlePick}
        />
      )}

      {/* Done state */}
      {done ? (
        <div className="text-center py-8 bg-bg-primary border border-border rounded-xl mt-5">
          <div className="text-base font-medium mb-2">Draft complete</div>
          <div
            className="text-sm"
            style={{
              color:
                advantage > 0
                  ? COLOR_MY
                  : advantage < 0
                    ? COLOR_ENEMY
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
        /* Brawler picker grid — unchanged */
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
          {available.map((b) => (
            <button
              key={b.id}
              onClick={() => handlePick(b)}
              className="p-2 border border-border rounded-lg bg-bg-secondary flex flex-col items-center gap-1 transition-colors hover:border-border-hover"
            >
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

/* -------------------------------------------------------------------------- */
/* DraftArena — bans-as-horseshoe + needle gauge + facing rosters             */
/* -------------------------------------------------------------------------- */
//
// Layout:
//                    ┌────────  BANS  ────────┐
//                   [b0][b1][b2][b3][b4][b5]
//
//    YOUR TEAM                                 ENEMY TEAM
//   [p0][p1][p2]      [needle gauge]          [p0][p1][p2]
//                       advantage
//
// The bans slots are laid out in a single row (not literally a curve —
// I tried Bezier-positioning and it made the avatars hard to scan).
// The "horseshoe" feel comes from the dashed arc above the row, which
// is purely decorative but communicates the cycle-of-six idea.
//
// Pulse animation lives in a single keyframe block at the SVG root and
// is applied via CSS classes. Easier to reason about than per-element
// inline animations and lets the same keyframe color two different
// pulse classes.

function DraftArena({
  bans,
  myPicks,
  enemyPicks,
  brawlerMap,
  advantage,
  nextBanIndex,
  nextMyPickIndex,
  nextEnemyPickIndex,
  banOwner,
}: {
  bans: string[];
  myPicks: string[];
  enemyPicks: string[];
  brawlerMap: Map<string, BrawlerWithStats>;
  advantage: number;
  nextBanIndex: number;
  nextMyPickIndex: number;
  nextEnemyPickIndex: number;
  banOwner: (i: number) => "my" | "enemy";
}) {
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4 mb-5 relative overflow-hidden">
      {/* Single keyframe block — both pulse classes reference the same
          rhythm but with different ring colors */}
      <style>{`
        @keyframes draft-pulse-my {
          0%, 100% { box-shadow: 0 0 0 0 ${COLOR_MY}b3; }
          50%      { box-shadow: 0 0 0 7px ${COLOR_MY}00; }
        }
        @keyframes draft-pulse-enemy {
          0%, 100% { box-shadow: 0 0 0 0 ${COLOR_ENEMY}b3; }
          50%      { box-shadow: 0 0 0 7px ${COLOR_ENEMY}00; }
        }
        .draft-pulse-my    { animation: draft-pulse-my    1.6s ease-out infinite; }
        .draft-pulse-enemy { animation: draft-pulse-enemy 1.6s ease-out infinite; }
      `}</style>

      {/* Bans — horseshoe row */}
      <div className="flex flex-col items-center gap-1.5 mb-4">
        <div className="text-[10px] text-text-tertiary tracking-[0.2em]">
          BANS
        </div>
        {/* Decorative arc — the "horseshoe". Pure ornament, dashed grey. */}
        <svg
          viewBox="0 0 240 16"
          className="w-[90%] max-w-md"
          aria-hidden="true"
          style={{ overflow: "visible" }}
        >
          <path
            d="M 8,16 Q 120,-8 232,16"
            fill="none"
            stroke="var(--border-color)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        </svg>
        <div className="flex gap-2 flex-wrap justify-center">
          {Array.from({ length: MAX_BANS }).map((_, i) => {
            const id = bans[i];
            const brawler = id ? brawlerMap.get(id) : null;
            const owner = banOwner(i);
            const isNext = i === nextBanIndex;
            return (
              <BanSlot
                key={i}
                brawler={brawler ?? null}
                owner={owner}
                pulse={isNext}
              />
            );
          })}
        </div>
      </div>

      {/* Teams + gauge */}
      <div className="grid grid-cols-[1fr_minmax(120px,160px)_1fr] gap-3 items-center">
        {/* My team — left, slots flex-end so they hug the gauge */}
        <div>
          <div
            className="text-[10px] tracking-[0.2em] mb-1.5 text-right"
            style={{ color: COLOR_MY }}
          >
            YOUR TEAM
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            {Array.from({ length: MAX_PICKS_PER_SIDE }).map((_, i) => {
              const id = myPicks[i];
              const brawler = id ? brawlerMap.get(id) : null;
              const isNext = i === nextMyPickIndex;
              return (
                <PickSlot
                  key={i}
                  brawler={brawler ?? null}
                  side="my"
                  pulse={isNext}
                />
              );
            })}
          </div>
        </div>

        {/* Center — advantage gauge */}
        <AdvantageGauge advantage={advantage} />

        {/* Enemy team — right */}
        <div>
          <div
            className="text-[10px] tracking-[0.2em] mb-1.5 text-left"
            style={{ color: COLOR_ENEMY }}
          >
            ENEMY TEAM
          </div>
          <div className="flex gap-2 justify-start flex-wrap">
            {Array.from({ length: MAX_PICKS_PER_SIDE }).map((_, i) => {
              const id = enemyPicks[i];
              const brawler = id ? brawlerMap.get(id) : null;
              const isNext = i === nextEnemyPickIndex;
              return (
                <PickSlot
                  key={i}
                  brawler={brawler ?? null}
                  side="enemy"
                  pulse={isNext}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AdvantageGauge — horizontal needle from -5 to +5                           */
/* -------------------------------------------------------------------------- */
//
// The needle position maps advantage to [-1, +1] of half-width. Clamped
// at ±5pp, which is roughly the practical range — three S-tier picks
// vs three C-tier picks would push around 4–5pp delta. Anything beyond
// that pegs the needle but the number underneath still shows the truth.
//
// Track is three flat rects (no SVG linearGradients) so the streaming
// render stays clean. Center hairline gives the "zero" reference
// visually without needing a label.

function AdvantageGauge({ advantage }: { advantage: number }) {
  const RANGE = 5;
  const clamped = Math.max(-RANGE, Math.min(RANGE, advantage));
  const pct = clamped / RANGE; // [-1, 1]
  const needleX = 110 + pct * 90; // viewBox is 220 wide; center at 110

  const color =
    advantage > 0
      ? COLOR_MY
      : advantage < 0
        ? COLOR_ENEMY
        : "var(--text-secondary)";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] text-text-tertiary tracking-[0.2em]">
        ADVANTAGE
      </div>
      <svg
        viewBox="0 0 220 50"
        className="w-full"
        style={{ overflow: "visible" }}
        role="img"
        aria-label={`Advantage ${advantage > 0 ? "+" : ""}${advantage}`}
      >
        {/* Track — three flat rects fading toward the colored ends */}
        <rect
          x="20"
          y="18"
          width="60"
          height="14"
          rx="7"
          fill={COLOR_ENEMY + "26"}
        />
        <rect
          x="80"
          y="18"
          width="60"
          height="14"
          fill="var(--bg-tertiary)"
        />
        <rect
          x="140"
          y="18"
          width="60"
          height="14"
          rx="7"
          fill={COLOR_MY + "26"}
        />
        {/* Center hairline — "zero" reference */}
        <line
          x1="110"
          y1="14"
          x2="110"
          y2="36"
          stroke="var(--border-color)"
          strokeWidth="1"
        />

        {/* Needle */}
        <g
          transform={`translate(${needleX}, 25)`}
          style={{ transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        >
          <line
            y1="-13"
            y2="13"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle r="3.5" fill={color} />
        </g>

        {/* Numeric readout below */}
        <text
          x="110"
          y="48"
          textAnchor="middle"
          fontSize="13"
          fontWeight="500"
          fill={color}
          fontFamily="ui-monospace, monospace"
        >
          {advantage > 0 ? "+" : ""}
          {advantage}
        </text>
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BanSlot — square, gray, diagonal red slash when filled                     */
/* -------------------------------------------------------------------------- */

function BanSlot({
  brawler,
  owner,
  pulse,
}: {
  brawler: BrawlerWithStats | null;
  owner: "my" | "enemy";
  pulse: boolean;
}) {
  const ownerColor = owner === "my" ? COLOR_MY : COLOR_ENEMY;
  const pulseClass = pulse
    ? owner === "my"
      ? "draft-pulse-my"
      : "draft-pulse-enemy"
    : "";

  if (!brawler) {
    return (
      <div
        className={`w-12 h-12 rounded-lg flex items-center justify-center ${pulseClass}`}
        style={{
          border: pulse
            ? `1.5px solid ${ownerColor}`
            : "1.5px dashed var(--border-hover)",
          background: pulse ? ownerColor + "0d" : "var(--bg-secondary)",
          color: "var(--text-tertiary)",
          fontSize: 10,
        }}
        aria-label={`Empty ban slot for ${owner === "my" ? "your" : "enemy"} team`}
      >
        ?
      </div>
    );
  }

  return (
    <div
      className="w-12 h-12 rounded-lg relative overflow-hidden flex items-center justify-center"
      style={{
        border: "1px solid var(--border-color)",
        background: "var(--bg-tertiary)",
        opacity: 0.85,
      }}
      title={`Banned: ${brawler.name}`}
    >
      <div style={{ filter: "grayscale(0.6)" }}>
        <BrawlerPortrait
          name={brawler.name}
          iconUrl={brawler.iconUrl}
          externalId={brawler.externalId}
          size="sm"
        />
      </div>
      {/* Diagonal slash — the universal "banned" mark */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: -2,
          right: -2,
          height: 1.5,
          background: COLOR_ENEMY,
          transform: "rotate(-22deg)",
          opacity: 0.85,
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PickSlot — facing slots, colored by side                                   */
/* -------------------------------------------------------------------------- */

function PickSlot({
  brawler,
  side,
  pulse,
}: {
  brawler: BrawlerWithStats | null;
  side: "my" | "enemy";
  pulse: boolean;
}) {
  const sideColor = side === "my" ? COLOR_MY : COLOR_ENEMY;
  const pulseClass = pulse
    ? side === "my"
      ? "draft-pulse-my"
      : "draft-pulse-enemy"
    : "";

  return (
    <div
      className={`w-16 h-20 rounded-lg flex flex-col items-center justify-center gap-0.5 ${pulseClass}`}
      style={{
        border: `1.5px ${brawler ? "solid" : "dashed"} ${
          brawler || pulse ? sideColor : "var(--border-hover)"
        }`,
        background: brawler ? sideColor + "10" : "var(--bg-secondary)",
        transition: "all 200ms",
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
          <span className="text-[11px] font-medium leading-tight truncate w-full text-center px-1">
            {brawler.name}
          </span>
          <span className="text-[10px] text-text-secondary leading-tight font-mono">
            {brawler.winRate}%
          </span>
        </>
      ) : (
        <span className="text-text-tertiary">?</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SuggestionCards — three click-to-pick cards using DraftSuggestion.reason   */
/* -------------------------------------------------------------------------- */
//
// The old UI rendered suggestions as a single comma-joined string and
// quietly threw away the `reason` field that draft-engine returns. The
// reason is the most actionable thing in the response ("Mortis counters
// Poco: gap-closer into squishy targets") — putting it back surfaces
// the engine's actual logic.
//
// Cards are clickable shortcuts: tapping one applies that pick as if the
// user had searched for it in the picker grid. Saves a scroll.

function SuggestionCards({
  suggestions,
  phase,
  turn,
  onPick,
}: {
  suggestions: { brawler: BrawlerWithStats; score: number; reason: string }[];
  phase: "ban" | "pick";
  turn: "my" | "enemy";
  onPick: (b: BrawlerWithStats) => void;
}) {
  const heading =
    phase === "ban"
      ? "Suggested bans"
      : turn === "my"
        ? "Suggested picks for you"
        : "Threats to expect";

  return (
    <div
      className="rounded-xl p-3 mb-1"
      style={{
        background: "rgba(133, 183, 235, 0.06)",
        border: "1px solid rgba(133, 183, 235, 0.18)",
      }}
    >
      <div
        className="text-xs font-medium mb-2"
        style={{ color: "#85B7EB" }}
      >
        {heading}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {suggestions.map((s) => (
          <button
            key={s.brawler.id}
            onClick={() => onPick(s.brawler)}
            className="flex items-center gap-2 p-2 rounded-lg border border-border bg-bg-primary text-left transition-colors hover:border-border-hover"
          >
            <BrawlerPortrait
              name={s.brawler.name}
              iconUrl={s.brawler.iconUrl}
              externalId={s.brawler.externalId}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">
                  {s.brawler.name}
                </span>
                <span
                  className="text-[9px] px-1 rounded shrink-0"
                  style={{
                    background: TIER_COLORS[s.brawler.tier] + "22",
                    color: TIER_COLORS[s.brawler.tier],
                  }}
                >
                  {s.brawler.tier}
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary truncate">
                {s.reason}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
