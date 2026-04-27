"use client";

import { useState } from "react";
import { LOCAL_PORTRAITS } from "@/lib/local-portraits";

/**
 * Brawler portrait — Brawlify CDN image with a local override layer
 * and a graceful initials fallback.
 *
 * Resolution chain (each step advances on <img> onError):
 *   0. iconUrl from the Brawler row (populated by brawler-sync from
 *      Brawlify's `imageUrl2 || imageUrl`). If null, fall through to
 *      the constructed CDN URL using externalId.
 *   1. Local override at /public/brawler-portraits/{filename} — only
 *      attempted for brawlers in LOCAL_PORTRAITS so we don't fire 404s
 *      for every row in the dashboard. Managed by scripts/add-portrait.ts.
 *      Registry stores filename (with extension) so we can serve any of
 *      png/jpg/webp without the component having to guess.
 *   2. Initials chip — same look as before, so missing-portrait rows
 *      still render cleanly instead of showing a broken-image icon.
 *
 * Sizes are pinned to a small set of presets so visual rhythm stays
 * consistent across the app. Add a new size by extending SIZE_MAP — do
 * not pass arbitrary dimensions, that's how chip sizes drift.
 *
 * Why a plain <img> not next/image:
 *   next/image needs static width/height props plus a remotePatterns
 *   entry per host. We already have the latter, but the failure mode of
 *   next/image on a missing CDN is uglier than <img onError>. For 26×26
 *   chips streamed in lists, the LCP wins from next/image are negligible.
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

// Same slug rules as scripts/add-portrait.ts — keep these in sync.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCandidateUrls(
  name: string,
  iconUrl: string | null | undefined,
  externalId: number | null | undefined
): string[] {
  const urls: string[] = [];

  // Stage 0 — primary remote portrait. Prefer the explicit iconUrl,
  // fall back to constructing the CDN URL from externalId.
  if (iconUrl) {
    urls.push(iconUrl);
  } else if (externalId != null) {
    urls.push(`https://cdn.brawlify.com/brawler-bs/regular/${externalId}.png`);
  }

  // Stage 1 — local override. Only added if the brawler is registered;
  // otherwise we'd fire a 404 for every brawler in every list.
  const slug = slugify(name);
  const filename = LOCAL_PORTRAITS.get(slug);
  if (filename) {
    urls.push(`/brawler-portraits/${filename}`);
  }

  return urls;
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
  const [stage, setStage] = useState(0);
  const dim = SIZE_MAP[size];
  const candidates = buildCandidateUrls(name, iconUrl, externalId);
  const url = candidates[stage] ?? null;

  // Fallback path — initials chip styled to match the original
  // InitialsChip exactly, so swap-in is visually transparent on failure.
  if (!url) {
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
        // Key on stage so React swaps the underlying element on advance,
        // forcing a fresh load instead of reusing the cached error state.
        key={stage}
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setStage((s) => s + 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </span>
  );
}
