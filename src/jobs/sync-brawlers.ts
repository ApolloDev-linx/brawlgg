import { PrismaClient } from "@prisma/client";
import {
  syncBrawlerData,
  syncCounterMatchups,
  syncMapBrawlerStats,
} from "../services/brawler-sync";

const prisma = new PrismaClient();

export async function runSync() {
  const allErrors: string[] = [];

  console.log("[sync] Step 1: Syncing brawler data...");
  const brawlerResult = await syncBrawlerData(prisma);
  if (brawlerResult.errors.length > 0) {
    allErrors.push(...brawlerResult.errors);
  }
  console.log(
    `[sync]   Source: ${brawlerResult.source}, ` +
    `Total: ${brawlerResult.total}, ` +
    `Created: ${brawlerResult.created}, ` +
    `Updated: ${brawlerResult.updated}`
  );

  let matchupCount = 0;
  let statsCount = 0;

  if (brawlerResult.created > 0) {
    console.log("[sync] Step 2: Rebuilding counter matchups (new brawlers detected)...");
    const matchupResult = await syncCounterMatchups(prisma);
    matchupCount = matchupResult.total;
    if (matchupResult.errors.length > 0) {
      allErrors.push(...matchupResult.errors.slice(0, 10));
    }
    console.log(`[sync]   Generated ${matchupCount} matchup records`);

    console.log("[sync] Step 3: Generating map stats for new brawlers...");
    statsCount = await syncMapBrawlerStats(prisma);
    console.log(`[sync]   Generated ${statsCount} stat records`);
  } else {
    console.log("[sync] Step 2: Skipping matchups (no new brawlers)");
    console.log("[sync] Step 3: Skipping stats (no new brawlers)");
  }

  return {
    brawlers: {
      source: brawlerResult.source,
      total: brawlerResult.total,
      created: brawlerResult.created,
      updated: brawlerResult.updated,
    },
    matchups: matchupCount,
    stats: statsCount,
    errors: allErrors,
  };
}

async function main() {
  console.log("=== Brawler Sync Job ===\n");
  const start = Date.now();
  try {
    const result = await runSync();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n=== Sync complete in ${elapsed}s ===`);
    console.log(`  Brawlers: ${result.brawlers.total} (${result.brawlers.source})`);
    console.log(`  New: ${result.brawlers.created}, Updated: ${result.brawlers.updated}`);
    console.log(`  Matchups: ${result.matchups}`);
    console.log(`  Stats: ${result.stats}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
  } catch (err) {
    console.error("Sync job failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
