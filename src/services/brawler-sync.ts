import { PrismaClient } from "@prisma/client";
import { fetchBrawlers, type BrawlifyBrawler } from "./brawlify-api";
import {
  SEED_BRAWLERS,
  COUNTER_MATRIX,
  CLASS_TO_TYPE,
  CLASS_TO_ROLE,
  BRAWLER_TYPE_OVERRIDES,
} from "@/lib/constants";
import { toBrawlerName } from "@/lib/brawler-name";
import type { BrawlerType } from "@/types/brawler";

interface NormalizedBrawler {
  name: string;
  role: string;
  type: BrawlerType;
  hp: number;
  iconUrl: string | null;
  externalId: number;
}

function normalizeBrawler(raw: BrawlifyBrawler): NormalizedBrawler {
  const name = toBrawlerName(raw.name);
  const className = (raw.class?.name || "").toLowerCase();

  // 1. Authoritative: hand-curated overrides win, always.
  const override = BRAWLER_TYPE_OVERRIDES[name];
  if (override) {
    return {
      name,
      role: override.role,
      type: override.type,
      hp: estimateHp(className, name),
      iconUrl: raw.imageUrl2 || raw.imageUrl || null,
      externalId: raw.id,
    };
  }

  // 2. Unknown brawler (probably a new release) — fall back to API class
  //    mapping, but LOUDLY log so we know to add them to BRAWLER_TYPE_OVERRIDES.
  const mappedType = CLASS_TO_TYPE[className];
  const mappedRole = CLASS_TO_ROLE[className];
  if (!mappedType) {
    console.warn(
      `[brawler-sync] UNCLASSIFIED: "${name}" (API class="${raw.class?.name}"). ` +
        `Add to BRAWLER_TYPE_OVERRIDES in constants.ts. Defaulting to lane/Damage.`
    );
  } else {
    console.info(
      `[brawler-sync] New brawler "${name}" auto-classified as ${mappedRole}/${mappedType} from API class "${raw.class?.name}". Verify and add to BRAWLER_TYPE_OVERRIDES.`
    );
  }
  return {
    name,
    role: mappedRole || "Damage",
    type: mappedType || "lane",
    hp: estimateHp(className, name),
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
    case "heavyweight": case "tank": return 7000;
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
  let rawBrawlers: BrawlifyBrawler[] = [];
  try {
    rawBrawlers = await fetchBrawlers();
    if (rawBrawlers.length === 0) throw new Error("Empty brawler list from API");
  } catch (e) {
    result.source = "fallback";
    result.errors.push(`API fetch failed: ${(e as Error).message}`);
    // Fall back to seed list
    rawBrawlers = SEED_BRAWLERS.map((b, i) => ({
      id: 16000000 + i,
      name: b.name,
      class: { id: 0, name: b.role },
      imageUrl: "",
      imageUrl2: "",
    })) as BrawlifyBrawler[];
  }
  const normalized = rawBrawlers.map(normalizeBrawler);
  result.total = normalized.length;

  for (const b of normalized) {
    try {
      // Case-insensitive lookup so we never create a duplicate row even if
      // the API ever returns "COLT" and our normalizer somehow misses it.
      // If an existing row has bad casing ("COLT"), we also auto-heal its
      // name to the canonical title-case version on update.
      const existing = await prisma.brawler.findFirst({
        where: { name: { equals: b.name, mode: "insensitive" } },
      });
      if (existing) {
        await prisma.brawler.update({
          where: { id: existing.id },
          data: {
            name: b.name, // auto-heal "COLT" -> "Colt" if any leftover bad casing
            role: b.role,
            type: b.type,
            hp: b.hp,
            iconUrl: b.iconUrl,
            externalId: b.externalId,
          },
        });
        result.updated++;
      } else {
        await prisma.brawler.create({
          data: {
            name: b.name,
            role: b.role,
            type: b.type,
            hp: b.hp,
            iconUrl: b.iconUrl,
            externalId: b.externalId,
          },
        });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`${b.name}: ${(e as Error).message}`);
    }
  }
  return result;
}

import { getTier } from "@/lib/constants";

// Counter matchups
// ---------------------------------------------------------------------------
export interface MatchupSyncResult {
  total: number;
  errors: string[];
}

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
  if (info?.strongVs.includes(defenderType)) {
    return {
      score: Math.round((1.5 + rand) * 10) / 10,
      reason: `${attackerName} (${attackerType}) counters ${defenderName} (${defenderType})`,
    };
  }
  if (info?.weakVs.includes(defenderType)) {
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

export async function syncCounterMatchups(
  prisma: PrismaClient
): Promise<MatchupSyncResult> {
  const result: MatchupSyncResult = { total: 0, errors: [] };
  const brawlers = await prisma.brawler.findMany();
  for (const attacker of brawlers) {
    for (const defender of brawlers) {
      if (attacker.id === defender.id) continue;
      const { score, reason } = computeMatchupScore(
        attacker.name,
        attacker.type as BrawlerType,
        defender.name,
        defender.type as BrawlerType
      );
      try {
        await prisma.counterMatchup.upsert({
          where: {
            brawlerId_counterId: {
              brawlerId: attacker.id,
              counterId: defender.id,
            },
          },
          update: { advantageScore: score, reason },
          create: {
            brawlerId: attacker.id,
            counterId: defender.id,
            advantageScore: score,
            reason,
          },
        });
        result.total++;
      } catch (e) {
        result.errors.push(
          `${attacker.name} vs ${defender.name}: ${(e as Error).message}`
        );
      }
    }
  }
  return result;
}

// Map brawler stats (placeholder rows for brawlers missing one on each map;
// real rates get filled in later by stat-aggregator.)
// ---------------------------------------------------------------------------
export async function syncMapBrawlerStats(
  prisma: PrismaClient
): Promise<number> {
  const [brawlers, maps] = await Promise.all([
    prisma.brawler.findMany(),
    prisma.map.findMany({ where: { active: true } }),
  ]);
  let created = 0;
  for (const map of maps) {
    for (const brawler of brawlers) {
      const existing = await prisma.mapBrawlerStat.findUnique({
        where: {
          mapId_brawlerId: { mapId: map.id, brawlerId: brawler.id },
        },
      });
      if (existing) continue; // don't clobber real aggregated data
      const rand = stableRand(`${map.id}|${brawler.id}`);
      const winRate = 45 + rand * 10;
      const pickRate = rand * 15;
      const banRate = rand * 5;
      try {
        await prisma.mapBrawlerStat.create({
          data: {
            mapId: map.id,
            brawlerId: brawler.id,
            winRate,
            pickRate,
            banRate,
            tier: getTier(winRate),
            isReal: false,
          },
        });
        created++;
      } catch {
        // skip dupes / race conditions silently
      }
    }
  }
  return created;
}
