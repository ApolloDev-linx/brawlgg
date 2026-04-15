import { PrismaClient } from "@prisma/client";
import {
  SEED_BRAWLERS,
  SEED_MODES,
  SEED_MAPS,
  COUNTER_MATRIX,
} from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Seed brawlers
  console.log("  Creating brawlers...");
  const brawlerRecords: Record<string, string> = {};
  for (const b of SEED_BRAWLERS) {
    const record = await prisma.brawler.upsert({
      where: { name: b.name },
      update: { role: b.role, type: b.type, hp: b.hp },
      create: { name: b.name, role: b.role, type: b.type, hp: b.hp },
    });
    brawlerRecords[b.name] = record.id;
  }
  console.log(`  Created ${Object.keys(brawlerRecords).length} brawlers`);

  // 2. Seed game modes
  console.log("  Creating game modes...");
  const modeRecords: Record<string, string> = {};
  for (const m of SEED_MODES) {
    const record = await prisma.gameMode.upsert({
      where: { name: m.name },
      update: { icon: m.icon },
      create: { name: m.name, icon: m.icon },
    });
    modeRecords[m.name] = record.id;
  }
  console.log(`  Created ${Object.keys(modeRecords).length} game modes`);

  // 3. Seed maps
  console.log("  Creating maps...");
  const mapRecords: Record<string, string> = {};
  for (const m of SEED_MAPS) {
    const modeId = modeRecords[m.mode];
    if (!modeId) continue;

    // Check if map already exists by name + mode
    const existing = await prisma.map.findFirst({
      where: { name: m.name, gameModeId: modeId },
    });

    if (existing) {
      mapRecords[m.name] = existing.id;
    } else {
      const record = await prisma.map.create({
        data: { name: m.name, gameModeId: modeId, active: true },
      });
      mapRecords[m.name] = record.id;
    }
  }
  console.log(`  Created ${Object.keys(mapRecords).length} maps`);

  // 4. Generate mock map-brawler stats
  console.log("  Generating map brawler stats...");
  let statsCount = 0;
  const brawlerEntries = Object.entries(brawlerRecords);

  for (const [mapName, mapId] of Object.entries(mapRecords)) {
    for (const [brawlerName, brawlerId] of brawlerEntries) {
      // Generate somewhat realistic random stats
      const baseWin = 45 + Math.random() * 15; // 45-60
      const winRate = Math.round(baseWin * 10) / 10;
      const pickRate = Math.round((2 + Math.random() * 10) * 10) / 10;
      const banRate = Math.round(Math.random() * 8 * 10) / 10;

      let tier: string;
      if (winRate >= 54) tier = "S";
      else if (winRate >= 51) tier = "A";
      else if (winRate >= 48) tier = "B";
      else tier = "C";

      let pickCategory: string | null = null;
      if (winRate >= 54 && pickRate >= 8) pickCategory = "first_pick";
      else if (winRate >= 51 && banRate < 3) pickCategory = "safe";
      else if (winRate >= 53 && banRate >= 5) pickCategory = "high_risk";

      await prisma.mapBrawlerStat.upsert({
        where: { mapId_brawlerId: { mapId, brawlerId } },
        update: { winRate, pickRate, banRate, tier, pickCategory },
        create: {
          mapId,
          brawlerId,
          winRate,
          pickRate,
          banRate,
          tier,
          pickCategory,
        },
      });
      statsCount++;
    }
  }
  console.log(`  Created ${statsCount} map-brawler stat records`);

  // 5. Generate counter matchups
  console.log("  Generating counter matchups...");
  let counterCount = 0;
  for (const [bName, bId] of brawlerEntries) {
    const brawler = SEED_BRAWLERS.find((b) => b.name === bName);
    if (!brawler) continue;
    const info = COUNTER_MATRIX[brawler.type];
    if (!info) continue;

    for (const [cName, cId] of brawlerEntries) {
      if (bId === cId) continue;
      const counter = SEED_BRAWLERS.find((b) => b.name === cName);
      if (!counter) continue;

      let score = 0;
      let reason = "Neutral matchup";

      if (info.strongVs.includes(counter.type as any)) {
        score = 1.5 + Math.random();
        reason = `${bName} (${brawler.type}) counters ${cName} (${counter.type})`;
      } else if (info.weakVs.includes(counter.type as any)) {
        score = -(1.5 + Math.random());
        reason = `${bName} (${brawler.type}) is weak against ${cName} (${counter.type})`;
      } else {
        score = -0.5 + Math.random();
        reason = "Neutral matchup, depends on skill and positioning";
      }

      await prisma.counterMatchup.upsert({
        where: { brawlerId_counterId: { brawlerId: bId, counterId: cId } },
        update: {
          advantageScore: Math.round(score * 10) / 10,
          reason,
        },
        create: {
          brawlerId: bId,
          counterId: cId,
          advantageScore: Math.round(score * 10) / 10,
          reason,
        },
      });
      counterCount++;
    }
  }
  console.log(`  Created ${counterCount} counter matchup records`);

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
