export type RrgQuadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";

export interface RrgPoint {
  date: string;
  rsRatio: number;
  rsMomentum: number;
}

export interface RrgItem {
  id: string;
  code: string;
  name: string;
  currentRsRatio: number;
  currentRsMomentum: number;
  quadrant: RrgQuadrant;
  change5dPct: number;
  marketCapBillion?: number;
  trail: RrgPoint[];
}

export interface RrgResult {
  benchmark: string;
  asOfDate: string;
  items: RrgItem[];
  summary: {
    leadingCount: number;
    weakeningCount: number;
    laggingCount: number;
    improvingCount: number;
  };
}

/**
 * 18 Nhóm ngành kinh tế chuẩn ICB tại thị trường chứng khoán Việt Nam
 */
export const VN_ICB_SECTORS = [
  { code: "BANK", name: "Ngân hàng", symbols: ["VCB", "BID", "CTG", "TCB", "MBB", "VPB", "ACB"] },
  { code: "REAL", name: "Bất động sản", symbols: ["VHM", "VIC", "VRE", "KDH", "NLG", "DXG", "PDR"] },
  { code: "SEC", name: "Chứng khoán", symbols: ["SSI", "VND", "VCI", "HCM", "SHS", "MBS"] },
  { code: "STEEL", name: "Thép & Vật liệu", symbols: ["HPG", "HSG", "NKG"] },
  { code: "RETAIL", name: "Bán lẻ", symbols: ["MWG", "FRT", "PNJ", "DGW"] },
  { code: "OIL", name: "Dầu khí", symbols: ["GAS", "PVD", "PVS", "BSR", "PLX"] },
  { code: "TECH", name: "Công nghệ thông tin", symbols: ["FPT", "CMG", "ELC"] },
  { code: "FOOD", name: "Thực phẩm & Đồ uống", symbols: ["VNM", "MSN", "SAB", "KDC"] },
  { code: "CHEM", name: "Hóa chất & Phân bón", symbols: ["DGC", "DPM", "DCM", "CSV"] },
  { code: "POWER", name: "Điện & Năng lượng", symbols: ["POW", "REE", "GEG", "PC1", "HDG"] },
  { code: "TRANS", name: "Cảng biển & Vận tải", symbols: ["GMD", "HAH", "VSC", "PVT"] },
  { code: "IND_PARK", name: "BĐS Khu công nghiệp", symbols: ["KBC", "IDC", "VGC", "SZC", "BCM"] },
  { code: "BUILD", name: "Xây dựng & Hạ tầng", symbols: ["CTD", "VCG", "HHV", "C4G"] },
  { code: "PHARMA", name: "Dược phẩm & Y tế", symbols: ["DHG", "IMP", "DMC", "TRA"] },
  { code: "TEXTILE", name: "Dệt may & Thủy sản", symbols: ["VHC", "ANV", "TNG", "MSH"] },
  { code: "INSUR", name: "Bảo hiểm", symbols: ["BVH", "MIG", "BMI", "PVI"] },
  { code: "AGRI", name: "Nông nghiệp & Chăn nuôi", symbols: ["DBC", "BAF", "HAG"] },
  { code: "AUTO", name: "Ô tô & Phụ tùng", symbols: ["HHS", "CTF", "HAX"] },
];

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length <= 1) return 1;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance) || 1;
}

export function determineQuadrant(rsRatio: number, rsMomentum: number): RrgQuadrant {
  if (rsRatio >= 100 && rsMomentum >= 100) return "LEADING";
  if (rsRatio >= 100 && rsMomentum < 100) return "WEAKENING";
  if (rsRatio < 100 && rsMomentum < 100) return "LAGGING";
  return "IMPROVING";
}

/**
 * Tính toán tọa độ RRG theo thuật toán chuẩn J-DeK (Julius de Kempenaer)
 * Normalized xung quanh điểm gốc 100, 100.
 */
export function computeRrgTrail(
  targetPrices: number[],
  benchmarkPrices: number[],
  dates: string[],
  trailLength = 5,
  windowSize = 10
): RrgPoint[] {
  const minLen = Math.min(targetPrices.length, benchmarkPrices.length);
  if (minLen < windowSize + trailLength) return [];

  const rawRs: number[] = [];
  for (let i = 0; i < minLen; i++) {
    const bp = benchmarkPrices[i] || 1;
    rawRs.push((targetPrices[i] / bp) * 100);
  }

  // 1. Tính chuỗi RS-Ratio (Moving Average & Normalize quanh 100)
  const rsRatioSeries: number[] = [];
  for (let i = windowSize; i <= minLen; i++) {
    const window = rawRs.slice(i - windowSize, i);
    const avg = mean(window);
    const sd = stdDev(window, avg);
    const current = rawRs[i - 1];
    // Z-Score scaling to 100 base
    const ratio = 100 + ((current - avg) / sd) * 2.2;
    rsRatioSeries.push(Math.round(ratio * 100) / 100);
  }

  // 2. Tính chuỗi RS-Momentum (Gia tốc của RS-Ratio quanh 100)
  const points: RrgPoint[] = [];
  const startIdx = Math.max(0, rsRatioSeries.length - trailLength);

  for (let i = startIdx; i < rsRatioSeries.length; i++) {
    const ratioWindow = rsRatioSeries.slice(Math.max(0, i - windowSize + 1), i + 1);
    const avgRatio = mean(ratioWindow);
    const sdRatio = stdDev(ratioWindow, avgRatio);
    const currentRatio = rsRatioSeries[i];
    const momentum = 100 + ((currentRatio - avgRatio) / sdRatio) * 2.5;

    const dateIdx = minLen - (rsRatioSeries.length - i);
    points.push({
      date: dates[dateIdx] || `T-${rsRatioSeries.length - 1 - i}`,
      rsRatio: Math.round(currentRatio * 100) / 100,
      rsMomentum: Math.round(momentum * 100) / 100,
    });
  }

  return points;
}
