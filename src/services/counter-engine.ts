import { BrawlerWithStats, BrawlerCounter, BrawlerType } from "@/types/brawler";
import { COUNTER_MATRIX } from "@/lib/constants";

/**
 * Compute counter scores for all available brawlers against a set of enemy picks.
 *
 * Scoring:
 *  +2 for each enemy type this brawler is strong against
 *  -1 for each enemy type this brawler is weak against
 *  +/- small bonus from win rate deviation from 50%
 */
export function computeCounters(
  enemyPicks: BrawlerWithStats[],
  allBrawlers: BrawlerWithStats[]
): BrawlerCounter[] {
  const enemyIds = new Set(enemyPicks.map((b) => b.id));
  const enemyTypes = enemyPicks.map((b) => b.type);

  return allBrawlers
    .filter((b) => !enemyIds.has(b.id))
    .map((b) => {
      let score = 0;
      const reasons: string[] = [];
      const info = COUNTER_MATRIX[b.type];

      if (info) {
        enemyPicks.forEach((enemy) => {
          if (info.strongVs.includes(enemy.type)) {
            score += 2;
            reasons.push(
              `${b.name} (${b.type}) counters ${enemy.name} (${enemy.type}): ${info.description.split(".")[0]}.`
            );
          }
          if (info.weakVs.includes(enemy.type)) {
            score -= 1;
          }
        });
      }

      // Win rate bonus as tiebreaker
      score += (b.winRate - 50) / 5;

      return {
        ...b,
        counterScore: Math.round(score * 10) / 10,
        reasons,
      };
    })
    .sort((a, b) => b.counterScore - a.counterScore);
}

/**
 * Get the type matchup description between two types.
 */
export function getMatchupDescription(
  attackerType: BrawlerType,
  defenderType: BrawlerType
): string | null {
  const info = COUNTER_MATRIX[attackerType];
  if (!info) return null;

  if (info.strongVs.includes(defenderType)) {
    return `${attackerType} is strong against ${defenderType}`;
  }
  if (info.weakVs.includes(defenderType)) {
    return `${attackerType} is weak against ${defenderType}`;
  }
  return `${attackerType} is neutral against ${defenderType}`;
}
