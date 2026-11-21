import { NextRequest, NextResponse } from "next/server";
import {
  calculateHRP,
  calculateNestedClusteredOptimization,
  estimateOrnsteinUhlenbeck,
  calculateAlmgrenChrissExecution,
  calculateDeflatedSharpeRatio,
  calculateVaRAndCVaR,
  calculateTripleBarrierLevels,
  evaluateContinuousDrawdownGovernor,
  evaluateFactorExposureBudget,
} from "@/lib/engines/advanced-quant-math";
import {
  getEmpiricalFrictionTelemetry,
  planSmartOrderExecution,
} from "@/lib/engines/exchange-execution-client";
import {
  MiQuantEngine,
  resolveEmpiricalCovarianceForSymbols,
} from "@/lib/engines/miquant-quant-engine";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTradingSymbol } from "@/app/api/_security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "overview";

    if (action === "overview") {
      const bots = await MiQuantEngine.getBots();
      // Compile institutional analytics for all 6 bots using empirical Ledoit-Wolf shrinkage covariance
      const botAnalytics = await Promise.all(
        bots.map(async (b) => {
          const symbols = b.target_holdings.map((h) => h.symbol);
          const vols = b.target_holdings.map((h) => (h.metrics?.atr_pct || 2.5) / 100);
          const { covMatrix, source } = await resolveEmpiricalCovarianceForSymbols(symbols, vols);
          const hrp = calculateHRP(symbols, covMatrix);
          const nco = calculateNestedClusteredOptimization(symbols, covMatrix);

          return {
            id: b.id,
            name: b.name,
            backtest: b.backtest,
            institutional_metrics: b.institutional_metrics,
            hrp_weights: hrp.weights,
            nco_weights: nco.weights,
            nco_clusters: nco.clusters,
            ordered_symbols: hrp.orderedSymbols,
            covariance_source: source,
          };
        }),
      );

      return NextResponse.json({
        success: true,
        data: {
          botAnalytics,
          executionTelemetry: getEmpiricalFrictionTelemetry(),
          frameworks: [
            "Hierarchical Risk Parity (HRP) & Nested Clustered Optimization (NCO) - Marcos López de Prado",
            "Ornstein-Uhlenbeck (OU) Mean Reversion Half-Life",
            "Almgren-Chriss (2000) Optimal Execution & Post-Only Maker Pegging",
            "Deflated Sharpe Ratio (DSR) & Combinatorial Purged PBO",
            "Triple-Barrier Method & Purged Isotonic Meta-Labeling",
            "Value-at-Risk (VaR), Expected Shortfall (CVaR) & Continuous Drawdown Governor",
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
  const limited = await rateLimit(req, { name: "institutional_lab_post", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
    }
    const type = body.type; // "hrp" | "almgren_chriss" | "dsr" | "ou" | "var_cvar"

    if (type === "hrp") {
      const rawSymbols = Array.isArray(body.symbols) ? body.symbols : ["FPT", "VNM", "SSI", "HPG"];
      const symbols: string[] = rawSymbols
        .filter((s): s is string => isValidTradingSymbol(s))
        .map((s) => s.trim().toUpperCase())
        .slice(0, 30);
      if (symbols.length === 0) {
        return NextResponse.json({ success: false, error: "Invalid symbols" }, { status: 400 });
      }
      const n = symbols.length;
      let cov: number[][] | undefined = Array.isArray(body.covMatrix) ? (body.covMatrix as number[][]) : undefined;

      let covSource: string = "CALLER_SUPPLIED";
      if (!cov || cov.length !== n || cov.some((row) => !Array.isArray(row) || row.length !== n)) {
        const fallbackVols = symbols.map(() => 0.025);
        const emp = await resolveEmpiricalCovarianceForSymbols(symbols, fallbackVols);
        cov = emp.covMatrix;
        covSource = emp.source;
      }

      const result = calculateHRP(symbols, cov);
      return NextResponse.json({ success: true, data: { ...result, covariance_source: covSource } });
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
      const series: number[] = Array.isArray(body.series)
        ? body.series.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).slice(0, 1000)
        : [100, 102, 101, 98, 97, 99, 101, 103, 100, 99];
      const result = estimateOrnsteinUhlenbeck(series, Number(body.dt || 1.0));
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "var_cvar") {
      const returns: number[] = Array.isArray(body.returns)
        ? body.returns.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).slice(0, 2000)
        : [-0.02, 0.01, -0.015, 0.02, -0.01, 0.005, -0.025, 0.015];
      const result = calculateVaRAndCVaR(returns);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "nco") {
      const rawSymbols = Array.isArray(body.symbols) ? body.symbols : ["FPT", "VNM", "SSI", "HPG", "VCB", "MBB"];
      const symbols: string[] = rawSymbols
        .filter((s): s is string => isValidTradingSymbol(s))
        .map((s) => s.trim().toUpperCase())
        .slice(0, 30);
      if (symbols.length === 0) {
        return NextResponse.json({ success: false, error: "Invalid symbols" }, { status: 400 });
      }
      const n = symbols.length;
      let cov: number[][] | undefined = Array.isArray(body.covMatrix) ? (body.covMatrix as number[][]) : undefined;
      let covSource = "CALLER_SUPPLIED";
      if (!cov || cov.length !== n || cov.some((row) => !Array.isArray(row) || row.length !== n)) {
        const emp = await resolveEmpiricalCovarianceForSymbols(symbols, symbols.map(() => 0.025));
        cov = emp.covMatrix;
        covSource = emp.source;
      }
      const result = calculateNestedClusteredOptimization(symbols, cov);
      return NextResponse.json({ success: true, data: { ...result, covariance_source: covSource } });
    }

    if (type === "drawdown_governor") {
      const result = evaluateContinuousDrawdownGovernor({
        currentBalanceUsd: Number(body.currentBalanceUsd || 10000),
        peakBalanceUsd: body.peakBalanceUsd != null ? Number(body.peakBalanceUsd) : undefined,
        dailyRealizedPnlUsd: Number(body.dailyRealizedPnlUsd || 0),
        maxDailyLossUsd: Number(body.maxDailyLossUsd || 500),
        portfolioAnnualizedVol: body.portfolioAnnualizedVol != null ? Number(body.portfolioAnnualizedVol) : undefined,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "smart_execution") {
      const result = planSmartOrderExecution({
        symbol: typeof body.symbol === "string" ? body.symbol : "BTCUSDT",
        direction: body.direction === "SELL" ? "SELL" : "BUY",
        totalQty: Number(body.totalQty || 0.5),
        entryPrice: Number(body.entryPrice || 91000),
        bestBid: body.bestBid != null ? Number(body.bestBid) : undefined,
        bestAsk: body.bestAsk != null ? Number(body.bestAsk) : undefined,
        top5BookDepthUsd: body.top5BookDepthUsd != null ? Number(body.top5BookDepthUsd) : undefined,
      });
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
