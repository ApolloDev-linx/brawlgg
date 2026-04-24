"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * /methodology
 *
 * Public-facing explainer for how Apollo Meta's data pipeline works.
 * Toggle at the top lets users pick between Technical (engineers,
 * skeptics, data nerds) and Simple (casual players).
 *
 * Both views are rendered inline as React components. The content lives
 * in the two components below — to update either view, edit the JSX.
 * Source of truth for the prose is HOW-OUR-STATS-WORK.md in the repo
 * root; this page should stay in sync with that doc.
 */

type View = "technical" | "simple";

export default function MethodologyPage() {
  const [view, setView] = useState<View>("technical");

  return (
    <div>
      {/* Header + toggle */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium mb-1">How our stats work</h1>
          <p className="text-sm text-text-secondary">
            Exactly where every number on this site comes from and how
            it's computed
          </p>
        </div>

        {/* Toggle — Technical / Simple */}
        <div
          className="inline-flex rounded-lg border border-border overflow-hidden self-start sm:self-end"
          style={{ background: "var(--bg-primary)" }}
        >
          <button
            onClick={() => setView("technical")}
            className="px-3 py-1.5 text-xs transition-colors"
            style={{
              background:
                view === "technical"
                  ? "var(--text-primary)"
                  : "transparent",
              color:
                view === "technical"
                  ? "var(--bg-primary)"
                  : "var(--text-secondary)",
            }}
          >
            Technical
          </button>
          <button
            onClick={() => setView("simple")}
            className="px-3 py-1.5 text-xs transition-colors"
            style={{
              background:
                view === "simple"
                  ? "var(--text-primary)"
                  : "transparent",
              color:
                view === "simple"
                  ? "var(--bg-primary)"
                  : "var(--text-secondary)",
            }}
          >
            Simple
          </button>
        </div>
      </div>

      {view === "technical" ? <TechnicalView /> : <SimpleView />}

      {/* Footer links */}
      <div className="mt-8 pt-6 border-t border-border flex flex-wrap gap-4 text-sm">
        <Link
          href="/debug/stats"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          Verify the numbers yourself →
        </Link>
        <Link
          href="/"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          Back to dashboard →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TECHNICAL VIEW
// ---------------------------------------------------------------------------
// Full pipeline explanation — for people who want to know exactly how
// the math works. Keep in sync with HOW-OUR-STATS-WORK.md.

function TechnicalView() {
  return (
    <div className="space-y-6">
      <Intro>
        The whole point of this system is to show real win/pick rates
        from actual top-player games, not made-up numbers. Here's how
        it flows from raw API data to the stats you see in the UI.
      </Intro>

      <Section title="Step 1 — Harvest">
        <p>
          A harvester script pulls the top 200 players from 5 regional
          leaderboards (Global, US, GB, KR, BR) — about 984 unique
          players total. For each one, it fetches their last 25 battle
          logs from the Brawl Stars API and filters out anything that
          isn't real competitive play:
        </p>
        <List
          items={[
            "Non-competitive modes (Showdown, 5v5 events, novelty modes)",
            "Friendly / practice games",
            "Battles with missing timestamps or no result field",
          ]}
        />
        <p>
          Every valid battle writes a <Code>BattleRecord</Code> row for
          each of the 6 players in the game, with win/loss flipped per
          team. Then the harvester chains one hop deep — every unique
          player tag seen in those battles gets added to a secondary
          pool, and up to 400 of those get harvested too. So the
          dataset isn't just the top of the ladder, it's the
          competitive ecosystem around them.
        </p>
        <p>
          Result: ~185,000+ <Code>BattleRecord</Code> rows, each tied
          to a specific brawler + map + result. Every row is raw and
          append-only — we never edit or delete this data.
        </p>
      </Section>

      <Section title="Step 2 — Aggregate into two tables">
        <p>
          The aggregator writes to <em>two</em> tables, and the split
          matters. An earlier version of this pipeline used a single
          table and was silently dropping ~18% of real battles because
          of a map-filter mismatch. Splitting fixes that.
        </p>
        <SubSection title="MapBrawlerStat (per-map rankings)">
          <p>
            One row per (map × brawler). Powers the <Code>/maps</Code>{" "}
            page. Only includes battles on maps we have in our Map
            table — 5v5 event maps and retired maps get dropped here
            intentionally.
          </p>
        </SubSection>
        <SubSection title="BrawlerStat (overall per-brawler totals)">
          <p>
            One row per brawler. Computed directly from{" "}
            <Code>BattleRecord</Code> with no map filter applied. Every
            competitive-mode battle counts toward a brawler's overall
            stats. This powers the dashboard, counter picker, draft
            simulator, and analyzer.
          </p>
        </SubSection>
        <p>
          <strong>Tracked competitive modes:</strong> Gem Grab, Brawl
          Ball, Bounty, Heist, Hot Zone, Knockout, Siege, Wipeout,
          Duels. Duels is 1v1, not 3v3, and included as a deliberate
          call — tank/sustain brawlers underperform there but it's
          still real competitive data.
        </p>
      </Section>

      <Section title="Step 2.5 — Win rate shrinkage">
        <p>
          Raw win rates lie when samples are small. A brawler with a
          3-0 record has a 100% win rate but the signal is noise. Every
          displayed win rate gets pulled toward 50% using a Bayesian
          prior of 50 virtual 50/50 games:
        </p>
        <CodeBlock>shown_rate = (wins + 25) / (total + 50)</CodeBlock>
        <p>Effect at different sample sizes:</p>
        <List
          items={[
            "3 wins / 3 games (100% raw) → 53.6% shown",
            "27 wins / 50 games (54% raw) → 52% shown",
            "270 wins / 500 games (54% raw) → 53.6% shown",
            "2700 wins / 5000 games (54% raw) → 53.9% shown",
          ]}
        />
        <p>
          Big-sample brawlers barely move. Tiny-sample brawlers get
          pulled hard toward the middle so they can't top dashboards
          on noise alone. Pick rate isn't shrunk — it's a pure ratio
          and small samples don't produce misleading outliers there.
        </p>
      </Section>

      <Section title="Step 2.6 — Tier assignment">
        <p>
          Tiers are the loudest badge on the site, so they need to
          mean something:
        </p>
        <List
          items={[
            "S = win rate 54%+ AND total battles 1000+",
            "A = win rate 51%+",
            "B = win rate 48%+",
            "C = below 48%",
          ]}
        />
        <p>
          The 1000-battle floor for S is the guard. At 1000 games, a
          54% observed rate has a 95% confidence interval of about
          ±3pp — true rate is very likely 51%+, which is genuinely
          strong. Without the floor, a 500-battle brawler on a hot
          streak would get the same S badge as one with years of
          proven data. The rule references no brawler by name —
          everyone auto-promotes or auto-demotes as their data moves.
        </p>
      </Section>

      <Section title="Step 3 — Per-map ranking (Wilson score)">
        <p>
          Per-map rankings don't sort by raw win rate — they sort by
          Wilson score lower bound at 95% confidence with a 50-game
          Bayesian prior. Wilson answers: "what's the lowest plausible
          true win rate given this sample?" It pulls uncertain samples
          down harder than certain ones, so 2-0 (100% raw) ranks below
          44-33 (57% raw) because the first has too little data to
          trust. Same math Reddit uses to rank comments.
        </p>
      </Section>

      <Section title="Step 3.5 — Map pick callouts">
        <p>
          Three cards on every map detail page, picked live from the
          map's stats — not from a pre-computed field:
        </p>
        <List
          items={[
            "Best first pick — top of the Wilson-sorted list, restricted to brawlers with a real sample",
            "Safest pick — win rate 51%+ AND pick rate 3%+. The consensus strong-and-popular choice",
            "High risk / high reward — win rate 53%+ AND pick rate under 3%. Niche picks punching above their weight",
          ]}
        />
        <p>
          Any of the three can return empty, and the card simply
          doesn't render. We'd rather show two cards than fake a
          third.
        </p>
      </Section>

      <Section title="Step 4 — Counter engine">
        <p>
          Brawlers are typed: lane, tank, assassin, thrower, sniper.
          A counter matrix defines the competitive triangle (lane
          beats thrower, tank beats assassin, assassin beats lane,
          thrower beats tank, and so on).
        </p>
        <p>
          When you select enemy brawlers, every available brawler
          scores:
        </p>
        <List
          items={[
            "+2 for each enemy type it's strong against",
            "-1 for each enemy type it's weak against",
            "Small bonus from win rate as a tiebreaker",
          ]}
        />
        <p>
          This is competitive theory, not empirical head-to-head
          data.{" "}
          <Code>BattleRecord</Code> only stores the harvested player's
          brawler per battle, not the full enemy roster, so we can't
          compute true matchup win rates yet. That's a planned upgrade
          once the schema captures all 6 participants per battle.
        </p>
      </Section>

      <Section title="Step 5 — Draft engine">
        <p>
          The draft simulator tracks ban/pick state for both teams,
          recommends highest-impact brawlers to ban (win rate × pick
          rate = danger score), runs the counter engine against enemy
          picks for top-3 suggestions with reasoning, and computes a
          live advantage score — your team's average win rate minus
          the enemy team's. Positive means you're favored.
        </p>
      </Section>

      <Section title="What each dashboard panel means">
        <SubSection title="Top in meta (left panel)">
          <p>
            Sorted by impact = (win rate × pick rate) / 100. Answers
            "which brawlers are actually shaping the meta?" A brawler
            ranks high because they're picked often AND winning —
            Mortis tops it even though his win rate isn't the highest
            on the site, because he's in so many games you can't
            ignore him.
          </p>
        </SubSection>
        <SubSection title="Most picked (right top)">
          <p>Pure pick rate sort. Top 5.</p>
        </SubSection>
        <SubSection title="Highest win rate (right bottom)">
          <p>
            Pure win rate sort, filtered to real-sample brawlers.
            Answers a <em>different</em> question than Top in meta —
            surfaces under-the-radar brawlers who are statistically
            strongest when they show up, even if they aren't yet
            defining the meta. Useful for draft decisions.
          </p>
        </SubSection>
      </Section>

      <Section title="What we're honest about">
        <SubSection title="No ban data">
          <p>
            The Brawl Stars API doesn't expose ranked-draft bans, so
            we stripped all ban-rate UI from the site. Empty columns
            are worse than no columns. Any meta site claiming precise
            ban rates without a Supercell data deal is making them up.
          </p>
        </SubSection>
        <SubSection title="No enemy brawler data (yet)">
          <p>
            We only store the harvested player's brawler per battle,
            not the full 6-brawler lineup. "Pick rate" is really
            "share of harvested player-battles," not true game
            frequency. Counter recommendations are competitive theory
            plus meta strength, not real head-to-head matchup data.
            That's the big planned upgrade.
          </p>
        </SubSection>
        <SubSection title="Only public battle logs">
          <p>
            No private matches, no club leagues. Only what the Brawl
            Stars public API exposes.
          </p>
        </SubSection>
        <SubSection title="Low-sample rows">
          <p>
            Per-map rows with fewer than 50 battles are flagged as
            not-yet-real. We don't show them in pick callouts or use
            them for S-tier assignment.
          </p>
        </SubSection>
      </Section>

      <Section title="How to verify any of this yourself">
        <List
          items={[
            <>
              <Link
                href="/debug/stats"
                className="underline hover:text-text-primary"
              >
                /debug/stats
              </Link>{" "}
              — per-brawler comparison of raw BattleRecord win rates
              vs what's stored. They share the same SQL source, so
              they should match within ±0.5pp. Any drift is a real
              bug. Also shows what numbers would look like under the
              old map-filtered aggregation path, with deltas — visual
              proof of the bias we fixed.
            </>,
            <>
              <Link
                href="/debug/maps"
                className="underline hover:text-text-primary"
              >
                /debug/maps
              </Link>{" "}
              — which map names from BattleRecord matched our Map
              table and which got dropped.
            </>,
            "The Brawl Stars API is public. Pull any player's battle log and check our data against it — they should match exactly.",
          ]}
        />
      </Section>

      <Section title="Why top players?">
        <p>
          Leaderboard players play the actual competitive meta. They
          draft intentionally, play optimal modes, and their results
          reflect real brawler strength — not casual chaos. Chain
          harvesting one hop deep pulls in the opponents and teammates
          those top players fought, so the sample isn't just the top
          of the ladder — it's the competitive ecosystem around them.
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIMPLE VIEW
// ---------------------------------------------------------------------------
// Plain-English explainer for casual players. Same structure as the
// technical view but without math, code, or schema details.

function SimpleView() {
  return (
    <div className="space-y-6">
      <Intro>
        Apollo Meta is built to show real, trustworthy Brawl Stars
        stats — not guesses, not opinions. Here's how everything works,
        in plain English.
      </Intro>

      <Section title="Where the data comes from">
        <p>We collect data from:</p>
        <List
          items={[
            "Top players around the world",
            "Their real ranked matches",
            "The people they play with and against",
          ]}
        />
        <p>
          You're seeing how the <em>best players in the game</em> are
          actually performing. Not casual games. Not random matches.
          Real competitive play.
        </p>
      </Section>

      <Section title="Step 1 — Collecting matches">
        <List
          items={[
            "Track top leaderboard players",
            "Pull their recent matches",
            "Filter out irrelevant games (fun modes, practice matches, etc.)",
          ]}
        />
        <p>
          Every match gets saved. Every player in that match is
          counted. Wins and losses are recorded correctly.
        </p>
        <p>
          Result: a huge dataset of real matches played at a high
          level.
        </p>
      </Section>

      <Section title="Step 2 — Turning matches into stats">
        <p>From all those matches, we calculate:</p>
        <List
          items={[
            "Win Rate — how often a brawler wins",
            "Pick Rate — how often a brawler is used",
            "Sample Size — how much data we have",
          ]}
        />
        <p>We do this two ways:</p>
        <SubSection title="Per map">
          <p>How good a brawler is on a specific map.</p>
        </SubSection>
        <SubSection title="Overall">
          <p>How good a brawler is across all competitive modes.</p>
        </SubSection>
      </Section>

      <Section title="Making the stats fair">
        <p>Small samples can be misleading.</p>
        <p>
          Example: a brawler that goes 3-0 looks like 100% win rate,
          but that's not reliable.
        </p>
        <p>So we adjust stats slightly to keep things fair:</p>
        <List
          items={[
            "Small samples get pulled closer to average",
            "Big samples stay accurate",
          ]}
        />
        <p>
          This prevents fake "top-tier" brawlers from appearing due to
          luck.
        </p>
      </Section>

      <Section title="Tier system (S, A, B, C)">
        <p>Brawlers are ranked based on performance:</p>
        <List
          items={[
            "S Tier — very strong AND proven with lots of data",
            "A Tier — strong",
            "B Tier — average",
            "C Tier — weak",
          ]}
        />
        <p>
          <strong>Important:</strong> a brawler must have a large
          sample size to reach S Tier. No shortcuts, no hype — only
          proven results.
        </p>
      </Section>

      <Section title="Map rankings">
        <p>We don't just sort by win rate. Instead we ask:</p>
        <p>
          <em>"How confident are we this brawler is actually strong?"</em>
        </p>
        <p>This means:</p>
        <List
          items={[
            "Consistent performers rank higher",
            "Low-data outliers don't dominate",
          ]}
        />
      </Section>

      <Section title="Pick suggestions (on map pages)">
        <p>Each map shows smart recommendations:</p>
        <SubSection title="Best first pick">
          <p>Most reliable top performer on that map.</p>
        </SubSection>
        <SubSection title="Safest pick">
          <p>Popular AND consistently strong.</p>
        </SubSection>
        <SubSection title="High risk / high reward">
          <p>Less common picks that still perform very well.</p>
        </SubSection>
      </Section>

      <Section title="Counter system">
        <p>The counter tool is based on competitive strategy:</p>
        <List
          items={[
            "Some brawler types naturally beat others",
            "We score picks based on those matchups",
          ]}
        />
        <p>Example:</p>
        <List
          items={[
            "Assassins are strong vs squishy targets",
            "Tanks are strong vs burst damage",
            "Throwers are strong vs tanks",
          ]}
        />
        <p>This is game knowledge + data combined.</p>
      </Section>

      <Section title="Draft assistant">
        <p>When drafting:</p>
        <List
          items={[
            "We suggest bans (strong + popular brawlers)",
            "Recommend picks based on enemy team",
            "Show who's winning the draft",
          ]}
        />
      </Section>

      <Section title="What we're honest about">
        <p>We don't fake anything. Here's what you should know:</p>
        <SubSection title="No ban data">
          <p>The game doesn't provide it — so we don't show it.</p>
        </SubSection>
        <SubSection title="No full enemy team data (yet)">
          <p>
            We track individual performance, not full team matchups.
          </p>
        </SubSection>
        <SubSection title="Some stats have low data">
          <p>
            If data is limited, we label it or exclude it from key
            features.
          </p>
        </SubSection>
      </Section>

      <Section title="Transparency tools">
        <p>
          We provide{" "}
          <Link
            href="/debug/stats"
            className="underline hover:text-text-primary"
          >
            debug pages
          </Link>{" "}
          where you can:
        </p>
        <List
          items={[
            "Compare raw vs calculated stats",
            "See exactly how data is processed",
          ]}
        />
        <p>If something is wrong, it's fixable — not hidden.</p>
      </Section>

      <Section title="Keeping data updated">
        <p>Stats are refreshed regularly:</p>
        <List
          items={["New matches are added", "Numbers are recalculated"]}
        />
        <p>The meta evolves — and so do the stats.</p>
      </Section>

      <Section title="Why this matters">
        <p>Most meta sites:</p>
        <List items={["Guess", "Copy each other", "Or use unclear methods"]} />
        <p>Apollo Meta is different:</p>
        <List
          items={[
            "Built on real matches",
            "Focused on competitive play",
            "Designed to be transparent",
          ]}
        />
      </Section>

      <Section title="The goal">
        <p>
          To become the most accurate and trusted source for Brawl
          Stars competitive data.
        </p>
        <p className="italic text-text-tertiary">
          No noise. No bias. Just signal.
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational components
// ---------------------------------------------------------------------------

function Intro({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-4 text-sm text-text-secondary leading-relaxed">
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-bg-primary border border-border rounded-xl p-5">
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      <div className="text-sm text-text-secondary leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pl-3 border-l-2 border-border">
      <div className="text-xs font-medium text-text-primary mb-1">
        {title}
      </div>
      <div className="text-sm text-text-secondary">{children}</div>
    </div>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-2 text-sm text-text-secondary"
        >
          <span className="text-text-tertiary mt-0.5">·</span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[12px] font-mono text-text-primary">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-bg-tertiary rounded-md px-3 py-2 text-[12px] font-mono text-text-primary overflow-x-auto">
      {children}
    </pre>
  );
}
