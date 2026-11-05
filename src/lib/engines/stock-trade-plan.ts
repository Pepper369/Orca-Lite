/**
 * Stock trade plan — Entry / SL / TP when signal is MUA or BÁN.
 * Mirrors crypto/forex desk: ATR + nearest S/R, R:R targets.
 * Pure (no server-only) so client DecisionStrip can reuse.
 */

import { computeAsymmetricPlan } from "./asymmetric-quant-engine";

export type StockTradeSide = "buy" | "sell";

export interface StockTradePlan {
  side: StockTradeSide;
  sideVi: "MUA" | "BÁN";
  /** Điểm entry tối ưu đề xuất (không neo cứng giá hiện tại) */
  entry: number;
  /** Vùng giá gom mua/bán tích lũy an toàn [min, max] */
  entryZone: [number, number];
  /** Tên chiến lược vào lệnh */
  entryStrategyVi: string;
  /** Chênh lệch % giữa Entry đề xuất vs Giá thị trường (âm: chờ chỉnh để mua rẻ hơn) */
  currentPriceDiffPct: number;
  /** Đồng bộ trường điểm mua chuẩn với Bộ lọc Screener */
  buyPoint?: number | null;
  buyRange?: [number, number] | null;
  buyZoneStatus?: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" | "NO_SETUP";
  buyPointDiffPct?: number | null;
  absBuyDiff?: number | null;
  isBuyTriggerNow?: boolean | null;
  buyTriggerScore?: number | null;
  buyTriggerReasonVi?: string | null;
  stopLoss: number;
  takeProfit: number;
  /** Secondary targets for scale-out */
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  riskPct: number;
  rewardPct: number;
  /** Absolute risk per share (entry − SL) */
  riskPerShare: number;
  invalidation: number;
  basis: string[];
  notes: string[];
  /** Điểm số chất lượng bất đối xứng (0-100) */
  asymmetricScore?: number;
  /** Các lớp hỗ trợ hội tụ làm bệ đỡ bê tông */
  confluenceLayers?: string[];
  /** Lời phán quyết hành động tức thì */
  actionVerdict?: string;
}

export interface StockTradePlanInput {
  last: number;
  atr14?: number | null;
  support?: number[] | null;
  resistance?: number[] | null;
  /** Optional volatility (decimal, e.g. 0.25 = 25%) to floor ATR */
  volatility30d?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema20?: number | null;
  rsi14?: number | null;
  bollinger?: { upper?: number | null; mid?: number | null; lower?: number | null } | null;
  trendScore?: number | null;
  topChartPattern?: {
    nameVi?: string;
    breakoutPrice?: number | null;
    stopLossPrice?: number | null;
    targetPrice?: number | null;
  } | null;
  isBuyTriggerNow?: boolean;
  buyTriggerScore?: number | null;
  buyTriggerReasonVi?: string | null;
}

/** VN-ish tick rounding */
function tickRound(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  if (price < 10) return Math.round(price * 100) / 100; // 0.01
  if (price < 50) return Math.round(price * 20) / 20; // 0.05
  if (price < 100) return Math.round(price * 10) / 10; // 0.1
  return Math.round(price * 2) / 2; // 0.5
}

function nearestBelow(levels: number[], ref: number): number | null {
  const below = levels.filter((l) => Number.isFinite(l) && l > 0 && l < ref * 0.999);
  if (!below.length) return null;
  return Math.max(...below);
}

function nearestAbove(levels: number[], ref: number): number | null {
  const above = levels.filter((l) => Number.isFinite(l) && l > ref * 1.001);
  if (!above.length) return null;
  return Math.min(...above);
}

/**
 * Build Entry/SL/TP for a clear MUA or BÁN signal.
 * Returns null if price invalid — never invents a plan for "watch".
 */
export function buildStockTradePlan(
  side: StockTradeSide,
  input: StockTradePlanInput,
): StockTradePlan | null {
  const last = input.last;
  if (!Number.isFinite(last) || last <= 0) return null;

  const supports = (input.support ?? []).filter((n) => Number.isFinite(n) && n > 0);
  const resistances = (input.resistance ?? []).filter((n) => Number.isFinite(n) && n > 0);

  const atrRaw = input.atr14 != null && input.atr14 > 0 ? input.atr14 : null;
  const volFloor =
    input.volatility30d != null && input.volatility30d > 0
      ? (last * input.volatility30d) / Math.sqrt(252)
      : null;
  const atr = Math.max(atrRaw ?? 0, volFloor ?? 0, last * 0.008);
  const minStop = Math.max(atr * 0.7, last * 0.012);

  const basis: string[] = [];
  const notes: string[] = [
    "Mức giá tham khảo kỹ thuật — không phải lệnh khuyến nghị tuyệt đối.",
    "Kiểm tra thanh khoản, biên độ sàn/trần và tin tức trước khi vào.",
  ];

  let entry = last;
  let stopLoss: number;
  let takeProfit: number;

  if (side === "buy") {
    // 1. Kiểm tra điểm Pivot bứt phá từ mẫu hình biểu đồ kinh điển (VCP, Cốc tay cầm, Hai đáy, Cờ tăng)
    const pivot = input.topChartPattern?.breakoutPrice ?? null;
    const isPivotValid = pivot != null && pivot > 0 && Math.abs((last - pivot) / last) <= 0.045;

    if (isPivotValid && input.topChartPattern) {
      const buyPoint = tickRound(pivot);
      const diffPct = Number((((last - buyPoint) / last) * 100).toFixed(1));
      const absDiff = Math.abs(diffPct);
      const buyRange: [number, number] = [
        tickRound(buyPoint * 0.99),
        tickRound(buyPoint * 1.015),
      ];
      let buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" = "NEAR_BUY_POINT";
      if (absDiff <= 1.0 || (last >= buyRange[0] && last <= buyRange[1])) {
        buyZoneStatus = "AT_BUY_POINT";
      } else if (absDiff <= 2.5) {
        buyZoneStatus = "NEAR_BUY_POINT";
      } else if (diffPct > 2.5) {
        buyZoneStatus = "WAIT_PULLBACK";
      } else {
        buyZoneStatus = "BELOW_SUPPORT";
      }

      const sl = input.topChartPattern.stopLossPrice
        ? tickRound(input.topChartPattern.stopLossPrice)
        : tickRound(buyPoint * 0.95);
      const tp = input.topChartPattern.targetPrice
        ? tickRound(input.topChartPattern.targetPrice)
        : tickRound(buyPoint * 1.15);
      const risk = buyPoint - sl;
      const reward = tp - buyPoint;
      const rr = risk > 0 ? Number((reward / risk).toFixed(1)) : 2.5;
      const riskPct = buyPoint > 0 ? Number(((risk / buyPoint) * 100).toFixed(1)) : 5.0;
      const rewardPct = buyPoint > 0 ? Number(((reward / buyPoint) * 100).toFixed(1)) : 15.0;

      const patternBasis = [
        `Pivot bứt phá mẫu hình ${input.topChartPattern.nameVi || "kinh điển"} tại ${buyPoint}`,
        `Cắt lỗ vi phạm nền mẫu hình: -${riskPct}% tại ${sl}`,
        `Mục tiêu lợi nhuận mô hình giá: +${rewardPct}% (R:R 1 ăn ${rr})`,
      ];

      return {
        side,
        sideVi: "MUA",
        entry: buyPoint,
        entryZone: buyRange,
        entryStrategyVi: `Pivot bứt phá ${input.topChartPattern.nameVi || "Mẫu hình"}`,
        currentPriceDiffPct: diffPct,
        buyPoint,
        buyRange,
        buyZoneStatus,
        buyPointDiffPct: diffPct,
        absBuyDiff: absDiff,
        stopLoss: sl,
        takeProfit: tp,
        takeProfit1: tickRound(buyPoint + risk * 1.5),
        takeProfit2: tp,
        takeProfit3: tickRound(buyPoint + risk * 3.5),
        riskReward: rr,
        riskPct,
        rewardPct,
        riskPerShare: risk,
        invalidation: sl,
        basis: patternBasis,
        notes,
        asymmetricScore: 88,
        confluenceLayers: [`Pivot ${input.topChartPattern.nameVi || "Mẫu hình"}`],
        actionVerdict: `Pivot bứt phá ${input.topChartPattern.nameVi || "mẫu hình"}. Vùng gom: ${buyRange[0]} – ${buyRange[1]}.`,
        isBuyTriggerNow: input.isBuyTriggerNow,
        buyTriggerScore: input.buyTriggerScore,
        buyTriggerReasonVi: input.buyTriggerReasonVi,
      };
    }

    // 2. Kích hoạt Engine Định Lượng Bất Đối Xứng Đa Yếu Tố
    const asym = computeAsymmetricPlan({
      last,
      atr14: input.atr14,
      supports,
      resistances,
      sma20: input.sma20,
      sma50: input.sma50,
      sma200: input.sma200,
      ema20: input.ema20,
      rsi14: input.rsi14,
      bollinger: input.bollinger,
      trendScore: input.trendScore,
    });

    const buyPoint = asym.entry;
    const diffPct = asym.currentPriceDiffPct;
    const absDiff = Math.abs(diffPct);
    const buyRange = asym.entryZone;

    let buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" = "NEAR_BUY_POINT";
    if (absDiff <= 1.0 || (last >= buyRange[0] && last <= buyRange[1])) {
      buyZoneStatus = "AT_BUY_POINT";
    } else if (absDiff <= 2.5) {
      buyZoneStatus = "NEAR_BUY_POINT";
    } else if (diffPct > 2.5) {
      buyZoneStatus = "WAIT_PULLBACK";
    } else {
      buyZoneStatus = "BELOW_SUPPORT";
    }

    return {
      side,
      sideVi: "MUA",
      entry: asym.entry,
      entryZone: asym.entryZone,
      entryStrategyVi: asym.actionVerdict,
      currentPriceDiffPct: asym.currentPriceDiffPct,
      buyPoint,
      buyRange,
      buyZoneStatus,
      buyPointDiffPct: diffPct,
      absBuyDiff: absDiff,
      stopLoss: asym.stopLoss,
      takeProfit: asym.takeProfit,
      takeProfit1: asym.takeProfit1,
      takeProfit2: asym.takeProfit2,
      takeProfit3: asym.takeProfit3,
      riskReward: asym.riskReward,
      riskPct: asym.riskPct,
      rewardPct: asym.rewardPct,
      riskPerShare: asym.riskPerShare,
      invalidation: asym.stopLoss,
      basis: asym.confluenceBasis,
      notes,
      asymmetricScore: asym.asymmetricScore,
      confluenceLayers: asym.confluenceCluster.layers,
      actionVerdict: asym.actionVerdict,
      isBuyTriggerNow: input.isBuyTriggerNow,
      buyTriggerScore: input.buyTriggerScore,
      buyTriggerReasonVi: input.buyTriggerReasonVi,
    };
  }

  const res = nearestAbove(resistances, last);
  const sup = nearestBelow(supports, last);

  let optimalSell = last;
  let entryMin = last;
  let entryMax = last;
  let entryStrategyVi = "Canh chốt lời / hạ tỷ trọng";

  if (res != null && res > last && (res - last) / last <= 0.035) {
    optimalSell = tickRound(res);
    entryMin = tickRound(last);
    entryMax = tickRound(res);
    entryStrategyVi = "Canh bán hạ tỷ trọng tại Kháng cự";
    basis.push(`Bán khi giá chạm kháng cự ${optimalSell}`);
  } else {
    optimalSell = tickRound(last);
    entryMin = tickRound(last * 0.99);
    entryMax = tickRound(last * 1.01);
    entryStrategyVi = "Bán chốt lời / quản trị rủi ro";
  }

  entry = optimalSell;
  const currentPriceDiffPct = Math.round(((entry - last) / last) * 1000) / 10;

  if (res != null && res - entry >= minStop * 0.5 && res - entry <= atr * 3.5) {
    stopLoss = res + atr * 0.15;
    basis.push(`SL trên kháng cự ${tickRound(res)}`);
  } else {
    stopLoss = entry + minStop;
    basis.push(`SL theo ATR ×0.7–1.2 (~${((minStop / entry) * 100).toFixed(1)}%)`);
  }

  if (stopLoss - entry < minStop * 0.85) {
    stopLoss = entry + minStop;
  }

  const risk = stopLoss - entry;
  if (risk <= 0) return null;

  const target2r = entry - risk * 2;
  if (sup != null && sup < entry - risk * 1.2) {
    takeProfit = sup;
    basis.push(`TP tại hỗ trợ ${tickRound(sup)}`);
    if ((entry - sup) / risk < 1.4) {
      takeProfit = target2r;
      basis.push("Hỗ trợ gần — TP mở rộng 2R");
    }
  } else {
    takeProfit = target2r;
    basis.push("TP theo R:R 1:2 (ATR)");
  }

  stopLoss = tickRound(stopLoss);
  takeProfit = tickRound(Math.max(0.01, takeProfit));

  const risk2 = stopLoss - entry;
  if (risk2 <= 0) return null;
  const reward = entry - takeProfit;
  const rr = reward / risk2;

  const tp1 = tickRound(entry - risk2 * 1.5);
  const tp2 = tickRound(entry - risk2 * 2.5);
  const tp3 = tickRound(Math.max(0.01, entry - risk2 * 4));

  notes.push("Thị trường cơ sở VN: tín hiệu BÁN ưu tiên chốt lời / giảm tỷ trọng hơn là short.");

  return {
    side,
    sideVi: "BÁN",
    entry,
    entryZone: [entryMin, entryMax],
    entryStrategyVi,
    currentPriceDiffPct,
    stopLoss,
    takeProfit: tickRound(Math.min(takeProfit, tp1)),
    takeProfit1: Math.max(0.01, tp1),
    takeProfit2: Math.max(0.01, Math.min(tp2, takeProfit)),
    takeProfit3: Math.max(0.01, tp3),
    riskReward: Math.round(rr * 100) / 100,
    riskPct: Math.round((risk2 / entry) * 1000) / 10,
    rewardPct: Math.round(((entry - Math.min(takeProfit, tp1)) / entry) * 1000) / 10,
    riskPerShare: Math.round(risk2 * 100) / 100,
    invalidation: stopLoss,
    basis,
    notes,
  };
}
