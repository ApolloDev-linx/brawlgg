export type BrawlerType = "lane" | "tank" | "assassin" | "thrower" | "sniper";

export type Tier = "S" | "A" | "B" | "C";

export type PickCategory = "first_pick" | "safe" | "high_risk";

export interface Brawler {
  id: string;
  name: string;
  role: string;
  type: BrawlerType;
  hp: number;
  iconUrl: string | null;
  externalId: number | null;
}

export interface BrawlerWithStats extends Brawler {
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: Tier;
}

export interface BrawlerCounter extends BrawlerWithStats {
  counterScore: number;
  reasons: string[];
}
