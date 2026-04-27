"use client";

import { useState } from "react";
import { MODE_ICONS } from "@/lib/constants";

/**
 * Map image — Brawlify CDN image with mode-icon fallback.
 *
 * Resolution order:
 *   1. imageUrl from the Map row (populated by map-sync from the
 *      Brawlify API's `imageUrl` field on each map)
 *   2. If null/missing or load errors: mode emoji on a tinted block —
 *      same look the cards used pre-images, so it degrades cleanly.
 *
 * Plain <img> on purpose (same call as BrawlerPortrait):
 *   - object-fit: cover handles the aspect-ratio variance between
 *     Brawlify's renders (some maps are tall, some near-square)
 *   - lazy loading is fine for grid views with 30+ cards
 *   - <img onError> > next/image for graceful 404 fallback on missing
 *     CDN entries (new maps, deleted maps, etc.)
 */

type Size = "thumb" | "card" | "hero";

const SIZE_MAP: Record<Size, { height: number; radius: number; iconSize: number }> = {
  thumb: { height: 48, radius: 6, iconSize: 18 },   // inline / small lists
  card: { height: 110, radius: 8, iconSize: 22 },   // top of map grid card
  hero: { height: 200, radius: 10, iconSize: 36 },  // detail page banner
};

export function MapImage({
  name,
  imageUrl,
  modeName,
  size = "card",
  className = "",
}: {
  name: string;
  imageUrl?: string | null;
  modeName?: string;
  size?: Size;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const dim = SIZE_MAP[size];
  const showImage = imageUrl && !errored;

  if (showImage) {
    return (
      <img
        src={imageUrl!}
        alt={name}
        loading="lazy"
        onError={() => setErrored(true)}
        className={className}
        style={{
          width: "100%",
          height: dim.height,
          objectFit: "cover",
          borderRadius: dim.radius,
          background: "var(--bg-secondary)",
          display: "block",
        }}
      />
    );
  }

  // Fallback — mode icon centered on a tinted block
  const icon = (modeName && MODE_ICONS[modeName]) || "??";
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        width: "100%",
        height: dim.height,
        borderRadius: dim.radius,
        background: "var(--bg-tertiary)",
        color: "var(--text-tertiary)",
        fontSize: dim.iconSize,
      }}
    >
      {icon}
    </div>
  );
}
