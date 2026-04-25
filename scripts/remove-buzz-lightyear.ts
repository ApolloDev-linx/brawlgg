/**
 * Remove Buzz Lightyear cleanly from the DB.
 *
 * Buzz Lightyear was a time-limited Toy Story crossover brawler
 * (Dec 12 2024 → Feb 4 2025). He's no longer playable, but his
 * battle records linger and pollute the meta — especially on any
 * map where he appeared during the crossover window.
 *
 * This script:
 *   1. Deletes all dependent rows (matchups, stats, battles, etc.)
 *      in foreign-key-safe order
 *   2. Deletes the Brawler row itself
 *   3. Adds him to an excluded-list in brawler-sync.ts (reminder)
 *
 * Safe to re-run — if he's already gone, exits cleanly.
 *
 * Usage:
 *   npx tsx scripts/remove-buzz-lightyear.ts            # dry run by default
 *   npx tsx scripts/remove-buzz-lightyear.ts --confirm  # actually delete
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const TARGET_NAME = "Buzz Lightyear";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function header(msg: string) {
  console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);
}
function ok(msg: string) {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}
function warn(msg: string) {
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}
function fail(msg: string) {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}
function dim(msg: string) {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

async function main() {
  console.log(`${c.bold}Remove Buzz Lightyear${c.reset}`);
  if (!CONFIRM) {
    dim("DRY RUN — no data will be deleted. Re-run with --confirm to actually delete.");
  } else {
    console.log(`${c.yellow}LIVE RUN — data will be permanently deleted.${c.reset}`);
  }

  // ────────────────────────────────────────────────────────────
  // Step 1: Find him
  // ────────────────────────────────────────────────────────────
  header("[1/5] Locating Brawler row");

  const buzz = await prisma.brawler.findUnique({
    where: { name: TARGET_NAME },
  });

  if (!buzz) {
    ok(`No Brawler row named "${TARGET_NAME}" — already gone.`);
    console.log(`\n${c.green}Nothing to do. Exiting.${c.reset}\n`);
    return;
  }

  ok(`Found: ${buzz.name} (id=${buzz.id.slice(0, 8)}..., role=${buzz.role}, type=${buzz.type})`);

  // ────────────────────────────────────────────────────────────
  // Step 2: Inventory all dependent rows
  // ────────────────────────────────────────────────────────────
  header("[2/5] Counting dependent rows");

  const [
    battleRecordCount,
    mapBrawlerStatCount,
    brawlerStatCount,
    counterAsCount,
    counteredByCount,
    metaSnapshotCount,
    playerBrawlerCount,
  ] = await Promise.all([
    prisma.battleRecord.count({ where: { brawlerId: buzz.id } }),
    prisma.mapBrawlerStat.count({ where: { brawlerId: buzz.id } }),
    prisma.brawlerStat.count({ where: { brawlerId: buzz.id } }),
    prisma.counterMatchup.count({ where: { brawlerId: buzz.id } }),
    prisma.counterMatchup.count({ where: { counterId: buzz.id } }),
    prisma.metaSnapshot.count({ where: { brawlerId: buzz.id } }),
    prisma.playerBrawler.count({ where: { brawlerId: buzz.id } }),
  ]);

  // BattleRecords may also be linked only by brawlerName (brawlerId nullable)
  const orphanBattleRecordCount = await prisma.battleRecord.count({
    where: { brawlerName: TARGET_NAME, brawlerId: null },
  });

  dim(`BattleRecord (by brawlerId):     ${battleRecordCount.toLocaleString()}`);
  dim(`BattleRecord (orphan by name):   ${orphanBattleRecordCount.toLocaleString()}`);
  dim(`MapBrawlerStat:                  ${mapBrawlerStatCount.toLocaleString()}`);
  dim(`BrawlerStat:                     ${brawlerStatCount.toLocaleString()}`);
  dim(`CounterMatchup (as attacker):    ${counterAsCount.toLocaleString()}`);
  dim(`CounterMatchup (as defender):    ${counteredByCount.toLocaleString()}`);
  dim(`MetaSnapshot:                    ${metaSnapshotCount.toLocaleString()}`);
  dim(`PlayerBrawler:                   ${playerBrawlerCount.toLocaleString()}`);

  const totalDependentRows =
    battleRecordCount +
    orphanBattleRecordCount +
    mapBrawlerStatCount +
    brawlerStatCount +
    counterAsCount +
    counteredByCount +
    metaSnapshotCount +
    playerBrawlerCount;

  console.log(
    `\n  ${c.bold}Total rows to delete: ${totalDependentRows.toLocaleString()}${c.reset} (plus 1 Brawler row)`
  );

  // ────────────────────────────────────────────────────────────
  // Step 3: Delete in FK-safe order (children first, parent last)
  // ────────────────────────────────────────────────────────────
  header("[3/5] Deleting dependent rows");

  if (!CONFIRM) {
    warn("Dry run — skipping actual deletions.");
    dim("Re-run with --confirm to execute.");
  } else {
    // Order matters: anything pointing at Brawler must go first.
    const deletedBattles = await prisma.battleRecord.deleteMany({
      where: {
        OR: [
          { brawlerId: buzz.id },
          { brawlerName: TARGET_NAME, brawlerId: null },
        ],
      },
    });
    ok(`Deleted ${deletedBattles.count.toLocaleString()} BattleRecord rows`);

    const deletedMapStats = await prisma.mapBrawlerStat.deleteMany({
      where: { brawlerId: buzz.id },
    });
    ok(`Deleted ${deletedMapStats.count.toLocaleString()} MapBrawlerStat rows`);

    // BrawlerStat has onDelete: Cascade on the Brawler relation, so it'll
    // go when we delete the Brawler row. But nuke it explicitly for clarity.
    const deletedBrawlerStat = await prisma.brawlerStat.deleteMany({
      where: { brawlerId: buzz.id },
    });
    ok(`Deleted ${deletedBrawlerStat.count.toLocaleString()} BrawlerStat rows`);

    const deletedCounters = await prisma.counterMatchup.deleteMany({
      where: {
        OR: [{ brawlerId: buzz.id }, { counterId: buzz.id }],
      },
    });
    ok(`Deleted ${deletedCounters.count.toLocaleString()} CounterMatchup rows`);

    const deletedSnapshots = await prisma.metaSnapshot.deleteMany({
      where: { brawlerId: buzz.id },
    });
    ok(`Deleted ${deletedSnapshots.count.toLocaleString()} MetaSnapshot rows`);

    const deletedPlayerBrawlers = await prisma.playerBrawler.deleteMany({
      where: { brawlerId: buzz.id },
    });
    ok(`Deleted ${deletedPlayerBrawlers.count.toLocaleString()} PlayerBrawler rows`);
  }

  // ────────────────────────────────────────────────────────────
  // Step 4: Delete the Brawler row itself
  // ────────────────────────────────────────────────────────────
  header("[4/5] Deleting Brawler row");

  if (!CONFIRM) {
    warn("Dry run — would delete Brawler row.");
  } else {
    await prisma.brawler.delete({ where: { id: buzz.id } });
    ok(`Brawler row "${TARGET_NAME}" deleted`);
  }

  // ────────────────────────────────────────────────────────────
  // Step 5: Verify + reminders
  // ────────────────────────────────────────────────────────────
  header("[5/5] Verification");

  if (CONFIRM) {
    const stillThere = await prisma.brawler.findUnique({
      where: { name: TARGET_NAME },
    });
    const stragglerBattles = await prisma.battleRecord.count({
      where: { brawlerName: TARGET_NAME },
    });
    const stragglerMatchups = await prisma.counterMatchup.count({
      where: {
        OR: [{ brawlerId: buzz.id }, { counterId: buzz.id }],
      },
    });

    if (stillThere) {
      fail(`Brawler row still exists — something went wrong.`);
    } else {
      ok(`Brawler row confirmed gone`);
    }
    if (stragglerBattles > 0) {
      fail(`${stragglerBattles} BattleRecord rows with brawlerName="${TARGET_NAME}" remain`);
    } else {
      ok(`No BattleRecord stragglers`);
    }
    if (stragglerMatchups > 0) {
      fail(`${stragglerMatchups} CounterMatchup stragglers`);
    } else {
      ok(`No CounterMatchup stragglers`);
    }

    // Total brawler count sanity check
    const totalBrawlers = await prisma.brawler.count();
    dim(`\nTotal brawlers remaining: ${totalBrawlers}`);
    const expectedMatchups = totalBrawlers * (totalBrawlers - 1);
    const actualMatchups = await prisma.counterMatchup.count();
    if (actualMatchups === expectedMatchups) {
      ok(`CounterMatchup table: ${actualMatchups}/${expectedMatchups} (complete)`);
    } else {
      warn(`CounterMatchup table: ${actualMatchups}/${expectedMatchups} (${expectedMatchups - actualMatchups} gap)`);
    }
  }

  // Reminders
  console.log(`\n${c.bold}Follow-up steps:${c.reset}`);
  console.log(
    `  ${c.dim}1.${c.reset} Add "Buzz Lightyear" to an excluded-brawlers set in ${c.cyan}src/services/brawler-sync.ts${c.reset}`
  );
  console.log(`     so the next Brawlify sync doesn't re-create him:`);
  console.log(`     ${c.dim}const EXCLUDED_BRAWLERS = new Set(["Buzz Lightyear"]);${c.reset}`);
  console.log(
    `  ${c.dim}2.${c.reset} Re-run aggregation so per-map stats don't show stale Buzz data:`
  );
  console.log(`     ${c.dim}npx tsx scripts/aggregate.ts${c.reset}`);
  console.log(`  ${c.dim}3.${c.reset} Consider the same cleanup for any future time-limited crossovers.`);

  if (!CONFIRM) {
    console.log(
      `\n${c.yellow}DRY RUN COMPLETE.${c.reset} Re-run with ${c.bold}--confirm${c.reset} to delete.\n`
    );
  } else {
    console.log(`\n${c.green}${c.bold}=== Cleanup complete ===${c.reset}\n`);
  }
}

main()
  .catch((e) => {
    console.error(`\n${c.red}Cleanup failed:${c.reset}`, e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
