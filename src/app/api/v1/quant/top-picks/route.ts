import { NextResponse } from "next/server";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const picks = await MiQuantEngine.getRankedPicks();
    return NextResponse.json({
      success: true,
      data: picks,
    });
  } catch (err: unknown) {
    console.error("[API Quant Top Picks] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
