import type { OhlcvBar, Quote } from "../types";
import { sma } from "../technical";

export type MtfTimeframeBias = "BULL" | "NEUTRAL" | "BEAR";

export type MtfQuoteInput = {
  price?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  quoteVolume?: number | null;
  changePercent?: number | null;
};

export type MtfConsensusStatus =
  | "ALL_BULL"       // H1 + D1 + W1 đồng thuận tăng tuyệt đối
  | "D1_W1_BULL"     // Trung - Dài hạn D1 + W1 tăng (H1 đang retest/pullback)
  | "H1_D1_BULL"     // Ngắn hạn H1 + D1 tăng (W1 đang gặp cản/tích lũy)
  | "MIXED"          // Phân hóa / lệch pha giữa các khung
  | "BEAR_PRESSURE"; // Áp lực giảm đa khung

export interface MtfTimeframeDetail {
  bias: MtfTimeframeBias;
  score: number; // 0 - 100
  reason: string;
  keyLevel?: number | null;
}

export interface MtfConsensusResult {
  consensus: MtfConsensusStatus;
  isAligned: boolean; // true khi ALL_BULL (cả 3 khung H1, D1, W1 đều BULL)
  score: number;      // 0 - 100
  summary: string;
  badgeVi: string;
  details: {
    w1: MtfTimeframeDetail;
    d1: MtfTimeframeDetail;
    h1: MtfTimeframeDetail;
  };
}

/** ISO Calendar Week Key for deterministic aggregation */
function getWeekKey(ts: number): string {
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Resample Daily bars (D1) into Weekly bars (W1) with pure OHLCV fidelity */
export function resampleWeeklyBars(dailyBars: OhlcvBar[]): OhlcvBar[] {
  if (!dailyBars || dailyBars.length === 0) return [];

  const sorted = [...dailyBars].sort((a, b) => a.time - b.time);
  const weeklyMap = new Map<string, OhlcvBar>();

  for (const bar of sorted) {
    if (!bar || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const wKey = getWeekKey(bar.time);
    const existing = weeklyMap.get(wKey);

    if (!existing) {
      weeklyMap.set(wKey, {
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume ?? 0;
      existing.time = bar.time; // retain latest timestamp in week
    }
  }

  return Array.from(weeklyMap.values());
}

function safeLastSma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const arr = sma(closes, period);
  const v = arr[arr.length - 1];
  return v != null && Number.isFinite(v) ? Number(v.toFixed(2)) : null;
}

function safePrevSma(closes: number[], period: number, barsAgo = 1): number | null {
  if (closes.length < period + barsAgo) return null;
  const arr = sma(closes, period);
  const v = arr[arr.length - 1 - barsAgo];
  return v != null && Number.isFinite(v) ? Number(v.toFixed(2)) : null;
}

/** Evaluate W1 (Weekly - Macro Trend) */
export function evaluateWeeklyBias(wBars: OhlcvBar[], currentPrice: number): MtfTimeframeDetail {
  if (!wBars || wBars.length < 3) {
    return { bias: "NEUTRAL", score: 50, reason: "Chưa đủ dữ liệu nến tuần W1" };
  }

  const closes = wBars.map((b) => b.close);
  const p = currentPrice > 0 ? currentPrice : closes[closes.length - 1]!;

  const wSma10 = safeLastSma(closes, 10);
  const prevWSma10 = safePrevSma(closes, 10, 1);
  const wSma5 = safeLastSma(closes, 5);
  const prevWSma5 = safePrevSma(closes, 5, 1);
  const refSma = wSma10 ?? wSma5;
  const refPrev = wSma10 ? prevWSma10 : prevWSma5;

  if (refSma != null && p >= refSma * 0.99) {
    const isSlopeUp = refPrev != null && refSma >= refPrev;
    if (isSlopeUp) {
      return {
        bias: "BULL",
        score: 90,
        reason: `Giá trên SMA10W (${refSma}) đang dốc lên`,
        keyLevel: refSma,
      };
    }
    return {
      bias: "BULL",
      score: 75,
      reason: `Giữ vững hỗ trợ SMA tuần (${refSma})`,
      keyLevel: refSma,
    };
  }

  if (refSma != null && p < refSma * 0.96) {
    const isSlopeDown = refPrev != null && refSma < refPrev;
    if (isSlopeDown) {
      return {
        bias: "BEAR",
        score: 20,
        reason: `Dưới SMA10W (${refSma}), xu hướng tuần suy yếu`,
        keyLevel: refSma,
      };
    }
    return {
      bias: "BEAR",
      score: 35,
      reason: `Đang dưới hỗ trợ SMA tuần (${refSma})`,
      keyLevel: refSma,
    };
  }

  return {
    bias: "NEUTRAL",
    score: 50,
    reason: `Dao động tích lũy quanh SMA tuần (${refSma ?? p})`,
    keyLevel: refSma,
  };
}

/** Evaluate D1 (Daily - Primary Swing Structure) */
export function evaluateDailyBias(
  dailyBars: OhlcvBar[],
  currentPrice: number,
  confluenceHint?: number,
): MtfTimeframeDetail {
  if (!dailyBars || dailyBars.length < 15) {
    return { bias: "NEUTRAL", score: 50, reason: "Chưa đủ dữ liệu nến ngày D1" };
  }

  const closes = dailyBars.map((b) => b.close);
  const p = currentPrice > 0 ? currentPrice : closes[closes.length - 1]!;

  const sma20 = safeLastSma(closes, 20);
  const prevSma20 = safePrevSma(closes, 20, 1);
  const sma50 = safeLastSma(closes, 50);

  const isAbove20 = sma20 != null && p >= sma20 * 0.988;
  const isSma20Rising = sma20 != null && prevSma20 != null && sma20 >= prevSma20;
  const isGoldenRibbon = sma20 != null && sma50 != null && sma20 >= sma50;

  if (isAbove20 && (isSma20Rising || isGoldenRibbon || (confluenceHint != null && confluenceHint >= 60))) {
    return {
      bias: "BULL",
      score: isGoldenRibbon && isSma20Rising ? 95 : 80,
      reason: `Uptrend ngày: Giá trên MA20 (${sma20}) ${isGoldenRibbon ? "+ Ribbon MA50" : ""}`.trim(),
      keyLevel: sma20,
    };
  }

  if (sma20 != null && p < sma20 * 0.965 && (sma50 == null || p < sma50 * 0.97)) {
    return {
      bias: "BEAR",
      score: 25,
      reason: `Thủng MA20 ngày (${sma20}), áp lực điều chỉnh`,
      keyLevel: sma20,
    };
  }

  return {
    bias: "NEUTRAL",
    score: 50,
    reason: `Tích lũy kiểm tra hỗ trợ MA20 (${sma20 ?? p})`,
    keyLevel: sma20,
  };
}

/** Evaluate H1 (1-Hour / Intraday Execution Timing) */
export function evaluateHourlyBias(
  dailyBars: OhlcvBar[],
  currentPrice: number,
  quote?: MtfQuoteInput,
  h1Bars?: OhlcvBar[],
  foreignBuyRatio?: number | null,
): MtfTimeframeDetail {
  // 1. Direct evaluation when real H1 bars exist
  if (h1Bars && h1Bars.length >= 10) {
    const hCloses = h1Bars.map((b) => b.close);
    const p = currentPrice > 0 ? currentPrice : hCloses[hCloses.length - 1]!;
    const hSma20 = safeLastSma(hCloses, 20) ?? safeLastSma(hCloses, 10);
    const prevHSma = safePrevSma(hCloses, 20, 1) ?? safePrevSma(hCloses, 10, 1);

    if (hSma20 != null && p >= hSma20 * 0.995) {
      return {
        bias: "BULL",
        score: prevHSma && hSma20 >= prevHSma ? 90 : 80,
        reason: `H1 trên MA20 giờ (${hSma20}), động lượng kích hoạt`,
        keyLevel: hSma20,
      };
    }
    if (hSma20 != null && p < hSma20 * 0.985) {
      return {
        bias: "BEAR",
        score: 30,
        reason: `H1 dưới MA20 giờ (${hSma20}), nhịp chỉnh ngắn hạn`,
        keyLevel: hSma20,
      };
    }
    return {
      bias: "NEUTRAL",
      score: 50,
      reason: `H1 tích lũy giằng co quanh MA20 giờ (${hSma20})`,
      keyLevel: hSma20,
    };
  }

  // 2. High-fidelity Intraday Session Order Flow & Price Action proxy
  const lastBar = dailyBars[dailyBars.length - 1];
  if (!lastBar) {
    return { bias: "NEUTRAL", score: 50, reason: "Chưa có dữ liệu phiên trong ngày" };
  }

  const p = currentPrice > 0 ? currentPrice : lastBar.close;
  const barHigh = Math.max(lastBar.high, quote?.high ?? p, p);
  const barLow = Math.min(lastBar.low, quote?.low ?? p, p);
  const barOpen = quote?.open && quote.open > 0 ? quote.open : lastBar.open || p;
  const barRange = Math.max(0.001, barHigh - barLow);

  const pos = (p - barLow) / barRange; // 0 to 1
  const lowerWick = Math.min(barOpen, p) - barLow;
  const lowerWickPct = (lowerWick / barRange) * 100;
  const avgPrice =
    quote?.quoteVolume && quote.volume && quote.volume > 0
      ? quote.quoteVolume / quote.volume
      : (barHigh + barLow + p) / 3;

  const isGreenSession = p >= barOpen;
  const isAboveVwap = p >= avgPrice * 0.998;
  const hasStrongSpring = lowerWickPct >= 30 && p >= barLow * 1.01;
  const isClosingUpperHalf = pos >= 0.50;
  const isForeignAccum = foreignBuyRatio != null && foreignBuyRatio >= 52;

  if (
    (isGreenSession && isAboveVwap) ||
    (isClosingUpperHalf && isGreenSession) ||
    (isAboveVwap && hasStrongSpring) ||
    (isAboveVwap && isForeignAccum)
  ) {
    return {
      bias: "BULL",
      score: pos >= 0.65 && isAboveVwap ? 90 : 80,
      reason: hasStrongSpring
        ? "Rút chân mạnh trong phiên (Spring H1), lực cầu hấp thụ tốt"
        : `Lực mua áp đảo các khung giờ (Giá trên VWAP ${avgPrice.toFixed(2)})`,
      keyLevel: avgPrice,
    };
  }

  const isDumping = pos <= 0.35 && p < barOpen && p < avgPrice * 0.992;
  if (isDumping) {
    return {
      bias: "BEAR",
      score: 25,
      reason: `Áp lực bán khung giờ (Đóng thấp phiên, dưới VWAP ${avgPrice.toFixed(2)})`,
      keyLevel: avgPrice,
    };
  }

  return {
    bias: "NEUTRAL",
    score: 50,
    reason: `Khung giờ H1 dao động tích lũy (Cân bằng quanh VWAP ${avgPrice.toFixed(2)})`,
    keyLevel: avgPrice,
  };
}

/**
 * Multi-Timeframe (H1, D1, W1) Consensus Evaluator
 * Pure deterministic, zero latency, resilient for batch screeners.
 */
export function evaluateMtfConsensus(
  dailyBars: OhlcvBar[],
  quote?: MtfQuoteInput,
  extra?: {
    h1Bars?: OhlcvBar[];
    foreignBuyRatio?: number | null;
    confluenceHint?: number;
  },
): MtfConsensusResult {
  const currentPrice =
    quote?.price && quote.price > 0
      ? quote.price
      : dailyBars[dailyBars.length - 1]?.close ?? 0;

  // 1. Resample W1 from D1 bars
  const wBars = resampleWeeklyBars(dailyBars);
  const w1 = evaluateWeeklyBias(wBars, currentPrice);

  // 2. Evaluate D1
  const d1 = evaluateDailyBias(dailyBars, currentPrice, extra?.confluenceHint);

  // 3. Evaluate H1 (from real H1 bars or intraday session dynamics)
  const h1 = evaluateHourlyBias(
    dailyBars,
    currentPrice,
    quote,
    extra?.h1Bars,
    extra?.foreignBuyRatio,
  );

  // 4. Synthesize Multi-Timeframe Alignment
  const isAllBull = w1.bias === "BULL" && d1.bias === "BULL" && h1.bias === "BULL";
  const isD1W1Bull = w1.bias === "BULL" && d1.bias === "BULL";
  const isH1D1Bull = d1.bias === "BULL" && h1.bias === "BULL";
  const isMajorityBear =
    (w1.bias === "BEAR" && d1.bias === "BEAR") ||
    (d1.bias === "BEAR" && h1.bias === "BEAR");

  let consensus: MtfConsensusStatus = "MIXED";
  let badgeVi = "Đa khung Chưa Đồng Thuận";
  let summary = "";
  let score = 50;

  if (isAllBull) {
    consensus = "ALL_BULL";
    badgeVi = "Đồng Thuận H1·D1·W1 Tăng";
    summary = "Đồng thuận Tăng Tuyệt đối (W1 Macro 🟢 · D1 Swing 🟢 · H1 Entry 🟢)";
    score = 100;
  } else if (isD1W1Bull) {
    consensus = "D1_W1_BULL";
    badgeVi = "Đồng Thuận D1·W1 Tăng";
    summary = "Trung - Dài hạn Tăng (D1 🟢 · W1 🟢), H1 đang kiểm định tích lũy";
    score = 75;
  } else if (isH1D1Bull) {
    consensus = "H1_D1_BULL";
    badgeVi = "Sóng Ngắn H1·D1 Tăng";
    summary = "Sóng ngắn Tăng (H1 🟢 · D1 🟢), W1 đang tích lũy kiểm định cản tuần";
    score = 65;
  } else if (isMajorityBear) {
    consensus = "BEAR_PRESSURE";
    badgeVi = "Áp Lực Bán Đa Khung";
    summary = "Áp lực điều chỉnh đa khung (Xu hướng giảm chiếm ưu thế)";
    score = 25;
  } else {
    consensus = "MIXED";
    badgeVi = "Đa Khung Phân Hóa";
    summary = `Khung tuần: ${w1.bias} · Khung ngày: ${d1.bias} · Khung giờ: ${h1.bias}`;
    score = 45;
  }

  return {
    consensus,
    isAligned: isAllBull,
    score,
    summary,
    badgeVi,
    details: { w1, d1, h1 },
  };
}
