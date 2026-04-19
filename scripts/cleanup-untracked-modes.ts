import { PrismaClient } from "@prisma/client";

const TRACKED_MODES = [
  "gemGrab", "brawlBall", "bounty", "heist", "hotZone",
  "knockout", "siege", "wipeout", "duels",
];

async function main() {
  const prisma = new PrismaClient();
  console.log("\n=== Untracked Mode Cleanup ===\n");

  const toDelete = await prisma.battleRecord.groupBy({
    by: ["gameMode"],
    _count: { _all: true },
    where: { gameMode: { notIn: TRACKED_MODES } },
  });

  if (toDelete.length === 0) {
    console.log("No untracked battles found.\n");
    await prisma.$disconnect();
    return;
  }

  const total = toDelete.reduce((s, r) => s + r._count._all, 0);
  console.log(`About to delete ${total.toLocaleString()} rows:`);
  for (const row of toDelete.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.gameMode.padEnd(20)} ${row._count._all.toLocaleString()}`);
  }

  console.log("\nDeleting...");
  const result = await prisma.battleRecord.deleteMany({
    where: { gameMode: { notIn: TRACKED_MODES } },
  });
  console.log(`Deleted ${result.count.toLocaleString()} rows.\n`);

  const TRACKED_DISPLAY = [
    "Gem Grab", "Brawl Ball", "Bounty", "Heist", "Hot Zone",
    "Knockout", "Siege", "Wipeout", "Duels",
  ];
  const orphanMaps = await prisma.map.findMany({
    where: { gameMode: { name: { notIn: TRACKED_DISPLAY } } },
    select: { id: true },
  });
  if (orphanMaps.length > 0) {
    const ids = orphanMaps.map((m) => m.id);
    const stats = await prisma.mapBrawlerStat.deleteMany({ where: { mapId: { in: ids } } });
    const maps = await prisma.map.deleteMany({ where: { id: { in: ids } } });
    console.log(`Also cleaned ${stats.count} stat rows and ${maps.count} orphan maps.\n`);
  }

  console.log("Done. Next: npx tsx scripts/aggregate.ts\n");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
