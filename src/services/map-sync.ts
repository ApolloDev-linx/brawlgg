/**
 * map-sync.ts
 *
 * Pulls the authoritative map list from the Brawlify API and upserts into
 * the Map table. Filters down to the game modes we track competitively
 * and normalizes map names to match the space-delimited format used by
 * the official Brawl Stars API (which is what lands in BattleRecord).
 *
 * Name normalization:
 *   Brawlify returns map names like "Hard-Rock-Mine" (hyphens).
 *   The official Brawl Stars API returns "Hard Rock Mine" (spaces).
 *   Our BattleRecord.mapName column contains the space form, so we
 *   convert hyphens to spaces before writing Map rows. Otherwise the
 *   aggregator silently drops everything.
 *
 * Mode filtering:
 *   We track traditional 3v3 competitive modes. Novelty/event modes
 *   (Basket Brawl, Wipeout, Brawl Hockey, etc.) are filtered out.
 *   2v2 and 5v5 variants of tracked modes are also excluded.
 */

import type { PrismaClient } from "@prisma/client";

// Brawlify mode names we count as tracked 3v3 competitive.
const TRACKED_MODE_NAMES = new Set<string>([
  "GEM-GRAB",
  "BRAWL-BALL",
  "BOUNTY",
  "HEIST",
  "HOT-ZONE",
  "KNOCKOUT",
  "SIEGE",
  "WIPEOUT",
  "DUELS",
]);
const MODE_NAME_TO_DISPLAY: Record<string, string> = {
  "GEM-GRAB": "Gem Grab",
  "BRAWL-BALL": "Brawl Ball",
  BOUNTY: "Bounty",
  HEIST: "Heist",
  "HOT-ZONE": "Hot Zone",
  KNOCKOUT: "Knockout",
  SIEGE: "Siege",
  WIPEOUT: "Wipeout",
  DUELS: "Duels",
};
interface BrawlifyMap {
  id: number;
  name: string;
  hash: string;
  version: number;
  disabled?: boolean;
  gameMode?: {
    name?: string;
    scId?: number;
  };
  environment?: { name?: string };
}

interface BrawlifyMapsResponse {
  list?: BrawlifyMap[];
}

export interface MapSyncResult {
  fetched: number;
  filteredIn: number;
  created: number;
  updated: number;
  skipped: number;
  unmatchedModes: string[];
  errors: string[];
}

/**
 * Convert "Hard-Rock-Mine" → "Hard Rock Mine" to match the official
 * Brawl Stars API's map name format. We do this so BattleRecord.mapName
 * values match what's in the Map table.
 */
function normalizeMapName(raw: string): string {
  return raw.replace(/-/g, " ").trim();
}

async function fetchBrawlifyMaps(): Promise<BrawlifyMap[]> {
const res = await fetch("https://api.brawlify.com/v1/maps", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Brawlify API returned ${res.status}`);
  }
  const data = (await res.json()) as BrawlifyMapsResponse;
  if (!Array.isArray(data.list)) {
    throw new Error("Brawlify response missing 'list' array");
  }
  return data.list;
}

export async function syncMaps(prisma: PrismaClient): Promise<MapSyncResult> {
  const result: MapSyncResult = {
    fetched: 0,
    filteredIn: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    unmatchedModes: [],
    errors: [],
  };

  let rawMaps: BrawlifyMap[];
  try {
    rawMaps = await fetchBrawlifyMaps();
  } catch (e: any) {
    result.errors.push(`Brawlify fetch failed: ${e.message}`);
    return result;
  }

  result.fetched = rawMaps.length;

  const tracked = rawMaps.filter((m) => {
    const modeName = m.gameMode?.name?.toUpperCase().replace(/ /g, "-");
    if (!modeName) return false;
    return TRACKED_MODE_NAMES.has(modeName);
});
  result.filteredIn = tracked.length;

  const seenUntracked = new Set<string>();
  for (const m of rawMaps) {
const modeName = m.gameMode?.name?.toUpperCase().replace(/ /g, "-");
    if (modeName && !TRACKED_MODE_NAMES.has(modeName)) {
      seenUntracked.add(modeName);
    }
  }
  result.unmatchedModes = Array.from(seenUntracked).sort();

  // Load existing GameMode rows
  const existingModes = await prisma.gameMode.findMany();
  const modeByDisplayName: Record<string, string> = {};
  for (const gm of existingModes) {
    modeByDisplayName[gm.name] = gm.id;
  }

  for (const internalName of TRACKED_MODE_NAMES) {
    const displayName = MODE_NAME_TO_DISPLAY[internalName];
    if (!displayName) continue;
    if (!modeByDisplayName[displayName]) {
      const created = await prisma.gameMode.create({
        data: {
          name: displayName,
          icon: displayName.slice(0, 2).toUpperCase(),
        },
      });
      modeByDisplayName[displayName] = created.id;
    }
  }

  // Deduplicate by (normalized-name, mode) in case Brawlify returns
  // the same map twice (e.g. a reskin with the same canonical name).
  const seenKeys = new Set<string>();

  for (const m of tracked) {
const internalMode = m.gameMode?.name?.toUpperCase().replace(/ /g, "-");
    if (!internalMode) {
      result.skipped++;
      continue;
    }
    const displayMode = MODE_NAME_TO_DISPLAY[internalMode];
    if (!displayMode) {
      result.skipped++;
      continue;
    }
    const modeId = modeByDisplayName[displayMode];
    if (!modeId) {
      result.skipped++;
      continue;
    }

    const normalizedName = normalizeMapName(m.name);
    const dedupKey = `${modeId}::${normalizedName.toLowerCase()}`;
    if (seenKeys.has(dedupKey)) {
      result.skipped++;
      continue;
    }
    seenKeys.add(dedupKey);

    const isActive = m.disabled !== true;

    try {
      const existing = await prisma.map.findFirst({
        where: { name: normalizedName, gameModeId: modeId },
      });

      if (existing) {
        await prisma.map.update({
          where: { id: existing.id },
          data: { active: isActive },
        });
        result.updated++;
      } else {
        await prisma.map.create({
          data: {
            name: normalizedName,
            gameModeId: modeId,
            active: isActive,
          },
        });
        result.created++;
      }
    } catch (e: any) {
      result.errors.push(`Map "${m.name}": ${e.message}`);
    }
  }

  return result;
}
