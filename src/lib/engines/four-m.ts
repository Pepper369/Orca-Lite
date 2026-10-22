export interface FourMScore {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  price?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  
  // 4 Pillars
  m1MeaningScore: number;
  m1MeaningPass: boolean;
  m1Note: string;
  
  m2MoatScore: number;
  m2MoatPass: boolean;
  m2Note: string;
  
  m3ManagementScore: number;
  m3ManagementPass: boolean;
  m3Note: string;
  
  m4MarginOfSafetyScore: number;
  m4MarginOfSafetyPass: boolean;
  m4Note: string;
  
  // Total
  totalScore: number;
  grade: "Diamond" | "Gold" | "Silver" | "Bronze";
  gradeVi: string;
  passedPillarsCount: number;
  
  // Key Metrics
  roe: number | null;
  roic: number | null;
  grossMargin: number | null;
  debtEquity: number | null;
  pe: number | null;
  pb: number | null;
  revenueYoyPct: number | null;
  niYoyPct: number | null;
}

export function evaluateFourM(row: {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  price?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  roe?: number | null;
  roic?: number | null;
  grossMargin?: number | null;
  debtEquity?: number | null;
  currentRatio?: number | null;
  revenueYoyPct?: number | null;
  niYoyPct?: number | null;
  pe?: number | null;
  pb?: number | null;
}): FourMScore {
  // 1. Meaning (Ý nghĩa): Doanh nghiệp có mô hình kinh doanh thiết yếu, minh bạch
  let m1Score = 15;
  const coreSectors = ["Ngân hàng", "Công nghệ", "Bán lẻ", "Thép", "Thực phẩm & Đồ uống", "Dược phẩm & Y tế", "Bất động sản"];
  if (row.sector && coreSectors.includes(row.sector)) {
    m1Score = 25;
  } else if (row.sector) {
    m1Score = 20;
  }
  const m1Pass = m1Score >= 20;
  const m1Note = m1Pass ? "Ngành kinh doanh cốt lõi, chu kỳ minh bạch" : "Ngành kinh doanh phụ thuộc biến động";

  // 2. Moat (Con hào kinh tế): ROE > 15%, Biên lợi nhuận gộp cao, Tăng trưởng dương
  let m2Score = 0;
  const roe = row.roe ?? 0;
  if (roe >= 20) m2Score += 12;
  else if (roe >= 15) m2Score += 9;
  else if (roe >= 10) m2Score += 5;

  const gm = row.grossMargin ?? 0;
  if (gm >= 25) m2Score += 7;
  else if (gm >= 15) m2Score += 4;

  const revGrowth = row.revenueYoyPct ?? 0;
  if (revGrowth >= 12) m2Score += 6;
  else if (revGrowth > 0) m2Score += 3;

  const m2Pass = m2Score >= 16;
  const m2Note = `ROE: ${roe.toFixed(1)}% · Biên gộp: ${gm.toFixed(1)}% · Tăng trưởng DT: ${revGrowth.toFixed(1)}%`;

  // 3. Management (Ban lãnh đạo & Sức khỏe tài chính): Nợ/Vốn D/E thấp, ROIC tốt
  let m3Score = 0;
  const de = row.debtEquity ?? 1.5;
  if (de <= 0.8) m3Score += 12;
  else if (de <= 1.2) m3Score += 8;
  else if (de <= 2.0) m3Score += 4;

  const roic = row.roic ?? 0;
  if (roic >= 15) m3Score += 7;
  else if (roic >= 10) m3Score += 4;

  const cr = row.currentRatio ?? 1.0;
  if (cr >= 1.5) m3Score += 6;
  else if (cr >= 1.1) m3Score += 3;

  const m3Pass = m3Score >= 15;
  const m3Note = `D/E: ${de.toFixed(2)} · ROIC: ${roic.toFixed(1)}% · Thanh toán hiện hành: ${cr.toFixed(2)}`;

  // 4. Margin of Safety (Biên an toàn định giá): P/E và P/B hợp lý
  let m4Score = 0;
  const pe = row.pe ?? 18;
  if (pe > 0 && pe <= 12) m4Score += 13;
  else if (pe > 0 && pe <= 16) m4Score += 9;
  else if (pe > 0 && pe <= 20) m4Score += 5;

  const pb = row.pb ?? 2.5;
  if (pb > 0 && pb <= 1.5) m4Score += 12;
  else if (pb > 0 && pb <= 2.2) m4Score += 8;
  else if (pb > 0 && pb <= 3.0) m4Score += 4;

  const m4Pass = m4Score >= 15;
  const m4Note = `P/E: ${pe > 0 ? pe.toFixed(1) : "—"} · P/B: ${pb > 0 ? pb.toFixed(1) : "—"}`;

  const totalScore = m1Score + m2Score + m3Score + m4Score;
  const passedPillarsCount = [m1Pass, m2Pass, m3Pass, m4Pass].filter(Boolean).length;

  let grade: "Diamond" | "Gold" | "Silver" | "Bronze" = "Bronze";
  let gradeVi = "Hạng Đồng";
  if (totalScore >= 80) {
    grade = "Diamond";
    gradeVi = "Kim Cương";
  } else if (totalScore >= 65) {
    grade = "Gold";
    gradeVi = "Hạng Vàng";
  } else if (totalScore >= 50) {
    grade = "Silver";
    gradeVi = "Hạng Bạc";
  }

  return {
    symbol: row.symbol,
    name: row.name ?? null,
    sector: row.sector ?? null,
    price: row.price ?? null,
    changePercent: row.changePercent ?? null,
    volume: row.volume ?? null,
    m1MeaningScore: m1Score,
    m1MeaningPass: m1Pass,
    m1Note,
    m2MoatScore: m2Score,
    m2MoatPass: m2Pass,
    m2Note,
    m3ManagementScore: m3Score,
    m3ManagementPass: m3Pass,
    m3Note,
    m4MarginOfSafetyScore: m4Score,
    m4MarginOfSafetyPass: m4Pass,
    m4Note,
    totalScore,
    grade,
    gradeVi,
    passedPillarsCount,
    roe: row.roe ?? null,
    roic: row.roic ?? null,
    grossMargin: row.grossMargin ?? null,
    debtEquity: row.debtEquity ?? null,
    pe: row.pe ?? null,
    pb: row.pb ?? null,
    revenueYoyPct: row.revenueYoyPct ?? null,
    niYoyPct: row.niYoyPct ?? null,
  };
}
