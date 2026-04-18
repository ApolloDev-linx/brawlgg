# How Our Stats Work

A no-BS guide to where Apollo Meta's numbers come from, how they end up in our database, and why you can trust them. If you've ever stared at a meta site and asked "...ok but where is this actually coming from?" — this is for you.

---

## The short version

1. We pull **real battle data** straight from Supercell's official Brawl Stars API.
2. Every time someone looks up a player on our site, we quietly save their last ~25 battles.
3. We also run a **harvester** that pulls the top 200 global and regional players, plus every opponent and teammate in their battle logs.
4. A background job aggregates those battles every 2 hours into win rates, pick rates, and tier rankings per map.
5. Stats only get marked as **"real"** once we have at least **50 battles** for that brawler on that map. Below that threshold, we fall back to simulated placeholders so maps never look empty.
6. The **Triangle Counter** system layers a type-based matchup model on top of those real stats to recommend counter picks.

That's the whole pipeline. The rest of this doc is just explaining each piece honestly.

---

## Where the data comes from

**Source:** the official Brawl Stars API at `api.brawlstars.com/v1`, run by Supercell themselves. Same API every serious BS site uses. You can get a key at developer.brawlstars.com.

Every battle record we store comes from one of two endpoints:

- `/players/{tag}/battlelog` — a single player's last ~25 battles
- `/rankings/{country}/players` — top 200 players on global or regional leaderboards

We do **not** scrape, make up, or buy data. If the API didn't report a battle, it's not in our system.

---

## How battles get into the database

Two ways, both automated:

### 1. Passive collection — player lookups

Every time someone searches a player tag on our site, we fire off a background job that saves that player's battle log. The lookup response itself isn't blocked by this — it just happens behind the scenes. So every search helps build our dataset.

From `src/app/api/players/[tag]/route.ts`:

```ts
// Fire-and-forget: save battle log in the background
// This seeds our real stats dataset without blocking the response
saveBattleLog(prisma, tag).then(...)
```

### 2. Active collection — the harvester

`scripts/harvest.ts` is a script we run that:

1. Pulls the top 200 players from the global leaderboard and several regional ones.
2. Gets each of their battle logs.
3. For every battle, grabs the tags of all 6 players involved.
4. Goes one level deep and pulls their battle logs too.

That's how we get broad coverage without needing millions of users. Top players tend to play against other top players, so chain-harvesting one level deep snowballs into thousands of competitive battles fast.

---

## What we filter out

Not every battle counts. The ingestion code specifically throws away:

- **Friendly games** (`battle.type === "friendly"`) — no stakes, people troll-pick
- **Practice matches**
- **Showdown solo/duo** when computing 3v3 meta stats — different game entirely
- **Modes we don't track** — only `gemGrab`, `brawlBall`, `bounty`, `heist`, `hotZone`, `knockout`, `siege` count as "competitive 3v3"
- **Battles with missing map or mode data** — can't attribute them anywhere

This matters. A lot of sloppy meta sites don't filter friendlies and end up with weird picks dominating because people meme in custom rooms.

---

## How we compute the actual numbers

This all lives in `src/services/stat-aggregator.ts` and runs every 2 hours.

### Win rate

```
winRate = (wins / total_battles) × 100
```

Rounded to one decimal. A brawler played 1000 times on a map with 540 wins has a 54.0% win rate. That's it — no weighting, no secret sauce.

### Pick rate

```
pickRate = (times_this_brawler_was_picked / total_picks_on_this_map) × 100
```

Same deal — straight ratio.

### Sample size and the "isReal" flag

Every stat row has an `isReal` boolean. It gets flipped to `true` only when:

```ts
const MIN_SAMPLE = 50;
const isReal = stats.total >= MIN_SAMPLE;
```

Below 50 recorded battles on that map for that brawler, the number is considered unreliable and treated as a placeholder. You'll see a small indicator in the UI telling you which stats are real vs. seeded.

**Why 50?** It's the point where the margin of error on a win rate tightens enough to be meaningful (roughly ±7 points at a 95% confidence level). More is obviously better — 500 battles gets you to ±2 points — but 50 is the minimum bar before we'll call it a real signal.

### Tier assignment

```ts
if (winRate >= 54) return "S";
if (winRate >= 51) return "A";
if (winRate >= 48) return "B";
return "C";
```

That's the whole function. No committee of experts, no vibes. Pure win rate buckets.

---

## The Triangle Counter — how it actually works

This is the piece most people are curious about. It sits in `src/lib/constants.ts` and `src/services/counter-engine.ts`.

### The model

Every brawler is tagged with one of five **types**:

- **Lane / Control** — mid-range consistent damage (Tara, Gene, Byron)
- **Tank** — high HP, short range (Rosa, El Primo, Frank)
- **Assassin** — burst damage, mobility (Edgar, Mortis, Leon)
- **Thrower** — lobs projectiles over walls (Barley, Dyna, Tick)
- **Sniper** — long-range high-damage (Piper, Brock, Belle)

The types form a rock-paper-scissors style matrix. The core rules:

| Type     | Strong vs        | Weak vs       |
|----------|------------------|---------------|
| Lane     | Tank, Assassin   | Thrower, Sniper |
| Tank     | Thrower, Sniper  | Lane          |
| Assassin | Thrower, Sniper  | Lane, Tank    |
| Thrower  | Lane             | Tank, Assassin |
| Sniper   | Lane             | Tank, Assassin |

This isn't arbitrary — it mirrors how the game actually plays. Tanks close the gap on squishy backline brawlers. Snipers and throwers punish lanes that try to hold open ground. Lanes out-trade tanks and assassins when they can keep distance. Assassins dive the backline but get melted by sustained lane damage.

### The scoring

When you plug enemy picks into the counter tool, every available brawler gets a `counterScore` computed like this:

```
For each enemy pick:
  +2 if my brawler's type is strong against the enemy's type
  -1 if my brawler's type is weak against the enemy's type

Then: + (winRate - 50) / 5   ← small tiebreaker from real map data
```

Example — enemy team is a Tank, an Assassin, and a Thrower. You're considering a Lane brawler.

- Strong vs Tank → +2
- Strong vs Assassin → +2
- Weak vs Thrower → -1
- Win rate on this map is 53% → +0.6

Final score: **+3.6**

A Sniper in the same spot:

- Weak vs Tank → -1
- Weak vs Assassin → -1
- Strong vs Thrower → +2
- Win rate 55% → +1.0

Final score: **+1.0**

The Lane brawler wins the recommendation, even though the Sniper has a higher raw win rate. That's the whole point — the counter engine accounts for matchup dynamics, not just "who's strongest overall."

### Why this isn't just a gimmick

Two reasons:

1. The types are **manually curated** (see `BRAWLER_TYPE_OVERRIDES` in `constants.ts`) rather than pulled blindly from Supercell's role tags, because Supercell's labels are for beginner UX, not competitive accuracy. An "Assassin" in the in-game menu might actually behave like a Lane brawler competitively.
2. The win-rate component is small on purpose (÷5). It's a tiebreaker, not the driver. That way a brawler doesn't get recommended just because they're S-tier in the abstract — they have to actually counter what's in front of them.

---

## How often things update

| What                          | How often        | Where              |
|-------------------------------|------------------|--------------------|
| Battle records ingested       | Continuously, per lookup | API route handler |
| Aggregated win/pick rates     | Every 2 hours    | Cron job           |
| Tier recalculation + daily snapshot | Every 2 hours | `compute-win-rates.ts` |
| Harvester (bulk seeding)      | Manual, ~every few days | `scripts/harvest.ts` |
| API response cache            | 5 minutes        | Redis / in-memory  |

So the numbers you're looking at are at most 2 hours stale on the aggregation side, and at most 5 minutes stale on the API cache side.

---

## What we're honest about

A few things skeptics should know that most meta sites bury:

- **Ban rates are currently 0 on most rows.** The Brawl Stars API doesn't expose bans from ranked drafts cleanly, so our ban rate column is mostly placeholder until Supercell opens that data up or we build a ranked-draft ingestion path. Anyone claiming precise ban rates without a ranked data deal is probably guessing.
- **We don't see private matches or club leagues.** Only public battle logs.
- **The API rate-limits us.** We can't re-pull everyone's log every minute. There's a 200ms delay between requests in the harvester and we respect the `x-ratelimit-remaining` header. Some stats will always be slightly behind live reality.
- **Low-sample rows are seeded.** If a brawler has been played 12 times on a new map, you'll see a number — but `isReal: false`. Don't screenshot that and post it as gospel.
- **Counter scores are a model, not a ground truth.** They're grounded in type theory plus real win rates, but they won't capture every interaction (e.g. specific gadget/star power synergies). Use them as a starting point, not scripture.

---

## How to verify any of this yourself

1. Every file mentioned in this doc is in our repo — `src/services/stat-aggregator.ts`, `src/services/counter-engine.ts`, `src/services/battle-log-service.ts`, `scripts/harvest.ts`.
2. The Brawl Stars API is public. Pull the same battle log for any player and check our stored `BattleRecord` rows against it — they should match exactly.
3. Pick any map-brawler row in the database and divide `wins / total` yourself. Should equal our displayed win rate to one decimal.

That's it. No magic, no paid data feeds, no ML models guessing at reality. Just Supercell's own battle data, filtered, aggregated, and served back to you — with the matchup triangle layered on top to turn raw win rates into actual draft advice.
