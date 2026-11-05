/**
 * Price Driver Attribution — Decompose a stock's daily move into % contribution per factor.
 * Factors: News, Foreign net, Sector, Market, Technical, Volume.
 * Ported from lotusmarket (Go/Python deterministic attribution engine).
 */

export interface DriverFeatures {
  priceChangePct: number;
  foreignNetVnd: number;
  marketDeltaPct: number;
  sectorDeltaPct: number;
  newsCount?: number;
  newsSentimentAvg?: number; // [-1.0, 1.0]
  rsi?: number;
  maSignal?: "BUY" | "SELL" | "HOLD" | "";
  volumeRatio?: number; // currentVolume / avgVolume20
}

export type DominantDriver =
  | "FOREIGN"
  | "SECTOR"
  | "MARKET"
  | "NEWS"
  | "TECHNICAL"
  | "VOLUME"
  | "UNKNOWN";

export interface DriverAttribution {
  newsPct: number;
  foreignPct: number;
  sectorPct: number;
  marketPct: number;
  technicalPct: number;
  volumePct: number;
  residualPct: number;
  dominant: DominantDriver;
  summaryVi: string;
}

const DOMINANT_LABELS_VI: Record<DominantDriver, string> = {
  FOREIGN: "Dòng tiền Khối ngoại mua/bán ròng",
  SECTOR: "Sóng dòng tiền toàn Ngành",
  MARKET: "Đà kéo/đạp của Chỉ số chung VN-Index",
  NEWS: "Tác động từ Tin tức & Truyền thông",
  TECHNICAL: "Xung lực Kỹ thuật (RSI / Đường MA)",
  VOLUME: "Đột biến Khối lượng dòng tiền lớn",
  UNKNOWN: "Chưa xác định rõ động lực nổi trội",
};

export function attributeDrivers(f: DriverFeatures): DriverAttribution {
  const move = f.priceChangePct;

  if (Math.abs(move) < 0.05) {
    return {
      newsPct: 0,
      foreignPct: 0,
      sectorPct: 0,
      marketPct: 0,
      technicalPct: 0,
      volumePct: 0,
      residualPct: 100,
      dominant: "UNKNOWN",
      summaryVi: "Biến động giá đi ngang trong biên độ hẹp, chưa hình thành động lực rõ nét.",
    };
  }

  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

  const techImpact = (rsi: number, ma: string): number => {
    let s = ma === "BUY" ? 2.0 : ma === "SELL" ? -2.0 : 0.0;
    if (rsi > 70) s -= 1;
    else if (rsi > 0 && rsi < 30) s += 1;
    return s;
  };

  const volumeImpact = (ratio: number, mv: number): number => {
    if (ratio < 1.2) return 0.0;
    const impact = Math.log(ratio) * 2;
    return mv < 0 ? -impact : impact;
  };

  const newsSentiment = f.newsSentimentAvg ?? 0;
  const newsCount = f.newsCount ?? 0;
  const rsi = f.rsi ?? 50;
  const maSignal = f.maSignal ?? "";
  const volRatio = f.volumeRatio ?? 1.0;

  const signs: Record<string, number> = {
    FOREIGN: clamp(f.foreignNetVnd / 10_000_000_000, 5), // 10 tỷ VND = 1.0
    MARKET: f.marketDeltaPct,
    SECTOR: f.sectorDeltaPct - f.marketDeltaPct, // Alpha ngành
    NEWS: newsSentiment * Math.log1p(newsCount) * 3,
    TECHNICAL: techImpact(rsi, maSignal),
    VOLUME: volumeImpact(volRatio, move),
  };

  const moveSign = move > 0 ? 1 : -1;
  const weights: Record<string, number> = {};
  let total = 0.0;

  for (const [k, v] of Object.entries(signs)) {
    let w = Math.abs(v);
    if (w === 0) continue;
    const vs = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (vs !== moveSign) {
      w *= 0.3; // Tín hiệu ngược hướng nhận 30% trọng số
    }
    weights[k] = w;
    total += w;
  }

  if (total < 0.01) {
    return {
      newsPct: 0,
      foreignPct: 0,
      sectorPct: 0,
      marketPct: 0,
      technicalPct: 0,
      volumePct: 0,
      residualPct: 100,
      dominant: "UNKNOWN",
      summaryVi: "Không có yếu tố nào chiếm ưu thế tuyệt đối trong phiên hôm nay.",
    };
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;

  const foreignPct = r1(((weights.FOREIGN ?? 0) / total) * 100);
  const marketPct = r1(((weights.MARKET ?? 0) / total) * 100);
  const sectorPct = r1(((weights.SECTOR ?? 0) / total) * 100);
  const newsPct = r1(((weights.NEWS ?? 0) / total) * 100);
  const technicalPct = r1(((weights.TECHNICAL ?? 0) / total) * 100);
  const volumePct = r1(((weights.VOLUME ?? 0) / total) * 100);

  const accounted = foreignPct + marketPct + sectorPct + newsPct + technicalPct + volumePct;
  const residualPct = r1(Math.max(0, 100 - accounted));

  let dominant: DominantDriver = "UNKNOWN";
  let bestWeight = 0;

  for (const [k, w] of Object.entries(weights)) {
    const v = signs[k];
    const vs = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (vs !== moveSign) continue;
    if (w > bestWeight) {
      bestWeight = w;
      dominant = k as DominantDriver;
    }
  }

  const dominantName = DOMINANT_LABELS_VI[dominant] || "yếu tố kỹ thuật";
  const directionStr = move > 0 ? "tăng giá" : "giảm giá";
  const dominantPct =
    dominant === "FOREIGN"
      ? foreignPct
      : dominant === "SECTOR"
      ? sectorPct
      : dominant === "MARKET"
      ? marketPct
      : dominant === "NEWS"
      ? newsPct
      : dominant === "VOLUME"
      ? volumePct
      : technicalPct;

  const summaryVi = `Động lực ${directionStr} chính hôm nay đến từ ${dominantName} (${dominantPct}%).`;

  return {
    newsPct,
    foreignPct,
    sectorPct,
    marketPct,
    technicalPct,
    volumePct,
    residualPct,
    dominant,
    summaryVi,
  };
}
