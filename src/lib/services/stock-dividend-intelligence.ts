import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVndCorporateEvents } from "../providers/vndirect-events";
import { getMultiQuotes } from "./multi-quote";
import type { Meta } from "../types";

const TTL_MS = 30 * 60_000; // 30 mins cache
const STALE_MS = 24 * 60 * 60_000;

export interface YearlyDividendSummary {
  year: number;
  cashVndPerShare: number;
  stockDividendRatioPct: number;
  eventsCount: number;
}

export interface DividendEventDetail {
  id: string;
  type: "CASH" | "STOCK" | "OTHER";
  typeDesc: string;
  amountVnd: number | null;
  ratioPct: number | null;
  year: number | null;
  effectiveDate: string | null; // Ngày GDKHQ
  actualDate: string | null;    // Ngày thanh toán
  disclosureDate: string | null;
  note: string | null;
}

export interface DividendIntelligenceResult {
  symbol: string;
  currentPrice: number;
  asOfDate: string;
  metrics: {
    cashDividend12mVnd: number;
    dividendYieldPct: number;
    avgYield3yPct: number;
    bankSavingRate12mPct: number;
    spreadOverBankRatePct: number;
    assessment: "HIGH_YIELD" | "MODERATE" | "LOW" | "NO_DIVIDEND";
    assessmentVi: string;
    consistencyScore: number; // 0 - 100
  };
  upcomingDividends: DividendEventDetail[];
  yearlyHistory: YearlyDividendSummary[];
  allEvents: DividendEventDetail[];
}

export async function getStockDividendIntelligence(
  symbol: string
): Promise<{ data: DividendIntelligenceResult; meta: Meta }> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cacheKey = `stock:dividends:intel:${sym}`;

  const res = await cached(cacheKey, {
    ttlMs: TTL_MS,
    staleMs: STALE_MS,
    producer: async (): Promise<DividendIntelligenceResult> => {
      // 1. Tải danh sách sự kiện cổ tức từ VNDirect
      const evRes = await getVndCorporateEvents(sym, { size: 50 });
      const rawDividends = evRes.dividends || [];

      // 2. Lấy thị giá hiện tại
      let currentPrice = 30000;
      try {
        const mq = await getMultiQuotes([sym]);
        const q = mq.quotes.find((item) => item.symbol === sym);
        if (q?.price && q.price > 0) {
          // Quy đổi về đơn vị đồng (VND)
          currentPrice = q.price >= 1000 ? q.price : q.price * 1000;
        }
      } catch {
        /* fallback */
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const allEvents: DividendEventDetail[] = [];
      const upcomingDividends: DividendEventDetail[] = [];
      const yearMap = new Map<number, { cash: number; stock: number; count: number }>();

      let cash12m = 0;
      const oneYearAgoMs = Date.now() - 365 * 86400 * 1000;

      for (const ev of rawDividends) {
        const isCash = ev.type === "DIVIDEND" || /tiền|cash/i.test(ev.typeDesc || "") || (ev.dividend != null && ev.dividend > 0);
        const isStock = ev.type === "STOCK_DIVIDEND" || /cổ phiếu|stock/i.test(ev.typeDesc || "") || /thưởng/i.test(ev.typeDesc || "");

        const detail: DividendEventDetail = {
          id: ev.id,
          type: isCash ? "CASH" : isStock ? "STOCK" : "OTHER",
          typeDesc: ev.typeDesc || (isCash ? "Cổ tức tiền mặt" : "Cổ tức cổ phiếu"),
          amountVnd: ev.dividend,
          ratioPct: ev.ratio,
          year: ev.divYear,
          effectiveDate: ev.effectiveDate,
          actualDate: ev.actualDate,
          disclosureDate: ev.disclosureDate,
          note: ev.note,
        };

        allEvents.push(detail);

        // Kiểm tra sự kiện sắp tới (chưa đến ngày GDKHQ hoặc chưa đến ngày thanh toán)
        const effDate = ev.effectiveDate || ev.actualDate;
        if (effDate && effDate >= todayStr) {
          upcomingDividends.push(detail);
        }

        // Tính cổ tức tiền mặt 12 tháng gần nhất
        if (isCash && ev.dividend && ev.effectiveDate) {
          const effMs = Date.parse(`${ev.effectiveDate}T15:00:00+07:00`);
          if (Number.isFinite(effMs) && effMs >= oneYearAgoMs) {
            cash12m += ev.dividend;
          }
        }

        // Gom theo năm tài chính divYear hoặc năm effectiveDate
        const yr = ev.divYear || (ev.effectiveDate ? Number(ev.effectiveDate.slice(0, 4)) : null);
        if (yr && yr >= 2018 && yr <= 2026) {
          const prev = yearMap.get(yr) || { cash: 0, stock: 0, count: 0 };
          if (isCash && ev.dividend) prev.cash += ev.dividend;
          if (isStock && ev.ratio) prev.stock += ev.ratio;
          prev.count++;
          yearMap.set(yr, prev);
        }
      }

      // 3. Tính toán các chỉ số Dividend Yield & Đánh giá
      const dividendYieldPct = currentPrice > 0 ? Math.round((cash12m / currentPrice) * 10000) / 100 : 0;

      // Tính bình quân 3 năm
      const currentYear = new Date().getFullYear();
      let sum3y = 0;
      let yearsCounted = 0;
      for (let y = currentYear - 3; y < currentYear; y++) {
        const rec = yearMap.get(y);
        if (rec) {
          sum3y += rec.cash;
          yearsCounted++;
        }
      }
      const avgCash3y = yearsCounted > 0 ? sum3y / yearsCounted : cash12m;
      const avgYield3yPct = currentPrice > 0 ? Math.round((avgCash3y / currentPrice) * 10000) / 100 : 0;

      const bankSavingRate12mPct = 5.2; // Lãi suất tiền gửi 12 tháng bình quân Big4 NH
      const spreadOverBankRatePct = Math.round((dividendYieldPct - bankSavingRate12mPct) * 100) / 100;

      let assessment: "HIGH_YIELD" | "MODERATE" | "LOW" | "NO_DIVIDEND" = "MODERATE";
      let assessmentVi = "Tỷ suất cổ tức ở mức trung bình so với thị trường";

      if (dividendYieldPct >= 6.5) {
        assessment = "HIGH_YIELD";
        assessmentVi = "Tỷ suất cổ tức tiền mặt HẤP DẪN — Vượt trội lãi suất tiền gửi ngân hàng 🌟";
      } else if (dividendYieldPct >= 4.0) {
        assessment = "MODERATE";
        assessmentVi = "Cổ tức tiền mặt tương đương gửi tiết kiệm, có giá trị tích sản phòng thủ 🛡️";
      } else if (dividendYieldPct > 0) {
        assessment = "LOW";
        assessmentVi = "Doanh nghiệp ưu tiên giữ lại lợi nhuận tái đầu tư tăng trưởng 🚀";
      } else {
        assessment = "NO_DIVIDEND";
        assessmentVi = "Không phát sinh cổ tức tiền mặt trong 12 tháng qua";
      }

      // Điểm đều đặn chi trả (Consistency Score)
      const yearsWithDiv = [...yearMap.keys()].filter((y) => (yearMap.get(y)?.cash || 0) > 0 || (yearMap.get(y)?.stock || 0) > 0).length;
      const consistencyScore = Math.min(100, Math.round((yearsWithDiv / 5) * 100));

      // Lịch sử theo năm sắp xếp giảm dần
      const yearlyHistory: YearlyDividendSummary[] = [...yearMap.entries()]
        .map(([year, val]) => ({
          year,
          cashVndPerShare: val.cash,
          stockDividendRatioPct: val.stock,
          eventsCount: val.count,
        }))
        .sort((a, b) => b.year - a.year);

      return {
        symbol: sym,
        currentPrice,
        asOfDate: todayStr,
        metrics: {
          cashDividend12mVnd: cash12m,
          dividendYieldPct,
          avgYield3yPct,
          bankSavingRate12mPct,
          spreadOverBankRatePct,
          assessment,
          assessmentVi,
          consistencyScore,
        },
        upcomingDividends,
        yearlyHistory,
        allEvents: allEvents.slice(0, 20),
      };
    },
  });

  const meta = buildMeta({
    source: "dividend-intelligence-engine",
    sourceTimestampMs: Date.now(),
    cached: res.cached,
    stale: res.stale,
    note: `Phân hệ cổ tức & tỷ suất Dividend Yield ${sym}.`,
  });

  return { data: res.value, meta };
}
