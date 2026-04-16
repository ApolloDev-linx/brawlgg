import { PrismaClient } from "@prisma/client";
import {
  SEED_BRAWLERS,
  SEED_MODES,
  SEED_MAPS,
  COUNTER_MATRIX,
} from "../src/lib/constants";
import type { BrawlerType } from "../src/types/brawler";

const prisma = new PrismaClient();
const BRAWLIFY_URL = "https://api.brawlapi.com/v1/brawlers";

const CLASS_TO_TYPE: Record<string, string> = {
  fighter: "lane", "damage dealer": "lane", skirmisher: "lane",
  controller: "lane", heavyweight: "tank", assassin: "assassin",
  sharpshooter: "sniper", marksman: "sniper",
  thrower: "thrower", artillery: "thrower", support: "lane",
};

const CLASS_TO_ROLE: Record<string, string> = {
  fighter: "Damage", "damage dealer": "Damage", skirmisher: "Damage",
  heavyweight: "Tank", assassin: "Assassin",
  sharpshooter: "Sniper", marksman: "Sniper",
  thrower: "Thrower", artillery: "Thrower",
  controller: "Control", support: "Support",
};

const NAME_OVERRIDES: Record<string, { type?: string; role?: string }> = {
  Buzz: { type: "assassin", role: "Assassin" },
  Fang: { type: "assassin", role: "Assassin" },
  Sam: { type: "assassin", role: "Assassin" },
  Maisie: { type: "sniper", role: "Sniper" },
  Mandy: { type: "sniper", role: "Sniper" },
  Angelo: { type: "sniper", role: "Sniper" },
};

function estimateHp(className: string): number {
  switch (className) {
    case "heavyweight": return 7000;
    case "assassin": return 4200;
    case "sharpshooter": case "marksman": return 3640;
    case "thrower": case "artillery": return 3360;
    case "support": return 5040;
    case "controller": return 4760;
    default: return 4480;
  }
}

interface BrawlerInput {
  name: string; role: string; type: string; hp: number; iconUrl: string | null;
}

async function fetchBrawlerData(forceLocal: boolean): Promise<{
  brawlers: BrawlerInput[]; source: string;
}> {
  if (forceLocal) {
    return {
      brawlers: SEED_BRAWLERS.map((b) => ({ ...b, iconUrl: null })),
      source: "fallback (--fallback-only flag)",
    };
  }
  try {
    console.log("  Fetching brawlers from Brawlify API...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(BRAWLIFY_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list: any[] = data.list || [];
    if (list.length === 0) throw new Error("Empty response");
    const released = list.filter((b: any) => b.released !== false);
    console.log(
      `  API returned ${list.length} brawlers (${released.length} released)`
    );
    const brawlers: BrawlerInput[] = released.map((raw: any) => {
      const className = (raw.class?.name || "").toLowerCase();
      const override = NAME_OVERRIDES[raw.name];
      const seedMatch = SEED_BRAWLERS.find((s) => s.name === raw.name);
      return {
        name: raw.name,
        role: override?.role || CLASS_TO_ROLE[className] || "Damage",
        type: override?.type || CLASS_TO_TYPE[className] || "lane",
        hp: seedMatch?.hp || estimateHp(className),
        iconUrl: raw.imageUrl2 || raw.imageUrl || null,
      };
    });
    return { brawlers, source: "Brawlify API" };
  } catch (err: any) {
    console.warn(`  API failed: ${err.message}`);
    console.log("  Falling back to hardcoded SEED_BRAWLERS...");
    return {
      brawlers: SEED_BRAWLERS.map((b) => ({ ...b, iconUrl: null })),
      source: `fallback (API error: ${err.message})`,
    };
  }
}

async function main() {
  const forceLocal = process.argv.includes("--fallback-only");
  console.log("=== Apollo Meta Database Seed ===\n");

  console.log("[1/5] Brawlers");
  const { brawlers, source } = await fetchBrawlerData(forceLocal);
  console.log(`  Source: ${source}`);
  for (const b of brawlers) {
    await prisma.brawler.upsert({
      where: { name: b.name },
      update: { role: b.role, type: b.type, hp: b.hp, iconUrl: b.iconUrl },
      create: { name: b.name, role: b.role, type: b.type, hp: b.hp, iconUrl: b.iconUrl },
    });
  }
  console.log(`  Upserted ${brawlers.length} brawlers\n`);

  console.log("[2/5] Game modes");
  const modeRecords: Record<string, string> = {};
  for (const m of SEED_MODES) {
    const record = await prisma.gameMode.upsert({
      where: { name: m.name },
      update: { icon: m.icon },
      create: { name: m.name, icon: m.icon },
    });
    modeRecords[m.name] = record.id;
  }
  console.log(`  Upserted ${Object.keys(modeRecords).length} game modes\n`);

  console.log("[3/5] Maps");
  for (const m of SEED_MAPS) {
    const modeId = modeRecords[m.mode];
    if (!modeId) continue;
    const existing = await prisma.map.findFirst({
      where: { name: m.name, gameModeId: modeId },
    });
    if (!existing) {
      await prisma.map.create({
        data: { name: m.name, gameModeId: modeId, active: true },
      });
    }
  }
  const allMaps = await prisma.map.findMany();
  console.log(`  Total maps: ${allMaps.length}\n`);

  console.log("[4/5] Map brawler stats");
  let statsCount = 0;
  const allBrawlers = await prisma.brawler.findMany();
  for (const map of allMaps) {
    for (const brawler of allBrawlers) {
      const baseWin = 45 + Math.random() * 15;
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
        where: { mapId_brawlerId: { mapId: map.id, brawlerId: brawler.id } },
        update: { winRate, pickRate, banRate, tier, pickCategory },
        create: { mapId: map.id, brawlerId: brawler.id, winRate, pickRate, banRate, tier, pickCategory },
      });
      statsCount++;
    }
  }
  console.log(`  Generated ${statsCount} stat records\n`);

  console.log("[5/5] Counter matchups");
  let counterCount = 0;
  for (const brawler of allBrawlers) {
    const info = COUNTER_MATRIX[brawler.type as BrawlerType];
    if (!info) continue;
    for (const other of allBrawlers) {
      if (brawler.id === other.id) continue;
      let score = 0;
      let reason = "Neutral matchup, depends on skill and positioning";
      if (info.strongVs.includes(other.type as BrawlerType)) {
        score = 1.5 + Math.random();
        reason = `${brawler.name} (${brawler.type}) counters ${other.name} (${other.type})`;
      } else if (info.weakVs.includes(other.type as BrawlerType)) {
        score = -(1.5 + Math.random());
        reason = `${brawler.name} (${brawler.type}) is weak against ${other.name} (${other.type})`;
      } else {
        score = -0.5 + Math.random();
      }
      await prisma.counterMatchup.upsert({
        where: { brawlerId_counterId: { brawlerId: brawler.id, counterId: other.id } },
        update: { advantageScore: Math.round(score * 10) / 10, reason },
        create: { brawlerId: brawler.id, counterId: other.id, advantageScore: Math.round(score * 10) / 10, reason },
      });
      counterCount++;
    }
  }
  console.log(`  Generated ${counterCount} matchup records\n`);

  console.log("=== Seed complete ===");
  console.log(`  Brawlers: ${allBrawlers.length} (source: ${source})`);
  console.log(`  Maps: ${allMaps.length}`);
  console.log(`  Stats: ${statsCount}`);
  console.log(`  Matchups: ${counterCount}`);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
