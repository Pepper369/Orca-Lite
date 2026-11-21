import "server-only";
import { buildMeta } from "../freshness";
import { buildForexScalpSignal } from "./forex-scalp";
import { generateDeepFlowSignal } from "../engines/forex-order-flow-pro";
import { evaluateNewsCircuitBreaker } from "../engines/forex-news-shield";
import { reconstructSyntheticDom } from "../engines/forex-cme-dom-bridge";
import { calculateCurrencyStrengthMatrix, type PairPriceInput } from "../engines/forex-currency-strength";
import { evaluatePrecisionTradeSetup, type SetupGrade } from "../engines/fx-crypto-precision-engine";
import { calculateUnifiedTradeRiskPlan } from "../engines/unified-cross-asset-quant";
import { getGlobalMacroShieldEvents } from "../providers/economic-calendar";
import { getForexDetail, getForexMarkets } from "./forex";
import type { Meta } from "../types";

export interface ForexQuantSignalItem {
  pair: string;
  symbol: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  action: "BUY" | "SELL" | "WAIT";
  timeframe: string;
  status: "ACTIVE" | "AWAITING_BREAKOUT" | "FILTERED_OUT" | "NEUTRAL";
  strength: number;
  probability: number;
  lastPrice: number;
  entryPrice: number | null;
  stopLossPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopPips: number | null;
  riskReward: number | null;
  session: string;
  sessionEligible: boolean;
  spreadPips: number | null;
  regime: string;
  fii?: number | null;
  absorption?: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE" | null;
  vpoc?: number | null;
  vwap?: number | null;
  newsLockout?: boolean;
  newsWarning?: string;
  cmeTicker?: string;
  domImbalance?: number;
  isHighWinrateVerified?: boolean;
  winrateScore?: number;
  liquiditySweepDetected?: boolean;
  setupGrade?: SetupGrade;
  expectancyR?: number;
  entryMode?: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  vetoReasons?: string[];
  netRiskReward?: number | null;
  recommendedSizeMultiplier?: number;
  csmSpread?: number | null;
  recommendedLots: number;
  riskAmountUsd: number;
  evidence: string[];
  riskNotes: string[];
  updatedAt: number;
}

export interface ForexSignalsHubData {
  signals: ForexQuantSignalItem[];
  marketSessions: { name: string; hours: string; isOpen: boolean }[];
  stats: {
    totalScanned: number;
    buyCount: number;
    sellCount: number;
    neutralCount: number;
    topPick: ForexQuantSignalItem | null;
  };
}

const MONITORED_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "XAUUSD",
];

const GRADE_RANK: Record<SetupGrade, number> = {
  "A+": 4,
  A: 3,
  B: 2,
  NO_TRADE: 1,
};

export async function getForexSignalsHub(): Promise<{ data: ForexSignalsHubData; meta: Meta } | null> {
  const { cached } = await import("../cache");

  const res = await cached<{ data: ForexSignalsHubData; meta: Meta }>("forex:signals:hub:v2", {
    ttlMs: 20_000,
    staleMs: 120_000,
    softSwr: true,
    producer: async () => {
      // Evaluate sessions
      const now = new Date();
      const utcHour = now.getUTCHours();
      const marketSessions = [
        { name: "Sydney (Úc)", hours: "21:00 - 06:00 UTC", isOpen: utcHour >= 21 || utcHour < 6 },
        { name: "Tokyo (Châu Á)", hours: "00:00 - 09:00 UTC", isOpen: utcHour >= 0 && utcHour < 9 },
        { name: "London (Châu Âu)", hours: "07:00 - 16:00 UTC", isOpen: utcHour >= 7 && utcHour < 16 },
        { name: "New York (Mỹ)", hours: "12:00 - 21:00 UTC", isOpen: utcHour >= 12 && utcHour < 21 },
      ];

      // Pre-load global macro calendar & CSM once BEFORE pair fanout (prevents 8x duplicate provider calls)
      const [calendarEvents, marketsRes] = await Promise.all([
        getGlobalMacroShieldEvents(now).catch(() => []),
        getForexMarkets().catch(() => null),
      ]);

      const csmScoreMap = new Map<string, number>();
      if (marketsRes?.data?.rows?.length) {
        const csmInputs: PairPriceInput[] = marketsRes.data.rows
          .filter((r) => r.price > 0)
          .map((r) => ({
            pair: r.pair,
            price: r.price,
            changePercent: r.changePercent ?? 0,
          }));
        if (csmInputs.length >= 4) {
          const csm = calculateCurrencyStrengthMatrix(csmInputs);
          for (const s of csm.scores) csmScoreMap.set(s.currency, s.score);
        }
      }

      const csmForPair = (p: string): number | null => {
        const baseCurr = p.slice(0, 3);
        const quoteCurr = p.slice(3, 6);
        const baseScore = csmScoreMap.get(baseCurr);
        const quoteScore = csmScoreMap.get(quoteCurr);
        if (baseScore != null && quoteScore != null) {
          return Number((baseScore - quoteScore).toFixed(1));
        }
        if (baseCurr === "XAU" && quoteScore != null) {
          return Number((5.0 - quoteScore).toFixed(1));
        }
        return null;
      };

      const results = await Promise.allSettled(
        MONITORED_PAIRS.map(async (pair) => {
          const csmBaseMinusQuote = csmForPair(pair);
          const [res, detail] = await Promise.all([
            buildForexScalpSignal(pair, { calendarEvents, csmBaseMinusQuote }),
            getForexDetail(pair).catch(() => null),
          ]);
          return { pair, res, detail, csmBaseMinusQuote };
        }),
      );

      const signals: ForexQuantSignalItem[] = [];

      for (const item of results) {
        if (item.status !== "fulfilled" || !item.value.res) continue;
        const { pair, res, detail, csmBaseMinusQuote: csmSpread } = item.value;
        const sig = res.result.signal;
        const setup = sig.primarySetup;

        // 1. Real Economic Calendar News Circuit Breaker Check (Anti-Slippage Shield)
        const cb = evaluateNewsCircuitBreaker(pair, Date.now(), calendarEvents);
        const newsLockout = cb.isLockout;
        const newsWarning = cb.isLockout ? cb.warningMessage : undefined;

        const detailSeries = detail?.detail?.series ?? [];
        const m5Flow = sig.flowMetrics;
        let fii: number | null = m5Flow?.fii ?? null;
        let absorption: ForexQuantSignalItem["absorption"] = m5Flow?.absorption ?? null;
        let vpoc: number | null = m5Flow?.vpoc ?? null;
        let vwap: number | null = m5Flow?.vwap ?? null;
        let cmeTicker: string | undefined = m5Flow?.cmeTicker;
        let domImbalance: number | undefined = m5Flow?.domImbalance;
        let cvdDiv: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" | null = m5Flow?.cvdDivergence ?? null;
        let spreadLockoutReason: string | null = null;

        const evidence = [...sig.evidence];
        const riskNotes = [...sig.riskNotes];
        if (newsWarning) riskNotes.unshift(newsWarning);

        if (detailSeries.length >= 20) {
          const spreadOpts =
            sig.filter.spreadPips != null ? { currentSpreadPips: sig.filter.spreadPips } : undefined;
          const flow = generateDeepFlowSignal(pair, detailSeries, spreadOpts);
          if (fii == null) fii = flow.flowIntensityIndex;
          if (absorption == null) absorption = flow.absorption.type;
          if (vpoc == null) vpoc = flow.volumeProfile.vpocPrice;
          if (vwap == null) vwap = flow.vwap.vwap;
          if (cvdDiv == null) cvdDiv = flow.cvdDivergence;
          if (flow.spreadSafety && !flow.spreadSafety.isSafe && flow.spreadSafety.lockoutReason) {
            spreadLockoutReason = flow.spreadSafety.lockoutReason;
            riskNotes.unshift(spreadLockoutReason);
          }

          const dom = reconstructSyntheticDom(pair, detailSeries, sig.filter.spreadPips);
          if (!cmeTicker) cmeTicker = dom.cmeContract?.cmeTicker;
          if (domImbalance == null) domImbalance = dom.orderBookImbalanceRatio;

          if (flow.absorption.detected) {
            if (flow.absorption.type === "BULLISH_ABSORPTION" && sig.direction === "watch-long") {
              evidence.push("🚨 Hấp thụ mua (Bullish Absorption) xác nhận đáy");
            } else if (flow.absorption.type === "BEARISH_ABSORPTION" && sig.direction === "watch-short") {
              evidence.push("🚨 Hấp thụ bán (Bearish Absorption) chặn đỉnh");
            }
          }
        }

        // 2. Harmonized Precision Evaluation (use intraday directly when available; compute daily only as fallback)
        const intradayPrecision = sig.precision ?? null;
        const effectivePrecision =
          intradayPrecision ??
          (detailSeries.length >= 30
            ? evaluatePrecisionTradeSetup({
                symbol: pair,
                assetType: "FOREX",
                barsExecution: detailSeries,
                candidateDirection:
                  setup?.direction === "BUY" || setup?.direction === "SELL"
                    ? setup.direction
                    : "AUTO",
                orderBookImbalance: domImbalance ?? null,
                flowIntensityIndex: fii,
                absorptionType: absorption,
                volumeDeltaDivergence: cvdDiv,
                csmBaseMinusQuote: csmSpread,
                sessionLabel: sig.filter.sessionLabel,
                spreadPipsOrPct: sig.filter.spreadPips,
                isNewsOrCascadeLockout: newsLockout || Boolean(spreadLockoutReason),
                lockoutReason: newsWarning ?? spreadLockoutReason,
              })
            : null);

        const rawDir = effectivePrecision?.direction ?? (sig.direction === "watch-long" ? "BUY" : sig.direction === "watch-short" ? "SELL" : "NEUTRAL");
        const vetoReasons = [...(effectivePrecision?.vetoReasons ?? [])];
        if (newsLockout && newsWarning && !vetoReasons.includes(newsWarning)) {
          vetoReasons.unshift(newsWarning);
        }
        if (spreadLockoutReason && !vetoReasons.includes(spreadLockoutReason)) {
          vetoReasons.unshift(spreadLockoutReason);
        }

        // Cross-check CSM conflict
        if (csmSpread != null && rawDir !== "NEUTRAL") {
          if ((rawDir === "BUY" && csmSpread <= -2.5) || (rawDir === "SELL" && csmSpread >= 2.5)) {
            vetoReasons.push(`Lệch pha CSM mạnh ngược chiều (${csmSpread > 0 ? `+${csmSpread}` : csmSpread})`);
          }
        }

        let setupGrade: SetupGrade = effectivePrecision?.grade ?? "NO_TRADE";
        if (newsLockout || spreadLockoutReason || vetoReasons.length > 0 || rawDir === "NEUTRAL") {
          setupGrade = "NO_TRADE";
        }

        const direction: ForexQuantSignalItem["direction"] = setupGrade === "NO_TRADE" ? "NEUTRAL" : rawDir;
        const action: ForexQuantSignalItem["action"] = direction === "NEUTRAL" ? "WAIT" : direction;
        const isBuy = direction === "BUY";

        const entry = effectivePrecision?.entry ?? setup?.entry ?? sig.last;
        const sl = effectivePrecision?.stopLoss ?? setup?.stopLoss ?? (entry ? (isBuy ? entry * 0.995 : entry * 1.005) : null);
        const tp1 = effectivePrecision?.tp1 ?? sig.tp1 ?? setup?.takeProfit1 ?? null;
        const tp2 = effectivePrecision?.tp2 ?? sig.tp2 ?? setup?.takeProfit2 ?? setup?.takeProfit ?? null;
        const tp3 = effectivePrecision?.tp3 ?? sig.tp3 ?? setup?.takeProfit3 ?? null;
        const stopPips =
          entry && sl
            ? Math.round((Math.abs(entry - sl) / sig.pipSize) * 10) / 10
            : setup?.stopPips ?? 25;

        let probability = effectivePrecision?.calibratedWinRatePct ?? sig.probability ?? 50;
        const isHighWinrateVerified =
          direction !== "NEUTRAL" && ((effectivePrecision?.isHighWinrateVerified ?? false) || setupGrade === "A+");
        const winrateScore = Math.max(
          effectivePrecision?.precisionScore ?? probability,
          effectivePrecision?.winrateScore ?? 0,
        );
        const liquiditySweepDetected = effectivePrecision?.liquiditySweepDetected ?? false;

        if (isHighWinrateVerified) {
          probability = Math.max(probability, Math.min(86, winrateScore));
          evidence.unshift("🎯 Siêu tín hiệu Winrate cao (HTF Trend + OTE Sweep)");
        }

        const sizeMult = setupGrade === "NO_TRADE" ? 0 : effectivePrecision?.recommendedSizeMultiplier ?? 0.5;
        const fxRows = marketsRes?.data?.rows ?? [];
        const findFx = (target: string) => fxRows.find((r) => r.pair === target && r.price > 0)?.price ?? null;
        const riskPlan =
          entry && sl && action !== "WAIT" && sizeMult > 0
            ? calculateUnifiedTradeRiskPlan({
                assetType: "FOREX",
                symbol: pair,
                direction: direction === "SELL" ? "SELL" : "BUY",
                winRatePct: probability,
                payoffRatio: Math.max(
                  1.0,
                  effectivePrecision?.netRiskReward ?? effectivePrecision?.grossRiskReward ?? 1.8,
                ),
                sizeMultiplier: sizeMult,
                entryPrice: entry,
                stopLossPrice: sl,
                takeProfit1: tp1,
                takeProfit2: tp2,
                takeProfit3: tp3,
                accountBalanceUsd: 10_000,
                crossRates: {
                  usdJpy: findFx("USDJPY"),
                  gbpUsd: findFx("GBPUSD"),
                  usdChf: findFx("USDCHF"),
                  usdCad: findFx("USDCAD"),
                  audUsd: findFx("AUDUSD"),
                  nzdUsd: findFx("NZDUSD"),
                },
              })
            : null;
        const recommendedLots = riskPlan?.recommendedLotsOrQty ?? 0;

        const symbolDisplay = pair === "XAUUSD" ? "XAU/USD (Vàng)" : `${pair.slice(0, 3)}/${pair.slice(3)}`;

        signals.push({
          pair,
          symbol: symbolDisplay,
          direction,
          action,
          timeframe: "M15/H1",
          status:
            newsLockout || spreadLockoutReason
              ? "FILTERED_OUT"
              : action === "WAIT"
                ? "NEUTRAL"
                : setup?.status === "TRIGGERED" || setup?.status === "ACTIVE" || setupGrade === "A+" || setupGrade === "A"
                  ? "ACTIVE"
                  : "AWAITING_BREAKOUT",
          strength: action === "WAIT" ? Math.min(35, winrateScore) : sig.strength,
          probability: newsLockout || spreadLockoutReason ? 0 : probability,
          lastPrice: sig.last,
          entryPrice: action === "WAIT" ? null : entry,
          stopLossPrice: action === "WAIT" ? null : sl,
          tp1: action === "WAIT" ? null : tp1,
          tp2: action === "WAIT" ? null : tp2,
          tp3: action === "WAIT" ? null : tp3,
          stopPips: action === "WAIT" ? null : stopPips,
          riskReward: effectivePrecision?.grossRiskReward ?? setup?.riskReward ?? 2.0,
          session: sig.filter.sessionLabel,
          sessionEligible: sig.filter.eligible,
          spreadPips: sig.filter.spreadPips,
          regime: `${effectivePrecision?.regime.state ?? sig.regime.market} / ${sig.regime.volatility}`,
          fii,
          absorption,
          vpoc,
          vwap,
          newsLockout,
          newsWarning,
          cmeTicker,
          domImbalance,
          isHighWinrateVerified,
          winrateScore,
          liquiditySweepDetected,
          setupGrade,
          expectancyR: effectivePrecision?.expectancyR ?? 0,
          entryMode: action === "WAIT" ? "WAIT" : effectivePrecision?.entryMode ?? "MARKET_CONFIRMED",
          vetoReasons,
          netRiskReward: effectivePrecision?.netRiskReward ?? null,
          recommendedSizeMultiplier: sizeMult,
          csmSpread,
          recommendedLots,
          riskAmountUsd: action === "WAIT" ? 0 : Math.round(riskPlan?.riskAmountUsd ?? 0),
          evidence: [...new Set(evidence)].slice(0, 8),
          riskNotes: [...new Set([...vetoReasons, ...riskNotes])].slice(0, 8),
          updatedAt: Date.now(),
        });
      }

      // Sort strictly by Setup Grade (A+ > A > B > NO_TRADE), Expectancy E[R], then calibrated probability
      signals.sort((a, b) => {
        const ga = GRADE_RANK[a.setupGrade ?? "NO_TRADE"];
        const gb = GRADE_RANK[b.setupGrade ?? "NO_TRADE"];
        if (ga !== gb) return gb - ga;
        return (b.expectancyR ?? -1) - (a.expectancyR ?? -1) || b.probability - a.probability;
      });

      const buyCount = signals.filter((s) => s.direction === "BUY").length;
      const sellCount = signals.filter((s) => s.direction === "SELL").length;
      const neutralCount = signals.filter((s) => s.direction === "NEUTRAL").length;
      const topPick = signals.find((s) => s.action !== "WAIT") ?? signals[0] ?? null;

      const meta = buildMeta({
        source: "Orca Forex Precision Engine v2 + CSM + Calendar Shield",
        sourceTimestampMs: Date.now(),
        note: `Đã thẩm định ${signals.length}/${MONITORED_PAIRS.length} cặp tiền qua 7 Cổng Precision + Macro Shield.`,
      });

      return {
        data: {
          signals,
          marketSessions,
          stats: {
            totalScanned: signals.length,
            buyCount,
            sellCount,
            neutralCount,
            topPick,
          },
        },
        meta,
      };
    },
  });

  return res?.value ?? null;
}

export const getForexSignalsHubData = getForexSignalsHub;
