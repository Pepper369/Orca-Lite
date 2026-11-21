import { NextRequest, NextResponse } from "next/server";
import {
  calculateHRP,
  calculateNestedClusteredOptimization,
  estimateOrnsteinUhlenbeck,
  calculateAlmgrenChrissExecution,
  calculateDeflatedSharpeRatio,
  calculateVaRAndCVaR,
  evaluateContinuousDrawdownGovernor,
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
import {
  hasPrototypePollutionKey,
  isValidTradingSymbol,
  stripPrototypePollution,
} from "@/app/api/_security";

export const dynamic = "force-dynamic";

const MIN_VARIANCE = 1e-6;
const DEFAULT_VARIANCE = 0.000625; // (2.5% daily vol)^2
const MAX_VARIANCE = 10.0;
const MAX_CORR_ABS = 0.999;

function hasForbiddenProtoPayload(value: unknown, depth = 0): boolean {
  if (depth > 12 || !value || typeof value !== "object") return false;
  if (hasPrototypePollutionKey(value, depth)) return true;
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenProtoPayload(item, depth + 1));
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return true;
    }
    if (hasForbiddenProtoPayload((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

function clampFinite(val: unknown, fallback: number, min: number, max: number): number {
  if (val === null || val === undefined || val === "" || typeof val === "boolean") {
    return fallback;
  }
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optClampFinite(val: unknown, min: number, max: number): number | undefined {
  if (val === null || val === undefined || val === "" || typeof val === "boolean") {
    return undefined;
  }
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/**
 * Sanitizes an n x n covariance matrix:
 * - Replaces non-finite entries with safe finite values
 * - Clamps diagonal variances to strictly positive [MIN_VARIANCE, MAX_VARIANCE]
 * - Symmetrizes off-diagonal covariances and enforces Cauchy-Schwarz correlation bounds
 */
export function sanitizeCovarianceMatrix(rawCov: unknown, n: number): number[][] | null {
  if (!Array.isArray(rawCov) || rawCov.length !== n) return null;
  for (let i = 0; i < n; i++) {
    if (!Array.isArray(rawCov[i]) || (rawCov[i] as unknown[]).length !== n) {
      return null;
    }
  }

  const clean: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  // Step 1: Positive-variance clamping on diagonal
  for (let i = 0; i < n; i++) {
    const rawDiag = Number((rawCov[i] as unknown[])[i]);
    if (!Number.isFinite(rawDiag) || rawDiag <= 0) {
      clean[i][i] = DEFAULT_VARIANCE;
    } else {
      clean[i][i] = Math.min(MAX_VARIANCE, Math.max(MIN_VARIANCE, rawDiag));
    }
  }

  // Step 2: Symmetrize off-diagonals and clamp by Cauchy-Schwarz
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = Number((rawCov[i] as unknown[])[j]);
      const b = Number((rawCov[j] as unknown[])[i]);
      const aFinite = Number.isFinite(a);
      const bFinite = Number.isFinite(b);
      const rawSym =
        aFinite && bFinite ? 0.5 * (a + b) : aFinite ? a : bFinite ? b : 0;
      const maxCov = MAX_CORR_ABS * Math.sqrt(clean[i][i] * clean[j][j]);
      const clampedCov = Math.min(maxCov, Math.max(-maxCov, rawSym));
      clean[i][j] = clampedCov;
      clean[j][i] = clampedCov;
    }
  }

  return clean;
}

function sanitizeSymbolsList(rawSymbols: unknown, defaultSymbols: string[]): string[] | null {
  if (rawSymbols === undefined || rawSymbols === null) {
    return defaultSymbols;
  }
  if (!Array.isArray(rawSymbols)) return null;
  const bounded = rawSymbols.slice(0, 100);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of bounded) {
    if (!isValidTradingSymbol(item)) continue;
    const norm = item.trim().toUpperCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
      if (out.length >= 30) break;
    }
  }
  return out;
}

export async function GET(req?: NextRequest) {
  if (req) {
    const limited = await rateLimit(req, {
      name: "institutional_lab_get",
      binding: "RL_AI",
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;
  }
  try {
    const searchParams = req ? new URL(req.url).searchParams : new URLSearchParams();
    const rawAction = searchParams.get("action") ?? "overview";
    if (rawAction.length > 32 || !/^[a-z0-9_-]+$/i.test(rawAction)) {
      return NextResponse.json(
        { success: false, error: "Invalid action parameter" },
        { status: 400 },
      );
    }
    const action = rawAction.toLowerCase();

    if (action === "overview") {
      const bots = await MiQuantEngine.getBots();
      const botAnalytics = await Promise.all(
        bots.map(async (b) => {
          const symbols = b.target_holdings.map((h) => h.symbol);
          const vols = b.target_holdings.map(
            (h) => clampFinite(h.metrics?.atr_pct, 2.5, 0.1, 100) / 100,
          );
          const { covMatrix, source } = await resolveEmpiricalCovarianceForSymbols(symbols, vols);
          const safeCov =
            sanitizeCovarianceMatrix(covMatrix, symbols.length) ??
            symbols.map((_, i) =>
              symbols.map((__, j) => (i === j ? DEFAULT_VARIANCE : 0)),
            );
          const hrp = calculateHRP(symbols, safeCov);
          const nco = calculateNestedClusteredOptimization(symbols, safeCov);

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

    return NextResponse.json(
      { success: false, error: "Action not recognized" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[API Institutional Lab] GET Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error in Institutional Lab" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    name: "institutional_lab_post",
    binding: "RL_AI",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
    }
    if (hasForbiddenProtoPayload(rawBody)) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload: forbidden prototype keys" },
        { status: 400 },
      );
    }
    const body = stripPrototypePollution(rawBody) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type.trim() : "";

    if (type === "hrp" || type === "nco") {
      const defaults =
        type === "hrp"
          ? ["FPT", "VNM", "SSI", "HPG"]
          : ["FPT", "VNM", "SSI", "HPG", "VCB", "MBB"];
      const symbols = sanitizeSymbolsList(body.symbols, defaults);
      if (!symbols || symbols.length === 0) {
        return NextResponse.json({ success: false, error: "Invalid symbols" }, { status: 400 });
      }
      const n = symbols.length;
      let cov = sanitizeCovarianceMatrix(body.covMatrix, n);
      let covSource = "CALLER_SUPPLIED";

      if (!cov) {
        const fallbackVols = symbols.map(() => 0.025);
        const emp = await resolveEmpiricalCovarianceForSymbols(symbols, fallbackVols);
        cov =
          sanitizeCovarianceMatrix(emp.covMatrix, n) ??
          symbols.map((_, i) =>
            symbols.map((__, j) => (i === j ? DEFAULT_VARIANCE : 0)),
          );
        covSource = emp.source;
      }

      const result =
        type === "hrp"
          ? calculateHRP(symbols, cov)
          : calculateNestedClusteredOptimization(symbols, cov);
      return NextResponse.json({
        success: true,
        data: { ...result, covariance_source: covSource },
      });
    }

    if (type === "almgren_chriss") {
      const result = calculateAlmgrenChrissExecution({
        totalShares: clampFinite(body.totalShares, 100_000, 1, 1e9),
        totalTimeHours: clampFinite(body.totalTimeHours, 4.5, 0.05, 720),
        intervalsCount: Math.round(clampFinite(body.intervalsCount, 9, 1, 200)),
        riskAversion: clampFinite(body.riskAversion, 0.0001, 1e-9, 10),
        dailyVolatilityPct: clampFinite(body.dailyVolatilityPct, 2.5, 0.01, 200),
        tempImpactFactor: clampFinite(body.tempImpactFactor, 1e-6, 1e-12, 1),
        currentPrice: clampFinite(body.currentPrice, 50_000, 0.0001, 1e9),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "dsr") {
      const result = calculateDeflatedSharpeRatio({
        observedSharpe: clampFinite(body.observedSharpe, 1.8, -20, 20),
        trialsCount: Math.round(clampFinite(body.trialsCount, 40, 1, 10_000)),
        sampleLengthBars: Math.round(clampFinite(body.sampleLengthBars, 252, 5, 100_000)),
        skewness: clampFinite(body.skewness, -0.2, -10, 10),
        kurtosis: clampFinite(body.kurtosis, 3.8, 1, 50),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "ou") {
      if (body.series !== undefined && !Array.isArray(body.series)) {
        return NextResponse.json({ success: false, error: "Invalid series payload" }, { status: 400 });
      }
      const defaultSeries = [100, 102, 101, 98, 97, 99, 101, 103, 100, 99];
      const series: number[] = Array.isArray(body.series)
        ? body.series
            .slice(0, 2000)
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
            .map((v) => Math.min(1e12, Math.max(-1e12, v)))
            .slice(0, 1000)
        : defaultSeries;
      if (series.length < 3) {
        return NextResponse.json(
          { success: false, error: "Series requires at least 3 finite numbers" },
          { status: 400 },
        );
      }
      const dt = clampFinite(body.dt, 1.0, 1e-4, 365);
      const result = estimateOrnsteinUhlenbeck(series, dt);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "var_cvar") {
      if (body.returns !== undefined && !Array.isArray(body.returns)) {
        return NextResponse.json({ success: false, error: "Invalid returns payload" }, { status: 400 });
      }
      const defaultReturns = [-0.02, 0.01, -0.015, 0.02, -0.01, 0.005, -0.025, 0.015];
      const returns: number[] = Array.isArray(body.returns)
        ? body.returns
            .slice(0, 5000)
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
            .map((v) => Math.min(10, Math.max(-1, v)))
            .slice(0, 2000)
        : defaultReturns;
      if (returns.length < 2) {
        return NextResponse.json(
          { success: false, error: "Returns requires at least 2 finite numbers" },
          { status: 400 },
        );
      }
      const result = calculateVaRAndCVaR(returns);
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "drawdown_governor") {
      const result = evaluateContinuousDrawdownGovernor({
        currentBalanceUsd: clampFinite(body.currentBalanceUsd, 10_000, 0, 1e12),
        peakBalanceUsd: optClampFinite(body.peakBalanceUsd, 1, 1e12),
        dailyRealizedPnlUsd: clampFinite(body.dailyRealizedPnlUsd, 0, -1e12, 1e12),
        maxDailyLossUsd: clampFinite(body.maxDailyLossUsd, 500, 1, 1e12),
        portfolioAnnualizedVol: optClampFinite(body.portfolioAnnualizedVol, 0.001, 10),
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (type === "smart_execution") {
      if (body.symbol !== undefined && !isValidTradingSymbol(body.symbol)) {
        return NextResponse.json({ success: false, error: "Invalid trading symbol" }, { status: 400 });
      }
      if (
        body.direction !== undefined &&
        body.direction !== "BUY" &&
        body.direction !== "SELL"
      ) {
        return NextResponse.json({ success: false, error: "Invalid direction" }, { status: 400 });
      }
      const symbol = isValidTradingSymbol(body.symbol)
        ? body.symbol.trim().toUpperCase()
        : "BTCUSDT";
      const result = planSmartOrderExecution({
        symbol,
        direction: body.direction === "SELL" ? "SELL" : "BUY",
        totalQty: clampFinite(body.totalQty, 0.5, 1e-6, 1e9),
        entryPrice: clampFinite(body.entryPrice, 91_000, 1e-6, 1e9),
        bestBid: optClampFinite(body.bestBid, 1e-6, 1e9),
        bestAsk: optClampFinite(body.bestAsk, 1e-6, 1e9),
        top5BookDepthUsd: optClampFinite(body.top5BookDepthUsd, 0, 1e12),
      });
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json(
      { success: false, error: "Loại tính toán không được hỗ trợ" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[API Institutional Lab] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error in Institutional Lab" },
      { status: 500 },
    );
  }
}
