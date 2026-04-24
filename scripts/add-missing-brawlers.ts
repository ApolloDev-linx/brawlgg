/**
 * Add Najia + Sirius to Brawler table.
 * Uses Prisma so the id/timestamps get auto-generated.
 * Idempotent — safe to re-run.
 *
 * Usage: npx tsx scripts/add-missing-brawlers.ts
 */

import { PrismaClient } from "@prisma/client";
import { BRAWLER_TYPE_OVERRIDES } from "../src/lib/constants";

const prisma = new PrismaClient();

const MISSING = [
  {name:  "Damian", hp: 11200 },
];

async function main() {
  console.log(`\n=== Adding missing brawlers ===\n`);

  for (const { name, hp } of MISSING) {
    const override = BRAWLER_TYPE_OVERRIDES[name];
    if (!override) {
      console.error(`  ❌ ${name}: no entry in BRAWLER_TYPE_OVERRIDES`);
      continue;
    }

    const existing = await prisma.brawler.findUnique({ where: { name } });
    if (existing) {
      console.log(`  ✓ ${name}: already exists`);
      continue;
    }

    const created = await prisma.brawler.create({
      data: {
        name,
        role: override.role,
        type: override.type,
        hp,
      },
    });
    console.log(`  ✓ Created ${name} — role=${created.role}, type=${created.type}, hp=${created.hp}`);
  }

  console.log(`\n=== Done ===\n`);
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
