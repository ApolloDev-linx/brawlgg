# Apollo Meta -- Brawl Stars Intelligence Platform

A competitive analytics platform for Brawl Stars with map meta analysis,
counter matchup logic, draft simulation, player lookup, and playstyle
classification.

## Requirements

- Node.js 18+
- PostgreSQL (local or hosted)
- npm or pnpm

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env.local
# Edit .env.local and add your DATABASE_URL

# 3. Push the database schema
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Seed the database with brawler/map data
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000

## Database Setup

### Option A: Local PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb apollo_meta

# Set in .env.local:
# DATABASE_URL="postgresql://yourusername@localhost:5432/apollo_meta"
```

### Option B: Supabase (free tier)

1. Create a project at https://supabase.com
2. Go to Settings > Database > Connection string
3. Copy the URI and paste into .env.local

### Option C: Railway

1. Create a PostgreSQL service at https://railway.app
2. Copy the connection string into .env.local

## Optional: Brawl Stars API Key

For real player lookups, get an API key at https://developer.brawlstars.com

Add to .env.local:
```
BRAWL_STARS_API_KEY="your-key-here"
```

Without a key, the player lookup generates demonstration data.

## Optional: Redis

For production caching, set REDIS_URL in .env.local.
Without it, the app uses an in-memory cache (fine for development).

## Project Structure

```
src/
  app/            Next.js App Router pages and API routes
  components/     React components (ui, maps, counter, draft, etc.)
  lib/            Shared utilities (prisma, redis, constants)
  services/       Business logic (counter engine, draft engine, etc.)
  jobs/           Background cron jobs
  store/          Zustand state stores
  types/          TypeScript type definitions
prisma/
  schema.prisma   Database schema
  seed.ts         Database seed script
```

## Features

- **Map Meta Engine** -- filterable map list with top brawlers, win/pick/ban
  rates, and tier rankings per map
- **Counter System** -- select enemy brawlers, get scored counter
  recommendations based on the competitive triangle (lanes > tanks > throwers)
- **Draft Simulator** -- full ban/pick flow with AI-powered suggestions and
  draft advantage scoring
- **Player Lookup** -- search by player tag, see trophies, top brawlers, and
  automated playstyle classification
- **Meta Analyzer** -- type/tier distributions, brawler deep-dive with
  matchup analysis

## Deployment

Frontend: Vercel (connect the repo, it auto-detects Next.js)
Database: Railway, Supabase, or Neon
Redis: Upstash (optional)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zustand (client state)
- Redis/in-memory cache
