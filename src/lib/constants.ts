import { BrawlerType, Tier } from "@/types/brawler";

// Tier thresholds based on win rate
export const TIER_THRESHOLDS: Record<Tier, { min: number; max: number }> = {
  S: { min: 54, max: 100 },
  A: { min: 51, max: 54 },
  B: { min: 48, max: 51 },
  C: { min: 0, max: 48 },
};

export function getTier(winRate: number): Tier {
  if (winRate >= TIER_THRESHOLDS.S.min) return "S";
  if (winRate >= TIER_THRESHOLDS.A.min) return "A";
  if (winRate >= TIER_THRESHOLDS.B.min) return "B";
  return "C";
}

// Competitive triangle
export const COUNTER_MATRIX: Record<
  BrawlerType,
  { strongVs: BrawlerType[]; weakVs: BrawlerType[]; description: string }
> = {
  lane: {
    strongVs: ["tank", "assassin"],
    weakVs: ["thrower", "sniper"],
    description:
      "Lanes control the mid-field with consistent damage and zone pressure. They punish tanks that try to push forward and assassins that overextend.",
  },
  tank: {
    strongVs: ["thrower", "sniper"],
    weakVs: ["lane"],
    description:
      "Tanks close distance and overwhelm fragile backline brawlers. Throwers and snipers lack the burst or HP to survive a tank rush.",
  },
  assassin: {
    strongVs: ["thrower", "sniper"],
    weakVs: ["lane", "tank"],
    description:
      "Assassins dive the backline and eliminate squishy targets. However, they struggle against sustained lane damage and tank HP pools.",
  },
  thrower: {
    strongVs: ["lane"],
    weakVs: ["tank", "assassin"],
    description:
      "Throwers deny area from safety behind walls, making it difficult for lane brawlers to advance. But they collapse under close-range dive.",
  },
  sniper: {
    strongVs: ["lane"],
    weakVs: ["tank", "assassin"],
    description:
      "Snipers outrange and outpoke lane brawlers from safe positions. They are vulnerable to gap-closers who can survive the approach.",
  },
};

// Type display names and colors
export const TYPE_LABELS: Record<BrawlerType, string> = {
  lane: "Lane / Control",
  tank: "Tank",
  assassin: "Assassin",
  thrower: "Thrower",
  sniper: "Sniper",
};

export const TYPE_COLORS: Record<BrawlerType, string> = {
  lane: "#5DCAA5",
  tank: "#F09595",
  assassin: "#ED93B1",
  thrower: "#FAC775",
  sniper: "#85B7EB",
};

export const TIER_COLORS: Record<Tier, string> = {
  S: "#EF9F27",
  A: "#5DCAA5",
  B: "#85B7EB",
  C: "#B4B2A9",
};

// Game mode icons (text-based, swap for actual icons in production)
export const MODE_ICONS: Record<string, string> = {
  "Gem Grab": "GG",
  "Brawl Ball": "BB",
  Bounty: "BY",
  Heist: "HT",
  "Hot Zone": "HZ",
  Knockout: "KO",
  Siege: "SG",
};

// Seed data for initial brawlers
export const SEED_BRAWLERS = [
  // STARTERS / TROPHY ROAD CORE
  { name: "Shelly", role: "Damage", type: "lane" as BrawlerType, hp: 5320 },
  { name: "Nita", role: "Damage", type: "lane" as BrawlerType, hp: 5600 },
  { name: "Colt", role: "Damage", type: "sniper" as BrawlerType, hp: 3920 },
  { name: "Bull", role: "Tank", type: "tank" as BrawlerType, hp: 7000 },
  { name: "Brock", role: "Sniper", type: "sniper" as BrawlerType, hp: 3640 },
  { name: "El Primo", role: "Tank", type: "tank" as BrawlerType, hp: 8120 },
  { name: "Barley", role: "Thrower", type: "thrower" as BrawlerType, hp: 3640 },
  { name: "Poco", role: "Support", type: "lane" as BrawlerType, hp: 5320 },
  { name: "Rosa", role: "Tank", type: "tank" as BrawlerType, hp: 7560 },
  { name: "Jessie", role: "Damage", type: "lane" as BrawlerType, hp: 4480 },
  { name: "Dynamike", role: "Thrower", type: "thrower" as BrawlerType, hp: 3640 },
  { name: "Tick", role: "Thrower", type: "thrower" as BrawlerType, hp: 3080 },
  { name: "8-Bit", role: "Damage", type: "lane" as BrawlerType, hp: 6020 },
  { name: "Emz", role: "Control", type: "lane" as BrawlerType, hp: 5040 },
  { name: "Stu", role: "Assassin", type: "assassin" as BrawlerType, hp: 3920 },

  // RARES / SUPER RARES
  { name: "Penny", role: "Control", type: "lane" as BrawlerType, hp: 4480 },
  { name: "Carl", role: "Damage", type: "lane" as BrawlerType, hp: 6160 },
  { name: "Jacky", role: "Tank", type: "tank" as BrawlerType, hp: 7000 },
  { name: "Gus", role: "Support", type: "lane" as BrawlerType, hp: 4800 },

  // EPICS
  { name: "Bo", role: "Control", type: "lane" as BrawlerType, hp: 5600 },
  { name: "Piper", role: "Sniper", type: "sniper" as BrawlerType, hp: 3360 },
  { name: "Pam", role: "Support", type: "lane" as BrawlerType, hp: 6720 },
  { name: "Frank", role: "Tank", type: "tank" as BrawlerType, hp: 9800 },
  { name: "Bibi", role: "Tank", type: "tank" as BrawlerType, hp: 7000 },
  { name: "Bea", role: "Sniper", type: "sniper" as BrawlerType, hp: 3000 },
  { name: "Nani", role: "Sniper", type: "sniper" as BrawlerType, hp: 3360 },
  { name: "Edgar", role: "Assassin", type: "assassin" as BrawlerType, hp: 4200 },
  { name: "Griff", role: "Damage", type: "lane" as BrawlerType, hp: 5600 },
  { name: "Grom", role: "Thrower", type: "thrower" as BrawlerType, hp: 4200 },
  { name: "Bonnie", role: "Damage", type: "assassin" as BrawlerType, hp: 4800 },
  { name: "Hank", role: "Tank", type: "tank" as BrawlerType, hp: 9000 },

  // MYTHICS
  { name: "Mortis", role: "Assassin", type: "assassin" as BrawlerType, hp: 5320 },
  { name: "Tara", role: "Damage", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Gene", role: "Support", type: "lane" as BrawlerType, hp: 5040 },
  { name: "Max", role: "Support", type: "lane" as BrawlerType, hp: 4480 },
  { name: "Mr. P", role: "Control", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Sprout", role: "Thrower", type: "thrower" as BrawlerType, hp: 4200 },
  { name: "Byron", role: "Support", type: "lane" as BrawlerType, hp: 3360 },
  { name: "Squeak", role: "Control", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Gray", role: "Support", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Willow", role: "Control", type: "thrower" as BrawlerType, hp: 4200 },
  { name: "Doug", role: "Support", type: "tank" as BrawlerType, hp: 7200 },

  // LEGENDARIES
  { name: "Spike", role: "Damage", type: "lane" as BrawlerType, hp: 3640 },
  { name: "Crow", role: "Assassin", type: "assassin" as BrawlerType, hp: 3920 },
  { name: "Leon", role: "Assassin", type: "assassin" as BrawlerType, hp: 4480 },
  { name: "Sandy", role: "Support", type: "lane" as BrawlerType, hp: 5040 },
  { name: "Amber", role: "Damage", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Meg", role: "Damage", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Chester", role: "Control", type: "lane" as BrawlerType, hp: 5200 },

  // CHROMATICS / NEW ERA (merged rarity system)
  { name: "Gale", role: "Support", type: "lane" as BrawlerType, hp: 5040 },
  { name: "Surge", role: "Damage", type: "assassin" as BrawlerType, hp: 4200 },
  { name: "Colette", role: "Damage", type: "lane" as BrawlerType, hp: 4760 },
  { name: "Lou", role: "Control", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Ruffs", role: "Support", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Belle", role: "Sniper", type: "sniper" as BrawlerType, hp: 3360 },
  { name: "Buzz", role: "Assassin", type: "assassin" as BrawlerType, hp: 6000 },
  { name: "Ash", role: "Tank", type: "tank" as BrawlerType, hp: 8400 },
  { name: "Lola", role: "Damage", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Fang", role: "Assassin", type: "assassin" as BrawlerType, hp: 5600 },
  { name: "Eve", role: "Control", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Janet", role: "Damage", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Otis", role: "Control", type: "lane" as BrawlerType, hp: 4800 },
  { name: "Sam", role: "Tank", type: "tank" as BrawlerType, hp: 8000 },
  { name: "Buster", role: "Tank", type: "tank" as BrawlerType, hp: 7000 },
  { name: "Mandy", role: "Sniper", type: "sniper" as BrawlerType, hp: 3200 },
  { name: "R-T", role: "Damage", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Maisie", role: "Damage", type: "lane" as BrawlerType, hp: 5200 },
  { name: "Cordelius", role: "Assassin", type: "assassin" as BrawlerType, hp: 4800 },
  { name: "Pearl", role: "Damage", type: "lane" as BrawlerType, hp: 7200 },
  { name: "Charlie", role: "Control", type: "lane" as BrawlerType, hp: 4200 },
  { name: "Mico", role: "Assassin", type: "assassin" as BrawlerType, hp: 3000 },
  { name: "Kit", role: "Support", type: "assassin" as BrawlerType, hp: 4000 },
  // ULTRA
  {name: "Kaze", role: "Assassin", type: "assassin" as BrawlerType, hp:8200},
  {name: "Sirus", role: "Control", type: "lane" as BrawlerType, hp:7400},
];
export const SEED_MODES = [
  { name: "Gem Grab", icon: "GG" },
  { name: "Brawl Ball", icon: "BB" },
  { name: "Bounty", icon: "BY" },
  { name: "Heist", icon: "HT" },
  { name: "Hot Zone", icon: "HZ" },
  { name: "Knockout", icon: "KO" },
  { name: "Siege", icon: "SG" },
];

export const SEED_MAPS = [
  // ★ GEM GRAB
  { name: "Hard Rock Mine", mode: "Gem Grab" },
  { name: "Undermine", mode: "Gem Grab" },
  { name: "Double Swoosh", mode: "Gem Grab" },
  { name: "Crystal Arcade", mode: "Gem Grab" },
  { name: "Minecart Madness", mode: "Gem Grab" },
  { name: "Gem Fort", mode: "Gem Grab" },
  { name: "Last Stop", mode: "Gem Grab" },

  // ★ BRAWL BALL
  { name: "Backyard Bowl", mode: "Brawl Ball" },
  { name: "Super Beach", mode: "Brawl Ball" },
  { name: "Center Stage", mode: "Brawl Ball" },
  { name: "Pinball Dreams", mode: "Brawl Ball" },
  { name: "Sneaky Fields", mode: "Brawl Ball" },
  { name: "Field Goal", mode: "Brawl Ball" },
  { name: "Triple Dribble", mode: "Brawl Ball" },

  // ★ BOUNTY
  { name: "Shooting Star", mode: "Bounty" },
  { name: "Canal Grande", mode: "Bounty" },
  { name: "Layer Cake", mode: "Bounty" },
  { name: "Dry Season", mode: "Bounty" },
  { name: "Excel", mode: "Bounty" },
  { name: "Snake Prairie", mode: "Bounty" },

  // ★ HEIST
  { name: "Safe Zone", mode: "Heist" },
  { name: "Kaboom Canyon", mode: "Heist" },
  { name: "Hot Potato", mode: "Heist" },
  { name: "Bridge Too Far", mode: "Heist" },
  { name: "Pit Stop", mode: "Heist" },
  { name: "Split", mode: "Heist" },

  // ★ HOT ZONE
  { name: "Dueling Beetles", mode: "Hot Zone" },
  { name: "Ring of Fire", mode: "Hot Zone" },
  { name: "Open Zone", mode: "Hot Zone" },
  { name: "Parallel Plays", mode: "Hot Zone" },

  // ★ KNOCKOUT
  { name: "Belle's Rock", mode: "Knockout" },
  { name: "Goldarm Gulch", mode: "Knockout" },
  { name: "Out in the Open", mode: "Knockout" },
  { name: "Flaring Phoenix", mode: "Knockout" },
  { name: "Ends Meet", mode: "Knockout" },

  // ★ WIPEOUT (NEWER MODE)
  { name: "Infinite Doom", mode: "Wipeout" },
  { name: "Friendly Fire", mode: "Wipeout" },

  // ★ DUELS
  { name: "Monkey Maze", mode: "Duels" },
  { name: "No Surrender", mode: "Duels" },

  // ★ SHOWDOWN
  { name: "Feast or Famine", mode: "Showdown" },
  { name: "Cavern Churn", mode: "Showdown" },
  { name: "Dark Passage", mode: "Showdown" },
  { name: "Skull Creek", mode: "Showdown" },
  { name: "Stormy Plains", mode: "Showdown" },
  { name: "Rockwall Brawl", mode: "Showdown" },

  //  REMOVED / LEGACY (historical data)
  { name: "Nuts & Bolts", mode: "Siege" }, // legacy
];
// Cache TTLs in seconds
export const CACHE_TTL = {
  MAPS: 900, // 15 min
  BRAWLERS: 900,
  PLAYER: 300, // 5 min
  META: 1800, // 30 min
  TRENDS: 3600, // 1 hr
};
