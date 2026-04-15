import { NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { CACHE_TTL } from "@/lib/constants";
import { getMetaOverview } from "@/services/meta-engine";

export async function GET() {
  try {
    const data = await cached("api:meta:overview", CACHE_TTL.META, async () => {
      return getMetaOverview();
    });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch meta data", detail: error.message },
      { status: 500 }
    );
  }
}
