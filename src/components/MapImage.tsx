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
 *
 * Sizes:
 *   - thumb    fixed 48px row    — inline lists, debug pages
 *   - card     fixed 110px       — old horizontal banner card (legacy)
 *   - portrait 3:4 aspect-ratio  — new portrait card, lets the map breathe
 *   - hero     fixed 200px       — detail page banner
 *
 * `portrait` is sized by aspect-ratio rather than a fixed pixel height
 * so the image scales with the card width across breakpoints. Brawlify's
 * map renders are mostly portrait (taller than wide), so 3:4 is roughly
 * the natural shape and `cover` rarely needs to crop aggressively.
 */

type Size = "thumb" | "card" | "portrait" | "hero";

interface SizeSpec {
  height?: number;
  aspectRatio?: string;
  radius: number;
  iconSize: number;
}

const SIZE_MAP: Record<Size, SizeSpec> = {
  thumb: { height: 48, radius: 6, iconSize: 18 },
  card: { height: 110, radius: 8, iconSize: 22 },
  portrait: { aspectRatio: "3 / 4", radius: 8, iconSize: 28 },
  hero: { height: 200, radius: 10, iconSize: 36 },
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

  // Build dimension styles. height OR aspectRatio is set, never both —
  // mixing them fights the layout engine and produces stretched images.
  const dimStyle: React.CSSProperties = dim.height
    ? { height: dim.height }
    : { aspectRatio: dim.aspectRatio };

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
          ...dimStyle,
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
        ...dimStyle,
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
