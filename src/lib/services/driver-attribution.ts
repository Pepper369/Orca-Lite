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

  const moveSign = move > 0 ? 1 : -1;
  const adjust = (val: number) => {
    const w = Math.abs(val);
    if (w === 0) return 0;
    const vs = val > 0 ? 1 : val < 0 ? -1 : 0;
    return vs === moveSign ? w : w * 0.3;
  };

  const vForeign = clamp(f.foreignNetVnd / 10_000_000_000, 5);
  const vMarket = f.marketDeltaPct;
  const vSector = f.sectorDeltaPct - f.marketDeltaPct;
  const vNews = newsSentiment * Math.log1p(newsCount) * 3;
  const vTechnical = techImpact(rsi, maSignal);
  const vVolume = volumeImpact(volRatio, move);

  const wForeign = adjust(vForeign);
  const wMarket = adjust(vMarket);
  const wSector = adjust(vSector);
  const wNews = adjust(vNews);
  const wTechnical = adjust(vTechnical);
  const wVolume = adjust(vVolume);

  const total = wForeign + wMarket + wSector + wNews + wTechnical + wVolume;

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

  const foreignPct = r1((wForeign / total) * 100);
  const marketPct = r1((wMarket / total) * 100);
  const sectorPct = r1((wSector / total) * 100);
  const newsPct = r1((wNews / total) * 100);
  const technicalPct = r1((wTechnical / total) * 100);
  const volumePct = r1((wVolume / total) * 100);

  const accounted = foreignPct + marketPct + sectorPct + newsPct + technicalPct + volumePct;
  const residualPct = r1(Math.max(0, 100 - accounted));

  let dominant: DominantDriver = "UNKNOWN";
  let bestWeight = 0;

  if (vForeign * moveSign > 0 && wForeign > bestWeight) { dominant = "FOREIGN"; bestWeight = wForeign; }
  if (vMarket * moveSign > 0 && wMarket > bestWeight) { dominant = "MARKET"; bestWeight = wMarket; }
  if (vSector * moveSign > 0 && wSector > bestWeight) { dominant = "SECTOR"; bestWeight = wSector; }
  if (vNews * moveSign > 0 && wNews > bestWeight) { dominant = "NEWS"; bestWeight = wNews; }
  if (vTechnical * moveSign > 0 && wTechnical > bestWeight) { dominant = "TECHNICAL"; bestWeight = wTechnical; }
  if (vVolume * moveSign > 0 && wVolume > bestWeight) { dominant = "VOLUME"; bestWeight = wVolume; }

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
