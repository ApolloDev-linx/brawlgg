/**
 * leaderboard-harvester.ts
 *
 * Bulk-seeds real battle data by:
 * 1. Pulling top 200 players from global + regional leaderboards
 * 2. Processing each player's battle log
 * 3. Chain-harvesting unique tags seen in those battles (1 level deep)
 * 4. Running stat aggregation at the end
 *
 * One run = ~30,000+ battle records. Run it manually or via cron.
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
]);

// Delay between API calls to avoid rate limiting (ms)
const REQUEST_DELAY = 200;

// How many chain tags to follow after the leaderboard sweep
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

/**
 * Process a single player's battle log and save records to DB.
 * Returns { saved, skipped, chainTags } where chainTags are new
 * player tags found in those battles we haven't processed yet.
 */
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
      if (battle.type === "friendly") { result.skipped++; continue; }

      const battleResult = battle.result as string | undefined;
      if (!battleResult) { result.skipped++; continue; }

      const battleTime = new Date(item.battleTime);
      const mapName = event.map;
      const gameMode = battle.mode;
      const teams: any[][] = battle.teams || [];
      const starPlayerTag = battle.starPlayer?.tag;

      for (const team of teams) {
        for (const player of team) {
          if (!player?.brawler?.name || !player?.tag) continue;

          // Collect chain tags from teammates/opponents
          const cleanTag = (player.tag as string).replace(/^#/, "");
          if (cleanTag !== playerTag) {
            result.chainTags.push(cleanTag);
          }

          const rawName = player.brawler.name as string;
          const brawlerName = rawName
            .toLowerCase()
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

          const brawlerId = brawlerIdByName[brawlerName.toLowerCase()] ?? null;
          const isStarPlayer = player.tag === starPlayerTag;

          // Determine correct result per team
          const teamIndex = teams.indexOf(team);
          let playerResult = battleResult;
          if (battleResult === "victory" && teamIndex === 1) playerResult = "defeat";
          if (battleResult === "defeat" && teamIndex === 1) playerResult = "victory";

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

  // Build brawler name → id lookup once
  const dbBrawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) brawlerIdByName[b.name.toLowerCase()] = b.id;

  // Step 1 — Fetch leaderboard players from multiple regions for diversity
  const regions = ["global", "US", "GB", "KR", "BR"];
  const seenTags = new Set<string>();
  const leaderboardTags: string[] = [];

  for (const region of regions) {
    try {
      console.log(`[harvest] Fetching ${region} leaderboard...`);
      const players = await fetchLeaderboard(region);
      for (const p of players) {
        const tag = p.tag.replace(/^#/, "");
        if (!seenTags.has(tag)) {
          seenTags.add(tag);
          leaderboardTags.push(tag);
        }
      }
      await sleep(REQUEST_DELAY);
    } catch (err: any) {
      console.warn(`[harvest] Failed to fetch ${region} leaderboard: ${err.message}`);
      result.errors++;
    }
  }

  console.log(`[harvest] Got ${leaderboardTags.length} unique leaderboard players`);
  result.leaderboardPlayers = leaderboardTags.length;

  // Step 2 — Process leaderboard players and collect chain tags
  const chainTagPool = new Set<string>();

  for (const tag of leaderboardTags) {
    try {
      const { saved, skipped, chainTags } = await processPlayer(
        prisma,
        tag,
        brawlerIdByName
      );
      result.totalBattlesSaved += saved;
      result.totalSkipped += skipped;

      for (const ct of chainTags) {
        if (!seenTags.has(ct)) chainTagPool.add(ct);
      }

      process.stdout.write(
        `\r[harvest] Leaderboard: ${leaderboardTags.indexOf(tag) + 1}/${leaderboardTags.length} | Saved: ${result.totalBattlesSaved}`
      );
      await sleep(REQUEST_DELAY);
    } catch (err: any) {
      result.errors++;
    }
  }

  console.log("\n[harvest] Leaderboard sweep complete");

  // Step 3 — Chain harvest: process tags seen in battles (up to MAX_CHAIN_TAGS)
  const chainTags = Array.from(chainTagPool)
    .filter((t) => !seenTags.has(t))
    .slice(0, MAX_CHAIN_TAGS);

  console.log(`[harvest] Chain harvesting ${chainTags.length} additional players...`);
  result.chainPlayers = chainTags.length;

  for (let i = 0; i < chainTags.length; i++) {
    const tag = chainTags[i];
    seenTags.add(tag);

    try {
      const { saved, skipped } = await processPlayer(
        prisma,
        tag,
        brawlerIdByName
      );
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

  // Step 4 — Aggregate into real stats
  console.log("[harvest] Running stat aggregation...");
  try {
    result.aggregation = await aggregateStats();
    console.log(
      `[harvest] Aggregation done: ${result.aggregation.realStatsCount} real stat rows`
    );
  } catch (err: any) {
    console.error("[harvest] Aggregation failed:", err.message);
    result.errors++;
  }

  return result;
}
