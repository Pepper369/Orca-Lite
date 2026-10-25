import { NextRequest, NextResponse } from "next/server";
import { getRrgData } from "@/lib/services/rrg-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get("mode") === "vn30" ? "vn30" : "sectors") as "sectors" | "vn30";
    const trail = Math.max(3, Math.min(10, Number(searchParams.get("trail") || 5)));

    const result = await getRrgData(mode, trail);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load RRG data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
