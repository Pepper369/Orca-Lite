import "server-only";

const MIQUANT_BASE_URL = "https://backend.miquant.vn";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://app.miquant.vn",
  Referer: "https://app.miquant.vn/",
};

// In-memory cache for high-frequency endpoints
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

async function fetchWithCache<T>(url: string, ttlSeconds = 60): Promise<T | null> {
  const cached = memoryCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      next: { revalidate: ttlSeconds },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    memoryCache.set(url, { data: json, expiresAt: now + ttlSeconds * 1000 });
    return json as T;
  } catch (err) {
    console.warn(`[MiQuant Provider] Fetch failed for ${url}:`, err);
    return null;
  }
}

export interface MiQuantBreakoutStock {
  symbol: string;
  close: number;
  breakout_price: number;
  adv20_shares: number;
  volume: number;
  pct_change: number;
  volume_ratio: number;
  breakout_pct: number;
  score: number;
}

export interface MiQuantMoneyFlowStock {
  symbol: string;
  close: number;
  pct_change: number;
  cum_money_flow_bil: number;
}

export interface MiQuantSentimentStock {
  symbol: string;
  close: number;
  pct_change: number;
  sentiment: number;
  volume: number;
  volume_ratio: number;
  score: number;
  timestamp: string;
}

export interface MiQuantValuationStock {
  symbol: string;
  close: number;
  pct_change: number;
  target_price: number;
  upside: number;
  volume: number;
  volume_ratio: number;
  score: number;
}

export interface MiQuantTopForeignStock {
  symbol: string;
  close: number;
  pct_change: number;
  total_netvalue: number;
}

export interface MiQuantMarketSignalItem {
  timestamp: number;
  sentiment_signal?: number;
  market_cycle_signal?: number;
  momentum_signal?: number;
  breadth_signal?: number;
}

export interface MiQuantMarketOverview {
  timestamp: string;
  symbol: string;
  sentiment_display: string;
  garch_volatility_normal: number;
  risk_label: string;
  technical_indicator_label: string;
  pe: number;
  pb: number;
  high_52w: number;
  low_52w: number;
  net_money_flow: number;
  foreign_netvalue: number;
}

export interface MiQuantSupportResistance {
  timestamp: number;
  nearest_resistance: number;
  nearest_support: number;
  pct_to_resistance: number;
  pct_above_support: number;
}

export interface MiQuantCatalystItem {
  description: string;
  sites: Array<{
    domain: string;
    favicon?: string;
    articles: Array<{ url: string; title: string }>;
  }>;
}

export interface MiQuantCatalystResponse {
  symbol: string;
  updatedDate: string;
  totalCatalysts: number;
  summary: MiQuantCatalystItem[];
}

export interface MiQuantRiskItem {
  description: string;
  sites: Array<{
    domain: string;
    favicon?: string;
    articles: Array<{ url: string; title: string }>;
  }>;
}

export interface MiQuantRiskResponse {
  symbol: string;
  last_updated: string;
  total: number;
  summary: MiQuantRiskItem[];
}

export interface MiQuantKeyMetrics {
  symbol: string;
  name: string;
  short_name: string;
  exchange: string;
  industry: string;
  technical_score: number;
  technical_score_label: string;
  sentiment_score: number;
  sentiment_label: string;
  volatility: number;
  volatility_label: string;
  beta_3m: number;
  beta_12m: number;
  marketcap_bn: number;
  pe: number;
  pb: number;
  dividend_yield: number;
  volume: number;
  avg_volume_10d: number;
  eps: number;
  book_value: number;
  latest_revenue_bn: number;
  latest_net_profit_bn: number;
  free_float_percentage: number;
}

export interface MiQuantValuationDetail {
  symbol: string;
  close: number;
  daily_pct_change: number;
  valuation_date: string;
  ai_valuation: number;
  valuation_pct_gap: number;
  valuation_rating: string;
}

export interface MiQuantStockMoneyFlowHistory {
  timestamp: number[];
  total_net_money_flow: number[];
  cumulative_net_money_flow: number[];
}

export interface MiQuantFinancialCommentary {
  commentary: string;
  ticker: string;
  updatedDate: string;
  source: string;
}

export const MiQuantProvider = {
  /** Top breakout stocks from MiQuant */
  async getBreakoutStocks(): Promise<MiQuantBreakoutStock[]> {
    const res = await fetchWithCache<MiQuantBreakoutStock[]>(
      `${MIQUANT_BASE_URL}/finance/breakout-stocks`,
      120
    );
    return Array.isArray(res) ? res : [];
  },

  /** Top money flow stocks from MiQuant */
  async getMoneyFlowStocks(): Promise<MiQuantMoneyFlowStock[]> {
    const res = await fetchWithCache<MiQuantMoneyFlowStock[]>(
      `${MIQUANT_BASE_URL}/finance/money-flow-stocks`,
      120
    );
    return Array.isArray(res) ? res : [];
  },

  /** Top news sentiment stocks from MiQuant */
  async getSentimentStocks(): Promise<MiQuantSentimentStock[]> {
    const res = await fetchWithCache<MiQuantSentimentStock[]>(
      `${MIQUANT_BASE_URL}/finance/sentiment-stocks`,
      120
    );
    return Array.isArray(res) ? res : [];
  },

  /** Top valuation / upside stocks from MiQuant */
  async getValuationStocks(): Promise<MiQuantValuationStock[]> {
    const res = await fetchWithCache<MiQuantValuationStock[]>(
      `${MIQUANT_BASE_URL}/finance/valuation-stocks`,
      120
    );
    return Array.isArray(res) ? res : [];
  },

  /** Top foreign traded stocks from MiQuant */
  async getTopForeignStocks(): Promise<MiQuantTopForeignStock[]> {
    const res = await fetchWithCache<MiQuantTopForeignStock[]>(
      `${MIQUANT_BASE_URL}/finance/top-foreign-stocks`,
      120
    );
    return Array.isArray(res) ? res : [];
  },

  /** 4 Macro Quant signals (sentiment, cycle, momentum, breadth) */
  async getMarketSignals(): Promise<{
    sentiment: number;
    cycle: number;
    momentum: number;
    breadth: number;
    rawDate: string;
  }> {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];

    const [sentimentRes, cycleRes, momentumRes, breadthRes] = await Promise.all([
      fetchWithCache<MiQuantMarketSignalItem[]>(
        `${MIQUANT_BASE_URL}/finance/index-risk-sentiment-signal?start_date=${startDate}&signal_type=sentiment`,
        180
      ),
      fetchWithCache<MiQuantMarketSignalItem[]>(
        `${MIQUANT_BASE_URL}/finance/index-risk-sentiment-signal?start_date=${startDate}&signal_type=cycle`,
        180
      ),
      fetchWithCache<MiQuantMarketSignalItem[]>(
        `${MIQUANT_BASE_URL}/finance/index-risk-sentiment-signal?start_date=${startDate}&signal_type=momentum`,
        180
      ),
      fetchWithCache<MiQuantMarketSignalItem[]>(
        `${MIQUANT_BASE_URL}/finance/index-risk-sentiment-signal?start_date=${startDate}&signal_type=breadth`,
        180
      ),
    ]);

    const lastSentiment = Array.isArray(sentimentRes) && sentimentRes.length > 0 ? sentimentRes.at(-1) : null;
    const lastCycle = Array.isArray(cycleRes) && cycleRes.length > 0 ? cycleRes.at(-1) : null;
    const lastMomentum = Array.isArray(momentumRes) && momentumRes.length > 0 ? momentumRes.at(-1) : null;
    const lastBreadth = Array.isArray(breadthRes) && breadthRes.length > 0 ? breadthRes.at(-1) : null;

    return {
      sentiment: typeof lastSentiment?.sentiment_signal === "number" ? lastSentiment.sentiment_signal : 0,
      cycle: typeof lastCycle?.market_cycle_signal === "number" ? lastCycle.market_cycle_signal : 1,
      momentum: typeof lastMomentum?.momentum_signal === "number" ? lastMomentum.momentum_signal : 1,
      breadth: typeof lastBreadth?.breadth_signal === "number" ? lastBreadth.breadth_signal : 1,
      rawDate: lastSentiment?.timestamp ? new Date(lastSentiment.timestamp * 1000).toISOString().split("T")[0] : today.toISOString().split("T")[0],
    };
  },

  /** Market overview for VNINDEX (PE, PB, GARCH volatility, risk label, sentiment) */
  async getMarketOverview(symbol = "VNINDEX"): Promise<MiQuantMarketOverview | null> {
    const res = await fetchWithCache<{ data?: MiQuantMarketOverview }>(
      `${MIQUANT_BASE_URL}/api/v1/market/overview?symbol=${encodeURIComponent(symbol)}`,
      120
    );
    return res?.data ?? null;
  },

  /** Support and resistance calculation for VNINDEX */
  async getSupportResistance(symbol = "VNINDEX"): Promise<MiQuantSupportResistance | null> {
    const res = await fetchWithCache<{ data?: MiQuantSupportResistance }>(
      `${MIQUANT_BASE_URL}/api/v1/market/support-resistance?symbol=${encodeURIComponent(symbol)}`,
      120
    );
    return res?.data ?? null;
  },

  /** Total index money flow */
  async getTotalIndexMoneyFlow(universe = "vnindex", days = 30): Promise<Array<{ timestamp: number; total_net_money_flow: number; cumulative_net_money_flow: number; close_price: number }>> {
    const end = new Date();
    const start = new Date(Date.now() - days * 86400 * 1000);
    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    const res = await fetchWithCache<Array<{ timestamp: number; total_net_money_flow: number; cumulative_net_money_flow: number; close_price: number }>>(
      `${MIQUANT_BASE_URL}/finance/total-index-money-flow?universe=${universe}&start_date=${startDate}&end_date=${endDate}`,
      180
    );
    return Array.isArray(res) ? res : [];
  },

  /** Stock catalysts and fundamental events */
  async getStockCatalysts(symbol: string): Promise<MiQuantCatalystResponse | null> {
    const res = await fetchWithCache<{ data?: MiQuantCatalystResponse }>(
      `${MIQUANT_BASE_URL}/api/v1/stock/catalyst?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      600
    );
    return res?.data ?? null;
  },

  /** Stock risks and warnings */
  async getStockRisks(symbol: string): Promise<MiQuantRiskResponse | null> {
    const res = await fetchWithCache<{ data?: MiQuantRiskResponse }>(
      `${MIQUANT_BASE_URL}/api/v1/stock/risk?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      600
    );
    return res?.data ?? null;
  },

  /** Key metrics */
  async getStockKeyMetrics(symbol: string): Promise<MiQuantKeyMetrics | null> {
    const res = await fetchWithCache<{ data?: MiQuantKeyMetrics }>(
      `${MIQUANT_BASE_URL}/api/v1/stock/key-metrics?symbol=${encodeURIComponent(symbol.toUpperCase())}&lang=vi`,
      300
    );
    return res?.data ?? null;
  },

  /** Stock AI valuation */
  async getStockValuation(symbol: string): Promise<MiQuantValuationDetail | null> {
    const res = await fetchWithCache<{ data?: MiQuantValuationDetail }>(
      `${MIQUANT_BASE_URL}/api/v1/stock/valuation?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      300
    );
    return res?.data ?? null;
  },

  /** Historical active and cumulative money flow for a stock */
  async getStockMoneyFlow(
    symbol: string,
    days = 60
  ): Promise<MiQuantStockMoneyFlowHistory | null> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const res = await fetchWithCache<{ data?: MiQuantStockMoneyFlowHistory }>(
      `${MIQUANT_BASE_URL}/api/v1/stock/money-flow?symbol=${encodeURIComponent(
        symbol.toUpperCase()
      )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      120
    );
    return res?.data ?? null;
  },

  /** Financial commentary comparing quarter vs 3y avg vs industry */
  async getStockFinancialCommentary(symbol: string): Promise<MiQuantFinancialCommentary | null> {
    const res = await fetchWithCache<MiQuantFinancialCommentary>(
      `${MIQUANT_BASE_URL}/overview/financial-commentary?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      600
    );
    return res ?? null;
  },
};
