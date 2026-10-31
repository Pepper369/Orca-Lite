/**
 * Stock trade plan — Entry / SL / TP when signal is MUA or BÁN.
 * Mirrors crypto/forex desk: ATR + nearest S/R, R:R targets.
 * Pure (no server-only) so client DecisionStrip can reuse.
 */

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
    const sup = nearestBelow(supports, last);
    const res = nearestAbove(resistances, last);
    const sma20 = input.sma20 != null && input.sma20 > 0 ? input.sma20 : null;
    const rsi = input.rsi14;

    // Phân tích vị thế tổng thể để xác định điểm Entry Mua tối ưu (không neo cứng giá hiện tại)
    let optimalEntry = last;
    let entryMin = last;
    let entryMax = last;
    let entryStrategyVi = "Mua thăm dò tại nền giá";

    const distToSupPct = sup != null ? ((last - sup) / last) * 100 : null;
    const distToSma20Pct = sma20 != null ? ((last - sma20) / last) * 100 : null;

    // Trường hợp 1: Giá đang chạy xa hỗ trợ / SMA20 (>2.0%) hoặc RSI ở vùng cao (>62)
    // -> Khuyến nghị KIÊN NHẪN CHỜ PULLBACK / RETEST để có vị thế an toàn
    if ((distToSupPct != null && distToSupPct > 2.0) || (distToSma20Pct != null && distToSma20Pct > 2.5) || (rsi != null && rsi > 62)) {
      let pullbackTarget = last - atr * 0.75;
      if (sma20 != null && sma20 < last && sma20 >= last - atr * 1.6) {
        pullbackTarget = Math.max(pullbackTarget, sma20 + atr * 0.15);
      }
      if (sup != null && sup < last && sup >= last - atr * 2.0) {
        pullbackTarget = Math.max(pullbackTarget, sup + atr * 0.2);
      }
      // Giới hạn target entry không lùi quá 4.5% để đảm bảo tính thực tế khớp lệnh
      pullbackTarget = Math.max(pullbackTarget, last * 0.955);

      optimalEntry = tickRound(pullbackTarget);
      entryMin = tickRound(Math.min(optimalEntry, sup != null && sup < optimalEntry ? sup : optimalEntry - atr * 0.3));
      entryMax = tickRound(Math.min(last * 0.995, optimalEntry + atr * 0.35));
      entryStrategyVi = sma20 != null && Math.abs(optimalEntry - sma20) < atr
        ? "Canh mua Pullback kiểm định SMA20"
        : "Canh mua nhịp chỉnh retest Hỗ trợ";
      basis.push(`${entryStrategyVi} quanh vùng ${optimalEntry} (tránh FOMO mua đuổi)`);
    }
    // Trường hợp 2: Giá đang ở sát vùng Hỗ trợ hoặc đang tích lũy nền giá chặt quanh SMA20
    else if ((distToSupPct != null && distToSupPct <= 2.0) || (distToSma20Pct != null && Math.abs(distToSma20Pct) <= 1.5)) {
      const baseFloor = sup ?? sma20 ?? (last - atr * 0.3);
      optimalEntry = tickRound(Math.min(last, baseFloor + atr * 0.15));
      entryMin = tickRound(baseFloor);
      entryMax = tickRound(Math.max(last, baseFloor + atr * 0.4));
      entryStrategyVi = "Mua tích lũy tại vùng hỗ trợ / nền giá";
      basis.push(`Mua tích lũy tại nền giá quanh ${optimalEntry}`);
    }
    // Trường hợp 3: Vừa Breakout hoặc đà tăng tiếp diễn
    else {
      optimalEntry = tickRound(last - atr * 0.25);
      entryMin = tickRound(optimalEntry - atr * 0.3);
      entryMax = tickRound(last);
      entryStrategyVi = "Mua retest sau tín hiệu bứt phá";
      basis.push(`Mua đón đầu quanh ${optimalEntry}`);
    }

    entry = optimalEntry;
    const currentPriceDiffPct = Math.round(((entry - last) / last) * 1000) / 10;

    if (sup != null && entry > sup) {
      stopLoss = tickRound(sup - atr * 0.2);
      basis.push(`SL dưới hỗ trợ ${tickRound(sup)}`);
    } else {
      stopLoss = tickRound(entry - minStop);
      basis.push(`SL theo ATR (~${((minStop / entry) * 100).toFixed(1)}%)`);
    }

    if (entry - stopLoss < minStop * 0.8) {
      stopLoss = tickRound(entry - minStop);
    }

    const risk = entry - stopLoss;
    if (risk <= 0) return null;

    const target2r = tickRound(entry + risk * 2.2);
    if (res != null && res > entry + risk * 1.3) {
      takeProfit = tickRound(res);
      basis.push(`TP tại kháng cự ${tickRound(res)}`);
      if ((res - entry) / risk < 1.4) {
        takeProfit = target2r;
        basis.push("Kháng cự gần — TP mở rộng 2.2R");
      }
    } else {
      takeProfit = target2r;
      basis.push("TP theo R:R 1:2.2 (ATR)");
    }

    stopLoss = tickRound(stopLoss);
    takeProfit = tickRound(takeProfit);

    const risk2 = entry - stopLoss;
    if (risk2 <= 0) return null;
    const reward = takeProfit - entry;
    const rr = reward / risk2;

    const tp1 = tickRound(entry + risk2 * 1.5);
    const tp2 = tickRound(entry + risk2 * 2.5);
    const tp3 = tickRound(entry + risk2 * 4);

    return {
      side,
      sideVi: "MUA",
      entry,
      entryZone: [entryMin, entryMax],
      entryStrategyVi,
      currentPriceDiffPct,
      stopLoss,
      takeProfit: tickRound(Math.max(takeProfit, tp1)),
      takeProfit1: tp1,
      takeProfit2: Math.max(tp2, tickRound(takeProfit)),
      takeProfit3: tp3,
      riskReward: Math.round(rr * 100) / 100,
      riskPct: Math.round((risk2 / entry) * 1000) / 10,
      rewardPct: Math.round(((Math.max(takeProfit, tp1) - entry) / entry) * 1000) / 10,
      riskPerShare: Math.round(risk2 * 100) / 100,
      invalidation: stopLoss,
      basis,
      notes,
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
