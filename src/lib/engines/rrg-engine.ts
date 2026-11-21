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

export const SECTOR_NAME_TO_CODE: Record<string, string> = {
  "Ngân hàng": "BANK",
  "Bất động sản": "REAL",
  "Chứng khoán": "SEC",
  "Thép": "STEEL",
  "Thép & Vật liệu": "STEEL",
  "Bán lẻ": "RETAIL",
  "Dầu khí": "OIL",
  "Công nghệ": "TECH",
  "Công nghệ thông tin": "TECH",
  "Thực phẩm & Đồ uống": "FOOD",
  "Hóa chất & Phân bón": "CHEM",
  "Điện lực": "POWER",
  "Điện & Năng lượng": "POWER",
  "Cảng biển & Vận tải": "TRANS",
  "Hàng không & Vận tải": "TRANS",
  "Kho hậu cần": "TRANS",
  "Khu công nghiệp": "IND_PARK",
  "BĐS Khu công nghiệp": "IND_PARK",
  "Xây dựng & Vật liệu": "BUILD",
  "Xây dựng & Hạ tầng": "BUILD",
  "Dược phẩm & Y tế": "PHARMA",
  "Dệt may & Thủy sản": "TEXTILE",
  "Bảo hiểm": "INSUR",
  "Nông nghiệp": "AGRI",
  "Nông nghiệp & Chăn nuôi": "AGRI",
  "Ô tô & Phụ tùng": "AUTO",
};

export function matchSymbolToIcbSector(symbol: string, sectorName?: string | null): string {
  const sym = symbol.toUpperCase().trim();
  for (const s of VN_ICB_SECTORS) {
    if (s.symbols.includes(sym)) return s.code;
  }
  if (sectorName) {
    const trimmed = sectorName.trim();
    if (SECTOR_NAME_TO_CODE[trimmed]) return SECTOR_NAME_TO_CODE[trimmed];
    for (const [name, code] of Object.entries(SECTOR_NAME_TO_CODE)) {
      if (trimmed.includes(name) || name.includes(trimmed)) return code;
    }
  }
  return "OTHER";
}

export interface SectorRrgCoord {
  sectorCode: string;
  sectorName: string;
  quadrant: RrgQuadrant;
  rsRatio: number;
  rsMomentum: number;
  change5dPct: number;
}

export function evaluateSectorAlphaResonance(quadrant: RrgQuadrant | null | undefined): {
  scoreBonus: number;
  isLeading: boolean;
  isImproving: boolean;
  isLagging: boolean;
  tagVi: string | null;
} {
  if (!quadrant) {
    return { scoreBonus: 0, isLeading: false, isImproving: false, isLagging: false, tagVi: null };
  }
  if (quadrant === "LEADING") {
    return { scoreBonus: 12, isLeading: true, isImproving: false, isLagging: false, tagVi: "Sóng Ngành Leading" };
  }
  if (quadrant === "IMPROVING") {
    return { scoreBonus: 7, isLeading: false, isImproving: true, isLagging: false, tagVi: "Sóng Ngành Đang Lên" };
  }
  if (quadrant === "LAGGING") {
    return { scoreBonus: -8, isLeading: false, isImproving: false, isLagging: true, tagVi: "Cảnh báo Ngành Tụt Hậu" };
  }
  return { scoreBonus: 0, isLeading: false, isImproving: false, isLagging: false, tagVi: null };
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
    const winStart = Math.max(0, i - Math.min(windowSize, rsRatioSeries.length) + 1);
    const ratioWindow =
      i - winStart + 1 >= 3 ? rsRatioSeries.slice(winStart, i + 1) : rsRatioSeries.slice(0, Math.max(3, i + 1));
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

export interface LeadLagPairEdge {
  leaderSymbol: string;
  followerSymbol: string;
  optimalLagDays: 1 | 2;
  leadLagCorrelation: number;
  propagationSignal: "LEADER_PULLING_UP" | "LEADER_DRAGGING_DOWN" | "NEUTRAL";
}

export interface MstTreeEdge {
  sourceSymbol: string;
  targetSymbol: string;
  contemporaneousCorr: number;
  mantegnaDistance: number;
}

export interface SectorLeadLagMstResult {
  sectorCode: string;
  hubSymbol: string | null;
  mstEdges: MstTreeEdge[];
  leadLagEdges: LeadLagPairEdge[];
  idiosyncraticReturnsBySymbol: Record<string, number[]>;
}

/**
 * Computes market-residualized (idiosyncratic) returns, Lag-1 / Lag-2 Lead-Lag Cross-Correlation,
 * and Kruskal's Minimum Spanning Tree (MST) over Mantegna metric distance d_ij = sqrt(2 * (1 - rho_ij)).
 */
export function computeSectorLeadLagAndMst(params: {
  sectorCode: string;
  symbolPrices: Record<string, number[]>;
  benchmarkPrices?: number[];
}): SectorLeadLagMstResult {
  const { sectorCode, symbolPrices, benchmarkPrices } = params;
  const symbols = Object.keys(symbolPrices).filter((s) => (symbolPrices[s]?.length ?? 0) >= 12);
  if (symbols.length < 2) {
    return {
      sectorCode,
      hubSymbol: symbols[0] ?? null,
      mstEdges: [],
      leadLagEdges: [],
      idiosyncraticReturnsBySymbol: {},
    };
  }

  const minLen = Math.min(
    ...symbols.map((s) => symbolPrices[s]!.length),
    benchmarkPrices && benchmarkPrices.length >= 12 ? benchmarkPrices.length : Infinity,
  );
  const retLen = minLen - 1;

  // Compute benchmark log returns if provided
  const benchRets: number[] = [];
  if (benchmarkPrices && benchmarkPrices.length >= minLen) {
    const bSlice = benchmarkPrices.slice(-minLen);
    for (let t = 1; t < minLen; t++) {
      const p0 = Math.max(1e-9, bSlice[t - 1]!);
      const p1 = Math.max(1e-9, bSlice[t]!);
      benchRets.push(Math.log(p1 / p0));
    }
  }

  const meanB = benchRets.length > 0 ? mean(benchRets) : 0;
  const varB =
    benchRets.length > 1
      ? benchRets.reduce((s, r) => s + (r - meanB) ** 2, 0) / (benchRets.length - 1)
      : 0;

  // Compute market-residualized (idiosyncratic) returns e_{i,t} = r_{i,t} - beta_i * r_{M,t}
  const idioBySym: Record<string, number[]> = {};
  for (const sym of symbols) {
    const pSlice = symbolPrices[sym]!.slice(-minLen);
    const rawRets: number[] = [];
    for (let t = 1; t < minLen; t++) {
      rawRets.push(Math.log(Math.max(1e-9, pSlice[t]!) / Math.max(1e-9, pSlice[t - 1]!)));
    }
    if (benchRets.length === retLen && varB > 1e-12) {
      const meanR = mean(rawRets);
      let cov = 0;
      for (let t = 0; t < retLen; t++) {
        cov += (rawRets[t]! - meanR) * (benchRets[t]! - meanB);
      }
      const beta = cov / ((retLen - 1) * varB);
      idioBySym[sym] = rawRets.map((r, t) => Number((r - beta * benchRets[t]!).toFixed(6)));
    } else {
      idioBySym[sym] = rawRets.map((r) => Number(r.toFixed(6)));
    }
  }

  const pearson = (a: number[], b: number[]): number => {
    const m = Math.min(a.length, b.length);
    if (m < 4) return 0;
    const ma = mean(a.slice(0, m));
    const mb = mean(b.slice(0, m));
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < m; i++) {
      const xa = a[i]! - ma;
      const xb = b[i]! - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    const den = Math.sqrt(da * db);
    return den > 1e-12 ? Math.max(-1, Math.min(1, num / den)) : 0;
  };

  // 1. Build all pairwise Mantegna distances & run Kruskal's MST
  const allPairs: MstTreeEdge[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const sA = symbols[i]!;
      const sB = symbols[j]!;
      const corr = pearson(idioBySym[sA]!, idioBySym[sB]!);
      const dist = Math.sqrt(Math.max(0, 2 * (1 - corr)));
      allPairs.push({
        sourceSymbol: sA,
        targetSymbol: sB,
        contemporaneousCorr: Number(corr.toFixed(4)),
        mantegnaDistance: Number(dist.toFixed(4)),
      });
    }
  }
  allPairs.sort((a, b) => a.mantegnaDistance - b.mantegnaDistance);

  const parent = new Map<string, string>(symbols.map((s) => [s, s]));
  const findRoot = (x: string): string => {
    let curr = x;
    while (parent.get(curr) !== curr) {
      curr = parent.get(curr)!;
    }
    return curr;
  };

  const mstEdges: MstTreeEdge[] = [];
  const degreeCount = new Map<string, number>(symbols.map((s) => [s, 0]));
  for (const edge of allPairs) {
    const rA = findRoot(edge.sourceSymbol);
    const rB = findRoot(edge.targetSymbol);
    if (rA !== rB) {
      parent.set(rA, rB);
      mstEdges.push(edge);
      degreeCount.set(edge.sourceSymbol, (degreeCount.get(edge.sourceSymbol) ?? 0) + 1);
      degreeCount.set(edge.targetSymbol, (degreeCount.get(edge.targetSymbol) ?? 0) + 1);
      if (mstEdges.length === symbols.length - 1) break;
    }
  }

  let hubSymbol: string | null = symbols[0] ?? null;
  let maxDeg = -1;
  for (const [sym, deg] of degreeCount.entries()) {
    if (deg > maxDeg) {
      maxDeg = deg;
      hubSymbol = sym;
    }
  }

  // 2. Evaluate Lag-1 and Lag-2 Lead-Lag Cross-Correlation between ordered pairs (leader -> follower)
  const leadLagEdges: LeadLagPairEdge[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      if (i === j) continue;
      const leader = symbols[i]!;
      const follower = symbols[j]!;
      const rLead = idioBySym[leader]!;
      const rFollow = idioBySym[follower]!;
      if (rLead.length < 8) continue;

      const corrLag1 = pearson(rLead.slice(0, rLead.length - 1), rFollow.slice(1));
      const corrLag2 = pearson(rLead.slice(0, rLead.length - 2), rFollow.slice(2));
      const bestLag: 1 | 2 = Math.abs(corrLag2) > Math.abs(corrLag1) ? 2 : 1;
      const bestCorr = bestLag === 2 ? corrLag2 : corrLag1;

      if (bestCorr >= 0.25) {
        const recentLeaderImpulse = rLead[rLead.length - 1]! + (rLead[rLead.length - 2] ?? 0);
        const propagationSignal: LeadLagPairEdge["propagationSignal"] =
          recentLeaderImpulse > 0.005
            ? "LEADER_PULLING_UP"
            : recentLeaderImpulse < -0.005
              ? "LEADER_DRAGGING_DOWN"
              : "NEUTRAL";
        leadLagEdges.push({
          leaderSymbol: leader,
          followerSymbol: follower,
          optimalLagDays: bestLag,
          leadLagCorrelation: Number(bestCorr.toFixed(4)),
          propagationSignal,
        });
      }
    }
  }
  leadLagEdges.sort((a, b) => b.leadLagCorrelation - a.leadLagCorrelation);

  return {
    sectorCode,
    hubSymbol,
    mstEdges,
    leadLagEdges: leadLagEdges.slice(0, 12),
    idiosyncraticReturnsBySymbol: idioBySym,
  };
}
