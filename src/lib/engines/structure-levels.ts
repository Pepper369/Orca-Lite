import type { OhlcvBar, AssetClass } from "../types";
import { findSwings, type SwingPoint } from "./money-flow";

export type FlipZoneType = "BULLISH_ROLE_REVERSAL" | "BEARISH_ROLE_REVERSAL";

export interface FlipZone {
  level: number;
  type: FlipZoneType;
  formedAtIndex: number;
  brokenAtIndex: number;
  testCount: number;
  isConfirmedHolding: boolean;
  distToCurrentPct: number;
  descriptionVi: string;
}

export interface PsychologicalRoundNumber {
  level: number;
  step: number;
  distancePct: number;
  isAtRoundNumber: boolean;
  labelVi: string;
}

export interface StructureConfluenceResult {
  currentPrice: number;
  assetClass: AssetClass;
  
  // Flip Zones (Role Reversal)
  activeFlipZones: FlipZone[];
  nearestFlipZone: FlipZone | null;
  isAtFlipZoneSupport: boolean;

  // Psychological Round Numbers
  roundNumber: PsychologicalRoundNumber;

  // Confluence Assessment
  confluenceScore: number; // 0 - 100
  factors: string[];
  summaryVi: string;
}

/**
 * Determines psychological round number step and nearest round level for a given price.
 */
export function getPsychologicalRoundNumber(
  price: number,
  assetClass: AssetClass = "stock"
): PsychologicalRoundNumber {
  let step = 1;

  if (assetClass === "stock") {
    // Vietnam stock price convention in 1,000 VND units (e.g., 25.5 = 25,500 VND)
    if (price < 15) step = 1; // 10.0, 11.0, 12.0
    else if (price < 35) step = 5; // 20.0, 25.0, 30.0
    else if (price < 80) step = 5; // 35.0, 40.0, 45.0, 50.0
    else step = 10; // 60.0, 70.0, 80.0, 100.0
  } else if (assetClass === "crypto") {
    if (price > 10000) step = 5000; // BTC 60k, 65k, 70k, 80k
    else if (price > 1000) step = 500; // ETH 2000, 2500, 3000
    else if (price > 50) step = 10; // SOL 150, 160
    else step = 1;
  } else if (assetClass === "commodity" || assetClass === "forex") {
    // Gold / Oil / FX
    if (price > 1000) step = 50; // XAUUSD 2600, 2650, 2700
    else if (price > 50) step = 5; // WTI 70, 75, 80
    else step = 1;
  } else if (assetClass === "index" || assetClass === "derivative") {
    // VN-Index / VN30F1M
    step = 50; // 1200, 1250, 1300
  }

  const nearestLevel = Math.round(price / step) * step;
  const distancePct = Number((((price - nearestLevel) / price) * 100).toFixed(2));
  // Within 1.0% tolerance for psychological round numbers
  const isAtRoundNumber = Math.abs(distancePct) <= 1.0;

  const labelVi = `Mốc tròn tâm lý: ${nearestLevel} (Bước ${step}, cách ${distancePct > 0 ? "+" : ""}${distancePct}%)`;

  return {
    level: nearestLevel,
    step,
    distancePct,
    isAtRoundNumber,
    labelVi,
  };
}

/**
 * Detects Flip Zones (Role Reversal):
 * A historical resistance level that gets decisively broken above, and then acts as new support.
 * Or a support level broken below that acts as new resistance.
 */
export function detectFlipZones(bars: OhlcvBar[], swings?: SwingPoint[]): FlipZone[] {
  if (bars.length < 15) return [];
  const currentPrice = bars.at(-1)?.close ?? 0;
  const sw = swings ?? findSwings(bars, 2, "external");

  const flipZones: FlipZone[] = [];

  // 1. Detect Bullish Flip Zones (Resistance broken -> New Support)
  const highs = sw.filter((s) => s.type === "high");
  for (const h of highs) {
    const level = h.price;
    const formedIdx = h.index;

    // Must have at least 3 bars after swing formation
    if (formedIdx > bars.length - 4) continue;

    // Find if price broke decisively above this high (close > high * 1.01)
    let brokenIdx = -1;
    for (let i = formedIdx + 1; i < bars.length; i++) {
      if (bars[i]!.close > level * 1.01) {
        brokenIdx = i;
        break;
      }
    }

    if (brokenIdx !== -1 && brokenIdx < bars.length - 1) {
      // Check subsequent bars retesting this broken level
      let testCount = 0;
      let held = true;

      for (let j = brokenIdx + 1; j < bars.length; j++) {
        const b = bars[j]!;
        // Low touched the level within 1.2% tolerance
        const touched = b.low <= level * 1.012 && b.high >= level * 0.988;
        if (touched) {
          testCount++;
          // If close deeply penetrated below the level (> 1.5%), role reversal failed
          if (b.close < level * 0.985) {
            held = false;
            break;
          }
        }
      }

      if (held && testCount >= 1) {
        const distPct = Number((((currentPrice - level) / currentPrice) * 100).toFixed(2));
        flipZones.push({
          level,
          type: "BULLISH_ROLE_REVERSAL",
          formedAtIndex: formedIdx,
          brokenAtIndex: brokenIdx,
          testCount,
          isConfirmedHolding: held,
          distToCurrentPct: distPct,
          descriptionVi: `Flip Zone Hỗ trợ mới tại ${level} (Kháng cự cũ bị phá vỡ, đã retest ${testCount} lần)`,
        });
      }
    }
  }

  // 2. Detect Bearish Flip Zones (Support broken -> New Resistance)
  const lows = sw.filter((s) => s.type === "low");
  for (const l of lows) {
    const level = l.price;
    const formedIdx = l.index;

    if (formedIdx > bars.length - 6) continue;

    let brokenIdx = -1;
    for (let i = formedIdx + 1; i < bars.length; i++) {
      if (bars[i]!.close < level * 0.99) {
        brokenIdx = i;
        break;
      }
    }

    if (brokenIdx !== -1 && brokenIdx < bars.length - 1) {
      let testCount = 0;
      let held = true;

      for (let j = brokenIdx + 1; j < bars.length; j++) {
        const b = bars[j]!;
        const touched = b.high >= level * 0.988 && b.low <= level * 1.012;
        if (touched) {
          testCount++;
          if (b.close > level * 1.015) {
            held = false;
            break;
          }
        }
      }

      if (held && testCount >= 1) {
        const distPct = Number((((currentPrice - level) / currentPrice) * 100).toFixed(2));
        flipZones.push({
          level,
          type: "BEARISH_ROLE_REVERSAL",
          formedAtIndex: formedIdx,
          brokenAtIndex: brokenIdx,
          testCount,
          isConfirmedHolding: held,
          distToCurrentPct: distPct,
          descriptionVi: `Flip Zone Kháng cự mới tại ${level} (Hỗ trợ cũ bị thủng, đã retest ${testCount} lần)`,
        });
      }
    }
  }

  // Sort by proximity to current price
  return flipZones.sort((a, b) => Math.abs(a.distToCurrentPct) - Math.abs(b.distToCurrentPct));
}

/**
 * Comprehensive Structure & Levels Confluence Analysis
 */
export function analyzeStructureLevelsConfluence(
  bars: OhlcvBar[],
  assetClass: AssetClass = "stock",
  swingsInput?: SwingPoint[]
): StructureConfluenceResult {
  const currentPrice = bars.at(-1)?.close ?? 0;
  const sw = swingsInput ?? findSwings(bars, 3, "external");

  const flipZones = detectFlipZones(bars, sw);
  const roundNum = getPsychologicalRoundNumber(currentPrice, assetClass);

  // Find nearest flip zone
  const nearestFlipZone = flipZones[0] ?? null;
  const isAtFlipZoneSupport =
    nearestFlipZone != null &&
    nearestFlipZone.type === "BULLISH_ROLE_REVERSAL" &&
    Math.abs(nearestFlipZone.distToCurrentPct) <= 1.5;

  const factors: string[] = [];
  let confluenceScore = 20; // baseline

  if (isAtFlipZoneSupport) {
    factors.push(`Chạm Flip Zone hỗ trợ ${nearestFlipZone!.level} (Retest thành công ${nearestFlipZone!.testCount} lần)`);
    confluenceScore += 40;
  }

  if (roundNum.isAtRoundNumber) {
    factors.push(`Hội tụ tại mốc số tròn tâm lý ${roundNum.level} (Sai số ${roundNum.distancePct}%)`);
    confluenceScore += 25;
  }

  let summaryVi = "Cấu trúc giá bình thường";
  if (isAtFlipZoneSupport && roundNum.isAtRoundNumber) {
    summaryVi = `Hợp lưu Cấu trúc Kép: Flip Zone hỗ trợ tại ${nearestFlipZone!.level} trùng khớp mốc số tròn tâm lý ${roundNum.level}`;
  } else if (isAtFlipZoneSupport) {
    summaryVi = `Đang test thành công Flip Zone hỗ trợ ${nearestFlipZone!.level}`;
  } else if (roundNum.isAtRoundNumber) {
    summaryVi = `Giá đang dao động tại mốc tròn tâm lý ${roundNum.level}`;
  }

  return {
    currentPrice,
    assetClass,
    activeFlipZones: flipZones,
    nearestFlipZone,
    isAtFlipZoneSupport,
    roundNumber: roundNum,
    confluenceScore: Math.min(100, confluenceScore),
    factors,
    summaryVi,
  };
}
