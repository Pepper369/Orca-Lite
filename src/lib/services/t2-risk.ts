import type { OhlcvBar } from "../types";

/**
 * ============================================================================
 * TRỤ CỘT 2: T+2 OVEREXTENSION RISK ENGINE (CHỈ SỐ RỦI RO KẸP HÀNG T+2.5)
 * ============================================================================
 * Thiết kế thích ứng riêng với vi cấu trúc thanh toán T+2.5 của TTCK Việt Nam.
 * Cổ phiếu mua ở phiên T0 chỉ có thể bán vào phiên chiều T+2 (từ 13:00).
 *
 * Tiêu chí nhận diện Bẫy Kẹp Hàng T+2:
 * 1. Tăng rướn liên tiếp: >= 3 phiên tăng liên tục với tổng mức tăng > 7.5%.
 * 2. Độ rướn khỏi nền giá MA20: Giá hiện tại vượt quá MA20 > 8%.
 * 3. Quá mua ngắn hạn (RSI >= 70) hoặc có dấu hiệu cạn kiệt đà mua / râu nến trên.
 *
 * Mức độ rủi ro:
 * - SAFE: Nền giá an toàn, tích lũy chặt chẽ.
 * - MODERATE: Đang tăng bình thường trong biên độ cho phép.
 * - ELEVATED: Có dấu hiệu rướn, cẩn trọng khi mở vị thế mới.
 * - CRITICAL_T2_TRAP: Rủi ro kẹp hàng T+2 cực cao! Tuyệt đối không mua đuổi.
 */

export type T2RiskLevel = "SAFE" | "MODERATE" | "ELEVATED" | "CRITICAL_T2_TRAP";

export interface T2RiskAssessment {
  symbol: string;
  level: T2RiskLevel;
  levelVi: string;
  consecutiveUpDays: number;
  cumulativeRunGainPct: number;
  distanceFromMa10Pct: number;
  distanceFromMa20Pct: number;
  currentRsi14: number | null;
  volumeSurgeRatio: number | null;
  isOverextended: boolean;
  score: number; // Thang đo rủi ro 0 - 100 (Càng cao càng rủi ro)
  badgeColor: string;
  warningTitle: string;
  warningMessage: string;
  recommendedAction: string;
}

export function computeT2OverextensionRisk(
  symbol: string,
  bars: OhlcvBar[],
  currentPrice?: number | null,
): T2RiskAssessment {
  const sym = symbol.toUpperCase().trim();
  if (!bars || bars.length < 5) {
    return {
      symbol: sym,
      level: "SAFE",
      levelVi: "An toàn",
      consecutiveUpDays: 0,
      cumulativeRunGainPct: 0,
      distanceFromMa10Pct: 0,
      distanceFromMa20Pct: 0,
      currentRsi14: null,
      volumeSurgeRatio: null,
      isOverextended: false,
      score: 10,
      badgeColor: "emerald",
      warningTitle: "Vị thế an toàn",
      warningMessage: "Cổ phiếu đang vận động tích lũy hoặc chưa có chuỗi tăng rướn đột biến.",
      recommendedAction: "Tuân thủ kỷ luật giải ngân theo kế hoạch giao dịch.",
    };
  }

  // Sắp xếp nến nếu chưa theo thứ tự thời gian tăng dần
  const isSorted = bars.length <= 1 || bars[0]!.time <= bars[bars.length - 1]!.time;
  const sorted = isSorted ? bars : [...bars].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  const lastBar = sorted[n - 1]!;
  const price = currentPrice && currentPrice > 0 ? currentPrice : lastBar.close;

  // 1. Đếm chuỗi phiên tăng liên tiếp gần nhất (Consecutive Up Days)
  let consecutiveUpDays = 0;
  let runStartPrice = lastBar.close;

  for (let i = n - 1; i >= 1; i--) {
    const cur = sorted[i]!;
    const prev = sorted[i - 1]!;
    if (cur.close > prev.close) {
      consecutiveUpDays += 1;
      runStartPrice = prev.close;
    } else {
      break;
    }
  }

  // Mức tăng phần trăm của chuỗi tăng hiện tại
  const cumulativeRunGainPct =
    runStartPrice > 0 ? ((price - runStartPrice) / runStartPrice) * 100 : 0;

  // 2. Tính MA10 và MA20 (Zero-allocation loop)
  const calcMa = (period: number) => {
    if (n < period) return price;
    let sum = 0;
    for (let i = n - period; i < n; i++) sum += sorted[i]!.close;
    return sum / period;
  };

  const ma10 = calcMa(10);
  const ma20 = calcMa(20);
  const distanceFromMa10Pct = ma10 > 0 ? ((price - ma10) / ma10) * 100 : 0;
  const distanceFromMa20Pct = ma20 > 0 ? ((price - ma20) / ma20) * 100 : 0;

  // 3. Ước lượng RSI(14) nhanh (Zero-allocation loop)
  let rsi14: number | null = null;
  if (n >= 15) {
    let gains = 0;
    let losses = 0;
    for (let i = n - 14; i < n; i++) {
      const diff = sorted[i]!.close - sorted[i - 1]!.close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    if (avgLoss === 0) rsi14 = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi14 = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
    }
  }

  // 4. Tỷ lệ đột biến Volume so với MA20 volume (Zero-allocation loop)
  const volStart = Math.max(0, n - 20);
  const volCount = n - volStart;
  let sumVol = 0;
  for (let i = volStart; i < n; i++) sumVol += sorted[i]!.volume;
  const avgVol = volCount > 0 ? sumVol / volCount : 1;
  const volumeSurgeRatio = avgVol > 0 ? Math.round((lastBar.volume / avgVol) * 10) / 10 : 1;

  // 5. Tính Điểm Rủi Ro (0 - 100)
  let riskScore = 0;

  // Điểm rướn số phiên tăng
  if (consecutiveUpDays >= 4) riskScore += 35;
  else if (consecutiveUpDays === 3) riskScore += 25;
  else if (consecutiveUpDays === 2) riskScore += 10;

  // Điểm biên độ tăng rướn
  if (cumulativeRunGainPct >= 12) riskScore += 30;
  else if (cumulativeRunGainPct >= 7.5) riskScore += 25;
  else if (cumulativeRunGainPct >= 5.0) riskScore += 10;

  // Điểm rướn xa nền MA20
  if (distanceFromMa20Pct >= 10) riskScore += 25;
  else if (distanceFromMa20Pct >= 7) riskScore += 15;

  // Điểm quá mua RSI
  if (rsi14 && rsi14 >= 75) riskScore += 15;
  else if (rsi14 && rsi14 >= 70) riskScore += 10;

  riskScore = Math.min(100, riskScore);

  // 6. Phân loại mức độ rủi ro vi cấu trúc T+2
  let level: T2RiskLevel = "SAFE";
  let levelVi = "An toàn";
  let badgeColor = "emerald";
  let warningTitle = "Nền giá an toàn";
  let warningMessage = "Cổ phiếu nằm trong vùng tích lũy hợp lý, rủi ro điều chỉnh T+2 thấp.";
  let recommendedAction = "Có thể mở vị thế mua thăm dò theo đúng tỷ trọng danh mục.";

  const isOverextended =
    (consecutiveUpDays >= 3 && cumulativeRunGainPct >= 7.5) ||
    distanceFromMa20Pct >= 8.5 ||
    riskScore >= 70;

  if (isOverextended || riskScore >= 75) {
    level = "CRITICAL_T2_TRAP";
    levelVi = "CẢNH BÁO KẸP HÀNG T+2";
    badgeColor = "rose";
    warningTitle = "⚠️ BẪY MUA ĐUỔI - RỦI RO KẸP HÀNG T+2 CỰC CAO";
    warningMessage = `Cổ phiếu đã tăng rướn ${consecutiveUpDays} phiên liên tiếp (+${cumulativeRunGainPct.toFixed(1)}%) và cách nền MA20 tới +${distanceFromMa20Pct.toFixed(1)}%. Với quy chế T+2.5 của TTCK VN, người mua T0 hôm nay sẽ đối mặt áp lực chốt lời ồ ạt từ lượng hàng giá rẻ về tài khoản vào 13:00 chiều T+2!`;
    recommendedAction = "TUYỆT ĐỐI KHÔNG MUA ĐUỔI GIÁ XANH/TÍM. Ưu tiên canh chốt lời từng phần hoặc kiên nhẫn chờ nhịp rũ bỏ test lại hỗ trợ.";
  } else if (riskScore >= 50 || consecutiveUpDays >= 3 || cumulativeRunGainPct >= 6.0) {
    level = "ELEVATED";
    levelVi = "Rủi ro rướn cao";
    badgeColor = "amber";
    warningTitle = "Cảnh giác nhịp rung lắc T+2";
    warningMessage = `Cổ phiếu đang bước vào nhịp tăng rướn (+${cumulativeRunGainPct.toFixed(1)}%). Biên độ lợi nhuận ngắn hạn bị thu hẹp đáng kể so với rủi ro điều chỉnh.`;
    recommendedAction = "Hạn chế mua mới. Chỉ nắm giữ theo dõi trailing stop-loss.";
  } else if (riskScore >= 25) {
    level = "MODERATE";
    levelVi = "Vừa phải";
    badgeColor = "cyan";
    warningTitle = "Đà tăng trong kiểm soát";
    warningMessage = "Cổ phiếu đang duy trì xu hướng tăng bình thường, chưa bị kéo rướn quá mức.";
    recommendedAction = "Có thể giải ngân khi cổ phiếu có nhịp rung lắc tích lũy lành mạnh.";
  }

  return {
    symbol: sym,
    level,
    levelVi,
    consecutiveUpDays,
    cumulativeRunGainPct: Math.round(cumulativeRunGainPct * 10) / 10,
    distanceFromMa10Pct: Math.round(distanceFromMa10Pct * 10) / 10,
    distanceFromMa20Pct: Math.round(distanceFromMa20Pct * 10) / 10,
    currentRsi14: rsi14,
    volumeSurgeRatio,
    isOverextended,
    score: riskScore,
    badgeColor,
    warningTitle,
    warningMessage,
    recommendedAction,
  };
}
