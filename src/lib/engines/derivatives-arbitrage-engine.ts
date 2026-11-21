import { getVnIndices, getVnOhlcv } from "../services/stocks-board";
import { getDerivativeContractDetail, resolveVn30Spot } from "../services/derivatives";
import { getDerivHistory, recordDerivSample } from "../services/derivatives-history";
import { getEconomyBundle } from "../services/economy";
import { normalizeEconomicText } from "../economic-data";
import {
  calibrateBasisOrnsteinUhlenbeck,
  type OUBasisCalibration,
} from "./unified-cross-asset-quant";
import { classifyDerivFlow } from "./derivatives-flow";

export interface ScheduledVn30Dividend {
  symbol: string;
  weightInVn30: number; // e.g. 0.085 (8.5% weight in VN30 basket)
  cashDividendVnd: number; // e.g. 1500 VND/share
  stockPriceVnd: number; // e.g. 130000 VND/share
  daysToExDate: number; // days from now until ex-dividend date
}

export interface DividendAdjustedBasisResult {
  spotPrice: number;
  repoRateAnnual: number;
  daysToExpiry: number;
  grossCarryPoints: number;
  presentValueDividendPoints: number;
  fairValuePrice: number;
  netCarryAnnualizedPct: number;
}

export interface KalmanHedgeRatioResult {
  alphaIntercept: number;
  dynamicBetaHedgeRatio: number;
  innovationSpreadPts: number;
  innovationStdPts: number;
  kalmanZScore: number;
  hedgeSignal: "LONG_FUTURES_SHORT_BASKET" | "SHORT_FUTURES_LONG_BASKET" | "NEUTRAL_EQUILIBRIUM";
}

export interface BasisFlowRegimeResult {
  regime:
    | "DIRECTIONAL_HEDGING_DO_NOT_FADE"
    | "ACTIONABLE_ARBITRAGE_MISPRICING"
    | "ROLL_YIELD_CARRY_OPPORTUNITY"
    | "BALANCED_BASIS";
  canFadeBasis: boolean;
  oiFlowSignal: string;
  rationaleVi: string;
}

/**
 * Computes Dividend-Adjusted Fair Futures Price for VN30F:
 * F_fair = S * exp(r * T) - sum_{j in VN30, t_ex <= T} w_j * S * (Div_j / P_j) * exp(r * (T - t_ex))
 */
export function computeDividendAdjustedFairBasis(params: {
  spotPrice: number;
  repoRateAnnual: number;
  daysToExpiry: number;
  upcomingDividends?: ScheduledVn30Dividend[];
  fallbackDividendYieldAnnual?: number;
}): DividendAdjustedBasisResult {
  const {
    spotPrice,
    repoRateAnnual,
    daysToExpiry,
    upcomingDividends,
    fallbackDividendYieldAnnual = 0.015,
  } = params;

  const T = Math.max(1, daysToExpiry) / 365;
  const r = Math.max(-0.02, Math.min(0.20, repoRateAnnual));
  const grossForward = spotPrice * Math.exp(r * T);
  const grossCarryPoints = Number((grossForward - spotPrice).toFixed(2));

  let pvDividendPts = 0;
  if (upcomingDividends && upcomingDividends.length > 0) {
    for (const d of upcomingDividends) {
      if (d.daysToExDate < 0 || d.daysToExDate > daysToExpiry) continue;
      if (d.stockPriceVnd <= 0 || d.cashDividendVnd <= 0 || d.weightInVn30 <= 0) continue;
      const divYieldStock = d.cashDividendVnd / d.stockPriceVnd;
      const tauRemain = Math.max(0, daysToExpiry - d.daysToExDate) / 365;
      // Forward value at expiry of the discrete dividend drop in index points
      pvDividendPts += spotPrice * d.weightInVn30 * divYieldStock * Math.exp(r * tauRemain);
    }
  } else {
    pvDividendPts = spotPrice * (1 - Math.exp(-Math.max(0, fallbackDividendYieldAnnual) * T));
  }

  const presentValueDividendPoints = Number(pvDividendPts.toFixed(2));
  const fairValuePrice = Number((grossForward - presentValueDividendPoints).toFixed(1));
  const netCarryAnnualizedPct =
    spotPrice > 0 && T > 0
      ? Number((((fairValuePrice - spotPrice) / spotPrice / T) * 100).toFixed(2))
      : Number((r * 100).toFixed(2));

  return {
    spotPrice,
    repoRateAnnual: r,
    daysToExpiry,
    grossCarryPoints,
    presentValueDividendPoints,
    fairValuePrice,
    netCarryAnnualizedPct,
  };
}

/**
 * 2-State Causal Kalman Filter estimating Dynamic Hedge Ratio (alpha_t, beta_t)
 * between VN30F Futures (F_t) and VN30 Spot/ETF Basket (S_t):
 *   F_t = alpha_t + beta_t * S_t + eps_t
 */
export function estimateKalmanDynamicHedgeRatio(
  futuresPrices: number[],
  spotPrices: number[],
  deltaProcessNoise = 1e-4,
  obsNoiseVar = 1.25,
): KalmanHedgeRatioResult {
  const n = Math.min(futuresPrices.length, spotPrices.length);
  if (n < 5) {
    const fLast = futuresPrices[futuresPrices.length - 1] ?? 1250;
    const sLast = spotPrices[spotPrices.length - 1] ?? 1250;
    const diff = fLast - sLast;
    return {
      alphaIntercept: 0,
      dynamicBetaHedgeRatio: 1.0,
      innovationSpreadPts: Number(diff.toFixed(2)),
      innovationStdPts: 2.0,
      kalmanZScore: Number((diff / 2.0).toFixed(2)),
      hedgeSignal: "NEUTRAL_EQUILIBRIUM",
    };
  }

  // State x = [alpha, beta]^T initialized at [0, 1.0]
  let alpha = 0;
  let beta = 1.0;
  const s0 = Math.max(1, spotPrices[0] ?? 1250);
  // Covariance P (2x2), with beta variance scaled by 1 / S^2 for scale invariance
  let p00 = 4.0;
  let p01 = 0.0;
  let p10 = 0.0;
  let p11 = 0.05 / (s0 * s0);

  const q00 = deltaProcessNoise * 50;
  const R = Math.max(0.05, obsNoiseVar);

  let lastInnovation = 0;
  let lastInnovationStd = 1.5;

  for (let t = 0; t < n; t++) {
    const F = futuresPrices[t]!;
    const S = spotPrices[t]!;
    if (!Number.isFinite(F) || !Number.isFinite(S) || S <= 0) continue;

    // 1. State Prediction: P_{t|t-1} = P_{t-1} + Q (scale beta process noise by 1 / S^2)
    p00 += q00;
    p11 += deltaProcessNoise / (S * S);

    // 2. Measurement Innovation: e_t = F_t - (alpha + beta * S_t), H = [1, S]
    const yHat = alpha + beta * S;
    const e = F - yHat;

    // Innovation variance Q_t = H * P * H^T + R
    const hp0 = p00 + S * p10;
    const hp1 = p01 + S * p11;
    const Qt = Math.max(1e-6, hp0 + hp1 * S + R);

    // 3. Kalman Gain K = P * H^T / Qt
    const k0 = (p00 + p01 * S) / Qt;
    const k1 = (p10 + p11 * S) / Qt;

    // 4. Posterior State Update
    alpha += k0 * e;
    beta = Math.max(0.5, Math.min(1.5, beta + k1 * e));

    // 5. Posterior Covariance Update P_t = (I - K * H) * P_{t|t-1}
    const newP00 = (1 - k0) * p00 - k0 * S * p10;
    const newP01 = (1 - k0) * p01 - k0 * S * p11;
    const newP10 = -k1 * p00 + (1 - k1 * S) * p10;
    const newP11 = -k1 * p01 + (1 - k1 * S) * p11;
    p00 = Math.max(1e-8, newP00);
    p01 = newP01;
    p10 = newP10;
    p11 = Math.max(1e-8, newP11);

    lastInnovation = e;
    lastInnovationStd = Math.sqrt(Qt);
  }

  const kalmanZScore = Number((lastInnovation / Math.max(0.25, lastInnovationStd)).toFixed(2));
  let hedgeSignal: KalmanHedgeRatioResult["hedgeSignal"] = "NEUTRAL_EQUILIBRIUM";
  if (kalmanZScore <= -1.85) {
    hedgeSignal = "LONG_FUTURES_SHORT_BASKET";
  } else if (kalmanZScore >= 1.85) {
    hedgeSignal = "SHORT_FUTURES_LONG_BASKET";
  }

  return {
    alphaIntercept: Number(alpha.toFixed(3)),
    dynamicBetaHedgeRatio: Number(beta.toFixed(4)),
    innovationSpreadPts: Number(lastInnovation.toFixed(2)),
    innovationStdPts: Number(lastInnovationStd.toFixed(2)),
    kalmanZScore,
    hedgeSignal,
  };
}

/**
 * Separates institutional directional hedging flow (where basis divergence must NOT be faded)
 * from transient arbitrage mispricing using Price x Open Interest flow and Roll Yield.
 */
export function evaluateBasisFlowRegime(params: {
  mispricingPts: number;
  kalmanZScore: number;
  priceChangePts?: number | null;
  oiChangeContracts?: number | null;
  rollYieldAnnualizedPct?: number | null;
}): BasisFlowRegimeResult {
  const {
    mispricingPts,
    kalmanZScore,
    priceChangePts = 0,
    oiChangeContracts = 0,
    rollYieldAnnualizedPct = null,
  } = params;

  const flow = classifyDerivFlow({
    symbol: "VN30F1M",
    priceChange: priceChangePts ?? 0,
    oiChange: oiChangeContracts ?? 0,
  });

  // If basis is deeply negative (backwardation) AND Short Build-up is active (price down, OI surging),
  // institutions are aggressively opening directional shorts — do NOT fade basis!
  if (mispricingPts <= -4.5 && flow.kind === "short_build_up") {
    return {
      regime: "DIRECTIONAL_HEDGING_DO_NOT_FADE",
      canFadeBasis: false,
      oiFlowSignal: flow.kind,
      rationaleVi:
        "Cảnh báo: Basis âm sâu đi kèm Short Build-up (OI tăng + Giá giảm). Khối tổ chức đang mở mới vị thế Short xu hướng — KHÔNG bắt đáy Reverse Cash & Carry lúc này.",
    };
  }

  // If basis is deeply positive (contango) AND Long Build-up is surging, momentum breakout is underway
  if (mispricingPts >= 5.0 && flow.kind === "long_build_up" && kalmanZScore < 2.6) {
    return {
      regime: "DIRECTIONAL_HEDGING_DO_NOT_FADE",
      canFadeBasis: false,
      oiFlowSignal: flow.kind,
      rationaleVi:
        "Basis dương đi kèm Long Build-up (OI tăng + Giá bứt phá). Lực cầu xu hướng đang áp đảo — hạn chế Short chặn đầu.",
    };
  }

  if (Math.abs(kalmanZScore) >= 1.85 || Math.abs(mispricingPts) >= 4.0) {
    return {
      regime: "ACTIONABLE_ARBITRAGE_MISPRICING",
      canFadeBasis: true,
      oiFlowSignal: flow.kind,
      rationaleVi: `Độ lệch Kalman Z=${kalmanZScore} (Mispricing ${mispricingPts >= 0 ? "+" : ""}${mispricingPts} điểm) không có áp lực OI ngược pha — Thuận lợi giao dịch hội tụ Basis.`,
    };
  }

  if (rollYieldAnnualizedPct != null && Math.abs(rollYieldAnnualizedPct) >= 6.0) {
    return {
      regime: "ROLL_YIELD_CARRY_OPPORTUNITY",
      canFadeBasis: true,
      oiFlowSignal: flow.kind,
      rationaleVi: `Lợi suất Roll Yield kỳ hạn F1M-F2M đạt ${rollYieldAnnualizedPct.toFixed(1)}%/năm — Có thể khai thác Calendar Spread.`,
    };
  }

  return {
    regime: "BALANCED_BASIS",
    canFadeBasis: false,
    oiFlowSignal: flow.kind,
    rationaleVi: "Basis và dòng tiền OI ở trạng thái cân bằng.",
  };
}

export interface DerivativesArbitrageSignal {
  symbol: string;
  underlyingSymbol: string;
  derivativePrice: number | null;
  underlyingIndexPrice: number | null;
  basis: number | null; // derivativePrice - underlyingIndexPrice
  basisPct: number | null;
  fairValuePrice: number | null;
  mispricing: number | null; // derivativePrice - fairValuePrice
  carryRatePct: number;
  carryRateSource: "LIVE_ECONOMY_ADJUSTED" | "BASELINE_ASSUMPTION";
  provenance: "LIVE_QUOTE" | "HISTORICAL_BARS" | "UNAVAILABLE";
  isUnavailable?: boolean;
  ouDtMinutes: number;
  marketState: "CONTANGO_HIGH" | "CONTANGO_MODERATE" | "FAIR_VALUE" | "BACKWARDATION_MODERATE" | "BACKWARDATION_DEEP" | "UNAVAILABLE";
  stateDescription: string;
  arbitrageRecommendation: {
    action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION";
    actionTitleVi: string;
    description: string;
    expectedGainPts: number;
  };
  ouCalibration?: OUBasisCalibration;
  dividendAdjustedBasis?: DividendAdjustedBasisResult;
  kalmanHedge?: KalmanHedgeRatioResult;
  basisFlowRegime?: BasisFlowRegimeResult;
  daysToExpiry: number;
  expiryDateStr: string;
  updatedAt: string;
}

function normalizeEpochMsLocal(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function inferMedianDtMinutes(timestampsMs: number[], fallbackMinutes: number): number {
  if (timestampsMs.length < 2) return fallbackMinutes;
  const deltas: number[] = [];
  for (let i = 1; i < timestampsMs.length; i++) {
    const diff = timestampsMs[i]! - timestampsMs[i - 1]!;
    if (Number.isFinite(diff) && diff > 0) {
      deltas.push(diff / 60_000);
    }
  }
  if (!deltas.length) return fallbackMinutes;
  deltas.sort((a, b) => a - b);
  const mid = deltas[Math.floor(deltas.length / 2)]!;
  return Math.max(0.25, Math.round(mid * 10) / 10);
}

function getNextThirdThursday(): { days: number; dateStr: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Find 3rd Thursday of current month
  let firstDay = new Date(year, month, 1);
  let thursdayCount = 0;
  let targetDate = new Date(year, month, 1);

  for (let day = 1; day <= 31; day++) {
    const cur = new Date(year, month, day);
    if (cur.getMonth() !== month) break;
    if (cur.getDay() === 4) { // Thursday
      thursdayCount++;
      if (thursdayCount === 3) {
        targetDate = cur;
        break;
      }
    }
  }

  // If already passed this month's 3rd Thursday, take next month's
  if (now > targetDate) {
    const nextMonth = (month + 1) % 12;
    const nextYear = nextMonth === 0 ? year + 1 : year;
    thursdayCount = 0;
    for (let day = 1; day <= 31; day++) {
      const cur = new Date(nextYear, nextMonth, day);
      if (cur.getMonth() !== nextMonth) break;
      if (cur.getDay() === 4) {
        thursdayCount++;
        if (thursdayCount === 3) {
          targetDate = cur;
          break;
        }
      }
    }
  }

  const diffMs = targetDate.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return { days, dateStr: targetDate.toISOString().slice(0, 10) };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function getDerivativesArbitrageSignal(
  symbol = "VN30F1M",
  historicalBasisSeries?: number[],
  explicitDtMinutes?: number,
): Promise<DerivativesArbitrageSignal> {
  const sym = symbol.toUpperCase();

  // 1. Fetch live quotes & macro interest rate concurrently with strict timeouts (never invent prices)
  const [contractPack, indicesPack, economyPack, futOhlcvPack, spotOhlcvPack] = await Promise.all([
    withTimeout(getDerivativeContractDetail(sym), 2000, null).catch(() => null),
    withTimeout(getVnIndices(), 2000, null).catch(() => null),
    withTimeout(getEconomyBundle(), 1500, null).catch(() => null),
    withTimeout(getVnOhlcv(sym, 45), 2000, null).catch(() => null),
    withTimeout(getVnOhlcv("VN30", 45, "index"), 2000, null).catch(() => null),
  ]);

  const contractQuote = contractPack?.data?.quote;
  const vn30Item = indicesPack?.items?.find(
    (i) => (i.code ?? (i as { symbol?: string }).symbol ?? "").toUpperCase() === "VN30",
  );
  const spotFallback =
    contractPack?.data?.spot?.price ??
    (vn30Item?.value && vn30Item.value > 0
      ? vn30Item.value
      : (await withTimeout(resolveVn30Spot(), 1500, null).catch(() => null))?.price ?? null);

  const futBars = futOhlcvPack?.bars ?? [];
  const spotBars = spotOhlcvPack?.bars ?? [];

  let provenance: DerivativesArbitrageSignal["provenance"] = "LIVE_QUOTE";
  let fPrice: number | null =
    contractQuote?.last != null && Number.isFinite(contractQuote.last) && contractQuote.last > 0
      ? contractQuote.last
      : null;
  let cashPrice: number | null =
    spotFallback != null && Number.isFinite(spotFallback) && spotFallback > 0 ? spotFallback : null;

  if (fPrice == null && futBars.length > 0) {
    const lastFut = futBars[futBars.length - 1]!.close;
    if (Number.isFinite(lastFut) && lastFut > 0) {
      fPrice = lastFut;
      provenance = "HISTORICAL_BARS";
    }
  }
  if (cashPrice == null && spotBars.length > 0) {
    const lastSpot = spotBars[spotBars.length - 1]!.close;
    if (Number.isFinite(lastSpot) && lastSpot > 0) {
      cashPrice = lastSpot;
      provenance = "HISTORICAL_BARS";
    }
  }

  const { days, dateStr } = getNextThirdThursday();

  // Derive net cost-of-carry rate from live interbank/deposit rate minus assumed dividend yield (1.5%/yr)
  let carryRate = 0.03;
  let carryRateSource: DerivativesArbitrageSignal["carryRateSource"] = "BASELINE_ASSUMPTION";
  const rateRows = economyPack?.rate?.data?.rows ?? [];
  const fundingRow =
    rateRows.find((r) => normalizeEconomicText(r.name).includes("lien ngan hang 1 thang")) ??
    rateRows.find((r) => normalizeEconomicText(r.name).includes("lien ngan hang qua dem")) ??
    rateRows.find((r) => normalizeEconomicText(r.name).includes("tai cap von"));
  if (fundingRow?.current?.value != null && Number.isFinite(fundingRow.current.value) && fundingRow.current.value > 0) {
    const repoRate = fundingRow.current.value / 100;
    const estDivYield = 0.015;
    carryRate = Math.max(-0.02, Math.min(0.12, repoRate - estDivYield));
    carryRateSource = "LIVE_ECONOMY_ADJUSTED";
  }

  if (fPrice == null || cashPrice == null) {
    provenance = "UNAVAILABLE";
    return {
      symbol: sym,
      underlyingSymbol: "VN30",
      derivativePrice: fPrice,
      underlyingIndexPrice: cashPrice,
      basis: null,
      basisPct: null,
      fairValuePrice: null,
      mispricing: null,
      carryRatePct: Number((carryRate * 100).toFixed(2)),
      carryRateSource,
      provenance,
      isUnavailable: true,
      ouDtMinutes: explicitDtMinutes ?? 1,
      marketState: "UNAVAILABLE",
      stateDescription: "Chưa đủ báo giá live VN30F / VN30 để định giá Basis chuẩn xác (Truth-in-Data: không tự bịa giá fallback).",
      arbitrageRecommendation: {
        action: "NO_ACTION",
        actionTitleVi: "Tạm dừng định giá — Thiếu dữ liệu live",
        description: "Hệ thống đang chờ báo giá hợp đồng tương lai và chỉ số cơ sở VN30 từ nguồn dữ liệu chính thống.",
        expectedGainPts: 0,
      },
      daysToExpiry: days,
      expiryDateStr: dateStr,
      updatedAt: new Date().toISOString(),
    };
  }

  const basis = Number((fPrice - cashPrice).toFixed(1));
  const basisPct = Number(((basis / cashPrice) * 100).toFixed(2));
  const repoRate =
    carryRateSource === "LIVE_ECONOMY_ADJUSTED" ? carryRate + 0.015 : 0.045;
  const dividendAdjustedBasis = computeDividendAdjustedFairBasis({
    spotPrice: cashPrice,
    repoRateAnnual: repoRate,
    daysToExpiry: days,
    fallbackDividendYieldAnnual: 0.015,
  });
  const fairValuePrice = dividendAdjustedBasis.fairValuePrice;
  const mispricing = Number((fPrice - fairValuePrice).toFixed(1));

  let marketState: DerivativesArbitrageSignal["marketState"] = "FAIR_VALUE";
  let stateDescription = "Thị trường phái sinh đang giao dịch sát vùng cân bằng giá trị lý thuyết.";

  let action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION" = "NO_ACTION";
  let actionTitleVi = "Quan sát / Trạng thái cân bằng";
  let description = "Chênh lệch Basis nằm trong biên độ hẹp an toàn (-3.0 đến +3.0 điểm). Chi phí giao dịch sẽ triệt tiêu lợi nhuận Arbitrage.";
  let expectedGainPts = 0;

  if (basis >= 8.0) {
    marketState = "CONTANGO_HIGH";
    stateDescription = "Phái sinh đang cao hơn cơ sở đáng kể (Contango giãn rộng). Tâm lý đầu cơ Short term quá lạc quan.";
    action = "CASH_AND_CARRY";
    actionTitleVi = "Kinh doanh chênh lệch giá (Cash & Carry Arbitrage)";
    description = `Mở vị thế BÁN (Short) hợp đồng ${sym} quanh ${fPrice} và MUA đồng thời rổ cổ phiếu cơ sở VN30 để khóa mức lợi nhuận cố định khi Basis hội tụ về 0 vào ngày đáo hạn.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis >= 3.0) {
    marketState = "CONTANGO_MODERATE";
    stateDescription = "Thị trường ở trạng thái Contango nhẹ, kỳ vọng chỉ số VN30 tiếp tục duy trì đà tăng trưởng.";
  } else if (basis <= -8.0) {
    marketState = "BACKWARDATION_DEEP";
    stateDescription = "Phái sinh đang chiết khấu sâu so với cơ sở (Backwardation âm lớn). Khối tổ chức đang đẩy mạnh vị thế phòng hộ rủi ro (Hedging).";
    action = "REVERSE_CASH_AND_CARRY";
    actionTitleVi = "Đảo ngược chênh lệch giá (Reverse Cash & Carry)";
    description = `Mở vị thế MUA (Long) hợp đồng ${sym} chiết khấu sâu và BÁN/HẠ TỶ TRỌNG rổ danh mục cơ sở để tận dụng nhịp nảy phục hồi khi Basis thu hẹp.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis <= -3.0) {
    marketState = "BACKWARDATION_MODERATE";
    stateDescription = "Thị trường ở trạng thái Backwardation nhẹ, nhà đầu tư cẩn trọng trước các biến động ngắn hạn.";
  }

  if (contractQuote?.last != null) {
    recordDerivSample({
      symbol: sym,
      ts: Date.now(),
      last: contractQuote.last,
      openInterest: contractQuote.openInterest ?? null,
      volume: contractQuote.volume ?? null,
      basis,
      source: contractQuote.source ?? "derivatives-arbitrage-engine",
    });
  }

  // Continuous Ornstein-Uhlenbeck (OU) Mean-Reversion Calibration with accurate dtMinutes scaling
  let resolvedBasisSeries: number[] = [];
  let resolvedDtMinutes = explicitDtMinutes ?? 1;

  if (historicalBasisSeries && historicalBasisSeries.length >= 15) {
    resolvedBasisSeries = historicalBasisSeries;
    resolvedDtMinutes = explicitDtMinutes ?? 1;
  } else {
    const ringSamples = getDerivHistory(sym, 60).filter(
      (s) => s.basis != null && Number.isFinite(s.basis),
    );
    if (ringSamples.length >= 15) {
      resolvedBasisSeries = ringSamples.map((s) => s.basis as number);
      resolvedDtMinutes = inferMedianDtMinutes(ringSamples.map((s) => s.ts), 1);
    }
  }

  if (resolvedBasisSeries.length < 15 && futBars.length >= 15 && spotBars.length >= 15) {
    const spotByDay = new Map<string, number>();
    for (const b of spotBars) {
      const ms = normalizeEpochMsLocal(b.time);
      spotByDay.set(new Date(ms).toISOString().slice(0, 10), b.close);
    }
    const dailyBasis: number[] = [];
    const dailyTimes: number[] = [];
    for (const b of futBars) {
      const ms = normalizeEpochMsLocal(b.time);
      const sClose = spotByDay.get(new Date(ms).toISOString().slice(0, 10));
      if (sClose != null && Number.isFinite(b.close)) {
        dailyBasis.push(Number((b.close - sClose).toFixed(2)));
        dailyTimes.push(ms);
      }
    }
    if (dailyBasis.length >= 15) {
      dailyBasis[dailyBasis.length - 1] = basis;
      resolvedBasisSeries = dailyBasis;
      // Daily series defaults to 1440 minutes (never erroneously 1 minute)
      resolvedDtMinutes = inferMedianDtMinutes(dailyTimes, 1440);
    }
  }

  let ouCalibration: OUBasisCalibration | undefined;
  if (resolvedBasisSeries.length >= 15) {
    ouCalibration = calibrateBasisOrnsteinUhlenbeck(resolvedBasisSeries, resolvedDtMinutes);
  }

  const alignedFut: number[] = [];
  const alignedSpot: number[] = [];
  if (futBars.length >= 5 && spotBars.length >= 5) {
    const m = Math.min(futBars.length, spotBars.length);
    for (let i = 0; i < m; i++) {
      alignedFut.push(futBars[futBars.length - m + i]!.close);
      alignedSpot.push(spotBars[spotBars.length - m + i]!.close);
    }
    alignedFut[alignedFut.length - 1] = fPrice;
    alignedSpot[alignedSpot.length - 1] = cashPrice;
  } else {
    alignedFut.push(fPrice);
    alignedSpot.push(cashPrice);
  }

  const kalmanHedge = estimateKalmanDynamicHedgeRatio(alignedFut, alignedSpot);
  const priceChangePts =
    alignedFut.length >= 2 ? alignedFut[alignedFut.length - 1]! - alignedFut[alignedFut.length - 2]! : 0;
  const basisFlowRegime = evaluateBasisFlowRegime({
    mispricingPts: mispricing,
    kalmanZScore: kalmanHedge.kalmanZScore,
    priceChangePts,
    oiChangeContracts: 0,
  });

  return {
    symbol: sym,
    underlyingSymbol: "VN30",
    derivativePrice: fPrice,
    underlyingIndexPrice: cashPrice,
    basis,
    basisPct,
    fairValuePrice,
    mispricing,
    carryRatePct: Number((carryRate * 100).toFixed(2)),
    carryRateSource,
    provenance,
    isUnavailable: false,
    ouDtMinutes: resolvedDtMinutes,
    marketState,
    stateDescription,
    arbitrageRecommendation: {
      action,
      actionTitleVi,
      description,
      expectedGainPts,
    },
    ouCalibration,
    dividendAdjustedBasis,
    kalmanHedge,
    basisFlowRegime,
    daysToExpiry: days,
    expiryDateStr: dateStr,
    updatedAt: new Date().toISOString(),
  };
}

export interface Vn30fScenarioTailHedgeResult {
  recommendedShortContracts: number;
  hedgeCoverageRatio: number; // [0, 1]
  contractMultiplierVnd: number; // 100,000 VND / point
  contractNotionalVnd: number;
  effectiveHedgeBeta: number;
  isHedgeTriggered: boolean;
  rationaleVi: string;
}

/**
 * Phase 4C: Computes the exact number of VN30F1M short contracts required to hedge
 * a T+2.5 locked Vietnam Equity portfolio when Macro Shock (S4) or Tail Crisis (S5)
 * probability rises above the protection threshold.
 * - Uses the official HNX VN30F contract multiplier: 100,000 VND per index point.
 * - Scales hedge coverage smoothly by Kalman Dynamic Hedge Ratio & tail scenario probability.
 */
export function computeVn30fScenarioTailHedge(params: {
  equityPortfolioVnd: number;
  t2LockedFraction?: number; // [0, 1], default 0.70
  portfolioBeta?: number; // default 1.05
  vn30FuturesPrice: number; // e.g. 1320.5 points
  kalmanHedgeRatio?: number; // from estimateKalmanDynamicHedgeRatio, default 1.0
  macroAndCrisisProb: number; // p(S4) + p(S5) in [0, 1]
}): Vn30fScenarioTailHedgeResult {
  const CONTRACT_MULTIPLIER_VND = 100_000;
  const safeEquityVnd =
    typeof params.equityPortfolioVnd === "number" &&
    Number.isFinite(params.equityPortfolioVnd) &&
    params.equityPortfolioVnd > 0
      ? Math.min(1e15, params.equityPortfolioVnd)
      : 0;
  const safeFuturesPrice =
    typeof params.vn30FuturesPrice === "number" &&
    Number.isFinite(params.vn30FuturesPrice) &&
    params.vn30FuturesPrice > 100
      ? Math.min(10_000, params.vn30FuturesPrice)
      : 1300;
  const t2Locked =
    typeof params.t2LockedFraction === "number" && Number.isFinite(params.t2LockedFraction)
      ? Math.min(1, Math.max(0, params.t2LockedFraction))
      : 0.7;
  const beta =
    typeof params.portfolioBeta === "number" && Number.isFinite(params.portfolioBeta)
      ? Math.min(3.0, Math.max(0.2, params.portfolioBeta))
      : 1.05;
  const kalmanRatio =
    typeof params.kalmanHedgeRatio === "number" && Number.isFinite(params.kalmanHedgeRatio)
      ? Math.min(2.0, Math.max(0.4, params.kalmanHedgeRatio))
      : 1.0;
  const tailProb =
    typeof params.macroAndCrisisProb === "number" && Number.isFinite(params.macroAndCrisisProb)
      ? Math.min(1, Math.max(0, params.macroAndCrisisProb))
      : 0;

  const contractNotionalVnd = Math.round(safeFuturesPrice * CONTRACT_MULTIPLIER_VND);
  const effectiveHedgeBeta = Number((beta * kalmanRatio).toFixed(3));

  if (safeEquityVnd <= 0 || tailProb < 0.35 || t2Locked <= 0) {
    return {
      recommendedShortContracts: 0,
      hedgeCoverageRatio: 0,
      contractMultiplierVnd: CONTRACT_MULTIPLIER_VND,
      contractNotionalVnd,
      effectiveHedgeBeta,
      isHedgeTriggered: false,
      rationaleVi: `Rủi ro kịch bản đuôi (${(tailProb * 100).toFixed(1)}%) dưới ngưỡng 35% -> Không cần mở hợp đồng Short VN30F phòng hộ.`,
    };
  }

  // Smoothly scale coverage from 35% up to 100% of T+2.5 locked equity as tailProb rises from 0.35 to 0.80
  const rawCoverage = Math.min(1.0, 0.35 + ((tailProb - 0.35) / 0.45) * 0.65) * t2Locked;
  const hedgeCoverageRatio = Number(rawCoverage.toFixed(3));
  const hedgedEquityVnd = safeEquityVnd * hedgeCoverageRatio * effectiveHedgeBeta;
  const recommendedShortContracts = Math.max(0, Math.round(hedgedEquityVnd / contractNotionalVnd));

  return {
    recommendedShortContracts,
    hedgeCoverageRatio,
    contractMultiplierVnd: CONTRACT_MULTIPLIER_VND,
    contractNotionalVnd,
    effectiveHedgeBeta,
    isHedgeTriggered: recommendedShortContracts > 0,
    rationaleVi:
      `Phòng hộ T+2.5 VN30F: Xác suất sốc vĩ mô/khủng hoảng ${(tailProb * 100).toFixed(1)}% -> ` +
      `Khuyến nghị SHORT ${recommendedShortContracts} HĐ VN30F1M (Beta hiệu dụng ${effectiveHedgeBeta}, bảo vệ ${(hedgeCoverageRatio * 100).toFixed(0)}% danh mục cơ sở).`,
  };
}
