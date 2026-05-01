/**
 * scripts/harvest.ts
 *
 * Bulk-seeds real battle data from the Brawl Stars API.
 *
 * Run locally — typically takes 5-15 minutes depending on rate limits.
 *
 *   npx tsx scripts/harvest.ts
 *
 * Make sure your .env has BRAWL_STARS_API_KEY and DATABASE_URL set.
 *
 * Tracked modes (product decision, competitive-focused):
 *   Classic 3v3 ranked: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone,
 *                       Knockout, Siege
 *   Also included:      Wipeout (3v3, Knockout-like), Duels (1v1 skill)
 *
 * Excluded:
 *   Basket Brawl, Volley Brawl, Payload, Brawl Hockey, Brawl Arena,
 *   all 2v2/5v5 variants, Showdown, PvE.
 *
 * Mode shape handling:
 *   Most modes return battle.teams (2D array of teams). Duels returns
 *   battle.players (flat array, each player carries a `brawlers` array
 *   of 3 picks). Both shapes are normalized into a unified per-player
 *   per-brawler write loop so all tracked modes land in BattleRecord
 *   uniformly. The result perspective (who won) is flipped relative to
 *   the source player so each row's `result` field is from the brawler-
 *   user's POV, not the source's.
 */

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { toBrawlerName } from "../src/lib/brawler-name";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const BASE_URL =
  process.env.BRAWL_STARS_PROXY_URL || "https://api.brawlstars.com/v1";
console.log("[debug] BASE_URL:", BASE_URL);

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
const MAX_CHAIN_TAGS = 400;
const REGIONS = ["global", "US", "GB", "KR", "BR"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, attempt = 0): Promise<T> {
  const apiKey = process.env.BRAWL_STARS_API_KEY;
  if (!apiKey) throw new Error("BRAWL_STARS_API_KEY not set in .env");

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  // 429 is bounded — exponential backoff up to 5 retries (~5 min total),
  // then bail. The previous implementation recursed forever on a stuck
  // rate-limit, which could deadlock the harvest if the API key got
  // revoked or Supercell throttled aggressively.
  if (res.status === 429) {
    if (attempt >= 5) {
      throw new Error(
        `Rate limited 5 times in a row on ${path} — giving up on this request`
      );
    }
    const wait = 10_000 * Math.pow(2, attempt);
    console.log(
      `\n[harvest] Rate limited (attempt ${attempt + 1}/6), waiting ${wait / 1000}s...`
    );
    await sleep(wait);
    return apiFetch(path, attempt + 1);
  }

  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function fetchLeaderboard(countryCode = "global"): Promise<string[]> {
  const data = await apiFetch<{ items: { tag: string }[] }>(
    `/rankings/${countryCode}/players?limit=200`
  );
  return (data.items || []).map((p) => p.tag.replace(/^#/, ""));
}

async function fetchBattleLog(tag: string): Promise<any[]> {
  const encoded = encodeURIComponent("#" + tag);
  const data = await apiFetch<{ items: any[] }>(
    `/players/${encoded}/battlelog`
  );
  return data.items || [];
}

// ---------------------------------------------------------------------------
// Battle parsing
// ---------------------------------------------------------------------------

/**
 * Parses Brawl Stars's compact battle-time format (`20240315T142312.000Z`)
 * into a Date. Returns null on malformed input — callers skip the battle.
 */
function parseBattleTime(raw: string): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normalizes a player's brawler payload into a flat list. Most modes
 * give us `player.brawler` (singular). Duels gives `player.brawlers`
 * (array of 3). Returns [] if neither is present so the caller can skip.
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
 * Returns the result string from this player's POV given the source
 * player's `battle.result` and the team layout.
 *
 *   Team modes (battle.teams present): flip if player on teams[1].
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

  // Duels-style: no teams, opponent gets inverted result
  if (player.tag !== sourceTagWithHash) {
    return battleResult === "victory" ? "defeat" : "victory";
  }
  return battleResult;
}

// ---------------------------------------------------------------------------
// Per-player save
// ---------------------------------------------------------------------------

interface ProcessResult {
  saved: number;
  skipped: number;
  chainTags: string[];
}

async function processPlayer(
  prisma: PrismaClient,
  tag: string,
  brawlerIdByName: Record<string, string>
): Promise<ProcessResult> {
  const out: ProcessResult = { saved: 0, skipped: 0, chainTags: [] };

  let items: any[];
  try {
    items = await fetchBattleLog(tag);
  } catch {
    return out;
  }

  const sourceTagWithHash = `#${tag}`;

  for (const item of items) {
    try {
      const battle = item.battle;
      const event = item.event;

      // Filter at write time — keep the raw log small. Aggregator does
      // its own filtering, but we don't even bother saving stuff we
      // know won't survive (no map name, non-tracked mode, friendly).
      if (!event?.map || !battle?.mode) {
        out.skipped++;
        continue;
      }
      if (!COMPETITIVE_MODES.has(battle.mode)) {
        out.skipped++;
        continue;
      }
      if (battle.type === "friendly" || battle.type === "practice") {
        out.skipped++;
        continue;
      }

      const battleResult: string | undefined = battle.result;
      if (!battleResult) {
        out.skipped++;
        continue;
      }

      const battleTime = parseBattleTime(item.battleTime);
      if (!battleTime) {
        out.skipped++;
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
        if (cleanTag !== tag) out.chainTags.push(cleanTag);

        const playerResult = resolveResultForPlayer(
          player,
          sourceTagWithHash,
          teams,
          battleResult
        );
        const isStarPlayer = player.tag === starPlayerTag;

        // For Duels, write one row per brawler the player fielded —
        // each gets credit for the same match result, since Duels score
        // is per-player not per-brawler. For non-Duels modes this loop
        // runs exactly once.
        for (const rawBrawler of brawlers) {
          const brawlerName = toBrawlerName(rawBrawler.name);
          const brawlerId =
            brawlerIdByName[brawlerName.toLowerCase()] ?? null;

          try {
            await prisma.battleRecord.upsert({
              where: {
                battleTime_sourceTag_brawlerName: {
                  battleTime,
                  sourceTag: tag,
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
                sourceTag: tag,
              },
            });
            out.saved++;
          } catch (err: any) {
            out.skipped++;
            if (out.skipped <= 5) {
              console.error(
                `\n[harvest] upsert error (tag=${tag}): ${err.message}`
              );
            }
          }
        }
      }
    } catch (err: any) {
      // Swallow per-battle errors so one malformed entry doesn't kill
      // the player's whole batch. Bump skipped so the count surfaces.
      out.skipped++;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const prisma = new PrismaClient();
  console.log("=== Apollo Meta Harvester ===\n");

  const dbBrawlers = await prisma.brawler.findMany({
    select: { id: true, name: true },
  });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) {
    brawlerIdByName[b.name.toLowerCase()] = b.id;
  }
  console.log(`Loaded ${dbBrawlers.length} brawlers from DB\n`);

  // Phase 1: pull leaderboard tags from each region, dedup
  const seenTags = new Set<string>();
  const leaderboardTags: string[] = [];

  for (const region of REGIONS) {
    try {
      process.stdout.write(`Fetching ${region} leaderboard... `);
      const tags = await fetchLeaderboard(region);
      let added = 0;
      for (const t of tags) {
        if (!seenTags.has(t)) {
          seenTags.add(t);
          leaderboardTags.push(t);
          added++;
        }
      }
      console.log(`${added} new players`);
      await sleep(300);
    } catch (err: any) {
      console.log(`failed (${err.message})`);
    }
  }
  console.log(`\nTotal leaderboard players: ${leaderboardTags.length}\n`);

  // Phase 2: process leaderboard players, collect chain tags
  let totalSaved = 0;
  let totalSkipped = 0;
  const chainPool = new Set<string>();

  for (let i = 0; i < leaderboardTags.length; i++) {
    const tag = leaderboardTags[i];
    if (!tag) continue;

    const { saved, skipped, chainTags } = await processPlayer(
      prisma,
      tag,
      brawlerIdByName
    );
    totalSaved += saved;
    totalSkipped += skipped;

    for (const ct of chainTags) {
      if (!seenTags.has(ct)) chainPool.add(ct);
    }

    process.stdout.write(
      `\r[Leaderboard] ${i + 1}/${leaderboardTags.length} | Saved: ${totalSaved} battles`
    );
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`\n\nLeaderboard sweep done. Saved ${totalSaved} battles.\n`);

  // Phase 3: chain harvest unique tags seen in leaderboard battles
  const chainTags = Array.from(chainPool)
    .filter((t) => !seenTags.has(t))
    .slice(0, MAX_CHAIN_TAGS);

  console.log(
    `Chain harvesting ${chainTags.length} additional players...\n`
  );

  for (let i = 0; i < chainTags.length; i++) {
    const tag = chainTags[i];
    if (!tag) continue;

    seenTags.add(tag);
    const { saved, skipped } = await processPlayer(
      prisma,
      tag,
      brawlerIdByName
    );
    totalSaved += saved;
    totalSkipped += skipped;

    process.stdout.write(
      `\r[Chain] ${i + 1}/${chainTags.length} players | Total saved: ${totalSaved}`
    );
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`\n\nChain harvest done.\n`);

  console.log(`=== Harvest Summary ===`);
  console.log(`  Total battles saved: ${totalSaved}`);
  console.log(`  Total skipped:       ${totalSkipped}`);
  console.log(`  Players processed:   ${seenTags.size}`);

  await prisma.$disconnect();
  console.log(
    "\nDone! Run `npx tsx scripts/aggregate.ts` to compute real stats."
  );
}

main().catch((err) => {
  console.error("\nHarvest failed:", err);
  process.exit(1);
});
