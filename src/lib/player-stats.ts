/**
 * player-stats.ts
 *
 * Pure calculation helpers for the player lookup page.
 * All numeric assumptions live in this file so they're easy to audit
 * and swap if Brawl Stars rebalances costs.
 *
 * Three things in here:
 *   - Apollo Score: composite skill rating 0-100 with tier letter
 *   - Account economy: gold spent, gold to max, rough gem equivalent
 *   - Recent form: aggregate stats over the last 25 battles
 */

/* -------------------------------------------------------------------------- */
/* Power-up gold costs                                                        */
/* -------------------------------------------------------------------------- */
//
// Cost in coins to advance from power N to power N+1. These are the
// in-game costs as of the current season — if the game rebalances, this
// is the only place to update.
//
// We deliberately don't account for power points (the soft requirement)
// since players accumulate those over time anyway. The gold cost is the
// real "you must pay this" number and aligns with what users feel as
// "stuck waiting on coins."

const POWER_UP_COSTS: Record<number, number> = {
  1: 20,
  2: 35,
  3: 75,
  4: 140,
  5: 290,
  6: 480,
  7: 800,
  8: 1250,
  9: 1875,
  10: 1000, // 10 → 11
};

const TOTAL_POWER_COST_PER_BRAWLER = Object.values(POWER_UP_COSTS).reduce(
  (a, b) => a + b,
  0
); // 5965

// Rough shop conversion: ~4 gold per gem at typical shop offers
// (gold packs vary 3-5 g/gem depending on the deal). 4 is a reasonable
// midpoint and lets us give a "what would this cost in gems" estimate
// without overstating the figure. Mark this clearly as approximate in
// the UI — actual gem cost is much higher because shop offers are not
// linear and most progression isn't gem-purchasable directly.
const GOLD_PER_GEM = 4;

export function goldSpentOnBrawler(currentPower: number): number {
  let total = 0;
  for (let p = 1; p < currentPower; p++) {
    total += POWER_UP_COSTS[p] ?? 0;
  }
  return total;
}

export function goldRemainingForBrawler(currentPower: number): number {
  let total = 0;
  for (let p = Math.max(1, currentPower); p < 11; p++) {
    total += POWER_UP_COSTS[p] ?? 0;
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Account economy                                                            */
/* -------------------------------------------------------------------------- */

export interface BrawlerLite {
  power: number;
  trophies: number;
}

export interface AccountEconomy {
  goldSpent: number;
  goldRemaining: number;
  gemEquivalent: number;
  completion: number; // 0-1
  maxedCount: number;
  totalBrawlers: number;
}

export function computeAccountEconomy(brawlers: BrawlerLite[]): AccountEconomy {
  let goldSpent = 0;
  let goldRemaining = 0;
  let maxedCount = 0;
  for (const b of brawlers) {
    goldSpent += goldSpentOnBrawler(b.power);
    goldRemaining += goldRemainingForBrawler(b.power);
    if (b.power >= 11) maxedCount++;
  }
  const totalPossible = brawlers.length * TOTAL_POWER_COST_PER_BRAWLER;
  const completion =
    totalPossible > 0 ? Math.round((goldSpent / totalPossible) * 100) / 100 : 0;
  return {
    goldSpent,
    goldRemaining,
    gemEquivalent: Math.round(goldSpent / GOLD_PER_GEM),
    completion,
    maxedCount,
    totalBrawlers: brawlers.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Apollo Score — composite skill rating                                      */
/* -------------------------------------------------------------------------- */
//
// Four weighted components, each capped so a single dimension can't
// carry the whole score:
//
//   Trophies (35pts)   : trophies / 60000, capped at 1.
//                        60k is roughly "very high" — only strong
//                        active players cross it. Uses current trophies
//                        rather than highestTrophies because the Feb 2026
//                        rework removed seasonal resets, making the
//                        "peak" field a stale legacy stat that no longer
//                        meaningfully exceeds current.
//
//   Recent form (25)   : recent win rate over last ~25 battles.
//                        50% wins = 12.5 pts. Active players above 50%
//                        are scoring above midline.
//
//   Depth (25)         : maxed brawlers / 30, capped at 1.
//                        30 maxed brawlers = serious investment. Stops
//                        someone with one Mortis at 60k from getting a
//                        free S tier on trophies alone.
//
//   Star player (15)   : star-player rate over recent battles. 30%+ is
//                        elite (it's MVP-of-the-match). Rewards skill
//                        independent of trophies/depth.
//
// Tier thresholds: S 85+, A 70+, B 55+, C 40+, D under 40. Calibrated
// so an active grinder lands B-A and only genuine top players hit S.

export interface ApolloScore {
  score: number;
  tier: "S" | "A" | "B" | "C" | "D";
  breakdown: {
    trophies: number;
    recentForm: number;
    depth: number;
    starPlayer: number;
  };
}

export function computeApolloScore(input: {
  trophies: number;
  recentWinRate: number; // 0-100
  maxedCount: number;
  starPlayerRate: number; // 0-100
}): ApolloScore {
  const trophies = Math.round(Math.min(input.trophies / 100000, 1) * 35);
  const recentForm = Math.round(
    Math.min(Math.max(input.recentWinRate, 0), 100) / 100 * 25
  );
  const depth = Math.round(Math.min(input.maxedCount / 30, 1) * 25);
  const starPlayer = Math.round(
    Math.min(Math.max(input.starPlayerRate, 0) / 30, 1) * 15
  );
  const score = trophies + recentForm + depth + starPlayer;

  let tier: ApolloScore["tier"];
  if (score >= 85) tier = "S";
  else if (score >= 70) tier = "A";
  else if (score >= 55) tier = "B";
  else if (score >= 40) tier = "C";
  else tier = "D";

  return { score, tier, breakdown: { trophies, recentForm, depth, starPlayer } };
}

/* -------------------------------------------------------------------------- */
/* Recent form — last 25 battles                                              */
/* -------------------------------------------------------------------------- */
//
// The Brawl Stars API battle-log endpoint returns ~25 recent battles.
// We classify each from the player's POV (handles team[1] flipping that
// the raw API doesn't do for you) and aggregate.
//
// One subtle bit: the API gives team-relative results, so if the player
// is on teams[1] in a 3v3, a "victory" on the battle root means *team 0*
// won, not the player. We invert in that case. This matches the same
// fix the harvest script applies.

export interface RecentBattle {
  result: "victory" | "defeat" | "draw";
  brawlerName: string;
  mode: string;
  map: string;
  trophyChange: number;
  starPlayer: boolean;
  battleTime: string;
}

export interface ModeWinRate {
  mode: string;
  wins: number;
  total: number;
  winRate: number;
}

export interface TopRecentBrawler {
  name: string;
  uses: number;
  wins: number;
  winRate: number;
}

export interface RecentForm {
  battles: RecentBattle[];
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  starPlayerRate: number;
  trophyDelta: number;
  modeWinRates: ModeWinRate[];
  topBrawlerInRecent: TopRecentBrawler | null;
}

const cleanTag = (t: string | undefined | null): string =>
  (t ?? "").replace(/^#/, "").toUpperCase();

export function computeRecentForm(items: any[], playerTag: string): RecentForm {
  const me = cleanTag(playerTag);
  const battles: RecentBattle[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let starCount = 0;
  let trophyDelta = 0;
  const modeStats: Record<string, { wins: number; total: number }> = {};
  const brawlerStats: Record<string, { uses: number; wins: number }> = {};

  for (const item of items.slice(0, 25)) {
    const battle = item?.battle ?? {};
    const event = item?.event ?? {};
    const result = battle.result;
    if (result !== "victory" && result !== "defeat" && result !== "draw") {
      continue; // Skip non-result battles (showdown placements, etc)
    }

    const teams: any[][] = Array.isArray(battle.teams) ? battle.teams : [];
    const allPlayers: any[] = Array.isArray(battle.players)
      ? battle.players
      : teams.flat();

    const meEntry = allPlayers.find((p) => cleanTag(p?.tag) === me);
    if (!meEntry?.brawler?.name) continue;

    // Team-relative result correction: if I'm on team index 1, invert.
    // Singles modes (showdown) have no teams or single-player teams,
    // so this is a no-op in those cases.
    let myResult: RecentBattle["result"] = result;
    if (teams.length > 1) {
      const teamIdx = teams.findIndex((t) =>
        t.some((p: any) => cleanTag(p?.tag) === me)
      );
      if (teamIdx === 1) {
        if (result === "victory") myResult = "defeat";
        else if (result === "defeat") myResult = "victory";
      }
    }

    const isStar = cleanTag(battle.starPlayer?.tag) === me;
    const trophyChange = typeof battle.trophyChange === "number" ? battle.trophyChange : 0;
    const brawlerName = meEntry.brawler.name as string;
    const mode = (battle.mode as string) ?? "unknown";

    if (myResult === "victory") wins++;
    else if (myResult === "defeat") losses++;
    else draws++;
    if (isStar) starCount++;
    trophyDelta += trophyChange;

    if (!modeStats[mode]) modeStats[mode] = { wins: 0, total: 0 };
    modeStats[mode].total++;
    if (myResult === "victory") modeStats[mode].wins++;

    if (!brawlerStats[brawlerName]) brawlerStats[brawlerName] = { uses: 0, wins: 0 };
    brawlerStats[brawlerName].uses++;
    if (myResult === "victory") brawlerStats[brawlerName].wins++;

    battles.push({
      result: myResult,
      brawlerName,
      mode,
      map: (event.map as string) ?? "Unknown",
      trophyChange,
      starPlayer: isStar,
      battleTime: item.battleTime ?? "",
    });
  }

  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const starPlayerRate = total > 0 ? Math.round((starCount / total) * 100) : 0;

  // Mode breakdown sorted by total games (most-played first), with a
  // minimum of 2 games to filter out one-off modes that would skew at
  // either 0% or 100%.
  const modeWinRates: ModeWinRate[] = Object.entries(modeStats)
    .filter(([, s]) => s.total >= 2)
    .map(([mode, s]) => ({
      mode,
      wins: s.wins,
      total: s.total,
      winRate: Math.round((s.wins / s.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  // Most-used brawler over the recent window. Ties broken by win rate.
  const brawlerEntries = Object.entries(brawlerStats).sort((a, b) => {
    if (b[1].uses !== a[1].uses) return b[1].uses - a[1].uses;
    return b[1].wins / b[1].uses - a[1].wins / a[1].uses;
  });
  const topBrawlerInRecent: TopRecentBrawler | null =
    brawlerEntries.length > 0
      ? {
          name: brawlerEntries[0][0],
          uses: brawlerEntries[0][1].uses,
          wins: brawlerEntries[0][1].wins,
          winRate:
            brawlerEntries[0][1].uses > 0
              ? Math.round(
                  (brawlerEntries[0][1].wins / brawlerEntries[0][1].uses) * 100
                )
              : 0,
        }
      : null;

  return {
    battles,
    wins,
    losses,
    draws,
    winRate,
    starPlayerRate,
    trophyDelta,
    modeWinRates,
    topBrawlerInRecent,
  };
}

/* -------------------------------------------------------------------------- */
/* "Could improve" brawlers — high trophies, low power                        */
/* -------------------------------------------------------------------------- */
//
// Surfaces brawlers a player has played with (high trophies) but hasn't
// invested gold into (low power). These are the "you're leaving wins on
// the table" picks — same skill plus a power upgrade unlocks more.
//
// Threshold: trophies ≥ 250 (= consistent play) AND power ≤ 8 (= room
// to grow). Sorted by trophies descending so the most-played
// underleveled brawlers come first.

export interface ImprovableBrawler {
  name: string;
  trophies: number;
  power: number;
  type: string;
  iconUrl: string | null;
  externalId: number | null;
  goldToMax: number;
}

export function findImprovableBrawlers(
  brawlers: Array<{
    name: string;
    trophies: number;
    power: number;
    type?: string;
    iconUrl?: string | null;
    externalId?: number | null;
  }>,
  limit = 5
): ImprovableBrawler[] {
  return brawlers
    .filter((b) => b.trophies >= 250 && b.power <= 8)
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, limit)
    .map((b) => ({
      name: b.name,
      trophies: b.trophies,
      power: b.power,
      type: b.type ?? "lane",
      iconUrl: b.iconUrl ?? null,
      externalId: b.externalId ?? null,
      goldToMax: goldRemainingForBrawler(b.power),
    }));
}

/* -------------------------------------------------------------------------- */
/* Mode display name                                                          */
/* -------------------------------------------------------------------------- */
//
// Brawl Stars API returns modes camelCase (gemGrab); UI wants Title Case
// (Gem Grab). Lookup table for known modes, falls back to splitting on
// camel boundaries for anything new.

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

export function modeDisplayName(mode: string): string {
  if (MODE_DISPLAY[mode]) return MODE_DISPLAY[mode];
  return mode
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
