import { NextResponse } from "next/server";
import { getMacroRadarSnapshot } from "@/lib/engines/macro-radar-engine";

export const revalidate = 600; // Cache 10 mins

export async function GET() {
  try {
    const data = await getMacroRadarSnapshot();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("[api/v1/macro/radar] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch macro radar snapshot" },
      { status: 500 }
    );
  }
}
