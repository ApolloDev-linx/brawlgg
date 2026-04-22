# How Our Stats Work

================================================
  APOLLO META — HOW THE DATA PIPELINE WORKS
================================================

The whole point of this system is to show REAL win/pick rates
from actual top-player games, not made-up numbers. Here's how
it flows from raw API data to the stats you see in the UI.

─────────────────────────────────────────────
  STEP 1 — HARVEST (scripts/harvest.ts)
─────────────────────────────────────────────

Run manually with: npx tsx scripts/harvest.ts
Or as part of the full pipeline: npx tsx scripts/pipeline.ts

What it does:

  1. Pulls the top 200 players from 5 regional leaderboards
     (Global, US, GB, KR, BR) — ~984 unique players total.

  2. For each player, fetches their last 25 battle logs from
     the Brawl Stars API.

  3. Filters out anything we don't care about:
     - Non-competitive modes (Showdown, 5v5 events, novelty modes)
     - Friendly / practice games
     - Battles with missing timestamps or no result field

  4. For every valid battle, writes a BattleRecord row into the
     DB for EACH player in that game (all 6 players in a 3v3),
     with the correct win/loss flipped per team.

  5. Chain harvesting: every unique player tag seen in those
     battles gets added to a secondary pool. We then harvest up
     to 400 of those too — so we're not just getting the top
     200, we're getting their opponents and teammates as well.
     This gives us a much richer sample.

  Result: ~185,000+ BattleRecord rows in the DB, each tied to
  a specific brawler + map + result. Every row is raw and
  append-only — we never edit or delete BattleRecord data. If
  we ever want to change what counts as "competitive," we just
  change the aggregation filter, not the raw log.

─────────────────────────────────────────────
  STEP 2 — AGGREGATE (stat-aggregator.ts)
─────────────────────────────────────────────

Triggered by: hitting /api/cron/aggregate
              (or automatically every 2 hours in production)

This step writes to TWO tables — and that split matters. A
single aggregate table inherits whichever filter it uses, and
an earlier version of this pipeline was silently dropping ~18%
of real battles because of a map-filter mismatch (mostly 5v5
events the API tags ambiguously). Splitting fixes that.

  TABLE A — MapBrawlerStat (per-map rankings)
  -------------------------------------------
  One row per (map × brawler). Powers the /maps page.

  For each (map, brawler) pair it computes:
       - Win rate  = victories / total appearances
       - Pick rate = appearances / total picks on that map
       - Sample size (total battles)
       - isReal flag (true if sample ≥ 50)

  Note: this table ONLY includes battles on maps we have in
  our Map table. 5v5 event maps and retired maps get dropped
  here intentionally — the per-map page should only rank
  real 3v3 ranked maps.

  TABLE B — BrawlerStat (overall per-brawler totals)
  --------------------------------------------------
  One row per brawler. Powers the dashboard, counter picker,
  draft simulator, and analyzer.

  Computed directly from BattleRecord with NO map filter, so
  every competitive-mode battle counts toward a brawler's
  overall stats — not just the ones on maps we happen to
  track. This is what fixes the "why does Lou look like
  top-3?" bias the old single-table pipeline had.

  Tracked competitive modes (both tables):
     Gem Grab, Brawl Ball, Bounty, Heist, Hot Zone,
     Knockout, Siege, Wipeout, Duels

  Note on Duels: it's 1v1, not 3v3. Tank/sustain brawlers
  underperform there (burst damage dominates). Included as a
  deliberate product call — it's still real competitive data,
  just weighted into overall stats.

─────────────────────────────────────────────
  STEP 2.5 — WIN RATE SHRINKAGE (stats-utils.ts)
─────────────────────────────────────────────

Raw win rates lie when samples are small. A brawler with a
3-0 record has a 100% win rate but the signal is noise. To
fix this, every displayed win rate gets pulled toward 50%
using a Bayesian prior of 50 virtual 50/50 games:

    shown_rate = (wins + 25) / (total + 50)

Effect at different sample sizes:
    3 wins / 3 games   (100% raw) → 53.6% shown
    27 wins / 50 games (54% raw)  → 52% shown
    270 wins / 500     (54% raw)  → 53.6% shown
    2700 wins / 5000   (54% raw)  → 53.9% shown

Big-sample brawlers barely move. Tiny-sample brawlers get
pulled hard toward the middle so they can't top dashboards
on noise alone.

Pick rate is NOT shrunk — it's a pure ratio and small
samples don't produce misleading outliers there.

─────────────────────────────────────────────
  STEP 2.6 — TIER ASSIGNMENT (safeTier)
─────────────────────────────────────────────

Tiers are the loudest badge on the site, so they need to
mean something. The assignment:

    S = win rate 54%+ AND total battles 1000+
    A = win rate 51%+
    B = win rate 48%+
    C = below 48%

The 1000-battle floor for S is the guard. At 1000 games, a
54% observed rate has a 95% confidence interval of about
±3pp — true rate is very likely 51%+, which is genuinely
strong. Without the floor, a 500-battle brawler with a hot
streak would get the same S badge as one with years of
proven data. The rule references no brawler by name —
everyone auto-promotes or auto-demotes as their data moves.

A, B, C use win rate alone — the prior shrinkage already
handles small samples for the quieter badges.

─────────────────────────────────────────────
  STEP 3 — PER-MAP RANKING (Wilson score)
─────────────────────────────────────────────

Per-map rankings (/maps page) don't sort by raw win rate —
they sort by Wilson score lower bound at 95% confidence with
a 50-game Bayesian prior.

Wilson answers: "what's the LOWEST plausible true win rate
given this sample?" It pulls uncertain samples down harder
than certain ones. So 2-0 (100% raw) ranks below 44-33 (57%
raw) because the first has too little data to trust.

Same trick Reddit uses to rank comments. Right math for
"rank," while we still display the raw (prior-shrunk)
percentage for "what does this brawler actually win at."

─────────────────────────────────────────────
  STEP 3.5 — PICK CALLOUTS (map detail cards)
─────────────────────────────────────────────

Three cards on every map detail page, picked LIVE from the
map's stats — not from a pre-computed field:

  BEST FIRST PICK
     Top of the Wilson-sorted list, restricted to brawlers
     with a real sample. Falls back to rank #1 only if no
     brawler on the map has crossed 50 battles yet.

  SAFEST PICK
     Win rate 51%+ AND pick rate 3%+ AND isReal. The
     consensus strong-and-popular choice. Among qualifiers,
     the most-picked wins the card.

  HIGH RISK / HIGH REWARD
     Win rate 53%+ AND pick rate under 3% AND isReal. Niche
     picks punching above their weight — under-the-radar
     but winning. Highest win rate among qualifiers.

Any of the three can return empty, and the card simply
doesn't render. We'd rather show two cards than fake a
third.

─────────────────────────────────────────────
  STEP 4 — COUNTER ENGINE (counter-engine.ts)
─────────────────────────────────────────────

Used live in the UI — no cron needed.

What it does:

  Brawlers are typed: lane, tank, assassin, thrower, sniper.
  There's a COUNTER_MATRIX that defines the competitive triangle:

    - Lane beats Thrower (out-ranges them)
    - Tank beats Assassin (absorbs burst)
    - Assassin beats Lane (dives squishy targets)
    - Thrower beats Tank (ignores walls)
    - Sniper beats Lane (out-pokes)
    ... and so on

  When you select enemy brawlers in the counter tool or draft
  sim, it scores every available brawler:

    +2 for each enemy type it's strong against
    -1 for each enemy type it's weak against
    + small bonus from win rate (tiebreaker)

  Returns a ranked list of counters with reasons like:
  "Mortis (assassin) counters Poco (lane): gap-closer into
   squishy targets."

  This is labeled as competitive theory in the UI — it's a
  model, not empirical head-to-head data. Our BattleRecord
  only stores the harvested player's brawler per battle, not
  the full enemy roster, so we can't compute true matchup
  win rates yet. That's a planned upgrade once the schema
  captures all 6 participants per battle.

  Runs purely in-memory — no DB calls after the initial
  brawler fetch.

─────────────────────────────────────────────
  STEP 5 — DRAFT ENGINE (draft-engine.ts)
─────────────────────────────────────────────

Powers the draft simulator page.

What it does:

  - Tracks ban/pick state for both teams
  - In ban phase: recommends highest-impact brawlers to ban
    (win rate × pick rate = danger score)
  - In pick phase: runs the counter engine against enemy picks
    and returns top 3 suggestions with reasoning
  - Computes a live draft advantage score:
      (your team avg win rate) - (enemy team avg win rate)
      Positive = you're favoured, negative = you're behind

─────────────────────────────────────────────
  HOW IT ALL CONNECTS
─────────────────────────────────────────────

  Brawl Stars API
        │
        ▼
  scripts/harvest.ts  ──────► BattleRecord table (raw data)
                                      │
                                      ▼
                             stat-aggregator.ts
                                      │
                           ┌──────────┴──────────┐
                           ▼                     ▼
                  BrawlerStat table      MapBrawlerStat table
                  (overall per brawler,   (per-map win/pick,
                   no map filter —        tiers, isReal flag,
                   every tracked battle   Wilson-sorted in UI)
                   counts)                         │
                           │                       │
                           ▼                       ▼
           Dashboard / Counter /              Map detail pages
            Draft / Analyzer                 (rankings + pick
           (shrunk WR, safeTier,               callout cards)
            impact sort, hidden
            gems panel)
                           │
                           ▼
                   Counter engine
                 (type-matrix scoring
                  + WR tiebreaker)
                           │
                           ▼
                   Draft simulator
                (ban/pick suggestions,
                 live advantage score)

─────────────────────────────────────────────
  WHAT EACH DASHBOARD PANEL MEANS
─────────────────────────────────────────────

  TOP METRIC TILES
     Active brawlers     — count currently in the meta
     Avg win rate        — mean across all brawlers (pinned
                            near 50% by construction)
     Top meta brawler    — #1 by impact (win × pick)
     Maps tracked        — count of active maps

  TOP IN META (left panel)
     Sorted by impact = (win rate × pick rate) / 100.
     Answers: "which brawlers are actually shaping the meta?"
     A brawler ranks high because they're picked often AND
     winning. Mortis tops it even though his WR isn't the
     highest on the site — he's in so many games you can't
     ignore him.

  MOST PICKED (right top)
     Pure pick rate sort. Top 5.

  HIGHEST WIN RATE (right bottom)
     Pure win rate sort, filtered to real-sample brawlers.
     Answers a DIFFERENT question than "Top in meta" —
     surfaces under-the-radar brawlers who are statistically
     strongest when they show up, even if they're not
     defining the meta yet. Useful for draft decisions.

─────────────────────────────────────────────
  WHAT WE'RE HONEST ABOUT
─────────────────────────────────────────────

  NO BAN DATA
     The Brawl Stars API doesn't expose ranked-draft bans,
     so we stripped all ban-rate UI from the site. Empty
     columns are worse than no columns. Any meta site
     claiming precise ban rates without a Supercell data
     deal is making them up.

  NO ENEMY BRAWLER DATA (yet)
     We only store the harvested player's brawler per
     battle, not the full 6-brawler lineup. This means
     "pick rate" is really "share of harvested player-
     battles," not true game frequency. Correlates closely
     if the sample is representative, but they're not
     identical.

     It also means counter recommendations are competitive
     theory plus meta strength, not real head-to-head
     matchup data. That's the big planned upgrade.

  ONLY PUBLIC BATTLE LOGS
     No private matches, no club leagues. Only what the
     Brawl Stars public API exposes.

  RATE LIMITED
     The API rate-limits us. Harvester has a 200ms delay
     between requests and respects x-ratelimit-remaining.
     Some stats are always slightly behind live reality.

  LOW-SAMPLE ROWS
     Per-map rows with fewer than 50 battles are marked
     isReal=false. We do not show them in pick callouts or
     use them for S-tier assignment. If you see a stat in
     the UI, it's either backed by ≥50 battles or we've
     labeled it as seeded/simulated.

─────────────────────────────────────────────
  HOW TO VERIFY ANY OF THIS YOURSELF
─────────────────────────────────────────────

  /debug/stats
     Per-brawler comparison of raw BattleRecord win rates
     vs what's stored in the BrawlerStat table. They share
     the same SQL source, so they should match within
     ±0.5pp. Any drift is a real bug. Also shows what
     numbers would look like under the OLD map-filtered
     aggregation path, with deltas — visual proof of the
     bias we fixed.

  /debug/maps
     Which map names from BattleRecord matched our Map
     table and which got dropped. If 5v5 events are
     leaking into 3v3 stats, you'd see it here.

  The Brawl Stars API is public. Pull any player's battle
  log and check our BattleRecord rows against it — they
  should match exactly.

─────────────────────────────────────────────
  ROUTINE TO KEEP DATA FRESH
─────────────────────────────────────────────

  Full pipeline (harvest + aggregate, ~10-20 min):
    npx tsx scripts/pipeline.ts

  Just re-run the math against existing data (~2-7 min):
    npx tsx scripts/pipeline.ts --aggregate-only

  Sync dictionaries + recompute, no new battles:
    npx tsx scripts/pipeline.ts --skip-harvest

  Trigger aggregation via HTTP:
    curl http://localhost:3000/api/cron/aggregate
    (or just let the 2hr cron fire in production)

  After any pipeline run, restart the dev server to flush
  the in-memory cache:
    npm run dev

─────────────────────────────────────────────
  WHY TOP PLAYERS?
─────────────────────────────────────────────

  Leaderboard players play the actual competitive meta.
  They draft intentionally, play optimal modes, and their
  results reflect real brawler strength — not casual chaos.
  This makes the win/pick rates actually meaningful for the
  competitive audience the app targets.

  Chain harvesting one hop deep (400 secondary players on
  top of the initial ~984 from leaderboards) pulls in the
  opponents and teammates those top players fought against.
  So the sample isn't just the top of the ladder — it's
  the competitive ecosystem around them.

================================================
