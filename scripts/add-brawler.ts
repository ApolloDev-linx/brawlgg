/**
 * Interactive new-brawler wizard.
 *
 * Walks through every step of adding a new brawler to Apollo Meta:
 *   1. Verify brawler exists in DB (sync from Brawlify if not)
 *   2. Verify BRAWLER_TYPE_OVERRIDES has an entry
 *   3. Reconcile role/type from override
 *   4. Sync counter matchups (fills any missing pairs)
 *   5. Check battle count and optionally aggregate
 *   6. Final verification report
 *
 * Idempotent — safe to re-run for any brawler, new or existing.
 *
 * Usage:
 *   npx tsx scripts/add-brawler.ts
 *   npx tsx scripts/add-brawler.ts Damian         # skip the name prompt
 *   npx tsx scripts/add-brawler.ts --no-aggregate # skip the aggregation step
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "readline";
import {
  BRAWLER_TYPE_OVERRIDES,
  COUNTER_MATRIX,
} from "../src/lib/constants";
import { toBrawlerName } from "../src/lib/brawler-name";
import type { BrawlerType } from "../src/types/brawler";

const prisma = new PrismaClient();
const SKIP_AGGREGATE = process.argv.includes("--no-aggregate");

// ──────────────────────────────────────────────────────────────────────────
// Terminal helpers
// ──────────────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) =>
    rl.question(`${c.cyan}?${c.reset} ${prompt} `, (answer) =>
      resolve(answer.trim())
    )
  );
}

async function askYN(prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  const a = (await ask(`${prompt} ${c.dim}${hint}${c.reset}`)).toLowerCase();
  if (a === "") return defaultYes;
  return a === "y" || a === "yes";
}

function header(step: string, title: string) {
  console.log(`\n${c.bold}${c.blue}[${step}]${c.reset} ${c.bold}${title}${c.reset}`);
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
function info(msg: string) {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Deterministic matchup scoring (same as reconcile-brawler-types.ts)
// ──────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────
// Steps
// ──────────────────────────────────────────────────────────────────────────

async function resolveBrawlerName(argv: string[]): Promise<string> {
  const fromArgs = argv.slice(2).find((a) => !a.startsWith("--"));
  const raw = fromArgs || (await ask("Brawler name (e.g. Damian):"));
  if (!raw) {
    fail("No name provided. Exiting.");
    process.exit(1);
  }
  const canonical = toBrawlerName(raw);
  if (canonical !== raw) {
    info(`Normalized "${raw}" → "${canonical}"`);
  }
  return canonical;
}

async function step1_checkDbRow(name: string) {
  header("1/6", `Check DB for ${name}`);

  const row = await prisma.brawler.findUnique({ where: { name } });
  if (row) {
    ok(`Found: role=${row.role}, type=${row.type}, hp=${row.hp}, iconUrl=${row.iconUrl ? "yes" : "none"}`);
    return row;
  }

  warn(`No Brawler row for "${name}" yet.`);
  info("Two options to create one:");
  info("  A) Run your Brawlify sync (cron endpoint or pipeline.ts) — cleanest.");
  info("  B) Manual insert right now via this script.");
  const doManual = await askYN("Manually insert now?", false);
  if (!doManual) {
    info("Ok — run your sync first, then re-run this script.");
    process.exit(0);
  }

  const override = BRAWLER_TYPE_OVERRIDES[name];
  if (!override) {
    fail(`Can't insert without an override — need role/type for "${name}".`);
    fail(`Add an entry to BRAWLER_TYPE_OVERRIDES in src/lib/constants.ts first.`);
    process.exit(1);
  }

  const hpStr = await ask(`HP for ${name} (integer, e.g. 7000 for tank):`);
  const hp = parseInt(hpStr, 10);
  if (!Number.isFinite(hp) || hp <= 0) {
    fail(`Invalid HP "${hpStr}".`);
    process.exit(1);
  }

  const created = await prisma.brawler.create({
    data: {
      name,
      role: override.role,
      type: override.type,
      hp,
      iconUrl: null,
    },
  });
  ok(`Created Brawler row (id=${created.id}).`);
  return created;
}

async function step2_checkOverride(name: string) {
  header("2/6", `Check BRAWLER_TYPE_OVERRIDES for ${name}`);

  const override = BRAWLER_TYPE_OVERRIDES[name];
  if (override) {
    ok(`Override present: role=${override.role}, type=${override.type}${
      override.hybrid ? `, hybrid=${override.hybrid}` : ""
    }`);
    return override;
  }

  fail(`No entry for "${name}" in BRAWLER_TYPE_OVERRIDES.`);
  info(`Open src/lib/constants.ts and add a line like:`);
  info(`  "${name}": { role: "Tank", type: "tank" },`);
  info(``);
  info(`Valid types: lane | tank | assassin | thrower | sniper`);
  info(`Valid roles (suggested): Damage | Tank | Sniper | Thrower | Control | Assassin | Support`);
  const added = await askYN(`Have you added "${name}" to BRAWLER_TYPE_OVERRIDES?`, true);
  if (!added) {
    info("No problem — add it, then re-run this script.");
    process.exit(0);
  }

  // They claim they added it, but tsx has the module cached from script start.
  // We can't hot-reload the constants, so we tell them to re-run.
  warn("This script loaded BRAWLER_TYPE_OVERRIDES at startup, so changes aren't visible.");
  warn("Re-run the script now to pick up the new override:");
  info(`  npx tsx scripts/add-brawler.ts ${name}`);
  process.exit(0);
}

async function step3_reconcileType(
  name: string,
  dbRow: { id: string; role: string; type: string },
  override: { role: string; type: BrawlerType }
) {
  header("3/6", `Reconcile role/type for ${name}`);

  if (dbRow.role === override.role && dbRow.type === override.type) {
    ok(`DB already matches override (${override.role}/${override.type}).`);
    return;
  }

  warn(`DB: ${dbRow.role}/${dbRow.type}`);
  warn(`Override: ${override.role}/${override.type}`);
  const doUpdate = await askYN("Update DB to match override?", true);
  if (!doUpdate) {
    warn("Skipped. DB and override are out of sync.");
    return;
  }
  await prisma.brawler.update({
    where: { id: dbRow.id },
    data: { role: override.role, type: override.type },
  });
  ok("DB updated.");
}

async function step4_syncMatchups(name: string) {
  header("4/6", `Sync counter matchups for ${name}`);

  const brawler = await prisma.brawler.findUnique({ where: { name } });
  if (!brawler) {
    fail("Brawler row vanished between steps — bailing.");
    process.exit(1);
  }

  const all = await prisma.brawler.findMany();
  const asAttacker = await prisma.counterMatchup.count({
    where: { brawlerId: brawler.id },
  });
  const asDefender = await prisma.counterMatchup.count({
    where: { counterId: brawler.id },
  });
  const expected = all.length - 1;

  info(`Expected: ${expected} attacker rows + ${expected} defender rows`);
  info(`Current:  ${asAttacker} attacker rows + ${asDefender} defender rows`);

  if (asAttacker === expected && asDefender === expected) {
    ok("All matchup rows already present.");
    const refresh = await askYN("Refresh scores anyway? (safe, deterministic)", false);
    if (!refresh) return;
  } else {
    warn(`Missing ${expected - asAttacker} attacker + ${expected - asDefender} defender rows.`);
  }

  let upserted = 0;
  let errors = 0;
  for (const other of all) {
    if (other.id === brawler.id) continue;

    // brawler attacking other
    const a = computeMatchupScore(
      brawler.name,
      brawler.type as BrawlerType,
      other.name,
      other.type as BrawlerType
    );
    try {
      await prisma.counterMatchup.upsert({
        where: { brawlerId_counterId: { brawlerId: brawler.id, counterId: other.id } },
        update: { advantageScore: a.score, reason: a.reason },
        create: {
          brawlerId: brawler.id,
          counterId: other.id,
          advantageScore: a.score,
          reason: a.reason,
        },
      });
      upserted++;
    } catch {
      errors++;
    }

    // other attacking brawler
    const b = computeMatchupScore(
      other.name,
      other.type as BrawlerType,
      brawler.name,
      brawler.type as BrawlerType
    );
    try {
      await prisma.counterMatchup.upsert({
        where: { brawlerId_counterId: { brawlerId: other.id, counterId: brawler.id } },
        update: { advantageScore: b.score, reason: b.reason },
        create: {
          brawlerId: other.id,
          counterId: brawler.id,
          advantageScore: b.score,
          reason: b.reason,
        },
      });
      upserted++;
    } catch {
      errors++;
    }
  }

  ok(`Upserted ${upserted} matchup rows${errors > 0 ? ` (${errors} errors)` : ""}.`);
}

async function step5_checkAndAggregate(name: string) {
  header("5/6", `Check battle data and aggregate`);

  // Try by brawlerName column first (most schemas have it)
  let battleCount = 0;
  try {
    battleCount = await prisma.battleRecord.count({
      where: { brawlerName: name },
    });
  } catch {
    // Fallback: try by brawlerId
    const b = await prisma.brawler.findUnique({ where: { name } });
    if (b) {
      battleCount = await prisma.battleRecord.count({
        where: { brawlerId: b.id },
      });
    }
  }

  info(`Battles in BattleRecord referencing ${name}: ${battleCount.toLocaleString()}`);

  if (battleCount === 0) {
    warn(`No battles yet. The harvester probably hasn't caught any matches featuring ${name}.`);
    info("Give the harvester a day or two, then re-run aggregation.");
    info("Skipping aggregation for now.");
    return;
  }

  if (battleCount < 100) {
    warn(`Only ${battleCount} battles — low sample. safeTier will keep ${name} out of S-tier, which is correct.`);
  } else {
    ok(`Solid sample size — aggregation will produce meaningful stats.`);
  }

  if (SKIP_AGGREGATE) {
    info("--no-aggregate flag set; skipping aggregation.");
    info(`Run it manually with: npx tsx scripts/aggregate.ts`);
    return;
  }

  const doAgg = await askYN("Run aggregation now? (may take a minute)", true);
  if (!doAgg) {
    info(`Skipped. Run it later with: npx tsx scripts/aggregate.ts`);
    return;
  }

  try {
    // Aggregation may live in either place — try both, fall back to shell
    info("Invoking aggregator...");
    const agg = await import("../src/services/stat-aggregator").catch(() => null);
    if (agg && typeof (agg as any).aggregateAllStats === "function") {
      await (agg as any).aggregateAllStats(prisma);
      ok("Aggregation complete.");
    } else {
      warn("Couldn't auto-invoke stat-aggregator — function name not recognized.");
      info("Run manually: npx tsx scripts/aggregate.ts");
    }
  } catch (e) {
    fail(`Aggregation failed: ${(e as Error).message}`);
    info("Run manually: npx tsx scripts/aggregate.ts");
  }
}

async function step6_finalReport(name: string) {
  header("6/6", `Final verification`);

  const brawler = await prisma.brawler.findUnique({ where: { name } });
  if (!brawler) {
    fail(`Brawler row missing — something went wrong.`);
    return;
  }
  ok(`Brawler row: ${brawler.name} | ${brawler.role}/${brawler.type} | ${brawler.hp} HP`);

  const override = BRAWLER_TYPE_OVERRIDES[name];
  if (override) {
    ok(`Override: ${override.role}/${override.type}`);
  } else {
    fail(`No override — role/type can drift on next sync.`);
  }

  const all = await prisma.brawler.findMany();
  const expected = all.length - 1;
  const asAttacker = await prisma.counterMatchup.count({
    where: { brawlerId: brawler.id },
  });
  const asDefender = await prisma.counterMatchup.count({
    where: { counterId: brawler.id },
  });
  if (asAttacker === expected && asDefender === expected) {
    ok(`Counter matchups: ${asAttacker} attacker + ${asDefender} defender (complete)`);
  } else {
    warn(`Counter matchups: ${asAttacker}/${expected} attacker, ${asDefender}/${expected} defender (gaps)`);
  }

  // Overall matchup table health
  const totalMatchups = await prisma.counterMatchup.count();
  const expectedTotal = all.length * (all.length - 1);
  if (totalMatchups === expectedTotal) {
    ok(`Matchup table: ${totalMatchups}/${expectedTotal} (complete)`);
  } else {
    warn(`Matchup table: ${totalMatchups}/${expectedTotal} (${expectedTotal - totalMatchups} missing globally — other brawlers have gaps too)`);
  }

  // Battles + stats
  let battleCount = 0;
  try {
    battleCount = await prisma.battleRecord.count({ where: { brawlerName: name } });
  } catch {
    battleCount = await prisma.battleRecord.count({ where: { brawlerId: brawler.id } });
  }
  info(`Battles: ${battleCount.toLocaleString()}`);

  try {
    const stat = await (prisma as any).brawlerStat?.findFirst?.({
      where: { brawlerId: brawler.id },
    });
    if (stat) {
      ok(`BrawlerStat: winRate=${stat.winRate}%, pickRate=${stat.pickRate}%, totalBattles=${stat.totalBattles ?? "?"}`);
    } else {
      warn(`No BrawlerStat row yet — run aggregation to populate.`);
    }
  } catch {
    // BrawlerStat model may not exist in the schema
  }

  console.log(`\n${c.bold}${c.green}=== ${name} is ready ===${c.reset}\n`);
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}Apollo Meta — New Brawler Wizard${c.reset}`);
  console.log(c.dim + "Interactive, idempotent. Safe to re-run at any time." + c.reset);

  const name = await resolveBrawlerName(process.argv);

  const override = await step2_checkOverride(name);
  const dbRow = await step1_checkDbRow(name);
  await step3_reconcileType(name, dbRow, override);
  await step4_syncMatchups(name);
  await step5_checkAndAggregate(name);
  await step6_finalReport(name);
}

main()
  .catch((e) => {
    console.error(`\n${c.red}Wizard failed:${c.reset}`, e);
    process.exit(1);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
