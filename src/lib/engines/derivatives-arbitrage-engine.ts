import { getVnIndices, getVnOhlcv } from "../services/stocks-board";
import { getDerivativeContractDetail, resolveVn30Spot } from "../services/derivatives";
import { getDerivHistory, recordDerivSample } from "../services/derivatives-history";
import { getEconomyBundle } from "../services/economy";
import { normalizeEconomicText } from "../economic-data";
import {
  calibrateBasisOrnsteinUhlenbeck,
  type OUBasisCalibration,
} from "./unified-cross-asset-quant";

export interface DerivativesArbitrageSignal {
  symbol: string;
  underlyingSymbol: string;
  derivativePrice: number | null;
  underlyingIndexPrice: number | null;
  basis: number | null; // derivativePrice - underlyingIndexPrice
  basisPct: number | null;
  fairValuePrice: number | null;
  mispricing: number | null; // derivativePrice - fairValuePrice
  carryRatePct: number;
  carryRateSource: "LIVE_ECONOMY_ADJUSTED" | "BASELINE_ASSUMPTION";
  provenance: "LIVE_QUOTE" | "HISTORICAL_BARS" | "UNAVAILABLE";
  isUnavailable?: boolean;
  ouDtMinutes: number;
  marketState: "CONTANGO_HIGH" | "CONTANGO_MODERATE" | "FAIR_VALUE" | "BACKWARDATION_MODERATE" | "BACKWARDATION_DEEP" | "UNAVAILABLE";
  stateDescription: string;
  arbitrageRecommendation: {
    action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION";
    actionTitleVi: string;
    description: string;
    expectedGainPts: number;
  };
  ouCalibration?: OUBasisCalibration;
  daysToExpiry: number;
  expiryDateStr: string;
  updatedAt: string;
}

function normalizeEpochMsLocal(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function inferMedianDtMinutes(timestampsMs: number[], fallbackMinutes: number): number {
  if (timestampsMs.length < 2) return fallbackMinutes;
  const deltas: number[] = [];
  for (let i = 1; i < timestampsMs.length; i++) {
    const diff = timestampsMs[i]! - timestampsMs[i - 1]!;
    if (Number.isFinite(diff) && diff > 0) {
      deltas.push(diff / 60_000);
    }
  }
  if (!deltas.length) return fallbackMinutes;
  deltas.sort((a, b) => a - b);
  const mid = deltas[Math.floor(deltas.length / 2)]!;
  return Math.max(0.25, Math.round(mid * 10) / 10);
}

function getNextThirdThursday(): { days: number; dateStr: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Find 3rd Thursday of current month
  let firstDay = new Date(year, month, 1);
  let thursdayCount = 0;
  let targetDate = new Date(year, month, 1);

  for (let day = 1; day <= 31; day++) {
    const cur = new Date(year, month, day);
    if (cur.getMonth() !== month) break;
    if (cur.getDay() === 4) { // Thursday
      thursdayCount++;
      if (thursdayCount === 3) {
        targetDate = cur;
        break;
      }
    }
  }

  // If already passed this month's 3rd Thursday, take next month's
  if (now > targetDate) {
    const nextMonth = (month + 1) % 12;
    const nextYear = nextMonth === 0 ? year + 1 : year;
    thursdayCount = 0;
    for (let day = 1; day <= 31; day++) {
      const cur = new Date(nextYear, nextMonth, day);
      if (cur.getMonth() !== nextMonth) break;
      if (cur.getDay() === 4) {
        thursdayCount++;
        if (thursdayCount === 3) {
          targetDate = cur;
          break;
        }
      }
    }
  }

  const diffMs = targetDate.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return { days, dateStr: targetDate.toISOString().slice(0, 10) };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function getDerivativesArbitrageSignal(
  symbol = "VN30F1M",
  historicalBasisSeries?: number[],
  explicitDtMinutes?: number,
): Promise<DerivativesArbitrageSignal> {
  const sym = symbol.toUpperCase();

  // 1. Fetch live quotes & macro interest rate concurrently with strict timeouts (never invent prices)
  const [contractPack, indicesPack, economyPack, futOhlcvPack, spotOhlcvPack] = await Promise.all([
    withTimeout(getDerivativeContractDetail(sym), 2000, null).catch(() => null),
    withTimeout(getVnIndices(), 2000, null).catch(() => null),
    withTimeout(getEconomyBundle(), 1500, null).catch(() => null),
    withTimeout(getVnOhlcv(sym, 45), 2000, null).catch(() => null),
    withTimeout(getVnOhlcv("VN30", 45, "index"), 2000, null).catch(() => null),
  ]);

  const contractQuote = contractPack?.data?.quote;
  const vn30Item = indicesPack?.items?.find(
    (i) => (i.code ?? (i as { symbol?: string }).symbol ?? "").toUpperCase() === "VN30",
  );
  const spotFallback =
    contractPack?.data?.spot?.price ??
    (vn30Item?.value && vn30Item.value > 0
      ? vn30Item.value
      : (await withTimeout(resolveVn30Spot(), 1500, null).catch(() => null))?.price ?? null);

  const futBars = futOhlcvPack?.bars ?? [];
  const spotBars = spotOhlcvPack?.bars ?? [];

  let provenance: DerivativesArbitrageSignal["provenance"] = "LIVE_QUOTE";
  let fPrice: number | null =
    contractQuote?.last != null && Number.isFinite(contractQuote.last) && contractQuote.last > 0
      ? contractQuote.last
      : null;
  let cashPrice: number | null =
    spotFallback != null && Number.isFinite(spotFallback) && spotFallback > 0 ? spotFallback : null;

  if (fPrice == null && futBars.length > 0) {
    const lastFut = futBars[futBars.length - 1]!.close;
    if (Number.isFinite(lastFut) && lastFut > 0) {
      fPrice = lastFut;
      provenance = "HISTORICAL_BARS";
    }
  }
  if (cashPrice == null && spotBars.length > 0) {
    const lastSpot = spotBars[spotBars.length - 1]!.close;
    if (Number.isFinite(lastSpot) && lastSpot > 0) {
      cashPrice = lastSpot;
      provenance = "HISTORICAL_BARS";
    }
  }

  const { days, dateStr } = getNextThirdThursday();

  // Derive net cost-of-carry rate from live interbank/deposit rate minus assumed dividend yield (1.5%/yr)
  let carryRate = 0.03;
  let carryRateSource: DerivativesArbitrageSignal["carryRateSource"] = "BASELINE_ASSUMPTION";
  const rateRows = economyPack?.rate?.data?.rows ?? [];
  const fundingRow =
    rateRows.find((r) => normalizeEconomicText(r.name).includes("lien ngan hang 1 thang")) ??
    rateRows.find((r) => normalizeEconomicText(r.name).includes("lien ngan hang qua dem")) ??
    rateRows.find((r) => normalizeEconomicText(r.name).includes("tai cap von"));
  if (fundingRow?.current?.value != null && Number.isFinite(fundingRow.current.value) && fundingRow.current.value > 0) {
    const repoRate = fundingRow.current.value / 100;
    const estDivYield = 0.015;
    carryRate = Math.max(-0.02, Math.min(0.12, repoRate - estDivYield));
    carryRateSource = "LIVE_ECONOMY_ADJUSTED";
  }

  if (fPrice == null || cashPrice == null) {
    provenance = "UNAVAILABLE";
    return {
      symbol: sym,
      underlyingSymbol: "VN30",
      derivativePrice: fPrice,
      underlyingIndexPrice: cashPrice,
      basis: null,
      basisPct: null,
      fairValuePrice: null,
      mispricing: null,
      carryRatePct: Number((carryRate * 100).toFixed(2)),
      carryRateSource,
      provenance,
      isUnavailable: true,
      ouDtMinutes: explicitDtMinutes ?? 1,
      marketState: "UNAVAILABLE",
      stateDescription: "Chưa đủ báo giá live VN30F / VN30 để định giá Basis chuẩn xác (Truth-in-Data: không tự bịa giá fallback).",
      arbitrageRecommendation: {
        action: "NO_ACTION",
        actionTitleVi: "Tạm dừng định giá — Thiếu dữ liệu live",
        description: "Hệ thống đang chờ báo giá hợp đồng tương lai và chỉ số cơ sở VN30 từ nguồn dữ liệu chính thống.",
        expectedGainPts: 0,
      },
      daysToExpiry: days,
      expiryDateStr: dateStr,
      updatedAt: new Date().toISOString(),
    };
  }

  const basis = Number((fPrice - cashPrice).toFixed(1));
  const basisPct = Number(((basis / cashPrice) * 100).toFixed(2));
  const timeYear = days / 365;
  const fairValuePrice = Number((cashPrice * (1 + carryRate * timeYear)).toFixed(1));
  const mispricing = Number((fPrice - fairValuePrice).toFixed(1));

  let marketState: DerivativesArbitrageSignal["marketState"] = "FAIR_VALUE";
  let stateDescription = "Thị trường phái sinh đang giao dịch sát vùng cân bằng giá trị lý thuyết.";

  let action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION" = "NO_ACTION";
  let actionTitleVi = "Quan sát / Trạng thái cân bằng";
  let description = "Chênh lệch Basis nằm trong biên độ hẹp an toàn (-3.0 đến +3.0 điểm). Chi phí giao dịch sẽ triệt tiêu lợi nhuận Arbitrage.";
  let expectedGainPts = 0;

  if (basis >= 8.0) {
    marketState = "CONTANGO_HIGH";
    stateDescription = "Phái sinh đang cao hơn cơ sở đáng kể (Contango giãn rộng). Tâm lý đầu cơ Short term quá lạc quan.";
    action = "CASH_AND_CARRY";
    actionTitleVi = "Kinh doanh chênh lệch giá (Cash & Carry Arbitrage)";
    description = `Mở vị thế BÁN (Short) hợp đồng ${sym} quanh ${fPrice} và MUA đồng thời rổ cổ phiếu cơ sở VN30 để khóa mức lợi nhuận cố định khi Basis hội tụ về 0 vào ngày đáo hạn.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis >= 3.0) {
    marketState = "CONTANGO_MODERATE";
    stateDescription = "Thị trường ở trạng thái Contango nhẹ, kỳ vọng chỉ số VN30 tiếp tục duy trì đà tăng trưởng.";
  } else if (basis <= -8.0) {
    marketState = "BACKWARDATION_DEEP";
    stateDescription = "Phái sinh đang chiết khấu sâu so với cơ sở (Backwardation âm lớn). Khối tổ chức đang đẩy mạnh vị thế phòng hộ rủi ro (Hedging).";
    action = "REVERSE_CASH_AND_CARRY";
    actionTitleVi = "Đảo ngược chênh lệch giá (Reverse Cash & Carry)";
    description = `Mở vị thế MUA (Long) hợp đồng ${sym} chiết khấu sâu và BÁN/HẠ TỶ TRỌNG rổ danh mục cơ sở để tận dụng nhịp nảy phục hồi khi Basis thu hẹp.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis <= -3.0) {
    marketState = "BACKWARDATION_MODERATE";
    stateDescription = "Thị trường ở trạng thái Backwardation nhẹ, nhà đầu tư cẩn trọng trước các biến động ngắn hạn.";
  }

  if (contractQuote?.last != null) {
    recordDerivSample({
      symbol: sym,
      ts: Date.now(),
      last: contractQuote.last,
      openInterest: contractQuote.openInterest ?? null,
      volume: contractQuote.volume ?? null,
      basis,
      source: contractQuote.source ?? "derivatives-arbitrage-engine",
    });
  }

  // Continuous Ornstein-Uhlenbeck (OU) Mean-Reversion Calibration with accurate dtMinutes scaling
  let resolvedBasisSeries: number[] = [];
  let resolvedDtMinutes = explicitDtMinutes ?? 1;

  if (historicalBasisSeries && historicalBasisSeries.length >= 15) {
    resolvedBasisSeries = historicalBasisSeries;
    resolvedDtMinutes = explicitDtMinutes ?? 1;
  } else {
    const ringSamples = getDerivHistory(sym, 60).filter(
      (s) => s.basis != null && Number.isFinite(s.basis),
    );
    if (ringSamples.length >= 15) {
      resolvedBasisSeries = ringSamples.map((s) => s.basis as number);
      resolvedDtMinutes = inferMedianDtMinutes(ringSamples.map((s) => s.ts), 1);
    }
  }

  if (resolvedBasisSeries.length < 15 && futBars.length >= 15 && spotBars.length >= 15) {
    const spotByDay = new Map<string, number>();
    for (const b of spotBars) {
      const ms = normalizeEpochMsLocal(b.time);
      spotByDay.set(new Date(ms).toISOString().slice(0, 10), b.close);
    }
    const dailyBasis: number[] = [];
    const dailyTimes: number[] = [];
    for (const b of futBars) {
      const ms = normalizeEpochMsLocal(b.time);
      const sClose = spotByDay.get(new Date(ms).toISOString().slice(0, 10));
      if (sClose != null && Number.isFinite(b.close)) {
        dailyBasis.push(Number((b.close - sClose).toFixed(2)));
        dailyTimes.push(ms);
      }
    }
    if (dailyBasis.length >= 15) {
      dailyBasis[dailyBasis.length - 1] = basis;
      resolvedBasisSeries = dailyBasis;
      // Daily series defaults to 1440 minutes (never erroneously 1 minute)
      resolvedDtMinutes = inferMedianDtMinutes(dailyTimes, 1440);
    }
  }

  let ouCalibration: OUBasisCalibration | undefined;
  if (resolvedBasisSeries.length >= 15) {
    ouCalibration = calibrateBasisOrnsteinUhlenbeck(resolvedBasisSeries, resolvedDtMinutes);
  }

  return {
    symbol: sym,
    underlyingSymbol: "VN30",
    derivativePrice: fPrice,
    underlyingIndexPrice: cashPrice,
    basis,
    basisPct,
    fairValuePrice,
    mispricing,
    carryRatePct: Number((carryRate * 100).toFixed(2)),
    carryRateSource,
    provenance,
    isUnavailable: false,
    ouDtMinutes: resolvedDtMinutes,
    marketState,
    stateDescription,
    arbitrageRecommendation: {
      action,
      actionTitleVi,
      description,
      expectedGainPts,
    },
    ouCalibration,
    daysToExpiry: days,
    expiryDateStr: dateStr,
    updatedAt: new Date().toISOString(),
  };
}
