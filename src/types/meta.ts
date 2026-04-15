import { Tier } from "./brawler";

export interface MetaSnapshot {
  brawlerId: string;
  brawlerName: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: Tier;
  snapshotDate: string;
}

export interface MetaOverview {
  totalBrawlers: number;
  avgWinRate: number;
  mostBanned: { name: string; banRate: number };
  mostPicked: { name: string; pickRate: number };
  topWinRates: MetaSnapshot[];
  topPicked: MetaSnapshot[];
  topBanned: MetaSnapshot[];
}

export interface DraftState {
  bans: string[];
  myPicks: string[];
  enemyPicks: string[];
  currentPhase: "ban" | "pick";
  currentTurn: "my" | "enemy";
}
