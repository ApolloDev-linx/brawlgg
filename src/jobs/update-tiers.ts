/**
 * Daily tier recalculation.
 * Run at midnight via cron.
 * 
 * This wraps compute-win-rates with additional
 * pick-category assignment logic.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function updateTiers() {
  console.log("[update-tiers] Starting daily tier update...");

  try {
    const stats = await prisma.mapBrawlerStat.findMany({
      include: { brawler: true },
    });

    for (const s of stats) {
      let pickCategory: string | null = null;

      if (s.winRate >= 54 && s.pickRate >= 8) {
        pickCategory = "first_pick";
      } else if (s.winRate >= 51 && s.banRate < 3) {
        pickCategory = "safe";
      } else if (s.winRate >= 53 && s.banRate >= 5) {
        pickCategory = "high_risk";
      }

      if (pickCategory !== s.pickCategory) {
        await prisma.mapBrawlerStat.update({
          where: { id: s.id },
          data: { pickCategory },
        });
      }
    }

    console.log("[update-tiers] Done.");
  } catch (error) {
    console.error("[update-tiers] Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  updateTiers();
}
