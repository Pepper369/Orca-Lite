import type { OhlcvBar } from "../types";

/**
 * Candlestick pattern engine — multi-asset (stock / forex / crypto).
 * - Prior trend + volume filters (soft when volume absent, e.g. FX)
 * - Multi-bar recent scan; optional keep only reversals completing in last 2–3 bars
 */

export type PatternCategory =
  | "bullish_reversal"
  | "bearish_reversal"
  | "continuation"
  | "neutral";

export type Reliability = "very_high" | "high" | "medium" | "low";

export type CandleAssetClass = "stock" | "forex" | "crypto" | "commodity";

export interface CandleDetectOpts {
  assetClass?: CandleAssetClass;
  /** How many trailing bar positions to evaluate (1 = last only). Default stock=3. */
  recentBars?: number;
  /** Keep only bullish/bearish reversal patterns (drop continuation/neutral). */
  reversalOnly?: boolean;
  /**
   * Pattern must complete within the last N bars of the series (bar age from end).
   * Default when reversalOnly: 3 (cụm 2–3 nến mới nhất).
   */
  maxAgeBars?: number;
}

export interface DetectedCandlePattern {
  name: string;
  nameVi: string;
  type: "bullish" | "bearish" | "neutral";
  category: PatternCategory;
  reliability: Reliability;
  score: number;
  candles: number;
  description: string;
  confirmation: string;
  volumeConfirmed: boolean;
  trendContext: "up" | "down" | "sideways" | "unknown";
  barIndex: number;
  /** Bars from series end when pattern completed (0 = last closed bar). */
  ageBars?: number;
}

type C = {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  body: number;
  range: number;
  upper: number;
  lower: number;
  bull: boolean;
  bear: boolean;
};

function toC(b: OhlcvBar): C {
  const body = Math.abs(b.close - b.open);
  const range = Math.max(b.high - b.low, 1e-12);
  return {
    o: b.open,
    h: b.high,
    l: b.low,
    c: b.close,
    v: b.volume ?? 0,
    body,
    range,
    upper: b.high - Math.max(b.open, b.close),
    lower: Math.min(b.open, b.close) - b.low,
    bull: b.close > b.open,
    bear: b.close < b.open,
  };
}

function mid(x: C): number {
  return (x.o + x.c) / 2;
}

function priorTrend(
  bars: OhlcvBar[],
  endExclusive: number,
  look = 5,
  soft = false,
): "up" | "down" | "sideways" | "unknown" {
  const actualLook = Math.min(look, endExclusive);
  if (actualLook < 3) return "unknown";
  const slice = bars.slice(endExclusive - actualLook, endExclusive);
  if (slice.length < 3) return "unknown";
  let up = 0;
  let down = 0;
  for (const b of slice) {
    if (b.close > b.open) up++;
    else if (b.close < b.open) down++;
  }
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  const netPct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
  const strong = soft ? 0.35 : 2.5;
  const mild = soft ? 0.12 : 0.8;
  if (up >= actualLook - 1 || (up >= 3 && down <= 1) || netPct >= strong) return "up";
  if (down >= actualLook - 1 || (down >= 3 && up <= 1) || netPct <= -strong) return "down";
  if (up >= Math.ceil(actualLook * 0.6) && netPct > mild) return "up";
  if (down >= Math.ceil(actualLook * 0.6) && netPct < -mild) return "down";
  return "sideways";
}

function avgVolume(bars: OhlcvBar[], endInclusive: number, n = 20): number {
  const start = Math.max(0, endInclusive - n + 1);
  const slice = bars.slice(start, endInclusive + 1);
  if (!slice.length) return 0;
  return slice.reduce((a, b) => a + (b.volume ?? 0), 0) / slice.length;
}

function avgBody(cs: C[], n = 10): number {
  const slice = cs.slice(-n);
  if (!slice.length) return 1;
  return slice.reduce((a, c) => a + c.body, 0) / slice.length;
}

function reliabilityScore(
  base: Reliability,
  volumeOk: boolean,
  trendOk: boolean,
  opts?: { volumeStrong?: boolean; isReversal?: boolean },
): { reliability: Reliability; score: number } {
  const baseScore =
    base === "very_high" ? 92 : base === "high" ? 78 : base === "medium" ? 58 : 36;
  let score = baseScore;
  let reliability = base;
  if (!volumeOk) {
    score -= 18;
    if (reliability === "very_high") reliability = "high";
    else if (reliability === "high") reliability = "medium";
    else if (reliability === "medium") reliability = "low";
  } else if (opts?.volumeStrong) {
    score += 8;
  }
  if (!trendOk) {
    score -= opts?.isReversal ? 18 : 10;
  } else if (opts?.isReversal) {
    score += 6;
  }
  return { reliability, score: Math.max(10, Math.min(100, score)) };
}

function push(
  out: DetectedCandlePattern[],
  p: Omit<DetectedCandlePattern, "score" | "reliability" | "volumeConfirmed" | "ageBars"> & {
    baseReliability: Reliability;
    volumeOk: boolean;
    trendOk: boolean;
    volumeStrong?: boolean;
    ageBars?: number;
  },
) {
  const isReversal =
    p.category === "bullish_reversal" || p.category === "bearish_reversal";
  const { reliability, score } = reliabilityScore(p.baseReliability, p.volumeOk, p.trendOk, {
    volumeStrong: p.volumeStrong,
    isReversal,
  });
  out.push({
    name: p.name,
    nameVi: p.nameVi,
    type: p.type,
    category: p.category,
    reliability,
    score,
    candles: p.candles,
    description: p.description,
    confirmation: p.confirmation,
    volumeConfirmed: p.volumeOk,
    trendContext: p.trendContext,
    barIndex: p.barIndex,
    ageBars: p.ageBars ?? 0,
  });
}

/** Prefer fresher completion; then score. */
export function filterRecentReversals(
  patterns: DetectedCandlePattern[],
  maxAgeBars = 3,
): DetectedCandlePattern[] {
  return patterns
    .filter(
      (p) =>
        (p.category === "bullish_reversal" || p.category === "bearish_reversal") &&
        (p.ageBars ?? 0) <= maxAgeBars &&
        p.candles <= 3,
    )
    .sort((a, b) => (a.ageBars ?? 0) - (b.ageBars ?? 0) || b.score - a.score);
}

export function detectCandlePatterns(
  bars: OhlcvBar[],
  opts: CandleDetectOpts = {},
): DetectedCandlePattern[] {
  if (bars.length < 6) return [];
  const soft =
    opts.assetClass === "forex" ||
    opts.assetClass === "crypto" ||
    opts.assetClass === "commodity";
  const recent = Math.max(1, Math.min(opts.recentBars ?? (soft ? 5 : 3), 8));
  const fullLen = bars.length;
  const all: DetectedCandlePattern[] = [];
  for (let end = 0; end < recent; end++) {
    const sliceEnd = fullLen - end;
    if (sliceEnd < 6) continue;
    const found = detectCandlePatternsAt(bars.slice(0, sliceEnd), soft);
    for (const p of found) {
      all.push({ ...p, ageBars: end });
    }
  }
  const byName = new Map<string, DetectedCandlePattern>();
  for (const p of all) {
    const prev = byName.get(p.name);
    // Prefer higher score; if tie prefer fresher (smaller age)
    if (
      !prev ||
      p.score > prev.score ||
      (p.score === prev.score && (p.ageBars ?? 0) < (prev.ageBars ?? 0))
    ) {
      byName.set(p.name, p);
    }
  }
  let out = [...byName.values()].sort(
    (a, b) => (a.ageBars ?? 0) - (b.ageBars ?? 0) || b.score - a.score,
  );

  if (opts.reversalOnly) {
    const maxAge = opts.maxAgeBars ?? 3;
    out = filterRecentReversals(out, maxAge);
  } else if (opts.maxAgeBars != null) {
    out = out.filter((p) => (p.ageBars ?? 0) <= opts.maxAgeBars!);
  }

  return out.slice(0, 10);
}

function detectCandlePatternsAt(bars: OhlcvBar[], soft: boolean): DetectedCandlePattern[] {
  if (bars.length < 6) return [];
  const cs = bars.map(toC);
  const n = cs.length;
  const i = n - 1;
  const cur = cs[i]!;
  const p1 = cs[i - 1]!;
  const p2 = cs[i - 2]!;
  const ab = avgBody(cs, 12);
  const avgVol = avgVolume(bars, i, 20);
  const volOk = (idx: number) => {
    const v = bars[idx]?.volume ?? 0;
    if (!(avgVol > 0)) return true;
    return soft ? v >= avgVol * 0.9 : v >= avgVol * 1.15;
  };
  const volStrong = (idx: number) => {
    const v = bars[idx]?.volume ?? 0;
    if (!(avgVol > 0)) return soft;
    return v >= avgVol * (soft ? 1.2 : 1.5);
  };
  const trendBefore = (patternLen: number) =>
    priorTrend(bars, n - patternLen, soft ? 6 : 5, soft);
  const out: DetectedCandlePattern[] = [];

  if (cur.body <= cur.range * 0.12) {
    if (cur.lower >= cur.range * 0.6 && cur.upper <= cur.range * 0.1) {
      const t = trendBefore(1);
      push(out, {
        name: "Dragonfly Doji",
        nameVi: "Dragonfly Doji",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "medium",
        candles: 1,
        description: "Open≈Close≈High, bóng dưới dài.",
        confirmation: "Nến sau đóng trên đỉnh Dragonfly",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    } else if (cur.upper >= cur.range * 0.6 && cur.lower <= cur.range * 0.1) {
      const t = trendBefore(1);
      push(out, {
        name: "Gravestone Doji",
        nameVi: "Gravestone Doji",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "medium",
        candles: 1,
        description: "Open≈Close≈Low, bóng trên dài.",
        confirmation: "Nến sau đóng dưới đáy Gravestone",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    } else {
      push(out, {
        name: "Doji",
        nameVi: "Doji",
        type: "neutral",
        category: "neutral",
        baseReliability: "medium",
        candles: 1,
        description: "Lực mua/bán cân bằng.",
        confirmation: "Nến tiếp theo xác định hướng",
        volumeOk: volOk(i),
        trendOk: true,
        trendContext: trendBefore(1),
        barIndex: i,
      });
    }
  }

  if (cur.lower >= cur.body * 2 && cur.upper <= cur.body * 0.5 && cur.body > 0) {
    const t = trendBefore(1);
    if (t === "down" || t === "sideways") {
      push(out, {
        name: "Hammer",
        nameVi: "Búa",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Bóng dưới ≥ 2× thân — hấp thụ lực bán.",
        confirmation: "Nến sau đóng trên đỉnh Hammer",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    }
    if (t === "up") {
      push(out, {
        name: "Hanging Man",
        nameVi: "Người treo cổ",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "medium",
        candles: 1,
        description: "Hình Búa sau uptrend — cảnh báo bán.",
        confirmation: "Nến sau đóng dưới đáy",
        volumeOk: volOk(i),
        trendOk: true,
        trendContext: t,
        barIndex: i,
      });
    }
  }

  if (cur.upper >= cur.body * 2 && cur.lower <= cur.body * 0.5 && cur.body > 0) {
    const t = trendBefore(1);
    if (t === "down" || t === "sideways") {
      push(out, {
        name: "Inverted Hammer",
        nameVi: "Búa ngược",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "medium",
        candles: 1,
        description: "Bóng trên dài cuối downtrend.",
        confirmation: "Nến sau tăng trên đỉnh",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    }
    if (t === "up" || t === "sideways") {
      push(out, {
        name: "Shooting Star",
        nameVi: "Sao băng",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Từ chối tại vùng cao.",
        confirmation: "Nến sau đóng dưới đáy Sao băng",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  if (cur.body >= ab * 1.35 && cur.body >= cur.range * 0.88) {
    const t = trendBefore(1);
    if (cur.bull) {
      push(out, {
        name: "Bullish Marubozu",
        nameVi: "Marubozu tăng",
        type: "bullish",
        category: t === "up" ? "continuation" : "bullish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Thân dài gần full range — lực mua áp đảo.",
        confirmation: "Nến sau không đâm sâu vào thân",
        volumeOk: volOk(i),
        volumeStrong: volStrong(i),
        trendOk: true,
        trendContext: t,
        barIndex: i,
      });
    } else if (cur.bear) {
      push(out, {
        name: "Bearish Marubozu",
        nameVi: "Marubozu giảm",
        type: "bearish",
        category: t === "down" ? "continuation" : "bearish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Thân dài gần full range — lực bán áp đảo.",
        confirmation: "Nến sau không đâm sâu vào thân",
        volumeOk: volOk(i),
        volumeStrong: volStrong(i),
        trendOk: true,
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Bullish / Bearish Belt Hold (Yorikiri)
  if (cur.body >= ab * 1.25 && cur.body >= cur.range * 0.75) {
    const t = trendBefore(1);
    if (cur.bull && cur.lower <= cur.range * 0.05 && (t === "down" || t === "sideways")) {
      push(out, {
        name: "Bullish Belt Hold",
        nameVi: "Belt Hold tăng (Yorikiri)",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Mở sát đáy, tăng mạnh dứt khoát không râu dưới.",
        confirmation: "Nến sau giữ trên 50% thân Belt Hold",
        volumeOk: volOk(i),
        volumeStrong: volStrong(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    } else if (cur.bear && cur.upper <= cur.range * 0.05 && (t === "up" || t === "sideways")) {
      push(out, {
        name: "Bearish Belt Hold",
        nameVi: "Belt Hold giảm",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "high",
        candles: 1,
        description: "Mở sát đỉnh, bán tháo dứt khoát không râu trên.",
        confirmation: "Nến sau giữ dưới 50% thân Belt Hold",
        volumeOk: volOk(i),
        volumeStrong: volStrong(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Bullish / Bearish Harami & Harami Cross
  if (p1.bear && p1.body >= ab * 0.75 && Math.max(cur.o, cur.c) < p1.o && Math.min(cur.o, cur.c) > p1.c) {
    const t = trendBefore(2);
    const isCross = cur.body <= cur.range * 0.12 || cur.body <= p1.body * 0.15;
    const isSmall = cur.body <= p1.body * 0.55;
    if (isCross) {
      push(out, {
        name: "Bullish Harami Cross",
        nameVi: "Harami Cross tăng",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "very_high",
        candles: 2,
        description: "Doji nằm trọn trong thân nến giảm trước — cạn kiệt lực bán.",
        confirmation: "Nến 3 vượt đỉnh nến giảm trước",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    } else if (isSmall) {
      push(out, {
        name: "Bullish Harami",
        nameVi: "Harami tăng (Mẹ bồng con)",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "high",
        candles: 2,
        description: "Nến nhỏ nằm trọn trong thân nến giảm trước — đà giảm dừng lại.",
        confirmation: "Nến sau đóng xanh vượt đỉnh Harami",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    }
  } else if (p1.bull && p1.body >= ab * 0.75 && Math.max(cur.o, cur.c) < p1.c && Math.min(cur.o, cur.c) > p1.o) {
    const t = trendBefore(2);
    const isCross = cur.body <= cur.range * 0.12 || cur.body <= p1.body * 0.15;
    const isSmall = cur.body <= p1.body * 0.55;
    if (isCross) {
      push(out, {
        name: "Bearish Harami Cross",
        nameVi: "Harami Cross giảm",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "very_high",
        candles: 2,
        description: "Doji nằm trọn trong thân nến tăng trước — cạn kiệt lực mua.",
        confirmation: "Nến 3 thủng đáy nến tăng trước",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    } else if (isSmall) {
      push(out, {
        name: "Bearish Harami",
        nameVi: "Harami giảm",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "high",
        candles: 2,
        description: "Nến nhỏ nằm trọn trong thân nến tăng trước.",
        confirmation: "Nến sau đóng đỏ thủng đáy Harami",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Tweezer Bottom & Tweezer Top
  const lowDiff = Math.abs(p1.l - cur.l);
  const maxR = Math.max(p1.range, cur.range);
  const lowPctDiff = p1.l > 0 ? lowDiff / p1.l : 1;
  if ((lowDiff <= maxR * 0.08 || lowPctDiff <= 0.003) && p1.lower >= p1.range * 0.1 && cur.lower >= cur.range * 0.12) {
    const t = trendBefore(2);
    if (t === "down" || t === "sideways") {
      push(out, {
        name: "Tweezer Bottom",
        nameVi: "Đáy nhíp (Tweezer Bottom)",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "high",
        candles: 2,
        description: "Hai nến liên tiếp giữ vững mức đáy chung — hỗ trợ cứng phản ứng.",
        confirmation: "Nến sau đóng xanh bứt phá đỉnh cụm nhíp",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  const highDiff = Math.abs(p1.h - cur.h);
  const highPctDiff = p1.h > 0 ? highDiff / p1.h : 1;
  if ((highDiff <= maxR * 0.08 || highPctDiff <= 0.003) && p1.upper >= p1.range * 0.1 && cur.upper >= cur.range * 0.12) {
    const t = trendBefore(2);
    if (t === "up" || t === "sideways") {
      push(out, {
        name: "Tweezer Top",
        nameVi: "Đỉnh nhíp (Tweezer Top)",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "high",
        candles: 2,
        description: "Hai nến liên tiếp chạm cùng mức đỉnh bị từ chối.",
        confirmation: "Nến sau đóng đỏ thủng đáy cụm nhíp",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Bullish / Bearish Kicker
  if (p1.bear && cur.bull && p1.body >= ab * 0.55 && cur.body >= ab * 0.55 && cur.o >= p1.o && cur.l >= p1.o * 0.998) {
    const t = trendBefore(2);
    push(out, {
      name: "Bullish Kicker",
      nameVi: "Kicker tăng (Đảo chiều sốc)",
      type: "bullish",
      category: "bullish_reversal",
      baseReliability: "very_high",
      candles: 2,
      description: "Gap up vượt đỉnh nến đỏ trước — lực mua đảo ngược hoàn toàn.",
      confirmation: "Duy trì trên mức gap nến 2",
      volumeOk: volOk(i),
      volumeStrong: volStrong(i),
      trendOk: true,
      trendContext: t,
      barIndex: i,
    });
  } else if (p1.bull && cur.bear && p1.body >= ab * 0.55 && cur.body >= ab * 0.55 && cur.o <= p1.o && cur.h <= p1.o * 1.002) {
    const t = trendBefore(2);
    push(out, {
      name: "Bearish Kicker",
      nameVi: "Kicker giảm",
      type: "bearish",
      category: "bearish_reversal",
      baseReliability: "very_high",
      candles: 2,
      description: "Gap down dưới đáy nến xanh trước — phe bán đảo ngược hoàn toàn.",
      confirmation: "Duy trì dưới mức gap nến 2",
      volumeOk: volOk(i),
      volumeStrong: volStrong(i),
      trendOk: true,
      trendContext: t,
      barIndex: i,
    });
  }

  if (p1.bear && cur.bull && cur.body > p1.body * 1.05 && cur.c >= p1.o && cur.o <= p1.c) {
    const t = trendBefore(2);
    push(out, {
      name: "Bullish Engulfing",
      nameVi: "Nhấn chìm tăng",
      type: "bullish",
      category: "bullish_reversal",
      baseReliability: "high",
      candles: 2,
      description: "Nến tăng bao trùm thân nến giảm trước.",
      confirmation: "Volume nến 2 tăng",
      volumeOk: volOk(i),
      trendOk: t === "down",
      trendContext: t,
      barIndex: i,
    });
  }
  if (p1.bull && cur.bear && cur.body > p1.body * 1.05 && cur.c <= p1.o && cur.o >= p1.c) {
    const t = trendBefore(2);
    push(out, {
      name: "Bearish Engulfing",
      nameVi: "Nhấn chìm giảm",
      type: "bearish",
      category: "bearish_reversal",
      baseReliability: "high",
      candles: 2,
      description: "Nến giảm bao trùm thân nến tăng trước.",
      confirmation: "Volume nến 2 tăng",
      volumeOk: volOk(i),
      trendOk: t === "up",
      trendContext: t,
      barIndex: i,
    });
  }

  if (p1.bear && p1.body >= ab * 1.1 && cur.bull && cur.o < p1.l && cur.c > mid(p1) && cur.c < p1.o) {
    push(out, {
      name: "Piercing Line",
      nameVi: "Xuyên thấu",
      type: "bullish",
      category: "bullish_reversal",
      baseReliability: "high",
      candles: 2,
      description: "Gap xuống rồi đóng trên 50% thân nến giảm trước.",
      confirmation: "Nến 3 tiếp tục tăng",
      volumeOk: volOk(i),
      trendOk: trendBefore(2) === "down",
      trendContext: trendBefore(2),
      barIndex: i,
    });
  }
  if (p1.bull && p1.body >= ab * 1.1 && cur.bear && cur.o > p1.h && cur.c < mid(p1) && cur.c > p1.o) {
    push(out, {
      name: "Dark Cloud Cover",
      nameVi: "Mây đen che phủ",
      type: "bearish",
      category: "bearish_reversal",
      baseReliability: "high",
      candles: 2,
      description: "Gap lên rồi đóng dưới 50% thân nến tăng trước.",
      confirmation: "Nến 3 tiếp tục giảm",
      volumeOk: volOk(i),
      trendOk: trendBefore(2) === "up",
      trendContext: trendBefore(2),
      barIndex: i,
    });
  }

  // Morning Star / Morning Doji Star / Abandoned Baby
  if (p2.bear && p2.body >= ab * 0.9 && p1.body <= Math.max(ab * 0.6, p2.body * 0.45) && cur.bull && cur.body >= ab * 0.8 && cur.c > mid(p2)) {
    const t = trendBefore(3);
    const isDoji = p1.body <= p1.range * 0.14 || p1.body <= ab * 0.25;
    const isAbandonedGap = p1.h < p2.l && p1.h < cur.l;

    if (isDoji && isAbandonedGap) {
      push(out, {
        name: "Bullish Abandoned Baby",
        nameVi: "Abandoned Baby tăng",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "very_high",
        candles: 3,
        description: "Doji đáy tạo gap hoàn toàn cô lập — tín hiệu đảo chiều siêu mạnh.",
        confirmation: "Duy trì vững trên mức gap của Abandoned Baby",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    } else if (isDoji) {
      push(out, {
        name: "Morning Doji Star",
        nameVi: "Sao mai Doji",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "very_high",
        candles: 3,
        description: "Nến 2 là Doji gap xuống ở đáy — lưỡng lự kiệt cùng rồi nến 3 bứt phá.",
        confirmation: "Nến 3 đóng trên 50% thân nến 1",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    } else {
      push(out, {
        name: "Morning Star",
        nameVi: "Sao mai",
        type: "bullish",
        category: "bullish_reversal",
        baseReliability: "high",
        candles: 3,
        description: "Giảm mạnh → lưỡng lự → tăng.",
        confirmation: "Nến 3 đóng trên 50% thân nến 1",
        volumeOk: volOk(i),
        trendOk: t === "down",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Evening Star / Evening Doji Star / Abandoned Baby
  if (p2.bull && p2.body >= ab * 0.9 && p1.body <= Math.max(ab * 0.6, p2.body * 0.45) && cur.bear && cur.body >= ab * 0.8 && cur.c < mid(p2)) {
    const t = trendBefore(3);
    const isDoji = p1.body <= p1.range * 0.14 || p1.body <= ab * 0.25;
    const isAbandonedGap = p1.l > p2.h && p1.l > cur.h;

    if (isDoji && isAbandonedGap) {
      push(out, {
        name: "Bearish Abandoned Baby",
        nameVi: "Abandoned Baby giảm",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "very_high",
        candles: 3,
        description: "Doji đỉnh tạo gap hoàn toàn cô lập — áp lực bán tháo đỉnh cực mạnh.",
        confirmation: "Duy trì dưới mức gap của Abandoned Baby",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    } else if (isDoji) {
      push(out, {
        name: "Evening Doji Star",
        nameVi: "Sao hôm Doji",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "very_high",
        candles: 3,
        description: "Nến 2 là Doji gap lên ở đỉnh — phe mua kiệt sức trước khi đảo chiều.",
        confirmation: "Nến 3 đóng dưới 50% thân nến 1",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    } else {
      push(out, {
        name: "Evening Star",
        nameVi: "Sao hôm",
        type: "bearish",
        category: "bearish_reversal",
        baseReliability: "high",
        candles: 3,
        description: "Tăng mạnh → lưỡng lự → giảm.",
        confirmation: "Nến 3 đóng dưới 50% thân nến 1",
        volumeOk: volOk(i),
        trendOk: t === "up",
        trendContext: t,
        barIndex: i,
      });
    }
  }

  // Three Inside Up (Harami confirmed) & Three Inside Down
  if (
    p2.bear &&
    p2.body >= ab * 0.75 &&
    Math.max(p1.o, p1.c) < p2.o &&
    Math.min(p1.o, p1.c) > p2.c &&
    cur.bull &&
    cur.c > Math.max(p1.h, mid(p2))
  ) {
    const t = trendBefore(3);
    push(out, {
      name: "Three Inside Up",
      nameVi: "Three Inside Up (Harami xác nhận)",
      type: "bullish",
      category: "bullish_reversal",
      baseReliability: "high",
      candles: 3,
      description: "Nến 3 bứt phá xác nhận thành công mẫu hình Harami đáy.",
      confirmation: "Khối lượng nến 3 gia tăng vượt trung bình",
      volumeOk: volOk(i),
      trendOk: t === "down",
      trendContext: t,
      barIndex: i,
    });
  } else if (
    p2.bull &&
    p2.body >= ab * 0.75 &&
    Math.max(p1.o, p1.c) < p2.c &&
    Math.min(p1.o, p1.c) > p2.o &&
    cur.bear &&
    cur.c < Math.min(p1.l, mid(p2))
  ) {
    const t = trendBefore(3);
    push(out, {
      name: "Three Inside Down",
      nameVi: "Three Inside Down",
      type: "bearish",
      category: "bearish_reversal",
      baseReliability: "high",
      candles: 3,
      description: "Nến 3 giảm xác nhận thành công mẫu hình Harami đỉnh.",
      confirmation: "Khối lượng nến 3 gia tăng",
      volumeOk: volOk(i),
      trendOk: t === "up",
      trendContext: t,
      barIndex: i,
    });
  }

  // Three Outside Up (Engulfing confirmed) & Three Outside Down
  if (
    p2.bear &&
    p1.bull &&
    p1.body > p2.body * 1.05 &&
    p1.c >= p2.o &&
    p1.o <= p2.c &&
    cur.bull &&
    cur.c > p1.c
  ) {
    const t = trendBefore(3);
    push(out, {
      name: "Three Outside Up",
      nameVi: "Three Outside Up (Engulfing xác nhận)",
      type: "bullish",
      category: "bullish_reversal",
      baseReliability: "very_high",
      candles: 3,
      description: "Nến 3 tiếp nối và xác nhận đà tăng mạnh mẽ sau Bullish Engulfing.",
      confirmation: "Khối lượng nến 3 duy trì cao",
      volumeOk: volOk(i),
      trendOk: t === "down",
      trendContext: t,
      barIndex: i,
    });
  } else if (
    p2.bull &&
    p1.bear &&
    p1.body > p2.body * 1.05 &&
    p1.c <= p2.o &&
    p1.o >= p2.c &&
    cur.bear &&
    cur.c < p1.c
  ) {
    const t = trendBefore(3);
    push(out, {
      name: "Three Outside Down",
      nameVi: "Three Outside Down",
      type: "bearish",
      category: "bearish_reversal",
      baseReliability: "very_high",
      candles: 3,
      description: "Nến 3 tiếp nối và xác nhận đà giảm mạnh mẽ sau Bearish Engulfing.",
      confirmation: "Khối lượng nến 3 duy trì cao",
      volumeOk: volOk(i),
      trendOk: t === "up",
      trendContext: t,
      barIndex: i,
    });
  }

  if (p2.bull && p1.bull && cur.bull && p2.c < p1.c && p1.c < cur.c) {
    push(out, {
      name: "Three White Soldiers",
      nameVi: "Ba chàng lính trắng",
      type: "bullish",
      category: "continuation",
      baseReliability: "high",
      candles: 3,
      description: "Ba nến tăng liên tiếp.",
      confirmation: "Không bóng trên dài",
      volumeOk: volOk(i),
      trendOk: true,
      trendContext: trendBefore(3),
      barIndex: i,
    });
  }
  if (p2.bear && p1.bear && cur.bear && p2.c > p1.c && p1.c > cur.c) {
    push(out, {
      name: "Three Black Crows",
      nameVi: "Ba con quạ đen",
      type: "bearish",
      category: "continuation",
      baseReliability: "high",
      candles: 3,
      description: "Ba nến giảm liên tiếp.",
      confirmation: "Không bóng dưới dài",
      volumeOk: volOk(i),
      trendOk: true,
      trendContext: trendBefore(3),
      barIndex: i,
    });
  }

  const byName = new Map<string, DetectedCandlePattern>();
  for (const p of out) {
    const prev = byName.get(p.name);
    if (!prev || p.score > prev.score) byName.set(p.name, p);
  }
  return [...byName.values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

export type CandleTradeSetup = {
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: number;
  riskPercent: number;
  rewardPercent: number;
  setupQuality: "A+" | "A" | "B";
};

function roundPrice(val: number, refPrice: number): number {
  if (!Number.isFinite(val) || !Number.isFinite(refPrice)) return 0;
  if (refPrice < 2) return +val.toFixed(4);
  if (refPrice < 20) return +val.toFixed(3);
  return +val.toFixed(2);
}

export function buildCandleTradeSetup(
  pattern: DetectedCandlePattern,
  bars: OhlcvBar[],
  ctx?: {
    atrPct?: number | null;
    rsiBullishDiv?: boolean;
    rsiBearishDiv?: boolean;
    atLowerBb?: boolean;
    atUpperBb?: boolean;
    volClimax?: boolean;
    distTo20dLowPct?: number | null;
  },
): CandleTradeSetup | null {
  if (bars.length < 5) return null;
  const isBull = pattern.type === "bullish";
  const isBear = pattern.type === "bearish";
  if (!isBull && !isBear) return null;

  const lastBar = bars[bars.length - 1]!;
  const entryPrice = lastBar.close;
  if (!(entryPrice > 0)) return null;

  const candleCount = Math.max(1, Math.min(pattern.candles || 2, 5));
  const slice = bars.slice(-candleCount);
  const patternLow = Math.min(...slice.map((b) => b.low));
  const patternHigh = Math.max(...slice.map((b) => b.high));
  const atrVal = ctx?.atrPct ? (ctx.atrPct / 100) * entryPrice : Math.max(patternHigh - patternLow, entryPrice * 0.02);
  const buffer = Math.max(atrVal * 0.25, entryPrice * 0.003);

  if (isBull) {
    const stopLoss = Math.max(0.0001, patternLow - buffer);
    const risk = entryPrice - stopLoss;
    if (risk <= 0) return null;
    const target1 = entryPrice + risk * 1.5;
    const target2 = entryPrice + risk * 2.5;
    const riskPercent = (risk / entryPrice) * 100;
    const rewardPercent = ((target1 - entryPrice) / entryPrice) * 100;
    const riskReward = +(rewardPercent / Math.max(riskPercent, 0.01)).toFixed(1);

    const isAplus =
      pattern.score >= 75 &&
      pattern.volumeConfirmed &&
      (Boolean(ctx?.rsiBullishDiv) ||
        Boolean(ctx?.atLowerBb) ||
        Boolean(ctx?.volClimax) ||
        (ctx?.distTo20dLowPct != null && ctx.distTo20dLowPct <= 3.5));
    const setupQuality: "A+" | "A" | "B" = isAplus ? "A+" : pattern.score >= 68 ? "A" : "B";

    return {
      entryPrice: roundPrice(entryPrice, entryPrice),
      stopLoss: roundPrice(stopLoss, entryPrice),
      target1: roundPrice(target1, entryPrice),
      target2: roundPrice(target2, entryPrice),
      riskReward,
      riskPercent: +riskPercent.toFixed(1),
      rewardPercent: +rewardPercent.toFixed(1),
      setupQuality,
    };
  } else {
    const stopLoss = patternHigh + buffer;
    const risk = stopLoss - entryPrice;
    if (risk <= 0) return null;
    const target1 = Math.max(0.0001, entryPrice - risk * 1.5);
    const target2 = Math.max(0.0001, entryPrice - risk * 2.5);
    const riskPercent = (risk / entryPrice) * 100;
    const rewardPercent = ((entryPrice - target1) / entryPrice) * 100;
    const riskReward = +(rewardPercent / Math.max(riskPercent, 0.01)).toFixed(1);

    const isAplus =
      pattern.score >= 75 &&
      pattern.volumeConfirmed &&
      (Boolean(ctx?.rsiBearishDiv) || Boolean(ctx?.atUpperBb));
    const setupQuality: "A+" | "A" | "B" = isAplus ? "A+" : pattern.score >= 68 ? "A" : "B";

    return {
      entryPrice: roundPrice(entryPrice, entryPrice),
      stopLoss: roundPrice(stopLoss, entryPrice),
      target1: roundPrice(target1, entryPrice),
      target2: roundPrice(target2, entryPrice),
      riskReward,
      riskPercent: +riskPercent.toFixed(1),
      rewardPercent: +rewardPercent.toFixed(1),
      setupQuality,
    };
  }
}

export function toLegacyCandlePatterns(
  patterns: DetectedCandlePattern[],
): import("../types").CandlePattern[] {
  return patterns.map((p) => ({
    name: p.name,
    nameVi: p.nameVi,
    type: p.type,
    reliability:
      p.reliability === "very_high" || p.reliability === "high"
        ? "high"
        : p.reliability === "medium"
          ? "medium"
          : "low",
    description: p.description,
  }));
}
