/**
 * battle-log-service.ts
 *
 * Fetches a player's battle log from the Brawl Stars API and saves
 * each battle into the BattleRecord table. Every player lookup seeds
 * our real stats dataset — no extra work needed.
 */

import { PrismaClient } from "@prisma/client";
import { fetchPlayerBattleLog } from "./brawlstars-api";

const SUPPORTED_MODES = new Set([
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
  "duoShowdown",
  "soloShowdown",
]);

// Only care about 3v3 competitive modes for meta stats
const COMPETITIVE_MODES = new Set([
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
]);

interface SaveResult {
  saved: number;
  skipped: number;
  errors: number;
}

/**
 * Fetch a player's recent battle log and persist each battle to the DB.
 * Call this fire-and-forget from the player lookup route — it won't block
 * the response.
 */
export async function saveBattleLog(
  prisma: PrismaClient,
  playerTag: string
): Promise<SaveResult> {
  const result: SaveResult = { saved: 0, skipped: 0, errors: 0 };

  let battleLog: any;
  try {
    battleLog = await fetchPlayerBattleLog(playerTag);
  } catch (err) {
    // No API key or player not found — silently skip
    return result;
  }

  const items: any[] = battleLog?.items || [];
  if (items.length === 0) return result;

  // Build a name → id lookup for brawlers already in our DB
  const dbBrawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });
  const brawlerIdByName = new Map<string, string>();
  for (const b of dbBrawlers) {
    brawlerIdByName.set(b.name.toLowerCase(), b.id);
  }

  for (const item of items) {
    try {
      const battle = item.battle;
      const event = item.event;

      // Skip non-competitive or modes we don't track
      if (!event?.map || !battle?.mode) {
        result.skipped++;
        continue;
      }
      if (!COMPETITIVE_MODES.has(battle.mode)) {
        result.skipped++;
        continue;
      }
      if (battle.type === "friendly") {
        result.skipped++;
        continue;
      }

      const battleTime = new Date(item.battleTime);
      const mapName = event.map;
      const gameMode = battle.mode;
      const result3v3 = battle.result as string | undefined; // "victory" | "defeat" | "draw"

      if (!result3v3) {
        result.skipped++;
        continue;
      }

      // Flatten all players from all teams into individual records
      const teams: any[][] = battle.teams || [];
      const starPlayerTag = battle.starPlayer?.tag;

      for (const team of teams) {
        for (const player of team) {
          if (!player?.brawler?.name) continue;

          const rawName = player.brawler.name as string;
          // Normalize to title case to match our DB
          const brawlerName = rawName
            .toLowerCase()
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

          const brawlerId = brawlerIdByName.get(brawlerName.toLowerCase()) ?? null;
          const isStarPlayer = player.tag === starPlayerTag;

          // Each player in the battle sees the same result as the team that won
          // We need to figure out which team this player is on vs the result
          // The battle.result is from the perspective of the looked-up player's team
          // We mark "victory" for the player's own team members
          const sourceIsMyTeam = teams[0].some((p: any) => p.tag === `#${playerTag}`);
          const teamIndex = teams.indexOf(team);
          let playerResult = result3v3;
          if (result3v3 === "victory" && teamIndex === 1) playerResult = "defeat";
          if (result3v3 === "defeat" && teamIndex === 0) playerResult = "defeat";
          if (result3v3 === "defeat" && teamIndex === 1) playerResult = "victory";

          try {
            await prisma.battleRecord.upsert({
              where: {
                battleTime_sourceTag_brawlerName: {
                  battleTime,
                  sourceTag: playerTag,
                  brawlerName,
                },
              },
              update: {}, // already have it, no need to overwrite
              create: {
                battleTime,
                mapName,
                gameMode,
                result: playerResult,
                brawlerName,
                brawlerId,
                isStarPlayer,
                sourceTag: playerTag,
              },
            });
            result.saved++;
          } catch {
            result.skipped++; // unique constraint hit = already saved
          }
        }
      }
    } catch (err) {
      result.errors++;
    }
  }

  return result;
}
