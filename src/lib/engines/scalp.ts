import "server-only";
import type { OhlcvBar } from "../types";
import { atr, ema, rsi, supportResistance } from "../technical";
import type { ScalpAnalyzeInput, ScalpSetup, ScalpSignal } from "./scalp-types";
import { evaluatePrecisionTradeSetup } from "./fx-crypto-precision-engine";
import { buildSharedBarContext, type SharedBarContext } from "./unified-ta-kernel";
import { detectRegime, runAssetFilter, strategyA, strategyB, strategyC, strategyTechCrypto } from "./scalp-modules";

export type {
  AssetTier,
  VolatilityRegime,
  MarketRegime,
  ScalpDirection,
  SetupStatus,
  ScalpSetup,
  AssetFilterResult,
  RegimeSnapshot,
  ScalpSignal,
  ScalpAnalyzeInput,
} from "./scalp-types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function legacyQuant(bars: OhlcvBar[], ctx?: SharedBarContext) {
  const closes = ctx?.closes ?? bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const session = bars.slice(-288);
  let pv = 0;
  let vv = 0;
  for (const b of session) {
    if (b.volume > 0) {
      pv += ((b.high + b.low + b.close) / 3) * b.volume;
      vv += b.volume;
    }
  }
  const vwap = vv > 0 ? pv / vv : null;
  const vwapDistPct = vwap ? (last / vwap - 1) * 100 : null;
  const ema9 = (ctx ? ctx.ema9[closes.length - 1] : ema(closes, 9)[closes.length - 1]) ?? null;
  const ema21 = (ctx ? ctx.ema21[closes.length - 1] : ema(closes, 21)[closes.length - 1]) ?? null;
  const rsi7 = rsi(closes, 7)[closes.length - 1] ?? null;
  const atrV = ctx?.atr14 ?? atr(bars, 14);
  const atrPct = atrV != null ? (atrV / last) * 100 : null;
  const mom3 = closes.length > 4 ? (last / closes[closes.length - 4] - 1) * 100 : null;
  const mom6 = closes.length > 7 ? (last / closes[closes.length - 7] - 1) * 100 : null;
  const vols = ctx?.volumes ?? bars.map((b) => b.volume);
  const medWin = vols
    .slice(-101, -1)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianVol = medWin.length ? medWin[Math.floor(medWin.length / 2)] : 0;
  const volRatio = medianVol > 0 ? vols[vols.length - 1] / medianVol : null;
  const spike = volRatio != null && volRatio >= 1.8;

  let score = 0;
  const emaUp = ema9 != null && ema21 != null ? ema9 > ema21 : null;
  if (emaUp != null) score += emaUp ? 0.8 : -0.8;
  if (vwap != null) score += last > vwap ? 0.6 : -0.6;
  if (mom3 != null) score += Math.sign(mom3) * clamp(Math.abs(mom3) / 0.35, 0, 1) * 0.7;
  if (rsi7 != null) {
    if (rsi7 > 52 && rsi7 <= 70) score += 0.4;
    else if (rsi7 < 48 && rsi7 >= 30) score -= 0.4;
    else if (rsi7 > 82) score -= 0.5;
    else if (rsi7 < 18) score += 0.5;
  }
  if (spike && mom3 != null) score += Math.sign(mom3) * 0.5;
  score = clamp(score, -3, 3);

  return {
    last,
    vwap,
    vwapDistPct,
    ema9,
    ema21,
    rsi7,
    atr: atrV,
    atrPct,
    momentum: { bars3: mom3, bars6: mom6 },
    volume: { ratioVsMedian: volRatio, spike },
    score: Number(score.toFixed(2)),
    micro: supportResistance(bars.slice(-96), 96),
  };
}

/** Multi-timeframe crypto scalping analysis per the M15->M5->M1 spec. */
export function analyzeScalpMulti(input: ScalpAnalyzeInput): ScalpSignal | null {
  if (input.barsM5.length < 60) return null;

  const filter = runAssetFilter(input);
  const ctxM5 = buildSharedBarContext(input.barsM5);
  const ctxM15 = input.barsM15 === input.barsM5 ? ctxM5 : buildSharedBarContext(input.barsM15);
  const regime = detectRegime(input.barsM15, ctxM15);
  const quant = legacyQuant(input.barsM5, ctxM5);

  const activeSetups: ScalpSetup[] = [];
  let moduleBStatus: "AVAILABLE" | "ORDER_FLOW_UNAVAILABLE" = "ORDER_FLOW_UNAVAILABLE";

  if (filter.eligible && regime.market !== "CHAOTIC" && !input.isLockout) {
    if (regime.market === "TRENDING_UP" || regime.market === "TRENDING_DOWN" || regime.market === "RANGING") {
      const a = strategyA(input.barsM15, input.barsM5, input.barsM1, regime);
      if (a) activeSetups.push(a);
      const c = strategyC(input.barsM15, input.barsM5, regime);
      if (c) activeSetups.push(c);
      const techC = strategyTechCrypto(input.barsM15, input.barsM5, regime, {
        fundingRate: input.fundingRate,
        quoteVolume24h: input.quoteVolume24h,
        ctxM5,
        ctxM15,
      });
      if (techC) activeSetups.push(techC);
    }
    if (regime.market === "RANGING") {
      const b = strategyB(input.barsM5, regime);
      moduleBStatus = b.status;
      if (b.setup) activeSetups.push(b.setup);
    }
  } else if (!filter.eligible || input.isLockout) {
    activeSetups.push({
      strategy: "A",
      direction: "NONE",
      status: "FILTERED_OUT",
      grade: "NO_TRADE",
      strength: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      invalidation: null,
      entryZone: null,
      evidence: input.lockoutReason ? [input.lockoutReason, ...filter.reasons] : filter.reasons,
      riskNotes: [input.lockoutReason ?? "Asset Filter chan - khong mo setup"],
    });
  } else if (regime.market === "CHAOTIC") {
    activeSetups.push({
      strategy: "A",
      direction: "NONE",
      status: "NO_SETUP",
      grade: "NO_TRADE",
      strength: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      invalidation: null,
      entryZone: null,
      evidence: ["CHAOTIC regime - giam rui ro / khong giao dich theo spec"],
      riskNotes: ["Khoa scalping trong che do hon loan"],
    });
  }

  const prelimRanked = [...activeSetups].sort((x, y) => y.strength - x.strength);
  const prelimCandidate = prelimRanked.find((s) => s.direction === "BUY" || s.direction === "SELL") ?? null;

  const precision = evaluatePrecisionTradeSetup({
    symbol: input.symbol.toUpperCase(),
    assetType: "CRYPTO",
    barsExecution: input.barsM5,
    barsHtf: input.barsM15 !== input.barsM5 && input.barsM15.length >= 16 ? input.barsM15 : null,
    barsMacro: input.barsH1 && input.barsH1.length >= 12 ? input.barsH1 : null,
    sharedCtx: ctxM5,
    candidateDirection:
      (prelimCandidate?.direction === "BUY" || prelimCandidate?.direction === "SELL") &&
      prelimCandidate.strength >= 68
        ? prelimCandidate.direction
        : "AUTO",
    candidateEntry: prelimCandidate?.entry ?? null,
    candidateStopLoss: prelimCandidate?.stopLoss ?? null,
    spreadPipsOrPct: input.spreadPct ?? null,
    orderBookImbalance: input.orderBookImbalance ?? null,
    fundingRate: input.fundingRate ?? null,
    flowIntensityIndex: input.flowIntensityIndex ?? null,
    absorptionType: input.absorptionType ?? null,
    volumeDeltaDivergence: input.volumeDeltaDivergence ?? null,
    liquidationClusterAligned: input.liquidationClusterAligned ?? null,
    externalMagnets: input.externalMagnets ?? null,
    isNewsOrCascadeLockout: Boolean(input.isLockout || !filter.eligible),
    lockoutReason:
      input.lockoutReason ?? (!filter.eligible ? filter.reasons[0] ?? "Asset Filter blocked" : null),
  });

  const hasLevels = activeSetups.some((s) => s.entry != null && s.stopLoss != null && s.direction !== "NONE");
  if (
    !hasLevels &&
    regime.market !== "CHAOTIC" &&
    precision.grade !== "NO_TRADE" &&
    precision.direction !== "NEUTRAL" &&
    precision.entry != null &&
    precision.stopLoss != null
  ) {
    activeSetups.push({
      strategy: "A",
      direction: precision.direction,
      status: precision.grade === "A+" || precision.grade === "A" ? "TRIGGERED" : "ACTIVE",
      grade: precision.grade,
      strength: precision.precisionScore,
      probability: precision.calibratedWinRatePct,
      entry: precision.entry,
      stopLoss: precision.stopLoss,
      takeProfit: precision.tp2,
      takeProfit1: precision.tp1,
      takeProfit2: precision.tp2,
      takeProfit3: precision.tp3,
      riskReward: precision.grossRiskReward,
      invalidation: precision.stopLoss,
      entryZone: precision.entryZone,
      evidence: [
        `Precision Engine Grade ${precision.grade} | E[R] +${precision.expectancyR}R`,
        ...precision.gatesPassed.slice(0, 4),
      ],
      riskNotes: [],
    });
  }

  const ranked = [...activeSetups].sort((x, y) => y.strength - x.strength);
  const primarySetup =
    ranked.find((s) => s.status === "TRIGGERED" && s.entry != null) ??
    ranked.find((s) => s.entry != null && s.direction !== "NONE") ??
    ranked.find((s) => s.status === "AWAITING_M1_RETEST" || s.status === "AWAITING_M5_BREAKOUT") ??
    ranked[0] ??
    null;

  if (primarySetup) {
    primarySetup.grade = precision.grade;
    if (precision.grade !== "NO_TRADE" && precision.entry != null && precision.stopLoss != null) {
      primarySetup.takeProfit1 = precision.tp1;
      primarySetup.takeProfit2 = precision.tp2 ?? primarySetup.takeProfit;
      primarySetup.takeProfit3 = precision.tp3;
      primarySetup.probability = precision.calibratedWinRatePct;
    } else if (precision.grade === "NO_TRADE" && primarySetup.direction !== "NONE") {
      primarySetup.status = "FILTERED_OUT";
      primarySetup.strength = Math.min(primarySetup.strength, 35);
    }
  }

  let direction: ScalpSignal["direction"] = "neutral";
  let strength = 0;
  if (
    precision.grade !== "NO_TRADE" &&
    primarySetup &&
    primarySetup.direction === "BUY" &&
    primarySetup.status !== "INVALIDATED" &&
    primarySetup.status !== "FILTERED_OUT"
  ) {
    direction = "watch-long";
    strength = Math.round((primarySetup.strength + precision.precisionScore) / 2);
  } else if (
    precision.grade !== "NO_TRADE" &&
    primarySetup &&
    primarySetup.direction === "SELL" &&
    primarySetup.status !== "INVALIDATED" &&
    primarySetup.status !== "FILTERED_OUT"
  ) {
    direction = "watch-short";
    strength = Math.round((primarySetup.strength + precision.precisionScore) / 2);
  } else {
    direction = "neutral";
    strength = Math.min(35, precision.precisionScore);
  }

  const riskNotes: string[] = [
    ...precision.vetoReasons,
    ...filter.reasons.filter((r) => !r.startsWith("Pass")),
    ...regime.evidence,
    ...(primarySetup?.riskNotes ?? []),
  ];
  if (input.quoteVolume24h != null && input.quoteVolume24h < 50_000_000) {
    riskNotes.push("Thanh khoan 24h duoi $50M - slipage scalping dang ke");
  }
  if (input.fundingRate != null && Math.abs(input.fundingRate) > 0.0008) {
    riskNotes.push(
      `Funding ${(input.fundingRate * 100).toFixed(4)}% - filter context, khong phai tin hieu vao lenh`,
    );
  }

  const evidence: string[] = [
    `Precision Grade ${precision.grade} | E[R] ${precision.expectancyR >= 0 ? "+" : ""}${precision.expectancyR}R | Net RR 1:${precision.netRiskReward ?? "-"}`,
    `Filter: tier ${filter.tier} | eligible=${filter.eligible}`,
    `Regime: ${regime.market} / ${regime.volatility}`,
    ...(primarySetup?.evidence ?? []).slice(0, 3),
    `Legacy quant score ${quant.score} | EMA9 ${quant.ema9 != null && quant.ema21 != null ? (quant.ema9 > quant.ema21 ? ">" : "<") : "?"} EMA21`,
  ];

  const entryZone =
    precision.grade !== "NO_TRADE"
      ? (precision.entryZone ??
        primarySetup?.entryZone ??
        (quant.atr != null && direction === "watch-long"
          ? ([quant.last, quant.last - 0.35 * quant.atr] as [number, number])
          : quant.atr != null && direction === "watch-short"
            ? ([quant.last, quant.last + 0.35 * quant.atr] as [number, number])
            : null))
      : null;

  const invalidation =
    primarySetup?.invalidation ??
    precision.stopLoss ??
    (direction === "watch-long"
      ? Math.min(quant.ema21 ?? quant.last, quant.vwap ?? quant.last) - 0.5 * (quant.atr ?? quant.last * 0.004)
      : direction === "watch-short"
        ? Math.max(quant.ema21 ?? quant.last, quant.vwap ?? quant.last) + 0.5 * (quant.atr ?? quant.last * 0.004)
        : null);

  return {
    timeframe: "M15->M5->M1",
    direction,
    strength,
    score: quant.score,
    last: quant.last,
    vwap: quant.vwap,
    vwapDistPct: quant.vwapDistPct,
    ema9: quant.ema9,
    ema21: quant.ema21,
    rsi7: quant.rsi7,
    atr: quant.atr,
    atrPct: quant.atrPct,
    momentum: quant.momentum,
    volume: quant.volume,
    entryZone,
    invalidation,
    micro: quant.micro,
    riskNotes: [...new Set(riskNotes)].slice(0, 8),
    evidence: evidence.slice(0, 8),
    symbol: input.symbol.toUpperCase(),
    filter,
    regime,
    activeSetups,
    primarySetup,
    moduleBStatus,
    precision,
    probability: precision.calibratedWinRatePct,
    tp1: precision.tp1,
    tp2: precision.tp2,
    tp3: precision.tp3,
    context: {
      fundingRate: input.fundingRate ?? null,
      openInterest: input.openInterest ?? null,
      quoteVolume24h: input.quoteVolume24h ?? null,
    },
  };
}

/** Single-series entry (backward compatible with previous analyzeScalp callers). */
export function analyzeScalp(
  bars: OhlcvBar[],
  opts: { timeframe?: string; quoteVolume24h?: number | null; symbol?: string } = {},
): ScalpSignal | null {
  if (bars.length < 60) return null;
  return analyzeScalpMulti({
    symbol: opts.symbol ?? "UNKNOWN",
    barsM15: bars,
    barsM5: bars,
    barsM1: null,
    quoteVolume24h: opts.quoteVolume24h ?? null,
  });
}
