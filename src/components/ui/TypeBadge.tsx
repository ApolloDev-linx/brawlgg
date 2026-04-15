"use client";

import { TYPE_COLORS, TYPE_LABELS } from "@/lib/constants";
import type { BrawlerType } from "@/types/brawler";

export function TypeBadge({ type }: { type: BrawlerType }) {
  const color = TYPE_COLORS[type] || "#888";
  const label = TYPE_LABELS[type] || type;

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-xs font-medium"
      style={{ background: color + "18", color }}
    >
      {label}
    </span>
  );
}
