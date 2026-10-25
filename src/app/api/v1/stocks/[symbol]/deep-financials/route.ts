import { NextRequest, NextResponse } from "next/server";
import { MiQuantProvider } from "@/lib/providers/miquant";

export const dynamic = "force-dynamic";

const BANK_SYMBOLS = new Set([
  "VCB", "BID", "CTG", "TCB", "MBB", "VPB", "ACB", "STB", "HDB", "VIB",
  "TPB", "LPB", "SHB", "MSB", "OCB", "BAB", "BVB", "KLB", "NVB", "PGB",
  "SGB", "VAB", "VBB", "NAB", "EIB"
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    if (!symbol) {
      return NextResponse.json({ success: false, error: "Missing symbol" }, { status: 400 });
    }

    const cleanSymbol = symbol.toUpperCase();
    const isBank = BANK_SYMBOLS.has(cleanSymbol);

    if (isBank) {
      const bankRatios = await MiQuantProvider.getBankRatios(cleanSymbol, "quarterly");
      const latest = bankRatios.length > 0 ? bankRatios[bankRatios.length - 1] : null;

      // Historical 8 quarters
      const history = bankRatios.slice(-8);

      return NextResponse.json({
        success: true,
        data: {
          symbol: cleanSymbol,
          isBank: true,
          latest,
          history,
          benchmarks: {
            nim_rating: (latest?.nim || 0) > 0.035 ? "Xuất sắc (>3.5%)" : (latest?.nim || 0) > 0.025 ? "Khá (2.5% - 3.5%)" : "Trung bình",
            casa_rating: (latest?.casa || 0) > 0.30 ? "Top đầu ngành (>30%)" : (latest?.casa || 0) > 0.18 ? "Tốt (18% - 30%)" : "Thấp (<18%)",
            npl_safety: (latest?.npl || 0) < 0.015 ? "Rủi ro thấp (<1.5%)" : (latest?.npl || 0) < 0.025 ? "An toàn (<2.5%)" : "Cần theo dõi (>2.5%)",
            llr_cushion: (latest?.llr || 0) > 1.0 ? "Đệm dự phòng vững chắc (>100%)" : "Đệm dự phòng trung bình (<100%)",
          },
        },
      });
    } else {
      const assetComposition = await MiQuantProvider.getAssetComposition(cleanSymbol, "SX");

      let breakdown = null;
      if (assetComposition && assetComposition.totalAssets > 0) {
        const total = assetComposition.totalAssets;
        breakdown = {
          cash_pct: Number(((assetComposition.cash / total) * 100).toFixed(1)),
          receivables_pct: Number(((assetComposition.receivables / total) * 100).toFixed(1)),
          inventory_pct: Number(((assetComposition.inventory / total) * 100).toFixed(1)),
          fixed_assets_pct: Number(((assetComposition.fixedAssets / total) * 100).toFixed(1)),
          remaining_pct: Number(((assetComposition.remaining / total) * 100).toFixed(1)),
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          symbol: cleanSymbol,
          isBank: false,
          assetComposition,
          breakdown,
        },
      });
    }
  } catch (err: unknown) {
    console.error("[API Stock Deep Financials] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
