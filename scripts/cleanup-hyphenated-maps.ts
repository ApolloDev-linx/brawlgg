/**
 * One-time cleanup: delete BattleRecord rows from novelty modes that we
 * no longer track. Safe to run — it only drops battles whose gameMode
 * doesn't match our current COMPETITIVE_MODES allowlist.
 *
 * After running this + scripts/aggregate.ts, the /debug/stats page should
 * show near-zero dropped battles and healthy rows across the board.
 *
 * Usage:
 *   npx tsx scripts/cleanup-untracked-modes.ts
 */

import { PrismaClient } from "@prisma/client";

// Must match COMPETITIVE_MODES in harvest.ts and leaderboard-harvester.ts
const TRACKED_MODES = [
  "gemGrab",
  "brawlBall",
  "bounty",
  "heist",
  "hotZone",
  "knockout",
  "siege",
  "wipeout",
  "duels",
];

async function main() {
  const prisma = new PrismaClient();
  console.log("\n=== Untracked Mode Cleanup ===\n");

  // Count what's about to be deleted, grouped so we can see the damage
  const toDelete = await prisma.battleRecord.groupBy({
    by: ["gameMode"],
    _count: { _all: true },
    where: { gameMode: { notIn: TRACKED_MODES } },
  });

  if (toDelete.length === 0) {
    console.log("No untracked battles found. Nothing to clean.\n");
    await prisma.$disconnect();
    return;
  }

  const totalToDelete = toDelete.reduce((s, r) => s + r._count._all, 0);
  console.log(`About to delete ${totalToDelete.toLocaleString()} BattleRecord rows:`);
  for (const row of toDelete.sort((a, b) => b._count._all - a._count._all)) {
    console.log(
      `  ${row.gameMode.padEnd(20)} ${row._count._all.toLocaleString()} battles`
    );
  }

  console.log("\nDeleting...");
  const result = await prisma.battleRecord.deleteMany({
    where: { gameMode: { notIn: TRACKED_MODES } },
  });
  console.log(`Deleted ${result.count.toLocaleString()} rows.\n`);

  // Also blow away MapBrawlerStat rows where the map belongs to a dropped mode
  // (future-proofing — mostly a no-op since our map-sync already filters)
  console.log("Checking for orphan MapBrawlerStat rows...");
  const orphanMaps = await prisma.map.findMany({
    where: { gameMode: { name: { notIn: [
      "Gem Grab", "Brawl Ball", "Bounty", "Heist", "Hot Zone",
      "Knockout", "Siege", "Wipeout", "Duels",
    ] } } },
    select: { id: true },
  });
  if (orphanMaps.length > 0) {
    const orphanIds = orphanMaps.map((m) => m.id);
    const statDelete = await prisma.mapBrawlerStat.deleteMany({
      where: { mapId: { in: orphanIds } },
    });
    const mapDelete = await prisma.map.deleteMany({
      where: { id: { in: orphanIds } },
    });
    console.log(
      `  Deleted ${statDelete.count} stat rows and ${mapDelete.count} map rows from untracked modes.\n`
    );
  } else {
    console.log("  None found.\n");
  }

  console.log("Done. Next:");
  console.log("  npx tsx scripts/aggregate.ts");
  console.log("  (then refresh /debug/stats)\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
