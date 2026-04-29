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
 *   We track traditional 3v3 competitive modes plus Wipeout and Duels.
 *   Novelty/event modes (Basket Brawl, Brawl Hockey, etc.) are filtered
 *   out. 2v2 and 5v5 variants of tracked modes are also excluded.
 *
 * Dupe prevention (paired with scripts/dedup-maps.ts):
 *   The lookup that decides "create vs update" normalizes both sides
 *   (lowercase, alphanumeric only) so casing and punctuation drift in
 *   the upstream API doesn't spawn duplicate Map rows. "Belles Rock"
 *   from Brawlify finds the existing "Belle's Rock" row; "out in the
 *   open" finds "Out In The Open"; etc.
 *
 *   We never update the `name` field on existing rows — once a row
 *   exists with a canonical spelling, that spelling sticks. Only
 *   imageUrl and active are refreshed. dedup-maps.ts is the one-time
 *   historical cleanup; this file is the durable guard against the
 *   issue recurring.
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
  imageUrl?: string;
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

/**
 * Strip casing and punctuation so duplicate-name detection survives the
 * upstream API flipping between "Belles Rock" and "Belle's Rock", etc.
 */
function normalizeLookupKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
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

  // Load existing GameMode rows; create any tracked modes that don't
  // exist yet (first run or new mode added to TRACKED_MODE_NAMES).
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

  // Pre-fetch all existing maps grouped by mode so the per-row lookup
  // doesn't hit the DB once per map. With ~10 modes and ~50-100 maps
  // each it's a few hundred rows in memory — trivial.
  const allExistingMaps = await prisma.map.findMany({
    select: { id: true, name: true, gameModeId: true },
  });
  const mapsByMode = new Map<string, { id: string; name: string }[]>();
  for (const m of allExistingMaps) {
    const arr = mapsByMode.get(m.gameModeId) ?? [];
    arr.push({ id: m.id, name: m.name });
    mapsByMode.set(m.gameModeId, arr);
  }

  // Deduplicate within Brawlify's own response. They occasionally return
  // the same map twice (reskins with the same canonical name).
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
    const lookupKey = normalizeLookupKey(normalizedName);
    const dedupKey = `${modeId}::${lookupKey}`;
    if (seenKeys.has(dedupKey)) {
      result.skipped++;
      continue;
    }
    seenKeys.add(dedupKey);

    const isActive = m.disabled !== true;

    try {
      const candidates = mapsByMode.get(modeId) ?? [];
      const existing = candidates.find(
        (c) => normalizeLookupKey(c.name) === lookupKey
      );

      if (existing) {
        await prisma.map.update({
          where: { id: existing.id },
          data: {
            active: isActive,
            imageUrl: m.imageUrl || null,
            // name intentionally NOT updated — canonical spelling sticks.
          },
        });
        result.updated++;
      } else {
        const created = await prisma.map.create({
          data: {
            name: normalizedName,
            gameModeId: modeId,
            active: isActive,
            imageUrl: m.imageUrl || null,
          },
        });
        // Keep the in-memory cache fresh so a later iteration with the
        // same lookup key (Brawlify returning two near-identical names)
        // matches the row we just made instead of creating a second.
        const arr = mapsByMode.get(modeId) ?? [];
        arr.push({ id: created.id, name: normalizedName });
        mapsByMode.set(modeId, arr);
        result.created++;
      }
    } catch (e: any) {
      result.errors.push(`Map "${m.name}": ${e.message}`);
    }
  }

  return result;
}
