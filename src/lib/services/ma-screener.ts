import "server-only";
import { buildMeta } from "../freshness";
import { sma } from "../technical";
import { getVnQuotes } from "./stocks";
import { LIQUID_BOARD } from "../providers/public-vn-feed";
import { batchVnOhlcv } from "./ohlcv-batch";
import { WORKERS_BUDGET } from "../data-engine/workers-budget";
import { getSecurity, sectorOf } from "../vn/master";
import type { Meta, OhlcvBar, Quote } from "../types";

/**
 * Moving Average (MA) Screener Engine.
 * Implements quantitative crossover detection:
 * - Short MA (MA10, MA20) crossing above Large MA (MA50, MA100, MA200) -> High probability Bullish / Golden Cross
 * - Short MA crossing below Large MA -> High probability Bearish / Death Cross
 * - Bullish Alignment (MA Ribbon): Price > MA10 > MA20 > MA50 > MA100 > MA200
 * - MA Squeeze: Bandwidth between MA10 and MA50 is tightly compressed before expansion
 */

export interface MaMetrics {
  close: number;
  sma10: number | null;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  prevSma10: number | null;
  prevSma20: number | null;
  prevSma50: number | null;
  prevSma100: number | null;
  prevSma200: number | null;
  distMa20Pct: number | null;  // (close - ma20)/ma20 * 100
  distMa50Pct: number | null;  // (close - ma50)/ma50 * 100
  distMa200Pct: number | null; // (close - ma200)/ma200 * 100
  slopeMa20: number;           // % thay đổi MA20 3 phiên gần nhất
  slopeMa50: number;           // % thay đổi MA50 5 phiên gần nhất
  crossBarsAgo: number | null; // Cửa sổ phát hiện: Cắt cách đây bao nhiêu phiên (0 = hôm nay)
  crossType: string | null;    // Tên cặp giao cắt: "MA20 x MA50", "MA50 x MA200", ...
  volume20: number | null;
  volRatio20: number | null;
  maCompressionPct: number | null; // |ma10 - ma50| / ma50 * 100
}

export interface MaCriteria {
  // Bullish Crossovers (Xác suất tăng cao)
  ma10CrossUpMa20: boolean;
  ma10CrossUpMa50: boolean;
  ma20CrossUpMa50: boolean;
  ma20CrossUpMa100: boolean;
  ma50CrossUpMa200: boolean; // Classic Golden Cross
  priceAboveMa200: boolean;
  priceAboveMa50: boolean;
  bullishAlignment: boolean; // Price > MA10 >= MA20 > MA50 (> MA200)

  // Cửa sổ phát hiện & Xác minh trạng thái
  isFreshCross: boolean;     // Golden cross trong 0-3 phiên gần nhất
  isTodayCross: boolean;     // Golden cross ngay trong phiên hiện tại (BarsAgo = 0)
  crossType: string | null;   // Cặp đường MA vừa cắt nhau
  crossBarsAgo: number | null;
  isPullbackRetest: boolean; // Giá test lại MA hỗ trợ với vol cạn rồi nảy
  isSlopeBullish: boolean;   // MA20 & MA50 đều dốc lên thuận xu hướng
  isOverextended: boolean;   // Giá vượt MA20 > 8.5% (quá mua, rủi ro điều chỉnh)
  isAccelerating: boolean;   // Động lượng dốc tăng gia tốc

  // Bứt phá & Vượt cản kỹ thuật (Breakout & Reclaim)
  reclaimMa200: boolean;     // Bứt phá vượt cản MA200 dài hạn (Tổ chức xác nhận)
  reclaimMa50: boolean;      // Vượt cản MA50 trung hạn
  reclaimMa20: boolean;      // Lấy lại MA20 ngắn hạn
  retestMa200: boolean;      // Kiểm định hỗ trợ MA200 dài hạn thành công
  retestMa50: boolean;       // Kiểm định hỗ trợ MA50 trung hạn thành công
  retestMa20: boolean;       // Kiểm định hỗ trợ MA20 ngắn hạn thành công

  // Bearish Crossovers (Xác suất đảo chiều giảm cao)
  ma10CrossDownMa20: boolean;
  ma10CrossDownMa50: boolean;
  ma20CrossDownMa50: boolean;
  ma50CrossDownMa200: boolean; // Classic Death Cross
  priceBelowMa200: boolean;
  bearishAlignment: boolean; // Price < MA10 <= MA20 < MA50

  // Volume & Compression
  volumeSurge: boolean; // Volume >= 1.2x MA20 Volume
  maSqueeze: boolean;   // MA10, MA20, MA50 within 1.8% of each other
}

export type MaRegime =
  | "PULLBACK_RETEST"    // Test lại MA20/MA50/MA200 hỗ trợ thành công (Điểm mua tối ưu)
  | "FRESH_CROSS"        // Vừa xuất hiện Golden Cross (0-3 phiên)
  | "GOLDEN_CROSS"       // Vừa có MA20 cắt lên MA50/100/200
  | "BREAKOUT_RECLAIM"   // Bứt phá vượt cản MA (Reclaim MA20/50/200)
  | "BULLISH_ALIGNMENT"  // Kênh tăng trật tự hoàn hảo (MA Ribbon)
  | "BULLISH_MOMENTUM"   // MA10 cắt lên MA20/MA50 / Đà tăng gia tốc
  | "MA_SQUEEZE"         // Nén chặt chuẩn bị bùng nổ
  | "OVEREXTENDED"       // Kéo căng quá xa MA (rủi ro điều chỉnh)
  | "DEATH_CROSS"        // Vừa có MA20/50 cắt xuống
  | "BEARISH_ALIGNMENT"  // Kênh giảm trật tự
  | "NEUTRAL";

export type MaSignalCategory =
  | "CROSSOVER"          // Giao cắt đường MA (Golden Cross, Death Cross)
  | "RETEST"             // Kiểm định hỗ trợ (Pullback & Retest)
  | "BREAKOUT_RECLAIM"   // Bứt phá vượt cản MA (Reclaim MA20/50/200)
  | "TREND_RIBBON"       // Trật tự xu hướng dải ruy băng (MA Ribbon)
  | "COMPRESSION"        // Co thắt nén chặt biến động (MA Squeeze)
  | "MOMENTUM"           // Gia tốc & Động lượng MA
  | "OVEREXTENDED";      // Kéo căng quá mua (Cảnh báo rủi ro)

export type MaTimeHorizon = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM" | "MULTI_HORIZON";

export type MaActionGrade = "STRONG_BUY" | "BUY_ENTRY" | "HOLD" | "WATCH" | "TAKE_PROFIT" | "SELL_WARNING";

export interface MaClassification {
  category: MaSignalCategory;
  categoryLabel: string;
  horizon: MaTimeHorizon;
  horizonLabel: string;
  action: MaActionGrade;
  actionLabel: string;
  actionBadgeColor: "emerald" | "blue" | "cyan" | "purple" | "amber" | "rose";
}

export interface MaScreenRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  exchange: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  regime: MaRegime;
  regimeLabel: string;
  classification: MaClassification;
  bullScore: number;     // 0-100 score representing bullish strength
  criteria: MaCriteria;
  metrics: MaMetrics;
  signals: string[];
}

function lastSma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const series = sma(closes, period);
  const v = series[series.length - 1];
  return v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}

function prevSma(closes: number[], period: number, barsAgo = 1): number | null {
  if (closes.length < period + barsAgo) return null;
  const series = sma(closes, period);
  const v = series[series.length - 1 - barsAgo];
  return v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}

function avgVol(bars: OhlcvBar[], n: number): number | null {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  const sum = slice.reduce((s, b) => s + (b.volume ?? 0), 0);
  return sum / n;
}

function analyzeMaRow(symbol: string, bars: OhlcvBar[], quote?: Quote): MaScreenRow | null {
  if (bars.length < 30) return null;

  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  if (closes.length < 30) return null;

  // Cập nhật giá đóng cửa bằng quote thời gian thực nếu có để phản ánh phiên hiện tại
  const effectiveCloses = [...closes];
  if (quote?.price && quote.price > 0 && effectiveCloses.length > 0) {
    effectiveCloses[effectiveCloses.length - 1] = quote.price;
  }

  const close = quote?.price && quote.price > 0 ? quote.price : effectiveCloses[effectiveCloses.length - 1]!;
  const changePercent = quote?.changePercent ?? null;
  const volume = quote?.volume ?? bars[bars.length - 1]?.volume ?? null;

  const sma10 = lastSma(effectiveCloses, 10);
  const sma20 = lastSma(effectiveCloses, 20);
  const sma50 = lastSma(effectiveCloses, 50);
  const sma100 = lastSma(effectiveCloses, 100);
  const sma200 = lastSma(effectiveCloses, 200);

  const prevSma10Val = prevSma(effectiveCloses, 10, 1);
  const prevSma20Val = prevSma(effectiveCloses, 20, 1);
  const prevSma50Val = prevSma(effectiveCloses, 50, 1);
  const prevSma100Val = prevSma(effectiveCloses, 100, 1);
  const prevSma200Val = prevSma(effectiveCloses, 200, 1);

  const volume20 = avgVol(bars, 20);
  const volRatio20 = volume && volume20 && volume20 > 0 ? Number((volume / volume20).toFixed(2)) : null;

  const distMa200Pct = sma200 ? Number((((close - sma200) / sma200) * 100).toFixed(2)) : null;
  const distMa50Pct = sma50 ? Number((((close - sma50) / sma50) * 100).toFixed(2)) : null;
  const distMa20Pct = sma20 ? Number((((close - sma20) / sma20) * 100).toFixed(2)) : null;

  // 1. Quét giao cắt đa chu kỳ trên cửa sổ 0 -> 5 phiên gần nhất
  // Cửa sổ 0 = hôm nay (phiên hiện tại), 1 = T-1 (hôm qua), 2 = T-2, 3 = T-3
  interface CrossScan {
    barsAgo: number;
    type: "GOLDEN" | "DEATH";
    pairName: string;
    priority: number;
  }

  const detectedCrosses: CrossScan[] = [];
  const crossPairs = [
    { fast: 50, slow: 200, name: "MA50 x MA200", priority: 1 }, // Classic Golden Cross
    { fast: 20, slow: 50, name: "MA20 x MA50", priority: 2 },   // Swing Golden Cross
    { fast: 20, slow: 100, name: "MA20 x MA100", priority: 3 }, // Intermediate
    { fast: 10, slow: 50, name: "MA10 x MA50", priority: 4 },   // Momentum Breakout
    { fast: 10, slow: 20, name: "MA10 x MA20", priority: 5 },   // Fast Cross
  ];

  for (let bAgo = 0; bAgo <= 5; bAgo++) {
    for (const cp of crossPairs) {
      const fastCur = prevSma(effectiveCloses, cp.fast, bAgo);
      const slowCur = prevSma(effectiveCloses, cp.slow, bAgo);
      const fastPrev = prevSma(effectiveCloses, cp.fast, bAgo + 1);
      const slowPrev = prevSma(effectiveCloses, cp.slow, bAgo + 1);

      if (fastCur != null && slowCur != null && fastPrev != null && slowPrev != null) {
        if (fastPrev <= slowPrev && fastCur > slowCur) {
          detectedCrosses.push({
            barsAgo: bAgo,
            type: "GOLDEN",
            pairName: cp.name,
            priority: cp.priority,
          });
        } else if (fastPrev >= slowPrev && fastCur < slowCur) {
          detectedCrosses.push({
            barsAgo: bAgo,
            type: "DEATH",
            pairName: cp.name,
            priority: cp.priority,
          });
        }
      }
    }
  }

  const goldenCrosses = detectedCrosses.filter((c) => c.type === "GOLDEN");
  goldenCrosses.sort((a, b) => a.barsAgo - b.barsAgo || a.priority - b.priority);

  const deathCrosses = detectedCrosses.filter((c) => c.type === "DEATH");
  deathCrosses.sort((a, b) => a.barsAgo - b.barsAgo || a.priority - b.priority);

  const bestGolden = goldenCrosses[0] ?? null;
  const bestDeath = deathCrosses[0] ?? null;

  let crossBarsAgo: number | null = null;
  let crossType: string | null = null;
  let recentGoldenCross = false;
  let recentDeathCross = false;

  if (bestGolden && (!bestDeath || bestGolden.barsAgo <= bestDeath.barsAgo)) {
    crossBarsAgo = bestGolden.barsAgo;
    crossType = bestGolden.pairName;
    recentGoldenCross = true;
  } else if (bestDeath) {
    crossBarsAgo = bestDeath.barsAgo;
    crossType = bestDeath.pairName;
    recentDeathCross = true;
  }

  // 2. Độ dốc & Động lượng MA (MA Slopes)
  const s20Ago3 = prevSma(effectiveCloses, 20, 3);
  const slopeMa20 = sma20 && s20Ago3 && s20Ago3 > 0 ? Number((((sma20 - s20Ago3) / s20Ago3) * 100).toFixed(2)) : 0;

  const s50Ago5 = prevSma(effectiveCloses, 50, 5);
  const slopeMa50 = sma50 && s50Ago5 && s50Ago5 > 0 ? Number((((sma50 - s50Ago5) / s50Ago5) * 100).toFixed(2)) : 0;

  const isSlopeBullish = slopeMa20 > 0.15 && slopeMa50 >= 0;
  const isAccelerating = slopeMa20 > 0.5 && slopeMa20 > slopeMa50;
  const isOverextended = distMa20Pct != null && distMa20Pct >= 8.5;

  // 3. Phân loại Bứt phá & Vượt cản MA (Breakout & Reclaim)
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const reclaimMa200 = Boolean(sma200 != null && prevSma200Val != null && prevClose != null && prevClose <= prevSma200Val && close > sma200);
  const reclaimMa50 = Boolean(sma50 != null && prevSma50Val != null && prevClose != null && prevClose <= prevSma50Val && close > sma50);
  const reclaimMa20 = Boolean(sma20 != null && prevSma20Val != null && prevClose != null && prevClose <= prevSma20Val && close > sma20);

  // 4. Trạng thái kiểm định lại đa khung (Pullback / Retest MA Hỗ trợ)
  let isPullbackRetest = false;
  let retestMa200 = false;
  let retestMa50 = false;
  let retestMa20 = false;
  let retestNote = "";

  const recentBars = bars.slice(-3);
  for (const rb of recentBars) {
    const touchMa200 = sma200 != null && Math.abs(rb.low - sma200) / sma200 <= 0.018;
    const touchMa50 = sma50 != null && Math.abs(rb.low - sma50) / sma50 <= 0.018;
    const touchMa20 = sma20 != null && Math.abs(rb.low - sma20) / sma20 <= 0.018;

    if (touchMa200 && sma200 != null && close >= sma200 * 0.995) {
      retestMa200 = true;
      isPullbackRetest = true;
      retestNote = "Kiểm định MA200 rút chân (Hỗ trợ Kim cương)";
      break;
    }
    if (touchMa50 && sma50 != null && close >= sma50 * 0.995) {
      retestMa50 = true;
      isPullbackRetest = true;
      if (!retestNote) retestNote = "Kiểm định MA50 rút chân (Hỗ trợ Trung hạn)";
      break;
    }
    if (touchMa20 && sma20 != null && close >= sma20 * 0.995) {
      retestMa20 = true;
      isPullbackRetest = true;
      if (!retestNote) retestNote = "Kiểm định MA20 rút chân (Hỗ trợ Ngắn hạn)";
      break;
    }
  }

  const isFreshCross = recentGoldenCross && crossBarsAgo !== null && crossBarsAgo <= 3;
  const isTodayCross = recentGoldenCross && crossBarsAgo === 0;

  let maCompressionPct: number | null = null;
  if (sma10 && sma50 && sma50 > 0) {
    maCompressionPct = Number(((Math.abs(sma10 - sma50) / sma50) * 100).toFixed(2));
  }

  // Cross checks (giao cắt gần đây trong 1-2 phiên hoặc theo bestCross)
  const isCrossUp = (curA: number | null, curB: number | null, prevA: number | null, prevB: number | null) => {
    return curA != null && curB != null && prevA != null && prevB != null && prevA <= prevB && curA > curB;
  };

  const isCrossDown = (curA: number | null, curB: number | null, prevA: number | null, prevB: number | null) => {
    return curA != null && curB != null && prevA != null && prevB != null && prevA >= prevB && curA < curB;
  };

  const ma10CrossUpMa20 = isCrossUp(sma10, sma20, prevSma10Val, prevSma20Val) || (recentGoldenCross && crossType === "MA10 x MA20");
  const ma10CrossUpMa50 = isCrossUp(sma10, sma50, prevSma10Val, prevSma50Val) || (recentGoldenCross && crossType === "MA10 x MA50");
  const ma20CrossUpMa50 = isCrossUp(sma20, sma50, prevSma20Val, prevSma50Val) || (recentGoldenCross && crossType === "MA20 x MA50");
  const ma20CrossUpMa100 = isCrossUp(sma20, sma100, prevSma20Val, prevSma100Val) || (recentGoldenCross && crossType === "MA20 x MA100");
  const ma50CrossUpMa200 = isCrossUp(sma50, sma200, prevSma50Val, prevSma200Val) || (recentGoldenCross && crossType === "MA50 x MA200");

  const ma10CrossDownMa20 = isCrossDown(sma10, sma20, prevSma10Val, prevSma20Val) || (recentDeathCross && crossType === "MA10 x MA20");
  const ma10CrossDownMa50 = isCrossDown(sma10, sma50, prevSma10Val, prevSma50Val) || (recentDeathCross && crossType === "MA10 x MA50");
  const ma20CrossDownMa50 = isCrossDown(sma20, sma50, prevSma20Val, prevSma50Val) || (recentDeathCross && crossType === "MA20 x MA50");
  const ma50CrossDownMa200 = isCrossDown(sma50, sma200, prevSma50Val, prevSma200Val) || (recentDeathCross && crossType === "MA50 x MA200");

  const priceAboveMa200 = sma200 != null && close > sma200;
  const priceAboveMa50 = sma50 != null && close > sma50;
  const priceBelowMa200 = sma200 != null && close < sma200;

  // Bullish alignment: Giá > MA10 >= MA20 > MA50 (> MA100 > MA200 nếu có)
  const bullishAlignment =
    sma10 != null &&
    sma20 != null &&
    close > sma10 &&
    sma10 >= sma20 &&
    (sma50 == null || sma20 > sma50) &&
    (sma200 == null || close > sma200);

  // Bearish alignment: Giá < MA10 <= MA20 < MA50
  const bearishAlignment =
    sma10 != null &&
    sma20 != null &&
    close < sma10 &&
    sma10 <= sma20 &&
    (sma50 == null || sma20 < sma50);

  const volumeSurge = volRatio20 != null && volRatio20 >= 1.2;
  const maSqueeze = maCompressionPct != null && maCompressionPct <= 1.8;

  const criteria: MaCriteria = {
    ma10CrossUpMa20,
    ma10CrossUpMa50,
    ma20CrossUpMa50,
    ma20CrossUpMa100,
    ma50CrossUpMa200,
    priceAboveMa200,
    priceAboveMa50,
    bullishAlignment,
    isFreshCross,
    isTodayCross,
    crossType,
    crossBarsAgo,
    isPullbackRetest,
    isSlopeBullish,
    isOverextended,
    isAccelerating,
    reclaimMa200,
    reclaimMa50,
    reclaimMa20,
    retestMa200,
    retestMa50,
    retestMa20,
    ma10CrossDownMa20,
    ma10CrossDownMa50,
    ma20CrossDownMa50,
    ma50CrossDownMa200,
    priceBelowMa200,
    bearishAlignment,
    volumeSurge,
    maSqueeze,
  };

  const metrics: MaMetrics = {
    close,
    sma10,
    sma20,
    sma50,
    sma100,
    sma200,
    prevSma10: prevSma10Val,
    prevSma20: prevSma20Val,
    prevSma50: prevSma50Val,
    prevSma100: prevSma100Val,
    prevSma200: prevSma200Val,
    distMa20Pct,
    distMa50Pct,
    distMa200Pct,
    slopeMa20,
    slopeMa50,
    crossBarsAgo,
    crossType,
    volume20,
    volRatio20,
    maCompressionPct,
  };

  const signals: string[] = [];
  if (retestMa200) signals.push("🛡️ Test MA200 dài hạn rút chân thành công (Hỗ trợ Kim cương)");
  if (reclaimMa200) signals.push("🚀 Vừa vượt cản MA200 dài hạn (Tổ chức xác nhận)");
  if (retestMa50) signals.push("🛡️ Test MA50 trung hạn giữ vững nhịp tăng");
  if (reclaimMa50) signals.push("⚡ Lấy lại MA50 trung hạn sau nhịp rũ");
  if (retestMa20) signals.push("🎯 Test MA20 ngắn hạn rút chân");
  if (reclaimMa20) signals.push("📈 Vượt cản MA20 ngắn hạn");

  if (recentGoldenCross && crossBarsAgo !== null && crossType) {
    if (crossBarsAgo === 0) {
      signals.push(`🔥 Vừa Golden Cross HÔM NAY (${crossType})`);
    } else {
      signals.push(`✨ Golden Cross T-${crossBarsAgo} (${crossType})`);
    }
  } else if (ma50CrossUpMa200) {
    signals.push("Golden Cross Dài Hạn (MA50 cắt lên MA200)");
  } else if (ma20CrossUpMa50) {
    signals.push("Golden Cross Trung Hạn (MA20 cắt lên MA50)");
  }
  if (ma20CrossUpMa100) signals.push("MA20 cắt lên MA100");
  if (ma10CrossUpMa50) signals.push("MA10 bứt phá cắt lên MA50");
  if (ma10CrossUpMa20) signals.push("MA10 cắt lên MA20 (Nhịp tăng ngắn)");
  if (bullishAlignment) signals.push("Trật tự xu hướng tăng hoàn hảo (Bullish Ribbon)");
  if (isSlopeBullish) signals.push(`MA20 & MA50 dốc tăng thuận xu hướng (+${slopeMa20}%)`);
  if (isAccelerating) signals.push("Động lượng MA gia tốc bứt phá");
  if (volumeSurge) signals.push(`Thanh khoản xác nhận (${volRatio20}x TB20)`);
  if (maSqueeze) signals.push("MA nén chặt chuẩn bị mở rộng biên độ");
  if (isOverextended) signals.push(`Giá kéo căng xa MA20 (+${distMa20Pct}%), cẩn trọng điều chỉnh`);

  if (recentDeathCross && crossBarsAgo !== null && crossType) {
    signals.push(`⚠️ Death Cross ${crossBarsAgo === 0 ? "hôm nay" : `T-${crossBarsAgo}`} (${crossType})`);
  } else {
    if (ma50CrossDownMa200) signals.push("Death Cross Dài Hạn (MA50 cắt xuống MA200)");
    if (ma20CrossDownMa50) signals.push("Death Cross Trung Hạn (MA20 cắt xuống MA50)");
  }
  if (ma10CrossDownMa50) signals.push("MA10 gãy cắt xuống MA50");
  if (bearishAlignment) signals.push("Trật tự xu hướng giảm (Bearish Alignment)");

  // Xác định Regime chủ đạo
  let regime: MaRegime = "NEUTRAL";
  let regimeLabel = "Đi ngang / Tích lũy";

  if (retestMa200 || (isPullbackRetest && (bullishAlignment || priceAboveMa50 || priceAboveMa200))) {
    regime = "PULLBACK_RETEST";
    regimeLabel = retestMa200
      ? "Test MA200 hỗ trợ dài hạn"
      : retestMa50
      ? "Test MA50 hỗ trợ trung hạn"
      : "Test MA20 hỗ trợ ngắn hạn";
  } else if (reclaimMa200 || reclaimMa50) {
    regime = "BREAKOUT_RECLAIM";
    regimeLabel = reclaimMa200 ? "Vượt cản dài hạn MA200" : "Vượt cản trung hạn MA50";
  } else if (isFreshCross) {
    regime = "FRESH_CROSS";
    regimeLabel = crossBarsAgo === 0
      ? `Golden Cross Hôm Nay (${crossType ?? "MA"})`
      : `Golden Cross Mới T-${crossBarsAgo} (${crossType ?? "MA"})`;
  } else if (ma50CrossUpMa200 || ma20CrossUpMa50 || ma20CrossUpMa100 || recentGoldenCross) {
    regime = "GOLDEN_CROSS";
    regimeLabel = crossType ? `Golden Cross (${crossType})` : "Giao cắt Vàng (Golden Cross)";
  } else if (isOverextended) {
    regime = "OVEREXTENDED";
    regimeLabel = `Kéo căng MA20 (+${distMa20Pct}%)`;
  } else if (bullishAlignment) {
    regime = "BULLISH_ALIGNMENT";
    regimeLabel = "Trật tự xu hướng tăng (Ribbon)";
  } else if (ma10CrossUpMa20 || ma10CrossUpMa50 || isAccelerating) {
    regime = "BULLISH_MOMENTUM";
    regimeLabel = "Đà tăng gia tốc";
  } else if (maSqueeze) {
    regime = "MA_SQUEEZE";
    regimeLabel = "Nén chặt chuẩn bị bùng nổ";
  } else if (ma50CrossDownMa200 || ma20CrossDownMa50 || recentDeathCross) {
    regime = "DEATH_CROSS";
    regimeLabel = "Giao cắt Tử thần (Death Cross)";
  } else if (bearishAlignment) {
    regime = "BEARISH_ALIGNMENT";
    regimeLabel = "Kênh giảm điểm";
  }

  // Xây dựng Phân loại Tín hiệu Toàn diện (Signal Classification Model)
  let category: MaSignalCategory = "CROSSOVER";
  let categoryLabel = "Giao cắt MA";
  let horizon: MaTimeHorizon = "MEDIUM_TERM";
  let horizonLabel = "Trung hạn";
  let action: MaActionGrade = "WATCH";
  let actionLabel = "Theo dõi";
  let actionBadgeColor: "emerald" | "blue" | "cyan" | "purple" | "amber" | "rose" = "blue";

  if (isOverextended) {
    category = "OVEREXTENDED";
    categoryLabel = "Kéo căng Quá mua";
    horizon = "SHORT_TERM";
    horizonLabel = "Ngắn hạn";
    action = "TAKE_PROFIT";
    actionLabel = "Cảnh báo chốt lời";
    actionBadgeColor = "amber";
  } else if (recentDeathCross || ma50CrossDownMa200 || ma20CrossDownMa50 || bearishAlignment) {
    category = "CROSSOVER";
    categoryLabel = "Giao cắt Giảm";
    horizon = ma50CrossDownMa200 ? "LONG_TERM" : "MEDIUM_TERM";
    horizonLabel = ma50CrossDownMa200 ? "Dài hạn (MA200)" : "Trung hạn (MA50)";
    action = "SELL_WARNING";
    actionLabel = "Bán phòng vệ";
    actionBadgeColor = "rose";
  } else if (retestMa200 || retestMa50 || retestMa20 || isPullbackRetest) {
    category = "RETEST";
    categoryLabel = "Kiểm định Hỗ trợ";
    if (retestMa200) {
      horizon = "LONG_TERM";
      horizonLabel = "Dài hạn (MA200)";
      action = "STRONG_BUY";
      actionLabel = "Điểm mua Kim cương";
      actionBadgeColor = "emerald";
    } else if (retestMa50) {
      horizon = "MEDIUM_TERM";
      horizonLabel = "Trung hạn (MA50)";
      action = "BUY_ENTRY";
      actionLabel = "Điểm mua Chuẩn";
      actionBadgeColor = "emerald";
    } else {
      horizon = "SHORT_TERM";
      horizonLabel = "Ngắn hạn (MA20)";
      action = "BUY_ENTRY";
      actionLabel = "Điểm mua Lướt sóng";
      actionBadgeColor = "cyan";
    }
  } else if (reclaimMa200 || reclaimMa50 || reclaimMa20) {
    category = "BREAKOUT_RECLAIM";
    categoryLabel = "Vượt cản Kỹ thuật";
    if (reclaimMa200) {
      horizon = "LONG_TERM";
      horizonLabel = "Dài hạn (Vượt MA200)";
      action = "STRONG_BUY";
      actionLabel = "Vượt cản Dài hạn";
      actionBadgeColor = "emerald";
    } else if (reclaimMa50) {
      horizon = "MEDIUM_TERM";
      horizonLabel = "Trung hạn (Vượt MA50)";
      action = "BUY_ENTRY";
      actionLabel = "Lấy lại xu hướng";
      actionBadgeColor = "cyan";
    } else {
      horizon = "SHORT_TERM";
      horizonLabel = "Ngắn hạn (Vượt MA20)";
      action = "BUY_ENTRY";
      actionLabel = "Bứt phá MA20";
      actionBadgeColor = "blue";
    }
  } else if (isFreshCross || recentGoldenCross || ma50CrossUpMa200 || ma20CrossUpMa50) {
    category = "CROSSOVER";
    categoryLabel = "Giao cắt Vàng";
    if (ma50CrossUpMa200 || crossType === "MA50 x MA200") {
      horizon = "LONG_TERM";
      horizonLabel = "Dài hạn (MA50x200)";
      action = "STRONG_BUY";
      actionLabel = "Siêu chu kỳ tăng";
      actionBadgeColor = "emerald";
    } else if (crossType === "MA20 x MA50" || ma20CrossUpMa50) {
      horizon = "MEDIUM_TERM";
      horizonLabel = "Trung hạn (MA20x50)";
      action = volumeSurge || isTodayCross ? "STRONG_BUY" : "BUY_ENTRY";
      actionLabel = isTodayCross ? "Golden Cross Hôm nay" : "Golden Cross Chuẩn";
      actionBadgeColor = isTodayCross ? "emerald" : "cyan";
    } else {
      horizon = "SHORT_TERM";
      horizonLabel = "Ngắn hạn";
      action = "BUY_ENTRY";
      actionLabel = "Xung lực mới";
      actionBadgeColor = "blue";
    }
  } else if (maSqueeze) {
    category = "COMPRESSION";
    categoryLabel = "Co thắt Biến động";
    horizon = "SHORT_TERM";
    horizonLabel = "Ngắn-Trung hạn";
    action = "WATCH";
    actionLabel = "Nén chặt chờ nổ";
    actionBadgeColor = "purple";
  } else if (bullishAlignment) {
    category = "TREND_RIBBON";
    categoryLabel = "Trật tự Dải MA";
    horizon = "MULTI_HORIZON";
    horizonLabel = "Đa khung thời gian";
    action = "HOLD";
    actionLabel = "Nắm giữ theo Trend";
    actionBadgeColor = "emerald";
  } else if (isSlopeBullish || isAccelerating) {
    category = "MOMENTUM";
    categoryLabel = "Gia tốc Động lượng";
    horizon = "SHORT_TERM";
    horizonLabel = "Ngắn hạn";
    action = "BUY_ENTRY";
    actionLabel = "Đà tăng bứt tốc";
    actionBadgeColor = "blue";
  }

  const classification: MaClassification = {
    category,
    categoryLabel,
    horizon,
    horizonLabel,
    action,
    actionLabel,
    actionBadgeColor,
  };

  // Calculate Bull Score (0 - 100)
  let score = 50;
  if (priceAboveMa200) score += 15;
  else if (priceBelowMa200) score -= 15;

  if (priceAboveMa50) score += 10;
  else score -= 10;

  if (bullishAlignment) score += 15;

  // Điểm thưởng cho độ tươi mới và xác nhận thanh khoản
  if (isTodayCross) score += 25; // Cực mới hôm nay
  else if (crossBarsAgo === 1) score += 22; // Mới T-1
  else if (isFreshCross) score += 18; // Mới T-2, T-3
  else if (ma20CrossUpMa50 || ma50CrossUpMa200 || recentGoldenCross) score += 15;

  if (retestMa200) score += 20;
  else if (isPullbackRetest) score += 18;

  if (reclaimMa200) score += 18;
  else if (reclaimMa50) score += 12;

  if (isSlopeBullish) score += 12;
  if (volumeSurge) score += 10;

  if (isOverextended) score -= 10;
  if (bearishAlignment) score -= 20;
  if (ma20CrossDownMa50 || ma50CrossDownMa200 || recentDeathCross) score -= 20;

  const bullScore = Math.max(5, Math.min(99, score));

  const sec = getSecurity(symbol);

  return {
    symbol,
    name: quote?.name ?? sec?.name ?? null,
    sector: sec?.sector ?? sectorOf(symbol) ?? "Khác",
    exchange: sec?.exchange ?? "HOSE",
    price: close,
    changePercent,
    volume,
    regime,
    regimeLabel,
    classification,
    bullScore,
    criteria,
    metrics,
    signals,
  };
}

export async function screenMovingAverages(args?: {
  symbols?: string[];
  signal?:
    | "ALL"
    | "BULLISH"
    | "GOLDEN_CROSS"
    | "PULLBACK_RETEST"
    | "BREAKOUT_RECLAIM"
    | "BULLISH_ALIGN"
    | "MA_SQUEEZE"
    | "SLOPE_BULLISH"
    | "OVEREXTENDED"
    | "BEARISH"
    | "DEATH_CROSS"
    | "FRESH_CROSS";
  category?: MaSignalCategory | "ALL";
  horizon?: MaTimeHorizon | "ALL";
  action?: MaActionGrade | "ALL";
  sector?: string;
  minPrice?: number;
  minVol?: number;
  limit?: number;
}): Promise<{ rows: MaScreenRow[]; total: number; meta: Meta }> {
  const uniq = [
    ...new Set((args?.symbols?.length ? args.symbols : LIQUID_BOARD).map((s) => s.toUpperCase()).filter(Boolean)),
  ].slice(0, 100);

  const t0 = Date.now();

  const [quotesPack, ohlcvMap] = await Promise.all([
    getVnQuotes(uniq).catch(() => null),
    batchVnOhlcv(uniq, {
      bars: 260, // Đủ nến tính MA200
      concurrency: WORKERS_BUDGET.ohlcvBatchConcurrency,
      perSymbolMs: WORKERS_BUDGET.ohlcvPerSymbolMs + 800,
      deadlineMs: Math.max(1_000, WORKERS_BUDGET.techScreenWallMs - 1_500),
      resilient: false,
      priority: uniq.slice(0, 40),
    }),
  ]);

  const quoteMap = new Map<string, Quote>();
  for (const q of quotesPack?.quotes ?? []) {
    if (q.symbol) quoteMap.set(q.symbol.toUpperCase(), q);
  }

  const rows: MaScreenRow[] = [];

  for (const sym of uniq) {
    const bars = ohlcvMap.get(sym)?.bars ?? [];
    const q = quoteMap.get(sym);
    const row = analyzeMaRow(sym, bars, q);
    if (!row) continue;

    // Filters cơ bản
    if (args?.sector && row.sector !== args.sector) continue;
    if (args?.minPrice != null && (row.price == null || row.price < args.minPrice)) continue;
    if (args?.minVol != null && (row.volume == null || row.volume < args.minVol)) continue;

    // Phân loại Tín hiệu Nâng cao: Category, Horizon, Action
    if (args?.category && args.category !== "ALL" && row.classification.category !== args.category) continue;
    if (args?.horizon && args.horizon !== "ALL" && row.classification.horizon !== args.horizon) continue;
    if (args?.action && args.action !== "ALL" && row.classification.action !== args.action) continue;

    const sig = args?.signal ?? "ALL";
    if (sig === "BULLISH") {
      if (
        row.regime !== "GOLDEN_CROSS" &&
        row.regime !== "BULLISH_ALIGNMENT" &&
        row.regime !== "BULLISH_MOMENTUM" &&
        row.regime !== "PULLBACK_RETEST" &&
        row.regime !== "BREAKOUT_RECLAIM" &&
        row.regime !== "FRESH_CROSS"
      ) {
        continue;
      }
    } else if (sig === "PULLBACK_RETEST") {
      if (!row.criteria.isPullbackRetest && row.regime !== "PULLBACK_RETEST") continue;
    } else if (sig === "BREAKOUT_RECLAIM") {
      if (!row.criteria.reclaimMa200 && !row.criteria.reclaimMa50 && !row.criteria.reclaimMa20 && row.regime !== "BREAKOUT_RECLAIM") continue;
    } else if (sig === "GOLDEN_CROSS" || sig === "FRESH_CROSS") {
      // GỘP CHUNG GIAO CẮT VÀNG & GOLDEN CROSS MỚI:
      // Bao gồm tất cả các trường hợp Golden Cross mới (0-3 phiên), Golden Cross hôm nay và các cấu trúc Golden Cross kinh điển
      const isGc =
        row.criteria.isFreshCross ||
        row.criteria.isTodayCross ||
        row.regime === "FRESH_CROSS" ||
        row.regime === "GOLDEN_CROSS" ||
        row.criteria.ma20CrossUpMa50 ||
        row.criteria.ma50CrossUpMa200 ||
        row.criteria.ma20CrossUpMa100 ||
        row.criteria.ma10CrossUpMa50 ||
        row.criteria.ma10CrossUpMa20;
      if (!isGc) continue;
    } else if (sig === "SLOPE_BULLISH") {
      if (!row.criteria.isSlopeBullish && !row.criteria.isAccelerating) continue;
    } else if (sig === "OVEREXTENDED") {
      if (!row.criteria.isOverextended && row.regime !== "OVEREXTENDED") continue;
    } else if (sig === "BULLISH_ALIGN") {
      if (row.regime !== "BULLISH_ALIGNMENT" && !row.criteria.bullishAlignment) continue;
    } else if (sig === "MA_SQUEEZE") {
      if (row.regime !== "MA_SQUEEZE") continue;
    } else if (sig === "BEARISH") {
      if (row.regime !== "DEATH_CROSS" && row.regime !== "BEARISH_ALIGNMENT") continue;
    } else if (sig === "DEATH_CROSS") {
      if (
        row.regime !== "DEATH_CROSS" &&
        !row.criteria.ma20CrossDownMa50 &&
        !row.criteria.ma50CrossDownMa200 &&
        !row.criteria.ma10CrossDownMa50
      ) {
        continue;
      }
    }

    rows.push(row);
  }

  // TỐI ƯU HÓA XẾP HẠNG & NHẬN DIỆN TÍN HIỆU MỚI NHẤT
  const isGoldenMode = args?.signal === "GOLDEN_CROSS" || args?.signal === "FRESH_CROSS";

  rows.sort((a, b) => {
    if (isGoldenMode) {
      // 1. Ưu tiên độ tươi mới nhất (0 = Hôm nay, 1 = T-1, 2 = T-2, 3 = T-3, sau đó đến các mã cũ hơn)
      const aFresh = a.criteria.isFreshCross && a.metrics.crossBarsAgo !== null ? a.metrics.crossBarsAgo : 99;
      const bFresh = b.criteria.isFreshCross && b.metrics.crossBarsAgo !== null ? b.metrics.crossBarsAgo : 99;
      if (aFresh !== bFresh) {
        return aFresh - bFresh;
      }

      // 2. Xác nhận thanh khoản bứt phá (Vol/TB20 lớn hơn phản ánh dòng tiền nhập cuộc)
      const aVolRatio = a.metrics.volRatio20 ?? 0;
      const bVolRatio = b.metrics.volRatio20 ?? 0;
      if (Math.abs(bVolRatio - aVolRatio) >= 0.25) {
        return bVolRatio - aVolRatio;
      }

      // 3. Điểm Bull Score tổng thể
      return b.bullScore - a.bullScore;
    }

    // Mặc định: Điểm Sức mạnh MA cao nhất, sau đó đến thanh khoản
    return b.bullScore - a.bullScore || (b.volume ?? 0) - (a.volume ?? 0);
  });

  const limit = Math.max(1, Math.min(args?.limit ?? 50, 100));
  const paginated = rows.slice(0, limit);

  return {
    rows: paginated,
    total: rows.length,
    meta: buildMeta({
      source: "orca-ma-engine+vps+ssi",
      sourceTimestampMs: Date.now(),
      note: `Bộ lọc Đường MA (${rows.length} mã thỏa điều kiện)`,
    }),
  };
}
