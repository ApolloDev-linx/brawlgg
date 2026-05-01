/**
 * leaderboard-harvester.ts
 *
 * Service-layer version of scripts/harvest.ts. Used by the API cron
 * route (/api/cron/harvest, when present) and by anything else that
 * wants to programmatically trigger a harvest from inside the Next.js
 * app.
 *
 * The standalone CLI script in scripts/harvest.ts duplicates this
 * logic — keeping them parallel matters: a divergence here is exactly
 * how Duels battles disappeared in the first place. If you change one,
 * change the other.
 *
 * Tracked modes (product decision — competitive ranked focus):
 *   Classic 3v3: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone, Knockout, Siege
 *   Plus:        Wipeout (3v3), Duels (1v1)
 * Excluded:
 *   Novelty modes (Basket/Volley Brawl, Payload, Brawl Hockey),
 *   2v2/5v5 variants, Showdown, PvE.
 */

import { PrismaClient } from "@prisma/client";
import { fetchLeaderboard, fetchPlayerBattleLog } from "./brawlstars-api";
import { aggregateStats } from "./stat-aggregator";
import { toBrawlerName } from "../lib/brawler-name";

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

const REQUEST_DELAY_MS = 200;
const MAX_CHAIN_TAGS = 300;
const REGIONS = ["global", "US", "GB", "KR", "BR"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HarvestResult {
  leaderboardPlayers: number;
  chainPlayers: number;
  totalBattlesSaved: number;
  totalSkipped: number;
  errors: number;
  aggregation: Awaited<ReturnType<typeof aggregateStats>> | null;
}

// ---------------------------------------------------------------------------
// Battle parsing helpers — kept identical to scripts/harvest.ts. Resist the
// urge to move these into a shared module without verifying both files
// import from the same place; a stale duplicate is the failure mode.
// ---------------------------------------------------------------------------

function extractBrawlers(player: any): { name: string }[] {
  if (player?.brawler?.name) return [player.brawler];
  if (Array.isArray(player?.brawlers)) {
    return player.brawlers.filter(
      (b: any): b is { name: string } => !!b?.name
    );
  }
  return [];
}

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

  if (player.tag !== sourceTagWithHash) {
    return battleResult === "victory" ? "defeat" : "victory";
  }
  return battleResult;
}

// ---------------------------------------------------------------------------
// Per-player save
// ---------------------------------------------------------------------------

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

        const cleanTag = (player.tag as string).replace(/^#/, "");
        if (cleanTag !== playerTag) result.chainTags.push(cleanTag);

        const playerResult = resolveResultForPlayer(
          player,
          sourceTagWithHash,
          teams,
          battleResult
        );
        const isStarPlayer = player.tag === starPlayerTag;

        for (const rawBrawler of brawlers) {
          const brawlerName = toBrawlerName(rawBrawler.name);
          const brawlerId =
            brawlerIdByName[brawlerName.toLowerCase()] ?? null;

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

// ---------------------------------------------------------------------------
// Main entry — leaderboard sweep + chain harvest + aggregate
// ---------------------------------------------------------------------------

export async function runHarvest(prisma: PrismaClient): Promise<HarvestResult> {
  const result: HarvestResult = {
    leaderboardPlayers: 0,
    chainPlayers: 0,
    totalBattlesSaved: 0,
    totalSkipped: 0,
    errors: 0,
    aggregation: null,
  };

  const dbBrawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) {
    brawlerIdByName[b.name.toLowerCase()] = b.id;
  }

  // Leaderboard sweep
  const seenTags = new Set<string>();
  const leaderboardTags: string[] = [];

  for (const region of REGIONS) {
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
      await sleep(REQUEST_DELAY_MS);
    } catch (err: any) {
      console.warn(
        `[harvest] Failed to fetch ${region} leaderboard: ${err.message}`
      );
      result.errors++;
    }
  }
  console.log(
    `[harvest] Got ${leaderboardTags.length} unique leaderboard players`
  );
  result.leaderboardPlayers = leaderboardTags.length;

  // Process leaderboard players, collecting chain tags as we go
  const chainTagPool = new Set<string>();
  for (let i = 0; i < leaderboardTags.length; i++) {
    const tag = leaderboardTags[i];
    if (!tag) continue;

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
        `\r[harvest] Leaderboard: ${i + 1}/${leaderboardTags.length} | Saved: ${result.totalBattlesSaved}`
      );
      await sleep(REQUEST_DELAY_MS);
    } catch {
      result.errors++;
    }
  }
  console.log("\n[harvest] Leaderboard sweep complete");

  // Chain harvest
  const chainTags = Array.from(chainTagPool)
    .filter((t) => !seenTags.has(t))
    .slice(0, MAX_CHAIN_TAGS);
  console.log(
    `[harvest] Chain harvesting ${chainTags.length} additional players...`
  );
  result.chainPlayers = chainTags.length;

  for (let i = 0; i < chainTags.length; i++) {
    const tag = chainTags[i];
    if (!tag) continue;

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
      await sleep(REQUEST_DELAY_MS);
    } catch {
      result.errors++;
    }
  }
  console.log("\n[harvest] Chain harvest complete");

  // Aggregate
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
