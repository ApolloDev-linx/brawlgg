/**
 * featured-data.ts
 *
 * Resolves the FeaturedCard configuration into live data:
 *   - Player tag → real name, trophies, club from Brawl Stars API
 *   - Club tags → real name, member count, trophies from API
 *
 * Failure modes:
 *   - No BRAWL_STARS_API_KEY: returns fallback shape (tag + blurb)
 *   - Single fetch fails (404, rate limit, network): that one slot
 *     falls back, the rest still resolve normally
 *   - Both fail: the slide is dropped from rotation in FeaturedCard
 *
 * Cached for 30 min — featured picks don't change minute-to-minute,
 * and the BS API rate-limits us so we keep traffic low.
 */

import { cached } from "@/lib/redis";
import { PLAYER_OF_MONTH, FEATURED_CLUBS } from "@/lib/featured";
import type { FeaturedClubConfig } from "@/lib/featured";

export interface ResolvedPlayer {
  tag: string;
  name: string;
  trophies?: number;
  highestTrophies?: number;
  clubName?: string;
  blurb?: string;
}

export interface ResolvedClub {
  tag: string;
  name: string;
  trophies?: number;
  memberCount?: number;
  requiredTrophies?: number;
  blurb?: string;
}

export interface FeaturedData {
  player: ResolvedPlayer | null;
  clubs: ResolvedClub[];
}

const FEATURED_TTL_SECONDS = 60 * 30; // 30 min

async function tryResolvePlayer(): Promise<ResolvedPlayer | null> {
  if (!PLAYER_OF_MONTH) return null;

  // Fallback shape — used when API key is missing or fetch fails.
  // Name defaults to tag so the slide still renders something readable.
  const fallback: ResolvedPlayer = {
    tag: PLAYER_OF_MONTH.tag,
    name: PLAYER_OF_MONTH.tag,
    blurb: PLAYER_OF_MONTH.blurb,
  };

  if (!process.env.BRAWL_STARS_API_KEY) return fallback;

  try {
    const { fetchPlayer } = await import("./brawlstars-api");
    const p = await fetchPlayer(PLAYER_OF_MONTH.tag);
    return {
      tag: p.tag,
      name: p.name,
      trophies: p.trophies,
      highestTrophies: p.highestTrophies,
      clubName: p.club?.name,
      blurb: PLAYER_OF_MONTH.blurb,
    };
  } catch (err) {
    console.warn(
      `[featured-data] Player ${PLAYER_OF_MONTH.tag} fetch failed:`,
      (err as Error).message
    );
    return fallback;
  }
}

async function tryResolveClub(
  cfg: FeaturedClubConfig
): Promise<ResolvedClub | null> {
  const fallback: ResolvedClub = {
    tag: cfg.tag,
    name: cfg.tag,
    blurb: cfg.blurb,
  };

  if (!process.env.BRAWL_STARS_API_KEY) return fallback;

  try {
    const { fetchClub } = await import("./brawlstars-api");
    const c = await fetchClub(cfg.tag);
    return {
      tag: c.tag,
      name: c.name,
      trophies: c.trophies,
      memberCount: c.members?.length,
      requiredTrophies: c.requiredTrophies,
      blurb: cfg.blurb,
    };
  } catch (err) {
    console.warn(
      `[featured-data] Club ${cfg.tag} fetch failed:`,
      (err as Error).message
    );
    return fallback;
  }
}

export async function getFeaturedData(): Promise<FeaturedData> {
  return cached("dashboard:featured:v1", FEATURED_TTL_SECONDS, async () => {
    // Fan out — single player + N clubs all resolve in parallel.
    // Each tryResolve* handles its own errors so one failure doesn't
    // tank the others.
    const [player, ...clubs] = await Promise.all([
      tryResolvePlayer(),
      ...FEATURED_CLUBS.map(tryResolveClub),
    ]);
    return {
      player,
      clubs: clubs.filter((c): c is ResolvedClub => c !== null),
    };
  });
}
