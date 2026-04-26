"use client";

import { useState } from "react";

/**
 * Brawler portrait — Brawlify CDN image with graceful initials fallback.
 *
 * Resolution order:
 *   1. iconUrl from the Brawler row (already populated by brawler-sync
 *      from Brawlify's `imageUrl2 || imageUrl`)
 *   2. Constructed: cdn.brawlify.com/brawler-bs/regular/{externalId}.png
 *   3. If image errors (404, network, brawler too new for CDN): show
 *      the initials chip — same look we used pre-portraits, so it
 *      degrades cleanly instead of leaving a broken-image icon.
 *
 * Sizes are pinned to a small set of presets so visual rhythm stays
 * consistent across the app. Add a new size by extending SIZE_MAP — do
 * not pass arbitrary dimensions, that's how chip sizes drift.
 *
 * Why a plain <img> not next/image:
 *   next/image needs static width/height props plus a remotePatterns
 *   entry per host. We already have the latter, but the failure mode of
 *   next/image on a missing CDN is uglier than <img onError>. For 26×26
 *   chips streamed in lists, the LCP wins from next/image are negligible
 *   anyway. Plain img + lazy loading is the right call here.
 */

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<Size, { box: number; fontSize: number; radius: number }> = {
  xs: { box: 22, fontSize: 9, radius: 6 },   // top-5 strip on map cards
  sm: { box: 26, fontSize: 10, radius: 6 },  // dashboard rows, map detail rows
  md: { box: 36, fontSize: 12, radius: 8 },  // counter results, picker tiles
  lg: { box: 56, fontSize: 16, radius: 10 }, // enemy slots, draft picks
  xl: { box: 72, fontSize: 20, radius: 12 }, // hero cards, big detail surfaces
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const first = trimmed[0].toUpperCase();
  const rest = trimmed.slice(1).replace(/[^a-zA-Z]/g, "");
  const second = (rest[0] || trimmed[0]).toLowerCase();
  return first + second;
}

function buildPortraitUrl(
  iconUrl: string | null | undefined,
  externalId: number | null | undefined
): string | null {
  if (iconUrl) return iconUrl;
  if (externalId != null) {
    return `https://cdn.brawlify.com/brawler-bs/regular/${externalId}.png`;
  }
  return null;
}

export function BrawlerPortrait({
  name,
  iconUrl,
  externalId,
  size = "sm",
  className = "",
}: {
  name: string;
  iconUrl?: string | null;
  externalId?: number | null;
  size?: Size;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const url = buildPortraitUrl(iconUrl, externalId);
  const dim = SIZE_MAP[size];

  // Fallback path — initials chip styled to match the original
  // InitialsChip exactly, so swap-in is visually transparent on failure.
  if (errored || !url) {
    return (
      <span
        className={`inline-flex items-center justify-center font-semibold border border-border ${className}`}
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
          letterSpacing: "-0.02em",
          width: dim.box,
          height: dim.box,
          fontSize: dim.fontSize,
          borderRadius: dim.radius,
          flexShrink: 0,
        }}
        title={name}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden border border-border ${className}`}
      style={{
        background: "var(--bg-tertiary)",
        width: dim.box,
        height: dim.box,
        borderRadius: dim.radius,
        flexShrink: 0,
      }}
      title={name}
    >
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setErrored(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </span>
  );
}
