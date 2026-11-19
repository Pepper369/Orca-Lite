import { resolveIndustryEvalTrack, type IndustryEvalTrack } from "../financial/fa-core";

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
  const track: IndustryEvalTrack = resolveIndustryEvalTrack(row.symbol ?? row.sector);
  const isFinancial = track === "FINANCIAL_BANK_SEC_INS";

  // 1. Meaning (Ý nghĩa & Minh bạch dữ liệu): Đánh giá độ phủ số liệu ngành, không phạt ngành đặc thù
  const availableCoreCount = isFinancial
    ? [row.roe, row.pe, row.pb, row.revenueYoyPct ?? row.niYoyPct].filter((v) => v != null).length
    : [row.roe, row.grossMargin, row.debtEquity, row.pe].filter((v) => v != null).length;
  const m1Score = availableCoreCount >= 4 ? 25 : availableCoreCount >= 3 ? 21 : availableCoreCount >= 2 ? 16 : 10;
  const m1Pass = m1Score >= 20;
  const m1Note = isFinancial
    ? m1Pass
      ? "Tài chính/Ngân hàng — Đủ cấu phần định giá & hiệu quả vốn"
      : "Thiếu dữ liệu BCTC ngành Tài chính"
    : m1Pass
      ? "Minh bạch BCTC & Đủ cấu phần 4M"
      : "Chưa đủ cấu phần BCTC để chấm Meaning trọn vẹn";

  // 2. Moat (Con hào kinh tế): Tài chính dùng ROE + Net/Rev Growth + NI Growth; Phi tài chính dùng ROE + Biên gộp + DT
  let m2Score = 0;
  const roe = row.roe;
  if (roe != null) {
    if (roe >= 20) m2Score += isFinancial ? 14 : 12;
    else if (roe >= 15) m2Score += isFinancial ? 10 : 9;
    else if (roe >= 10) m2Score += isFinancial ? 6 : 5;
  }

  const gm = row.grossMargin;
  const niGrowth = row.niYoyPct;
  const revGrowth = row.revenueYoyPct;
  if (isFinancial) {
    if (niGrowth != null) {
      if (niGrowth >= 15) m2Score += 6;
      else if (niGrowth > 0) m2Score += 3;
    }
    if (revGrowth != null) {
      if (revGrowth >= 12) m2Score += 5;
      else if (revGrowth > 0) m2Score += 3;
    }
  } else {
    if (gm != null) {
      if (gm >= 25) m2Score += 7;
      else if (gm >= 15) m2Score += 4;
    }
    if (revGrowth != null) {
      if (revGrowth >= 12) m2Score += 6;
      else if (revGrowth > 0) m2Score += 3;
    }
  }

  const m2Pass = m2Score >= 16;
  const m2Parts: string[] = [];
  m2Parts.push(roe != null ? `ROE: ${roe.toFixed(1)}%` : "ROE: Chưa có dữ liệu");
  if (!isFinancial) {
    m2Parts.push(gm != null ? `Biên gộp: ${gm.toFixed(1)}%` : "Biên gộp: Chưa có dữ liệu");
  } else if (niGrowth != null) {
    m2Parts.push(`Tăng trưởng LNST: ${niGrowth.toFixed(1)}%`);
  }
  if (revGrowth != null) m2Parts.push(`Tăng trưởng DT: ${revGrowth.toFixed(1)}%`);
  const m2Note = m2Parts.join(" · ");

  // 3. Management (Ban lãnh đạo & Sức khỏe tài chính): Tài chính miễn trừ D/E & CurrentRatio, đánh giá kỷ luật vốn/ROIC proxy
  let m3Score = 0;
  const de = row.debtEquity;
  const roic = row.roic;
  const cr = row.currentRatio;

  if (isFinancial) {
    if (roe != null && roe >= 18) m3Score += 12;
    else if (roe != null && roe >= 13) m3Score += 8;
    else if (roe != null && roe >= 9) m3Score += 4;
    if (niGrowth != null && niGrowth >= 10) m3Score += 8;
    else if (niGrowth != null && niGrowth >= 0) m3Score += 4;
    if (row.pb != null && row.pb > 0 && row.pb <= 2.2) m3Score += 5;
  } else {
    if (de != null) {
      if (de <= 0.8) m3Score += 12;
      else if (de <= 1.2) m3Score += 8;
      else if (de <= 2.0) m3Score += 4;
    }
    if (roic != null) {
      if (roic >= 15) m3Score += 7;
      else if (roic >= 10) m3Score += 4;
    }
    if (cr != null) {
      if (cr >= 1.5) m3Score += 6;
      else if (cr >= 1.1) m3Score += 3;
    }
  }

  const m3Pass = m3Score >= 15;
  const m3Parts: string[] = [];
  if (isFinancial) {
    m3Parts.push("Miễn trừ D/E & Thanh khoản (Nhóm Tài chính)");
    if (roe != null) m3Parts.push(`ROE vốn chủ: ${roe.toFixed(1)}%`);
  } else {
    m3Parts.push(de != null ? `D/E: ${de.toFixed(2)}` : "D/E: Chưa có dữ liệu");
    m3Parts.push(roic != null ? `ROIC: ${roic.toFixed(1)}%` : "ROIC: Chưa có dữ liệu");
    if (cr != null) m3Parts.push(`Thanh toán hiện hành: ${cr.toFixed(2)}`);
  }
  const m3Note = m3Parts.join(" · ");

  // 4. Margin of Safety (Biên an toàn định giá): P/E và P/B hợp lý
  let m4Score = 0;
  const pe = row.pe;
  if (pe != null && pe > 0) {
    if (pe <= 12) m4Score += 13;
    else if (pe <= 16) m4Score += 9;
    else if (pe <= 20) m4Score += 5;
  }

  const pb = row.pb;
  if (pb != null && pb > 0) {
    if (pb <= 1.5) m4Score += 12;
    else if (pb <= 2.2) m4Score += 8;
    else if (pb <= 3.0) m4Score += 4;
  }

  const m4Pass = m4Score >= 15;
  const m4Parts: string[] = [];
  m4Parts.push(pe != null && pe > 0 ? `P/E: ${pe.toFixed(1)}x` : "P/E: Chưa có dữ liệu");
  m4Parts.push(pb != null && pb > 0 ? `P/B: ${pb.toFixed(2)}x` : "P/B: Chưa có dữ liệu");
  const m4Note = m4Parts.join(" · ");

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
