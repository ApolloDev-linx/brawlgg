import { NextResponse } from "next/server";
import { aggregateStats } from "@/services/stat-aggregator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const result = await aggregateStats();

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

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}
