# Apollo Meta — Brawl Stars Intelligence Platform

Competitive analytics for Brawl Stars. Map meta rankings backed by real
battle data, draft simulation, counter matchup logic, and player lookup
with playstyle classification.

Per-map rankings use a Wilson score lower bound with a Bayesian prior, so
a brawler with a 5-0 record on 5 games doesn't outrank one with 700-300
on 1000 games. Small samples are visible but correctly deprioritized.

---

## Requirements

- Node.js 18+
- PostgreSQL (local or hosted)
- npm or pnpm
- **Recommended**: Brawl Stars API key — free at https://developer.brawlstars.com

Without an API key the project still runs, but you'll only see seeded
placeholder stats. With one, the harvester pulls real battle data from
top-ranked players globally.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env.local
# Edit .env.local: set DATABASE_URL and (optionally) BRAWL_STARS_API_KEY

# 3. Push the database schema
npx prisma db push
npx prisma generate

# 4. Seed brawlers, maps, and game modes
npm run db:seed

# 5. (Optional but recommended) Pull in real battle data — takes 10-20 min
npx tsx scripts/pipeline.ts

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000

The seed in step 4 fills the dictionary tables (brawlers, maps, modes)
plus a layer of placeholder stats so the UI has something to render. The
pipeline in step 5 fetches real battles and overwrites the placeholders
with actual numbers — skip it if you just want to poke at the UI.

---

## Database Setup

### Option A: Local PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb apollo_meta

# In .env.local:
# DATABASE_URL="postgresql://yourusername@localhost:5432/apollo_meta"
```

### Option B: Supabase (free tier)

1. Create a project at https://supabase.com
2. Settings → Database → Connection string
3. Paste the URI into `.env.local`

### Option C: Railway

1. Create a PostgreSQL service at https://railway.app
2. Copy the connection string into `.env.local`

---

## Optional: Redis

For production caching, set `REDIS_URL` in `.env.local`. Without it the
app uses an in-memory cache, which is fine for development.

---

## Data Pipeline

Everything important is orchestrated by `scripts/pipeline.ts`. The flow
has four ordered steps:

```
1. Brawler sync   →  Brawlify API        →  Brawler table
2. Map sync       →  Brawlify API        →  Map / GameMode table
3. Harvest        →  Brawl Stars API     →  BattleRecord table
4. Aggregate      →  BattleRecord        →  MapBrawlerStat table
                                              ↓
                                      The UI reads from here
```

Tables in order of authority:

- **Brawler / Map / GameMode** — dictionary data, populated by sync from
  Brawlify. Canonical names live here.
- **BattleRecord** — raw battle log, one row per (player × battle ×
  brawler) combo. Append-only, populated by harvest.
- **MapBrawlerStat** — computed answers, derived from BattleRecord by the
  aggregator. Never edited manually. This is what the UI displays.

### Day-to-day usage

```bash
# Full refresh (10-20 min):
npx tsx scripts/pipeline.ts

# Skip the slow harvest — just resync dictionary tables and recompute stats:
npx tsx scripts/pipeline.ts --skip-harvest

# Already harvested, just want to recompute the math (~2-7 min):
npx tsx scripts/pipeline.ts --aggregate-only
```

After any pipeline run, restart `npm run dev` to flush the in-memory
`maps:all` cache (or wait for the TTL to expire).

### Naming canonicalization

Every brawler name written to any table goes through
`src/lib/brawler-name.ts` first. This converts whatever the upstream API
returns (`"COLT"`, `"larry-lawrie"`, `"MR-P"`) into our canonical format
(`"Colt"`, `"Larry & Lawrie"`, `"Mr. P"`).

If you add a new ingestion path, **always import and use `toBrawlerName`**.
Skipping this step causes the aggregator to silently drop battles for any
brawler whose name doesn't match.

### Stat math, briefly

Per-map brawler rankings use a Wilson score lower bound at 95%
confidence, with a Bayesian prior of 50 virtual 50/50 games added to
every brawler before computing. This means:

- Big-sample brawlers (700-300) barely shift from their observed rate
- Small-sample brawlers (5-0) get pulled hard toward 50% so they don't
  top the rankings on noise

The prior strength is tunable in `src/app/maps/page.tsx` via
`MAP_RANKING_PRIOR`. Higher = more aggressive shrinkage toward the mean.

For the full methodology, see `HOW-OUR-STATS-WORK.md`.

---

## Project Structure

```
src/
  app/                          Next.js App Router pages and API routes
    debug/                      Verification pages (/debug/stats, /debug/maps)
    api/cron/                   Scheduled job endpoints (sync, aggregate)
  components/                   React components (maps, counter, draft, etc.)
  lib/
    brawler-name.ts             Canonical name util — required for all ingestion
    stats-utils.ts              aggregateBrawlerStats, Wilson score, prior helpers
    constants.ts                Brawler types, counter matrix, mode lists
    prisma.ts                   Prisma client singleton
    redis.ts                    Cache layer (Redis or in-memory)
  services/
    brawler-sync.ts             Pulls brawlers from Brawlify → Brawler table
    map-sync.ts                 Pulls maps from Brawlify → Map table
    battle-log-service.ts       Saves battles from individual player lookups
    stat-aggregator.ts          BattleRecord → MapBrawlerStat (the math)
    counter-engine.ts           Scoring for counter matchups
    draft-engine.ts             Draft pick / ban suggestions
    brawlify-api.ts             Brawlify HTTP client
    brawlstars-api.ts           Official Brawl Stars HTTP client
  jobs/                         Background job entry points (sync, compute)
  store/                        Zustand client state
  types/                        TypeScript types

prisma/
  schema.prisma                 Database schema
  seed.ts                       Initial dictionary seed (idempotent)

scripts/
  pipeline.ts                   Full data pipeline orchestrator (start here)
  harvest.ts                    Battle data harvester
  aggregate.ts                  Standalone stat aggregator
  dedup-brawlers.ts             Brawler dedup (one-off, kept for posterity)
  dedup-brawlers-final.ts       Residual & character dedup
  add-missing-brawlers.ts       Targeted insert for individual brawlers
  reconcile-brawler-types.ts    Re-run after BRAWLER_TYPE_OVERRIDES edits

HOW-OUR-STATS-WORK.md           Full stat methodology
```

---

## Features

- **Map Meta Engine** — every brawler with data on a given map, ranked
  by Wilson score + Bayesian prior. Per-row tier, type, win rate, pick
  rate, ban rate. No top-N truncation; small-sample noise is sunk by the
  ranking math, not hidden.
- **Counter System** — pick enemy brawlers, get ranked counter
  recommendations from the competitive triangle (lanes > tanks > throwers).
- **Draft Simulator** — full ban/pick flow with per-phase suggestions
  and a live draft-advantage score.
- **Player Lookup** — search by player tag for trophies, top brawlers,
  and automated playstyle classification. Each lookup also seeds new
  battles into the dataset for free.
- **Meta Analyzer** — type/tier distributions and brawler deep-dives
  with matchup analysis.
- **Debug pages** — `/debug/stats` self-checks the aggregator math
  against raw BattleRecord; `/debug/maps` shows which map names are
  being dropped by the aggregator.

---

## Deployment

- **Frontend**: Vercel (connect the repo, auto-detects Next.js)
- **Database**: Railway, Supabase, or Neon
- **Redis**: Upstash (optional)
- **Cron**: Vercel Cron hits `/api/cron/sync` and `/api/cron/aggregate`
  on a schedule. Long-running harvests are run locally via
  `pipeline.ts` to avoid serverless timeouts.

---

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zustand (client state)
- Redis or in-memory cache
