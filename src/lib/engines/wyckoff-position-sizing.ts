/**
 * Wyckoff & VSA Capital & Position Sizing Engine
 * Thuật toán tính toán vị thế đi tiền và quản trị rủi ro cố định (% NAV)
 * Dựa trên RRR calculating.afl và bài giảng Buổi 10 (Quản trị vốn).
 */

export interface PositionSizingInput {
  nav: number; // Tổng số vốn tài khoản NAV (VNĐ), vd: 200,000,000
  entryPrice: number; // Thị giá mua (VNĐ hoặc ngàn đồng, chuẩn hóa tự động)
  stopLossPrice: number; // Mức cắt lỗ (VNĐ hoặc ngàn đồng)
  target1Price?: number | null; // Mức chốt lời T1
  target2Price?: number | null; // Mức chốt lời T2
  maxRiskNavPct?: number; // % rủi ro tối đa cho 1 thương vụ (mặc định 1.25%)
}

export interface PositionSizingResult {
  entryPrice: number;
  stopLossPrice: number;
  riskPerShare: number; // Tiền lỗ trên 1 CP (VNĐ)
  riskPercent: number; // % lỗ từ điểm mua (%)
  recommendedWeightPct: number; // Tỷ trọng danh mục khuyến nghị (% NAV)
  cappedWeightPct: number; // Tỷ trọng đã giới hạn an toàn (tối đa 35% NAV cho 1 mã)
  maxAllocationVnd: number; // Số tiền giải ngân tối đa theo tỷ trọng (VNĐ)
  sharesToBuy: number; // Số cổ phiếu làm tròn xuống lô 100
  actualInvestmentVnd: number; // Số tiền đầu tư thực tế (VNĐ)
  maxLossVnd: number; // Rủi ro tiền mặt thực tế nếu dính SL (VNĐ)
  actualRiskNavPct: number; // % NAV thực tế bị rủi ro (%)
  reward1PerShare: number;
  reward1Percent: number;
  maxProfit1Vnd: number;
  rr1: number;
  reward2PerShare: number | null;
  reward2Percent: number | null;
  maxProfit2Vnd: number | null;
  rr2: number | null;
  rating: "OPTIMAL" | "ACCEPTABLE" | "HIGH_RISK";
  ratingVi: string;
  adviceVi: string;
}

export function calculatePositionSizing(input: PositionSizingInput): PositionSizingResult | null {
  if (!input) return null;
  const { nav, maxRiskNavPct = 1.25 } = input;
  if (!Number.isFinite(nav) || nav <= 0) return null;

  const safeRiskPct = Number.isFinite(maxRiskNavPct) && maxRiskNavPct > 0 ? Math.min(10, maxRiskNavPct) : 1.25;

  if (!Number.isFinite(input.entryPrice) || !Number.isFinite(input.stopLossPrice)) return null;

  // Chuẩn hóa đơn vị giá (nếu giá dưới 1000 thì thường là đơn vị ngàn đồng của chứng khoán VN, quy đổi sang VNĐ)
  const normPrice = (p: number) => (p < 1000 ? p * 1000 : p);

  const entry = normPrice(input.entryPrice);
  const sl = normPrice(input.stopLossPrice);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || entry <= 0 || sl <= 0 || sl >= entry) return null;

  const t1 = input.target1Price && Number.isFinite(input.target1Price) ? normPrice(input.target1Price) : entry * 1.15;
  const t2 = input.target2Price && Number.isFinite(input.target2Price) ? normPrice(input.target2Price) : null;

  // 1. Tính toán rủi ro
  const riskPerShare = entry - sl;
  const riskPercent = Number(((riskPerShare / entry) * 100).toFixed(2));

  // 2. Tỷ trọng khuyến nghị: mualandau / RiskPer (từ RRR calculating.afl)
  const rawWeightPct = Number(((safeRiskPct / riskPercent) * 100).toFixed(1));
  // Giới hạn tỷ trọng an toàn: tối đa 35% NAV cho 1 mã đơn lẻ
  const cappedWeightPct = Math.min(35, Math.max(5, rawWeightPct));

  // 3. Số tiền và số cổ phiếu (lô chẵn 100 theo sàn Việt Nam)
  const maxAllocationVnd = (nav * cappedWeightPct) / 100;
  const rawShares = Math.floor(maxAllocationVnd / entry);
  const sharesToBuy = Math.floor(rawShares / 100) * 100; // Làm tròn xuống lô 100

  if (sharesToBuy <= 0) {
    return null;
  }

  const actualInvestmentVnd = sharesToBuy * entry;
  const maxLossVnd = sharesToBuy * riskPerShare;
  const actualRiskNavPct = Number(((maxLossVnd / nav) * 100).toFixed(2));

  // 4. Lợi nhuận kỳ vọng
  const reward1PerShare = Math.max(0, t1 - entry);
  const reward1Percent = Number(((reward1PerShare / entry) * 100).toFixed(2));
  const maxProfit1Vnd = sharesToBuy * reward1PerShare;
  const rr1 = Number((reward1PerShare / riskPerShare).toFixed(2));

  let reward2PerShare: number | null = null;
  let reward2Percent: number | null = null;
  let maxProfit2Vnd: number | null = null;
  let rr2: number | null = null;

  if (t2 && t2 > entry) {
    reward2PerShare = t2 - entry;
    reward2Percent = Number(((reward2PerShare / entry) * 100).toFixed(2));
    maxProfit2Vnd = sharesToBuy * reward2PerShare;
    rr2 = Number((reward2PerShare / riskPerShare).toFixed(2));
  }

  // 5. Đánh giá chất lượng kèo
  let rating: PositionSizingResult["rating"] = "ACCEPTABLE";
  let ratingVi = "Chấp nhận được (1.5 ≤ R:R < 2.5)";
  let adviceVi = "Tỷ lệ R:R vừa phải. Khuyến nghị đi đúng tỷ trọng, không mua đuổi khi giá đã vượt điểm mua chuẩn.";

  if (rr1 >= 2.5 && riskPercent <= 6.5) {
    rating = "OPTIMAL";
    ratingVi = "Kèo tối ưu (R:R ≥ 2.5, SL an toàn)";
    adviceVi = "Kèo có tỷ số Lợi nhuận/Rủi ro xuất sắc và điểm cắt lỗ chặt chẽ. Đủ điều kiện giải ngân tối đa tỷ trọng khuyến nghị.";
  } else if (rr1 < 1.5 || riskPercent > 9.0) {
    rating = "HIGH_RISK";
    ratingVi = "Rủi ro cao (R:R < 1.5 hoặc SL quá xa)";
    adviceVi = "Khoảng cắt lỗ quá rộng hoặc biên lợi nhuận thấp. Nên chờ đợi nhịp test lại hoặc bỏ qua để bảo toàn vốn.";
  }

  return {
    entryPrice: entry,
    stopLossPrice: sl,
    riskPerShare,
    riskPercent,
    recommendedWeightPct: rawWeightPct,
    cappedWeightPct,
    maxAllocationVnd,
    sharesToBuy,
    actualInvestmentVnd,
    maxLossVnd,
    actualRiskNavPct,
    reward1PerShare,
    reward1Percent,
    maxProfit1Vnd,
    rr1,
    reward2PerShare,
    reward2Percent,
    maxProfit2Vnd,
    rr2,
    rating,
    ratingVi,
    adviceVi,
  };
}
