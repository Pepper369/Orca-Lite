/**
 * TradingView Vietnam Scanner Provider
 * Queries scanner.tradingview.com/vietnam/scan for high-speed batch metrics.
 */

export interface TvScannedStock {
  symbol: string;
  exchange: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  pb?: number;
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  recommendAll?: number; // -1 to 1
  recommendMa?: number;
  recommendOther?: number;
  rating: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
}

function ratingFromScore(score: number | undefined): "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" {
  if (score == null) return "NEUTRAL";
  if (score >= 0.5) return "STRONG_BUY";
  if (score >= 0.1) return "BUY";
  if (score <= -0.5) return "STRONG_SELL";
  if (score <= -0.1) return "SELL";
  return "NEUTRAL";
}

export async function fetchTradingViewScanner(options?: {
  symbols?: string[];
  sortColumn?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}): Promise<TvScannedStock[]> {
  const url = "https://scanner.tradingview.com/vietnam/scan";

  const columns = [
    "name",
    "description",
    "close",
    "change",
    "change_abs",
    "volume",
    "market_cap_basic",
    "price_earnings_ttm",
    "price_book_ratio",
    "RSI",
    "MACD.macd",
    "MACD.signal",
    "Recommend.All",
    "Recommend.MA",
    "Recommend.Other",
  ];

  const payload: Record<string, unknown> = {
    columns,
    ignore_unknown_fields: true,
    options: { lang: "en" },
    range: [0, Math.min(options?.limit ?? 150, 500)],
    sort: {
      sortBy: options?.sortColumn ?? "volume",
      sortOrder: options?.sortOrder ?? "desc",
    },
  };

  if (options?.symbols && options.symbols.length > 0) {
    payload.filter = [
      {
        left: "name",
        operation: "in_range",
        right: options.symbols.map((s) => s.toUpperCase()),
      },
    ];
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify(payload),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`TradingView Scanner HTTP ${res.status}`);
    }

    const data = await res.json();
    const rows = data?.data || [];

    return rows.map((item: any) => {
      const s = String(item.s || "");
      const [ex, sym] = s.includes(":") ? s.split(":") : ["HOSE", s];
      const d = item.d || [];

      const close = Number(d[2] || 0);
      const changePercent = Number(d[3] || 0);
      const change = Number(d[4] || 0);
      const volume = Number(d[5] || 0);
      const marketCap = d[6] != null ? Number(d[6]) : undefined;
      const pe = d[7] != null ? Number(d[7]) : undefined;
      const pb = d[8] != null ? Number(d[8]) : undefined;
      const rsi14 = d[9] != null ? Number(d[9]) : undefined;
      const macd = d[10] != null ? Number(d[10]) : undefined;
      const macdSignal = d[11] != null ? Number(d[11]) : undefined;
      const recommendAll = d[12] != null ? Number(d[12]) : undefined;
      const recommendMa = d[13] != null ? Number(d[13]) : undefined;
      const recommendOther = d[14] != null ? Number(d[14]) : undefined;

      return {
        symbol: sym.toUpperCase(),
        exchange: ex.toUpperCase(),
        name: String(d[1] || sym),
        close,
        change,
        changePercent,
        volume,
        marketCap,
        pe,
        pb,
        rsi14,
        macd,
        macdSignal,
        recommendAll,
        recommendMa,
        recommendOther,
        rating: ratingFromScore(recommendAll),
      };
    });
  } catch (err) {
    console.warn("[TradingView Scanner Fallback]", err);
    return [];
  }
}

