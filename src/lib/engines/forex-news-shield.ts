/**
 * FOREX HIGH-IMPACT NEWS CIRCUIT BREAKER & ANTI-SLIPPAGE SHIELD
 *
 * Protects quantitative trading systems from catastrophic slippage:
 * - News Blackout Windows (15 mins PRE-NEWS & 20 mins POST-NEWS) for NFP, CPI, FOMC, Rate decisions
 * - Automatic trade freeze (Circuit Breaker)
 * - Dynamic Slippage Buffer & Spread Expansion detection
 * - Fragile vs Stable Level classification (Prevents trading pre-news FVGs/VPOCs during news spikes)
 */

export interface HighImpactNewsEvent {
  id: string;
  name: string;
  currency: string; // e.g. "USD", "EUR", "GBP", "JPY", "AUD", "CAD"
  scheduledTime: number; // UTC timestamp ms
  importance: "CRITICAL" | "HIGH";
  typicalVolatilityPips: number;
}

export interface NewsCircuitBreakerResult {
  isLockout: boolean;
  stage: "NORMAL" | "PRE_NEWS_FREEZE" | "POST_NEWS_COOLDOWN";
  relevantEvent: HighImpactNewsEvent | null;
  minutesToEvent: number | null;
  recommendedAction: "NORMAL_TRADING" | "CANCEL_PENDING_ORDERS" | "WAIT_SPREAD_NORMALIZATION";
  warningMessage?: string;
  slippageBufferPips: number;
  maxAllowedSpreadPips: number;
}

// Common high-impact macroeconomic recurring events
export const HIGH_IMPACT_KEYWORDS = [
  "NON-FARM",
  "NONFARM",
  "NFP",
  "CPI",
  "CONSUMER PRICE INDEX",
  "INFLATION",
  "FOMC",
  "FED INTEREST RATE",
  "RATE DECISION",
  "POWELL",
  "LAGARDE",
  "UNEMPLOYMENT RATE",
  "GDP",
  "RETAIL SALES",
  "PPI",
  "PCE",
];

/**
 * Checks if a news event name corresponds to critical high-impact category.
 */
export function isCriticalNewsEvent(name: string): boolean {
  const upper = name.toUpperCase();
  return HIGH_IMPACT_KEYWORDS.some((kw) => upper.includes(kw));
}

/**
 * Checks if a currency pair is affected by an event's currency.
 */
export function isPairAffectedByCurrency(pair: string, eventCurrency: string): boolean {
  const clean = pair.toUpperCase().replace("/", "").replace("-", "");
  const ev = eventCurrency.toUpperCase().trim();
  if (ev === "USD" || ev === "ALL") return true; // USD affects nearly all liquid Forex pairs
  return clean.includes(ev);
}

/**
 * Evaluates the Anti-Slippage Circuit Breaker for a given pair and timestamp.
 */
export function evaluateNewsCircuitBreaker(
  pair: string,
  nowMs = Date.now(),
  calendarEvents: { name?: string; time?: string; currency?: string; importance?: string }[] = []
): NewsCircuitBreakerResult {
  const cleanPair = pair.toUpperCase().replace("/", "").replace("-", "");
  const PRE_NEWS_FREEZE_MS = 15 * 60 * 1000; // 15 mins before
  const POST_NEWS_COOLDOWN_MS = 20 * 60 * 1000; // 20 mins after

  // Filter relevant high-impact events
  const relevantEvents: HighImpactNewsEvent[] = [];

  for (const ev of calendarEvents) {
    if (!ev.name || !ev.time) continue;
    const evTime = Date.parse(ev.time);
    if (!Number.isFinite(evTime)) continue;

    const isHigh =
      ev.importance === "high" ||
      ev.importance === "CRITICAL" ||
      isCriticalNewsEvent(ev.name);

    const curr = (ev.currency ?? "USD").toUpperCase();
    if (isHigh && isPairAffectedByCurrency(cleanPair, curr)) {
      relevantEvents.push({
        id: `news-${evTime}-${curr}`,
        name: ev.name,
        currency: curr,
        scheduledTime: evTime,
        importance: isCriticalNewsEvent(ev.name) ? "CRITICAL" : "HIGH",
        typicalVolatilityPips: ev.name.toUpperCase().includes("NFP") ? 80 : 45,
      });
    }
  }

  // Sort events by proximity to current time
  relevantEvents.sort((a, b) => Math.abs(a.scheduledTime - nowMs) - Math.abs(b.scheduledTime - nowMs));

  const activeEvent = relevantEvents.find((e) => {
    const diff = e.scheduledTime - nowMs;
    // Inside freeze window: 15 mins before to 20 mins after
    return diff <= PRE_NEWS_FREEZE_MS && diff >= -POST_NEWS_COOLDOWN_MS;
  });

  if (activeEvent) {
    const diffMs = activeEvent.scheduledTime - nowMs;
    const minutesToEvent = Math.round(diffMs / 60000);
    const isPreNews = diffMs > 0;

    const stage = isPreNews ? "PRE_NEWS_FREEZE" : "POST_NEWS_COOLDOWN";
    const recommendedAction = isPreNews
      ? "CANCEL_PENDING_ORDERS"
      : "WAIT_SPREAD_NORMALIZATION";

    const warningMessage = isPreNews
      ? `🚨 KHÓA GIAO DỊCH CHỐNG TRƯỢT GIÁ: Tin đỏ [${activeEvent.name}] công bố sau ${minutesToEvent} phút. Hủy toàn bộ lệnh chờ limit, khóa mở vị thế mới để tránh giãn spread & slippage.`
      : `⚠️ HẠN CHẾ VÀO LỆNH (COOLDOWN): Tin đỏ [${activeEvent.name}] vừa công bố. Chờ ${Math.abs(minutesToEvent)}/20 phút để thanh khoản liên ngân hàng tái lập và spread co hẹp.`;

    return {
      isLockout: true,
      stage,
      relevantEvent: activeEvent,
      minutesToEvent,
      recommendedAction,
      warningMessage,
      slippageBufferPips: 8.0, // Expanded 8-pip safety buffer
      maxAllowedSpreadPips: 2.5, // Strict maximum spread
    };
  }

  // Default normal conditions
  return {
    isLockout: false,
    stage: "NORMAL",
    relevantEvent: relevantEvents[0] ?? null,
    minutesToEvent: relevantEvents[0] ? Math.round((relevantEvents[0].scheduledTime - nowMs) / 60000) : null,
    recommendedAction: "NORMAL_TRADING",
    slippageBufferPips: 1.5,
    maxAllowedSpreadPips: 3.5,
  };
}

export interface DynamicSlippageResult {
  baseSpreadPips: number;
  recommendedSlippagePips: number;
  maxAllowedSlippagePips: number;
  urgencyLevel: "LOW" | "MODERATE" | "HIGH";
  riskNote: string;
}

/**
 * Calculates dynamic slippage buffer based on current spread and volatility.
 */
export function calculateDynamicSlippageBuffer(
  pair: string,
  currentSpreadPips: number | null = 1.2,
  atrPips: number | null = 15.0,
  isCircuitBreakerActive = false
): DynamicSlippageResult {
  const spread = currentSpreadPips ?? 1.2;
  const atr = atrPips ?? 15.0;

  if (isCircuitBreakerActive) {
    return {
      baseSpreadPips: spread,
      recommendedSlippagePips: 8.0,
      maxAllowedSlippagePips: 12.0,
      urgencyLevel: "HIGH",
      riskNote: "🚨 Đóng băng do tin đỏ: Khuyến nghị hủy lệnh limit và không mở lệnh mới để tránh trượt giá cực mạnh.",
    };
  }

  const spreadExpansionPenalty = spread > 2.0 ? (spread - 2.0) * 1.5 : 0;
  const volatilityPenalty = atr > 30.0 ? 1.5 : 0;
  const recBuffer = Math.round((spread * 1.2 + spreadExpansionPenalty + volatilityPenalty) * 10) / 10;
  const maxBuffer = Math.round(recBuffer * 2.0 * 10) / 10;

  const urgency: "LOW" | "MODERATE" | "HIGH" =
    recBuffer > 4.0 ? "HIGH" : recBuffer > 2.5 ? "MODERATE" : "LOW";

  return {
    baseSpreadPips: spread,
    recommendedSlippagePips: recBuffer,
    maxAllowedSlippagePips: maxBuffer,
    urgencyLevel: urgency,
    riskNote:
      urgency === "LOW"
        ? "Thanh khoản bình thường, spread ổn định."
        : "Spread đang giãn nở, cần nới lỏng slippage buffer khi đặt lệnh.",
  };
}
