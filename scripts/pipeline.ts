/**
 * scripts/pipeline.ts
 *
 * The full data pipeline in one place. Runs each step in order and
 * tells you what's happening. Safe to re-run anytime — every step is
 * idempotent (won't double-write, won't clobber real data).
 *
 * THE FLOW:
 *   1. Sync brawlers from Brawlify  → Brawler table
 *      Catches new releases, updates roles/types/icons. Uses the
 *      canonical toBrawlerName() so casing stays clean.
 *
 *   2. Sync maps from Brawlify      → Map table
 *      Catches map rotation changes. Filters out 5v5 / novelty mode maps.
 *
 *   3. Harvest battle data          → BattleRecord table
 *      Pulls top 200 players from 5 leaderboards, fetches their battle
 *      logs, then chain-harvests one level deep. SLOWEST step (5-15 min).
 *
 *   4. Aggregate stats              → MapBrawlerStat table
 *      Reads BattleRecord, groups by map×brawler, computes wins/total →
 *      win rate, pick rate, sample size, isReal flag. The Wilson sort
 *      in the UI ranks brawlers using THIS table's data.
 *
 * Usage:
 *   npx tsx scripts/pipeline.ts                  Full pipeline (10-20 min)
 *   npx tsx scripts/pipeline.ts --aggregate-only Just rebuild stats (2-7 min)
 *   npx tsx scripts/pipeline.ts --skip-harvest   Sync + aggregate, no new battles
 *   npx tsx scripts/pipeline.ts --skip-sync      Skip sync, harvest + aggregate
 *
 * After running: restart `npm run dev` to flush the in-memory cache.
 */
import { spawn } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const AGGREGATE_ONLY = args.has("--aggregate-only");
const SKIP_HARVEST = args.has("--skip-harvest") || AGGREGATE_ONLY;
const SKIP_SYNC = args.has("--skip-sync") || AGGREGATE_ONLY;

interface StepResult {
  name: string;
  ok: boolean;
  seconds: number;
  details?: any;
}

const results: StepResult[] = [];

function header(text: string) {
  const bar = "─".repeat(64);
  console.log(`\n${bar}\n  ${text}\n${bar}`);
}

async function runStep(name: string, fn: () => Promise<any>) {
  header(name);
  const start = Date.now();
  try {
    const details = await fn();
    const seconds = (Date.now() - start) / 1000;
    results.push({ name, ok: true, seconds, details });
    console.log(`✓ ${name} done in ${seconds.toFixed(1)}s`);
  } catch (e: any) {
    const seconds = (Date.now() - start) / 1000;
    results.push({ name, ok: false, seconds, details: e.message });
    console.error(`✗ ${name} failed in ${seconds.toFixed(1)}s — ${e.message}`);
  }
}

// Spawn a TS script as a subprocess so we get streaming output.
// Used for harvest because that file has a top-level main() that we
// don't want to trigger via import.
function runSubprocess(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", scriptPath], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

async function main() {
  const overallStart = Date.now();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Apollo Meta — Data Pipeline                                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  if (SKIP_SYNC) console.log("  ⏭  Skipping sync steps");
  if (SKIP_HARVEST) console.log("  ⏭  Skipping harvest");

  // 1. Brawler sync
  if (!SKIP_SYNC) {
    await runStep("Step 1/4: Sync brawlers", async () => {
      const { runSync } = await import("../src/jobs/sync-brawlers");
      const result = await runSync();
      console.log(
        `  ${result.brawlers.total} total | ` +
        `${result.brawlers.created} new | ` +
        `${result.brawlers.updated} updated | ` +
        `source: ${result.brawlers.source}`
      );
      if (result.errors.length > 0) {
        console.warn(`  ⚠ ${result.errors.length} errors:`);
        result.errors.slice(0, 5).forEach((e: string) => console.warn(`    - ${e}`));
      }
      return result;
    });
  }

  // 2. Map sync
  if (!SKIP_SYNC) {
    await runStep("Step 2/4: Sync maps", async () => {
      const { syncMaps } = await import("../src/services/map-sync");
      const result = await syncMaps(prisma);
      console.log(
        `  fetched ${result.fetched} | ` +
        `tracked ${result.filteredIn} | ` +
        `created ${result.created} | ` +
        `updated ${result.updated}`
      );
      if (result.unmatchedModes.length > 0) {
        console.log(`  unmatched modes (filtered out): ${result.unmatchedModes.join(", ")}`);
      }
      return result;
    });
  }

  // 3. Harvest
  if (!SKIP_HARVEST) {
    await runStep("Step 3/4: Harvest battle data", async () => {
      console.log("  This takes 5-15 minutes depending on API rate limits.");
      console.log("  Output streams below:\n");
      await runSubprocess("scripts/harvest.ts");
    });
  }

  // 4. Aggregate (always runs — cheap and necessary if anything upstream changed)
  await runStep("Step 4/4: Aggregate stats", async () => {
    const { aggregateStats } = await import("../src/services/stat-aggregator");
    const result = await aggregateStats();
    console.log(`  maps processed:        ${result.mapsProcessed}`);
    console.log(`  brawler-map pairs:     ${result.brawlersUpdated}`);
    console.log(`  high-confidence (≥50): ${result.realStatsCount}`);
    console.log(`  battles counted:       ${result.battlesCounted.toLocaleString()}`);
    console.log(`  excluded by mode:      ${result.battlesExcludedByMode}`);
    console.log(`  excluded by map:       ${result.battlesExcludedByMap.toLocaleString()}`);
    if (result.excludedModesBreakdown?.length) {
      console.log(`  top excluded modes:    ${result.excludedModesBreakdown.map((m: any) => `${m.mode}(${m.count})`).join(", ")}`);
    }
    return result;
  });

  // Summary
  const totalSec = ((Date.now() - overallStart) / 1000).toFixed(1);
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Pipeline Summary                                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`  ${icon}  ${r.name.padEnd(40)} ${r.seconds.toFixed(1)}s`);
  }
  console.log(`\n  Total: ${totalSec}s\n`);

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`⚠ ${failures.length} step(s) failed. Check logs above.`);
    process.exit(1);
  }

  console.log("Next steps:");
  console.log("  • Restart dev server to flush cache:  npm run dev");
  console.log("  • Sanity-check at:                    /debug/stats");
  console.log("  • Eyeball a map page:                 /maps/center-stage\n");
}

main()
  .catch((e) => {
    console.error("\n💥 Pipeline crashed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
