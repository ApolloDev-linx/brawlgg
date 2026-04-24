"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAWLER_TYPE_OVERRIDES = exports.CLASS_TO_ROLE = exports.CLASS_TO_TYPE = exports.CACHE_TTL = exports.SEED_MAPS = exports.SEED_MODES = exports.SEED_BRAWLERS = exports.MODE_ICONS = exports.TIER_COLORS = exports.TYPE_COLORS = exports.TYPE_LABELS = exports.COUNTER_MATRIX = exports.TIER_THRESHOLDS = void 0;
exports.getTier = getTier;
// Tier thresholds based on win rate
exports.TIER_THRESHOLDS = {
    S: { min: 54, max: 100 },
    A: { min: 51, max: 54 },
    B: { min: 48, max: 51 },
    C: { min: 0, max: 48 },
};
function getTier(winRate) {
    if (winRate >= exports.TIER_THRESHOLDS.S.min)
        return "S";
    if (winRate >= exports.TIER_THRESHOLDS.A.min)
        return "A";
    if (winRate >= exports.TIER_THRESHOLDS.B.min)
        return "B";
    return "C";
}
// Competitive triangle
exports.COUNTER_MATRIX = {
    lane: {
        strongVs: ["tank", "assassin"],
        weakVs: ["thrower", "sniper"],
        description: "Lanes control the mid-field with consistent damage and zone pressure. They punish tanks that try to push forward and assassins that overextend.",
    },
    tank: {
        strongVs: ["thrower", "sniper"],
        weakVs: ["lane"],
        description: "Tanks close distance and overwhelm fragile backline brawlers. Throwers and snipers lack the burst or HP to survive a tank rush.",
    },
    assassin: {
        strongVs: ["thrower", "sniper"],
        weakVs: ["lane", "tank"],
        description: "Assassins dive the backline and eliminate squishy targets. However, they struggle against sustained lane damage and tank HP pools.",
    },
    thrower: {
        strongVs: ["lane"],
        weakVs: ["tank", "assassin"],
        description: "Throwers deny area from safety behind walls, making it difficult for lane brawlers to advance. But they collapse under close-range dive.",
    },
    sniper: {
        strongVs: ["lane"],
        weakVs: ["tank", "assassin"],
        description: "Snipers outrange and outpoke lane brawlers from safe positions. They are vulnerable to gap-closers who can survive the approach.",
    },
};
// Type display names and colors
exports.TYPE_LABELS = {
    lane: "Lane / Control",
    tank: "Tank",
    assassin: "Assassin",
    thrower: "Thrower",
    sniper: "Sniper",
};
exports.TYPE_COLORS = {
    lane: "#5DCAA5",
    tank: "#F09595",
    assassin: "#ED93B1",
    thrower: "#FAC775",
    sniper: "#85B7EB",
};
exports.TIER_COLORS = {
    S: "#EF9F27",
    A: "#5DCAA5",
    B: "#85B7EB",
    C: "#B4B2A9",
};
// Game mode icons (text-based, swap for actual icons in production)
exports.MODE_ICONS = {
    "Gem Grab": "GG",
    "Brawl Ball": "BB",
    Bounty: "BY",
    Heist: "HT",
    "Hot Zone": "HZ",
    Knockout: "KO",
    Siege: "SG",
};
// Seed data for initial brawlers
exports.SEED_BRAWLERS = [
    // STARTERS / TROPHY ROAD CORE
    { name: "Shelly", role: "Damage", type: "lane", hp: 5320 },
    { name: "Nita", role: "Damage", type: "lane", hp: 5600 },
    { name: "Colt", role: "Damage", type: "sniper", hp: 3920 },
    { name: "Bull", role: "Tank", type: "tank", hp: 7000 },
    { name: "Brock", role: "Sniper", type: "sniper", hp: 3640 },
    { name: "El Primo", role: "Tank", type: "tank", hp: 8120 },
    { name: "Barley", role: "Thrower", type: "thrower", hp: 3640 },
    { name: "Poco", role: "Support", type: "lane", hp: 5320 },
    { name: "Rosa", role: "Tank", type: "tank", hp: 7560 },
    { name: "Jessie", role: "Damage", type: "lane", hp: 4480 },
    { name: "Dynamike", role: "Thrower", type: "thrower", hp: 3640 },
    { name: "Tick", role: "Thrower", type: "thrower", hp: 3080 },
    { name: "8-Bit", role: "Damage", type: "lane", hp: 6020 },
    { name: "Emz", role: "Control", type: "lane", hp: 5040 },
    { name: "Stu", role: "Assassin", type: "assassin", hp: 3920 },
    // RARES / SUPER RARES
    { name: "Penny", role: "Control", type: "lane", hp: 4480 },
    { name: "Carl", role: "Damage", type: "lane", hp: 6160 },
    { name: "Jacky", role: "Tank", type: "tank", hp: 7000 },
    { name: "Gus", role: "Support", type: "lane", hp: 4800 },
    // EPICS
    { name: "Bo", role: "Control", type: "lane", hp: 5600 },
    { name: "Piper", role: "Sniper", type: "sniper", hp: 3360 },
    { name: "Pam", role: "Support", type: "lane", hp: 6720 },
    { name: "Frank", role: "Tank", type: "tank", hp: 9800 },
    { name: "Bibi", role: "Tank", type: "tank", hp: 7000 },
    { name: "Bea", role: "Sniper", type: "sniper", hp: 3000 },
    { name: "Nani", role: "Sniper", type: "sniper", hp: 3360 },
    { name: "Edgar", role: "Assassin", type: "assassin", hp: 4200 },
    { name: "Griff", role: "Damage", type: "lane", hp: 5600 },
    { name: "Grom", role: "Thrower", type: "thrower", hp: 4200 },
    { name: "Bonnie", role: "Damage", type: "assassin", hp: 4800 },
    { name: "Hank", role: "Tank", type: "tank", hp: 9000 },
    // MYTHICS
    { name: "Mortis", role: "Assassin", type: "assassin", hp: 5320 },
    { name: "Tara", role: "Damage", type: "lane", hp: 4200 },
    { name: "Gene", role: "Support", type: "lane", hp: 5040 },
    { name: "Max", role: "Support", type: "lane", hp: 4480 },
    { name: "Mr. P", role: "Control", type: "lane", hp: 4200 },
    { name: "Sprout", role: "Thrower", type: "thrower", hp: 4200 },
    { name: "Byron", role: "Support", type: "lane", hp: 3360 },
    { name: "Squeak", role: "Control", type: "lane", hp: 4800 },
    { name: "Gray", role: "Support", type: "lane", hp: 4200 },
    { name: "Willow", role: "Control", type: "thrower", hp: 4200 },
    { name: "Doug", role: "Support", type: "tank", hp: 7200 },
    // LEGENDARIES
    { name: "Spike", role: "Damage", type: "lane", hp: 3640 },
    { name: "Crow", role: "Assassin", type: "assassin", hp: 3920 },
    { name: "Leon", role: "Assassin", type: "assassin", hp: 4480 },
    { name: "Sandy", role: "Support", type: "lane", hp: 5040 },
    { name: "Amber", role: "Damage", type: "lane", hp: 4200 },
    { name: "Meg", role: "Damage", type: "lane", hp: 4800 },
    { name: "Chester", role: "Control", type: "lane", hp: 5200 },
    // CHROMATICS / NEW ERA (merged rarity system)
    { name: "Gale", role: "Support", type: "lane", hp: 5040 },
    { name: "Surge", role: "Damage", type: "assassin", hp: 4200 },
    { name: "Colette", role: "Damage", type: "lane", hp: 4760 },
    { name: "Lou", role: "Control", type: "lane", hp: 4200 },
    { name: "Ruffs", role: "Support", type: "lane", hp: 4200 },
    { name: "Belle", role: "Sniper", type: "sniper", hp: 3360 },
    { name: "Buzz", role: "Assassin", type: "assassin", hp: 6000 },
    { name: "Ash", role: "Tank", type: "tank", hp: 8400 },
    { name: "Lola", role: "Damage", type: "lane", hp: 4800 },
    { name: "Fang", role: "Assassin", type: "assassin", hp: 5600 },
    { name: "Eve", role: "Control", type: "lane", hp: 4800 },
    { name: "Janet", role: "Damage", type: "lane", hp: 4800 },
    { name: "Otis", role: "Control", type: "lane", hp: 4800 },
    { name: "Sam", role: "Tank", type: "tank", hp: 8000 },
    { name: "Buster", role: "Tank", type: "tank", hp: 7000 },
    { name: "Mandy", role: "Sniper", type: "sniper", hp: 3200 },
    { name: "R-T", role: "Damage", type: "lane", hp: 4200 },
    { name: "Maisie", role: "Damage", type: "lane", hp: 5200 },
    { name: "Cordelius", role: "Assassin", type: "assassin", hp: 4800 },
    { name: "Pearl", role: "Damage", type: "lane", hp: 7200 },
    { name: "Charlie", role: "Control", type: "lane", hp: 4200 },
    { name: "Mico", role: "Assassin", type: "assassin", hp: 3000 },
    { name: "Kit", role: "Support", type: "assassin", hp: 4000 },
    // ULTRA
    { name: "Kaze", role: "Assassin", type: "assassin", hp: 8200 },
    { name: "Sirus", role: "Control", type: "lane", hp: 7400 },
];
exports.SEED_MODES = [
    { name: "Gem Grab", icon: "GG" },
    { name: "Brawl Ball", icon: "BB" },
    { name: "Bounty", icon: "BY" },
    { name: "Heist", icon: "HT" },
    { name: "Hot Zone", icon: "HZ" },
    { name: "Knockout", icon: "KO" },
    { name: "Siege", icon: "SG" },
];
exports.SEED_MAPS = [
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
exports.CACHE_TTL = {
    MAPS: 900, // 15 min
    BRAWLERS: 900,
    PLAYER: 300, // 5 min
    META: 1800, // 30 min
    TRENDS: 3600, // 1 hr
};
// =============================================================================
// BRAWLER CLASSIFICATION — Authoritative Source of Truth
// =============================================================================
// These constants replace the duplicated maps in brawler-sync.ts and seed.ts.
// BRAWLER_TYPE_OVERRIDES is the authoritative mapping — when the harvest runs,
// role/type come from HERE, not from the Brawlify API class field. The API
// class field is only used as a LAST RESORT for brawlers not yet in this list.
// =============================================================================
// Fallback class mapping (used only when a brawler is NOT in BRAWLER_TYPE_OVERRIDES)
// Includes both current Supercell class names and legacy names for safety.
exports.CLASS_TO_TYPE = {
    // current names
    "damage dealer": "lane",
    "tank": "tank", // <-- CRITICAL: Supercell renamed Heavyweight -> Tank
    "marksman": "sniper",
    "artillery": "thrower",
    "controller": "lane",
    "assassin": "assassin",
    "support": "lane",
    // legacy names (kept for backwards compat)
    "heavyweight": "tank",
    "sharpshooter": "sniper",
    "thrower": "thrower",
    "fighter": "lane",
    "skirmisher": "lane",
};
exports.CLASS_TO_ROLE = {
    "damage dealer": "Damage",
    "tank": "Tank",
    "marksman": "Sniper",
    "artillery": "Thrower",
    "controller": "Control",
    "assassin": "Assassin",
    "support": "Support",
    "heavyweight": "Tank",
    "sharpshooter": "Sniper",
    "thrower": "Thrower",
    "fighter": "Damage",
    "skirmisher": "Damage",
};
// AUTHORITATIVE role/type per brawler.
// Keys MUST match the normalized title-case name the sync produces.
// For hybrids, we pick the PRIMARY type and note the secondary in a comment.
// To add a new brawler: add a line here. To correct a classification: edit here.
exports.BRAWLER_TYPE_OVERRIDES = {
    // --- Starters / Trophy Road ---
    "Shelly": { role: "Damage", type: "lane" },
    "Nita": { role: "Damage", type: "lane" },
    "Colt": { role: "Sniper", type: "sniper" },
    "Bull": { role: "Tank", type: "tank" },
    "Brock": { role: "Sniper", type: "sniper" },
    "El Primo": { role: "Tank", type: "tank" },
    "Barley": { role: "Thrower", type: "thrower" },
    "Poco": { role: "Support", type: "lane" },
    "Rosa": { role: "Tank", type: "tank" },
    "Jessie": { role: "Damage", type: "lane" },
    "Dynamike": { role: "Thrower", type: "thrower" },
    "Tick": { role: "Thrower", type: "thrower" },
    "8-Bit": { role: "Damage", type: "lane" },
    "Emz": { role: "Control", type: "lane" },
    "Stu": { role: "Assassin", type: "assassin" },
    "Rico": { role: "Damage", type: "lane" },
    "Darryl": { role: "Tank", type: "tank", hybrid: "tank + assassin" },
    // --- Rare / Super Rare ---
    "Penny": { role: "Control", type: "lane" },
    "Carl": { role: "Damage", type: "lane" },
    "Jacky": { role: "Tank", type: "tank" },
    "Gus": { role: "Support", type: "lane" },
    // --- Epics ---
    "Bo": { role: "Control", type: "lane" },
    "Piper": { role: "Sniper", type: "sniper" },
    "Pam": { role: "Support", type: "lane" },
    "Frank": { role: "Tank", type: "tank" },
    "Bibi": { role: "Tank", type: "tank" },
    "Bea": { role: "Sniper", type: "sniper" },
    "Nani": { role: "Sniper", type: "sniper" },
    "Edgar": { role: "Assassin", type: "assassin" },
    "Griff": { role: "Damage", type: "lane" },
    "Grom": { role: "Thrower", type: "thrower" },
    "Bonnie": { role: "Damage", type: "lane", hybrid: "damage + marksman (2nd form)" },
    "Hank": { role: "Tank", type: "tank" },
    // --- Mythics ---
    "Mortis": { role: "Assassin", type: "assassin" },
    "Tara": { role: "Damage", type: "lane" },
    "Gene": { role: "Support", type: "lane" },
    "Max": { role: "Support", type: "lane" },
    "Mr. P": { role: "Control", type: "lane" },
    "Sprout": { role: "Thrower", type: "thrower" },
    "Byron": { role: "Support", type: "lane" },
    "Squeak": { role: "Control", type: "lane" },
    "Gray": { role: "Support", type: "lane" },
    "Willow": { role: "Thrower", type: "thrower" },
    "Doug": { role: "Tank", type: "tank", hybrid: "support + tank" },
    "Otis": { role: "Control", type: "lane" },
    "Sam": { role: "Assassin", type: "assassin" },
    "Buster": { role: "Tank", type: "tank" },
    "Mandy": { role: "Sniper", type: "sniper" },
    "R-T": { role: "Damage", type: "lane" },
    "Maisie": { role: "Sniper", type: "sniper" },
    "Cordelius": { role: "Assassin", type: "assassin" },
    "Pearl": { role: "Damage", type: "lane" },
    "Charlie": { role: "Control", type: "lane" },
    "Mico": { role: "Assassin", type: "assassin" },
    "Kit": { role: "Support", type: "lane", hybrid: "support + assassin" },
    "Melodie": { role: "Assassin", type: "assassin" },
    "Lily": { role: "Assassin", type: "assassin" },
    "Angelo": { role: "Sniper", type: "sniper" },
    "Draco": { role: "Tank", type: "tank" },
    "Berry": { role: "Support", type: "thrower", hybrid: " support + thrower" },
    "Clancy": { role: "Damage", type: "lane" },
    "Moe": { role: "Damage", type: "lane" },
    "Kenji": { role: "Assassin", type: "assassin" },
    "Larry & Lawrie": { role: "Thrower", type: "thrower" },
    "Juju": { role: "Thrower", type: "thrower" },
    "Meeple": { role: "Control", type: "lane" },
    "Ollie": { role: "Tank", type: "tank" },
    "Finx": { role: "Control", type: "lane" },
    "Shade": { role: "Assassin", type: "assassin" },
    "Lumi": { role: "Damage", type: "lane" },
    "Ziggy": { role: "Control", type: "lane" },
    "Jae-Yong": { role: "Support", type: "lane" },
    "Chuck": { role: "Damage", type: "lane" },
    "Damian": { role: "Tank", type: "tank" },
    // --- Legendaries ---
    "Spike": { role: "Damage", type: "lane" },
    "Crow": { role: "Assassin", type: "assassin" },
    "Leon": { role: "Assassin", type: "assassin" },
    "Sandy": { role: "Support", type: "lane" },
    "Amber": { role: "Damage", type: "lane" },
    "Meg": { role: "Tank", type: "tank" },
    "Chester": { role: "Damage", type: "lane" },
    "Gale": { role: "Damage", type: "lane", hybrid: "damage + support" },
    "Surge": { role: "Damage", type: "lane" },
    "Colette": { role: "Damage", type: "lane" },
    "Lou": { role: "Control", type: "lane", hybrid: "damage + assassin + support" },
    "Ruffs": { role: "Support", type: "lane" },
    "Belle": { role: "Sniper", type: "sniper" },
    "Buzz": { role: "Assassin", type: "assassin" },
    "Ash": { role: "Tank", type: "tank" },
    "Lola": { role: "Damage", type: "lane" },
    "Fang": { role: "Assassin", type: "assassin" },
    "Eve": { role: "Control", type: "lane" },
    "Janet": { role: "Damage", type: "lane" },
    // --- Ultra Legendaries ---
    "Kaze": { role: "Assassin", type: "assassin" },
    "Sirius": { role: "Control", type: "lane" },
    // --- New brawlers (post-cutoff) ---
    "Alli": { role: "Assassin", type: "assassin" },
    "Mina": { role: "Damage", type: "lane" },
    "Gigi": { role: "Assassin", type: "assassin" },
    "Glowbert": { role: "Support", type: "lane" },
    "Glowy": { role: "Support", type: "lane" },
    "Pierce": { role: "Sniper", type: "sniper" },
    "Trunk": { role: "Tank", type: "tank" },
    "Najia": { role: "Damage", type: "lane" },
};
