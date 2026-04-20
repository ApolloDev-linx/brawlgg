import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";
import { wilsonScoreLowerBound } from "@/lib/stats-utils";
import { MapList } from "@/components/maps/MapList";

export const dynamic = "force-dynamic";

// Bayesian prior: adds N virtual 50/50 games to every brawler before ranking.
// Stops small-sample outliers (5-0, 2-0, etc) from topping the list on maps
// with thin data. Crank this up if rankings still feel noisy, down if proven
// brawlers are getting shrunk too aggressively.
const MAP_RANKING_PRIOR = 50;

async function getMaps() {
  return cached("maps:all", CACHE_TTL.MAPS, async () => {
    const maps = await prisma.map.findMany({
      where: { active: true },
      include: {
        gameMode: true,
        brawlerStats: {
          include: { brawler: true },
          // no orderBy/take — we want every brawler with data, sorted in JS
          // below using Wilson lower bound so small samples get deprioritized
        },
      },
      orderBy: { name: "asc" },
    });

    // Sort each map's brawlers by Wilson score w/ prior (best-to-worst)
    const sortedMaps = maps.map((m) => ({
      ...m,
      brawlerStats: [...m.brawlerStats].sort((a, b) => {
        const aWins = Math.round((a.winRate / 100) * a.sampleSize);
        const bWins = Math.round((b.winRate / 100) * b.sampleSize);
        return (
          wilsonScoreLowerBound(bWins, b.sampleSize, MAP_RANKING_PRIOR) -
          wilsonScoreLowerBound(aWins, a.sampleSize, MAP_RANKING_PRIOR)
        );
      }),
    }));

    const modes = await prisma.gameMode.findMany({ orderBy: { name: "asc" } });
    return { maps: sortedMaps, modes };
  });
}

export default async function MapsPage() {
  let data: Awaited<ReturnType<typeof getMaps>>;
  try {
    data = await getMaps();
  } catch {
    data = { maps: [], modes: [] };
  }
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Map meta engine</h1>
        <p className="text-sm text-text-secondary">
          Select a map to see the best brawlers and competitive stats
        </p>
      </div>
      {data.maps.length === 0 ? (
        <div className="bg-bg-secondary rounded-xl p-8 text-center text-sm text-text-secondary">
          No maps found. Run <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs font-mono">npm run db:seed</code> to load data.
        </div>
      ) : (
        <MapList maps={data.maps} modes={data.modes} />
      )}
    </div>
  );
}
