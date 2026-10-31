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
    // Kích hoạt Engine Định Lượng Bất Đối Xứng Đa Yếu Tố
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

    return {
      side,
      sideVi: "MUA",
      entry: asym.entry,
      entryZone: asym.entryZone,
      entryStrategyVi: asym.actionVerdict,
      currentPriceDiffPct: asym.currentPriceDiffPct,
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
