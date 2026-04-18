/**
 * Run stat aggregation locally against the prod DB.
 * Bypasses Vercel's 60-second serverless timeout.
 *
 * Uses the same aggregateStats() the /api/cron/aggregate route uses,
 * so the result is identical to what hitting the URL would produce
 * if Vercel had infinite timeout.
 *
 * Usage:
 *   npx tsx scripts/aggregate.ts
 */

import { aggregateStats } from "../src/services/stat-aggregator";

async function main() {
  console.log(`\n=== Stat Aggregation ===`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const start = Date.now();

  try {
    const result = await aggregateStats();
    const elapsed = Date.now() - start;

    console.log(`\n=== Done in ${(elapsed / 1000).toFixed(1)}s ===`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    const elapsed = Date.now() - start;
    console.error(`\n=== Failed after ${(elapsed / 1000).toFixed(1)}s ===`);
    console.error(error);
    process.exit(1);
  }
}

main();
