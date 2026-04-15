import { BrawlerWithStats } from "@/types/brawler";
import { DraftState } from "@/types/meta";
import { computeCounters } from "./counter-engine";

export interface DraftSuggestion {
  brawler: BrawlerWithStats;
  score: number;
  reason: string;
}

/**
 * Suggest the best picks or bans given the current draft state.
 */
export function suggestPick(
  state: DraftState,
  allBrawlers: BrawlerWithStats[]
): DraftSuggestion[] {
  const unavailable = new Set([
    ...state.bans,
    ...state.myPicks,
    ...state.enemyPicks,
  ]);
  const available = allBrawlers.filter((b) => !unavailable.has(b.id));

  if (state.currentPhase === "ban") {
    return suggestBans(available);
  }

  const enemyBrawlers = state.enemyPicks
    .map((id) => allBrawlers.find((b) => b.id === id))
    .filter(Boolean) as BrawlerWithStats[];

  if (enemyBrawlers.length === 0) {
    // No enemy picks yet -- pick the highest overall value
    return available
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 3)
      .map((b) => ({
        brawler: b,
        score: Math.round(b.winRate * 10) / 10,
        reason: `Strong overall pick with ${b.winRate}% win rate`,
      }));
  }

  // Counter the enemy composition
  const counters = computeCounters(enemyBrawlers, available);
  return counters.slice(0, 3).map((c) => ({
    brawler: c,
    score: c.counterScore,
    reason:
      c.reasons.length > 0
        ? c.reasons[0]
        : `Solid pick with ${c.winRate}% win rate`,
  }));
}

function suggestBans(available: BrawlerWithStats[]): DraftSuggestion[] {
  // Ban the highest-impact brawlers (win rate * pick rate)
  return available
    .map((b) => ({
      brawler: b,
      score: Math.round(b.winRate * b.pickRate) / 100,
      reason: `High impact: ${b.winRate}% WR, ${b.pickRate}% pick rate`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Compute draft advantage score.
 * Positive = your team is favored, negative = enemy is favored.
 */
export function computeAdvantage(
  myPicks: BrawlerWithStats[],
  enemyPicks: BrawlerWithStats[]
): number {
  if (myPicks.length === 0 && enemyPicks.length === 0) return 0;

  const myAvg =
    myPicks.reduce((s, b) => s + b.winRate, 0) / (myPicks.length || 1);
  const enemyAvg =
    enemyPicks.reduce((s, b) => s + b.winRate, 0) / (enemyPicks.length || 1);

  return Math.round((myAvg - enemyAvg) * 10) / 10;
}
