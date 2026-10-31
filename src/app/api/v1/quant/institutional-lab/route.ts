import { NextRequest, NextResponse } from "next/server";
import {
  calculateHRP,
  estimateOrnsteinUhlenbeck,
  calculateAlmgrenChrissExecution,
  calculateDeflatedSharpeRatio,
  calculateVaRAndCVaR,
  calculateTripleBarrierLevels,
} from "@/lib/engines/advanced-quant-math";
import { MiQuantEngine } from "@/lib/engines/miquant-quant-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "overview";

    if (action === "overview") {
      const bots = await MiQuantEngine.getBots();
      // Compile institutional analytics for all 6 bots
      const botAnalytics = bots.map((b) => {
        const symbols = b.target_holdings.map((h) => h.symbol);
        const vols = b.target_holdings.map((h) => (h.metrics?.atr_pct || 2.5) / 100);
        const n = symbols.length;
        const cov: number[][] = [];
        for (let i = 0; i < n; i++) {
          cov[i] = [];
          for (let j = 0; j < n; j++) {
            cov[i][j] = i === j ? vols[i] * vols[i] : 0.35 * vols[i] * vols[j];
          }
        }
        const hrp = calculateHRP(symbols, cov);

        return {
          id: b.id,
          name: b.name,
          backtest: b.backtest,
          institutional_metrics: b.institutional_metrics,
          hrp_weights: hrp.weights,
          ordered_symbols: hrp.orderedSymbols,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          botAnalytics,
          frameworks: [
            "Hierarchical Risk Parity (HRP) - Marcos López de Prado (2016)",
            "Ornstein-Uhlenbeck (OU) Mean Reversion Half-Life",
            "Almgren-Chriss (2000) Optimal Execution Trajectory",
            "Deflated Sharpe Ratio (DSR) - Multiple Testing Adjustment",
            "Triple-Barrier Method - Dynamic Volatility Horizons",
            "Value-at-Risk (VaR) & Expected Shortfall (CVaR)",
          ],
        },
      });
    }

    return NextResponse.json({ success: true, message: "Action not recognized" });
  } catch (error) {
    console.error("[API Institutional Lab] GET Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error in Institutional Lab" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type; // "hrp" | "almgren_chriss" | "dsr" | "ou" | "var_cvar"

    if (type === "hrp") {
      const symbols: string[] = body.symbols || ["FPT", "VNM", "SSI", "HPG"];
      const n = symbols.length;
      let cov: number[][] = body.covMatrix;

      if (!cov || cov.length !== n) {
        cov = [];
        const vols = symbols.map((_, i) => (2.0 + (i % 3) * 0.8) / 100);
        for (let i = 0; i < n; i++) {
          cov[i] = [];
          for (let j = 0; j < n; j++) {
            cov[i][j] = i === j ? vols[i] * vols[i] : 0.3 * vols[i] * vols[j];
          }
        }
      }

      const result = calculateHRP(symbols, cov);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "almgren_chriss") {
      const result = calculateAlmgrenChrissExecution({
        totalShares: Number(body.totalShares || 100000),
        totalTimeHours: Number(body.totalTimeHours || 4.5),
        intervalsCount: Number(body.intervalsCount || 9),
        riskAversion: Number(body.riskAversion || 0.0001),
        dailyVolatilityPct: Number(body.dailyVolatilityPct || 2.5),
        tempImpactFactor: Number(body.tempImpactFactor || 1e-6),
        currentPrice: Number(body.currentPrice || 50000),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "dsr") {
      const result = calculateDeflatedSharpeRatio({
        observedSharpe: Number(body.observedSharpe || 1.8),
        trialsCount: Number(body.trialsCount || 40),
        sampleLengthBars: Number(body.sampleLengthBars || 252),
        skewness: Number(body.skewness || -0.2),
        kurtosis: Number(body.kurtosis || 3.8),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "ou") {
      const series: number[] = body.series || [100, 102, 101, 98, 97, 99, 101, 103, 100, 99];
      const result = estimateOrnsteinUhlenbeck(series, Number(body.dt || 1.0));
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "var_cvar") {
      const returns: number[] = body.returns || [-0.02, 0.01, -0.015, 0.02, -0.01, 0.005, -0.025, 0.015];
      const result = calculateVaRAndCVaR(returns);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: "Loại tính toán không được hỗ trợ" }, { status: 400 });
  } catch (error) {
    console.error("[API Institutional Lab] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error in Institutional Lab" },
      { status: 500 }
    );
  }
}
