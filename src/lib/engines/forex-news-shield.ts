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

/**
 * Institutional 3-Phase Event Lifecycle Evaluator
 * Maps temporal proximity of high-impact events to execution rules and volatility buffers.
 */
export function evaluateFullEventLifecycle(
  pair: string,
  nowMs = Date.now(),
  calendarEvents: { name?: string; time?: string; currency?: string; importance?: string }[] = []
): {
  phase: "PRE_EVENT_COMPRESSION" | "EVENT_SHOCK_FREEZE" | "POST_EVENT_RECOVERY" | "POST_EVENT_DRIFT" | "NORMAL_EXPANSION";
  isLockout: boolean;
  minutesToEvent: number | null;
  activeEvent: HighImpactNewsEvent | null;
  executionRule: "REJECT_MARKET_ORDERS" | "PASSIVE_LIMIT_ONLY" | "TWAP_ONLY" | "ALLOW_ALL";
  spreadMultiplier: number;
  slippageBufferPips: number;
  rationaleVi: string;
} {
  const cb = evaluateNewsCircuitBreaker(pair, nowMs, calendarEvents);
  const ev = cb.relevantEvent;
  const mins = cb.minutesToEvent;

  if (!ev || mins === null || Math.abs(mins) > 240) {
    return {
      phase: "NORMAL_EXPANSION",
      isLockout: false,
      minutesToEvent: mins,
      activeEvent: null,
      executionRule: "ALLOW_ALL",
      spreadMultiplier: 1.0,
      slippageBufferPips: 1.5,
      rationaleVi: "Ngoài phạm vi ảnh hưởng của tin vĩ mô. Giao dịch bình thường theo chiến lược cơ sở.",
    };
  }

  // Event Shock Freeze: -15 mins to +20 mins (mins > 0 means before event, mins <= 0 means after event in evaluateNewsCircuitBreaker)
  if (cb.isLockout) {
    return {
      phase: "EVENT_SHOCK_FREEZE",
      isLockout: true,
      minutesToEvent: mins,
      activeEvent: ev,
      executionRule: "REJECT_MARKET_ORDERS",
      spreadMultiplier: 3.0,
      slippageBufferPips: cb.slippageBufferPips,
      rationaleVi: cb.warningMessage ?? "Vùng đóng băng giao dịch khẩn cấp (Event Shock Freeze).",
    };
  }

  // Pre-event Compression: 15 to 60 mins before event (mins > 0 in evaluateNewsCircuitBreaker is pre-event)
  if (mins > 15 && mins <= 60) {
    return {
      phase: "PRE_EVENT_COMPRESSION",
      isLockout: false,
      minutesToEvent: mins,
      activeEvent: ev,
      executionRule: "PASSIVE_LIMIT_ONLY",
      spreadMultiplier: 1.6,
      slippageBufferPips: 3.5,
      rationaleVi: `Co cụm biến động trước tin [${ev.name}] (${mins} phút trước giờ G). Giảm 50% đòn bẩy và chỉ dùng lệnh Limit thụ động.`,
    };
  }

  // Post-event Recovery: 20 to 60 mins after event (mins < 0, between -20 and -60)
  if (mins < -20 && mins >= -60) {
    return {
      phase: "POST_EVENT_RECOVERY",
      isLockout: false,
      minutesToEvent: mins,
      activeEvent: ev,
      executionRule: "TWAP_ONLY",
      spreadMultiplier: 1.4,
      slippageBufferPips: 2.8,
      rationaleVi: `Thanh khoản đang hồi phục sau tin [${ev.name}] (${Math.abs(mins)} phút sau giờ G). Ưu tiên giải ngân theo TWAP.`,
    };
  }

  // Post-event Drift: 60 to 240 mins after event (mins between -60 and -240)
  if (mins < -60 && mins >= -240) {
    return {
      phase: "POST_EVENT_DRIFT",
      isLockout: false,
      minutesToEvent: mins,
      activeEvent: ev,
      executionRule: "ALLOW_ALL",
      spreadMultiplier: 1.1,
      slippageBufferPips: 2.0,
      rationaleVi: `Xu hướng vĩ mô mới đã thiết lập (Post-Event Drift sau [${ev.name}]). Kích hoạt chiến lược Trend-Following theo hướng phản ứng.`,
    };
  }

  return {
    phase: "NORMAL_EXPANSION",
    isLockout: false,
    minutesToEvent: mins,
    activeEvent: ev,
    executionRule: "ALLOW_ALL",
    spreadMultiplier: 1.0,
    slippageBufferPips: 1.5,
    rationaleVi: "Biến động bình thường.",
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

export interface SpreadRecoveryHysteresisResult {
  isLockout: boolean;
  hysteresisLocked: boolean;
  consecutiveNormalizedTicks: number;
  requiredNormalizedTicks: number;
  thresholdSpreadPips: number;
  latestSpreadPips: number;
  rationaleVi: string;
}

/**
 * Post-News Spread-Recovery Hysteresis Gate:
 * Even after the scheduled post-news timer expires, keeps execution locked out until
 * `liveSpread <= maxMultiplier * rollingMedianSpread` holds continuously across K consecutive ticks.
 */
export function evaluateSpreadRecoveryHysteresis(params: {
  recentSpreadTicksPips: number[];
  rollingMedianSpreadPips: number;
  maxMultiplier?: number; // default 1.5x median spread
  requiredConsecutiveTicks?: number; // default K = 3 consecutive normalized ticks
  timeBasedCircuitBreaker?: NewsCircuitBreakerResult | null;
}): SpreadRecoveryHysteresisResult {
  const {
    recentSpreadTicksPips,
    rollingMedianSpreadPips,
    maxMultiplier = 1.5,
    requiredConsecutiveTicks = 3,
    timeBasedCircuitBreaker,
  } = params;

  const median = Math.max(0.2, rollingMedianSpreadPips);
  const thresholdSpreadPips = Number((median * maxMultiplier).toFixed(2));
  const latestSpreadPips =
    recentSpreadTicksPips.length > 0
      ? recentSpreadTicksPips[recentSpreadTicksPips.length - 1]!
      : median;

  let consecutiveNormalizedTicks = 0;
  for (let i = recentSpreadTicksPips.length - 1; i >= 0; i--) {
    if (recentSpreadTicksPips[i]! <= thresholdSpreadPips) {
      consecutiveNormalizedTicks++;
    } else {
      break;
    }
  }

  const hysteresisLocked = consecutiveNormalizedTicks < requiredConsecutiveTicks;
  const timeLocked = Boolean(timeBasedCircuitBreaker?.isLockout);
  const isLockout = timeLocked || hysteresisLocked;

  const rationaleVi = timeLocked
    ? timeBasedCircuitBreaker?.warningMessage ?? "Đang trong khung giờ khóa tin đỏ."
    : hysteresisLocked
      ? `Hysteresis Spread Lock: Spread hiện tại (${latestSpreadPips.toFixed(2)} pips) chỉ mới bình thường hóa ${consecutiveNormalizedTicks}/${requiredConsecutiveTicks} tick liên tiếp (Ngưỡng <= ${thresholdSpreadPips} pips). Tiếp tục chờ thanh khoản ổn định.`
      : `Thanh khoản đã hồi phục hoàn toàn (${consecutiveNormalizedTicks}/${requiredConsecutiveTicks} tick liên tiếp <= ${thresholdSpreadPips} pips). Cho phép mở lệnh trở lại.`;

  return {
    isLockout,
    hysteresisLocked,
    consecutiveNormalizedTicks,
    requiredNormalizedTicks: requiredConsecutiveTicks,
    thresholdSpreadPips,
    latestSpreadPips: Number(latestSpreadPips.toFixed(2)),
    rationaleVi,
  };
}
