export type Playstyle = "aggressive" | "passive" | "balanced";

export interface Player {
  id: string;
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  clubName: string | null;
  playstyle: Playstyle | null;
  lastSynced: Date;
}

export interface PlayerProfile extends Player {
  brawlers: PlayerBrawler[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface PlayerBrawler {
  brawlerId: string;
  brawlerName: string;
  brawlerType: string;
  brawlerIcon: string | null;
  trophies: number;
  powerLevel: number;
  personalWinRate: number | null;
}
