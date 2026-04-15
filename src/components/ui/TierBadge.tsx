"use client";

import { TIER_COLORS } from "@/lib/constants";
import type { Tier } from "@/types/brawler";

export function TierBadge({ tier }: { tier: Tier }) {
  const color = TIER_COLORS[tier] || "#888";

  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-semibold"
      style={{ background: color + "22", color }}
    >
      {tier}
    </span>
  );
}
