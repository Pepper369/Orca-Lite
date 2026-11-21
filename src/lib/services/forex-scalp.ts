import "server-only";
import { buildMeta } from "../freshness";
import { getYahooChart, yahooSymbolForPair, yahooIntervalFor } from "../providers/yahoo";
import { validateBars, logQualityEvent } from "../quality";
import { analyzeForexScalp, type ForexScalpSignal } from "../engines/forex-scalp";
import { calculateCurrencyStrengthMatrix, type PairPriceInput } from "../engines/forex-currency-strength";
import { getGlobalMacroShieldEvents } from "../providers/economic-calendar";
import { mergeBarsWithBiquoteLiveTick } from "../realtime/biquote-poll";
import { getForexMarkets } from "./forex";
import type { Meta, OhlcvBar } from "../types";
import type { ChartCandle } from "../chart-const";

const FOREX_SCALP_ALIAS: Record<string, string> = {
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  SILVER: "XAGUSD",
  XAG: "XAGUSD",
  WTI: "USOIL",
  WTIUSD: "USOIL",
  BRENT: "UKOIL",
  BRENTUSD: "UKOIL",
};

function toBars(candles: ChartCandle[]): OhlcvBar[] {
  return candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
  }));
}

async function fetchTf(pair: string, tf: string, limit: number): Promise<OhlcvBar[] | null> {
  try {
    const cfg = yahooIntervalFor(tf);
    if (!cfg) return null;
    const y = await getYahooChart(yahooSymbolForPair(pair), cfg.interval, cfg.range);
    if (!y?.candles?.length) return null;
    const bars = toBars(y.candles).slice(-limit);
    return bars.length >= 20 ? bars : null;
  } catch {
    return null;
  }
}

export interface ForexScalpResult {
  signal: ForexScalpSignal;
  quality: Meta["qualityStatus"];
}

export async function buildForexScalpSignal(
  pairRaw: string,
  overrides?: {
    calendarEvents?: Awaited<ReturnType<typeof getGlobalMacroShieldEvents>>;
    csmBaseMinusQuote?: number | null;
  },
): Promise<{ result: ForexScalpResult; meta: Meta } | null> {
  const cleanRaw = pairRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pair = FOREX_SCALP_ALIAS[cleanRaw] ?? cleanRaw;
  if (!/^[A-Z0-9]{5,10}$/.test(pair)) return null;

  try {
    const { cached } = await import("../cache");
    const cacheRes = await cached<{ result: ForexScalpResult; meta: Meta }>(`forex:scalp:v2:${pair}`, {
      ttlMs: 15_000,
      staleMs: 120_000,
      softSwr: true,
      producer: async () => {
        const hasCalOverride = overrides?.calendarEvents != null;
        const hasCsmOverride = overrides?.csmBaseMinusQuote !== undefined;
        const marketsBudget = hasCsmOverride
          ? Promise.resolve(null)
          : Promise.race([
              getForexMarkets().catch(() => null),
              new Promise<null>((r) => setTimeout(() => r(null), 2_500)),
            ]);
        const [h1, m15, m5, m1, calendarEvents, marketsRes] = await Promise.all([
          fetchTf(pair, "1h", 80),
          fetchTf(pair, "15m", 120),
          fetchTf(pair, "5m", 200),
          fetchTf(pair, "1m", 120),
          hasCalOverride ? Promise.resolve(overrides!.calendarEvents!) : getGlobalMacroShieldEvents().catch(() => []),
          marketsBudget,
        ]);

        let csmBaseMinusQuote: number | null = hasCsmOverride ? (overrides!.csmBaseMinusQuote ?? null) : null;
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
            const scoreMap = new Map<string, number>(csm.scores.map((s) => [s.currency, s.score]));
            const baseCurr = pair.slice(0, 3);
            const quoteCurr = pair.length >= 6 ? pair.slice(3, 6) : "USD";
            const baseScore = scoreMap.get(baseCurr);
            const quoteScore = scoreMap.get(quoteCurr);
            if (baseScore != null && quoteScore != null) {
              csmBaseMinusQuote = Number((baseScore - quoteScore).toFixed(1));
            } else if ((baseCurr === "XAU" || pair.includes("OIL")) && quoteScore != null) {
              csmBaseMinusQuote = Number((5.0 - quoteScore).toFixed(1));
            }
          }
        }

        let barsM5 = m5 ?? m15;
        if (!barsM5 || barsM5.length < 25) {
          try {
            const { getForexDetail } = await import("./forex");
            const fd = await getForexDetail(pair);
            if (fd?.detail?.series?.length && fd.detail.series.length >= 25) {
              barsM5 = fd.detail.series;
            }
          } catch {
            /* */
          }
        }

        if (!barsM5 || barsM5.length < 20) {
          throw new Error("insufficient bars for forex scalp");
        }

        const barsM15 = m15 && m15.length >= 25 ? m15 : barsM5;
        const barsH1 = h1 && h1.length >= 20 ? validateBars(h1).cleaned : null;

        const q5 = validateBars(barsM5);
        const q15 = validateBars(barsM15);
        if (q5.status !== "VALID") void logQualityEvent("yahoo-fx", `fx-scalp:${pair}:m5`, q5);
        if (q15.status !== "VALID") void logQualityEvent("yahoo-fx", `fx-scalp:${pair}:m15`, q15);

        const liveBarsM5 = mergeBarsWithBiquoteLiveTick(q5.cleaned, pair, 300);
        const liveBarsM15 = mergeBarsWithBiquoteLiveTick(q15.cleaned, pair, 900);

        const signal = analyzeForexScalp({
          pair,
          barsM15: liveBarsM15,
          barsM5: liveBarsM5,
          barsM1: m1 && m1.length >= 25 ? validateBars(m1).cleaned : null,
          barsH1,
          calendarEvents,
          csmBaseMinusQuote,
        });
        if (!signal) {
          throw new Error("engine could not compute forex scalp signal");
        }

        const meta = buildMeta({
          source: "yahoo-fx + forex-scalp-engine",
          sourceTimestampMs: barsM5[barsM5.length - 1]?.time ?? Date.now(),
          note: m15
            ? "Forex scalp M15→M5→M1 · session/spread/news filter"
            : "Forex scalp fallback",
          partial: !m15 || !m1,
        });
        meta.qualityStatus = q5.status === "VALID" ? "VALID" : "SUSPECT";

        return { result: { signal, quality: meta.qualityStatus }, meta };
      },
    });

    return cacheRes.value;
  } catch {
    return null;
  }
}
