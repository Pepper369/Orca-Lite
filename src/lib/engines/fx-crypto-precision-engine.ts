import type { OhlcvBar } from "../types";
import { adx, atr, ema, macd, rsi, sma, supportResistance } from "../technical";
import {
  computeEfficiencyRatio,
  estimateClvOrderFlowImbalance,
  getAssetPipSize,
  resampleOhlcvBars,
  roundPrice,
} from "./asset-precision";
import { analyzeIctSmcLiquidity } from "./ict-smc-liquidity-engine";
import { evaluateHighWinrateGate } from "./high-winrate-gate";
import { calculateRequiredSpeedPace } from "./quant-reversal-pace";

export type SetupGrade = "A+" | "A" | "B" | "NO_TRADE";

export interface PrecisionSetupInput {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  barsExecution: OhlcvBar[];
  barsHtf?: OhlcvBar[] | null;
  barsMacro?: OhlcvBar[] | null;
  candidateDirection?: "BUY" | "SELL" | "AUTO";
  candidateEntry?: number | null;
  candidateStopLoss?: number | null;
  spreadPipsOrPct?: number | null;
  orderBookImbalance?: number | null;
  fundingRate?: number | null;
  csmBaseMinusQuote?: number | null;
  sessionLabel?: string | null;
  isNewsOrCascadeLockout?: boolean;
  lockoutReason?: string | null;
  timeframeSec?: number;
  secondsRemaining?: number;
}

export interface PrecisionTradeSetup {
  direction: "BUY" | "SELL" | "NEUTRAL";
  action: "BUY" | "SELL" | "WAIT";
  grade: SetupGrade;
  precisionScore: number; // 0 - 100
  calibratedWinRatePct: number; // 38 - 84
  expectancyR: number;
  recommendedSizeMultiplier: number; // 1.0 (A+), 0.85 (A), 0.5 (B), 0 (NO_TRADE)
  entryMode: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  entry: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  grossRiskReward: number | null;
  netRiskReward: number | null;
  frictionR: number;
  regime: {
    state: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "CHOPPY" | "EXTREME_VOL";
    adx14: number;
    efficiencyRatio: number;
    atrRatio: number;
  };
  gatesPassed: string[];
  gatesFailed: string[];
  vetoReasons: string[];
  breakevenPlan: {
    tp1ClosePct: number;
    moveSlToBeAtTp1: boolean;
    trailingAtrMult: number;
  };
  summaryVi: string;
}

function emptyPrecisionSetup(reason: string): PrecisionTradeSetup {
  return {
    direction: "NEUTRAL",
    action: "WAIT",
    grade: "NO_TRADE",
    precisionScore: 30,
    calibratedWinRatePct: 40,
    expectancyR: 0,
    recommendedSizeMultiplier: 0,
    entryMode: "WAIT",
    entry: null,
    entryZone: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    grossRiskReward: null,
    netRiskReward: null,
    frictionR: 0,
    regime: { state: "RANGING", adx14: 0, efficiencyRatio: 0, atrRatio: 1 },
    gatesPassed: [],
    gatesFailed: [reason],
    vetoReasons: [reason],
    breakevenPlan: { tp1ClosePct: 50, moveSlToBeAtTp1: true, trailingAtrMult: 1.0 },
    summaryVi: reason,
  };
}

function inferEmaBias(bars: OhlcvBar[], fastP = 9, slowP = 21): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (bars.length < 10) return "NEUTRAL";
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const sP = Math.max(6, Math.min(slowP, n - 1));
  const fP = Math.max(3, Math.min(fastP, sP - 2));
  const f = ema(closes, fP)[n - 1];
  const s = ema(closes, sP)[n - 1];
  const prevS = ema(closes, sP)[n - 2];
  const lastClose = closes[n - 1]!;
  if (f == null || s == null) return "NEUTRAL";
  const slopeUp = prevS == null || s >= prevS * 0.9998;
  const slopeDown = prevS == null || s <= prevS * 1.0002;
  if (f > s && lastClose >= s && slopeUp) return "BULLISH";
  if (f < s && lastClose <= s && slopeDown) return "BEARISH";
  return "NEUTRAL";
}

function computeSessionVwap(bars: OhlcvBar[]): number | null {
  const slice = bars.slice(-96);
  let pv = 0;
  let vv = 0;
  for (const b of slice) {
    const v = b.volume > 0 ? b.volume : 1;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vv += v;
  }
  return vv > 0 ? pv / vv : null;
}

/**
 * Evaluates Forex or Crypto OHLCV setups through a unified 7-Gate Causal Precision Engine.
 * Assigns setup grades (A+, A, B, NO_TRADE), cost-adjusted net R:R, calibrated win rate, and expectancy E[R].
 */
export function evaluatePrecisionTradeSetup(input: PrecisionSetupInput): PrecisionTradeSetup {
  const {
    symbol,
    assetType,
    barsExecution,
    barsHtf,
    barsMacro,
    candidateDirection = "AUTO",
    candidateEntry,
    candidateStopLoss,
    spreadPipsOrPct,
    orderBookImbalance,
    fundingRate,
    csmBaseMinusQuote,
    sessionLabel,
    isNewsOrCascadeLockout = false,
    lockoutReason,
    timeframeSec = 300,
    secondsRemaining = 60,
  } = input;

  if (!barsExecution || barsExecution.length < 30) {
    return emptyPrecisionSetup("Thiếu dữ liệu nến (<30 nến) để thẩm định tín hiệu.");
  }

  const n = barsExecution.length;
  const lastBar = barsExecution[n - 1]!;
  const currentPrice = lastBar.close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return emptyPrecisionSetup("Dữ liệu giá không hợp lệ.");
  }

  const fmtP = (p: number) => roundPrice(p, symbol, assetType);
  const pip = getAssetPipSize(symbol, assetType, currentPrice);
  const closes = barsExecution.map((b) => b.close);
  const highs = barsExecution.map((b) => b.high);
  const lows = barsExecution.map((b) => b.low);

  // ------------------------------------------------------------------
  // 1. CAUSAL MULTI-TIMEFRAME RESAMPLING & REGIME DIAGNOSIS
  // ------------------------------------------------------------------
  const htf = barsHtf && barsHtf.length >= 16 ? barsHtf : resampleOhlcvBars(barsExecution, 4);
  const macro = barsMacro && barsMacro.length >= 12 ? barsMacro : resampleOhlcvBars(barsExecution, 12);

  const atr14 = atr(barsExecution, 14) ?? Math.max(pip * 8, lastBar.high - lastBar.low);
  const longBaseline = barsExecution.length >= 40 ? barsExecution.slice(-65, -5) : barsExecution.slice(-30, -1);
  const histRanges = longBaseline.map((b) => Math.max(pip, b.high - b.low)).sort((a, b) => a - b);
  const medianRange = histRanges.length ? histRanges[Math.floor(histRanges.length / 2)]! : atr14;
  const lastRange = Math.max(0, lastBar.high - lastBar.low);
  const atrRatio = medianRange > 0 ? atr14 / medianRange : 1.0;

  const adxPeriod = n >= 28 ? 14 : Math.max(5, Math.floor(n / 2) - 1);
  const adxVal = adx(highs, lows, closes, adxPeriod).adx[n - 1] ?? 18;
  const erVal = computeEfficiencyRatio(closes, 14);

  const e21Series = ema(closes, 21);
  let whipsawFlips = 0;
  let prevSign = 0;
  for (let i = Math.max(21, n - 14); i < n; i++) {
    const ev = e21Series[i];
    if (ev == null) continue;
    const sgn = closes[i]! > ev ? 1 : closes[i]! < ev ? -1 : 0;
    if (sgn !== 0 && prevSign !== 0 && sgn !== prevSign) whipsawFlips++;
    if (sgn !== 0) prevSign = sgn;
  }

  const execBias = inferEmaBias(barsExecution, 9, 21);
  const htfBias = htf.length >= 10 ? inferEmaBias(htf, 7, 16) : execBias;
  const macroBias = macro.length >= 10 ? inferEmaBias(macro, 5, 13) : htfBias;

  const isExtremeSpike =
    (atrRatio >= 2.2 && whipsawFlips >= 2) ||
    (atrRatio >= 2.35 && lastRange > atr14 * 2.2) ||
    lastRange > Math.max(atr14, medianRange) * 3.4;
  const isDeadChop = (adxVal < 19 && erVal < 0.25) || (whipsawFlips >= 4 && erVal < 0.30);

  let regimeState: PrecisionTradeSetup["regime"]["state"] = "RANGING";
  if (isExtremeSpike) {
    regimeState = "EXTREME_VOL";
  } else if (isDeadChop) {
    regimeState = "CHOPPY";
  } else if (execBias === "BULLISH" && (htfBias !== "BEARISH" || adxVal >= 20)) {
    regimeState = "TRENDING_UP";
  } else if (execBias === "BEARISH" && (htfBias !== "BULLISH" || adxVal >= 20)) {
    regimeState = "TRENDING_DOWN";
  }

  // ------------------------------------------------------------------
  // 2. ICT/SMC STRUCTURE, ORDER FLOW & MOMENTUM SIGNALS
  // ------------------------------------------------------------------
  const ict = analyzeIctSmcLiquidity({
    symbol,
    bars: barsExecution,
    currentPrice,
    assetType,
    pipSize: pip,
  });

  const realImbalance = orderBookImbalance != null ? orderBookImbalance : estimateClvOrderFlowImbalance(barsExecution, 12);
  const e9 = ema(closes, 9)[n - 1] ?? currentPrice;
  const e21 = ema(closes, 21)[n - 1] ?? currentPrice;
  const rsiArr = rsi(closes, 14);
  const rsi14 = rsiArr[n - 1] ?? 50;
  const macdHist = macd(closes).histogram;
  const histLast = macdHist[n - 1] ?? 0;
  const vwap = computeSessionVwap(barsExecution);

  const bullSweepRecent = ict.recentSweeps.some(
    (s) => s.side === "SELL_SIDE_SWEPT" && s.barIndex >= n - 4,
  );
  const bearSweepRecent = ict.recentSweeps.some(
    (s) => s.side === "BUY_SIDE_SWEPT" && s.barIndex >= n - 4,
  );
  const bullMss = ict.marketStructure.lastMss === "BULLISH_MSS";
  const bearMss = ict.marketStructure.lastMss === "BEARISH_MSS";

  // ------------------------------------------------------------------
  // 3. SYMMETRICAL DIRECTIONAL SCORING (NO BLIND BULL BIAS)
  // ------------------------------------------------------------------
  let bullPts = 0;
  let bearPts = 0;

  if (execBias === "BULLISH") bullPts += 18;
  else if (execBias === "BEARISH") bearPts += 18;

  if (htfBias === "BULLISH") bullPts += 20;
  else if (htfBias === "BEARISH") bearPts += 20;

  if (macroBias === "BULLISH") bullPts += 14;
  else if (macroBias === "BEARISH") bearPts += 14;

  if (bullSweepRecent) bullPts += 20;
  if (bearSweepRecent) bearPts += 20;

  if (bullMss || ict.optimalTradeSetup.direction === "BUY") bullPts += 14;
  if (bearMss || ict.optimalTradeSetup.direction === "SELL") bearPts += 14;

  if (histLast > 0) bullPts += 8;
  else if (histLast < 0) bearPts += 8;

  if (vwap != null) {
    if (currentPrice > vwap) bullPts += 7;
    else if (currentPrice < vwap) bearPts += 7;
  }

  if (realImbalance >= 18) bullPts += 10;
  else if (realImbalance <= -18) bearPts += 10;

  if (csmBaseMinusQuote != null) {
    if (csmBaseMinusQuote >= 1.2) bullPts += 10;
    else if (csmBaseMinusQuote <= -1.2) bearPts += 10;
  }

  let resolvedDir: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (candidateDirection === "BUY" || candidateDirection === "SELL") {
    resolvedDir = candidateDirection;
  } else {
    const gap = Math.abs(bullPts - bearPts);
    if (gap >= 12) {
      resolvedDir = bullPts > bearPts ? "BUY" : "SELL";
    }
  }

  const vetoReasons: string[] = [];
  const gatesPassed: string[] = [];
  const gatesFailed: string[] = [];

  if (isNewsOrCascadeLockout) {
    vetoReasons.push(lockoutReason ?? "Khiên tin đỏ / biến động mạnh đang kích hoạt khóa giao dịch");
    gatesFailed.push("Gate 7 (News/Cascade Shield): Đóng băng mở vị thế mới");
  } else {
    gatesPassed.push("Gate 7: Không có khóa tin đỏ vĩ mô hoặc bão thanh lý");
  }

  if (resolvedDir === "NEUTRAL") {
    vetoReasons.push("Lực mua/bán cân bằng, thiếu ưu thế định hướng rõ ràng");
    gatesFailed.push("Thiếu ưu thế định hướng (Directional gap < 12đ)");
  }

  if (regimeState === "EXTREME_VOL") {
    vetoReasons.push("Biến động cực đoan bất thường (Extreme Volatility Spike) — rủi ro trượt giá");
    gatesFailed.push(`Regime Veto: Extreme volatility (range ${(lastRange / Math.max(1e-12, atr14)).toFixed(1)}x ATR)`);
  }

  const finalDir: "BUY" | "SELL" = resolvedDir === "SELL" ? "SELL" : "BUY";
  const isBuy = finalDir === "BUY";
  const hasSweep = isBuy ? bullSweepRecent : bearSweepRecent;
  const hasMss = isBuy ? bullMss : bearMss;

  // ------------------------------------------------------------------
  // 4. 7-GATE EVALUATION & HARD VETOES
  // ------------------------------------------------------------------
  let precisionScore = 44;

  // GATE 1: HTF Trend & Chop Regime
  const htfMatches = isBuy ? htfBias === "BULLISH" : htfBias === "BEARISH";
  const macroMatches = isBuy ? macroBias === "BULLISH" : macroBias === "BEARISH";
  const htfOpposes = isBuy ? htfBias === "BEARISH" : htfBias === "BULLISH";
  const macroOpposes = isBuy ? macroBias === "BEARISH" : macroBias === "BULLISH";

  if (htfMatches && macroMatches) {
    precisionScore += 18;
    gatesPassed.push(`Gate 1: Đồng thuận HTF (${htfBias}) + Macro (${macroBias})`);
  } else if (htfMatches || (macroMatches && !htfOpposes)) {
    precisionScore += 12;
    gatesPassed.push(`Gate 1: Thuận khung lớn (${htfBias}/${macroBias})`);
  } else if (htfOpposes && macroOpposes && !(hasSweep && hasMss)) {
    precisionScore -= 20;
    vetoReasons.push(`Ngược xu hướng cả HTF lẫn Macro (${htfBias}/${macroBias}) mà chưa có Sweep+MSS đảo chiều`);
    gatesFailed.push("Gate 1: Bẫy bắt dao rơi ngược hoàn toàn HTF + Macro");
  } else if (htfOpposes) {
    precisionScore -= 8;
    gatesFailed.push(`Gate 1: HTF (${htfBias}) chưa đồng thuận`);
  }

  if (regimeState === "CHOPPY" && !(hasSweep && hasMss)) {
    vetoReasons.push(`Thị trường Sideway nhiễu (ADX ${adxVal.toFixed(1)}, ER ${(erVal * 100).toFixed(0)}%, flips ${whipsawFlips}) — đứng ngoài`);
    gatesFailed.push("Gate 1b (Chop Veto): Nhiễu whipsaw cao không có Sweep+MSS xác nhận");
  } else if (!isDeadChop && (adxVal >= 18 || erVal >= 0.28)) {
    precisionScore += 6;
    gatesPassed.push(`Gate 1b: Xu hướng sạch (ADX ${adxVal.toFixed(1)}, ER ${(erVal * 100).toFixed(0)}%)`);
  }

  // GATE 2: Liquidity Sweep & MSS Confirmation
  if (hasSweep && hasMss) {
    precisionScore += 16;
    gatesPassed.push("Gate 2: Quét thanh khoản Sweep + xác nhận MSS đảo chiều");
  } else if (hasSweep) {
    precisionScore += 12;
    gatesPassed.push("Gate 2: Quét thanh khoản 1-4 nến gần nhất");
  } else if (hasMss) {
    precisionScore += 7;
    gatesPassed.push("Gate 2: Phá vỡ cấu trúc vi mô (MSS)");
  } else {
    gatesFailed.push("Gate 2: Chưa có nhịp quét Sweep/MSS");
  }

  // GATE 3: Value Zone (OTE/FVG/Discount-Premium) + Parabolic Anti-Chase
  const sma20Arr = sma(closes, 20);
  const s20 = sma20Arr[n - 1] ?? currentPrice;
  const std20Slice = closes.slice(-20);
  const std20 = Math.sqrt(
    std20Slice.reduce((sum, c) => sum + (c - s20) ** 2, 0) / Math.max(1, std20Slice.length),
  );
  const bbZ = std20 > 1e-12 ? (currentPrice - s20) / std20 : 0;
  const distEma21Atr = atr14 > 0 ? Math.abs(currentPrice - e21) / atr14 : 0;
  const recent3Ret = n >= 4 ? Math.abs(currentPrice - closes[n - 4]!) : 0;
  const isParabolicExtended =
    distEma21Atr > 2.25 &&
    ((isBuy && currentPrice > e21 && rsi14 >= 74) || (!isBuy && currentPrice < e21 && rsi14 <= 26)) &&
    (Math.abs(bbZ) > 2.05 || recent3Ret > atr14 * 2.4);

  if (isParabolicExtended) {
    vetoReasons.push(`Chạy quá đà Parabolic (${distEma21Atr.toFixed(1)}x ATR từ EMA21, RSI ${rsi14.toFixed(0)}) — cấm đuổi lệnh`);
    gatesFailed.push("Gate 3 (Anti-Chase Veto): Quá mua/quá bán căng quá mức");
    precisionScore -= 16;
  }

  const inValuePullback =
    (isBuy && (ict.optimalTradeSetup.dealingRange.currentZone === "DISCOUNT" || (currentPrice >= e21 - atr14 * 0.6 && currentPrice <= e9 + atr14 * 0.4))) ||
    (!isBuy && (ict.optimalTradeSetup.dealingRange.currentZone === "PREMIUM" || (currentPrice <= e21 + atr14 * 0.6 && currentPrice >= e9 - atr14 * 0.4)));

  if (inValuePullback && !isParabolicExtended) {
    precisionScore += 10;
    gatesPassed.push("Gate 3: Vùng giá trị tối ưu (Discount/Premium hoặc pullback EMA9/21)");
  }

  // GATE 4: Order Flow + CSM + Crypto Funding
  if (isBuy && realImbalance >= 12) {
    precisionScore += 6;
    gatesPassed.push(`Gate 4: Dòng tiền/CLV ủng hộ mua (+${realImbalance}%)`);
  } else if (!isBuy && realImbalance <= -12) {
    precisionScore += 6;
    gatesPassed.push(`Gate 4: Dòng tiền/CLV ủng hộ bán (${realImbalance}%)`);
  } else if ((isBuy && realImbalance <= -35) || (!isBuy && realImbalance >= 35)) {
    precisionScore -= 8;
    gatesFailed.push(`Gate 4: Áp lực Order Flow ngược hướng (${realImbalance}%)`);
  }

  if (assetType === "FOREX" && csmBaseMinusQuote != null) {
    if ((isBuy && csmBaseMinusQuote >= 1.2) || (!isBuy && csmBaseMinusQuote <= -1.2)) {
      precisionScore += 6;
      gatesPassed.push(`Gate 4b (CSM): Sức mạnh tiền tệ chênh lệch thuận chiều (${csmBaseMinusQuote.toFixed(1)})`);
    } else if ((isBuy && csmBaseMinusQuote <= -2.2) || (!isBuy && csmBaseMinusQuote >= 2.2)) {
      precisionScore -= 10;
      gatesFailed.push(`Gate 4b (CSM): Đồng tiền cơ sở yếu ngược chiều (${csmBaseMinusQuote.toFixed(1)})`);
    }
  }

  if (assetType === "CRYPTO" && fundingRate != null) {
    if (isBuy && fundingRate >= 0.0006) {
      vetoReasons.push(`Funding Rate quá nóng (${(fundingRate * 100).toFixed(3)}%) — rủi ro quét Long`);
      gatesFailed.push("Gate 4c (Funding Veto): Long crowding quá cao");
    } else if (!isBuy && fundingRate <= -0.0005) {
      vetoReasons.push(`Funding Rate âm sâu (${(fundingRate * 100).toFixed(3)}%) — rủi ro Short Squeeze`);
      gatesFailed.push("Gate 4c (Funding Veto): Short crowding quá cao");
    } else if ((isBuy && fundingRate <= -0.0002) || (!isBuy && fundingRate >= 0.0004)) {
      precisionScore += 6;
      gatesPassed.push("Gate 4c: Funding Rate hỗ trợ Squeeze thuận chiều");
    }
  }

  if (assetType === "FOREX" && sessionLabel && (sessionLabel === "WEEKEND" || sessionLabel === "ROLLOVER")) {
    precisionScore -= 12;
    gatesFailed.push(`Session Warning: Đang trong khung ${sessionLabel} giãn spread`);
  }

  // GATE 5: Direction-Aligned Reversal Pace (0x50f7)
  const avgRange = Math.max(pip * 2, medianRange);
  const microVol = Math.max(1e-10, avgRange / Math.sqrt(Math.max(30, timeframeSec)));
  const pace = calculateRequiredSpeedPace({
    currentPrice,
    referencePrice: lastBar.open,
    secondsRemaining,
    microVolatilityPerSec: microVol,
    assetType,
    pipSize: pip,
  });

  if (pace.isIrreversibleLock) {
    const lockMatch =
      (isBuy && pace.lockDirection === "BULLISH_LOCKED") ||
      (!isBuy && pace.lockDirection === "BEARISH_LOCKED");
    if (lockMatch) {
      precisionScore += 7;
      gatesPassed.push(`Gate 5 (Pace): Xung lực khóa ${pace.lockDirection} (${pace.zScoreSpeed}σ)`);
    } else {
      precisionScore -= 12;
      vetoReasons.push(`Xung lực nến khóa ${pace.lockDirection} ngược hướng ${finalDir}`);
      gatesFailed.push(`Gate 5 (Pace Conflict): ${pace.lockDirection} ngược lệnh`);
    }
  }

  // ------------------------------------------------------------------
  // 5. STRUCTURAL ENTRY, STOP LOSS, MULTI-TIER TP & FRICTION COST CHECK
  // ------------------------------------------------------------------
  let entryMode: PrecisionTradeSetup["entryMode"] = "MARKET_CONFIRMED";
  let rawEntry = candidateEntry != null && Number.isFinite(candidateEntry) && candidateEntry > 0
    ? candidateEntry
    : currentPrice;

  // Prefer pullback limit entry inside OTE/FVG if within 0.4x ATR and not already filled by sweep reclaim
  const oteEntry = ict.optimalTradeSetup.direction === finalDir ? ict.optimalTradeSetup.entryOptimal : null;
  if (oteEntry != null && Math.abs(currentPrice - oteEntry) <= atr14 * 0.4) {
    const betterPrice = isBuy ? oteEntry < currentPrice : oteEntry > currentPrice;
    if (betterPrice) {
      rawEntry = oteEntry;
      entryMode = "LIMIT_PULLBACK";
    }
  }

  const recentStructBars = barsExecution.slice(-10);
  const swingLow10 = Math.min(...recentStructBars.map((b) => b.low));
  const swingHigh10 = Math.max(...recentStructBars.map((b) => b.high));
  const slBuffer = Math.max(pip * 3, atr14 * 0.35);

  let rawStopDist =
    candidateStopLoss != null && Number.isFinite(candidateStopLoss) && candidateStopLoss > 0
      ? Math.abs(rawEntry - candidateStopLoss)
      : isBuy
        ? rawEntry - (swingLow10 - slBuffer)
        : swingHigh10 + slBuffer - rawEntry;

  // Clamp SL distance to [0.75 * ATR, 2.2 * ATR] so noise does not stop out good trades cleanly
  const stopDist = Math.min(atr14 * 2.2, Math.max(atr14 * 0.75, Math.max(pip * 5, rawStopDist)));
  const rawSl = isBuy ? rawEntry - stopDist : rawEntry + stopDist;

  // Liquidity targets from Support/Resistance & Ict Pools
  const sr = supportResistance(barsExecution, 72);
  let target2Dist = stopDist * 2.1;
  if (isBuy) {
    const candidates = [...sr.resistance, ict.liquidityMap.nearestBsl?.price ?? 0]
      .filter((p) => p > rawEntry + stopDist * 1.65 && p <= rawEntry + stopDist * 2.8)
      .sort((a, b) => a - b);
    if (candidates.length > 0) target2Dist = candidates[0]! - rawEntry;
  } else {
    const candidates = [...sr.support, ict.liquidityMap.nearestSsl?.price ?? 0]
      .filter((p) => p > 0 && p < rawEntry - stopDist * 1.65 && p >= rawEntry - stopDist * 2.8)
      .sort((a, b) => b - a);
    if (candidates.length > 0) target2Dist = rawEntry - candidates[0]!;
  }

  const tp1Dist = stopDist * 1.15;
  const tp3Dist = Math.max(target2Dist * 1.35, stopDist * 3.1);

  const tp1Raw = isBuy ? rawEntry + tp1Dist : rawEntry - tp1Dist;
  const tp2Raw = isBuy ? rawEntry + target2Dist : rawEntry - target2Dist;
  const tp3Raw = isBuy ? rawEntry + tp3Dist : rawEntry - tp3Dist;

  // Friction calculation
  let totalFrictionPrice: number;
  if (assetType === "FOREX") {
    const clean = symbol.toUpperCase();
    const defaultSpread = clean.startsWith("XAU") ? 2.5 : clean.includes("JPY") ? 1.2 : 1.0;
    const sp = spreadPipsOrPct != null && spreadPipsOrPct >= 0 ? spreadPipsOrPct : defaultSpread;
    totalFrictionPrice = (sp + 0.35) * pip;
  } else {
    const spDec = spreadPipsOrPct != null && spreadPipsOrPct >= 0 ? Math.min(spreadPipsOrPct, 0.02) : 0.0004;
    totalFrictionPrice = rawEntry * Math.max(0.0008, spDec + 0.0006);
  }

  const frictionR = Number((totalFrictionPrice / Math.max(1e-12, stopDist)).toFixed(3));
  const grossRiskReward = Number((target2Dist / Math.max(1e-12, stopDist)).toFixed(2));
  const netRiskReward = Number(Math.max(0, (target2Dist - totalFrictionPrice) / Math.max(1e-12, stopDist)).toFixed(2));

  if (frictionR > 0.22) {
    vetoReasons.push(`Chi phí spread/phí quá lớn (${(frictionR * 100).toFixed(0)}% rủi ro 1R)`);
    gatesFailed.push("Gate 6 (Friction Veto): Spread + fee ăn mòn biên lợi nhuận");
  } else if (netRiskReward < 1.35) {
    vetoReasons.push(`Net R:R=${netRiskReward} < 1.35 sau phí không đủ kỳ vọng dương`);
    gatesFailed.push("Gate 6 (R:R Veto): Tỷ lệ thưởng/rủi ro ròng quá thấp");
  } else {
    precisionScore += 6;
    gatesPassed.push(`Gate 6: SL cấu trúc & Net R:R 1:${netRiskReward} (Friction ${frictionR}R)`);
  }

  // Run High-Winrate Gate cross-check to ensure full harmonization
  const gateCheck = evaluateHighWinrateGate({
    symbol,
    series: barsExecution,
    htfSeries: htf,
    candidateDirection: finalDir,
    entryPrice: rawEntry,
    stopLossPrice: rawSl,
    takeProfitPrice: tp2Raw,
    orderBookImbalance: realImbalance,
    assetType,
    secondsRemaining,
    timeframeSec,
  });

  if (gateCheck.isHighWinrateVerified) {
    precisionScore = Math.max(precisionScore, Math.round(gateCheck.winrateScore));
  }

  precisionScore = Math.max(25, Math.min(95, Math.round(precisionScore)));

  // Calibrated outcome probabilities & net Expectancy E[R] under 50% TP1 BE / 30% TP2 / 20% TP3 scaling
  const pTp1 = Math.min(0.84, Math.max(0.38, 0.30 + (precisionScore / 100) * 0.56));
  const pTp2 = Math.max(0.24, pTp1 * 0.72);
  const pTp3 = Math.max(0.12, pTp1 * 0.44);
  const calibratedWinRatePct = Math.round(pTp1 * 100);
  const expectancyR = Number(
    (pTp1 * (0.5 * 1.15) + pTp2 * (0.3 * grossRiskReward) + pTp3 * (0.2 * 3.1) - (1 - pTp1) * 1.0 - frictionR).toFixed(2),
  );

  // Assign final setup grade
  let grade: SetupGrade = "NO_TRADE";
  if (vetoReasons.length === 0 && resolvedDir !== "NEUTRAL") {
    if (precisionScore >= 80 && expectancyR >= 0.32) grade = "A+";
    else if (precisionScore >= 68 && expectancyR >= 0.18) grade = "A";
    else if (precisionScore >= 56 && expectancyR >= 0.06) grade = "B";
  }

  if (grade === "NO_TRADE") {
    if (vetoReasons.length === 0) {
      vetoReasons.push(`Điểm hợp lưu ${precisionScore}/100 (E[R] ${expectancyR}R) chưa đạt ngưỡng tối thiểu`);
    }
    return {
      direction: "NEUTRAL",
      action: "WAIT",
      grade: "NO_TRADE",
      precisionScore,
      calibratedWinRatePct,
      expectancyR,
      recommendedSizeMultiplier: 0,
      entryMode: "WAIT",
      entry: fmtP(rawEntry),
      entryZone: null,
      stopLoss: fmtP(rawSl),
      tp1: fmtP(tp1Raw),
      tp2: fmtP(tp2Raw),
      tp3: fmtP(tp3Raw),
      grossRiskReward,
      netRiskReward,
      frictionR,
      regime: {
        state: regimeState,
        adx14: Number(adxVal.toFixed(1)),
        efficiencyRatio: Number(erVal.toFixed(2)),
        atrRatio: Number(atrRatio.toFixed(2)),
      },
      gatesPassed,
      gatesFailed,
      vetoReasons,
      breakevenPlan: { tp1ClosePct: 50, moveSlToBeAtTp1: true, trailingAtrMult: 1.0 },
      summaryVi: `${symbol}: NO_TRADE (${precisionScore}/100) — ${vetoReasons[0]}`,
    };
  }

  const sizeMult = grade === "A+" ? 1.0 : grade === "A" ? 0.85 : 0.5;
  const entryZone: [number, number] = isBuy
    ? [fmtP(rawEntry - stopDist * 0.25), fmtP(rawEntry)]
    : [fmtP(rawEntry), fmtP(rawEntry + stopDist * 0.25)];

  return {
    direction: finalDir,
    action: finalDir,
    grade,
    precisionScore,
    calibratedWinRatePct,
    expectancyR,
    recommendedSizeMultiplier: sizeMult,
    entryMode,
    entry: fmtP(rawEntry),
    entryZone,
    stopLoss: fmtP(rawSl),
    tp1: fmtP(tp1Raw),
    tp2: fmtP(tp2Raw),
    tp3: fmtP(tp3Raw),
    grossRiskReward,
    netRiskReward,
    frictionR,
    regime: {
      state: regimeState,
      adx14: Number(adxVal.toFixed(1)),
      efficiencyRatio: Number(erVal.toFixed(2)),
      atrRatio: Number(atrRatio.toFixed(2)),
    },
    gatesPassed,
    gatesFailed,
    vetoReasons,
    breakevenPlan: { tp1ClosePct: 50, moveSlToBeAtTp1: true, trailingAtrMult: 1.0 },
    summaryVi: `${symbol}: ${finalDir} [Grade ${grade} | E[R] +${expectancyR}R | WinRate ~${calibratedWinRatePct}%] tại ${fmtP(rawEntry)}`,
  };
}
