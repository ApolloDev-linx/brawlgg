import { BrawlerWithStats } from "./brawler";

export interface GameMode {
  id: string;
  name: string;
  icon: string;
}

export interface MapData {
  id: string;
  name: string;
  gameModeId: string;
  imageUrl: string | null;
  active: boolean;
  gameMode: GameMode;
}

export interface MapWithStats extends MapData {
  brawlerStats: MapBrawlerStat[];
  bestFirstPick?: MapBrawlerStat;
  safePicks: MapBrawlerStat[];
  highRiskPicks: MapBrawlerStat[];
}

export interface MapBrawlerStat {
  id: string;
  mapId: string;
  brawlerId: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: string;
  pickCategory: string | null;
  brawler: BrawlerWithStats;
}
