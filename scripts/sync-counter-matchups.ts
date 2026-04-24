import { PrismaClient } from "@prisma/client";
import { syncCounterMatchups } from "../src/services/brawler-sync";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Syncing counter matchups ===\n");
  const result = await syncCounterMatchups(prisma);
  console.log(`\nTotal upserts: ${result.total}`);
  console.log(`Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log("\nFirst few errors:");
    result.errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
  }
  console.log("\n=== Done ===");
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
