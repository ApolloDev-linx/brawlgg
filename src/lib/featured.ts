/**
 * Featured card configuration for the dashboard.
 *
 * The Featured card on the homepage rotates through up to three
 * states, in this order:
 *
 *   1. Player of the month  — handpicked, edit PLAYER_OF_MONTH below
 *   2. Featured clubs       — handpicked, edit FEATURED_CLUBS below
 *   3. Worst brawler        — auto-computed from BrawlerStat
 *
 * To swap who's featured, edit the values below and redeploy. The
 * card auto-rotates every ~7 seconds and pauses on hover.
 *
 * Set PLAYER_OF_MONTH to null or FEATURED_CLUBS to [] to skip that
 * slide entirely — rotation only cycles through populated states.
 */

export interface FeaturedPlayer {
  name: string;
  tag: string;          // e.g. "#2QPRGGV9C"
  blurb?: string;       // short why-they're-featured line
  trophies?: number;
}

export interface FeaturedClub {
  name: string;
  tag: string;          // e.g. "#2VR8PJ8L"
  blurb?: string;       // optional short tagline
}

// Set to null to skip this slide
export const PLAYER_OF_MONTH: FeaturedPlayer | null = {
  name: "GG|Apollo",
  tag: "#L9QCVP22",
  blurb: "Use our website to be randomly chosen",
  trophies: 90544,
};

// Empty array to skip this slide
export const FEATURED_CLUBS: FeaturedClub[] = [
  {
    name: "GG Empire",
    tag: "#2VRJ9YUJ9",
    blurb: "Chosen by Apollo Meta",
  },
];
