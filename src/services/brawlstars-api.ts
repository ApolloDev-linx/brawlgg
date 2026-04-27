import { normalizeTag } from "@/lib/utils";

const BASE_URL = process.env.BRAWL_STARS_PROXY_URL || "https://api.brawlstars.com/v1";

interface RateLimitState {
  remaining: number;
  resetAt: number;
}

const rateLimit: RateLimitState = { remaining: 10, resetAt: 0 };

async function apiFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.BRAWL_STARS_API_KEY;
  if (!apiKey) {
    throw new Error("BRAWL_STARS_API_KEY is not set");
  }

  // Simple rate limiting
  if (rateLimit.remaining <= 0 && Date.now() < rateLimit.resetAt) {
    const waitMs = rateLimit.resetAt - Date.now();
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    next: { revalidate: 300 },
  });

  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining) rateLimit.remaining = parseInt(remaining, 10);
  if (reset) rateLimit.resetAt = parseInt(reset, 10) * 1000;

  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limited by Brawl Stars API");
    if (res.status === 404) throw new Error("Not found");
    throw new Error(`Brawl Stars API error: ${res.status}`);
  }

  return res.json();
}








export interface BSPlayer {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  expLevel: number;
  club?: { tag: string; name: string };
  "3vs3Victories": number;
  soloVictories: number;
  duoVictories: number;
  brawlers: BSPlayerBrawler[];
}

export interface BSPlayerBrawler {
  id: number;
  name: string;
  trophies: number;
  highestTrophies: number;
  power: number;
  rank: number;
}

export interface BSBrawler {
  id: number;
  name: string;
  starPowers: { id: number; name: string }[];
  gadgets: { id: number; name: string }[];
}

export interface BSLeaderboardPlayer {
  tag: string;
  name: string;
  trophies: number;
  rank: number;
  club?: { name: string };
}



export interface BSClubMember {
  tag: string;
  name: string;
  trophies: number;
  role: string;
}

export interface BSClub {
  tag: string;
  name: string;
  description: string;
  type: string;             // "open" | "inviteOnly" | "closed"
  badgeId: number;
  requiredTrophies: number;
  trophies: number;
  members: BSClubMember[];
}

export async function fetchClub(tag: string): Promise<BSClub> {
  const encoded = encodeURIComponent("#" + normalizeTag(tag));
  return apiFetch<BSClub>(`/clubs/${encoded}`);
}



export async function fetchPlayer(tag: string): Promise<BSPlayer> {
  const encoded = encodeURIComponent("#" + normalizeTag(tag));
  return apiFetch<BSPlayer>(`/players/${encoded}`);
}

export async function fetchPlayerBattleLog(tag: string): Promise<any> {
  const encoded = encodeURIComponent("#" + normalizeTag(tag));
  return apiFetch<any>(`/players/${encoded}/battlelog`);
}

export async function fetchBrawlers(): Promise<{ items: BSBrawler[] }> {
  return apiFetch<{ items: BSBrawler[] }>("/brawlers");
}

/**
 * Fetch top 200 players from the global leaderboard.
 * countryCode = "global" for worldwide, or "US", "GB", "KR" etc for regional
 */
export async function fetchLeaderboard(
  countryCode = "global"
): Promise<BSLeaderboardPlayer[]> {
  const data = await apiFetch<{ items: BSLeaderboardPlayer[] }>(
    `/rankings/${countryCode}/players?limit=200`
  );
  return data.items || [];
}

export async function healthCheck(): Promise<boolean> {
  try {
    await fetchBrawlers();
    return true;
  } catch {
    return false;
  }
}
