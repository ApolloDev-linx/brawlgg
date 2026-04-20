import { prisma } from "@/lib/prisma";

async function main() {
  const all = await prisma.brawler.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  // Normalize by stripping case, spaces, hyphens, underscores, dots
  const byKey: Record<string, typeof all> = {};
  for (const b of all) {
    const key = b.name.toLowerCase().replace(/[\s\-_.]/g, "");
    (byKey[key] ??= []).push(b);
  }

  const dupes = Object.entries(byKey).filter(([, rows]) => rows.length > 1);

  console.log(`Total brawler rows:  ${all.length}`);
  console.log(`Unique (normalized): ${Object.keys(byKey).length}`);
  console.log(`Duplicate groups:    ${dupes.length}`);
  console.log("");
  for (const [key, rows] of dupes.slice(0, 15)) {
    console.log(
      `  ${key}: ` +
        rows.map((r) => `"${r.name}" [${r.type}] (${r.id.slice(0, 8)})`).join(" | ")
    );
  }
}

main().finally(() => prisma.$disconnect());
