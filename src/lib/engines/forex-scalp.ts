import "server-only";
import type { OhlcvBar } from "../types";
import { atr, supportResistance } from "../technical";
import type { ForexScalpInput, ForexScalpSetup, ForexScalpSignal } from "./forex-scalp-types";
import { evaluatePrecisionTradeSetup } from "./fx-crypto-precision-engine";
import { buildSharedBarContext } from "./unified-ta-kernel";
import { reconstructSyntheticDom } from "./forex-cme-dom-bridge";
import { generateDeepFlowSignal } from "./forex-order-flow-pro";
import {
  detectForexRegime,
  pipSize,
  runForexFilter,
  strategyA,
  strategyB,
  strategyC,
  strategyTech,
  toPips,
} from "./forex-scalp-modules";

export type {
  ForexTier,
  ForexVolatilityRegime,
  ForexMarketRegime,
  ForexScalpDirection,
  ForexSetupStatus,
  ForexScalpSetup,
  ForexFilterResult,
  ForexRegimeSnapshot,
  ForexScalpSignal,
  ForexScalpInput,
} from "./forex-scalp-types";

export { pipSize, toPips, sessionInfo, classifyForexTier } from "./forex-scalp-modules";

/**
 * Multi-TF forex scalping per M15->M5->M1 + 7-Gate Institutional Precision Engine.
 */
export function analyzeForexScalp(input: ForexScalpInput): ForexScalpSignal | null {
  if (input.barsM5.length < 40) return null;
  const pair = input.pair.toUpperCase().replace("/", "");
  const filter = runForexFilter(input);
  const ctxM5 = buildSharedBarContext(input.barsM5);
  const m15RegimeBars = input.barsM15.length >= 30 ? input.barsM15 : input.barsM5;
  const ctxM15 = m15RegimeBars === input.barsM5 ? ctxM5 : buildSharedBarContext(m15RegimeBars);
  const regime = detectForexRegime(m15RegimeBars, pair, ctxM15);
  const last = input.barsM5[input.barsM5.length - 1]?.close ?? 0;
  const atrV = ctxM5.atr14 ?? atr(input.barsM5, 14);
  const pip = pipSize(pair);

  const sessionSoft =
    filter.sessionLabel === "WEEKEND"
      ? 0.35
      : filter.sessionLabel === "ROLLOVER"
        ? 0.55
        : filter.sessionLabel === "OFF_SESSION"
          ? 0.7
          : 1;

  const activeSetups: ForexScalpSetup[] = [];
  let moduleBStatus: "AVAILABLE" | "ORDER_FLOW_UNAVAILABLE" = "ORDER_FLOW_UNAVAILABLE";
  const m15 = input.barsM15.length ? input.barsM15 : input.barsM5;

  // Always attempt strategies when we have bars (even soft session / hard filter partially)
  if (regime.market !== "CHAOTIC") {
    if (filter.eligible || filter.spreadOk) {
      const a = strategyA(pair, m15, input.barsM5, input.barsM1, regime);
      if (a) {
        if (sessionSoft < 1) {
          a.strength = Math.round(a.strength * sessionSoft);
          a.riskNotes = [...a.riskNotes, `Session ${filter.sessionLabel} — giảm strength`];
        }
        activeSetups.push(a);
      }

      const c = strategyC(pair, m15, input.barsM5, regime);
      if (c) {
        if (sessionSoft < 1) {
          c.strength = Math.round(c.strength * sessionSoft);
          c.riskNotes = [...c.riskNotes, `Session ${filter.sessionLabel} — giảm strength`];
        }
        activeSetups.push(c);
      }

      const tech = strategyTech(pair, input.barsM5, m15, regime, sessionSoft, ctxM5);
      if (tech) activeSetups.push(tech);

      if (regime.market === "RANGING") {
        const b = strategyB(pair, input.barsM5, regime);
        moduleBStatus = b.status;
        if (b.setup && b.setup.direction !== "NONE") activeSetups.push(b.setup);
      }
    }
  }

  // Intraday M5 Flow Intensity / Absorption / CVD Divergence
  // Truth-in-Data: Only pass orderBookImbalance to Precision Engine if explicitly supplied or CME-exchange calibrated (never double-count synthetic Garman-Klass CLV proxy alongside FII)
  const domM5 = reconstructSyntheticDom(pair, input.barsM5, filter.spreadPips);
  const flowM5 = generateDeepFlowSignal(
    pair,
    input.barsM5,
    filter.spreadPips != null ? { currentSpreadPips: filter.spreadPips } : undefined,
  );
  const verifiedDomImbalance =
    input.orderBookImbalance ??
    (domM5.provenance === "CME_EXCHANGE_CALIBRATED" ? domM5.orderBookImbalanceRatio : null);
  const effFii = input.flowIntensityIndex ?? flowM5.flowIntensityIndex;
  const effAbsorption = input.absorptionType ?? flowM5.absorption.type;
  const effCvdDiv = input.volumeDeltaDivergence ?? flowM5.cvdDivergence;

  const precision = evaluatePrecisionTradeSetup({
    symbol: pair,
    assetType: "FOREX",
    barsExecution: input.barsM5,
    barsHtf: input.barsM15 !== input.barsM5 && input.barsM15.length >= 16 ? input.barsM15 : null,
    barsMacro: input.barsH1 && input.barsH1.length >= 12 ? input.barsH1 : null,
    sharedCtx: ctxM5,
    candidateDirection: "AUTO",
    candidateEntry: null,
    candidateStopLoss: null,
    spreadPipsOrPct: filter.spreadPips,
    orderBookImbalance: verifiedDomImbalance,
    flowIntensityIndex: effFii,
    absorptionType: effAbsorption,
    volumeDeltaDivergence: effCvdDiv,
    csmBaseMinusQuote: input.csmBaseMinusQuote ?? null,
    sessionLabel: filter.sessionLabel,
    isNewsOrCascadeLockout: !filter.newsOk || !filter.eligible,
    lockoutReason: !filter.newsOk
      ? filter.reasons.find((r) => r.includes("KHÓA") || r.includes("COOLDOWN")) ?? "News lockout"
      : !filter.eligible
        ? filter.reasons[0] ?? "Filter blocked"
        : null,
  });

  // Only emit synthesized trend continuation levels when Precision Engine validates Grade B/A/A+ (NO coin-flip fallback in chop)
  const matchingSetups = activeSetups.filter(
    (s) => s.direction === precision.direction && s.entry != null && s.stopLoss != null,
  );
  if (
    matchingSetups.length === 0 &&
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
      riskReward1: 1.15,
      riskReward2: precision.grossRiskReward ?? 2.0,
      riskReward3: 3.1,
      invalidation: precision.stopLoss,
      entryZone: precision.entryZone,
      stopPips: toPips(pair, Math.abs(precision.entry - precision.stopLoss)),
      evidence: [
        `Precision Engine Grade ${precision.grade} | E[R] +${precision.expectancyR}R`,
        ...precision.gatesPassed.slice(0, 4),
      ],
      riskNotes: sessionSoft < 1 ? ["Ngoài phiên chính — giảm size"] : ["Kiểm tra spread trước khi vào"],
    });
  }

  if (activeSetups.length === 0) {
    activeSetups.push({
      strategy: "A",
      direction: "NONE",
      status: regime.market === "CHAOTIC" ? "NO_SETUP" : "FILTERED_OUT",
      grade: "NO_TRADE",
      strength: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      invalidation: null,
      entryZone: null,
      stopPips: null,
      evidence: regime.market === "CHAOTIC" ? ["CHAOTIC regime — khong scalp"] : filter.reasons,
      riskNotes:
        precision.vetoReasons.length > 0
          ? precision.vetoReasons
          : regime.market === "CHAOTIC"
            ? ["Khoa giao dich"]
            : ["Filter chan entry"],
    });
  }

  const ranked = [...activeSetups].sort((x, y) => {
    const mx = x.direction === precision.direction ? 1 : 0;
    const my = y.direction === precision.direction ? 1 : 0;
    if (mx !== my) return my - mx;
    const lx = x.entry != null && x.stopLoss != null && x.direction !== "NONE" ? 1 : 0;
    const ly = y.entry != null && y.stopLoss != null && y.direction !== "NONE" ? 1 : 0;
    if (lx !== ly) return ly - lx;
    return y.strength - x.strength;
  });

  const primarySetup =
    ranked.find((s) => s.direction === precision.direction && s.status === "TRIGGERED" && s.entry != null) ??
    ranked.find((s) => s.direction === precision.direction && s.entry != null) ??
    ranked[0] ??
    null;

  if (primarySetup) {
    primarySetup.grade = precision.grade;
    if (
      precision.grade !== "NO_TRADE" &&
      precision.direction !== "NEUTRAL" &&
      precision.entry != null &&
      precision.stopLoss != null
    ) {
      primarySetup.direction = precision.direction;
      primarySetup.entry = precision.entry;
      primarySetup.stopLoss = precision.stopLoss;
      primarySetup.invalidation = precision.stopLoss;
      primarySetup.entryZone = precision.entryZone;
      primarySetup.stopPips = toPips(pair, Math.abs(precision.entry - precision.stopLoss));
      primarySetup.takeProfit = precision.tp2;
      primarySetup.takeProfit1 = precision.tp1;
      primarySetup.takeProfit2 = precision.tp2 ?? primarySetup.takeProfit;
      primarySetup.takeProfit3 = precision.tp3;
      primarySetup.probability = precision.calibratedWinRatePct;
    } else if (precision.grade === "NO_TRADE" && primarySetup.direction !== "NONE") {
      primarySetup.status = "FILTERED_OUT";
      primarySetup.strength = Math.min(primarySetup.strength, 35);
    }
  }

  let direction: ForexScalpSignal["direction"] = "neutral";
  let strength = 0;
  if (
    precision.grade !== "NO_TRADE" &&
    primarySetup?.direction === "BUY" &&
    primarySetup.status !== "INVALIDATED" &&
    primarySetup.status !== "FILTERED_OUT"
  ) {
    direction = "watch-long";
    strength = Math.round((primarySetup.strength + precision.precisionScore) / 2);
  } else if (
    precision.grade !== "NO_TRADE" &&
    primarySetup?.direction === "SELL" &&
    primarySetup.status !== "INVALIDATED" &&
    primarySetup.status !== "FILTERED_OUT"
  ) {
    direction = "watch-short";
    strength = Math.round((primarySetup.strength + precision.precisionScore) / 2);
  } else if (precision.grade === "NO_TRADE") {
    direction = "neutral";
    strength = Math.min(35, precision.precisionScore);
  }

  const riskNotes = [
    ...precision.vetoReasons,
    ...filter.reasons.filter((r) => !r.startsWith("Pass") && !r.startsWith("Soft")),
    ...regime.evidence,
    ...(primarySetup?.riskNotes ?? []),
  ];

  const evidence = [
    `Precision Grade ${precision.grade} | E[R] ${precision.expectancyR >= 0 ? "+" : ""}${precision.expectancyR}R | Net RR 1:${precision.netRiskReward ?? "-"}`,
    `Filter: tier ${filter.tier} | ${filter.sessionLabel} | spread ${filter.spreadPips?.toFixed(1) ?? "n/a"}/${filter.maxSpreadPips} pip`,
    `Regime: ${regime.market} / ${regime.volatility}`,
    ...(primarySetup?.evidence ?? []).slice(0, 4),
  ];

  const micro = supportResistance((input.barsM15.length >= 40 ? input.barsM15 : input.barsM5).slice(-96), 96);

  const probability =
    precision.grade !== "NO_TRADE"
      ? precision.calibratedWinRatePct
      : primarySetup?.probability ??
        (strength > 0 ? Math.min(92, Math.max(40, Math.round(45 + strength * 0.4))) : null);

  const tp1 =
    precision.tp1 ??
    primarySetup?.takeProfit1 ??
    (primarySetup?.entry && primarySetup?.stopLoss
      ? primarySetup.direction === "BUY"
        ? primarySetup.entry + Math.abs(primarySetup.entry - primarySetup.stopLoss) * 1.2
        : primarySetup.entry - Math.abs(primarySetup.entry - primarySetup.stopLoss) * 1.2
      : null);

  const tp2 = precision.tp2 ?? primarySetup?.takeProfit2 ?? primarySetup?.takeProfit ?? null;

  const tp3 =
    precision.tp3 ??
    primarySetup?.takeProfit3 ??
    (primarySetup?.entry && primarySetup?.stopLoss
      ? primarySetup.direction === "BUY"
        ? primarySetup.entry + Math.abs(primarySetup.entry - primarySetup.stopLoss) * 3.0
        : primarySetup.entry - Math.abs(primarySetup.entry - primarySetup.stopLoss) * 3.0
      : null);

  const baseRiskPct = sessionSoft < 1 ? 0.2 : 0.35;
  const scaledRiskPct =
    precision.grade !== "NO_TRADE"
      ? Number((baseRiskPct * precision.recommendedSizeMultiplier).toFixed(2))
      : 0;

  return {
    pair,
    timeframe: "M15->M5->M1",
    direction,
    strength,
    score: Number((strength / 33).toFixed(2)),
    last,
    pipSize: pip,
    atr: atrV,
    atrPips: atrV != null ? toPips(pair, atrV) : null,
    entryZone: precision.grade !== "NO_TRADE" ? (precision.entryZone ?? primarySetup?.entryZone ?? null) : null,
    invalidation: primarySetup?.invalidation ?? precision.stopLoss ?? null,
    micro,
    riskNotes: [...new Set(riskNotes)].slice(0, 8),
    evidence: evidence.slice(0, 8),
    filter,
    regime,
    probability,
    tp1,
    tp2,
    tp3,
    activeSetups,
    primarySetup,
    moduleBStatus,
    precision,
    flowMetrics: {
      fii: effFii,
      absorption: effAbsorption,
      cvdDivergence: effCvdDiv,
      domImbalance: verifiedDomImbalance ?? undefined,
      cmeTicker: domM5.cmeContract?.cmeTicker,
      vpoc: flowM5.volumeProfile.vpocPrice,
      vwap: flowM5.vwap.vwap,
    },
    riskHint: {
      recommendedRiskPct: scaledRiskPct,
      stopPips: primarySetup?.stopPips ?? (precision.entry && precision.stopLoss ? toPips(pair, Math.abs(precision.entry - precision.stopLoss)) : null),
      note: "lot = risk_amount / (stop_pips × pip_value) — kiem tra margin & correlation USD. Khong phai khuyen nghi.",
    },
  };
}

export function analyzeForexScalpSimple(pair: string, bars: OhlcvBar[]): ForexScalpSignal | null {
  if (bars.length < 40) return null;
  return analyzeForexScalp({
    pair,
    barsM15: bars,
    barsM5: bars,
    barsM1: null,
  });
}
