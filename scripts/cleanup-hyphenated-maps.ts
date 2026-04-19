import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  console.log("\n=== Hyphenated Map Cleanup ===\n");

  const badMaps = await prisma.map.findMany({
    where: { name: { contains: "-" } },
    select: { id: true, name: true },
  });

  if (badMaps.length === 0) {
    console.log("No hyphenated maps found. Nothing to clean.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${badMaps.length} hyphenated map rows.`);
  console.log("Preview (first 10):");
  for (const m of badMaps.slice(0, 10)) {
    console.log(`  - ${m.name}`);
  }
  if (badMaps.length > 10) {
    console.log(`  ... and ${badMaps.length - 10} more`);
  }

  const badIds = badMaps.map((m) => m.id);

  console.log("\nDeleting MapBrawlerStat rows attached to these maps...");
  const deletedStats = await prisma.mapBrawlerStat.deleteMany({
    where: { mapId: { in: badIds } },
  });
  console.log(`  Deleted ${deletedStats.count} stat rows.`);

  console.log("\nDeleting the hyphenated Map rows...");
  const deletedMaps = await prisma.map.deleteMany({
    where: { id: { in: badIds } },
  });
  console.log(`  Deleted ${deletedMaps.count} map rows.\n`);

  console.log("Done. Next:");
  console.log("  npx tsx scripts/sync-maps.ts");
  console.log("  npx tsx scripts/aggregate.ts\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
