/**
 * /api/players/[tag]/route.ts
 *
 * Player lookup — also fire-and-forgets a battle log save in the background
 * so every lookup seeds our real stats dataset automatically.
 *
 * As of the lookup-page rewrite, this endpoint also returns:
 *   - apolloScore (skill rating + tier + breakdown)
 *   - economy (gold spent, gold to max, gem equivalent, completion)
 *   - recentForm (last 25 battles, per-mode win rates, top recent brawler)
 *   - improvableBrawlers (high-trophy under-leveled picks)
 *   - All owned brawlers, with iconUrls hydrated from our DB
 *
 * The battle log is fetched once here and used in the response. The
 * fire-and-forget save below also calls fetchPlayerBattleLog, but Next.js
 * caches the API call (revalidate: 300), so it hits the local cache and
 * doesn't burn a real Brawl Stars API request.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, SEED_BRAWLERS } from "@/lib/constants";
import { analyzePlaystyle } from "@/services/playstyle-analyzer";
import { saveBattleLog } from "@/services/battle-log-service";
import {
  computeAccountEconomy,
  computeApolloScore,
  computeRecentForm,
  findImprovableBrawlers,
} from "@/lib/player-stats";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { tag: string } }
) {
  const tag = params.tag.replace(/^#/, "").toUpperCase();

  try {
    const data = await cached(`api:player:${tag}`, CACHE_TTL.PLAYER, async () => {
      // Pull the full brawler dictionary once so we can hydrate iconUrls
      // and types on every owned brawler in the player's account, not
      // just the top 6 we used to surface.
      const dbBrawlers = await prisma.brawler.findMany().catch(() => []);
      const dbByName: Record<string, typeof dbBrawlers[number]> = {};
      for (const b of dbBrawlers) {
        dbByName[b.name.toUpperCase()] = b;
      }

      if (process.env.BRAWL_STARS_API_KEY) {
        try {
          const { fetchPlayer, fetchPlayerBattleLog } = await import(
            "@/services/brawlstars-api"
          );
          // Fan out player + battle log in parallel. Battle log failures
          // (e.g. private profile, regional API hiccup) shouldn't break
          // the lookup — fall back to an empty list and degrade gracefully.
          const [player, battleLogRaw] = await Promise.all([
            fetchPlayer(tag),
            fetchPlayerBattleLog(tag).catch(() => ({ items: [] })),
          ]);
          const battleLogItems: any[] = battleLogRaw?.items ?? [];

          // Fire-and-forget save — seeds our dataset. Won't double-fetch
          // the API thanks to Next.js's per-request fetch cache.
          saveBattleLog(prisma, tag)
            .then((result) => {
              console.log(
                `[battle-log] ${tag}: saved=${result.saved} skipped=${result.skipped} errors=${result.errors}`
              );
            })
            .catch((err) => {
              console.warn(`[battle-log] Failed to save for ${tag}:`, err.message);
            });

          // Enrich every owned brawler with our DB metadata (iconUrl,
          // type). Brawlers our DB doesn't know about (newly released,
          // not yet synced) fall back to lane/null which the UI handles.
          const ownedBrawlers = player.brawlers.map((b) => {
            const dbMatch = dbByName[b.name.toUpperCase()];
            return {
              name: b.name,
              type: dbMatch?.type ?? "lane",
              trophies: b.trophies,
              power: b.power,
              rank: b.rank,
              iconUrl: dbMatch?.iconUrl ?? null,
              externalId: dbMatch?.externalId ?? b.id ?? null,
            };
          });

          // Top brawlers — sorted by trophies, top 6. These are the
          // "main" picks shown in the strongest-brawlers card.
          const topBrawlers = [...ownedBrawlers]
            .sort((a, b) => b.trophies - a.trophies)
            .slice(0, 6);

          // Playstyle classification — feed it the same brawler shape
          // the analyzer expects. We only use trophies + type.
          const analysis = analyzePlaystyle(
            topBrawlers.map((b) => ({
              brawlerId: b.name,
              brawlerName: b.name,
              brawlerType: b.type,
              brawlerIcon: b.iconUrl,
              trophies: b.trophies,
              powerLevel: b.power,
              personalWinRate: null,
            }))
          );
          const playstyleColors: Record<string, string> = {
            aggressive: "#F09595",
            passive: "#5DCAA5",
            balanced: "#85B7EB",
          };

          // Number-crunching layer — all isolated in player-stats.ts.
          const economy = computeAccountEconomy(ownedBrawlers);
          const recentForm = computeRecentForm(battleLogItems, tag);
          const apolloScore = computeApolloScore({
            highestTrophies: player.highestTrophies,
            recentWinRate: recentForm.winRate,
            maxedCount: economy.maxedCount,
            starPlayerRate: recentForm.starPlayerRate,
          });
          const improvableBrawlers = findImprovableBrawlers(ownedBrawlers);

          return {
            tag,
            name: player.name,
            trophies: player.trophies,
            highestTrophies: player.highestTrophies,
            clubName: player.club?.name || null,
            level: player.expLevel,
            wins: player["3vs3Victories"],
            playstyle: analysis.playstyle,
            playstyleColor: playstyleColors[analysis.playstyle],
            topBrawlers,
            improvableBrawlers,
            apolloScore,
            economy,
            recentForm,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            suggestions: analysis.suggestions,
            isMock: false,
          };
        } catch (e) {
          // Fall through to mock data
        }
      }

      const brawlerPool =
        dbBrawlers.length > 0
          ? dbBrawlers.map((b) => ({
              name: b.name,
              type: b.type,
              iconUrl: b.iconUrl,
              externalId: b.externalId,
            }))
          : SEED_BRAWLERS.map((b) => ({
              name: b.name,
              type: b.type,
              iconUrl: null,
              externalId: null,
            }));

      return generateMockPlayer(tag, brawlerPool);
    });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch player", detail: error.message },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Mock player generator                                                      */
/* -------------------------------------------------------------------------- */
//
// Deterministic from the tag (same tag → same numbers) so dev users see
// stable data while iterating. Now generates the same shape as the real
// path, including a synthetic battle log so the recent-form strip
// renders meaningfully without an API key.

function generateMockPlayer(
  tag: string,
  brawlerPool: {
    name: string;
    type: string;
    iconUrl: string | null;
    externalId: number | null;
  }[]
) {
  const seed = tag.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rng = (min: number, max: number) =>
    Math.round(
      min + (((seed * 9301 + 49297) % 233280) / 233280) * (max - min)
    );
  // Variant rng for adding spread between brawlers using an offset.
  const rngOffset = (offset: number, min: number, max: number) => {
    const s = seed + offset;
    return Math.round(min + (((s * 9301 + 49297) % 233280) / 233280) * (max - min));
  };

  // Generate ALL brawlers in the pool with realistic power/trophy spread
  const ownedBrawlers = brawlerPool.map((b, i) => ({
    name: b.name,
    type: b.type,
    trophies: rngOffset(i * 7, 50, 800),
    power: rngOffset(i * 13, 1, 11),
    rank: rngOffset(i * 19, 1, 25),
    iconUrl: b.iconUrl,
    externalId: b.externalId,
  }));

  const topBrawlers = [...ownedBrawlers]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 6);

  const totalTrophies =
    topBrawlers.reduce((s, b) => s + b.trophies, 0) + rng(2000, 8000);
  const highestTrophies = totalTrophies + rng(500, 2500);

  const tanks = topBrawlers.filter(
    (b) => b.type === "tank" || b.type === "assassin"
  ).length;
  const snipers = topBrawlers.filter(
    (b) => b.type === "sniper" || b.type === "thrower"
  ).length;

  let playstyle: "aggressive" | "passive" | "balanced" = "balanced";
  let playstyleColor = "#85B7EB";
  if (tanks >= 3) {
    playstyle = "aggressive";
    playstyleColor = "#F09595";
  } else if (snipers >= 3) {
    playstyle = "passive";
    playstyleColor = "#5DCAA5";
  }

  // Synthetic battle log — 25 battles with realistic mode/result spread.
  const modes = ["gemGrab", "brawlBall", "knockout", "hotZone", "bounty", "brawlHockey"];
  const items: any[] = Array.from({ length: 25 }).map((_, i) => {
    const r = rngOffset(i * 31, 0, 100);
    const result = r < 55 ? "victory" : r < 90 ? "defeat" : "draw";
    const brawler = topBrawlers[rngOffset(i * 41, 0, topBrawlers.length - 1)];
    const mode = modes[rngOffset(i * 53, 0, modes.length - 1)];
    const isStar = result === "victory" && rngOffset(i * 67, 0, 100) < 25;
    return {
      battleTime: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      event: { map: "Sample Map" },
      battle: {
        mode,
        result,
        trophyChange: result === "victory" ? rngOffset(i * 71, 4, 9) : -rngOffset(i * 73, 3, 7),
        starPlayer: isStar ? { tag: "#" + tag } : null,
        teams: [
          [{ tag: "#" + tag, brawler: { name: brawler.name } }],
          [{ tag: "#OPP" }],
        ],
      },
    };
  });

  const analysis = analyzePlaystyle(
    topBrawlers.map((b) => ({
      brawlerId: b.name,
      brawlerName: b.name,
      brawlerType: b.type,
      brawlerIcon: b.iconUrl,
      trophies: b.trophies,
      powerLevel: b.power,
      personalWinRate: null,
    }))
  );

  const economy = computeAccountEconomy(ownedBrawlers);
  const recentForm = computeRecentForm(items, tag);
  const apolloScore = computeApolloScore({
    highestTrophies,
    recentWinRate: recentForm.winRate,
    maxedCount: economy.maxedCount,
    starPlayerRate: recentForm.starPlayerRate,
  });
  const improvableBrawlers = findImprovableBrawlers(ownedBrawlers);

  return {
    tag,
    name: "Player" + (seed % 9999),
    trophies: totalTrophies,
    highestTrophies,
    clubName: ["StarForce", "NovaEsports", "TribeGaming", "Omen Elite"][seed % 4],
    level: rng(80, 150),
    wins: rng(3000, 10000),
    playstyle: analysis.playstyle,
    playstyleColor,
    topBrawlers,
    improvableBrawlers,
    apolloScore,
    economy,
    recentForm,
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    suggestions: analysis.suggestions,
    isMock: true,
  };
}
