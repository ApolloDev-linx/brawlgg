/**
 * /api/cron/harvest/route.ts
 *
 * Trigger a leaderboard harvest manually or via cron.
 * Hit GET /api/cron/harvest to start a harvest from prod.
 *
 * Protected by CRON_SECRET if set in env.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runHarvest } from "@/services/leaderboard-harvester";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro only, free plan = 10s max

async function handler(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const start = Date.now();

  try {
    const result = await runHarvest(prisma);
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - start,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message, elapsed_ms: Date.now() - start },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) { return handler(request); }
export async function POST(request: Request) { return handler(request); }
