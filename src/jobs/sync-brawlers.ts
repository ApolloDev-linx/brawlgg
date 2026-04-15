/**
 * Sync brawler data from the Brawl Stars / Brawlify API.
 * Run every 6 hours via cron or Vercel cron.
 *
 * Usage:
 *   npx tsx src/jobs/sync-brawlers.ts
 *
 * Or expose as a Vercel cron endpoint:
 *   /api/cron/sync-brawlers (with CRON_SECRET auth)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function syncBrawlers() {
  console.log("[sync-brawlers] Starting sync...");

  try {
    // Try Brawlify API (no auth required)
    const res = await fetch("https://api.brawlapi.com/v1/brawlers", {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Brawlify API returned ${res.status}`);
    }

    const data = await res.json();
    const brawlerList = data.list || [];

    console.log(`[sync-brawlers] Fetched ${brawlerList.length} brawlers`);

    for (const b of brawlerList) {
      await prisma.brawler.upsert({
        where: { name: b.name },
        update: {
          iconUrl: b.imageUrl || b.imageUrl2 || null,
          updatedAt: new Date(),
        },
        create: {
          name: b.name,
          role: b.class?.name || "Unknown",
          type: classifyBrawlerType(b.class?.name),
          hp: 4000, // Default, would need per-brawler data
          iconUrl: b.imageUrl || b.imageUrl2 || null,
        },
      });
    }

    console.log("[sync-brawlers] Sync complete.");
  } catch (error) {
    console.error("[sync-brawlers] Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

function classifyBrawlerType(className: string | undefined): string {
  if (!className) return "lane";
  const lower = className.toLowerCase();
  if (lower.includes("tank")) return "tank";
  if (lower.includes("assassin")) return "assassin";
  if (lower.includes("sniper") || lower.includes("marksman")) return "sniper";
  if (lower.includes("thrower") || lower.includes("controller"))
    return "thrower";
  return "lane";
}

// Allow direct execution
if (require.main === module) {
  syncBrawlers();
}
