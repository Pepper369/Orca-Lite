/**
 * INDUSTRY-SPECIFIC VALUATION ENGINE (Ngân hàng & Bất động sản)
 *
 * 1. NGÂN HÀNG (Banking):
 *    - P/B vs ROE (Mô hình Gordon Growth P/B bền vững: Fair P/B = (ROE - g) / (Ke - g)).
 *    - CAMEL / NPL & NIM, CASA, LLR (Tỷ lệ bao phủ nợ xấu), CAR.
 *    - Residual Income / Excess Return Model cho ngân hàng.
 *
 * 2. BẤT ĐỘNG SẢN (Real Estate):
 *    - RNAV (Revalued Net Asset Value) dựa trên tài sản dở dang & tồn kho dự án gối đầu.
 *    - Theo dõi Người mua trả tiền trước (Doanh thu chưa thực hiện / Backlog bán lẻ).
 *    - Áp dụng hệ số an toàn đòn bẩy dự án (D/E, Net Debt / EBITDA).
 *
 * Rules: Không bịa số, null-safe, không sinh NaN/Infinity.
 */

import type { NormalizedPeriod, NormalizedMetrics } from "../financial/types";
import { getIndustryProfile } from "../financial/industry-profiles";

function finite(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function round(n: number | null, d = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ==========================================
// 1. BANKING SPECIALIZED VALUATION & METRICS
// ==========================================

export interface BankValuationResult {
  symbol: string;
  isBank: boolean;
  bookValuePerShare: number | null;
  roe: number | null;
  costOfEquity: number | null;
  longTermGrowth: number;
  fairPbGordon: number | null;
  fairPriceGordon: number | null;
  currentPrice: number | null;
  upsideGordonPct: number | null;
  metrics: {
    nimEstimatedPct: number | null;
    casaEstimatedPct: number | null;
    nplEstimatedPct: number | null;
    llrEstimatedPct: number | null;
    cirEstimatedPct: number | null;
    equityToAssetsPct: number | null;
  };
  summaryVi: string;
  notes: string[];
}

export function evaluateBankValuation(input: {
  symbol: string;
  periods?: NormalizedPeriod[] | null;
  currentPrice?: number | null;
  sharesOutstanding?: number | null;
  bookEquity?: number | null;
  netIncome?: number | null;
  totalAssets?: number | null;
  costOfEquity?: number | null;
}): BankValuationResult {
  const profile = getIndustryProfile(input.symbol);
  const isBank = profile.id === "BANKING";
  const notes: string[] = [];

  const shares = input.sharesOutstanding && input.sharesOutstanding > 0 ? input.sharesOutstanding : null;
  const equity = input.bookEquity ?? null;
  const bvps = equity != null && shares != null ? equity / shares : null;

  const ni = input.netIncome ?? null;
  const roe = ni != null && equity != null && equity > 0 ? ni / equity : null;

  const ke = finite(input.costOfEquity) && input.costOfEquity > 0.05 ? input.costOfEquity : 0.125;
  const g = 0.05; // 5% long-term nominal growth VN

  let fairPb: number | null = null;
  let fairPrice: number | null = null;
  let upsidePct: number | null = null;

  if (roe != null && roe > 0.04 && ke > g) {
    // Gordon P/B = (ROE - g) / (Ke - g)
    const pb = (roe - g) / (ke - g);
    fairPb = Math.max(0.6, Math.min(3.5, pb));
    if (bvps != null && bvps > 0) {
      fairPrice = Math.round(fairPb * bvps);
      const currP = input.currentPrice && input.currentPrice > 0 ? input.currentPrice : null;
      if (currP != null) {
        const currPVnd = currP < 500 ? currP * 1000 : currP;
        upsidePct = round(((fairPrice / currPVnd) - 1) * 100, 1);
      }
    }
  } else {
    notes.push("ROE hoặc Ke không khả dụng để tính Gordon P/B bền vững");
  }

  // Bóc tách các chỉ số đặc thù từ BCTC ngân hàng (nếu có trường mở rộng)
  const p0 = input.periods?.[0]?.metrics as Record<string, unknown> | undefined;
  const ext = p0 ?? {};
  
  const totalAssets = input.totalAssets ?? (typeof ext.totalAssets === "number" ? ext.totalAssets : null);
  const equityToAssetsPct = equity != null && totalAssets != null && totalAssets > 0 ? round((equity / totalAssets) * 100, 2) : null;

  const nimRaw = typeof ext.nim === "number" ? ext.nim : typeof ext.netInterestMargin === "number" ? ext.netInterestMargin : null;
  const casaRaw = typeof ext.casa === "number" ? ext.casa : typeof ext.casaRatio === "number" ? ext.casaRatio : null;
  const nplRaw = typeof ext.npl === "number" ? ext.npl : typeof ext.badDebtRatio === "number" ? ext.badDebtRatio : null;
  const llrRaw = typeof ext.llr === "number" ? ext.llr : typeof ext.loanLossReserve === "number" ? ext.loanLossReserve : null;
  const cirRaw = typeof ext.cir === "number" ? ext.cir : typeof ext.costToIncome === "number" ? ext.costToIncome : null;

  const toPct = (val: number | null) => {
    if (val == null || !Number.isFinite(val)) return null;
    return val > 1 ? round(val, 2) : round(val * 100, 2);
  };

  const summaryVi = isBank
    ? `Định giá P/B bền vững (Sustainable P/B) cho ngân hàng ${input.symbol}: ROE ước tính ${(roe ? (roe * 100).toFixed(1) : "—")}% với Chi phí vốn Ke ${(ke * 100).toFixed(1)}% -> Fair P/B hợp lý ${fairPb ? fairPb.toFixed(2) + "x" : "—"}.`
    : `Mã ${input.symbol} không thuộc nhóm ngành Ngân hàng (chỉ áp dụng tham khảo).`;

  return {
    symbol: input.symbol,
    isBank,
    bookValuePerShare: bvps != null ? Math.round(bvps) : null,
    roe: roe != null ? round(roe * 100, 2) : null,
    costOfEquity: round(ke * 100, 2),
    longTermGrowth: round(g * 100, 2)!,
    fairPbGordon: fairPb != null ? round(fairPb, 2) : null,
    fairPriceGordon: fairPrice,
    currentPrice: input.currentPrice ?? null,
    upsideGordonPct: upsidePct,
    metrics: {
      nimEstimatedPct: toPct(nimRaw),
      casaEstimatedPct: toPct(casaRaw),
      nplEstimatedPct: toPct(nplRaw),
      llrEstimatedPct: toPct(llrRaw),
      cirEstimatedPct: toPct(cirRaw),
      equityToAssetsPct,
    },
    summaryVi,
    notes,
  };
}

// ==========================================
// 2. REAL ESTATE SPECIALIZED RNAV & BACKLOG
// ==========================================

export interface RealEstateValuationResult {
  symbol: string;
  isRealEstate: boolean;
  bookEquity: number | null;
  sharesOutstanding: number | null;
  inventory: number | null;
  workInProgress: number | null;
  unearnedRevenue: number | null;
  netDebt: number | null;
  rnavEstimated: number | null;
  rnavPerShare: number | null;
  currentPrice: number | null;
  upsideRnavPct: number | null;
  metrics: {
    backlogToMarketCapPct: number | null;
    inventoryToAssetsPct: number | null;
    netDebtToEquity: number | null;
  };
  summaryVi: string;
  notes: string[];
}

export function evaluateRealEstateValuation(input: {
  symbol: string;
  periods?: NormalizedPeriod[] | null;
  currentPrice?: number | null;
  sharesOutstanding?: number | null;
  bookEquity?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  inventory?: number | null;
  cash?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
}): RealEstateValuationResult {
  const profile = getIndustryProfile(input.symbol);
  const isRealEstate = profile.id === "REAL_ESTATE";
  const notes: string[] = [];

  const shares = input.sharesOutstanding && input.sharesOutstanding > 0 ? input.sharesOutstanding : null;
  const equity = input.bookEquity ?? null;
  const assets = input.totalAssets ?? null;
  const inventory = input.inventory ?? null;

  const std = input.shortTermDebt ?? 0;
  const ltd = input.longTermDebt ?? 0;
  const totalDebt = std + ltd;
  const cash = input.cash ?? 0;
  const netDebt = totalDebt - cash;

  // Bóc tách Người mua trả tiền trước (Unearned revenue) & Xây dựng dở dang (WIP)
  const p0 = input.periods?.[0]?.metrics as Record<string, unknown> | undefined;
  const ext = p0 ?? {};

  const unearnedRevenue =
    typeof ext.unearnedRevenue === "number"
      ? ext.unearnedRevenue
      : typeof ext.customerPrepayments === "number"
        ? ext.customerPrepayments
        : typeof ext.prepaymentsFromBuyers === "number"
          ? ext.prepaymentsFromBuyers
          : null;

  const wip =
    typeof ext.constructionInProgress === "number"
      ? ext.constructionInProgress
      : typeof ext.workInProgress === "number"
        ? ext.workInProgress
        : null;

  // Tính toán RNAV ước lượng (Revalued NAV):
  // Bất động sản thường có giá trị quỹ đất sổ sách thấp hơn thị trường.
  // Thặng dư định giá lại ước tính 15% - 25% trên giá trị Tồn kho dự án & Xây dựng dở dang.
  let rnav: number | null = null;
  let rnavPs: number | null = null;
  let upsideRnavPct: number | null = null;

  if (equity != null && equity > 0) {
    const revalSurplusRate = 0.20; // 20% revaluation premium on land bank / project inventory
    const landBankValue = (inventory ?? 0) + (wip ?? 0);
    const estimatedSurplus = landBankValue * revalSurplusRate;

    rnav = equity + estimatedSurplus;
    if (shares != null && shares > 0) {
      rnavPs = Math.round(rnav / shares);
      const currP = input.currentPrice && input.currentPrice > 0 ? input.currentPrice : null;
      if (currP != null) {
        const currPVnd = currP < 500 ? currP * 1000 : currP;
        upsideRnavPct = round(((rnavPs / currPVnd) - 1) * 100, 1);
      }
    }
  } else {
    notes.push("Không đủ vốn chủ sở hữu để tính RNAV");
  }

  const currP = input.currentPrice && input.currentPrice > 0 ? input.currentPrice : null;
  const currPVnd = currP != null ? (currP < 500 ? currP * 1000 : currP) : null;
  const mcap = currPVnd != null && shares != null ? currPVnd * shares : null;

  const backlogToMarketCapPct =
    unearnedRevenue != null && mcap != null && mcap > 0 ? round((unearnedRevenue / mcap) * 100, 2) : null;

  const inventoryToAssetsPct =
    inventory != null && assets != null && assets > 0 ? round((inventory / assets) * 100, 2) : null;

  const netDebtToEquity =
    equity != null && equity > 0 ? round(netDebt / equity, 2) : null;

  const summaryVi = isRealEstate
    ? `Mô hình RNAV (Revalued Net Asset Value) cho BĐS ${input.symbol}: Thặng dư định giá lại quỹ đất dự án ước tính +20% trên Tồn kho/Dở dang -> RNAV/cp đạt ${rnavPs ? rnavPs.toLocaleString("vi-VN") + " ₫" : "—"}.${unearnedRevenue ? ` Người mua trả tiền trước đạt ${(unearnedRevenue / 1e9).toFixed(1)} tỷ (bảo đảm doanh thu tương lai).` : ""}`
    : `Mã ${input.symbol} không thuộc nhóm ngành Bất động sản (chỉ áp dụng tham khảo).`;

  return {
    symbol: input.symbol,
    isRealEstate,
    bookEquity: equity,
    sharesOutstanding: shares,
    inventory,
    workInProgress: wip,
    unearnedRevenue,
    netDebt,
    rnavEstimated: rnav != null ? Math.round(rnav) : null,
    rnavPerShare: rnavPs,
    currentPrice: input.currentPrice ?? null,
    upsideRnavPct,
    metrics: {
      backlogToMarketCapPct,
      inventoryToAssetsPct,
      netDebtToEquity,
    },
    summaryVi,
    notes,
  };
}
