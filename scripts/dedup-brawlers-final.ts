/**
 * Final dedup pass — catches brawlers my first script missed because
 * its normalize function didn't strip `&` (and other special chars).
 *
 * Specifically targets things like "Larry & Lawrie" vs "LARRY-LAWRIE".
 *
 * Unlike the first script, this does NOT nuke MapBrawlerStat — it only
 * deletes the dupe's stat rows. Canonical's existing stats are kept and
 * will pick up the repointed battles on the next aggregate cycle.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Strip EVERYTHING non-alphanumeric. Catches:
//   "Larry & Lawrie" / "LARRY-LAWRIE" -> "larrylawrie"
//   "Mr. P" / "MR-P"                  -> "mrp"
//   "El Primo" / "EL-PRIMO"           -> "elprimo"
// Already-deduped pairs are no-ops since their canonical names also
// normalize to the same thing.
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalScore(b: { name: string; _count: { mapStats: number } }): number {
  let score = 0;
  if (b.name !== b.name.toUpperCase()) score += 1000;       // prefer non-allcaps
  if (/[\s.&]/.test(b.name)) score += 100;                  // prefer real punctuation
  score += b._count.mapStats;                               // tiebreaker: more data
  return score;
}

async function main() {
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
    console.log("Nothing to merge. DB is clean.");
    return;
  }

  let totalRepointed = 0;
  let totalStatsDeleted = 0;
  let totalBrawlersDeleted = 0;

  for (const [key, rows] of dupeGroups) {
    rows.sort((a, b) => canonicalScore(b) - canonicalScore(a));
    const canonical = rows[0];
    const dupes = rows.slice(1);
    const dupeIds = dupes.map((d) => d.id);

    console.log(
      `[${key}] keep "${canonical.name}" (${canonical.id.slice(0, 8)}) | ` +
        `drop: ${dupes.map((d) => `"${d.name}" (${d.id.slice(0, 8)})`).join(", ")}`
    );

    // Repoint battles: brawlerId AND brawlerName, so aggregator groups them
    // together with canonical's battles on the next run.
    try {
      const r = await prisma.battleRecord.updateMany({
        where: { brawlerId: { in: dupeIds } },
        data: { brawlerId: canonical.id, brawlerName: canonical.name },
      });
      totalRepointed += r.count;
      console.log(`  → repointed ${r.count} battle records`);
    } catch (e: any) {
      console.error(`  ⚠ battleRecord repoint failed: ${e.message}`);
    }

    // Delete dupe's stat rows (canonical's are kept; rebuild on next aggregate)
    const statsResult = await prisma.mapBrawlerStat.deleteMany({
      where: { brawlerId: { in: dupeIds } },
    });
    totalStatsDeleted += statsResult.count;
    console.log(`  → deleted ${statsResult.count} stat rows`);

    // Delete the dupe Brawler row(s)
    const brawlerResult = await prisma.brawler.deleteMany({
      where: { id: { in: dupeIds } },
    });
    totalBrawlersDeleted += brawlerResult.count;
  }

  console.log(`\n--- DONE ---`);
  console.log(`Battles repointed:  ${totalRepointed}`);
  console.log(`Stats deleted:      ${totalStatsDeleted}`);
  console.log(`Brawlers deleted:   ${totalBrawlersDeleted}`);
  console.log(`Brawlers remaining: ${brawlers.length - totalBrawlersDeleted}`);
  console.log(
    `\nCanonical brawlers' stats won't include newly-repointed battles until ` +
      `you re-aggregate. For only ~1-3 brawlers the drift is tiny — re-aggregate ` +
      `only if you want exact numbers for them.`
  );
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
