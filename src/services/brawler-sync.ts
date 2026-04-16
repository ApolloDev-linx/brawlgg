import { PrismaClient } from "@prisma/client";
import { fetchBrawlers, type BrawlifyBrawler } from "./brawlify-api";
import { SEED_BRAWLERS, COUNTER_MATRIX } from "@/lib/constants";
import type { BrawlerType } from "@/types/brawler";

const CLASS_TO_TYPE: Record<string, BrawlerType> = {
  fighter: "lane",
  "damage dealer": "lane",
  skirmisher: "lane",
  controller: "lane",
  heavyweight: "tank",
  assassin: "assassin",
  sharpshooter: "sniper",
  marksman: "sniper",
  thrower: "thrower",
  artillery: "thrower",
  support: "lane",
};

const CLASS_TO_ROLE: Record<string, string> = {
  fighter: "Damage",
  "damage dealer": "Damage",
  skirmisher: "Damage",
  heavyweight: "Tank",
  assassin: "Assassin",
  sharpshooter: "Sniper",
  marksman: "Sniper",
  thrower: "Thrower",
  artillery: "Thrower",
  controller: "Control",
  support: "Support",
};

const NAME_OVERRIDES: Record<string, { type?: BrawlerType; role?: string }> = {
  Buzz: { type: "assassin", role: "Assassin" },
  Fang: { type: "assassin", role: "Assassin" },
  Sam: { type: "assassin", role: "Assassin" },
  Maisie: { type: "sniper", role: "Sniper" },
  Mandy: { type: "sniper", role: "Sniper" },
  Angelo: { type: "sniper", role: "Sniper" },
};

interface NormalizedBrawler {
  name: string;
  role: string;
  type: BrawlerType;
  hp: number;
  iconUrl: string | null;
  externalId: number;
}

function normalizeBrawler(raw: BrawlifyBrawler): NormalizedBrawler {
  const className = (raw.class?.name || "").toLowerCase();
  const override = NAME_OVERRIDES[raw.name];

  return {
    name: raw.name,
    role: override?.role || CLASS_TO_ROLE[className] || "Damage",
    type: override?.type || CLASS_TO_TYPE[className] || "lane",
    hp: estimateHp(className, raw.name),
    iconUrl: raw.imageUrl2 || raw.imageUrl || null,
    externalId: raw.id,
  };
}

function estimateHp(className: string, name: string): number {
  const known: Record<string, number> = {
    Shelly: 5320, Nita: 5600, Colt: 3920, Bull: 7000, Brock: 3640,
    "El Primo": 8120, Barley: 3640, Poco: 5320, Rosa: 7560, Jessie: 4480,
    Dynamike: 3640, Piper: 3360, Pam: 6720, Frank: 9800, Mortis: 5320,
    Tara: 4200, Spike: 3640, Crow: 3920, Leon: 4480, Sandy: 5040,
  };
  if (known[name]) return known[name];
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

export interface SyncResult {
  source: "api" | "fallback";
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

export async function syncBrawlerData(
  prisma: PrismaClient
): Promise<SyncResult> {
  const result: SyncResult = {
    source: "api",
    total: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  let normalized: NormalizedBrawler[];

  try {
    console.log("[brawler-sync] Fetching from Brawlify API...");
    const raw = await fetchBrawlers();
    if (!raw || raw.length === 0) {
      throw new Error("API returned empty brawler list");
    }
    const released = raw.filter((b) => b.released !== false);
    console.log(
      `[brawler-sync] API returned ${raw.length} brawlers (${released.length} released)`
    );
    normalized = released.map(normalizeBrawler);
    result.source = "api";
  } catch (err: any) {
    console.warn(
      `[brawler-sync] API failed (${err.message}), using fallback seed data`
    );
    result.errors.push(`API fetch failed: ${err.message}`);
    normalized = SEED_BRAWLERS.map((b) => ({
      name: b.name,
      role: b.role,
      type: b.type as BrawlerType,
      hp: b.hp,
      iconUrl: null,
      externalId: 0,
    }));
    result.source = "fallback";
  }

  result.total = normalized.length;

  for (const brawler of normalized) {
    try {
      const existing = await prisma.brawler.findUnique({
        where: { name: brawler.name },
      });
      if (existing) {
        await prisma.brawler.update({
          where: { name: brawler.name },
          data: {
            role: brawler.role,
            type: brawler.type,
            hp: brawler.hp,
            iconUrl: brawler.iconUrl || existing.iconUrl,
          },
        });
        result.updated++;
      } else {
        await prisma.brawler.create({
          data: {
            name: brawler.name,
            role: brawler.role,
            type: brawler.type,
            hp: brawler.hp,
            iconUrl: brawler.iconUrl,
          },
        });
        result.created++;
      }
    } catch (err: any) {
      result.errors.push(`Failed to upsert ${brawler.name}: ${err.message}`);
    }
  }

  return result;
}

export async function syncCounterMatchups(
  prisma: PrismaClient
): Promise<{ total: number; errors: string[] }> {
  const brawlers = await prisma.brawler.findMany();
  let total = 0;
  const errors: string[] = [];

  for (const brawler of brawlers) {
    const info = COUNTER_MATRIX[brawler.type as BrawlerType];
    if (!info) continue;
    for (const other of brawlers) {
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
      try {
        await prisma.counterMatchup.upsert({
          where: {
            brawlerId_counterId: { brawlerId: brawler.id, counterId: other.id },
          },
          update: { advantageScore: Math.round(score * 10) / 10, reason },
          create: {
            brawlerId: brawler.id,
            counterId: other.id,
            advantageScore: Math.round(score * 10) / 10,
            reason,
          },
        });
        total++;
      } catch (err: any) {
        errors.push(`Matchup ${brawler.name} vs ${other.name}: ${err.message}`);
      }
    }
  }
  return { total, errors };
}

export async function syncMapBrawlerStats(
  prisma: PrismaClient
): Promise<number> {
  const brawlers = await prisma.brawler.findMany();
  const maps = await prisma.map.findMany();
  let count = 0;

  for (const map of maps) {
    for (const brawler of brawlers) {
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
        create: {
          mapId: map.id, brawlerId: brawler.id,
          winRate, pickRate, banRate, tier, pickCategory,
        },
      });
      count++;
    }
  }
  return count;
}
