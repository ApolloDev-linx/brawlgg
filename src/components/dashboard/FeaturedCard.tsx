"use client";

import { useState, useEffect, useCallback } from "react";
import { BrawlerPortrait } from "@/components/BrawlerPortrait";
import {
  PLAYER_OF_MONTH,
  FEATURED_CLUBS,
  type FeaturedPlayer,
  type FeaturedClub,
} from "@/lib/featured";

interface WorstBrawler {
  id: string;
  name: string;
  iconUrl: string | null;
  externalId: number | null;
  winRate: number;
  pickRate: number;
}

const ROTATION_MS = 7000;
const FADE_MS = 200;

type SlideKind = "player" | "clubs" | "worst";

export function FeaturedCard({
  worstBrawler,
}: {
  worstBrawler: WorstBrawler | null;
}) {
  // Build active slides only from populated sources. If you haven't
  // configured PLAYER_OF_MONTH yet, that slide is silently skipped —
  // rotation just cycles whatever IS populated.
  const slides: SlideKind[] = [];
  if (PLAYER_OF_MONTH) slides.push("player");
  if (FEATURED_CLUBS.length > 0) slides.push("clubs");
  if (worstBrawler) slides.push("worst");

  const [index, setIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [paused, setPaused] = useState(false);

  // Cross-fade transition: fade out → swap content → fade in.
  // Pass `target` to jump directly (dot click); omit to advance +1.
  const advance = useCallback(
    (target?: number) => {
      if (slides.length <= 1) return;
      setOpacity(0);
      window.setTimeout(() => {
        setIndex((cur) =>
          target !== undefined ? target : (cur + 1) % slides.length
        );
        setOpacity(1);
      }, FADE_MS);
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = window.setInterval(() => advance(), ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, advance, slides.length]);

  // Defensive: if every source returned empty, render a quiet
  // placeholder rather than crashing the metric row layout.
  if (slides.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-xl p-4">
        <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
          Featured
        </div>
        <div className="text-sm text-text-secondary">No data yet</div>
      </div>
    );
  }

  const current = slides[index];

  return (
    <div
      className="bg-bg-secondary rounded-xl p-4 flex flex-col relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex-1 transition-opacity"
        style={{ opacity, transitionDuration: `${FADE_MS}ms` }}
      >
        {current === "player" && PLAYER_OF_MONTH && (
          <PlayerSlide player={PLAYER_OF_MONTH} />
        )}
        {current === "clubs" && FEATURED_CLUBS.length > 0 && (
          <ClubsSlide clubs={FEATURED_CLUBS} />
        )}
        {current === "worst" && worstBrawler && (
          <WorstSlide brawler={worstBrawler} />
        )}
      </div>

      {/* Pagination dots — only render when 2+ slides */}
      {slides.length > 1 && (
        <div className="flex gap-1 mt-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => i !== index && advance(i)}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 14 : 6,
                height: 6,
                background:
                  i === index
                    ? "var(--text-secondary)"
                    : "var(--border-color)",
                cursor: i === index ? "default" : "pointer",
                border: "none",
                padding: 0,
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerSlide({ player }: { player: FeaturedPlayer }) {
  return (
    <>
      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
        Player of the month
      </div>
      <div
        className="text-base font-medium tracking-tight truncate"
        style={{ color: "#85B7EB" }}
      >
        {player.name}
      </div>
      <div className="text-[11px] text-text-secondary mt-0.5 font-mono">
        {player.tag}
        {player.trophies !== undefined &&
          ` · ${player.trophies.toLocaleString()} 🏆`}
      </div>
      {player.blurb && (
        <div className="text-[11px] text-text-secondary mt-1 leading-snug">
          {player.blurb}
        </div>
      )}
    </>
  );
}

function ClubsSlide({ clubs }: { clubs: FeaturedClub[] }) {
  // Show up to 3 — enough for variety, doesn't overflow the card height.
  return (
    <>
      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
        Featured clubs
      </div>
      <div className="flex flex-col gap-1">
        {clubs.slice(0, 3).map((c) => (
          <div key={c.tag} className="min-w-0">
            <div
              className="text-sm font-medium tracking-tight truncate"
              style={{ color: "#5DCAA5" }}
            >
              {c.name}
            </div>
            <div className="text-[10px] text-text-tertiary font-mono truncate">
              {c.tag}
              {c.blurb && ` · ${c.blurb}`}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function WorstSlide({ brawler }: { brawler: WorstBrawler }) {
  // Mirror the "Top meta brawler" layout — portrait + name + stats —
  // but in the loss palette so it reads instantly as the inverse card.
  return (
    <>
      <div className="text-[10px] text-text-tertiary uppercase tracking-widest mb-2">
        Worst brawler
      </div>
      <div className="flex items-center gap-2.5">
        <BrawlerPortrait
          name={brawler.name}
          iconUrl={brawler.iconUrl}
          externalId={brawler.externalId}
          size="lg"
        />
        <div className="min-w-0">
          <div
            className="text-base font-medium tracking-tight truncate"
            style={{ color: "#F09595" }}
          >
            {brawler.name}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            {brawler.winRate}% WR · {brawler.pickRate}% pick
          </div>
        </div>
      </div>
    </>
  );
}
