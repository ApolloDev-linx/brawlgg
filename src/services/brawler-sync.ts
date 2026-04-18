import { PrismaClient } from "@prisma/client";
import { fetchBrawlers, type BrawlifyBrawler } from "./brawlify-api";
import {
  SEED_BRAWLERS,
  COUNTER_MATRIX,
  CLASS_TO_TYPE,
  CLASS_TO_ROLE,
  BRAWLER_TYPE_OVERRIDES,
} from "@/lib/constants";
import type { BrawlerType } from "@/types/brawler";

interface NormalizedBrawler {
  name: string;
  role: string;
  type: BrawlerType;
  hp: number;
  iconUrl: string | null;
  externalId: number;
}

/**
 * Normalize any casing/separators from the API to canonical title case.
 * Handles: "BULL" -> "Bull", "el primo" -> "El Primo",
 *          "EL-PRIMO" -> "El Primo", "LARRY-LAWRIE" -> "Larry & Lawrie",
 *          "MR-P" -> "Mr. P"
 */
function toTitleCase(str: string): string {
  // Explicit canonicalizations for brawlers the API serves with weird slugs.
  // These take priority over the generic hyphen/underscore handling below.
  const CANONICAL: Record<string, string> = {
    "larry-lawrie": "Larry & Lawrie",
    "larry and lawrie": "Larry & Lawrie",
    "mr-p": "Mr. P",
    "mr p": "Mr. P",
    "el-primo": "El Primo",
    // Keep legitimate hyphens:
    "8-bit": "8-Bit",
    "r-t": "R-T",
    "jae-yong": "Jae-Yong",
  };

  const lower = str.toLowerCase().trim();
  if (CANONICAL[lower]) return CANONICAL[lower];

  // Default path: convert hyphens/underscores to spaces, then title-case.
  return lower
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeBrawler(raw: BrawlifyBrawler): NormalizedBrawler {
  const name = toTitleCase(raw.name);
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
      const existing = await prisma.brawler.findUnique({ where: { name: b.name } });
      if (existing) {
        await prisma.brawler.update({
          where: { id: existing.id },
          data: {
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
