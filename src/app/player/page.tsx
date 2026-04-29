"use client";

import { useState } from "react";
import { normalizeTag } from "@/lib/utils";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";

/* -------------------------------------------------------------------------- */
/* Types — mirror the API response shape                                      */
/* -------------------------------------------------------------------------- */

interface OwnedBrawler {
  name: string;
  type: string;
  trophies: number;
  power: number;
  rank?: number;
  iconUrl: string | null;
  externalId: number | null;
}

interface ImprovableBrawler {
  name: string;
  type: string;
  trophies: number;
  power: number;
  iconUrl: string | null;
  externalId: number | null;
  goldToMax: number;
}

interface ApolloScore {
  score: number;
  tier: "S" | "A" | "B" | "C" | "D";
  breakdown: {
    peak: number;
    recentForm: number;
    depth: number;
    starPlayer: number;
  };
}

interface AccountEconomy {
  goldSpent: number;
  goldRemaining: number;
  gemEquivalent: number;
  completion: number;
  maxedCount: number;
  totalBrawlers: number;
}

interface RecentBattle {
  result: "victory" | "defeat" | "draw";
  brawlerName: string;
  mode: string;
  map: string;
  trophyChange: number;
  starPlayer: boolean;
  battleTime: string;
}

interface ModeWinRate {
  mode: string;
  wins: number;
  total: number;
  winRate: number;
}

interface RecentForm {
  battles: RecentBattle[];
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  starPlayerRate: number;
  trophyDelta: number;
  modeWinRates: ModeWinRate[];
  topBrawlerInRecent: { name: string; uses: number; wins: number; winRate: number } | null;
}

interface PlayerData {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  clubName: string | null;
  playstyle: string;
  playstyleColor: string;
  level: number;
  wins: number;
  topBrawlers: OwnedBrawler[];
  improvableBrawlers: ImprovableBrawler[];
  apolloScore: ApolloScore;
  economy: AccountEconomy;
  recentForm: RecentForm;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  isMock?: boolean;
}

const TIER_COLORS: Record<string, string> = {
  S: "#EF9F27",
  A: "#5DCAA5",
  B: "#85B7EB",
  C: "#B4B2A9",
  D: "#888780",
};

const RESULT_COLORS: Record<RecentBattle["result"], string> = {
  victory: "#5DCAA5",
  defeat: "#F09595",
  draw: "#B4B2A9",
};

/* -------------------------------------------------------------------------- */
/* Mode display name — duplicated client-side to avoid pulling the whole      */
/* server-only player-stats module into the client bundle. Tiny enough.       */
/* -------------------------------------------------------------------------- */

const MODE_DISPLAY: Record<string, string> = {
  gemGrab: "Gem Grab",
  brawlBall: "Brawl Ball",
  bounty: "Bounty",
  heist: "Heist",
  hotZone: "Hot Zone",
  knockout: "Knockout",
  siege: "Siege",
  duels: "Duels",
  wipeout: "Wipeout",
  brawlHockey: "Brawl Hockey",
  duoShowdown: "Duo Showdown",
  soloShowdown: "Solo Showdown",
  trioShowdown: "Trio Showdown",
};
function modeDisplayName(mode: string): string {
  return (
    MODE_DISPLAY[mode] ??
    mode.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function PlayerPage() {
  const [tag, setTag] = useState("");
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!tag.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/players/${normalizeTag(tag)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Player not found");
      }
      const data = await res.json();
      setPlayer(data);
    } catch (e: any) {
      setError(e.message);
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Player lookup</h1>
        <p className="text-sm text-text-secondary">
          Search by player tag for trophies, recent form, account value, and
          a skill rating
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="#2PP or any player tag..."
          className="flex-1 max-w-xs"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-5 rounded-lg text-sm font-medium"
          style={{
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            opacity: loading ? 0.6 : 1,
            border: "none",
          }}
        >
          {loading ? "Searching..." : "Lookup"}
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{
            background: "rgba(240, 149, 149, 0.08)",
            color: "#F09595",
            border: "1px solid rgba(240, 149, 149, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {player && <PlayerView player={player} />}

      {!player && !loading && !error && (
        <div className="text-center py-12 text-sm text-text-tertiary">
          Enter a player tag above to get started.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PlayerView — orchestrates all the cards                                    */
/* -------------------------------------------------------------------------- */

function PlayerView({ player }: { player: PlayerData }) {
  return (
    <div className="flex flex-col gap-4">
      {player.isMock && (
        <div
          className="rounded-lg px-3 py-2 text-[11px]"
          style={{
            background: "rgba(133, 183, 235, 0.06)",
            color: "#85B7EB",
            border: "1px solid rgba(133, 183, 235, 0.18)",
          }}
        >
          Showing sample data — connect a Brawl Stars API key for live results
        </div>
      )}

      <ProfileHeader player={player} />

      <RecentFormStrip recentForm={player.recentForm} />

      <StatStrip player={player} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ApolloScoreCard apolloScore={player.apolloScore} />
        <AccountEconomyCard economy={player.economy} />
      </div>

      {player.recentForm.modeWinRates.length > 0 && (
        <ModePerformanceCard modes={player.recentForm.modeWinRates} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopBrawlersCard
          brawlers={player.topBrawlers}
          recentTop={player.recentForm.topBrawlerInRecent}
        />
        <ImprovableCard brawlers={player.improvableBrawlers} />
      </div>

      <PlaystyleCard
        playstyle={player.playstyle}
        playstyleColor={player.playstyleColor}
        strengths={player.strengths}
        weaknesses={player.weaknesses}
        suggestions={player.suggestions}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ProfileHeader — name, club, trophies, Apollo Score badge                   */
/* -------------------------------------------------------------------------- */

function ProfileHeader({ player }: { player: PlayerData }) {
  const tierColor = TIER_COLORS[player.apolloScore.tier];
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium shrink-0"
          style={{
            background: "rgba(133, 183, 235, 0.15)",
            color: "#85B7EB",
          }}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium truncate">{player.name}</div>
          <div className="text-xs text-text-secondary truncate">
            #{player.tag}
            {player.clubName ? ` · ${player.clubName}` : ""}
          </div>
        </div>

        {/* Trophies block */}
        <div className="flex items-baseline gap-2 shrink-0">
          <div>
            <div className="text-[10px] text-text-tertiary tracking-widest uppercase">
              Trophies
            </div>
            <div
              className="text-xl font-medium font-mono tabular-nums"
              style={{ color: "#EF9F27" }}
            >
              {player.trophies.toLocaleString()}
            </div>
          </div>
          <div className="text-[10px] text-text-tertiary self-end mb-0.5">
            peak {player.highestTrophies.toLocaleString()}
          </div>
        </div>

        {/* Apollo Score badge */}
        <div
          className="rounded-xl px-3 py-2 flex items-center gap-2.5 shrink-0"
          style={{
            background: tierColor + "12",
            border: `1px solid ${tierColor}40`,
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-semibold"
            style={{ background: tierColor + "26", color: tierColor }}
          >
            {player.apolloScore.tier}
          </div>
          <div>
            <div
              className="text-[9px] tracking-widest uppercase"
              style={{ color: tierColor, opacity: 0.8 }}
            >
              Apollo Score
            </div>
            <div
              className="text-base font-medium font-mono"
              style={{ color: tierColor }}
            >
              {player.apolloScore.score} / 100
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RecentFormStrip — last 25 battles as colored squares                       */
/* -------------------------------------------------------------------------- */
//
// Fills with placeholder gray squares when fewer than 25 battles are
// available, so the strip always reads as 25-wide. Newest battle on
// the LEFT (matching how the API returns them).

function RecentFormStrip({ recentForm }: { recentForm: RecentForm }) {
  const empties = Math.max(0, 25 - recentForm.battles.length);
  if (recentForm.battles.length === 0) {
    return (
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-2">Recent form</div>
        <div className="text-xs text-text-tertiary">
          No recent battles available
        </div>
      </div>
    );
  }
  const trophyDeltaColor =
    recentForm.trophyDelta > 0
      ? "#5DCAA5"
      : recentForm.trophyDelta < 0
        ? "#F09595"
        : "var(--text-secondary)";
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-medium">Recent form · last 25</div>
        <div className="flex items-baseline gap-3 text-xs font-mono">
          <span style={{ color: "#5DCAA5" }}>{recentForm.wins}W</span>
          <span style={{ color: "#F09595" }}>{recentForm.losses}L</span>
          {recentForm.draws > 0 && (
            <span className="text-text-tertiary">{recentForm.draws}D</span>
          )}
          <span className="text-text-tertiary">·</span>
          <span style={{ color: "#85B7EB" }}>{recentForm.winRate}% WR</span>
          <span className="text-text-tertiary">·</span>
          <span style={{ color: trophyDeltaColor }}>
            {recentForm.trophyDelta > 0 ? "+" : ""}
            {recentForm.trophyDelta} 🏆
          </span>
        </div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {recentForm.battles.map((b, i) => (
          <BattleSquare key={i} battle={b} />
        ))}
        {Array.from({ length: empties }).map((_, i) => (
          <div
            key={`e${i}`}
            className="w-6 h-6 rounded"
            style={{ background: "var(--bg-secondary)" }}
            title="No data"
          />
        ))}
      </div>
    </div>
  );
}

function BattleSquare({ battle }: { battle: RecentBattle }) {
  const color = RESULT_COLORS[battle.result];
  const letter =
    battle.result === "victory" ? "W" : battle.result === "defeat" ? "L" : "D";
  return (
    <div
      className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-semibold relative"
      style={{
        background: color + "33",
        color,
      }}
      title={`${letter} · ${battle.brawlerName} · ${modeDisplayName(battle.mode)} · ${
        battle.trophyChange > 0 ? "+" : ""
      }${battle.trophyChange} 🏆${battle.starPlayer ? " · ★ Star Player" : ""}`}
    >
      {letter}
      {battle.starPlayer && (
        <span
          className="absolute -top-0.5 -right-0.5 text-[7px]"
          style={{ color: "#EF9F27" }}
        >
          ★
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StatStrip — 4 cards across                                                 */
/* -------------------------------------------------------------------------- */

function StatStrip({ player }: { player: PlayerData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="3v3 wins"
        value={player.wins.toLocaleString()}
        color="#5DCAA5"
      />
      <StatCard
        label="Star player rate"
        value={`${player.recentForm.starPlayerRate}%`}
        color="#EF9F27"
        sub="last 25"
      />
      <StatCard
        label="Maxed brawlers"
        value={`${player.economy.maxedCount} / ${player.economy.totalBrawlers}`}
        color="#85B7EB"
      />
      <StatCard label="Exp level" value={String(player.level)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-3">
      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-1">
        {label}
      </div>
      <div
        className="text-base font-medium font-mono tabular-nums"
        style={{ color: color ?? undefined }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ApolloScoreCard — tier badge + 4 horizontal breakdown bars                 */
/* -------------------------------------------------------------------------- */
//
// The breakdown is the value-add — anyone can put up a number. Showing
// what's behind it (peak / recent form / depth / star player) keeps the
// score honest and tells the player exactly which dimension to grow.

function ApolloScoreCard({ apolloScore }: { apolloScore: ApolloScore }) {
  const components = [
    {
      label: "Peak trophies",
      value: apolloScore.breakdown.peak,
      max: 35,
      color: "#EF9F27",
    },
    {
      label: "Recent form",
      value: apolloScore.breakdown.recentForm,
      max: 25,
      color: "#5DCAA5",
    },
    {
      label: "Brawler depth",
      value: apolloScore.breakdown.depth,
      max: 25,
      color: "#85B7EB",
    },
    {
      label: "Star player rate",
      value: apolloScore.breakdown.starPlayer,
      max: 15,
      color: "#ED93B1",
    },
  ];
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="text-sm font-medium mb-1">Skill breakdown</div>
      <div className="text-[11px] text-text-tertiary mb-3">
        How the {apolloScore.score}/100 Apollo Score adds up
      </div>
      <div className="flex flex-col gap-2.5">
        {components.map((c) => (
          <ScoreBar key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
          {value} / {max}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AccountEconomyCard — gold spent, gem equivalent, gold to max               */
/* -------------------------------------------------------------------------- */
//
// "Account value" = sum of gold cost to reach each owned brawler's
// current power level. This is the most defensible "what this account
// represents in resources" number. Gem equivalent is a rough conversion
// at typical shop rates and explicitly labeled as approximate.

function AccountEconomyCard({ economy }: { economy: AccountEconomy }) {
  const completionPct = Math.round(economy.completion * 100);
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-sm font-medium">Account value</div>
          <div className="text-[11px] text-text-tertiary">
            Estimated from power-level costs
          </div>
        </div>
        <div className="text-[11px] text-text-tertiary font-mono">
          {completionPct}% complete
        </div>
      </div>

      {/* Big number — gold spent */}
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className="text-2xl font-medium font-mono tabular-nums"
          style={{ color: "#EF9F27" }}
        >
          {economy.goldSpent.toLocaleString()}
        </span>
        <span className="text-xs text-text-tertiary">gold invested</span>
      </div>

      {/* Completion bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-4"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${completionPct}%`, background: "#EF9F27" }}
        />
      </div>

      {/* Three sub-stats in a row */}
      <div className="grid grid-cols-3 gap-2">
        <SubStat
          label="Gold to max"
          value={economy.goldRemaining.toLocaleString()}
          color="#F09595"
        />
        <SubStat
          label="Gem equivalent"
          value={`~${economy.gemEquivalent.toLocaleString()}`}
          color="#ED93B1"
          sub="rough"
        />
        <SubStat
          label="Maxed"
          value={`${economy.maxedCount} / ${economy.totalBrawlers}`}
          color="#85B7EB"
        />
      </div>

      <div className="text-[10px] text-text-tertiary mt-3 leading-relaxed">
        Power-level coins only. Gears, star powers, gadgets, and hypercharges
        not counted — actual investment is higher.
      </div>
    </div>
  );
}

function SubStat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-2.5">
      <div className="text-[9px] text-text-tertiary uppercase tracking-widest mb-0.5">
        {label}
      </div>
      <div
        className="text-sm font-medium font-mono tabular-nums"
        style={{ color: color ?? undefined }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-text-tertiary mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ModePerformanceCard — horizontal bars, color-coded by win rate             */
/* -------------------------------------------------------------------------- */

function ModePerformanceCard({ modes }: { modes: ModeWinRate[] }) {
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="text-sm font-medium mb-1">Mode performance</div>
      <div className="text-[11px] text-text-tertiary mb-3">
        Win rate per mode in recent battles
      </div>
      <div className="flex flex-col gap-2">
        {modes.map((m) => {
          const color =
            m.winRate >= 60
              ? "#5DCAA5"
              : m.winRate >= 45
                ? "#85B7EB"
                : "#F09595";
          return (
            <div
              key={m.mode}
              className="grid grid-cols-[100px_1fr_60px] items-center gap-3"
            >
              <span className="text-xs text-text-secondary truncate">
                {modeDisplayName(m.mode)}
              </span>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${m.winRate}%`, background: color }}
                />
              </div>
              <span
                className="text-[11px] font-mono tabular-nums text-right"
                style={{ color }}
              >
                {m.winRate}%{" "}
                <span className="text-text-tertiary">({m.total})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TopBrawlersCard — strongest by trophies, with recent main highlighted      */
/* -------------------------------------------------------------------------- */

function TopBrawlersCard({
  brawlers,
  recentTop,
}: {
  brawlers: OwnedBrawler[];
  recentTop: { name: string; uses: number; wins: number; winRate: number } | null;
}) {
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="text-sm font-medium mb-1">Strongest brawlers</div>
      <div className="text-[11px] text-text-tertiary mb-3">
        Top 6 by trophies
      </div>
      {recentTop && (
        <div
          className="rounded-lg px-2.5 py-1.5 mb-3 text-[11px] flex items-center gap-2"
          style={{
            background: "rgba(239, 159, 39, 0.08)",
            border: "1px solid rgba(239, 159, 39, 0.2)",
            color: "#EF9F27",
          }}
        >
          <span>★ Recent main:</span>
          <span className="font-medium">{recentTop.name}</span>
          <span className="text-text-tertiary">·</span>
          <span>
            {recentTop.uses} games · {recentTop.winRate}% WR
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        {brawlers.map((b, i) => (
          <div
            key={b.name}
            className="flex items-center gap-2.5 py-1.5"
            style={{
              borderBottom:
                i < brawlers.length - 1
                  ? "1px solid var(--border-color)"
                  : "none",
            }}
          >
            <span className="text-[10px] text-text-tertiary w-4 text-right font-mono">
              {i + 1}
            </span>
            <BrawlerPortrait
              name={b.name}
              iconUrl={b.iconUrl}
              externalId={b.externalId}
              size="sm"
            />
            <span className="text-sm font-medium flex-1 truncate">
              {b.name}
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background:
                  b.power >= 11
                    ? "rgba(239, 159, 39, 0.18)"
                    : "var(--bg-tertiary)",
                color: b.power >= 11 ? "#EF9F27" : "var(--text-secondary)",
              }}
            >
              P{b.power}
            </span>
            <span
              className="text-sm font-medium font-mono tabular-nums"
              style={{ color: "#EF9F27" }}
            >
              {b.trophies.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ImprovableCard — high trophies, low power = upgrade leverage               */
/* -------------------------------------------------------------------------- */

function ImprovableCard({
  brawlers,
}: {
  brawlers: ImprovableBrawler[];
}) {
  if (brawlers.length === 0) {
    return (
      <div className="bg-bg-primary border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-1">Could improve</div>
        <div className="text-[11px] text-text-tertiary mb-3">
          Brawlers worth upgrading
        </div>
        <div className="text-xs text-text-tertiary py-3">
          All your most-played brawlers are well-leveled. Nice.
        </div>
      </div>
    );
  }
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="text-sm font-medium mb-1">Could improve</div>
      <div className="text-[11px] text-text-tertiary mb-3">
        Played a lot, low power level — upgrades unlock more wins
      </div>
      <div className="flex flex-col gap-1">
        {brawlers.map((b, i) => (
          <div
            key={b.name}
            className="flex items-center gap-2.5 py-1.5"
            style={{
              borderBottom:
                i < brawlers.length - 1
                  ? "1px solid var(--border-color)"
                  : "none",
            }}
          >
            <BrawlerPortrait
              name={b.name}
              iconUrl={b.iconUrl}
              externalId={b.externalId}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{b.name}</span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: "rgba(240, 149, 149, 0.15)",
                    color: "#F09595",
                  }}
                >
                  P{b.power}
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary font-mono">
                {b.trophies.toLocaleString()} 🏆 ·{" "}
                {b.goldToMax.toLocaleString()} gold to max
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PlaystyleCard — playstyle pill + strengths/weaknesses/suggestions          */
/* -------------------------------------------------------------------------- */

function PlaystyleCard({
  playstyle,
  playstyleColor,
  strengths,
  weaknesses,
  suggestions,
}: {
  playstyle: string;
  playstyleColor: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}) {
  return (
    <div className="bg-bg-primary border border-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-sm font-medium">Playstyle analysis</div>
        <span
          className="px-2.5 py-0.5 rounded text-xs font-medium capitalize"
          style={{
            background: playstyleColor + "18",
            color: playstyleColor,
          }}
        >
          {playstyle}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div
            className="text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: "#5DCAA5" }}
          >
            Strengths
          </div>
          {strengths.map((s, i) => (
            <div key={i} className="text-xs py-0.5 text-text-secondary">
              <span style={{ color: "#5DCAA5" }}>+</span> {s}
            </div>
          ))}
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: "#F09595" }}
          >
            Weaknesses
          </div>
          {weaknesses.map((w, i) => (
            <div key={i} className="text-xs py-0.5 text-text-secondary">
              <span style={{ color: "#F09595" }}>−</span> {w}
            </div>
          ))}
        </div>
        {suggestions.length > 0 && (
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-1.5"
              style={{ color: "#85B7EB" }}
            >
              Suggestions
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="text-xs py-0.5 text-text-secondary">
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
