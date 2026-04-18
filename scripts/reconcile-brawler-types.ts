/**
 * Reconcile brawler types + regenerate counter matchups.
 *
 * Step 1: Rewrites every brawler's role/type from BRAWLER_TYPE_OVERRIDES.
 * Step 2: Regenerates counter matchup advantageScore + reason for every
 *         existing matchup row, using the (now-correct) types.
 *
 * Scoring is DETERMINISTIC (hash-based pseudo-random per brawler pair),
 * so running this twice gives identical results — no score shuffling.
 *
 * Does NOT touch: HP, iconUrl, externalId, map stats, or any other data.
 *
 * Usage:
 *   npx tsx scripts/reconcile-brawler-types.ts              # full fix
 *   npx tsx scripts/reconcile-brawler-types.ts --dry-run    # preview only
 *   npx tsx scripts/reconcile-brawler-types.ts --skip-matchups  # just types
 */

import { PrismaClient } from "@prisma/client";
import { BRAWLER_TYPE_OVERRIDES, COUNTER_MATRIX } from "../src/lib/constants";
import type { BrawlerType } from "../src/types/brawler";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_MATCHUPS = process.argv.includes("--skip-matchups");

/**
 * Deterministic pseudo-random in [0, 1) based on a string.
 * Same input -> same output, so re-runs don't reshuffle matchup scores.
 */
function stableRand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function computeMatchupScore(
  attackerName: string,
  attackerType: BrawlerType,
  defenderName: string,
  defenderType: BrawlerType
): { score: number; reason: string } {
  const info = COUNTER_MATRIX[attackerType];
  const rand = stableRand(`${attackerName}|${defenderName}`);

  if (!info) {
    return {
      score: Math.round((-0.5 + rand) * 10) / 10,
      reason: "Neutral matchup, depends on skill and positioning",
    };
  }

  if (info.strongVs.includes(defenderType)) {
    return {
      score: Math.round((1.5 + rand) * 10) / 10,
      reason: `${attackerName} (${attackerType}) counters ${defenderName} (${defenderType})`,
    };
  }
  if (info.weakVs.includes(defenderType)) {
    return {
      score: Math.round(-(1.5 + rand) * 10) / 10,
      reason: `${attackerName} (${attackerType}) is weak against ${defenderName} (${defenderType})`,
    };
  }
  return {
    score: Math.round((-0.5 + rand) * 10) / 10,
    reason: "Neutral matchup, depends on skill and positioning",
  };
}

async function reconcileBrawlers() {
  console.log(`\n[1/2] Reconciling brawler roles and types...`);

  const dbBrawlers = await prisma.brawler.findMany({ orderBy: { name: "asc" } });

  const changes: { name: string; old: string; new: string }[] = [];
  const unchanged: string[] = [];
  const notInOverrides: string[] = [];
  const dbNameSet = new Set(dbBrawlers.map((b) => b.name));
  const notInDb = Object.keys(BRAWLER_TYPE_OVERRIDES).filter(
    (n) => !dbNameSet.has(n)
  );

  for (const brawler of dbBrawlers) {
    const override = BRAWLER_TYPE_OVERRIDES[brawler.name];
    if (!override) {
      notInOverrides.push(brawler.name);
      continue;
    }
    if (brawler.role === override.role && brawler.type === override.type) {
      unchanged.push(brawler.name);
      continue;
    }
    changes.push({
      name: brawler.name,
      old: `${brawler.role} / ${brawler.type}`,
      new: `${override.role} / ${override.type}`,
    });
    if (!DRY_RUN) {
      await prisma.brawler.update({
        where: { id: brawler.id },
        data: { role: override.role, type: override.type },
      });
    }
  }

  console.log(`  Scanned:   ${dbBrawlers.length}`);
  console.log(`  Unchanged: ${unchanged.length}`);
  console.log(`  Updated:   ${changes.length}`);
  console.log(`  In DB but no override: ${notInOverrides.length}`);
  console.log(`  In override but not in DB: ${notInDb.length}`);

  if (changes.length > 0) {
    console.log(`\n  --- Type/role changes ${DRY_RUN ? "(would apply)" : "(applied)"} ---`);
    changes.forEach((c) =>
      console.log(`    ${c.name.padEnd(18)} ${c.old.padEnd(22)} -> ${c.new}`)
    );
  }
  if (notInOverrides.length > 0) {
    console.log(`\n  --- In DB but missing from BRAWLER_TYPE_OVERRIDES ---`);
    notInOverrides.forEach((n) => console.log(`    ${n}`));
    console.log(`    (Add these to constants.ts and re-run.)`);
  }
  if (notInDb.length > 0) {
    console.log(`\n  --- Pre-listed but not yet in DB ---`);
    notInDb.forEach((n) => console.log(`    ${n}`));
  }
}

async function reconcileMatchups() {
  console.log(`\n[2/2] Regenerating counter matchups...`);

  const brawlers = await prisma.brawler.findMany();
  const byId = new Map(brawlers.map((b) => [b.id, b]));

  const matchups = await prisma.counterMatchup.findMany();
  console.log(`  Existing matchup rows: ${matchups.length}`);

  if (matchups.length === 0) {
    console.log(`  No matchups in DB. Skipping.`);
    console.log(`  (If your harvest doesn't generate matchups, run your seed script.)`);
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const m of matchups) {
    const attacker = byId.get(m.brawlerId);
    const defender = byId.get(m.counterId);
    if (!attacker || !defender) {
      skipped++;
      continue;
    }

    const { score, reason } = computeMatchupScore(
      attacker.name,
      attacker.type as BrawlerType,
      defender.name,
      defender.type as BrawlerType
    );

    if (m.advantageScore === score && m.reason === reason) {
      unchanged++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.counterMatchup.update({
        where: { brawlerId_counterId: { brawlerId: m.brawlerId, counterId: m.counterId } },
        data: { advantageScore: score, reason },
      });
    }
    updated++;
  }

  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Updated:   ${updated}`);
  if (skipped > 0) console.log(`  Skipped (orphan refs): ${skipped}`);
}

async function main() {
  console.log(
    `\n=== Brawler Reconcile ${DRY_RUN ? "(DRY RUN)" : ""}${SKIP_MATCHUPS ? " [SKIP MATCHUPS]" : ""} ===`
  );

  await reconcileBrawlers();

  if (SKIP_MATCHUPS) {
    console.log(`\n[2/2] Skipped (--skip-matchups).`);
  } else {
    await reconcileMatchups();
  }

  console.log(`\n=== Done ===\n`);
}

main()
  .catch((e) => {
    console.error("Reconcile failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
