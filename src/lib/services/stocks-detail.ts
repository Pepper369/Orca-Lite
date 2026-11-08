import "server-only";
import { buildMeta } from "../freshness";
import { getFinancialsForSymbol } from "../financial";
import type { FinancialPackageMeta, GrowthSnapshot, NormalizedPeriod } from "../financial/types";
import type { FinancialHealthResult } from "../engines/fundamental";
import * as vndirect from "../providers/vndirect";
import { analyzeSeries, detectPatterns } from "../technical";
import { computeAlphaBeta } from "../engines/alpha-beta";
import type { CandlePattern, Meta, OhlcvBar, Quote, TechnicalSnapshot } from "../types";
import {
  getVndCompanyProfile,
  getVndEquitySnapshot,
  getVndValuationRatios,
  type VndCompanyProfile,
  type VndEquitySnapshot,
  type VndValuationRatios,
} from "../providers/vndirect-company";
import { lookupVndSymbol } from "../providers/vndirect-universe";
import { getVndSymbolForeignFlow } from "../providers/vndirect-foreign-symbol";
import { getVietcapCompany } from "../providers/vietcap";
import { getVpsQuotes, getVpsForeignFlow } from "../providers/vps";
import { getVnOrderBook, type VnOrderBook } from "./stock-orderbook";
import { getVnQuotes, getVnOhlcv } from "./stocks-board";
import { fetchOhlcvResilient } from "./screener-ohlcv";
import { cached } from "../cache";
import { WORKERS_BUDGET } from "../data-engine/workers-budget";
import { analyzeExposure, type ExposureAnalysis } from "./exposure-chain";
import { attributeDrivers, type DriverAttribution } from "./driver-attribution";
import { computeStarRatings, type StarRatings } from "./star-ratings";
import { analyzeMaCandleRow, type MaCandleConfluenceRow } from "../engines/ma-candle-confluence";

export interface ScreenerSyncInfo {
  buyPoint: number | null;
  buyPointDiffPct: number | null;
  absBuyDiff: number | null;
  buyRange: [number, number] | null;
  buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "EXTENDED" | "BELOW_SUPPORT" | "NO_SETUP";
  isExtended?: boolean;
  chaseRisk?: "LOW" | "MODERATE" | "HIGH";
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  buyStrategy: string | null;
  isBuyTriggerNow?: boolean | null;
  buyTriggerScore?: number | null;
  buyTriggerReasonVi?: string | null;
  confluenceScore?: number | null;
  confluenceBadge?: string | null;
  mtfScore?: number | null;
  mtfBadgeVi?: string | null;
  rsRating?: number | null;
  smartMoneySignal?: string | null;
  vsaSignal?: string | null;
  asymmetricScore?: number | null;
  syncTimestampMs?: number;
}

export interface VnStockDetail {
  symbol: string;
  name: string | null;
  quote: Quote | null;
  bars: OhlcvBar[];
  technical: TechnicalSnapshot | null;
  patterns: CandlePattern[];
  equity: VndEquitySnapshot | null;
  sharesOutstanding: number | null;
  profile: VndCompanyProfile | null;
  orderBook: VnOrderBook | null;
  foreignFlow: { latest: unknown; history: unknown } | null;
  screenerSync?: ScreenerSyncInfo | null;
  consensus?: {
    targetPrice: number | null;
    rating: string | null;
    ratingAsOf: string | null;
    source: string;
  } | null;
  ownership?: {
    foreignerPct: number | null;
    freeFloatPct: number | null;
    statePct: number | null;
    maxForeignPct: number | null;
    source: string;
  } | null;
  financials: {
    income?: Record<string, unknown>[] | null;
    balance?: Record<string, unknown>[] | null;
    cashflow?: Record<string, unknown>[] | null;
    [key: string]: unknown;
  } | null;
  financialHealth: FinancialHealthResult | null;
  financialMeta: FinancialPackageMeta | null;
  financialGrowth: GrowthSnapshot | null;
  financialTtm: NormalizedPeriod | null;
  detailedRatios: {
    marketCap?: number | null;
    flat?: { key: string; value: number | null; [k: string]: unknown }[] | null;
    [key: string]: unknown;
  } | null;
  ratioMap: Record<string, unknown>;
  exposure?: ExposureAnalysis | null;
  attribution?: DriverAttribution | null;
  starRatings?: StarRatings | null;
  confluence?: MaCandleConfluenceRow | null;
  metricsSources: string[];
  notes: string[];
}

/** Soft-timeout: never let one slow source hang the whole detail page. */
async function soft<T>(p: Promise<T>, ms: number, _label?: string): Promise<T | null> {
  try {
    return await Promise.race([
      p.then((v) => v).catch(() => null as T | null),
      new Promise<null>((r) => setTimeout(() => r(null), ms)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Produce stock detail under Workers resource budget (avoids Error 1102).
 * Stage A (≤4 parallel): quote + OHLCV + profile + equity
 * Stage B (≤3 parallel): ratios + orderbook + foreign — only if wall remains
 * Stage C (sequential): financials — only if wall remains
 * Dual OHLCV race is deferred (legacy first, resilient only on miss).
 */
async function produceVnStockDetail(sym: string): Promise<{ detail: VnStockDetail; meta: Meta } | null> {
  const failed: string[] = [];
  const notes: string[] = [];
  const wallStart = Date.now();
  const wallLeft = () => WORKERS_BUDGET.detailWallMs - (Date.now() - wallStart);
  const BARS = WORKERS_BUDGET.detailBars;
  const softMs = WORKERS_BUDGET.providerSoftMs;

  // Stage A — core (max 4 parallel)
  const [quoteRes, ohlcvLegacy, profileRes, equityRes] = await Promise.all([
    soft(getVnQuotes([sym]), softMs, "quotes"),
    soft(getVnOhlcv(sym, BARS), Math.min(7_000, softMs + 2_000), "ohlcv"),
    soft(getVndCompanyProfile(sym), softMs, "profile"),
    soft(getVndEquitySnapshot(sym), softMs, "equity"),
  ]);

  // OHLCV resilient only if legacy empty and budget remains
  let ohlcvResilient: Awaited<ReturnType<typeof fetchOhlcvResilient>> | null = null;
  if (!(ohlcvLegacy?.bars?.length) && wallLeft() > 4_000) {
    ohlcvResilient = await soft(fetchOhlcvResilient(sym, BARS), 6_000, "ohlcv-resilient");
  }

  // Stage B — secondary
  let bookRes: Awaited<ReturnType<typeof getVnOrderBook>> | null = null;
  let foreignRes: Awaited<ReturnType<typeof getVndSymbolForeignFlow>> | null = null;
  let valRatioRes: Awaited<ReturnType<typeof getVndValuationRatios>> | null = null;
  let vietcapRes: Awaited<ReturnType<typeof getVietcapCompany>> | null = null;
  if (wallLeft() > 3_000) {
    const secondary = await Promise.all([
      soft(getVnOrderBook(sym), 3_500, "orderbook"),
      soft(getVndSymbolForeignFlow(sym), 3_500, "foreign"),
      soft(getVndValuationRatios(sym), softMs, "ratios"),
      soft(getVietcapCompany(sym), 3_500, "vietcap"),
    ]);
    bookRes = secondary[0];
    foreignRes = secondary[1];
    valRatioRes = secondary[2];
    vietcapRes = secondary[3];
  } else {
    notes.push("skip:secondary-budget");
  }

  // Stage C — financials (heaviest)
  let finRes: Awaited<ReturnType<typeof getFinancialsForSymbol>> | null = null;
  if (wallLeft() > 5_000) {
    finRes = await soft(
      getFinancialsForSymbol(sym),
      Math.min(WORKERS_BUDGET.financialSoftMs, Math.max(2_000, wallLeft() - 500)),
      "financials",
    );
  } else {
    notes.push("skip:financials-budget");
  }

  let quote = quoteRes?.quotes?.[0] ?? null;
  if (!quote) {
    const vps = await getVpsQuotes([sym]).catch(() => []);
    if (vps[0]) quote = vps[0];
  }

  let profile = profileRes ?? null;
  let equity = equityRes ?? null;

  if (!profile) {
    try {
      const u = await lookupVndSymbol(sym);
      if (u) {
        profile = {
          code: sym,
          floor: u.exchange,
          logo: `https://www.vndirect.com.vn/vndirect-resource/nextcom/attachment/LOGO/${sym}.jpg`,
          vnName: u.name,
          enName: null,
          foundDate: null,
          taxCode: null,
          registrationCode: null,
          vnAddress: null,
          enAddress: null,
          phone: null,
          fax: null,
          website: null,
          email: null,
          employees: null,
          branches: null,
          vnSummary: null,
          enSummary: null,
        };
      }
    } catch {
      /* ignore */
    }
  }

  const vietcapData = vietcapRes;
  if (vietcapData) {
    if (!quote && vietcapData.price) {
      const p = vietcapData.price >= 1000 ? vietcapData.price / 1000 : vietcapData.price;
      quote = {
        symbol: sym,
        assetClass: "stock",
        price: p,
        name: vietcapData.name,
        change: null,
        changePercent: null,
        volume: null,
        quoteVolume: null,
        high: null,
        low: null,
        open: null,
        referencePrice: null,
        ceilingPrice: null,
        floorPrice: null,
        updatedAt: new Date().toISOString(),
      };
    }
    if (!profile) {
      profile = {
        code: sym,
        floor: vietcapData.exchange,
        logo: null,
        vnName: vietcapData.name,
        enName: vietcapData.nameEn,
        foundDate: vietcapData.listedDate,
        taxCode: null,
        registrationCode: null,
        vnAddress: null,
        enAddress: null,
        phone: null,
        fax: null,
        website: null,
        email: null,
        employees: null,
        branches: null,
        vnSummary: vietcapData.sector ? `Ngành: ${vietcapData.sector}` : null,
        enSummary: vietcapData.sector ? `Sector: ${vietcapData.sector}` : null,
      };
    }
    if (!equity && (vietcapData.sharesOutstanding || vietcapData.marketCap)) {
      equity = {
        sharesOutstanding: vietcapData.sharesOutstanding,
        totalShares: vietcapData.sharesOutstanding,
        marketCapReported: vietcapData.marketCap,
        reportDate: null,
        source: "vietcap",
      };
    }
  }

  if (!quote) failed.push("quote");
  const name = quote?.name ?? (profile as { vnName?: string } | null)?.vnName ?? null;
  const bars =
    (ohlcvResilient?.bars?.length ? ohlcvResilient.bars : null) ??
    ohlcvLegacy?.bars ??
    [];
  if (ohlcvResilient?.bars?.length) notes.push(`ohlcv:${ohlcvResilient.pack?.meta?.source ?? "resilient"}`);
  else if (ohlcvLegacy?.bars?.length) notes.push(`ohlcv:${ohlcvLegacy.meta?.source ?? "legacy"}`);
  if (!bars.length) failed.push("ohlcv");

  let technical: TechnicalSnapshot | null = null;
  let patterns: CandlePattern[] = [];
  if (bars.length >= 20) {
    try {
      technical = analyzeSeries(bars);
      patterns = detectPatterns(bars);
    } catch {
      /* */
    }
  }

  // Alpha-beta optional — skip under tight budget (extra VNINDEX fetch).
  let alphaBeta: unknown = null;
  if (bars.length >= 60 && wallLeft() > 4_000) {
    try {
      const idx = await soft(getVnOhlcv("VNINDEX", BARS), 4_000, "vnindex");
      if (idx?.bars?.length) {
        alphaBeta = computeAlphaBeta(bars, idx.bars);
      }
    } catch {
      /* */
    }
  }

  const orderBook = bookRes?.book ?? null;
  let foreignFlow = foreignRes
    ? { latest: foreignRes.latest ?? null, history: foreignRes.history ?? null }
    : null;

  // Fallback sang dòng tiền ngoại realtime từ VPS nếu VNDirect trống
  if (!foreignFlow?.latest) {
    try {
      const vpsForeign = await soft(getVpsForeignFlow(sym), 2_000, "vps-foreign");
      if (vpsForeign && (vpsForeign.buyVolume != null || vpsForeign.sellVolume != null)) {
        foreignFlow = {
          latest: {
            tradingDate: vpsForeign.updatedAt.slice(0, 10),
            buyVol: vpsForeign.buyVolume ?? 0,
            buyVal: vpsForeign.buyValue ?? 0,
            sellVol: vpsForeign.sellVolume ?? 0,
            sellVal: vpsForeign.sellValue ?? 0,
            netVol: vpsForeign.netVolume ?? 0,
            netVal: vpsForeign.netValue ?? 0,
            totalRoom: null,
            currentRoom: vpsForeign.foreignRoom,
            floor: null,
          },
          history: null,
        };
        notes.push("foreign:vps");
      }
    } catch {
      /* ignore */
    }
  }

  const consensus = vietcapData && (vietcapData.targetPrice != null || vietcapData.rating)
    ? {
        targetPrice: vietcapData.targetPrice ?? null,
        rating: vietcapData.rating ?? null,
        ratingAsOf: vietcapData.ratingAsOf ?? null,
        source: "vietcap-iq",
      }
    : null;

  const ownership = vietcapData && (vietcapData.foreignerPct != null || vietcapData.freeFloatPct != null || vietcapData.statePct != null)
    ? {
        foreignerPct: vietcapData.foreignerPct ?? null,
        freeFloatPct: vietcapData.freeFloatPct ?? null,
        statePct: vietcapData.statePct ?? null,
        maxForeignPct: vietcapData.maxForeignPct ?? null,
        source: "vietcap-iq",
      }
    : null;

  const financials = finRes?.financials ?? null;
  const financialHealth = finRes?.health ?? null;
  const financialMeta = finRes?.packageMeta ?? null;
  const financialGrowth = finRes?.growth ?? null;
  const financialTtm = finRes?.ttm ?? null;

  const ratioMap: Record<string, unknown> = {};
  if (valRatioRes) {
    if (valRatioRes.pe != null) ratioMap.pe = valRatioRes.pe;
    if (valRatioRes.pb != null) ratioMap.pb = valRatioRes.pb;
    if (valRatioRes.ps != null) ratioMap.ps = valRatioRes.ps;
    if (valRatioRes.evEbitda != null) ratioMap.evEbitda = valRatioRes.evEbitda;
    if (valRatioRes.eps != null) ratioMap.eps = valRatioRes.eps;
    if (valRatioRes.bvps != null) ratioMap.bvps = valRatioRes.bvps;
    if (valRatioRes.roe != null) ratioMap.roe = valRatioRes.roe;
    if (valRatioRes.roa != null) ratioMap.roa = valRatioRes.roa;
    if (valRatioRes.dividendYield != null) ratioMap.dividendYield = valRatioRes.dividendYield;
    if (valRatioRes.marketCap != null) ratioMap.marketCap = valRatioRes.marketCap;
  }

  const detailedRatios = valRatioRes
    ? {
        marketCap: valRatioRes.marketCap ?? equity?.marketCapReported ?? null,
        flat: Object.entries(ratioMap).map(([key, value]) => ({
          key,
          value: typeof value === "number" ? value : null,
        })),
        ...ratioMap,
      }
    : null;

  const sources = [
    quoteRes?.meta?.source,
    ohlcvResilient?.pack?.meta?.source ?? ohlcvLegacy?.meta?.source,
    finRes?.meta?.source,
    valRatioRes?.source,
    vietcapData ? "vietcap" : null,
  ].filter(Boolean) as string[];

  if (failed.length) notes.push(`missing: ${failed.join(",")}`);
  if (alphaBeta) notes.push("alpha-beta ok");

  // 7. Đồng bộ điểm mua-bán & vị thế vùng mua trực tiếp với Screener Engine
  let screenerSync: ScreenerSyncInfo | null = null;
  try {
    const { getLastMasterSnapshot } = await import("./screener-snapshot-service");
    const screenerItem = getLastMasterSnapshot()?.items.find((i) => i.symbol === sym);
    const curPrice = quote?.price ?? screenerItem?.price ?? technical?.last ?? 0;

    if (screenerItem && screenerItem.buyPoint && screenerItem.buyPoint > 0) {
      let liveDiffPct = screenerItem.buyPointDiffPct;
      let liveAbsDiff = screenerItem.absBuyDiff;
      let liveZoneStatus = screenerItem.buyZoneStatus;

      if (curPrice > 0) {
        liveDiffPct = Number((((curPrice - screenerItem.buyPoint) / curPrice) * 100).toFixed(1));
        liveAbsDiff = Math.abs(liveDiffPct);
        if (screenerItem.buyRange) {
          if (liveDiffPct != null && liveDiffPct > 4.5) {
            liveZoneStatus = "EXTENDED";
          } else if (liveDiffPct != null && liveDiffPct > 2.8) {
            liveZoneStatus = "WAIT_PULLBACK";
          } else if (liveAbsDiff <= 1.2 || (curPrice >= screenerItem.buyRange[0] && curPrice <= screenerItem.buyRange[1])) {
            liveZoneStatus = "AT_BUY_POINT";
          } else if (liveAbsDiff <= 2.8) {
            liveZoneStatus = "NEAR_BUY_POINT";
          } else {
            liveZoneStatus = "BELOW_SUPPORT";
          }
        }
      }

      screenerSync = {
        buyPoint: screenerItem.buyPoint,
        buyPointDiffPct: liveDiffPct,
        absBuyDiff: liveAbsDiff,
        buyRange: screenerItem.buyRange,
        buyZoneStatus: liveZoneStatus,
        isExtended: screenerItem.isExtended || liveZoneStatus === "EXTENDED",
        chaseRisk: liveZoneStatus === "EXTENDED" ? "HIGH" : screenerItem.chaseRisk,
        stopLoss: screenerItem.stopLoss,
        targetPrice: screenerItem.targetPrice,
        riskReward: screenerItem.riskReward,
        buyStrategy: screenerItem.buyStrategy,
        isBuyTriggerNow: screenerItem.isBuyTriggerNow,
        buyTriggerScore: screenerItem.buyTriggerScore,
        buyTriggerReasonVi: screenerItem.buyTriggerReasonVi,
        confluenceScore: screenerItem.confluenceScore,
        confluenceBadge: screenerItem.confluenceBadge,
        mtfScore: screenerItem.mtfScore,
        mtfBadgeVi: screenerItem.mtfBadgeVi,
        rsRating: screenerItem.rsRating,
        smartMoneySignal: screenerItem.smartMoneySignal,
        vsaSignal: screenerItem.vsaSignal,
        asymmetricScore: screenerItem.apexQuantScore ?? null,
        syncTimestampMs: Date.now(),
      };

      const tickRound = (n: number) => Number(n.toFixed(2));

      if (technical?.tradeSignal) {
        if (!technical.tradeSignal.plan) {
          const entryPt = screenerItem.buyPoint;
          const slPt = screenerItem.stopLoss ?? tickRound(entryPt * 0.95);
          const tpPt = screenerItem.targetPrice ?? tickRound(entryPt * 1.15);
          const riskVal = Math.abs(entryPt - slPt);
          const rewardVal = Math.abs(tpPt - entryPt);
          technical.tradeSignal.plan = {
            side: "buy",
            sideVi: "MUA",
            entry: entryPt,
            entryZone: screenerItem.buyRange ?? [entryPt * 0.99, entryPt * 1.015],
            entryStrategyVi: screenerItem.buyStrategy || "Đồng thuận điểm mua định lượng Screener",
            currentPriceDiffPct: liveDiffPct ?? 0,
            buyPoint: entryPt,
            buyRange: screenerItem.buyRange ?? [entryPt * 0.99, entryPt * 1.015],
            buyZoneStatus: liveZoneStatus,
            buyPointDiffPct: liveDiffPct,
            absBuyDiff: liveAbsDiff,
            isExtended: screenerItem.isExtended || liveZoneStatus === "EXTENDED",
            chaseRisk: liveZoneStatus === "EXTENDED" ? "HIGH" : screenerItem.chaseRisk,
            stopLoss: slPt,
            takeProfit: tpPt,
            takeProfit1: tickRound(entryPt + riskVal * 1.5),
            takeProfit2: tpPt,
            takeProfit3: tickRound(entryPt + riskVal * 3.0),
            riskReward: screenerItem.riskReward ?? (riskVal > 0 ? Number((rewardVal / riskVal).toFixed(1)) : 2.5),
            riskPct: entryPt > 0 ? Number(((riskVal / entryPt) * 100).toFixed(1)) : 5,
            rewardPct: entryPt > 0 ? Number(((rewardVal / entryPt) * 100).toFixed(1)) : 15,
            riskPerShare: riskVal,
            invalidation: slPt,
            basis: ["Screener Master Strategy"],
            notes: [],
            asymmetricScore: screenerItem.apexQuantScore ?? 80,
            confluenceLayers: [screenerItem.buyStrategy || "Hội tụ kỹ thuật"],
            actionVerdict: screenerItem.buyTriggerReasonVi || "Đồng thuận điểm mua định lượng Screener",
            isBuyTriggerNow: screenerItem.isBuyTriggerNow,
            buyTriggerScore: screenerItem.buyTriggerScore,
            buyTriggerReasonVi: screenerItem.buyTriggerReasonVi,
          };
        } else {
          technical.tradeSignal.plan.side = "buy";
          technical.tradeSignal.plan.sideVi = "MUA";
          technical.tradeSignal.plan.buyPoint = screenerItem.buyPoint;
          technical.tradeSignal.plan.entry = screenerItem.buyPoint;
          technical.tradeSignal.plan.buyRange = screenerItem.buyRange;
          technical.tradeSignal.plan.entryZone = screenerItem.buyRange ?? technical.tradeSignal.plan.entryZone;
          technical.tradeSignal.plan.buyZoneStatus = liveZoneStatus;
          technical.tradeSignal.plan.buyPointDiffPct = liveDiffPct;
          technical.tradeSignal.plan.currentPriceDiffPct = liveDiffPct;
          technical.tradeSignal.plan.absBuyDiff = liveAbsDiff;
          technical.tradeSignal.plan.isExtended = screenerItem.isExtended || liveZoneStatus === "EXTENDED";
          technical.tradeSignal.plan.chaseRisk = liveZoneStatus === "EXTENDED" ? "HIGH" : screenerItem.chaseRisk;
          if (screenerItem.stopLoss) technical.tradeSignal.plan.stopLoss = screenerItem.stopLoss;
          if (screenerItem.targetPrice) technical.tradeSignal.plan.takeProfit = screenerItem.targetPrice;
          if (screenerItem.riskReward) technical.tradeSignal.plan.riskReward = screenerItem.riskReward;
          if (screenerItem.buyStrategy) technical.tradeSignal.plan.entryStrategyVi = screenerItem.buyStrategy;
          technical.tradeSignal.plan.isBuyTriggerNow = screenerItem.isBuyTriggerNow;
          technical.tradeSignal.plan.buyTriggerScore = screenerItem.buyTriggerScore;
          technical.tradeSignal.plan.buyTriggerReasonVi = screenerItem.buyTriggerReasonVi;
        }
      }

      // Đảm bảo tính nhất quán: Nếu cổ phiếu được lọc vào nhóm Mua Kích Hoạt Tức Thời, Sát Điểm Mua hoặc đạt các bộ lọc Mua
      // thì Tín hiệu Kỹ thuật bắt buộc phải đồng bộ sang "MUA", tuyệt đối không để xảy ra tình trạng "báo BÁN"
      if (technical?.tradeSignal) {
        const isActionableBuyZone =
          liveZoneStatus === "AT_BUY_POINT" ||
          liveZoneStatus === "NEAR_BUY_POINT" ||
          (screenerItem.absBuyDiff != null && screenerItem.absBuyDiff <= 2.2);

        const isActionableBuyPreset =
          screenerItem.presetsPassed?.includes("apex_buy_now") ||
          screenerItem.presetsPassed?.includes("near_buy_point") ||
          screenerItem.isBuyTriggerNow === true ||
          (screenerItem.presetsPassed && screenerItem.presetsPassed.length > 1);

        if ((isActionableBuyPreset || isActionableBuyZone) && !screenerItem.isExtended && liveZoneStatus !== "EXTENDED" && liveZoneStatus !== "BELOW_SUPPORT") {
          technical.tradeSignal.action = "buy";
          technical.tradeSignal.actionVi = "MUA";
          const curConf = typeof technical.tradeSignal.confidence === "number" ? technical.tradeSignal.confidence : 60;
          const trigScore = typeof screenerItem.buyTriggerScore === "number" ? screenerItem.buyTriggerScore : 75;
          technical.tradeSignal.confidence = Math.max(curConf, trigScore);
          const curBias = typeof technical.tradeSignal.bias === "number" ? technical.tradeSignal.bias : 30;
          technical.tradeSignal.bias = Math.max(curBias, 45);
          if (technical.tradeSignal.reasons) {
            technical.tradeSignal.reasons = technical.tradeSignal.reasons.filter((r) => !r.toLowerCase().includes("giảm") && !r.toLowerCase().includes("bán"));
            technical.tradeSignal.reasons.unshift(screenerItem.buyTriggerReasonVi || "Đồng thuận điểm mua định lượng Screener");
          }
        } else if (technical.tradeSignal.action === "sell" && (isActionableBuyPreset || !screenerItem.isExtended) && liveZoneStatus !== "BELOW_SUPPORT") {
          // Triệt tiêu xung đột: Cổ phiếu đạt chuẩn bộ lọc Mua thì kỹ thuật tuyệt đối không báo BÁN
          // Điều chỉnh sang QUAN SÁT (chờ nhịp điều chỉnh hoặc tích lũy xác nhận)
          technical.tradeSignal.action = "watch";
          technical.tradeSignal.actionVi = "QUAN SÁT";
          technical.tradeSignal.confidence = Math.max(50, typeof technical.tradeSignal.confidence === "number" ? technical.tradeSignal.confidence : 50);
          technical.tradeSignal.bias = 0;
          if (technical.tradeSignal.reasons) {
            technical.tradeSignal.reasons = technical.tradeSignal.reasons.filter((r) => !r.toLowerCase().includes("bán"));
            technical.tradeSignal.reasons.unshift(
              liveZoneStatus === "WAIT_PULLBACK"
                ? "Chờ nhịp rung lắc tích lũy về điểm mua chuẩn"
                : "Chờ xác nhận lực cầu tại vùng tích lũy"
            );
          }
        }
      }
    } else if (technical?.tradeSignal?.plan) {
      const p = technical.tradeSignal.plan;
      screenerSync = {
        buyPoint: p.buyPoint ?? p.entry,
        buyPointDiffPct: p.buyPointDiffPct ?? p.currentPriceDiffPct,
        absBuyDiff: p.absBuyDiff ?? Math.abs(p.currentPriceDiffPct ?? 0),
        buyRange: p.buyRange ?? p.entryZone,
        buyZoneStatus: p.buyZoneStatus ?? "NEAR_BUY_POINT",
        stopLoss: p.stopLoss,
        targetPrice: p.takeProfit,
        riskReward: p.riskReward,
        buyStrategy: p.entryStrategyVi,
        isBuyTriggerNow: p.isBuyTriggerNow ?? false,
        buyTriggerScore: p.buyTriggerScore ?? null,
        buyTriggerReasonVi: p.buyTriggerReasonVi ?? null,
        asymmetricScore: p.asymmetricScore ?? null,
        syncTimestampMs: Date.now(),
      };
    }
  } catch {
    /* ignore fallback */
  }

  let confluence: MaCandleConfluenceRow | null = null;
  if (bars.length >= 25) {
    try {
      confluence = analyzeMaCandleRow(sym, bars, quote ?? undefined);
    } catch {
      /* resilient */
    }
  }

  const detail: VnStockDetail = {
    symbol: sym,
    name,
    quote,
    bars,
    technical,
    patterns,
    equity,
    sharesOutstanding: equity?.sharesOutstanding ?? equity?.totalShares ?? null,
    profile,
    orderBook,
    foreignFlow,
    consensus,
    ownership,
    financials,
    financialHealth,
    financialMeta,
    financialGrowth,
    financialTtm,
    detailedRatios,
    ratioMap,
    screenerSync,
    exposure: analyzeExposure(sym),
    attribution: attributeDrivers({
      priceChangePct: quote?.changePercent ?? 0,
      foreignNetVnd:
        typeof (foreignFlow?.latest as unknown as { netVal?: number })?.netVal === "number"
          ? ((foreignFlow?.latest as unknown as { netVal: number }).netVal ?? 0)
          : 0,
      marketDeltaPct: 0,
      sectorDeltaPct: 0,
      rsi: technical?.rsi14 ?? undefined,
      maSignal:
        technical?.tradeSignal?.action === "buy"
          ? "BUY"
          : technical?.tradeSignal?.action === "sell"
          ? "SELL"
          : "HOLD",
      volumeRatio:
        bars.length >= 21
          ? (quote?.volume ?? 0) /
            Math.max(1, bars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20)
          : 1,
    }),
    starRatings: computeStarRatings({
      closes: bars.map((b) => b.close),
      volumes: bars.map((b) => b.volume),
      score: technical?.trend?.score ?? 50,
      rsi: technical?.rsi14 ?? undefined,
      ma20: technical?.sma?.sma20,
      ma50: technical?.sma?.sma50,
      ma200: technical?.sma?.sma200,
    }),
    confluence,
    metricsSources: sources,
    notes,
  };

  const meta = buildMeta({
    source: sources.join("+") || "vn-stock-detail",
    sourceTimestampMs: Date.now(),
    partial: failed.length > 0,
    note: notes.join(" · ") || undefined,
  });

  return { detail, meta };
}

function emptyShell(sym: string, note: string): { detail: VnStockDetail; meta: Meta } {
  return {
    detail: {
      symbol: sym,
      name: null,
      quote: null,
      bars: [],
      technical: null,
      patterns: [],
      equity: null,
      sharesOutstanding: null,
      profile: null,
      orderBook: null,
      foreignFlow: null,
      consensus: null,
      ownership: null,
      financials: null,
      financialHealth: null,
      financialMeta: null,
      financialGrowth: null,
      financialTtm: null,
      detailedRatios: null,
      ratioMap: {},
      screenerSync: null,
      exposure: analyzeExposure(sym),
      attribution: null,
      starRatings: null,
      confluence: null,
      metricsSources: [],
      notes: [note],
    },
    meta: buildMeta({
      source: "degraded",
      sourceTimestampMs: Date.now(),
      note,
      partial: true,
    }),
  };
}

export async function getVnStockDetail(
  symbol: string,
): Promise<{ detail: VnStockDetail; meta: Meta } | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  try {
    const hit = await cached(`vn:stock-detail:${sym}:v2`, {
      ttlMs: 25_000,
      staleMs: 180_000,
      softSwr: true,
      producer: async () => {
        // Single produce — no double-retry (avoids 2× subrequest burn on Workers).
        const r = await produceVnStockDetail(sym);
        if (!r) throw new Error(`detail unavailable: ${sym}`);
        return r;
      },
    });
    return hit.value;
  } catch (e) {
    return emptyShell(sym, e instanceof Error ? e.message : "detail_error");
  }
}
