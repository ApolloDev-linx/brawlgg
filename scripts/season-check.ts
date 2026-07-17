/**
 * scripts/season-check.ts
 *
 * "Been away a while" wizard. Walks the entire maintenance flow in one
 * sitting, y/n at every step. Say n and it skips straight to the next
 * step — nothing runs unless you confirm it.
 *
 * Flow:
 *   1. New brawler(s)?  -> collect name/role/type/hp, auto-writes to
 *      constants.ts (BRAWLER_TYPE_OVERRIDES) AND creates the DB row
 *      immediately, so you don't have to wait on a Brawlify sync for a
 *      brand-new release that might not be in their API yet.
 *   2. Brawlify sync (brawlers + maps) — picks up icon/roster changes.
 *   3. Reconcile types/roles + regen counter matchups (only really
 *      matters if step 1 added something, but harmless either way).
 *   4. Harvest — BIG warning, this is the ~20hr one. Skippable.
 *   5. Aggregate — rebuilds MapBrawlerStat + BrawlerStat.
 *   6. Dupe check — quick sanity pass, no writes.
 *   7. Summary + what to do next.
 *
 * Usage:
 *   npx tsx scripts/season-check.ts
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as readline from "readline";
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { toBrawlerName } from "../src/lib/brawler-name";
import type { BrawlerType } from "../src/types/brawler";

// Load env vars BEFORE anything touches Prisma. Only harvest.ts does this
// on its own — every other script in this repo assumes DATABASE_URL is
// already in the shell env. Loading it here means every subprocess this
// wizard spawns (aggregate, reconcile, sync-brawlers, etc.) inherits it
// too, since child_process.spawn passes down the parent's process.env
// by default.
config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();
const CONSTANTS_PATH = path.join(process.cwd(), "src/lib/constants.ts");
const VALID_TYPES: BrawlerType[] = ["lane", "tank", "assassin", "thrower", "sniper"];

// ──────────────────────────────────────────────────────────────────────────
// Terminal helpers (same palette as add-brawler.ts)
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) =>
    rl.question(`${c.cyan}?${c.reset} ${prompt} `, (a) => resolve(a.trim()))
  );
}

async function askYN(prompt: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  const a = (await ask(`${prompt} ${c.dim}${hint}${c.reset}`)).toLowerCase();
  if (a === "") return defaultYes;
  return a === "y" || a === "yes";
}

function header(step: string, title: string) {
  console.log(`\n${c.bold}${c.blue}[${step}]${c.reset} ${c.bold}${title}${c.reset}`);
}
const ok = (m: string) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const warn = (m: string) => console.log(`  ${c.yellow}⚠${c.reset} ${m}`);
const fail = (m: string) => console.log(`  ${c.red}✗${c.reset} ${m}`);
const info = (m: string) => console.log(`  ${c.dim}${m}${c.reset}`);

function runSubprocess(scriptPath: string, args: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`  ${c.dim}$ npx tsx ${scriptPath} ${args.join(" ")}${c.reset}\n`);
    const child = spawn("npx", ["tsx", scriptPath, ...args], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code === 0));
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Step 1: New brawlers
// ──────────────────────────────────────────────────────────────────────────

interface NewBrawlerInput {
  name: string;
  role: string;
  type: BrawlerType;
  hp: number;
}

async function appendToConstants(b: NewBrawlerInput) {
  const content = await fs.readFile(CONSTANTS_PATH, "utf-8");

  // BRAWLER_TYPE_OVERRIDES is the last export in the file — insert right
  // before the final closing `};`.
  const marker = "\n};";
  const idx = content.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error("Couldn't find closing `};` in constants.ts — bailing, add it by hand.");
  }

  const newLine = `  "${b.name}": { role: "${b.role}", type: "${b.type}" },\n`;
  const updated = content.slice(0, idx) + "\n" + newLine + content.slice(idx);
  await fs.writeFile(CONSTANTS_PATH, updated);
}

async function collectOneBrawler(): Promise<NewBrawlerInput> {
  const rawName = await ask("Brawler name:");
  const name = toBrawlerName(rawName);
  if (name !== rawName) info(`Normalized "${rawName}" → "${name}"`);

  let type: BrawlerType | null = null;
  while (!type) {
    const t = (await ask(`Type (${VALID_TYPES.join(" | ")}):`)).toLowerCase();
    if (VALID_TYPES.includes(t as BrawlerType)) type = t as BrawlerType;
    else fail(`Not a valid type. Pick one of: ${VALID_TYPES.join(", ")}`);
  }

  const role = await ask(
    "Role (e.g. Damage, Tank, Sniper, Thrower, Control, Assassin, Support):"
  );

  let hp = NaN;
  while (!Number.isFinite(hp) || hp <= 0) {
    const hpStr = await ask("HP (integer, e.g. 4200):");
    hp = parseInt(hpStr, 10);
    if (!Number.isFinite(hp) || hp <= 0) fail("Needs to be a positive integer.");
  }

  return { name, role, type, hp };
}

async function stepNewBrawlers(): Promise<string[]> {
  header("1/6", "New brawlers");
  const hasNew = await askYN("Any new brawler(s) dropped since you were last here?");
  if (!hasNew) {
    info("Skipping.");
    return [];
  }

  const added: string[] = [];
  let more = true;

  while (more) {
    const input = await collectOneBrawler();

    // 1. Write to constants.ts (authoritative source)
    try {
      await appendToConstants(input);
      ok(`Added "${input.name}" to BRAWLER_TYPE_OVERRIDES in constants.ts`);
    } catch (e: any) {
      fail(`Failed to update constants.ts: ${e.message}`);
      warn(`Add this line to BRAWLER_TYPE_OVERRIDES yourself:`);
      info(`  "${input.name}": { role: "${input.role}", type: "${input.type}" },`);
    }

    // 2. Create the DB row right now — don't wait on a Brawlify sync,
    //    since brand-new releases sometimes aren't in their API for a
    //    few days.
    try {
      const existing = await prisma.brawler.findUnique({ where: { name: input.name } });
      if (existing) {
        await prisma.brawler.update({
          where: { id: existing.id },
          data: { role: input.role, type: input.type, hp: input.hp },
        });
        ok(`Updated existing Brawler row for "${input.name}"`);
      } else {
        await prisma.brawler.create({
          data: {
            name: input.name,
            role: input.role,
            type: input.type,
            hp: input.hp,
            iconUrl: null,
          },
        });
        ok(`Created Brawler row for "${input.name}" (no portrait yet)`);
      }
    } catch (e: any) {
      fail(`DB write failed for "${input.name}": ${e.message}`);
    }

    info(
      `Reminder: if Brawlify doesn't have their portrait yet, run ` +
        `npx tsx scripts/add-portrait.ts ${input.name} --url <url>`
    );

    added.push(input.name);
    more = await askYN("Add another new brawler?");
  }

  return added;
}

// ──────────────────────────────────────────────────────────────────────────
// Step 2: Brawlify sync (brawlers + maps)
// ──────────────────────────────────────────────────────────────────────────

async function stepBrawlifySync() {
  header("2/6", "Brawlify sync (brawlers + maps)");
  const run = await askYN(
    "Pull latest roster/icons/maps from Brawlify now?",
    true
  );
  if (!run) {
    info("Skipping.");
    return;
  }
  const okRun = await runSubprocess("src/jobs/sync-brawlers.ts");
  const okMaps = await runSubprocess("scripts/sync-maps.ts");
  if (okRun && okMaps) ok("Brawlify sync complete.");
  else warn("Sync had errors — scroll up for details.");
}

// ──────────────────────────────────────────────────────────────────────────
// Step 3: Reconcile types + counter matchups
// ──────────────────────────────────────────────────────────────────────────

async function stepReconcile(hadNewBrawlers: boolean) {
  header("3/6", "Reconcile types/roles + counter matchups");
  const run = await askYN(
    "Reconcile brawler types from constants.ts and regenerate counter matchups now?",
    hadNewBrawlers
  );
  if (!run) {
    info("Skipping.");
    return;
  }
  const okRun = await runSubprocess("scripts/reconcile-brawler-types.ts");
  if (okRun) ok("Reconcile complete.");
  else warn("Reconcile had errors — scroll up for details.");
}

// ──────────────────────────────────────────────────────────────────────────
// Step 4: Harvest
// ──────────────────────────────────────────────────────────────────────────

async function stepHarvest(): Promise<boolean> {
  header("4/6", "Harvest battle data");
  warn("This is the slow one — roughly 20 hours by design (upsert-per-row).");
  warn("It'll block this terminal the whole time. Best run overnight.");
  const run = await askYN("Kick off the harvest now?", false);
  if (!run) {
    info("Skipping. Data will still reflect whatever's already in BattleRecord.");
    return false;
  }
  const okRun = await runSubprocess("scripts/harvest.ts");
  if (okRun) ok("Harvest complete.");
  else warn("Harvest had errors — scroll up for details.");
  return okRun;
}

// ──────────────────────────────────────────────────────────────────────────
// Step 5: Aggregate
// ──────────────────────────────────────────────────────────────────────────

async function stepAggregate(harvestRan: boolean) {
  header("5/6", "Aggregate stats");
  const run = await askYN(
    "Rebuild MapBrawlerStat + BrawlerStat from BattleRecord now?",
    true
  );
  if (!run) {
    info("Skipping. Note: if you skipped harvest too, stats will look stale.");
    return;
  }
  const okRun = await runSubprocess("scripts/aggregate.ts");
  if (okRun) ok("Aggregation complete.");
  else warn("Aggregation had errors — scroll up for details.");
  if (!harvestRan) {
    info("(Ran on existing data since harvest was skipped — nothing new to add.)");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Step 6: Dupe check
// ──────────────────────────────────────────────────────────────────────────

async function stepDupeCheck() {
  header("6/6", "Duplicate brawler check");
  const run = await askYN("Run a quick duplicate-brawler sanity check?", true);
  if (!run) {
    info("Skipping.");
    return;
  }
  await runSubprocess("scripts/check-dupes.ts");
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}Apollo Meta — Season Check${c.reset}`);
  console.log(
    c.dim +
      "Interactive catch-up wizard. Every step is y/n — say n to skip." +
      c.reset
  );

  const addedBrawlers = await stepNewBrawlers();
  await stepBrawlifySync();
  await stepReconcile(addedBrawlers.length > 0);
  const harvestRan = await stepHarvest();
  await stepAggregate(harvestRan);
  await stepDupeCheck();

  console.log(`\n${c.bold}${c.green}=== Season check complete ===${c.reset}`);
  if (addedBrawlers.length > 0) {
    console.log(`  New brawlers added: ${addedBrawlers.join(", ")}`);
  }
  console.log(`\nNext steps:`);
  console.log(`  • Restart dev server to flush cache:  npm run dev`);
  console.log(`  • Sanity-check at:                    /debug/stats`);
  console.log(`  • Check for dropped maps at:           /debug/maps`);
  if (!harvestRan) {
    console.log(
      `  • You skipped harvest — queue it up when you can: npx tsx scripts/harvest.ts`
    );
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(`\n${c.red}Season check failed:${c.reset}`, e);
    process.exit(1);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
