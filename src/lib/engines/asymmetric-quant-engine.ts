/**
 * Asymmetric Alpha Quant Engine
 * Định lượng điểm vào lệnh Bất Đối Xứng: LỖ TỐI THIỂU (Loss Minimization) & LÃI TỐI ĐA (Upside Maximization).
 * Nguyên lý: Entry neo sát Cụm Hỗ Trợ Hội Tụ (Confluence Floor) -> Rủi ro cắt lỗ cực hẹp (2-3%),
 * trong khi biên độ chốt lời mở rộng tối đa lên Trần Kháng Cự (12-25%+), R:R >= 1:3.5.
 */

export interface AsymmetricPlanInput {
  last: number;
  atr14?: number | null;
  supports?: number[] | null;
  resistances?: number[] | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema20?: number | null;
  rsi14?: number | null;
  macdHist?: number | null;
  bollinger?: { upper?: number | null; mid?: number | null; lower?: number | null } | null;
  high52w?: number | null;
  low52w?: number | null;
  volumeRatio20?: number | null;
  trendScore?: number | null;
}

export interface SupportConfluenceCluster {
  price: number;
  strength: number; // 1-5 sao
  layers: string[]; // Các lớp hỗ trợ hội tụ
  distancePct: number;
}

export interface AsymmetricPlanResult {
  entry: number;
  entryZone: [number, number];
  stopLoss: number;
  takeProfit: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number; // R:R (e.g. 4.2)
  riskPct: number; // % lỗ tối đa (e.g. 2.4%)
  rewardPct: number; // % lãi kỳ vọng (e.g. 15.6%)
  riskPerShare: number;
  asymmetricScore: number; // Điểm số chất lượng bất đối xứng (0-100)
  confluenceCluster: SupportConfluenceCluster;
  confluenceBasis: string[];
  currentPriceDiffPct: number; // % chênh lệch giữa Entry vs Giá hiện tại
  actionVerdict: string;
}

/** Làm tròn bước giá chuẩn VN */
export function tickRound(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  if (price < 10) return Math.round(price * 100) / 100; // 0.01
  if (price < 50) return Math.round(price * 20) / 20; // 0.05
  if (price < 100) return Math.round(price * 10) / 10; // 0.1
  return Math.round(price * 2) / 2; // 0.5
}

/**
 * 1. Thuật toán Quét & Tìm Cụm Hỗ Trợ Hội Tụ (Confluence Support Cluster)
 * Tìm mức giá phía dưới có mật độ các chỉ báo kỹ thuật hội tụ dày đặc nhất làm bệ đỡ.
 */
function findSupportConfluence(input: AsymmetricPlanInput): SupportConfluenceCluster {
  const last = input.last;
  const atr = Math.max(input.atr14 ?? 0, last * 0.01);
  const candidates: { price: number; name: string; weight: number }[] = [];

  // Lớp 1: Hỗ trợ tĩnh
  for (const s of input.supports ?? []) {
    if (s > 0 && s < last * 1.005) {
      candidates.push({ price: s, name: `Hỗ trợ tĩnh ${tickRound(s)}`, weight: 2.0 });
    }
  }

  // Lớp 2: Đường xu hướng động (SMA20, SMA50, SMA200, EMA20)
  if (input.sma20 && input.sma20 > 0 && input.sma20 < last * 1.01) {
    candidates.push({ price: input.sma20, name: `Đường SMA20 (${tickRound(input.sma20)})`, weight: 2.2 });
  }
  if (input.ema20 && input.ema20 > 0 && input.ema20 < last * 1.01) {
    candidates.push({ price: input.ema20, name: `Đường EMA20 (${tickRound(input.ema20)})`, weight: 1.8 });
  }
  if (input.sma50 && input.sma50 > 0 && input.sma50 < last * 1.01) {
    candidates.push({ price: input.sma50, name: `Đường SMA50 (${tickRound(input.sma50)})`, weight: 2.5 });
  }
  if (input.sma200 && input.sma200 > 0 && input.sma200 < last * 1.01) {
    candidates.push({ price: input.sma200, name: `Đường dài hạn SMA200 (${tickRound(input.sma200)})`, weight: 3.0 });
  }

  // Lớp 3: Bollinger Bands (Dải giữa và dải dưới)
  if (input.bollinger?.mid && input.bollinger.mid > 0 && input.bollinger.mid < last * 1.008) {
    candidates.push({ price: input.bollinger.mid, name: `Dải giữa Bollinger (${tickRound(input.bollinger.mid)})`, weight: 1.5 });
  }
  if (input.bollinger?.lower && input.bollinger.lower > 0 && input.bollinger.lower < last) {
    candidates.push({ price: input.bollinger.lower, name: `Dải dưới Bollinger (${tickRound(input.bollinger.lower)})`, weight: 1.6 });
  }

  // Nếu không có ứng viên nào dưới last, dùng mốc lùi ATR tối thiểu
  if (candidates.length === 0) {
    const fallbackPrice = tickRound(last * 0.98);
    return {
      price: fallbackPrice,
      strength: 1,
      layers: [`Hỗ trợ ước lượng biến động (-2%)`],
      distancePct: 2.0,
    };
  }

  // Nhóm các ứng viên nằm trong bán kính 1.2% ATR thành từng Cụm (Cluster)
  const clusterRadius = Math.max(atr * 0.7, last * 0.012);
  let bestClusterPrice = candidates[0]!.price;
  let maxClusterWeight = 0;
  let bestClusterLayers: string[] = [];

  for (const anchor of candidates) {
    let totalWeight = 0;
    const matchedLayers: string[] = [];
    let weightedSum = 0;

    for (const c of candidates) {
      if (Math.abs(c.price - anchor.price) <= clusterRadius) {
        totalWeight += c.weight;
        weightedSum += c.price * c.weight;
        matchedLayers.push(c.name);
      }
    }

    if (totalWeight > maxClusterWeight) {
      maxClusterWeight = totalWeight;
      bestClusterPrice = weightedSum / totalWeight;
      bestClusterLayers = Array.from(new Set(matchedLayers));
    }
  }

  const finalFloorPrice = tickRound(bestClusterPrice);
  const distancePct = Math.round(((last - finalFloorPrice) / last) * 1000) / 10;
  const strength = Math.min(5, Math.max(1, Math.round(maxClusterWeight / 1.8)));

  return {
    price: finalFloorPrice,
    strength,
    layers: bestClusterLayers,
    distancePct,
  };
}

/**
 * 2. Thuật toán Tìm Trần Lợi Nhuận Mục Tiêu (Upside Target Ceiling)
 */
function findUpsideCeiling(input: AsymmetricPlanInput, entryPrice: number): number {
  const last = input.last;
  const resistances = (input.resistances ?? []).filter((r) => r > entryPrice * 1.05);

  let target = 0;
  if (resistances.length > 0) {
    // Lấy kháng cự có khoảng cách biên độ tốt (ưu tiên >= +12%)
    const solidRes = resistances.find((r) => r >= entryPrice * 1.10) ?? resistances[0]!;
    target = solidRes;
  } else if (input.high52w && input.high52w > entryPrice * 1.08) {
    target = input.high52w;
  } else if (input.bollinger?.upper && input.bollinger.upper > entryPrice * 1.08) {
    target = input.bollinger.upper;
  } else {
    // Mặc định mục tiêu tối thiểu +14% để đảm bảo tỷ suất bất đối xứng
    target = entryPrice * 1.145;
  }

  return tickRound(target);
}

/**
 * 3. Bộ Tính Toán Kỹ Thuật Định Lượng Bất Đối Xứng Hoàn Chỉnh
 */
export function computeAsymmetricPlan(input: AsymmetricPlanInput): AsymmetricPlanResult {
  const last = input.last;
  const atr = Math.max(input.atr14 ?? 0, last * 0.012);
  const cluster = findSupportConfluence(input);

  // =========================================================================
  // A. XÁC ĐỊNH ĐIỂM ENTRY MUA TỐI ƯU SÁT HỖ TRỢ BỆ ĐỠ
  // =========================================================================
  let optimalEntry = last;
  let entryMin = cluster.price;
  let entryMax = last;

  // Nếu giá sàn đang cách xa cụm hỗ trợ > 1.2%, kéo Entry lùi về sát bệ đỡ
  if (cluster.distancePct > 1.2) {
    // Entry đặt ngay trên bệ đỡ 0.5% - 1.0% (vừa an toàn vừa dễ khớp)
    optimalEntry = tickRound(cluster.price + Math.min(atr * 0.25, cluster.price * 0.008));
    entryMin = tickRound(cluster.price * 0.998);
    entryMax = tickRound(optimalEntry + atr * 0.25);
  } else {
    // Giá đang nằm ngay trên bệ đỡ hội tụ
    optimalEntry = tickRound(last);
    entryMin = tickRound(cluster.price * 0.996);
    entryMax = tickRound(last * 1.006);
  }

  // =========================================================================
  // B. XÁC ĐỊNH ĐIỂM CẮT LỖ (STOP LOSS) SIẾT CHẶT: LỖ ÍT NHẤT (2% - 3.2%)
  // =========================================================================
  // Đặt SL ngay dưới đáy cụm hỗ trợ bê tông 0.8% - 1.2%
  let stopLoss = tickRound(cluster.price * 0.99);

  // Đảm bảo mức lỗ tối đa không vượt quá 3.5%
  if ((optimalEntry - stopLoss) / optimalEntry > 0.035) {
    stopLoss = tickRound(optimalEntry * 0.968); // Giới hạn lỗ tối đa ~3.2%
  }
  // Tránh SL quá sát (< 1.6%) để không bị quét nhiễu nến
  if ((optimalEntry - stopLoss) / optimalEntry < 0.016) {
    stopLoss = tickRound(optimalEntry * 0.978);
  }

  const riskPerShare = optimalEntry - stopLoss;
  const riskPct = Math.round((riskPerShare / optimalEntry) * 1000) / 10;

  // =========================================================================
  // C. XÁC ĐỊNH MỤC TIÊU LỢI NHUẬN (TAKE PROFIT): LÃI CAO NHẤT (12% - 25%+)
  // =========================================================================
  const ceiling = findUpsideCeiling(input, optimalEntry);
  // Mục tiêu đảm bảo R:R tối thiểu 1:3.5
  const minTarget3_5r = tickRound(optimalEntry + riskPerShare * 3.5);
  const takeProfit = tickRound(Math.max(ceiling, minTarget3_5r));

  const rewardPerShare = takeProfit - optimalEntry;
  const rewardPct = Math.round((rewardPerShare / optimalEntry) * 1000) / 10;
  const riskReward = Math.round((rewardPerShare / riskPerShare) * 10) / 10;

  // 3 Nấc lợi nhuận phân bổ
  const takeProfit1 = tickRound(optimalEntry + riskPerShare * 1.8);
  const takeProfit2 = takeProfit;
  const takeProfit3 = tickRound(optimalEntry + riskPerShare * 4.5);

  // =========================================================================
  // D. ĐIỂM SỐ CHẤT LƯỢNG BẤT ĐỐI XỨNG (ASYMMETRIC QUALITY SCORE - AQS)
  // =========================================================================
  let score = 50;
  // Điểm cộng hội tụ
  score += cluster.strength * 7;
  // Điểm cộng R:R cao
  if (riskReward >= 4.0) score += 20;
  else if (riskReward >= 3.0) score += 14;
  else if (riskReward >= 2.0) score += 6;

  // Động lượng & dòng tiền cạn cung
  if (input.rsi14 != null && input.rsi14 <= 48 && input.rsi14 >= 30) score += 8; // Vùng oversold pullback chuẩn
  if (input.volumeRatio20 != null && input.volumeRatio20 <= 0.85) score += 6; // Cạn cung (Volume dry-up)
  if (input.macdHist != null && input.macdHist > 0) score += 6;

  const asymmetricScore = Math.min(98, Math.max(45, Math.round(score)));

  // Chênh lệch giá hiện tại vs Entry
  const currentPriceDiffPct = Math.round(((last - optimalEntry) / last) * 1000) / 10;

  // Lời phán quyết hành động
  let actionVerdict = "";
  if (currentPriceDiffPct > 0.8) {
    actionVerdict = `Giá sàn đang cao hơn điểm mua +${currentPriceDiffPct}%. Đặt lệnh chờ tại ${optimalEntry} để khống chế lỗ tối đa chỉ -${riskPct}%.`;
  } else if (Math.abs(currentPriceDiffPct) <= 0.8) {
    actionVerdict = `Giá sàn đang ở đúng bệ đỡ bê tông hội tụ ${cluster.layers.length} lớp. Có thể giải ngân gom lệnh với tỷ suất 1 ăn ${riskReward}.`;
  } else {
    actionVerdict = `Giá đã chiết khấu sâu dưới bệ đỡ. Giải ngân thăm dò quanh ${optimalEntry} để đón nhịp hồi phục lớn.`;
  }

  const confluenceBasis: string[] = [
    `Bệ đỡ hội tụ ${cluster.layers.length} lớp kỹ thuật quanh ${cluster.price}: ${cluster.layers.slice(0, 3).join(", ")}`,
    `Khống chế mức lỗ tối đa cực hẹp: chỉ -${riskPct}% khi vi phạm bệ đỡ (bảo vệ ${100 - riskPct}% vốn)`,
    `Mục tiêu trần lợi nhuận mở rộng: +${rewardPct}% (Tỷ suất bất đối xứng 1 ăn ${riskReward})`,
  ];

  return {
    entry: optimalEntry,
    entryZone: [entryMin, entryMax],
    stopLoss,
    takeProfit,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    riskReward,
    riskPct,
    rewardPct,
    riskPerShare,
    asymmetricScore,
    confluenceCluster: cluster,
    confluenceBasis,
    currentPriceDiffPct,
    actionVerdict,
  };
}
