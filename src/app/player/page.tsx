"use client";

import { useState } from "react";
import { normalizeTag } from "@/lib/utils";

interface PlayerData {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies: number;
  clubName: string;
  playstyle: string;
  playstyleColor: string;
  level: number;
  wins: number;
  topBrawlers: {
    name: string;
    type: string;
    trophies: number;
    power: number;
  }[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export default function PlayerPage() {
  const [tag, setTag] = useState("");
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!tag.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/players/${normalizeTag(tag)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Player not found");
      }
      const data = await res.json();
      setPlayer(data);
    } catch (e: any) {
      setError(e.message);
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium mb-1">Player lookup</h1>
        <p className="text-sm text-text-secondary">
          Enter a player tag to view their profile, stats, and playstyle
          analysis
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="#2PP or any player tag..."
          className="flex-1 max-w-xs"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-5 rounded-lg text-sm font-medium"
          style={{
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            opacity: loading ? 0.6 : 1,
            border: "none",
          }}
        >
          {loading ? "Searching..." : "Lookup"}
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{
            background: "rgba(240, 149, 149, 0.08)",
            color: "#F09595",
            border: "1px solid rgba(240, 149, 149, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {player && (
        <div>
          {/* Profile header */}
          <div className="flex gap-4 items-center mb-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium"
              style={{
                background: "rgba(133, 183, 235, 0.15)",
                color: "#85B7EB",
              }}
            >
              {player.name.slice(0, 2)}
            </div>
            <div className="flex-1">
              <div className="text-lg font-medium">{player.name}</div>
              <div className="text-xs text-text-secondary">
                #{player.tag} {player.clubName ? `-- ${player.clubName}` : ""}
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: player.playstyleColor + "18",
                color: player.playstyleColor,
              }}
            >
              {player.playstyle}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard
              label="Trophies"
              value={player.trophies.toLocaleString()}
              color="#EF9F27"
            />
            <StatCard
              label="Highest"
              value={player.highestTrophies.toLocaleString()}
            />
            <StatCard
              label="3v3 wins"
              value={player.wins.toLocaleString()}
              color="#5DCAA5"
            />
            <StatCard label="Exp level" value={String(player.level)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top brawlers */}
            <div className="bg-bg-primary border border-border rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Top brawlers</div>
              {player.topBrawlers.map((b, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm font-medium flex-1">{b.name}</span>
                  <span className="text-[11px] text-text-tertiary">
                    Power {b.power}
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "#EF9F27" }}
                  >
                    {b.trophies}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              {/* Strengths */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-2">Strengths</div>
                {player.strengths.map((s, i) => (
                  <div
                    key={i}
                    className="text-xs py-0.5"
                    style={{ color: "#5DCAA5" }}
                  >
                    + {s}
                  </div>
                ))}
              </div>

              {/* Weaknesses */}
              <div className="bg-bg-primary border border-border rounded-xl p-4">
                <div className="text-sm font-medium mb-2">Weaknesses</div>
                {player.weaknesses.map((w, i) => (
                  <div
                    key={i}
                    className="text-xs py-0.5"
                    style={{ color: "#F09595" }}
                  >
                    - {w}
                  </div>
                ))}
              </div>

              {/* Suggestions */}
              {player.suggestions.length > 0 && (
                <div className="bg-bg-primary border border-border rounded-xl p-4">
                  <div className="text-sm font-medium mb-2">
                    Suggested improvements
                  </div>
                  {player.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="text-xs text-text-secondary py-0.5"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!player && !loading && !error && (
        <div className="text-center py-12 text-sm text-text-tertiary">
          Enter a player tag above to get started. Without a Brawl Stars API
          key, the system generates sample data for demonstration.
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-4">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div
        className="text-xl font-medium"
        style={{ color: color || "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
