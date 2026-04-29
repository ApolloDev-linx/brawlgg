/**
 * One-shot: collapse duplicate Map rows that differ only by punctuation
 * or casing — "Belle's Rock" vs "Belles Rock", "Grab The Moment" vs
 * "Grab the Moment", "ATLAS" vs "Atlas", etc.
 *
 * Canonical name convention: Title Case With Every Word Capitalized,
 * punctuation preserved (apostrophes, periods, parentheses) as Brawlify
 * returns it. Most dupes are legacy from earlier ingestion paths plus
 * occasional drift between the Brawl Stars API and Brawlify.
 *
 * Pick priority (highest wins):
 *   1. Case style — proper Title Case > sentence case > ALL-CAPS / all-lowercase.
 *      This is the display convention; keeping it is more important than
 *      keeping the row with more battles attributed, because the aggregator
 *      does case-insensitive lookup so battles route correctly either way.
 *   2. Has imageUrl. Don't drop portraits if we can help it.
 *   3. Is active.
 *   4. Has more battles attributed (FK chain stability tiebreaker).
 *   5. Lexicographic id (final deterministic tiebreaker — Map has no
 *      createdAt timestamp).
 *
 * On --confirm:
 *   - Port imageUrl from loser to canonical if canonical is missing one
 *   - Delete loser's MapBrawlerStat rows (aggregate rebuilds from
 *     BattleRecord, so no data is actually lost — the BattleRecord rows
 *     still exist and will route to canonical via case-insensitive match)
 *   - Delete the loser Map row
 *   - Operator must run `npx tsx scripts/aggregate.ts` after to rebuild
 *
 * Safe to re-run. Dry run by default.
 *
 * Usage:
 *   npx tsx scripts/dedup-maps.ts            # dry run, eyeball output
 *   npx tsx scripts/dedup-maps.ts --confirm  # actually delete
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

// Higher = more preferred display style.
//   3 = proper title case ("Out In The Open", "Belle's Rock")
//   2 = sentence case ("Out in the Open")
//   1 = ALL CAPS ("WALKING ON HOT SAND") or all lowercase ("h for")
//
// Title case is defined as: every word's first alphabetic character is
// uppercase. ALL CAPS technically passes that test but is downgraded
// because it doesn't match the display convention.
function caseScore(name: string): number {
  const hasLower = /[a-z]/.test(name);
  const hasUpper = /[A-Z]/.test(name);
  if (hasUpper && !hasLower) return 1; // ALL CAPS
  if (hasLower && !hasUpper) return 1; // all lowercase

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  const allWordsCapped = words.every((w) => {
    const firstAlpha = w.match(/[a-zA-Z]/);
    if (!firstAlpha) return true;
    return firstAlpha[0] === firstAlpha[0].toUpperCase();
  });

  return allWordsCapped ? 3 : 2;
}

function caseLabel(score: number): string {
  if (score === 3) return "title";
  if (score === 2) return "sentence";
  return "shouty";
}

async function main() {
  console.log(`\n=== Map dedup ${CONFIRM ? "(LIVE)" : "(dry run)"} ===\n`);

  const maps = await prisma.map.findMany({
    select: {
      id: true,
      name: true,
      gameModeId: true,
      active: true,
      imageUrl: true,
    },
  });

  const statsByMap = await prisma.mapBrawlerStat.groupBy({
    by: ["mapId"],
    _sum: { sampleSize: true },
  });
  const battlesByMap = new Map<string, number>();
  for (const s of statsByMap) {
    battlesByMap.set(s.mapId, s._sum.sampleSize ?? 0);
  }

  const buckets = new Map<string, typeof maps>();
  for (const m of maps) {
    const key = `${m.gameModeId}::${normalizeKey(m.name)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m);
  }

  const dupeGroups = Array.from(buckets.values()).filter((g) => g.length > 1);

  if (dupeGroups.length === 0) {
    console.log("No duplicate map groups found. Nothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${dupeGroups.length} duplicate groups:\n`);

  let totalDeletes = 0;
  let totalPortedImages = 0;

  for (const group of dupeGroups) {
    const sorted = [...group].sort((a, b) => {
      // Case style first — title case is the display convention.
      const ca = caseScore(a.name);
      const cb = caseScore(b.name);
      if (ca !== cb) return cb - ca;

      // Battles SECOND, before imageUrl. When case is tied, battle count
      // is direct evidence of which spelling BattleRecord uses — and the
      // aggregator's name lookup is case-insensitive but NOT punctuation-
      // insensitive. If we picked the version without battles ("Belles
      // Rock") over the version with 26k battles ("Belle's Rock"), the
      // next aggregate run drops every Belle's Rock battle on the floor.
      // imageUrl can be ported from the loser; battle attribution can't.
      const ba = battlesByMap.get(a.id) ?? 0;
      const bb = battlesByMap.get(b.id) ?? 0;
      if (ba !== bb) return bb - ba;

      const ia = a.imageUrl ? 1 : 0;
      const ib = b.imageUrl ? 1 : 0;
      if (ia !== ib) return ib - ia;

      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.id.localeCompare(b.id);
    });    const canonical = sorted[0];
    const losers = sorted.slice(1);

    const fmt = (m: typeof maps[number]) => {
      const battles = battlesByMap.get(m.id) ?? 0;
      const flags = [
        `${battles}b`,
        m.imageUrl ? "img" : "no-img",
        caseLabel(caseScore(m.name)),
        m.active ? "active" : "inactive",
      ].join(",");
      return `"${m.name}" [${flags}]`;
    };

    // Show the porting hint inline so it's obvious why we keep the
    // canonical even when a loser has the imageUrl.
    const willPort =
      !canonical.imageUrl && losers.some((l) => l.imageUrl);
    const portNote = willPort ? " (will port imageUrl from loser)" : "";

    console.log(`  ${group.map(fmt).join(" / ")}`);
    console.log(`    → keep "${canonical.name}"${portNote}\n`);

    if (!CONFIRM) {
      totalDeletes += losers.length;
      if (willPort) totalPortedImages++;
      continue;
    }

    // Port imageUrl from any loser if canonical lacks one
    if (!canonical.imageUrl) {
      const donor = losers.find((l) => l.imageUrl);
      if (donor) {
        await prisma.map.update({
          where: { id: canonical.id },
          data: { imageUrl: donor.imageUrl },
        });
        totalPortedImages++;
      }
    }

    // Drop loser's stats + the loser itself.
    // Aggregate will recompute MapBrawlerStat from BattleRecord — the
    // BattleRecord rows survive untouched and route to canonical via
    // the aggregator's case-insensitive name lookup.
    for (const loser of losers) {
      await prisma.mapBrawlerStat.deleteMany({ where: { mapId: loser.id } });
      await prisma.map.delete({ where: { id: loser.id } });
      totalDeletes++;
    }
  }

  console.log(
    `\n${CONFIRM ? "Deleted" : "Would delete"} ${totalDeletes} duplicate map rows.`
  );
  console.log(
    `${CONFIRM ? "Ported" : "Would port"} ${totalPortedImages} imageUrls.`
  );
  console.log(
    `\nNext: re-aggregate so MapBrawlerStat rebuilds against the canonicals:\n  npx tsx scripts/aggregate.ts\n`
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Dedup failed:", e);
  process.exit(1);
});
