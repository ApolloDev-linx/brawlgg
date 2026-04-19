/**
 * Sync the Map table against the Brawlify API.
 *
 * Fetches the current map list, filters to the 3v3 competitive modes
 * we track, and upserts into the database.
 *
 * Usage:
 *   npx tsx scripts/sync-maps.ts
 *
 * Run this whenever you see "partial-gap" warnings on /debug/stats, or
 * wire it into the cron that runs before aggregate.
 */

import { PrismaClient } from "@prisma/client";
import { syncMaps } from "../src/services/map-sync";

async function main() {
  console.log("\n=== Map Sync ===");
  console.log(`Started: ${new Date().toISOString()}\n`);

  const prisma = new PrismaClient();
  const start = Date.now();

  try {
    const result = await syncMaps(prisma);
    const elapsed = Date.now() - start;

    console.log(`Fetched from Brawlify:  ${result.fetched}`);
    console.log(`Filtered to tracked:    ${result.filteredIn}`);
    console.log(`Created:                ${result.created}`);
    console.log(`Updated:                ${result.updated}`);
    console.log(`Skipped:                ${result.skipped}`);

    if (result.unmatchedModes.length > 0) {
      console.log(
        `\nUntracked modes seen (filtered out): ${result.unmatchedModes.join(", ")}`
      );
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors) console.log(`  - ${err}`);
    }

    console.log(`\nDone in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(
      "\nNext: re-run aggregation so the new maps are populated:\n  npx tsx scripts/aggregate.ts"
    );
  } catch (e: any) {
    console.error(`\nMap sync failed: ${e.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
