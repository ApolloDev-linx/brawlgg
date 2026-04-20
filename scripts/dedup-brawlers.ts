import { prisma } from "@/lib/prisma";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.]/g, "");
}

// Higher score = better canonical candidate.
// Rules, in priority order:
//   1. NOT all-uppercase (prefer "Colt" over "COLT")
//   2. Contains spaces/punctuation like the real name ("Mr. P" over "MR-P")
//   3. Has more MapBrawlerStat rows attached (more data invested in it)
function canonicalScore(b: {
  name: string;
  _count: { mapStats: number };
}): number {
  let score = 0;
  if (b.name !== b.name.toUpperCase()) score += 1000;
  if (/[\s.]/.test(b.name)) score += 100;
  score += b._count.mapStats;
  return score;
}

async function main() {
  console.log("Loading all brawlers...\n");
  const brawlers = await prisma.brawler.findMany({
    include: { _count: { select: { mapStats: true } } },
  });

  const groups: Record<string, typeof brawlers> = {};
  for (const b of brawlers) {
    const key = normalize(b.name);
    (groups[key] ??= []).push(b);
  }

  const dupeGroups = Object.entries(groups).filter(([, r]) => r.length > 1);
  console.log(`Total brawlers:      ${brawlers.length}`);
  console.log(`Unique (normalized): ${Object.keys(groups).length}`);
  console.log(`Duplicate groups:    ${dupeGroups.length}\n`);

  if (dupeGroups.length === 0) {
    console.log("Nothing to merge. Exiting.");
    return;
  }

  // Plan every merge up-front so we can log it, then execute
  const merges: { canonical: (typeof brawlers)[0]; dupeIds: string[] }[] = [];
  const allDupeIds: string[] = [];

  for (const [key, rows] of dupeGroups) {
    rows.sort((a, b) => canonicalScore(b) - canonicalScore(a));
    const canonical = rows[0];
    const dupes = rows.slice(1);
    merges.push({ canonical, dupeIds: dupes.map((d) => d.id) });
    allDupeIds.push(...dupes.map((d) => d.id));

    console.log(
      `[${key}] keep "${canonical.name}" (${canonical.id.slice(0, 8)}) | ` +
        `drop: ${dupes.map((d) => `"${d.name}" (${d.id.slice(0, 8)})`).join(", ")}`
    );
  }

  console.log(`\nWill delete ${allDupeIds.length} duplicate brawler rows.\n`);

  // Step 1: Repoint BattleRecord rows from dupe IDs → canonical IDs
  console.log("Step 1: Repointing BattleRecord rows...");
  let totalRepointed = 0;
  for (const { canonical, dupeIds } of merges) {
    if (dupeIds.length === 0) continue;
    const r = await prisma.battleRecord.updateMany({
      where: { brawlerId: { in: dupeIds } },
      data: { brawlerId: canonical.id, brawlerName: canonical.name },
    });
    totalRepointed += r.count;
  }
  console.log(`  ${totalRepointed} battle records repointed\n`);

  // Step 2: Nuke MapBrawlerStat entirely. Re-aggregator will rebuild it
  // from the (now-clean) BattleRecord table. Cleanest way to handle the
  // unique constraint on (mapId, brawlerId) — no merge math needed.
  console.log("Step 2: Deleting all MapBrawlerStat rows (aggregator rebuilds)...");
  const deletedStats = await prisma.mapBrawlerStat.deleteMany({});
  console.log(`  ${deletedStats.count} stat rows deleted\n`);

  // Step 3: Optional — also clear MetaSnapshot for dupe brawlers if the
  // table exists in your schema. Uncomment if needed.
  // await prisma.metaSnapshot.deleteMany({ where: { brawlerId: { in: allDupeIds } } });

  // Step 4: Delete the duplicate Brawler rows
  console.log("Step 3: Deleting duplicate Brawler rows...");
  const deletedBrawlers = await prisma.brawler.deleteMany({
    where: { id: { in: allDupeIds } },
  });
  console.log(`  ${deletedBrawlers.count} brawler rows deleted\n`);

  console.log("--- DONE ---");
  console.log(`Canonical brawlers remaining: ${brawlers.length - deletedBrawlers.count}`);
  console.log("\nNext steps:");
  console.log("  1. Re-run the aggregator to rebuild MapBrawlerStat from clean data");
  console.log("  2. Restart dev server");
  console.log("  3. Refresh the map page and verify brawler count is ~103 not 200");
}

main().finally(() => prisma.$disconnect());
