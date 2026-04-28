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
import type { BrawlerType, BrawlerWithStats } from "@/types/brawler";

/* -------------------------------------------------------------------------- */
/* TYPE-GROUP ABSTRACTION                                                     */
/* -------------------------------------------------------------------------- */
//
// The 5-type COUNTER_MATRIX collapses into a clean 3-group cycle:
//
//   CONTROL (lane)              beats MELEE  (tank+assassin)
//   MELEE   (tank+assassin)     beats RANGED (thrower+sniper)
//   RANGED  (thrower+sniper)    beats CONTROL (lane)
//
// Within-group nuance (tank > assassin in a head-to-head) still lives in
// COUNTER_MATRIX and is what the counter-engine actually scores against.
// The triangle is a TEACHING surface — it shows the cycle, not the full
// 5x5 matchup graph. The recommended-counters list below it is the source
// of truth for actual picks, since it uses the full matrix + win rates.

type Group = "control" | "melee" | "ranged";

const TYPE_GROUPS: Record<
  Group,
  {
    label: string;
    types: BrawlerType[];
    color: string;
    desc: string;
  }
> = {
  control: {
    label: "Control",
    types: ["lane"],
    color: TYPE_COLORS.lane,
    desc: "Mid-range zone",
  },
  melee: {
    label: "Melee",
    types: ["tank", "assassin"],
    color: TYPE_COLORS.tank,
    desc: "Close-range burst",
  },
  ranged: {
    label: "Ranged",
    types: ["thrower", "sniper"],
    color: TYPE_COLORS.sniper,
    desc: "Long-range poke",
  },
};

function typeToGroup(type: BrawlerType): Group {
  if (TYPE_GROUPS.control.types.includes(type)) return "control";
  if (TYPE_GROUPS.melee.types.includes(type)) return "melee";
  return "ranged";
}

// Counter accent — gold from the existing accent palette. Picked because
// it doesn't collide with any TYPE_COLOR (teal/red/pink/yellow/blue), so
// the "your pick" highlight reads as guidance rather than another type.
const COUNTER_ACCENT = "#EF9F27";

/* -------------------------------------------------------------------------- */
/* MAIN COMPONENT                                                             */
/* -------------------------------------------------------------------------- */

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

  // Triangle state — derived from enemyPicks.
  //
  //   threatGroups  = groups that contain at least one enemy
  //   counterGroups = group(s) that beat the most-weighted threat. In ties
  //                   (e.g. 1 lane + 1 tank), multiple groups share the
  //                   spotlight and the user gets honest "split" guidance.
  const triangle = useMemo(() => {
    const counts: Record<Group, number> = { control: 0, melee: 0, ranged: 0 };
    for (const e of enemyPicks) {
      counts[typeToGroup(e.type)]++;
    }
    // Each group's "counter score" = enemy weight in the group it beats.
    // control beats melee, melee beats ranged, ranged beats control.
    const counterScores: Record<Group, number> = {
      control: counts.melee,
      melee: counts.ranged,
      ranged: counts.control,
    };
    const maxScore = Math.max(...Object.values(counterScores));
    const counterGroups: Set<Group> =
      maxScore > 0
        ? new Set(
            (Object.entries(counterScores) as [Group, number][])
              .filter(([, s]) => s === maxScore)
              .map(([g]) => g)
          )
        : new Set();
    const threatGroups: Set<Group> = new Set(
      (Object.entries(counts) as [Group, number][])
        .filter(([, c]) => c > 0)
        .map(([g]) => g)
    );
    return { counts, threatGroups, counterGroups };
  }, [enemyPicks]);

  function addEnemy(b: BrawlerWithStats) {
    if (enemyPicks.length < 3 && !enemyPicks.find((e) => e.id === b.id)) {
      setEnemyPicks([...enemyPicks, b]);
    }
    setShowPicker(false);
  }

  return (
    <div>
      {/* The actual triangle — replaces the old 3-card row */}
      <CompetitiveTriangle
        counts={triangle.counts}
        threatGroups={triangle.threatGroups}
        counterGroups={triangle.counterGroups}
        active={enemyPicks.length > 0}
      />

      {/* Enemy team slots */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-medium">Enemy team</div>
          <div className="text-[11px] text-text-tertiary">
            {enemyPicks.length} / 3 selected
          </div>
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
                className="w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative"
                style={{
                  border: `1.5px dashed ${
                    pick ? TYPE_COLORS[pick.type] || "#888" : "var(--border-hover)"
                  }`,
                  background: pick
                    ? (TYPE_COLORS[pick.type] || "#888") + "0a"
                    : "var(--bg-secondary)",
                  cursor: pick ? "pointer" : "default",
                }}
              >
                {pick ? (
                  <>
                    <BrawlerPortrait
                      name={pick.name}
                      iconUrl={pick.iconUrl}
                      externalId={pick.externalId}
                      size="md"
                    />
                    <span className="text-[11px] font-medium leading-tight">
                      {pick.name}
                    </span>
                    {/* Group dot — tiny color cue tying the slot to its
                        triangle vertex. Same hex as TYPE_GROUPS[g].color. */}
                    <span
                      className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                      style={{
                        background: TYPE_GROUPS[typeToGroup(pick.type)].color,
                      }}
                    />
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

      {/* Brawler picker — unchanged */}
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

      {/* Counter results — kept structurally identical, polished with a
          mini score bar so the relative strength reads at a glance. */}
      {counters.length > 0 && (
        <div className="bg-bg-primary border border-border rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-sm font-medium">Recommended counters</div>
            <div className="text-[11px] text-text-tertiary">
              ranked by counter score
            </div>
          </div>
          {counters.map((c, i) => {
            const strongVsNames = enemyPicks
              .filter((e) => COUNTER_MATRIX[c.type]?.strongVs.includes(e.type))
              .map((e) => e.name);
            const scoreColor =
              c.counterScore > 3
                ? "#5DCAA5"
                : c.counterScore > 1
                  ? "#EF9F27"
                  : "var(--text-secondary)";
            // Score bar — max plausible is +6 (3 enemies × +2). Negative
            // scores collapse to 0% width and the bar disappears, which
            // is the right visual: bad counters get no bar at all.
            const barPct = Math.max(
              0,
              Math.min(100, (c.counterScore / 6) * 100)
            );
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
                <span className="text-xs text-text-tertiary w-4 text-right font-mono">
                  {i + 1}
                </span>
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
                    <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
                      {c.reasons[0]}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 w-16 shrink-0">
                  <div
                    className="text-sm font-semibold font-mono tabular-nums"
                    style={{ color: scoreColor }}
                  >
                    {c.counterScore > 0 ? "+" : ""}
                    {c.counterScore}
                  </div>
                  <div
                    className="w-full h-1 rounded-full overflow-hidden"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barPct}%`,
                        background: scoreColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPETITIVE TRIANGLE — SVG visualization                                   */
/* -------------------------------------------------------------------------- */
//
// Three vertices for the three groups. Three curved arrows form the cycle
// (control→melee→ranged→control). State driven by enemyPicks:
//
//   - Vertex with enemies in it gets a colored ring + count badge ("threat")
//   - Vertex(es) that beat the heaviest threat get a gold "YOUR PICK" pill
//     ("counter"). On ties, multiple vertices light up — honest signal.
//   - Arrows from a counter group INTO a threat group light up gold and
//     pulse via stroke-dashoffset animation.
//
// Self-contained — keyframes inlined into the SVG so the component
// doesn't depend on a global stylesheet rule.

function CompetitiveTriangle({
  counts,
  threatGroups,
  counterGroups,
  active,
}: {
  counts: Record<Group, number>;
  threatGroups: Set<Group>;
  counterGroups: Set<Group>;
  active: boolean;
}) {
  // Vertex centers (viewBox 0 0 480 380). Roughly equilateral, with the
  // top vertex centered horizontally and the bottom two pulled in from
  // the corners so the count badges have room to breathe.
  const verts: Record<Group, { x: number; y: number }> = {
    control: { x: 240, y: 80 },
    melee: { x: 95, y: 305 },
    ranged: { x: 385, y: 305 },
  };

  // Quadratic Beziers between vertex circles. Endpoints are pulled back
  // from vertex centers so arrowheads sit just outside the destination
  // circle. Control points push outward from the centroid (~240, 230)
  // so each curve bows away from the triangle's interior.
  const arrows: Array<{ from: Group; to: Group; d: string }> = [
    { from: "control", to: "melee", d: "M 215,128 Q 50,150 132,258" },
    { from: "melee", to: "ranged", d: "M 150,325 Q 240,400 330,325" },
    { from: "ranged", to: "control", d: "M 348,258 Q 430,150 265,128" },
  ];

  // Badge / pill positions per vertex, measured from the vertex center.
  // Each vertex's "outer direction" (away from centroid) is where the
  // count badge sits, so labels never collide with arrows.
  const outerOffset: Record<Group, { x: number; y: number }> = {
    control: { x: 0, y: -70 },
    melee: { x: -52, y: 50 },
    ranged: { x: 52, y: 50 },
  };

  // Status line above the triangle. Adapts to enemy state.
  const status = !active
    ? "Pick enemies below to see your counter path"
    : counterGroups.size === 0
      ? "Mixed threats — no clean counter"
      : counterGroups.size === 1
        ? `Counter with ${TYPE_GROUPS[[...counterGroups][0]].label.toLowerCase()}`
        : `Split: ${[...counterGroups]
            .map((g) => TYPE_GROUPS[g].label.toLowerCase())
            .join(" or ")}`;

  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4 mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium">Competitive triangle</div>
        <div className="text-[11px] text-text-tertiary">{status}</div>
      </div>

      <svg
        viewBox="0 0 480 380"
        className="w-full max-w-md mx-auto block"
        style={{ overflow: "visible", fontFamily: "inherit" }}
        role="img"
        aria-label="Competitive triangle: control beats melee, melee beats ranged, ranged beats control"
      >
        <style>{`
          @keyframes triangle-counter-flow {
            to { stroke-dashoffset: -18; }
          }
          .triangle-counter-active {
            animation: triangle-counter-flow 1.4s linear infinite;
          }
        `}</style>

        <defs>
          <marker
            id="ct-arr-idle"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0,0 L 10,5 L 0,10 z" fill="var(--text-tertiary)" />
          </marker>
          <marker
            id="ct-arr-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0,0 L 10,5 L 0,10 z" fill={COUNTER_ACCENT} />
          </marker>
        </defs>

        {arrows.map(({ from, to, d }) => {
          const isActive =
            counterGroups.has(from) && threatGroups.has(to);
          return (
            <path
              key={`${from}-${to}`}
              d={d}
              fill="none"
              stroke={isActive ? COUNTER_ACCENT : "var(--border-color)"}
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeDasharray={isActive ? "5 4" : undefined}
              markerEnd={`url(#${
                isActive ? "ct-arr-active" : "ct-arr-idle"
              })`}
              className={isActive ? "triangle-counter-active" : undefined}
              style={{
                transition: "stroke 200ms, stroke-width 200ms",
              }}
            />
          );
        })}

        {(Object.keys(verts) as Group[]).map((group) => {
          const v = verts[group];
          const info = TYPE_GROUPS[group];
          const isThreat = threatGroups.has(group);
          // A counter highlight only applies when this group ISN'T also a
          // threat — otherwise the same vertex would carry two contradicting
          // signals ("they have one here" + "pick from here"). Threats win.
          const isCounter = counterGroups.has(group) && !isThreat;
          const count = counts[group];
          const off = outerOffset[group];

          const accent = isCounter
            ? COUNTER_ACCENT
            : isThreat
              ? info.color
              : null;
          const ringColor = accent ?? "var(--border-color)";
          const fillColor = accent ? accent + "12" : "var(--bg-secondary)";
          const labelColor = accent ?? "var(--text-secondary)";

          return (
            <g key={group} transform={`translate(${v.x},${v.y})`}>
              {accent && (
                <circle
                  r="62"
                  fill="none"
                  stroke={accent}
                  strokeWidth="1"
                  opacity="0.25"
                />
              )}
              <circle
                r="54"
                fill={fillColor}
                stroke={ringColor}
                strokeWidth={accent ? 2 : 1}
                style={{ transition: "all 200ms" }}
              />
              <text
                y="-12"
                textAnchor="middle"
                fontSize="13"
                fontWeight="500"
                fill={labelColor}
                style={{ transition: "fill 200ms" }}
              >
                {info.label}
              </text>
              <text
                y="4"
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-tertiary)"
              >
                {info.types
                  .map((t) => TYPE_LABELS[t].split(" / ")[0])
                  .join(" · ")}
              </text>
              <text
                y="20"
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-tertiary)"
                opacity="0.7"
              >
                {info.desc}
              </text>

              {/* Count badge — outer side of vertex when threats exist */}
              {count > 0 && (
                <g transform={`translate(${off.x},${off.y})`}>
                  <circle r="12" fill={info.color} />
                  <text
                    textAnchor="middle"
                    y="4"
                    fontSize="11"
                    fontWeight="600"
                    fill="#1a1a1a"
                  >
                    {count}
                  </text>
                </g>
              )}

              {/* "YOUR PICK" pill — same outer slot, mutually exclusive
                  with the count badge by construction */}
              {isCounter && (
                <g transform={`translate(${off.x},${off.y})`}>
                  <rect
                    x="-32"
                    y="-8"
                    width="64"
                    height="16"
                    rx="3"
                    fill={COUNTER_ACCENT}
                  />
                  <text
                    textAnchor="middle"
                    y="4"
                    fontSize="9"
                    fontWeight="600"
                    fill="#1a1a1a"
                    letterSpacing="0.6"
                  >
                    YOUR PICK
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
