import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL, SEED_BRAWLERS } from "@/lib/constants";
import { analyzePlaystyle } from "@/services/playstyle-analyzer";

export async function GET(
  _request: Request,
  { params }: { params: { tag: string } }
) {
  const tag = params.tag.replace(/^#/, "").toUpperCase();

  try {
    const data = await cached(`api:player:${tag}`, CACHE_TTL.PLAYER, async () => {
      const dbBrawlers = await prisma.brawler.findMany().catch(() => []);
      const typeLookup: Record<string, string> = {};
      for (const b of dbBrawlers) {
        typeLookup[b.name.toUpperCase()] = b.type;
      }

      if (process.env.BRAWL_STARS_API_KEY) {
        try {
          const { fetchPlayer } = await import("@/services/brawlstars-api");
          const player = await fetchPlayer(tag);

          const brawlerData = player.brawlers
            .sort((a, b) => b.trophies - a.trophies)
            .slice(0, 6)
            .map((b) => ({
              name: b.name,
              brawlerType: typeLookup[b.name.toUpperCase()] || "lane",
              trophies: b.trophies,
              power: b.power,
              brawlerName: b.name,
              brawlerId: String(b.id),
              brawlerIcon: null,
              powerLevel: b.power,
              personalWinRate: null,
            }));

          const analysis = analyzePlaystyle(brawlerData);
          const playstyleColors: Record<string, string> = {
            aggressive: "#F09595",
            passive: "#5DCAA5",
            balanced: "#85B7EB",
          };

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
            topBrawlers: brawlerData.map((b) => ({
              name: b.name,
              type: b.brawlerType,
              trophies: b.trophies,
              power: b.power,
            })),
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            suggestions: analysis.suggestions,
          };
        } catch (e) {
          // Fall through to mock data
        }
      }

      const brawlerPool = dbBrawlers.length > 0
        ? dbBrawlers.map((b) => ({ name: b.name, type: b.type }))
        : SEED_BRAWLERS.map((b) => ({ name: b.name, type: b.type }));
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

function generateMockPlayer(
  tag: string,
  brawlerPool: { name: string; type: string }[]
) {
  const seed = tag.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rng = (min: number, max: number) =>
    Math.round(min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min));

  const shuffled = [...brawlerPool].sort(
    () => ((seed * 13) % 7) / 7 - 0.5
  );
  const topBrawlers = shuffled.slice(0, 6).map((b) => ({
    name: b.name,
    type: b.type,
    trophies: rng(500, 850),
    power: rng(7, 11),
  }));

  const totalTrophies =
    topBrawlers.reduce((s, b) => s + b.trophies, 0) + rng(5000, 18000);

  const tanks = topBrawlers.filter(
    (b) => b.type === "tank" || b.type === "assassin"
  ).length;
  const snipers = topBrawlers.filter(
    (b) => b.type === "sniper" || b.type === "thrower"
  ).length;

  let playstyle = "balanced";
  let playstyleColor = "#85B7EB";
  if (tanks >= 3) {
    playstyle = "aggressive";
    playstyleColor = "#F09595";
  } else if (snipers >= 3) {
    playstyle = "passive";
    playstyleColor = "#5DCAA5";
  }

  const brawlerData = topBrawlers.map((b) => ({
    brawlerId: b.name,
    brawlerName: b.name,
    brawlerType: b.type,
    brawlerIcon: null,
    trophies: b.trophies,
    powerLevel: b.power,
    personalWinRate: null,
  }));

  const analysis = analyzePlaystyle(brawlerData);

  return {
    tag,
    name: "Player" + (seed % 9999),
    trophies: totalTrophies,
    highestTrophies: totalTrophies + rng(500, 2000),
    clubName: ["StarForce", "NovaEsports", "TribeGaming", "Omen Elite"][seed % 4],
    level: rng(80, 150),
    wins: rng(3000, 10000),
    playstyle: analysis.playstyle,
    playstyleColor,
    topBrawlers,
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    suggestions: analysis.suggestions,
  };
}
