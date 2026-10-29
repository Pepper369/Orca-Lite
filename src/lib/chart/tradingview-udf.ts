/**
 * TradingView UDF (Universal Data Feed) Protocol Helpers for Orca-Lite
 * Translates between TradingView UDF conventions and Orca internal data engines.
 */

export interface UdfConfig {
  supports_search: boolean;
  supports_group_request: boolean;
  supported_resolutions: string[];
  supports_marks: boolean;
  supports_timescale_marks: boolean;
  supports_time: boolean;
  exchanges: Array<{ value: string; name: string; desc: string }>;
  symbols_types: Array<{ name: string; value: string }>;
}

export interface UdfSymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: "price" | "volume";
  pricescale: number;
  minmov: number;
  has_intraday: boolean;
  supported_resolutions: string[];
  intraday_multipliers: string[];
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  currency_code: string;
}

export interface UdfHistoryResponse {
  s: "ok" | "no_data" | "error";
  errmsg?: string;
  t?: number[]; // Unix timestamps in seconds
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

/**
 * Maps TradingView resolution (e.g. "1", "5", "60", "D", "1D", "W", "M")
 * to Orca-Lite timeframe ("1m", "5m", "15m", "30m", "1h", "1d", "1w", "1M").
 */
export function tvResolutionToOrcaTimeframe(resolution: string): string {
  const res = resolution.toUpperCase();
  if (res === "1") return "1m";
  if (res === "3") return "3m";
  if (res === "5") return "5m";
  if (res === "15") return "15m";
  if (res === "30") return "30m";
  if (res === "60" || res === "1H") return "1h";
  if (res === "120" || res === "2H") return "2h";
  if (res === "240" || res === "4H") return "4h";
  if (res === "D" || res === "1D") return "1d";
  if (res === "W" || res === "1W") return "1w";
  if (res === "M" || res === "1M") return "1M";
  return "1d";
}

/**
 * Detects asset type from symbol string
 */
export function detectAssetType(symbol: string): "stock" | "crypto" | "forex" | "commodity" {
  const s = symbol.trim().toUpperCase();
  if (s.endsWith("USDT") || s.startsWith("BTC") || s.startsWith("ETH") || s === "SOL" || s === "BNB") {
    return "crypto";
  }
  if (s.length === 6 && (s.startsWith("USD") || s.startsWith("EUR") || s.startsWith("GBP") || s.startsWith("JPY"))) {
    return "forex";
  }
  if (s === "GOLD" || s === "SILVER" || s === "OIL" || s === "BRENT" || s === "WTI") {
    return "commodity";
  }
  return "stock";
}

export const DEFAULT_UDF_CONFIG: UdfConfig = {
  supports_search: true,
  supports_group_request: false,
  supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
  supports_marks: true,
  supports_timescale_marks: true,
  supports_time: true,
  exchanges: [
    { value: "HOSE", name: "Sở GDCK TP.HCM", desc: "Ho Chi Minh Stock Exchange" },
    { value: "HNX", name: "Sở GDCK Hà Nội", desc: "Hanoi Stock Exchange" },
    { value: "UPCOM", name: "Thị trường UPCoM", desc: "Unlisted Public Company Market" },
    { value: "BINANCE", name: "Binance Crypto", desc: "Binance Spot/Futures" },
    { value: "FOREX", name: "Thị trường Ngoại hối", desc: "Interbank Foreign Exchange" },
  ],
  symbols_types: [
    { name: "Tất cả", value: "" },
    { name: "Cổ phiếu", value: "stock" },
    { name: "Chỉ số", value: "index" },
    { name: "Tiền mã hóa", value: "crypto" },
    { name: "Ngoại hối", value: "forex" },
    { name: "Hàng hóa", value: "commodity" },
  ],
};

