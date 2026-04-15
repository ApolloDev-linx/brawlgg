import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  try {
    const data = await cached(
      `api:maps:${mode || "all"}`,
      CACHE_TTL.MAPS,
      async () => {
        const where: any = { active: true };
        if (mode) {
          where.gameMode = { name: mode };
        }

        const maps = await prisma.map.findMany({
          where,
          include: {
            gameMode: true,
            brawlerStats: {
              include: { brawler: true },
              orderBy: { winRate: "desc" },
              take: 10,
            },
          },
          orderBy: { name: "asc" },
        });

        return maps;
      }
    );

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch maps", detail: error.message },
      { status: 500 }
    );
  }
}
