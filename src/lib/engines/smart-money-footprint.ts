import type { OhlcvBar } from "../types";

/**
 * Smart Money Footprint & Institutional Orderflow Engine
 *
 * Detects institutional accumulation and absorption signatures in the Vietnam market:
 * 1. Active Buy Aggression: Intraday/daily active buying vs active selling pressure (Mua chủ động vs Bán chủ động).
 * 2. Foreign Investor Net Absorption (Khối ngoại gom ròng & tỷ trọng tham gia).
 * 3. Pocket Pivot Signature (Gil Morales & Chris Kacher): Institutional accumulation inside a base
 *    where up-day volume exceeds the largest down-day volume of the past 10 sessions.
 * 4. Wyckoff Volume Spread Analysis (VSA) Spring Test & Absorption: Price dips below support then
 *    reclaims with declining volume (lack of floating supply).
 * 5. Volume Surge with High Close (Stopping Volume / Institutional Markup).
 */

export type SmartMoneySignal =
  | "HEAVY_ACCUMULATION" // Cá mập gom mạnh (Mua chủ động > 65% + Khối ngoại gom + Vol lớn)
  | "POCKET_PIVOT" // Pocket Pivot nổ vol sớm trong nền
  | "SPRING_ABSORPTION" // Wyckoff Spring: Rũ bỏ cạn cung test thành công
  | "FOREIGN_NET_BUY" // Khối ngoại mua ròng liên tục
  | "DISTRIBUTION" // Cá mập phân phối (Bán chủ động chiếm ưu thế)
  | "NEUTRAL";

export interface SmartMoneyResult {
  symbol: string;
  score: number; // 0 - 100
  signal: SmartMoneySignal;
  signalVi: string;
  activeBuyRatioPct: number | null; // % (e.g. 62.5 = 62.5% Mua chủ động)
  foreignNetValBillion: number | null; // Tỷ VNĐ
  foreignSharePct: number | null; // % tham gia của khối ngoại trong tổng GTGD
  isPocketPivot: boolean;
  isSpringTest: boolean;
  isVolumeAbsorption: boolean;
  summaryVi: string;
}

export interface SmartMoneyInput {
  symbol: string;
  bars: OhlcvBar[];
  currentPrice?: number | null;
  foreignNetValBillion?: number | null;
  activeBuyRatioPct?: number | null; // From VPS or quote stream
  foreignBuyValBillion?: number | null;
  foreignSellValBillion?: number | null;
  totalMarketValBillion?: number | null;
}

/**
 * Detects Pocket Pivot on the latest bar:
 * Volume on up-day must be greater than the highest down-day volume of the prior 10 trading sessions.
 */
export function checkPocketPivot(bars: OhlcvBar[]): boolean {
  const n = bars.length;
  if (n < 12) return false;

  const current = bars[n - 1]!;
  const prev = bars[n - 2]!;

  // Must be an up-day: Close > Open and Close >= Prev Close
  if (current.close < current.open || current.close < prev.close) {
    return false;
  }

  // Find max volume of down-days in the last 10 sessions (from n-11 to n-2)
  let maxDownVol = 0;
  for (let i = Math.max(0, n - 11); i < n - 1; i++) {
    const b = bars[i]!;
    const isDown = b.close < b.open;
    if (isDown && b.volume > maxDownVol) {
      maxDownVol = b.volume;
    }
  }

  // Current volume must exceed the largest down-day volume
  return maxDownVol > 0 && current.volume >= maxDownVol * 1.05;
}

/**
 * Detects Wyckoff Spring / Absorption:
 * Bar pierced a multi-day support low, but closed in the upper 40% of its range with low/moderate volume.
 */
export function checkSpringAbsorption(bars: OhlcvBar[]): boolean {
  const n = bars.length;
  if (n < 15) return false;

  const current = bars[n - 1]!;
  const range = current.high - current.low;
  if (range <= 0) return false;

  // Closed in upper 40% of the bar
  const closeLocation = (current.close - current.low) / range;
  if (closeLocation < 0.6) return false;

  // Check if current low broke previous 10-bar minimum low (shakeout)
  let prevMinLow = Infinity;
  let volSum = 0;
  for (let i = n - 11; i < n - 1; i++) {
    const b = bars[i]!;
    if (b.low < prevMinLow) prevMinLow = b.low;
    volSum += b.volume;
  }
  const avgVol10 = volSum / 10;

  const piercedSupport = current.low < prevMinLow;
  const closedAboveSupport = current.close >= prevMinLow;
  const reasonableVol = avgVol10 > 0 && current.volume <= avgVol10 * 1.4;

  return piercedSupport && closedAboveSupport && reasonableVol;
}

/**
 * Evaluates Smart Money Footprint score and classification.
 */
export function evaluateSmartMoneyFootprint(input: SmartMoneyInput): SmartMoneyResult {
  const { symbol, bars, foreignNetValBillion, activeBuyRatioPct } = input;
  const n = bars.length;

  let score = 50;
  const isPocketPivot = n >= 12 ? checkPocketPivot(bars) : false;
  const isSpringTest = n >= 15 ? checkSpringAbsorption(bars) : false;

  // 1. Orderflow Buy Aggression Factor (0 to +25 or -20)
  const buyRatio = activeBuyRatioPct ?? 50;
  if (buyRatio >= 68) {
    score += 25;
  } else if (buyRatio >= 58) {
    score += 15;
  } else if (buyRatio >= 53) {
    score += 8;
  } else if (buyRatio <= 38) {
    score -= 22;
  } else if (buyRatio <= 44) {
    score -= 12;
  }

  // 2. Foreign Investor Flow Factor (0 to +20 or -15)
  const fnv = foreignNetValBillion ?? 0;
  if (fnv >= 20) {
    // Over +20 Billion VND net buy
    score += 20;
  } else if (fnv >= 5) {
    score += 12;
  } else if (fnv >= 1) {
    score += 6;
  } else if (fnv <= -20) {
    score -= 18;
  } else if (fnv <= -5) {
    score -= 10;
  }

  // 3. Technical Footprint Signatures (+10 to +15)
  if (isPocketPivot) score += 14;
  if (isSpringTest) score += 12;

  // 4. Volume Surge vs Moving Average (Volume Absorption)
  let isVolumeAbsorption = false;
  if (n >= 21) {
    let sum20 = 0;
    for (let i = n - 21; i < n - 1; i++) {
      sum20 += bars[i]!.volume;
    }
    const maVol20 = sum20 / 20;
    const curVol = bars[n - 1]!.volume;
    const curClose = bars[n - 1]!.close;
    const curOpen = bars[n - 1]!.open;

    if (maVol20 > 0 && curVol >= maVol20 * 1.6 && curClose >= curOpen) {
      isVolumeAbsorption = true;
      score += 10;
    }
  }

  score = Math.max(5, Math.min(99, score));

  // Determine Signal & Classification
  let signal: SmartMoneySignal = "NEUTRAL";
  let signalVi = "Dòng tiền bình thường";
  let summaryVi = "Áp lực mua bán cân bằng, chưa có dấu hiệu gom hàng đột biến.";

  if (score >= 78 || (buyRatio >= 65 && fnv >= 5)) {
    signal = "HEAVY_ACCUMULATION";
    signalVi = "Cá Mập Gom Mạnh";
    summaryVi = `Lệnh mua chủ động áp đảo (${buyRatio.toFixed(1)}%) kết hợp khối ngoại mua ròng ${fnv > 0 ? `+${fnv.toFixed(1)} tỷ` : ""}, dấu chân tổ chức rất rõ nét.`;
  } else if (isPocketPivot) {
    signal = "POCKET_PIVOT";
    signalVi = "Pocket Pivot Điểm Nổ";
    summaryVi = "Tín hiệu Pocket Pivot: Dòng tiền tổ chức mua nổ sớm trong nền giá, vượt khối lượng bán 10 phiên qua.";
  } else if (isSpringTest) {
    signal = "SPRING_ABSORPTION";
    signalVi = "Wyckoff Spring Rũ Cung";
    summaryVi = "Mẫu hình Spring VSA: Giá rũ thủng hỗ trợ rồi rút chân cạn cung, phe bán đã kiệt sức.";
  } else if (fnv >= 10) {
    signal = "FOREIGN_NET_BUY";
    signalVi = "Khối Ngoại Gom Ròng";
    summaryVi = `Khối ngoại liên tục mua ròng mạnh (+${fnv.toFixed(1)} tỷ VNĐ), tạo bệ đỡ thanh khoản vững chắc.`;
  } else if (score <= 35 || buyRatio <= 40) {
    signal = "DISTRIBUTION";
    signalVi = "Áp Lực Xả Hàng";
    summaryVi = `Phe bán chủ động chiếm ưu thế (${(100 - buyRatio).toFixed(1)}%), dòng tiền tổ chức có dấu hiệu hạ tỷ trọng.`;
  }

  return {
    symbol,
    score,
    signal,
    signalVi,
    activeBuyRatioPct: buyRatio !== 50 ? Number(buyRatio.toFixed(1)) : null,
    foreignNetValBillion: fnv !== 0 ? Number(fnv.toFixed(1)) : null,
    foreignSharePct: null,
    isPocketPivot,
    isSpringTest,
    isVolumeAbsorption,
    summaryVi,
  };
}
