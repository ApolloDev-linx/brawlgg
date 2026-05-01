/**
 * battle-log-service.ts
 *
 * Fetches a player's battle log from the Brawl Stars API and persists
 * each battle into BattleRecord. Called fire-and-forget from the player
 * lookup route, so every player searched seeds our dataset for free.
 *
 * Intentionally parallel to scripts/harvest.ts and
 * src/services/leaderboard-harvester.ts — same battle-shape parsing,
 * same canonical-name layer, same per-brawler write loop. If you change
 * one, change the others. A divergence here is exactly how Duels
 * battles disappeared the first time around.
 *
 * Tracked modes (must match the other two harvesters):
 *   Classic 3v3: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone,
 *                Knockout, Siege
 *   Plus:        Wipeout (3v3 variant), Duels (1v1)
 *   Excluded:    Showdown variants, novelty/event modes, 2v2/5v5.
 */
import { PrismaClient } from "@prisma/client";
import { fetchPlayerBattleLog } from "./brawlstars-api";
import { toBrawlerName } from "@/lib/brawler-name";

const COMPETITIVE_MODES = new Set([
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
  "wipeout",
  "duels",
]);

interface SaveResult {
  saved: number;
  skipped: number;
  errors: number;
}

/**
 * Most modes return `player.brawler` (singular). Duels returns
 * `player.brawlers` (array of 3 picks per player). Returns [] if neither
 * shape is present so the caller can skip cleanly.
 */
function extractBrawlers(player: any): { name: string }[] {
  if (player?.brawler?.name) return [player.brawler];
  if (Array.isArray(player?.brawlers)) {
    return player.brawlers.filter(
      (b: any): b is { name: string } => !!b?.name
    );
  }
  return [];
}

/**
 * Resolve the result string from this player's POV given the source
 * player's `battle.result` and the team layout.
 *
 *   Team modes (battle.teams present): flip if player is on teams[1].
 *   Duels (battle.teams empty):        flip if player isn't the source.
 *   Draw:                              no flip ever.
 */
function resolveResultForPlayer(
  player: any,
  sourceTagWithHash: string,
  teams: any[][],
  battleResult: string
): string {
  if (battleResult === "draw") return battleResult;

  if (teams.length > 0) {
    const teamIndex = teams.findIndex((t) =>
      t.some((p: any) => p.tag === player.tag)
    );
    if (teamIndex === 1) {
      return battleResult === "victory" ? "defeat" : "victory";
    }
    return battleResult;
  }

  // Duels-style: no teams, flip the opponent's perspective
  if (player.tag !== sourceTagWithHash) {
    return battleResult === "victory" ? "defeat" : "victory";
  }
  return battleResult;
}

/**
 * Fetch a player's recent battle log and persist each battle to the DB.
 * Safe to fire-and-forget — it never throws and tracks all skips/errors
 * in the returned counts so callers can log them if they care.
 */
export async function saveBattleLog(
  prisma: PrismaClient,
  playerTag: string
): Promise<SaveResult> {
  const result: SaveResult = { saved: 0, skipped: 0, errors: 0 };

  let battleLog: any;
  try {
    battleLog = await fetchPlayerBattleLog(playerTag);
  } catch {
    // No API key, player not found, or upstream hiccup — degrade silently.
    return result;
  }

  const items: any[] = battleLog?.items || [];
  if (items.length === 0) return result;

  // Build a case-insensitive name → id lookup for brawler attribution.
  const dbBrawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });
  const brawlerIdByName = new Map<string, string>();
  for (const b of dbBrawlers) {
    brawlerIdByName.set(b.name.toLowerCase(), b.id);
  }

  const sourceTagWithHash = `#${playerTag}`;

  for (const item of items) {
    try {
      const battle = item.battle;
      const event = item.event;

      if (!event?.map || !battle?.mode) {
        result.skipped++;
        continue;
      }
      if (!COMPETITIVE_MODES.has(battle.mode)) {
        result.skipped++;
        continue;
      }
      if (battle.type === "friendly" || battle.type === "practice") {
        result.skipped++;
        continue;
      }

      const battleResult = battle.result as string | undefined;
      if (!battleResult) {
        result.skipped++;
        continue;
      }

      const battleTime = new Date(item.battleTime);
      if (isNaN(battleTime.getTime())) {
        result.skipped++;
        continue;
      }

      const mapName: string = event.map;
      const gameMode: string = battle.mode;
      const starPlayerTag: string | undefined = battle.starPlayer?.tag;

      const teams: any[][] = battle.teams || [];
      const allPlayers: any[] = battle.players ?? teams.flat();

      for (const player of allPlayers) {
        if (!player?.tag) continue;

        const brawlers = extractBrawlers(player);
        if (brawlers.length === 0) continue;

        const playerResult = resolveResultForPlayer(
          player,
          sourceTagWithHash,
          teams,
          battleResult
        );
        const isStarPlayer = player.tag === starPlayerTag;

        // Duels: write one row per brawler the player fielded (3 per
        // duel, one row each, all sharing this player's result). Other
        // modes: this loop runs exactly once.
        for (const rawBrawler of brawlers) {
          const brawlerName = toBrawlerName(rawBrawler.name);
          const brawlerId =
            brawlerIdByName.get(brawlerName.toLowerCase()) ?? null;

          try {
            await prisma.battleRecord.upsert({
              where: {
                battleTime_sourceTag_brawlerName: {
                  battleTime,
                  sourceTag: playerTag,
                  brawlerName,
                },
              },
              update: {},
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
            result.skipped++;
          }
        }
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
