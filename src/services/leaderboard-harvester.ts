/**
 * leaderboard-harvester.ts
 *
 * Bulk-seeds real battle data by:
 * 1. Pulling top 200 players from global + regional leaderboards
 * 2. Processing each player's battle log
 * 3. Chain-harvesting unique tags seen in those battles (1 level deep)
 * 4. Running stat aggregation at the end
 *
 * Tracked modes (product decision — competitive ranked focus):
 *   Classic 3v3: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone, Knockout, Siege
 *   Plus:        Wipeout (3v3), Duels (1v1)
 * Excluded: all novelty modes (Basket/Volley Brawl, Payload, Brawl Hockey,
 *           Brawl Arena), 2v2/5v5 variants, Showdown, PvE
 */

import { PrismaClient } from "@prisma/client";
import { fetchLeaderboard, fetchPlayerBattleLog } from "./brawlstars-api";
import { aggregateStats } from "./stat-aggregator";

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

const REQUEST_DELAY = 200;
const MAX_CHAIN_TAGS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HarvestResult {
  leaderboardPlayers: number;
  chainPlayers: number;
  totalBattlesSaved: number;
  totalSkipped: number;
  errors: number;
  aggregation: Awaited<ReturnType<typeof aggregateStats>> | null;
}

async function processPlayer(
  prisma: PrismaClient,
  playerTag: string,
  brawlerIdByName: Record<string, string>
): Promise<{ saved: number; skipped: number; chainTags: string[] }> {
  const result = { saved: 0, skipped: 0, chainTags: [] as string[] };

  let battleLog: any;
  try {
    battleLog = await fetchPlayerBattleLog(playerTag);
  } catch {
    return result;
  }

  const items: any[] = battleLog?.items || [];
  for (const item of items) {
    try {
      const battle = item.battle;
      const event = item.event;
      if (!event?.map || !battle?.mode) { result.skipped++; continue; }
      if (!COMPETITIVE_MODES.has(battle.mode)) { result.skipped++; continue; }
      if (battle.type === "friendly" || battle.type === "practice") { result.skipped++; continue; }

      const battleResult = battle.result as string | undefined;
      if (!battleResult) { result.skipped++; continue; }

      const battleTime = new Date(item.battleTime);
      const mapName = event.map;
      const gameMode = battle.mode;
      const starPlayerTag = battle.starPlayer?.tag;

      const teams: any[][] = battle.teams || [];
      const allPlayers: any[] = battle.players
        ? battle.players
        : teams.flat();

      for (const player of allPlayers) {
        if (!player?.brawler?.name || !player?.tag) continue;
        const cleanTag = (player.tag as string).replace(/^#/, "");
        if (cleanTag !== playerTag) result.chainTags.push(cleanTag);

        const rawName = player.brawler.name as string;
        const brawlerName = rawName
          .toLowerCase()
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        const brawlerId = brawlerIdByName[brawlerName.toLowerCase()] ?? null;
        const isStarPlayer = player.tag === starPlayerTag;

        let playerResult = battleResult;
        if (teams.length > 0) {
          const playerTeamIndex = teams.findIndex((t) =>
            t.some((p: any) => p.tag === player.tag)
          );
          if (playerTeamIndex === 1) {
            playerResult = battleResult === "victory" ? "defeat" : "victory";
          }
        }

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
    } catch {
      result.skipped++;
    }
  }
  return result;
}

export async function runHarvest(prisma: PrismaClient): Promise<HarvestResult> {
  const result: HarvestResult = {
    leaderboardPlayers: 0,
    chainPlayers: 0,
    totalBattlesSaved: 0,
    totalSkipped: 0,
    errors: 0,
    aggregation: null,
  };

  const dbBrawlers = await prisma.brawler.findMany({ select: { id: true, name: true } });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) brawlerIdByName[b.name.toLowerCase()] = b.id;

  const regions = ["global", "US", "GB", "KR", "BR"];
  const seenTags = new Set<string>();
  const leaderboardTags: string[] = [];

  for (const region of regions) {
    try {
      console.log(`[harvest] Fetching ${region} leaderboard...`);
      const players = await fetchLeaderboard(region);
      for (const p of players) {
        const tag = p.tag.replace(/^#/, "");
        if (!seenTags.has(tag)) { seenTags.add(tag); leaderboardTags.push(tag); }
      }
      await sleep(REQUEST_DELAY);
    } catch (err: any) {
      console.warn(`[harvest] Failed to fetch ${region} leaderboard: ${err.message}`);
      result.errors++;
    }
  }

  console.log(`[harvest] Got ${leaderboardTags.length} unique leaderboard players`);
  result.leaderboardPlayers = leaderboardTags.length;

  const chainTagPool = new Set<string>();

  for (const tag of leaderboardTags) {
    try {
      const { saved, skipped, chainTags } = await processPlayer(prisma, tag, brawlerIdByName);
      result.totalBattlesSaved += saved;
      result.totalSkipped += skipped;
      for (const ct of chainTags) { if (!seenTags.has(ct)) chainTagPool.add(ct); }

      process.stdout.write(
        `\r[harvest] Leaderboard: ${leaderboardTags.indexOf(tag) + 1}/${leaderboardTags.length} | Saved: ${result.totalBattlesSaved}`
      );
      await sleep(REQUEST_DELAY);
    } catch {
      result.errors++;
    }
  }

  console.log("\n[harvest] Leaderboard sweep complete");

  const chainTags = Array.from(chainTagPool)
    .filter((t) => !seenTags.has(t))
    .slice(0, MAX_CHAIN_TAGS);

  console.log(`[harvest] Chain harvesting ${chainTags.length} additional players...`);
  result.chainPlayers = chainTags.length;

  for (let i = 0; i < chainTags.length; i++) {
    const tag = chainTags[i];
    seenTags.add(tag);
    try {
      const { saved, skipped } = await processPlayer(prisma, tag, brawlerIdByName);
      result.totalBattlesSaved += saved;
      result.totalSkipped += skipped;
      process.stdout.write(
        `\r[harvest] Chain: ${i + 1}/${chainTags.length} | Saved: ${result.totalBattlesSaved}`
      );
      await sleep(REQUEST_DELAY);
    } catch {
      result.errors++;
    }
  }

  console.log("\n[harvest] Chain harvest complete");

  console.log("[harvest] Running stat aggregation...");
  try {
    result.aggregation = await aggregateStats();
    console.log(`[harvest] Aggregation done: ${result.aggregation.realStatsCount} real stat rows`);
  } catch (err: any) {
    console.error("[harvest] Aggregation failed:", err.message);
    result.errors++;
  }

  return result;
}
