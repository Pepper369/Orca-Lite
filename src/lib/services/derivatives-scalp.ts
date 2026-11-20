import "server-only";
import { buildMeta } from "../freshness";
import type { Meta, OhlcvBar, QualityStatus } from "../types";
import { getContractBySymbol, buildContractMaster } from "../providers/vsdc-spec";
import { getDerivativeContractDetail, resolveVn30Spot, buildFlowForRow } from "./derivatives";
import { getDerivHistory, recordDerivSample } from "./derivatives-history";
import { getVnOrderBook } from "./stock-orderbook";
import { atr, ema, rsi, supportResistance } from "../technical";
import { buildSharedBarContext } from "../engines/unified-ta-kernel";
import {
  calibrateBasisOrnsteinUhlenbeck,
  computeOrderFlowImbalance,
  type BookQueueLevel,
  type OFIResult,
  type OUBasisCalibration,
} from "../engines/unified-cross-asset-quant";

const prevDerivBookLevels = new Map<string, BookQueueLevel[]>();

export interface DerivativeScalpSetup {
  strategy: string;
  direction: "BUY" | "SELL" | "NONE";
  status: "ACTIVE" | "TRIGGERED" | "AWAITING_TRIGGER" | "INVALIDATED";
  strength: number;
  entry: number | null;
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  stopPoints: number | null;
  targetPoints: number | null;
  evidence: string[];
  riskNotes: string[];
}

export interface DerivativeScalpSignal {
  symbol: string;
  timeframe: string;
  direction: "watch-long" | "watch-short" | "neutral";
  strength: number;
  score: number;
  last: number;
  spotPrice: number | null;
  basis: number | null;
  basisStatus: "PREMIUM" | "DISCOUNT" | "FAIR";
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi7: number | null;
  atr: number | null;
  flowKind: string | null;
  flowConfidence: number | null;
  openInterest: number | null;
  volume: number | null;
  micro: { support: number[]; resistance: number[] };
  primarySetup: DerivativeScalpSetup | null;
  marginInfo: {
    productId: string;
    multiplier: number;
    tickSize: number;
    initialMarginPct: number;
    initialMarginPerLotVnd: number;
    effectiveLeverage: number;
  };
  ouCalibration?: OUBasisCalibration;
  orderFlowImbalance?: OFIResult;
  evidence: string[];
  riskNotes: string[];
}

export interface DerivativeScalpResult {
  signal: DerivativeScalpSignal;
  quality: QualityStatus;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function buildDerivativeScalpSignal(
  symbolRaw: string,
  timeframe = "5m",
): Promise<{ result: DerivativeScalpResult; meta: Meta } | null> {
  const sym = symbolRaw.trim().toUpperCase();
  const contract = getContractBySymbol(sym);

  const [detailRes, spotRes] = await Promise.all([
    getDerivativeContractDetail(sym),
    resolveVn30Spot(),
  ]);

  const spot = spotRes.price;
  const quote = detailRes?.data?.quote;
  // Giá tham chiếu mặc định nếu thị trường chưa mở hoặc feed tạm nghỉ
  const isCommodity = sym.includes("=") || sym === "GOLD" || sym === "OIL";
  const defaultBasePrice = isCommodity ? (sym.startsWith("GC") ? 2680.0 : sym.startsWith("CL") ? 74.5 : 31.5) : (spot ? spot + 1.5 : 1300.0);
  const lastPrice = quote?.last ?? defaultBasePrice;
  const basis = quote?.last != null && spot != null ? quote.last - spot : (isCommodity ? 0 : spot ? 1.5 : 0);

  if (quote?.last != null) {
    recordDerivSample({
      symbol: sym,
      ts: Date.now(),
      last: quote.last,
      openInterest: quote.openInterest ?? null,
      volume: quote.volume ?? null,
      basis,
      source: quote.source ?? "derivatives-scalp",
    });
  }

  // Lấy dòng tiền Flow
  const flowSignal = detailRes ? buildFlowForRow(detailRes.data) : null;

  // Chỉ dùng nến OHLCV thật (không sinh nến sin giả lập để phát tín hiệu scalping)
  const { getVnOhlcv } = await import("./stocks-board");
  const [realPack, vn30Pack, obRes] = await Promise.all([
    getVnOhlcv(sym, 90).catch(() => null),
    isCommodity ? Promise.resolve(null) : getVnOhlcv("VN30", 45).catch(() => null),
    isCommodity
      ? Promise.resolve(null)
      : Promise.race([
          getVnOrderBook(sym).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 1500)),
        ]),
  ]);
  const bars = realPack?.bars ?? [];
  if (bars.length < 21) {
    const multiplier = contract.multiplier ?? 100_000;
    const tickSize = contract.tickSize ?? 0.1;
    const initialMarginPct = 0.17;
    const initialMarginPerLotVnd = Math.round(lastPrice * multiplier * initialMarginPct);
    const effectiveLeverage = Math.round((1 / initialMarginPct) * 10) / 10;
    return {
      result: {
        signal: {
          symbol: sym,
          timeframe,
          direction: "neutral",
          strength: 0,
          score: 0,
          last: lastPrice,
          spotPrice: spot,
          basis,
          basisStatus: basis > 4.5 ? "PREMIUM" : basis < -4.5 ? "DISCOUNT" : "FAIR",
          vwap: null,
          ema9: null,
          ema21: null,
          rsi7: null,
          atr: null,
          flowKind: flowSignal?.kind ?? null,
          flowConfidence: flowSignal?.confidence ?? null,
          openInterest: quote?.openInterest ?? null,
          volume: quote?.volume ?? null,
          micro: { support: [], resistance: [] },
          primarySetup: null,
          marginInfo: {
            productId: contract.productId,
            multiplier,
            tickSize,
            initialMarginPct,
            initialMarginPerLotVnd,
            effectiveLeverage,
          },
          evidence: ["Chưa có chuỗi nến intraday thực tế (>= 21 nến) — không sinh tín hiệu scalping giả lập."],
          riskNotes: ["Đợi dữ liệu OHLCV live trước khi giải ngân."],
        },
        quality: "DEGRADED" as QualityStatus,
      },
      meta: buildMeta({
        source: "hnx-vsdc-scalp-engine",
        sourceTimestampMs: Date.now(),
        partial: true,
        note: "Thiếu dữ liệu OHLCV intraday thực tế cho phái sinh",
      }),
    };
  }
  const ctx = buildSharedBarContext(bars);
  const closes = ctx.closes;

  // Tính các chỉ báo định lượng từ SharedBarContext (single-pass O(N))
  let pv = 0;
  let vv = 0;
  for (const b of bars.slice(-48)) {
    if (b.volume > 0) {
      pv += ((b.high + b.low + b.close) / 3) * b.volume;
      vv += b.volume;
    }
  }
  const vwap = vv > 0 ? Math.round((pv / vv) * 10) / 10 : lastPrice;
  const ema9Val = ctx.ema9[closes.length - 1] ?? lastPrice;
  const ema21Val = ctx.ema21[closes.length - 1] ?? lastPrice;
  const rsiArr = rsi(closes, 7);
  const rsi7Val = rsiArr[rsiArr.length - 1] ?? 50;
  const atrVal = ctx.atr14 ?? atr(bars, 14) ?? 2.8;

  // OU Basis calibration (intraday history first, date-aligned daily fallback)
  let ouCalibration: OUBasisCalibration | undefined;
  if (!isCommodity) {
    let basisSeries = getDerivHistory(sym, 60)
      .map((s) => s.basis)
      .filter((b): b is number => b != null && Number.isFinite(b));
    if (basisSeries.length < 15 && vn30Pack?.bars?.length) {
      const spotByDay = new Map<string, number>();
      for (const b of vn30Pack.bars) {
        const ms = b.time > 1e12 ? b.time : b.time * 1000;
        spotByDay.set(new Date(ms).toISOString().slice(0, 10), b.close);
      }
      const dailyBasis: number[] = [];
      for (const b of bars) {
        const ms = b.time > 1e12 ? b.time : b.time * 1000;
        const sc = spotByDay.get(new Date(ms).toISOString().slice(0, 10));
        if (sc != null) dailyBasis.push(Number((b.close - sc).toFixed(2)));
      }
      if (dailyBasis.length >= 15) {
        dailyBasis[dailyBasis.length - 1] = basis;
        basisSeries = dailyBasis;
      }
    }
    if (basisSeries.length >= 15) {
      ouCalibration = calibrateBasisOrnsteinUhlenbeck(basisSeries, 1);
    }
  }

  // Level-2 Order Flow Imbalance (Cont-Kukanov-Stoikov OFI)
  let orderFlowImbalance: OFIResult | undefined;
  if (obRes?.book && obRes.book.bids.length > 0 && obRes.book.asks.length > 0) {
    const depth = Math.min(3, obRes.book.bids.length, obRes.book.asks.length);
    const currLevels: BookQueueLevel[] = [];
    for (let i = 0; i < depth; i++) {
      currLevels.push({
        bidPrice: obRes.book.bids[i]!.price,
        bidQty: obRes.book.bids[i]!.volume,
        askPrice: obRes.book.asks[i]!.price,
        askQty: obRes.book.asks[i]!.volume,
      });
    }
    const prevLevels = prevDerivBookLevels.get(sym);
    if (prevLevels && prevLevels.length > 0) {
      orderFlowImbalance = computeOrderFlowImbalance(prevLevels, currLevels);
    }
    prevDerivBookLevels.set(sym, currLevels);
  }

  // Điểm kỹ thuật (-3.0 đến +3.0)
  let score = 0;
  const evidence: string[] = [];
  const riskNotes: string[] = [];

  // 1. Phân tích Xu hướng & VWAP
  if (ema9Val > ema21Val) {
    score += 0.8;
    evidence.push(`EMA9 (${ema9Val.toFixed(1)}) cắt trên EMA21 (${ema21Val.toFixed(1)}) — đà tăng ngắn hạn.`);
  } else {
    score -= 0.8;
    evidence.push(`EMA9 (${ema9Val.toFixed(1)}) nằm dưới EMA21 (${ema21Val.toFixed(1)}) — áp lực bán chi phối.`);
  }

  if (lastPrice >= vwap) {
    score += 0.6;
    evidence.push(`Giá nằm trên VWAP (${vwap.toFixed(1)}) — bên mua giữ quyền kiểm soát phiên.`);
  } else {
    score -= 0.6;
    evidence.push(`Giá nằm dưới VWAP (${vwap.toFixed(1)}) — bên bán áp đảo tại các nhịp hồi.`);
  }

  // 2. Phân tích RSI Momentum
  if (rsi7Val > 54 && rsi7Val <= 72) {
    score += 0.5;
    evidence.push(`RSI(7) = ${rsi7Val.toFixed(0)} — động lượng tăng lành mạnh.`);
  } else if (rsi7Val < 46 && rsi7Val >= 28) {
    score -= 0.5;
    evidence.push(`RSI(7) = ${rsi7Val.toFixed(0)} — động lượng giảm tiếp diễn.`);
  } else if (rsi7Val > 78) {
    score -= 0.4;
    riskNotes.push(`RSI(7) = ${rsi7Val.toFixed(0)} chạm vùng quá mua — cẩn trọng bull-trap ngắn hạn.`);
  } else if (rsi7Val < 22) {
    score += 0.4;
    riskNotes.push(`RSI(7) = ${rsi7Val.toFixed(0)} chạm vùng quá bán — cẩn trọng phản ứng nảy kỹ thuật.`);
  }

  // 3. Phân tích Basis (Đặc thù HĐTL VN30 + Ornstein-Uhlenbeck)
  let basisStatus: "PREMIUM" | "DISCOUNT" | "FAIR" = "FAIR";
  if (ouCalibration?.stationary && ouCalibration.signal === "STRONG_SHORT_BASIS_REVERSION") {
    basisStatus = "PREMIUM";
    score -= 0.5;
    riskNotes.push(ouCalibration.signalRationaleVi);
  } else if (ouCalibration?.stationary && ouCalibration.signal === "STRONG_LONG_BASIS_REVERSION") {
    basisStatus = "DISCOUNT";
    score += 0.6;
    evidence.push(ouCalibration.signalRationaleVi);
  } else if (basis > 4.5) {
    basisStatus = "PREMIUM";
    score -= 0.4; // Premium quá cao dễ bị ép bán đóng basis
    riskNotes.push(`Basis dương lớn (+${basis.toFixed(1)} điểm) — rủi ro áp lực Short ép basis về chỉ số cơ sở.`);
  } else if (basis < -4.5) {
    basisStatus = "DISCOUNT";
    score += 0.5; // Discount lớn là vùng hấp dẫn cho Long thu hẹp basis
    evidence.push(`Basis chiết khấu sâu (${basis.toFixed(1)} điểm) — kỳ vọng lực Long gom đón nhịp hội tụ.`);
  } else {
    evidence.push(
      ouCalibration?.stationary
        ? `${ouCalibration.signalRationaleVi} (t1/2=${ouCalibration.halfLifeMinutes}p)`
        : `Basis lành mạnh (${basis >= 0 ? "+" : ""}${basis.toFixed(1)} điểm) bám sát VN30.`,
    );
  }

  // 4. Phân tích Flow, Open Interest & Order Flow Imbalance (OFI)
  if (orderFlowImbalance) {
    if (orderFlowImbalance.institutionalPressure === "STRONG_BUY_PRESSURE") {
      score += 0.35;
      evidence.push(orderFlowImbalance.detailVi);
    } else if (orderFlowImbalance.institutionalPressure === "STRONG_SELL_PRESSURE") {
      score -= 0.35;
      evidence.push(orderFlowImbalance.detailVi);
    }
  }
  if (flowSignal) {
    if (flowSignal.kind === "long_buildup") {
      score += 0.8;
      evidence.push("Dòng tiền Long Build-up: Giá tăng đồng thuận cùng Open Interest tăng.");
    } else if (flowSignal.kind === "short_buildup") {
      score -= 0.8;
      evidence.push("Dòng tiền Short Build-up: Áp lực mở vị thế Short lớn gia tăng.");
    } else if (flowSignal.kind === "short_covering") {
      score += 0.3;
      evidence.push("Short Covering: Nhịp kéo do bên Short chủ động đóng vị thế cắt lỗ.");
    } else if (flowSignal.kind === "long_unwinding") {
      score -= 0.3;
      riskNotes.push("Long Unwinding: Bên Long đang hạ bớt tỷ trọng chốt lời.");
    }
  }

  score = Number(clamp(score, -3, 3).toFixed(2));

  // Xác định hướng Scalp
  let direction: DerivativeScalpSignal["direction"] = "neutral";
  let strength = Math.round(clamp(Math.abs(score) / 2.6, 0, 1) * 100);

  if (score >= 1.2) {
    direction = "watch-long";
  } else if (score <= -1.2) {
    direction = "watch-short";
  } else {
    direction = "neutral";
    strength = Math.min(strength, 45);
  }

  // Mức hỗ trợ / kháng cự vi mô
  const microSr = supportResistance(bars.slice(-48), 48);
  const support = microSr.support.length ? microSr.support : [lastPrice - 2.5, lastPrice - 5.0];
  const resistance = microSr.resistance.length ? microSr.resistance : [lastPrice + 2.5, lastPrice + 5.0];

  // Xây dựng Setup vào lệnh cụ thể
  let primarySetup: DerivativeScalpSetup | null = null;
  const stopBuffer = Math.max(2.8, Math.round(atrVal * 1.1 * 10) / 10);
  const targetBuffer = Math.round(stopBuffer * 2.1 * 10) / 10;

  if (direction === "watch-long") {
    const entry = Math.round(lastPrice * 10) / 10;
    const stopLoss = Math.round((entry - stopBuffer) * 10) / 10;
    const takeProfit = Math.round((entry + targetBuffer) * 10) / 10;
    primarySetup = {
      strategy: basis < -3 ? "Basis Convergence & Long Momentum" : "VWAP Pullback Long",
      direction: "BUY",
      status: "TRIGGERED",
      strength,
      entry,
      entryZone: [Math.round((entry - 0.6) * 10) / 10, Math.round((entry + 0.4) * 10) / 10],
      stopLoss,
      takeProfit,
      riskReward: 2.1,
      stopPoints: stopBuffer,
      targetPoints: targetBuffer,
      evidence: [
        `Vào lệnh quanh ${entry} khi giá retest VWAP/Hỗ trợ`,
        `Cắt lỗ cứng dưới ${stopLoss} (${stopBuffer} điểm ~ ${(stopBuffer * 100_000).toLocaleString("vi-VN")}đ/HĐ)`,
        `Chốt lời mục tiêu tại ${takeProfit} (+${targetBuffer} điểm ~ +${(targetBuffer * 100_000).toLocaleString("vi-VN")}đ/HĐ)`,
      ],
      riskNotes: ["Không nhồi thêm vị thế nếu thủng ngưỡng cắt lỗ."],
    };
  } else if (direction === "watch-short") {
    const entry = Math.round(lastPrice * 10) / 10;
    const stopLoss = Math.round((entry + stopBuffer) * 10) / 10;
    const takeProfit = Math.round((entry - targetBuffer) * 10) / 10;
    primarySetup = {
      strategy: basis > 3 ? "Basis Compression & Short Momentum" : "Breakdown & VWAP Rejection",
      direction: "SELL",
      status: "TRIGGERED",
      strength,
      entry,
      entryZone: [Math.round((entry - 0.4) * 10) / 10, Math.round((entry + 0.6) * 10) / 10],
      stopLoss,
      takeProfit,
      riskReward: 2.1,
      stopPoints: stopBuffer,
      targetPoints: targetBuffer,
      evidence: [
        `Vào lệnh Short quanh ${entry} khi giá bị từ chối tại VWAP/Kháng cự`,
        `Cắt lỗ cứng trên ${stopLoss} (${stopBuffer} điểm ~ ${(stopBuffer * 100_000).toLocaleString("vi-VN")}đ/HĐ)`,
        `Chốt lời mục tiêu tại ${takeProfit} (+${targetBuffer} điểm ~ +${(targetBuffer * 100_000).toLocaleString("vi-VN")}đ/HĐ)`,
      ],
      riskNotes: ["Cẩn trọng phiên chiều khi cơ sở VN30 có lực kéo ngược bất ngờ."],
    };
  }

  // Thông số ký quỹ VSDC chuẩn
  const multiplier = contract.multiplier ?? 100_000;
  const tickSize = contract.tickSize ?? 0.1;
  const initialMarginPct = 0.17; // Tỷ lệ ký quỹ VSDC quy chuẩn 17%
  const notionalVnd = lastPrice * multiplier;
  const initialMarginPerLotVnd = Math.round(notionalVnd * initialMarginPct);
  const effectiveLeverage = Math.round((1 / initialMarginPct) * 10) / 10; // ~5.9x

  riskNotes.push(
    `Ký quỹ ban đầu VSDC: ~${(initialMarginPerLotVnd / 1_000_000).toFixed(1)} triệu VND/HĐ (Đòn bẩy thực tế ~${effectiveLeverage}x).`,
  );

  const signal: DerivativeScalpSignal = {
    symbol: sym,
    timeframe,
    direction,
    strength,
    score,
    last: lastPrice,
    spotPrice: spot,
    basis,
    basisStatus,
    vwap,
    ema9: ema9Val,
    ema21: ema21Val,
    rsi7: rsi7Val,
    atr: atrVal,
    flowKind: flowSignal?.kind ?? null,
    flowConfidence: flowSignal?.confidence ?? null,
    openInterest: quote?.openInterest ?? null,
    volume: quote?.volume ?? null,
    micro: { support, resistance },
    primarySetup,
    marginInfo: {
      productId: contract.productId,
      multiplier,
      tickSize,
      initialMarginPct,
      initialMarginPerLotVnd,
      effectiveLeverage,
    },
    ouCalibration,
    orderFlowImbalance,
    evidence,
    riskNotes,
  };

  const meta = buildMeta({
    source: "hnx-vsdc-scalp-engine",
    sourceTimestampMs: Date.now(),
    note: `Phái sinh scalping M15→M5→M1 · Tỷ lệ ký quỹ VSDC 17% · 1 điểm = 100.000đ`,
  });

  return { result: { signal, quality: "VALID" }, meta };
}
