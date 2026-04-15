/**
 * Brawlify community API client.
 * https://brawlapi.com/ -- free, no auth required.
 * Used as a fallback and for community stats data.
 */

const BASE_URL = "https://api.brawlapi.com/v1";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    throw new Error(`Brawlify API error: ${res.status}`);
  }

  return res.json();
}

export interface BrawlifyBrawler {
  id: number;
  name: string;
  hash: string;
  path: string;
  imageUrl: string;
  imageUrl2: string;
  imageUrl3: string;
  class: { id: number; name: string };
  rarity: { id: number; name: string; color: string };
  description: string;
}

export interface BrawlifyMap {
  id: number;
  name: string;
  hash: string;
  imageUrl: string;
  environment: { id: number; name: string; hash: string; imageUrl: string };
  gameMode: { id: number; name: string; hash: string; imageUrl: string };
  lastActive: number;
}

export interface BrawlifyEvent {
  slot: { id: number; name: string };
  startTime: string;
  endTime: string;
  map: BrawlifyMap;
}

export async function fetchBrawlers(): Promise<{ list: BrawlifyBrawler[] }> {
  return apiFetch<{ list: BrawlifyBrawler[] }>("/brawlers");
}

export async function fetchMaps(): Promise<{ list: BrawlifyMap[] }> {
  return apiFetch<{ list: BrawlifyMap[] }>("/maps");
}

export async function fetchEvents(): Promise<{ active: BrawlifyEvent[]; upcoming: BrawlifyEvent[] }> {
  return apiFetch<{ active: BrawlifyEvent[]; upcoming: BrawlifyEvent[] }>("/events");
}

export async function fetchIcons(): Promise<any> {
  return apiFetch<any>("/icons");
}
