/**

 *
 * Single source of truth for canonical brawler name formatting.
 *
 * Why this exists:
 *   The Brawl Stars API and Brawlify return brawler names in different
 *   formats — sometimes ALL CAPS ("COLT"), sometimes hyphenated slugs
 *   ("LARRY-LAWRIE"), sometimes already title-cased ("Shelly"). If each
 *   ingestion path normalizes them differently, we end up with mismatched
 *   names between BattleRecord.brawlerName and Brawler.name, and the
 *   aggregator silently drops the unmatched battles.
 *
 *   Every place that writes a brawler name to the DB MUST use this
 *   function so all three tables (Brawler, BattleRecord, MapBrawlerStat)
 *   agree on what to call each brawler.
 *
 * Examples:
 *   "COLT"         -> "Colt"
 *   "el primo"     -> "El Primo"
 *   "EL-PRIMO"     -> "El Primo"
 *   "LARRY-LAWRIE" -> "Larry & Lawrie"
 *   "MR-P"         -> "Mr. P"
 *   "8-BIT"        -> "8-Bit"
 *   "JAE-YONG"     -> "Jae-Yong"
 */
export function toBrawlerName(raw: string): string {
  // Explicit canonicalizations for brawlers the API serves with weird
  // slugs. These take priority over the generic hyphen handling below.
  const CANONICAL: Record<string, string> = {
    "larry-lawrie": "Larry & Lawrie",
    "larry and lawrie": "Larry & Lawrie",
    "mr-p": "Mr. P",
    "mr p": "Mr. P",
    "el-primo": "El Primo",
    // Keep legitimate hyphens:
    "8-bit": "8-Bit",
    "r-t": "R-T",
    "jae-yong": "Jae-Yong",
  };

  const lower = raw.toLowerCase().trim();
  if (CANONICAL[lower]) return CANONICAL[lower];

  // Default path: convert hyphens/underscores to spaces, then title-case.
  return lower
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
