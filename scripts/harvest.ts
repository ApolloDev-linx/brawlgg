/**
 * scripts/harvest.ts
 *
 * Run this locally whenever you want to bulk-seed real battle data.
 *
 * Usage:
 *   npx tsx scripts/harvest.ts
 *
 * Make sure your .env has BRAWL_STARS_API_KEY and DATABASE_URL set.
 * Typically takes 5-15 minutes depending on API rate limits.
 *
 * Tracked modes (product decision, competitive-focused):
 *   Classic 3v3 ranked: Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone,
 *                       Knockout, Siege
 *   Also included:      Wipeout (3v3, Knockout-like), Duels (1v1 skill)
 *
 * Excluded (novelty / non-ranked-relevant):
 *   Basket Brawl, Volley Brawl, Payload, Brawl Hockey, Brawl Arena,
 *   all 2v2/5v5 variants, Showdown (solo/duo), PvE modes
 */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { toBrawlerName } from "../src/lib/brawler-name";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const BASE_URL = process.env.BRAWL_STARS_PROXY_URL || "https://api.brawlstars.com/v1";
console.log("[debug] BASE_URL:", BASE_URL);

async function apiFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.BRAWL_STARS_API_KEY;
  if (!apiKey) throw new Error("BRAWL_STARS_API_KEY not set in .env");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (res.status === 429) {
    console.log("\n[harvest] Rate limited, waiting 10s...");
    await sleep(10_000);
    return apiFetch(path);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseBattleTime(raw: string): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Competitive modes we care about (camelCase, matches Brawl Stars API battle.mode)
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

async function fetchLeaderboard(countryCode = "global"): Promise<string[]> {
  const data = await apiFetch<{ items: { tag: string }[] }>(
    `/rankings/${countryCode}/players?limit=200`
  );
  return (data.items || []).map((p) => p.tag.replace(/^#/, ""));
}

async function fetchBattleLog(tag: string): Promise<any[]> {
  const encoded = encodeURIComponent("#" + tag);
  const data = await apiFetch<{ items: any[] }>(`/players/${encoded}/battlelog`);
  return data.items || [];
}

async function processPlayer(
  prisma: PrismaClient,
  tag: string,
  brawlerIdByName: Record<string, string>
): Promise<{ saved: number; skipped: number; chainTags: string[] }> {
  const out = { saved: 0, skipped: 0, chainTags: [] as string[] };
  let items: any[];
  try {
    items = await fetchBattleLog(tag);
  } catch {
    return out;
  }
  for (const item of items) {
    try {
      const battle = item.battle;
      const event = item.event;
      if (!event?.map || !battle?.mode) { out.skipped++; continue; }
      if (!COMPETITIVE_MODES.has(battle.mode)) { out.skipped++; continue; }
      if (battle.type === "friendly" || battle.type === "practice") { out.skipped++; continue; }
      const battleResult: string = battle.result;
      if (!battleResult) { out.skipped++; continue; }
      const battleTime = parseBattleTime(item.battleTime);
      if (!battleTime) { out.skipped++; continue; }
      const mapName: string = event.map;
      const gameMode: string = battle.mode;
      const starPlayerTag: string | undefined = battle.starPlayer?.tag;
      const teams: any[][] = battle.teams || [];
      const allPlayers: any[] = battle.players
        ? battle.players
        : teams.flat();
      for (const player of allPlayers) {
        if (!player?.brawler?.name || !player?.tag) continue;
        const cleanTag = (player.tag as string).replace(/^#/, "");
        if (cleanTag !== tag) out.chainTags.push(cleanTag);
        // Canonical name via shared util — must match brawler-sync output
        // so battle records correctly link to their brawlerId.
        const brawlerName = toBrawlerName(player.brawler.name as string);
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
            console.error(`\n[harvest] upsert error (tag=${tag}): ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      out.skipped++;
      if (out.skipped <= 5) {
        console.error(`\n[harvest] battle parse error (tag=${tag}): ${err.message}`);
      }
    }
  }
  return out;
}

async function main() {
  const prisma = new PrismaClient();
  console.log("=== BrawlGG Leaderboard Harvester ===\n");
  const dbBrawlers = await prisma.brawler.findMany({ select: { id: true, name: true } });
  const brawlerIdByName: Record<string, string> = {};
  for (const b of dbBrawlers) brawlerIdByName[b.name.toLowerCase()] = b.id;
  console.log(`Loaded ${dbBrawlers.length} brawlers from DB\n`);
  const regions = ["global", "US", "GB", "KR", "BR"];
  const seenTags = new Set<string>();
  const leaderboardTags: string[] = [];
  for (const region of regions) {
    try {
      process.stdout.write(`Fetching ${region} leaderboard... `);
      const tags = await fetchLeaderboard(region);
      let added = 0;
      for (const t of tags) {
        if (!seenTags.has(t)) { seenTags.add(t); leaderboardTags.push(t); added++; }
      }
      console.log(`${added} new players`);
      await sleep(300);
    } catch (err: any) {
      console.log(`failed (${err.message})`);
    }
  }
  console.log(`\nTotal leaderboard players: ${leaderboardTags.length}\n`);
  let totalSaved = 0;
  let totalSkipped = 0;
  const chainPool = new Set<string>();
  for (let i = 0; i < leaderboardTags.length; i++) {
    const tag = leaderboardTags[i];
    const { saved, skipped, chainTags } = await processPlayer(prisma, tag, brawlerIdByName);
    totalSaved += saved;
    totalSkipped += skipped;
    for (const ct of chainTags) { if (!seenTags.has(ct)) chainPool.add(ct); }
    process.stdout.write(
      `\r[Leaderboard] ${i + 1}/${leaderboardTags.length} players | Saved: ${totalSaved} battles`
    );
    await sleep(200);
  }
  console.log(`\n\nLeaderboard sweep done. Saved ${totalSaved} battles.\n`);
  const chainTags = Array.from(chainPool).filter((t) => !seenTags.has(t)).slice(0, 400);
  console.log(`Chain harvesting ${chainTags.length} additional players...\n`);
  for (let i = 0; i < chainTags.length; i++) {
    const tag = chainTags[i];
    seenTags.add(tag);
    const { saved, skipped } = await processPlayer(prisma, tag, brawlerIdByName);
    totalSaved += saved;
    totalSkipped += skipped;
    process.stdout.write(
      `\r[Chain] ${i + 1}/${chainTags.length} players | Total saved: ${totalSaved} battles`
    );
    await sleep(200);
  }
  console.log(`\n\nChain harvest done.\n`);
  console.log(`=== Harvest Summary ===`);
  console.log(`  Total battles saved: ${totalSaved}`);
  console.log(`  Total skipped:       ${totalSkipped}`);
  console.log(`  Players processed:   ${seenTags.size}`);
  await prisma.$disconnect();
  console.log("\nDone! Run the aggregate cron or hit /api/cron/aggregate to compute real stats.");
}

main().catch((err) => {
  console.error("\nHarvest failed:", err);
  process.exit(1);
});
