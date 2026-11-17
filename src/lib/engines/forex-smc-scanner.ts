/**
 * SERVER-SIDE SMART MONEY CONCEPTS (SMC) & LIQUIDITY HUNTER ENGINE
 *
 * Mathematically scans OHLCV candlestick series for:
 * 1. Unmitigated Fair Value Gaps (Bullish & Bearish FVG)
 * 2. Institutional Order Blocks (OB) with Break of Structure (BOS)
 * 3. Buy-Side & Sell-Side Liquidity Sweeps (BSL / SSL Turtle Soup)
 * 4. High R:R Entry & Tight Stop Loss calculations
 */

import type { OhlcvBar } from "../types";

export interface FairValueGap {
  index: number;
  time: number;
  type: "BULLISH_FVG" | "BEARISH_FVG";
  top: number;
  bottom: number;
  midpoint: number;
  sizePips: number;
  mitigated: boolean;
  mitigatedTime?: number;
}

export interface OrderBlock {
  index: number;
  time: number;
  type: "BULLISH_OB" | "BEARISH_OB";
  high: number;
  low: number;
  midpoint: number;
  volume: number;
  impulseStrength: number;
  status: "FRESH" | "TESTED" | "MITIGATED";
}

export interface LiquiditySweep {
  index: number;
  time: number;
  type: "BSL_SWEEP" | "SSL_SWEEP";
  level: number;
  wickExtreme: number;
  closePrice: number;
  sweepPips: number;
  conviction: "HIGH" | "MEDIUM";
}

export interface SmcScanResult {
  pair: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number; // 0 - 100
  unmitigatedFvgList: FairValueGap[];
  activeOrderBlocks: OrderBlock[];
  recentSweeps: LiquiditySweep[];
  optimalTradeSetup: {
    direction: "BUY" | "SELL" | "WAIT";
    setupType: "SMC_ORDER_BLOCK" | "SMC_FVG_PULLBACK" | "SMC_LIQUIDITY_GRAB" | "NONE";
    entry: number | null;
    entryZone: [number, number] | null;
    tightStopLoss: number | null;
    stopPips: number | null;
    targetTP1: number | null;
    targetTP2: number | null;
    riskRewardRatio: number | null;
    invalidationReason: string;
    rationale: string[];
  };
  summary: string;
}

/**
 * Scans OHLCV series for SMC structures.
 */
export function scanForexSmc(pair: string, bars: OhlcvBar[]): SmcScanResult {
  const cleanPair = pair.toUpperCase().replace("/", "").replace("-", "");
  const pipFactor = cleanPair.includes("JPY") ? 0.01 : cleanPair.startsWith("XAU") ? 0.1 : 0.0001;

  if (bars.length < 25) {
    return {
      pair: cleanPair,
      bias: "NEUTRAL",
      score: 50,
      unmitigatedFvgList: [],
      activeOrderBlocks: [],
      recentSweeps: [],
      optimalTradeSetup: {
        direction: "WAIT",
        setupType: "NONE",
        entry: null,
        entryZone: null,
        tightStopLoss: null,
        stopPips: null,
        targetTP1: null,
        targetTP2: null,
        riskRewardRatio: null,
        invalidationReason: "Không đủ số lượng nến để phân tích cấu trúc SMC.",
        rationale: ["Cần tối thiểu 25 nến OHLCV."],
      },
      summary: "Dữ liệu chưa đủ.",
    };
  }

  const n = bars.length;
  const currentPrice = bars[n - 1].close;

  // 1. FAIR VALUE GAP (FVG) DETECTION
  const fvgList: FairValueGap[] = [];
  for (let i = 2; i < n; i++) {
    const c0 = bars[i - 2];
    const c1 = bars[i - 1];
    const c2 = bars[i];

    // Bullish FVG: Gap between candle i-2 High and candle i Low
    if (c2.low > c0.high) {
      const top = c2.low;
      const bottom = c0.high;
      const sizePips = Math.round(((top - bottom) / pipFactor) * 10) / 10;
      if (sizePips >= 2.0) {
        // Check if mitigated by any subsequent candle
        let mitigated = false;
        let mitigatedTime: number | undefined;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].low <= bottom) {
            mitigated = true;
            mitigatedTime = bars[j].time;
            break;
          }
        }
        fvgList.push({
          index: i - 1,
          time: c1.time,
          type: "BULLISH_FVG",
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          sizePips,
          mitigated,
          mitigatedTime,
        });
      }
    }

    // Bearish FVG: Gap between candle i-2 Low and candle i High
    if (c2.high < c0.low) {
      const top = c0.low;
      const bottom = c2.high;
      const sizePips = Math.round(((top - bottom) / pipFactor) * 10) / 10;
      if (sizePips >= 2.0) {
        let mitigated = false;
        let mitigatedTime: number | undefined;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].high >= top) {
            mitigated = true;
            mitigatedTime = bars[j].time;
            break;
          }
        }
        fvgList.push({
          index: i - 1,
          time: c1.time,
          type: "BEARISH_FVG",
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          sizePips,
          mitigated,
          mitigatedTime,
        });
      }
    }
  }

  const unmitigatedFvgList = fvgList.filter((f) => !f.mitigated).slice(-6);

  // 2. ORDER BLOCK (OB) DETECTION WITH IMPULSE CONFIRMATION
  const orderBlocks: OrderBlock[] = [];
  for (let i = 5; i < n - 2; i++) {
    const obCandle = bars[i];
    const nextCandle = bars[i + 1];
    const next2Candle = bars[i + 2];

    const isBearishCandle = obCandle.close < obCandle.open;
    const isBullishCandle = obCandle.close > obCandle.open;

    // Check for Bullish Order Block (Red candle followed by strong green expansion)
    if (isBearishCandle) {
      const impulse = nextCandle.close - obCandle.high;
      if (impulse > 0 && next2Candle.close > nextCandle.close) {
        // Test if still fresh
        let status: OrderBlock["status"] = "FRESH";
        for (let j = i + 3; j < n; j++) {
          if (bars[j].low <= obCandle.low) {
            status = "MITIGATED";
            break;
          } else if (bars[j].low <= obCandle.high) {
            status = "TESTED";
          }
        }
        if (status !== "MITIGATED") {
          orderBlocks.push({
            index: i,
            time: obCandle.time,
            type: "BULLISH_OB",
            high: obCandle.high,
            low: obCandle.low,
            midpoint: (obCandle.high + obCandle.low) / 2,
            volume: obCandle.volume ?? 0,
            impulseStrength: Math.round((impulse / pipFactor) * 10) / 10,
            status,
          });
        }
      }
    }

    // Check for Bearish Order Block (Green candle followed by strong red breakdown)
    if (isBullishCandle) {
      const impulse = obCandle.low - nextCandle.close;
      if (impulse > 0 && next2Candle.close < nextCandle.close) {
        let status: OrderBlock["status"] = "FRESH";
        for (let j = i + 3; j < n; j++) {
          if (bars[j].high >= obCandle.high) {
            status = "MITIGATED";
            break;
          } else if (bars[j].high >= obCandle.low) {
            status = "TESTED";
          }
        }
        if (status !== "MITIGATED") {
          orderBlocks.push({
            index: i,
            time: obCandle.time,
            type: "BEARISH_OB",
            high: obCandle.high,
            low: obCandle.low,
            midpoint: (obCandle.high + obCandle.low) / 2,
            volume: obCandle.volume ?? 0,
            impulseStrength: Math.round((impulse / pipFactor) * 10) / 10,
            status,
          });
        }
      }
    }
  }

  const activeOrderBlocks = orderBlocks.slice(-4);

  // 3. LIQUIDITY SWEEPS (BSL / SSL TURTLE SOUP)
  const recentSweeps: LiquiditySweep[] = [];
  // Find swing highs and lows in the last 40 bars
  const window = Math.min(40, n);
  const subset = bars.slice(-window);

  for (let i = 5; i < subset.length - 1; i++) {
    const prevHigh = Math.max(...subset.slice(0, i).map((b) => b.high));
    const prevLow = Math.min(...subset.slice(0, i).map((b) => b.low));
    const curr = subset[i];

    // BSL Sweep: Wicks above prevHigh but closes below it
    if (curr.high > prevHigh && curr.close < prevHigh) {
      const sweepPips = Math.round(((curr.high - prevHigh) / pipFactor) * 10) / 10;
      if (sweepPips >= 1.5) {
        recentSweeps.push({
          index: n - window + i,
          time: curr.time,
          type: "BSL_SWEEP",
          level: prevHigh,
          wickExtreme: curr.high,
          closePrice: curr.close,
          sweepPips,
          conviction: sweepPips >= 5.0 ? "HIGH" : "MEDIUM",
        });
      }
    }

    // SSL Sweep: Wicks below prevLow but closes back above it
    if (curr.low < prevLow && curr.close > prevLow) {
      const sweepPips = Math.round(((prevLow - curr.low) / pipFactor) * 10) / 10;
      if (sweepPips >= 1.5) {
        recentSweeps.push({
          index: n - window + i,
          time: curr.time,
          type: "SSL_SWEEP",
          level: prevLow,
          wickExtreme: curr.low,
          closePrice: curr.close,
          sweepPips,
          conviction: sweepPips >= 5.0 ? "HIGH" : "MEDIUM",
        });
      }
    }
  }

  // 4. BIAS & OPTIMAL SETUP FORMULATION
  const bullFvgs = unmitigatedFvgList.filter((f) => f.type === "BULLISH_FVG");
  const bearFvgs = unmitigatedFvgList.filter((f) => f.type === "BEARISH_FVG");
  const bullObs = activeOrderBlocks.filter((o) => o.type === "BULLISH_OB");
  const bearObs = activeOrderBlocks.filter((o) => o.type === "BEARISH_OB");
  const lastSweep = recentSweeps[recentSweeps.length - 1];

  let bias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let score = 50;
  const rationale: string[] = [];

  if (lastSweep?.type === "SSL_SWEEP" || bullObs.length > bearObs.length) {
    bias = "BULLISH";
    score = 65 + (bullFvgs.length > 0 ? 12 : 0) + (lastSweep?.type === "SSL_SWEEP" ? 15 : 0);
  } else if (lastSweep?.type === "BSL_SWEEP" || bearObs.length > bullObs.length) {
    bias = "BEARISH";
    score = 65 + (bearFvgs.length > 0 ? 12 : 0) + (lastSweep?.type === "BSL_SWEEP" ? 15 : 0);
  }
  score = Math.min(95, Math.max(30, score));

  // Determine optimal entry, tight stop loss, and targets
  let direction: "BUY" | "SELL" | "WAIT" = "WAIT";
  let setupType: SmcScanResult["optimalTradeSetup"]["setupType"] = "NONE";
  let entry: number | null = null;
  let entryZone: [number, number] | null = null;
  let tightStopLoss: number | null = null;
  let targetTP1: number | null = null;
  let targetTP2: number | null = null;

  if (bias === "BULLISH") {
    direction = "BUY";
    // Check nearest bullish OB or FVG below current price
    const nearestOb = bullObs.find((o) => o.high <= currentPrice * 1.002);
    const nearestFvg = bullFvgs.find((f) => f.top <= currentPrice * 1.002);

    if (nearestOb) {
      setupType = "SMC_ORDER_BLOCK";
      entry = nearestOb.midpoint;
      entryZone = [nearestOb.low, nearestOb.high];
      tightStopLoss = nearestOb.low - 5 * pipFactor;
      rationale.push(`Hồi quy về Bullish Order Block (${nearestOb.high.toFixed(4)} - ${nearestOb.low.toFixed(4)}).`);
    } else if (nearestFvg) {
      setupType = "SMC_FVG_PULLBACK";
      entry = nearestFvg.midpoint;
      entryZone = [nearestFvg.bottom, nearestFvg.top];
      tightStopLoss = nearestFvg.bottom - 4 * pipFactor;
      rationale.push(`Khai thác vùng mất cân bằng Bullish FVG (${nearestFvg.bottom.toFixed(4)} - ${nearestFvg.top.toFixed(4)}).`);
    } else if (lastSweep?.type === "SSL_SWEEP") {
      setupType = "SMC_LIQUIDITY_GRAB";
      entry = currentPrice;
      entryZone = [lastSweep.wickExtreme, currentPrice];
      tightStopLoss = lastSweep.wickExtreme - 3 * pipFactor;
      rationale.push(`Quét sạch thanh khoản Sell-Side (${lastSweep.sweepPips} pips SSL sweep).`);
    }

    if (entry && tightStopLoss) {
      const riskDist = entry - tightStopLoss;
      targetTP1 = entry + riskDist * 1.5;
      targetTP2 = entry + riskDist * 2.8;
    }
  } else if (bias === "BEARISH") {
    direction = "SELL";
    const nearestOb = bearObs.find((o) => o.low >= currentPrice * 0.998);
    const nearestFvg = bearFvgs.find((f) => f.bottom >= currentPrice * 0.998);

    if (nearestOb) {
      setupType = "SMC_ORDER_BLOCK";
      entry = nearestOb.midpoint;
      entryZone = [nearestOb.low, nearestOb.high];
      tightStopLoss = nearestOb.high + 5 * pipFactor;
      rationale.push(`Hồi quy kiểm tra Bearish Order Block (${nearestOb.low.toFixed(4)} - ${nearestOb.high.toFixed(4)}).`);
    } else if (nearestFvg) {
      setupType = "SMC_FVG_PULLBACK";
      entry = nearestFvg.midpoint;
      entryZone = [nearestFvg.bottom, nearestFvg.top];
      tightStopLoss = nearestFvg.top + 4 * pipFactor;
      rationale.push(`Khai thác vùng mất cân bằng Bearish FVG (${nearestFvg.bottom.toFixed(4)} - ${nearestFvg.top.toFixed(4)}).`);
    } else if (lastSweep?.type === "BSL_SWEEP") {
      setupType = "SMC_LIQUIDITY_GRAB";
      entry = currentPrice;
      entryZone = [currentPrice, lastSweep.wickExtreme];
      tightStopLoss = lastSweep.wickExtreme + 3 * pipFactor;
      rationale.push(`Bẫy thanh khoản Buy-Side (${lastSweep.sweepPips} pips BSL Turtle Soup).`);
    }

    if (entry && tightStopLoss) {
      const riskDist = tightStopLoss - entry;
      targetTP1 = entry - riskDist * 1.5;
      targetTP2 = entry - riskDist * 2.8;
    }
  }

  const stopPips = entry && tightStopLoss ? Math.round((Math.abs(entry - tightStopLoss) / pipFactor) * 10) / 10 : null;
  const rrRatio = entry && tightStopLoss && targetTP1 ? Math.round((Math.abs(targetTP1 - entry) / Math.abs(entry - tightStopLoss)) * 10) / 10 : 1.5;

  const summary = `SMC Bias: ${bias} (${score}%) | ${unmitigatedFvgList.length} FVG còn hiệu lực | ${activeOrderBlocks.length} Order Block đang mở.`;

  return {
    pair: cleanPair,
    bias,
    score,
    unmitigatedFvgList,
    activeOrderBlocks,
    recentSweeps,
    optimalTradeSetup: {
      direction,
      setupType,
      entry,
      entryZone,
      tightStopLoss,
      stopPips,
      targetTP1,
      targetTP2,
      riskRewardRatio: rrRatio,
      invalidationReason: tightStopLoss ? `Phá vỡ cấu trúc vi mô nếu giá đóng nến vượt qua ${tightStopLoss.toFixed(4)}` : "Chưa có setup hợp lưu SMC rõ rệt",
      rationale: rationale.length ? rationale : ["Chờ thanh khoản quét qua các đỉnh/đáy chính."],
    },
    summary,
  };
}
