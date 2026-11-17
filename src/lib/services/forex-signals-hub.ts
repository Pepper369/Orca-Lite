import "server-only";
import { buildMeta } from "../freshness";
import { buildForexScalpSignal, type ForexScalpResult } from "./forex-scalp";
import { calculateForexPositionSize } from "../engines/forex-position-sizer";
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

export async function getForexSignalsHub(): Promise<{ data: ForexSignalsHubData; meta: Meta } | null> {
  const { cached } = await import("../cache");

  const res = await cached<{ data: ForexSignalsHubData; meta: Meta }>("forex:signals:hub:v1", {
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

      // Scan pairs concurrently with fallback resilience
      const results = await Promise.allSettled(
        MONITORED_PAIRS.map(async (pair) => {
          const res = await buildForexScalpSignal(pair);
          return { pair, res };
        })
      );

      const signals: ForexQuantSignalItem[] = [];

      for (const item of results) {
        if (item.status !== "fulfilled" || !item.value.res) continue;
        const { pair, res } = item.value;
        const sig = res.result.signal;
        const setup = sig.primarySetup;

        const isBuy = sig.direction === "watch-long" || setup?.direction === "BUY";
        const isSell = sig.direction === "watch-short" || setup?.direction === "SELL";
        const direction = isBuy ? "BUY" : isSell ? "SELL" : "NEUTRAL";
        const action = direction === "NEUTRAL" ? "WAIT" : direction;

        const entry = setup?.entry ?? sig.last;
        const sl = setup?.stopLoss ?? (entry ? (isBuy ? entry * 0.995 : entry * 1.005) : null);
        const tp1 = sig.tp1 ?? setup?.takeProfit1 ?? null;
        const tp2 = sig.tp2 ?? setup?.takeProfit2 ?? setup?.takeProfit ?? null;
        const tp3 = sig.tp3 ?? setup?.takeProfit3 ?? null;
        const stopPips = setup?.stopPips ?? (entry && sl ? Math.round(Math.abs(entry - sl) / sig.pipSize * 10) / 10 : 25);
        const probability = sig.probability ?? (sig.strength > 0 ? Math.min(92, Math.max(50, Math.round(50 + sig.strength * 0.4))) : 50);

        // Calculate standard lot recommendation for standard $10,000 account, 1% risk ($100)
        let recommendedLots = 0.1;
        if (entry && sl) {
          const sizer = calculateForexPositionSize({
            accountBalance: 10_000,
            riskPercent: 1.0,
            pair,
            entryPrice: entry,
            stopLossPrice: sl,
            takeProfit1: tp1,
            takeProfit2: tp2,
            takeProfit3: tp3,
          });
          recommendedLots = sizer.standardLots;
        }

        const symbolDisplay = pair === "XAUUSD" ? "XAU/USD (Vàng)" : `${pair.slice(0, 3)}/${pair.slice(3)}`;

        signals.push({
          pair,
          symbol: symbolDisplay,
          direction,
          action,
          timeframe: "M15/H1",
          status: setup?.status === "TRIGGERED" || setup?.status === "ACTIVE" ? "ACTIVE" : setup?.status === "AWAITING_M5_BREAKOUT" ? "AWAITING_BREAKOUT" : "NEUTRAL",
          strength: sig.strength,
          probability,
          lastPrice: sig.last,
          entryPrice: entry,
          stopLossPrice: sl,
          tp1,
          tp2,
          tp3,
          stopPips,
          riskReward: setup?.riskReward ?? 1.5,
          session: sig.filter.sessionLabel,
          sessionEligible: sig.filter.eligible,
          spreadPips: sig.filter.spreadPips,
          regime: `${sig.regime.market} / ${sig.regime.volatility}`,
          recommendedLots,
          riskAmountUsd: 100,
          evidence: sig.evidence,
          riskNotes: sig.riskNotes,
          updatedAt: Date.now(),
        });
      }

      // Sort signals by probability & strength descending
      signals.sort((a, b) => {
        if (a.action !== "WAIT" && b.action === "WAIT") return -1;
        if (a.action === "WAIT" && b.action !== "WAIT") return 1;
        return b.probability - a.probability || b.strength - a.strength;
      });

      const buyCount = signals.filter((s) => s.direction === "BUY").length;
      const sellCount = signals.filter((s) => s.direction === "SELL").length;
      const neutralCount = signals.filter((s) => s.direction === "NEUTRAL").length;
      const topPick = signals.find((s) => s.action !== "WAIT") ?? signals[0] ?? null;

      const meta = buildMeta({
        source: "Orca Forex Scalp Engine + Multi-Tier Quant Confluence",
        sourceTimestampMs: Date.now(),
        note: `Đã quét ${signals.length}/${MONITORED_PAIRS.length} cặp tiền thanh khoản cao. Phân tích đa khung M15->M5->M1.`,
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
