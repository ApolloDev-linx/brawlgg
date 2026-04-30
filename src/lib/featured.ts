/**
 * Featured card configuration for the dashboard.
 *
 * Enter player and club tags below — names, trophies, and member
 * counts are fetched live from the Brawl Stars API at request time
 * and cached for 30 minutes.
 *
 * If BRAWL_STARS_API_KEY isn't set, or the API errors, the card
 * gracefully falls back to displaying just the tag + blurb.
 *
 * Slides:
 *   1. Player of the month   — PLAYER_OF_MONTH (single)
 *   2. Featured clubs        — FEATURED_CLUBS (up to 3 shown)
 *   3. Worst brawler         — auto-computed from BrawlerStat
 *
 * Set PLAYER_OF_MONTH to null or FEATURED_CLUBS to [] to skip
 * that slide entirely. Auto-rotates every 7 seconds.
 */

export interface FeaturedPlayerConfig {
  tag: string;          // e.g. "#2QPRGGV9C"
  blurb?: string;       // short why-they're-featured line
}

export interface FeaturedClubConfig {
  tag: string;          // e.g. "#2VR8PJ8L"
  blurb?: string;       // optional tagline
}

export const PLAYER_OF_MONTH: FeaturedPlayerConfig | null = {
  tag: "#2P8VJPUU",
  blurb: "Imagination creates reality.",
};

export const FEATURED_CLUBS: FeaturedClubConfig[] = [
  { tag: "#2VRJ9YUJ9", blurb: "Chosen By Apollo Meta" },
];
