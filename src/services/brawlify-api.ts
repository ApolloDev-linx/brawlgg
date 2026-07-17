const BASE_URL = "https://api.brawlapi.com/v1";
const FETCH_TIMEOUT_MS = 30_000;

async function apiFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      throw new Error(`Brawlify API ${res.status}: ${res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export interface BrawlifyBrawler {
  id: number;
  avatarId: number;
  name: string;
  hash: string;
  path: string;
  released: boolean;
  version: number;
  link: string;
  imageUrl: string;
  imageUrl2: string;
  imageUrl3: string;
  class: { id: number; name: string };
  rarity: { id: number; name: string; color: string };
  unlock: number | null;
  description: string;
  starPowers?: { id: number; name: string; description: string }[];
  gadgets?: { id: number; name: string; description: string }[];
}

export interface BrawlifyMap {
  id: number;
  new: boolean;
  disabled: boolean;
  name: string;
  hash: string;
  version: number;
  link: string;
  imageUrl: string;
  environment: {
    id: number; name: string; hash: string; path: string;
    version: number; imageUrl: string;
  };
  gameMode: {
    id: number; name: string; hash: string; version: number;
    color: string; link: string; imageUrl: string;
  };
  lastActive: number;
  dataUpdated: number;
}

export interface BrawlifyEvent {
  slot: { id: number; name: string; hash: string };
  predicted: boolean;
  startTime: string;
  endTime: string;
  reward: number;
  map: BrawlifyMap;
  modifier: string | null;
}

export async function fetchBrawlers(): Promise<BrawlifyBrawler[]> {
  const data = await apiFetch<{ list: BrawlifyBrawler[] }>("/brawlers");
  return data.list || [];
}

export async function fetchMaps(): Promise<BrawlifyMap[]> {
  const data = await apiFetch<{ list: BrawlifyMap[] }>("/maps");
  return data.list || [];
}

export async function fetchEvents(): Promise<{
  active: BrawlifyEvent[];
  upcoming: BrawlifyEvent[];
}> {
  return apiFetch("/events");
}

export async function healthCheck(): Promise<boolean> {
  try {
    const brawlers = await fetchBrawlers();
    return brawlers.length > 0;
  } catch {
    return false;
  }
}
