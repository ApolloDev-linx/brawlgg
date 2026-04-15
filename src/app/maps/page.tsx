import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";
import { MapList } from "@/components/maps/MapList";

async function getMaps() {
  return cached("maps:all", CACHE_TTL.MAPS, async () => {
    const maps = await prisma.map.findMany({
      where: { active: true },
      include: {
        gameMode: true,
        brawlerStats: {
          include: { brawler: true },
          orderBy: { winRate: "desc" },
          take: 5,
        },
      },
      orderBy: { name: "asc" },
    });

    const modes = await prisma.gameMode.findMany({ orderBy: { name: "asc" } });

    return { maps, modes };
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
