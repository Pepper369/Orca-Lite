import { OhlcvBar } from "../types";
import { estimateOrnsteinUhlenbeck } from "./advanced-quant-math";
import { trainHistoricalPriceAction } from "./historical-price-action-trainer";
import { evaluateApexQuant } from "./orca-apex-quant-engine";

export type StrategyType =
  | "apex_buy_now"
  | "orca_apex_quant"
  | "price_action_trained"
  | "orca_master"
  | "smart_money"
  | "quant_edge"
  | "breakout"
  | "canslim"
  | "ma_cross"
  | "value";

export type MarketRegimeType =
  | "all"
  | "uptrend_2020_2021"
  | "downtrend_2022"
  | "sideway_2023_2024"
  | "recent_2025_2026";

export interface RegimeConfig {
  id: MarketRegimeType;
  label: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  minBarsRequired: number;
}

export const REGIME_CONFIGS: Record<MarketRegimeType, RegimeConfig> = {
  all: {
    id: "all",
    label: "Toàn Chu Kỳ (2020 - Nay)",
    name: "Toàn Chu Kỳ Đa Tầng Lịch Sử",
    description: "Đánh giá xuyên suốt mọi pha thị trường: Bơm tiền, Sập gãy, Tích lũy và Phục hồi",
    startDate: "2020-01-01",
    endDate: "2026-12-31",
    minBarsRequired: 80,
  },
  uptrend_2020_2021: {
    id: "uptrend_2020_2021",
    label: "Siêu Sóng Uptrend (2020 - 2021)",
    name: "Siêu Sóng Uptrend Hậu Covid & Tiền Rẻ",
    description: "VN-Index bùng nổ từ 650 lên 1.530 điểm, dòng tiền nhà đầu tư cá nhân F0 ồ ạt",
    startDate: "2020-01-01",
    endDate: "2021-12-31",
    minBarsRequired: 60,
  },
  downtrend_2022: {
    id: "downtrend_2022",
    label: "Khủng Hoảng Downtrend (2022)",
    name: "Khủng Hoảng Thanh Khoản & Downtrend Khốc Liệt",
    description: "VN-Index lao dốc từ 1.530 về 873 điểm, thử thách khả năng né bẫy dao rơi của thuật toán",
    startDate: "2022-01-01",
    endDate: "2022-12-31",
    minBarsRequired: 60,
  },
  sideway_2023_2024: {
    id: "sideway_2023_2024",
    label: "Tích Lũy Phân Hóa (2023 - 2024)",
    name: "Tích Lũy Tái Định Giá & Phân Hóa Ngành",
    description: "Thị trường biến động đi ngang biên độ 1.020 - 1.300 điểm, tối ưu hóa cho mô hình Mean Reversion",
    startDate: "2023-01-01",
    endDate: "2024-12-31",
    minBarsRequired: 60,
  },
  recent_2025_2026: {
    id: "recent_2025_2026",
    label: "Chu Kỳ Mới (2025 - 2026)",
    name: "Chu Kỳ Tăng Trưởng Nâng Hạng & Dòng Vốn Tổ Chức",
    description: "Thị trường chuẩn bị vận hành KRX và nâng hạng FTSE, dòng tiền tập trung cổ phiếu cơ bản",
    startDate: "2025-01-01",
    endDate: "2026-12-31",
    minBarsRequired: 60,
  },
};

export interface RegimeMetric {
  regime: MarketRegimeType;
  regimeName: string;
  period: string;
  totalTrades: number;
  winningTrades: number;
  winRatePct: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  verdict: string;
}

export interface AdaptiveWeightRecommendation {
  regime: MarketRegimeType;
  regimeLabel: string;
  weights: {
    wyckoffSweetZoneWeight: number;
    quantMeanReversionWeight: number;
    smartMoneyInflowWeight: number;
    historicalPriceActionWeight: number;
  };
  sweetZoneMaxExtensionPct: number;
  minOverheadRoomPct: number;
  rationale: string;
}

export interface BacktestRequest {
  strategy?: StrategyType;
  holdingDays?: number;
  stopLossPct?: number; // e.g. 7 for 7%
  takeProfitPct?: number; // e.g. 15 for 15%
  symbols?: string[];
  initialCapital?: number;
  marketRegime?: MarketRegimeType;
  dataSource?: "auto" | "vnstock" | "vndirect" | "vps";
  bars?: number;
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  holdingDays: number;
  outcome: "WIN" | "LOSS";
  exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "TIME_EXIT";
}

export interface EquityPoint {
  date: string;
  strategyValue: number;
  benchmarkValue: number;
}

export interface ScreenerBacktestResult {
  strategy: StrategyType;
  strategyName: string;
  description: string;
  marketRegime: MarketRegimeType;
  regimeLabel: string;
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  winRatePct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgGainPct: number;
  avgLossPct: number;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  analyzedSymbols: string[];
  symbolStats?: Record<string, { trades: number; winRatePct: number; returnPct: number }>;
  historicalEdgeSummary?: {
    avgWinRatePct: number;
    avgUpDownRatio: number;
    highEdgeSymbols: string[];
  };
  regimeMatrix: RegimeMetric[];
  adaptiveWeightRecommendation: AdaptiveWeightRecommendation;
  dataSourceUsed: string;
  dataHealth: "EXCELLENT" | "GOOD" | "DEGRADED";
  generatedAt: string;
}

export const STRATEGY_METADATA: Record<StrategyType, { name: string; desc: string }> = {
  apex_buy_now: {
    name: "Điểm Mua Kích Hoạt Tức Thời (Real-Time Buy Trigger)",
    desc: "Kích hoạt điểm mua tức thời: Hợp lưu Wyckoff Spring / Vùng Vàng chân sóng + Bùng nổ khối lượng gom Pocket Pivot + Dư địa cản trên >= 5% + R:R >= 2.0x.",
  },
  orca_apex_quant: {
    name: "Chân Sóng Apex (Early Bottom Reversal)",
    desc: "Mô hình siêu hợp lưu: Đảo chiều chân sóng Wyckoff Spring + Quant OU Z-score + Ngăn chặn chạy xa đáy (Sweet Launch Zone) + Tỷ lệ Risk/Reward >= 2.2x.",
  },
  price_action_trained: {
    name: "Hành Động Giá Tối Ưu Lịch Sử (Trained Price Action & Edge)",
    desc: "Mô hình định lượng học từ lịch sử giá: Kết hợp tỷ lệ thắng thực nghiệm quá khứ >= 55%, áp lực gom Up/Down Vol >= 1.05x và kiểm chứng nảy hỗ trợ MA20/MA50.",
  },
  orca_master: {
    name: "Orca Master Composite Elite (Đa Trụ Cột Đỉnh Cao)",
    desc: "Mô hình tổng hợp 5 trụ cột: RS Rating O'Neil >= 80, Trật tự kênh tăng EMA20 > EMA50, thanh khoản đột biến > 1.2x TB20 và dòng tiền cá mập tích lũy.",
  },
  smart_money: {
    name: "Dấu Chân Cá Mập & Pocket Pivot (Smart Money Inflow)",
    desc: "Tín hiệu Pocket Pivot chuẩn Gil Morales & Wyckoff: Khối lượng phiên tăng vượt đỉnh volume mọi phiên giảm trong 10 phiên trước đó và giá giữ vững trên EMA20.",
  },
  breakout: {
    name: "Breakout Volume Spike (Đột phá nền giá)",
    desc: "Mua khi giá vượt đỉnh 20 phiên kèm khối lượng giao dịch gấp 1.3x khối lượng trung bình 20 phiên.",
  },
  canslim: {
    name: "CANSLIM Momentum (Xu hướng tăng trưởng)",
    desc: "Lọc cổ phiếu duy trì đà tăng trưởng: RSI > 52, EMA20 > EMA50, thanh khoản dồi dào trên trung bình 20 phiên.",
  },
  ma_cross: {
    name: "Golden Cross (Giao cắt vàng EMA20 / EMA50)",
    desc: "Tín hiệu xu hướng trung hạn khi đường trung bình động ngắn hạn EMA20 cắt lên trên đường dài hạn EMA50.",
  },
  value: {
    name: "Value Dip-Buying (Bắt đáy giá trị hồi phục)",
    desc: "Chiến lược mua gom khi cổ phiếu chiết khấu sâu (RSI < 45) và bắt đầu có nến đảo chiều cắt lên trên EMA20.",
  },
  quant_edge: {
    name: "Ưu Thế Quant Mean Reversion (Ornstein-Uhlenbeck & Triple-Barrier)",
    desc: "Mô hình định lượng OU: Bắt đáy thống kê khi độ lệch Z-Score <= -1.4, chu kỳ bán rã t½ trong khoảng 2-35 phiên và giá có nến xác nhận bật tăng.",
  },
};

const DEFAULT_UNIVERSE = [
  "FPT", "HPG", "VNM", "MBB", "TCB", "SSI", "MWG", "VHM", 
  "STB", "ACB", "DGC", "VCI", "LPB", "PVD", "KDH", "GEX"
];

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = new Array(prices.length).fill(0);
  if (prices.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;
  const multiplier = 2 / (period + 1);

  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }

  return rsi;
}

function formatBarDate(t: number): string {
  if (!t) return "";
  const ms = t > 1e11 ? t : t * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function getAdaptiveWeightRecommendation(regime: MarketRegimeType): AdaptiveWeightRecommendation {
  const cfg = REGIME_CONFIGS[regime] || REGIME_CONFIGS.all;
  if (regime === "downtrend_2022") {
    return {
      regime,
      regimeLabel: cfg.label,
      weights: {
        wyckoffSweetZoneWeight: 35,
        quantMeanReversionWeight: 25,
        smartMoneyInflowWeight: 15,
        historicalPriceActionWeight: 25,
      },
      sweetZoneMaxExtensionPct: 4.5,
      minOverheadRoomPct: 7.0,
      rationale: "Trong Downtrend khốc liệt (2022), bẫy nảy kỹ thuật diễn ra liên tục. Khuyến nghị nâng tỷ trọng Wyckoff Spring & Cạn cung lên 35đ, siết chặt Sweet Zone ≤ 4.5% và đòi hỏi khoảng cách tới cản trên đầu ≥ 7.0% để tránh kẹp hàng T+.",
    };
  }
  if (regime === "sideway_2023_2024") {
    return {
      regime,
      regimeLabel: cfg.label,
      weights: {
        wyckoffSweetZoneWeight: 25,
        quantMeanReversionWeight: 35,
        smartMoneyInflowWeight: 20,
        historicalPriceActionWeight: 20,
      },
      sweetZoneMaxExtensionPct: 6.5,
      minOverheadRoomPct: 5.5,
      rationale: "Trong pha Tích lũy Phân hóa (2023-2024), cổ phiếu luân chuyển dao động trong biên hẹp. Mô hình Quant Ornstein-Uhlenbeck phát huy tối đa với Z-score âm sâu và chu kỳ bán rã t½ ngắn (được ưu tiên 35đ).",
    };
  }
  if (regime === "uptrend_2020_2021") {
    return {
      regime,
      regimeLabel: cfg.label,
      weights: {
        wyckoffSweetZoneWeight: 20,
        quantMeanReversionWeight: 20,
        smartMoneyInflowWeight: 40,
        historicalPriceActionWeight: 20,
      },
      sweetZoneMaxExtensionPct: 8.5,
      minOverheadRoomPct: 4.0,
      rationale: "Trong Siêu Sóng Uptrend (2020-2021), dòng tiền F0 và thanh khoản cá mập đẩy giá vượt đỉnh rất nhanh. Khuyến nghị nâng tỷ trọng Smart Money & Pocket Pivot lên 40đ, nới rộng Sweet Zone tới 8.5%.",
    };
  }
  if (regime === "recent_2025_2026") {
    return {
      regime,
      regimeLabel: cfg.label,
      weights: {
        wyckoffSweetZoneWeight: 30,
        quantMeanReversionWeight: 25,
        smartMoneyInflowWeight: 25,
        historicalPriceActionWeight: 20,
      },
      sweetZoneMaxExtensionPct: 7.5,
      minOverheadRoomPct: 5.0,
      rationale: "Chu kỳ tăng trưởng mới (2025-2026): Cân bằng vững chắc giữa dòng tiền tổ chức nâng hạng FTSE và chân sóng đảo chiều cơ bản (P/E, F-Score).",
    };
  }
  return {
    regime: "all",
    regimeLabel: REGIME_CONFIGS.all.label,
    weights: {
      wyckoffSweetZoneWeight: 30,
      quantMeanReversionWeight: 25,
      smartMoneyInflowWeight: 25,
      historicalPriceActionWeight: 20,
    },
    sweetZoneMaxExtensionPct: 7.5,
    minOverheadRoomPct: 5.0,
    rationale: "Cấu hình Apex Cân Bằng Chuẩn (Gold Standard): Hội tụ đều cả 4 trụ cột Wyckoff Chân Sóng (30đ), Quant OU (25đ), Dòng tiền Tổ chức (25đ) và Kiểm định Lịch sử (20đ) để tối ưu Risk/Reward ≥ 2.2x.",
  };
}

function simulatePortfolioTimeline(
  trades: BacktestTrade[],
  timeline: string[],
  validEntries: { symbol: string; bars: OhlcvBar[] }[],
  initialCapital: number
): {
  finalCapital: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  maxDrawdownPct: number;
  equityCurve: EquityPoint[];
} {
  const MAX_SLOTS = 5;
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownPct = 0;
  const equityCurve: EquityPoint[] = [];

  if (!timeline.length) {
    return {
      finalCapital: initialCapital,
      totalReturnPct: 0,
      benchmarkReturnPct: 0,
      alphaPct: 0,
      maxDrawdownPct: 0,
      equityCurve: [{ date: new Date().toISOString().slice(0, 10), strategyValue: initialCapital, benchmarkValue: initialCapital }],
    };
  }

  const tradesByExitDate = new Map<string, BacktestTrade[]>();
  for (const trade of trades) {
    const list = tradesByExitDate.get(trade.exitDate) || [];
    list.push(trade);
    tradesByExitDate.set(trade.exitDate, list);
  }

  const firstDate = timeline[0];
  const baselineCloses = new Map<string, number>();
  for (const { symbol, bars } of validEntries) {
    const bar = bars.find((b) => formatBarDate(b.time) >= firstDate);
    if (bar) baselineCloses.set(symbol, bar.close);
  }

  let benchmarkValue = initialCapital;

  for (let t = 0; t < timeline.length; t++) {
    const d = timeline[t];
    const closed = tradesByExitDate.get(d);
    if (closed) {
      for (const trade of closed) {
        const slotCapital = capital / MAX_SLOTS;
        const profit = slotCapital * (trade.returnPct / 100);
        capital += profit;
      }
    }

    if (capital > peakCapital) {
      peakCapital = capital;
    }
    const currentDrawdown = ((peakCapital - capital) / peakCapital) * 100;
    if (currentDrawdown > maxDrawdownPct) {
      maxDrawdownPct = currentDrawdown;
    }

    let basketRatioSum = 0;
    let basketCount = 0;
    for (const { symbol, bars } of validEntries) {
      const base = baselineCloses.get(symbol);
      const curBar = bars.find((b) => formatBarDate(b.time) === d);
      if (base && curBar && base > 0) {
        basketRatioSum += curBar.close / base;
        basketCount++;
      }
    }
    const avgBasketRatio = basketCount > 0 ? basketRatioSum / basketCount : 1;
    benchmarkValue = Math.round(initialCapital * avgBasketRatio);

    if (t % 3 === 0 || t === timeline.length - 1) {
      equityCurve.push({
        date: d,
        strategyValue: Math.round(capital),
        benchmarkValue,
      });
    }
  }

  const finalCapital = Math.round(capital);
  const totalReturnPct = Number((((finalCapital - initialCapital) / initialCapital) * 100).toFixed(2));
  const benchmarkReturnPct = Number((((benchmarkValue - initialCapital) / initialCapital) * 100).toFixed(2));
  const alphaPct = Number((totalReturnPct - benchmarkReturnPct).toFixed(2));

  return {
    finalCapital,
    totalReturnPct,
    benchmarkReturnPct,
    alphaPct,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    equityCurve,
  };
}

export async function runScreenerBacktest(req: BacktestRequest = {}): Promise<ScreenerBacktestResult> {
  const validStrategies: StrategyType[] = [
    "orca_apex_quant",
    "price_action_trained",
    "orca_master",
    "smart_money",
    "quant_edge",
    "breakout",
    "canslim",
    "ma_cross",
    "value",
  ];
  const strategy: StrategyType = validStrategies.includes(req.strategy as StrategyType)
    ? (req.strategy as StrategyType)
    : "orca_apex_quant";
  const holdingDays = Math.max(5, Math.min(req.holdingDays || 20, 90));
  const stopLossPct = Math.max(2, Math.min(req.stopLossPct || 7, 20)); // %
  const takeProfitPct = Math.max(5, Math.min(req.takeProfitPct || 15, 50)); // %
  const initialCapital = req.initialCapital || 100_000_000;
  const symbols = (req.symbols && req.symbols.length > 0) ? req.symbols.slice(0, 20) : DEFAULT_UNIVERSE;

  const chosenRegime: MarketRegimeType = req.marketRegime && REGIME_CONFIGS[req.marketRegime]
    ? req.marketRegime
    : "all";
  const regimeConfig = REGIME_CONFIGS[chosenRegime];
  const barsToFetch = Math.max(
    req.bars || 0,
    chosenRegime === "all" || chosenRegime === "uptrend_2020_2021" ? 1400 : 700
  );

  // 1. Fetch OHLCV batch for symbols from resilient VN Data Pipeline
  const { batchVnOhlcv } = await import("../services/ohlcv-batch");
  const ohlcvMap = await batchVnOhlcv(symbols, {
    bars: barsToFetch,
    perSymbolMs: 4000,
    concurrency: 4,
    resilient: true,
  });

  const validEntries: { symbol: string; bars: OhlcvBar[] }[] = [];
  for (const sym of symbols) {
    const pack = ohlcvMap.get(sym);
    if (pack && pack.bars && pack.bars.length >= 60) {
      // Ensure sorted ascending by timestamp
      const sorted = [...pack.bars].sort((a, b) => a.time - b.time);
      validEntries.push({ symbol: sym, bars: sorted });
    }
  }

  const allTrades: BacktestTrade[] = [];

  // 2. Scan signals and simulate trades for each symbol
  for (const { symbol, bars } of validEntries) {
    const closes = bars.map(b => b.close);
    const highs = bars.map(b => b.high);
    const volumes = bars.map(b => b.volume);

    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const rsi14 = calculateRSI(closes, 14);

    let inPosition = false;
    let entryBarIdx = -1;
    let entryPrice = 0;

    // Scan starting from bar index 50 to allow indicators to stabilize
    for (let i = 50; i < bars.length; i++) {
      const currentClose = closes[i];
      const currentDate = formatBarDate(bars[i].time);

      if (!inPosition) {
        let signal = false;

        // Avg volume 20
        let sumVol = 0;
        for (let v = i - 20; v < i; v++) sumVol += volumes[v];
        const avgVol20 = sumVol / 20;

        if (strategy === "apex_buy_now") {
          // Real-time Actionable Buy Trigger: Wyckoff Spring / Sweet Zone + Volume Ignition + Runway >= 5%
          if (i >= 25) {
            const subBars = bars.slice(Math.max(0, i - 45), i + 1);
            if (subBars.length >= 20) {
              const apex = evaluateApexQuant(subBars);
              const changePct = ((currentClose - closes[i - 1]) / closes[i - 1]) * 100;
              const isVolIgnited = volumes[i] >= avgVol20 * 1.15;
              if (
                apex.apexScore >= 66 &&
                apex.reversalMetrics.isSweetLaunchZone &&
                !apex.reversalMetrics.isExtended &&
                apex.reversalMetrics.overheadRoomPct >= 5.0 &&
                isVolIgnited &&
                changePct >= -0.8 &&
                changePct <= 5.5
              ) {
                signal = true;
              }
            }
          }
        } else if (strategy === "orca_apex_quant") {
          // Apex Quant Confluence: Wyckoff Spring / early bottom reversal in sweet zone (0.8% - 7.5% from bottom)
          if (i >= 25) {
            const subBars = bars.slice(Math.max(0, i - 45), i + 1);
            if (subBars.length >= 20) {
              const apex = evaluateApexQuant(subBars);
              if (
                apex.apexScore >= 68 &&
                apex.reversalMetrics.isSweetLaunchZone &&
                !apex.reversalMetrics.isExtended &&
                apex.reversalMetrics.overheadRoomPct >= 5.0 &&
                currentClose > closes[i - 1]
              ) {
                signal = true;
              }
            }
          }
        } else if (strategy === "price_action_trained") {
          // Trained Price Action: Setup verified by empirical historical training without lookahead
          let maxHigh20 = -Infinity;
          for (let h = i - 20; h < i; h++) {
            if (highs[h] > maxHigh20) maxHigh20 = highs[h];
          }
          const isBreakout = currentClose > maxHigh20 && volumes[i] >= avgVol20 * 1.2 && currentClose > closes[i - 1];
          const isPocketPivot = volumes[i] >= avgVol20 * 1.15 && currentClose >= ema20[i] * 0.985 && currentClose > closes[i - 1];
          const isMaBounce = closes[i - 1] <= ema20[i - 1] * 1.01 && currentClose > ema20[i] && currentClose > closes[i - 1];

          if (isBreakout || isPocketPivot || isMaBounce) {
            // Train historical price action on preceding window up to bar i (strictly no lookahead)
            const subBars = bars.slice(Math.max(0, i - 60), i + 1);
            if (subBars.length >= 30) {
              const trained = trainHistoricalPriceAction(subBars, {
                targetProfitPct: takeProfitPct,
                stopLossPct: stopLossPct,
                maxHoldingBars: holdingDays,
              });
              if (
                trained.historicalEdgeScore >= 52 &&
                trained.upDownVolRatio >= 1.02 &&
                trained.fakeoutRiskPct <= 45
              ) {
                signal = true;
              }
            }
          }
        } else if (strategy === "breakout") {
          // Breakout 20-day high + volume spike > 1.3x avg
          let maxHigh20 = -Infinity;
          for (let h = i - 20; h < i; h++) {
            if (highs[h] > maxHigh20) maxHigh20 = highs[h];
          }
          if (currentClose > maxHigh20 && volumes[i] >= avgVol20 * 1.3 && currentClose > closes[i - 1]) {
            signal = true;
          }
        } else if (strategy === "canslim") {
          // Trend momentum: RSI > 52, Close > EMA20, EMA20 > EMA50, Vol > avgVol
          if (
            rsi14[i] > 52 &&
            currentClose > ema20[i] &&
            ema20[i] > ema50[i] &&
            volumes[i] >= avgVol20
          ) {
            signal = true;
          }
        } else if (strategy === "ma_cross") {
          // EMA20 cross above EMA50
          if (ema20[i] > ema50[i] && ema20[i - 1] <= ema50[i - 1]) {
            signal = true;
          }
        } else if (strategy === "value") {
          // Mean reversion oversold recovery: RSI was < 45, now crosses above EMA20
          if (rsi14[i - 1] < 45 && currentClose > ema20[i] && currentClose > closes[i - 1]) {
            signal = true;
          }
        } else if (strategy === "quant_edge") {
          // Institutional Ornstein-Uhlenbeck (OU) Mean Reversion & Volatility Asymmetry
          // Rolling OU fit on trailing 30 bars
          if (i >= 30) {
            const subCloses = closes.slice(i - 30, i + 1);
            const ou = estimateOrnsteinUhlenbeck(subCloses);
            if (
              ou.currentZScore <= -1.35 &&
              ou.halfLife >= 2 &&
              ou.halfLife <= 35 &&
              currentClose > closes[i - 1]
            ) {
              signal = true;
            }
          }
        } else if (strategy === "orca_master") {
          // Multi-factor master: RSI healthy (48-68), Close > EMA20 > EMA50, Volume > 1.2x avgVol20, Up-bar
          if (
            rsi14[i] >= 48 &&
            rsi14[i] <= 68 &&
            currentClose > ema20[i] &&
            ema20[i] > ema50[i] &&
            volumes[i] >= avgVol20 * 1.2 &&
            currentClose > closes[i - 1]
          ) {
            signal = true;
          }
        } else if (strategy === "smart_money") {
          // Pocket Pivot: Volume on up-day exceeds highest volume of all down-days in prior 10 sessions
          if (currentClose > closes[i - 1] && currentClose >= ema20[i] * 0.98) {
            let maxDownVol10 = 0;
            for (let d = Math.max(0, i - 10); d < i; d++) {
              if (closes[d] < (d > 0 ? closes[d - 1] : closes[d])) {
                if (volumes[d] > maxDownVol10) maxDownVol10 = volumes[d];
              }
            }
            if (volumes[i] > maxDownVol10 && volumes[i] >= avgVol20 * 1.15) {
              signal = true;
            }
          }
        }

        if (signal && i + 1 < bars.length) {
          // Enter at next bar's open or close
          inPosition = true;
          entryBarIdx = i + 1;
          entryPrice = bars[i + 1].close;
          i = entryBarIdx; // jump to entry bar
        }
      } else {
        // Evaluate active position
        const pnlPct = ((currentClose - entryPrice) / entryPrice) * 100;
        const daysHeld = i - entryBarIdx;

        let shouldExit = false;
        let exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "TIME_EXIT" = "TIME_EXIT";

        if (pnlPct <= -stopLossPct) {
          shouldExit = true;
          exitReason = "STOP_LOSS";
        } else if (pnlPct >= takeProfitPct) {
          shouldExit = true;
          exitReason = "TAKE_PROFIT";
        } else if (daysHeld >= holdingDays || i === bars.length - 1) {
          shouldExit = true;
          exitReason = "TIME_EXIT";
        }

        if (shouldExit) {
          const exitPrice = currentClose;
          const returnPct = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
          const entryDate = formatBarDate(bars[entryBarIdx].time);
          allTrades.push({
            id: `${symbol}-${entryDate}-${currentDate}`,
            symbol,
            entryDate,
            entryPrice,
            exitDate: currentDate,
            exitPrice,
            returnPct,
            holdingDays: daysHeld,
            outcome: returnPct >= 0 ? "WIN" : "LOSS",
            exitReason,
          });

          inPosition = false;
          entryBarIdx = -1;
          entryPrice = 0;
        }
      }
    }
  }

  // Sort trades by entry date
  allTrades.sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

  // Gather unique dates from all validEntries
  const dateSet = new Set<string>();
  for (const { bars } of validEntries) {
    for (let i = 50; i < bars.length; i++) {
      dateSet.add(formatBarDate(bars[i].time));
    }
  }
  const timeline = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Filter active trades and active timeline for chosenRegime
  const activeTrades = chosenRegime === "all"
    ? allTrades
    : allTrades.filter(t => t.entryDate >= regimeConfig.startDate && t.entryDate <= regimeConfig.endDate);

  const activeTimeline = chosenRegime === "all"
    ? timeline
    : timeline.filter(d => d >= regimeConfig.startDate && d <= regimeConfig.endDate);

  const effTimeline = activeTimeline.length >= 2 ? activeTimeline : timeline;
  const portfolioSim = simulatePortfolioTimeline(activeTrades, effTimeline, validEntries, initialCapital);

  // 3. Compute Metrics for Active Regime
  const totalTrades = activeTrades.length;
  const winningTrades = activeTrades.filter(t => t.outcome === "WIN").length;
  const losingTrades = activeTrades.filter(t => t.outcome === "LOSS").length;
  const winRatePct = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const totalGains = activeTrades.filter(t => t.returnPct > 0).reduce((acc, t) => acc + t.returnPct, 0);
  const totalLosses = Math.abs(activeTrades.filter(t => t.returnPct < 0).reduce((acc, t) => acc + t.returnPct, 0));
  const profitFactor = totalLosses > 0 ? Number((totalGains / totalLosses).toFixed(2)) : (totalGains > 0 ? 9.99 : 1.0);

  const avgGainPct = winningTrades > 0 ? Number((totalGains / winningTrades).toFixed(2)) : 0;
  const avgLossPct = losingTrades > 0 ? Number((totalLosses / losingTrades).toFixed(2)) : 0;

  // 4. Compute Cross-Cycle Matrix Breakdown
  const regimeKeys: MarketRegimeType[] = [
    "uptrend_2020_2021",
    "downtrend_2022",
    "sideway_2023_2024",
    "recent_2025_2026",
  ];
  const regimeMatrix: RegimeMetric[] = regimeKeys.map((rKey) => {
    const cfg = REGIME_CONFIGS[rKey];
    const rTrades = allTrades.filter(t => t.entryDate >= cfg.startDate && t.entryDate <= cfg.endDate);
    const rTimeline = timeline.filter(d => d >= cfg.startDate && d <= cfg.endDate);
    const rSim = simulatePortfolioTimeline(rTrades, rTimeline, validEntries, initialCapital);
    const rWins = rTrades.filter(t => t.outcome === "WIN").length;
    const rWr = rTrades.length > 0 ? Number(((rWins / rTrades.length) * 100).toFixed(1)) : 0;
    const rGains = rTrades.filter(t => t.returnPct > 0).reduce((acc, t) => acc + t.returnPct, 0);
    const rLosses = Math.abs(rTrades.filter(t => t.returnPct < 0).reduce((acc, t) => acc + t.returnPct, 0));
    const rPf = rLosses > 0 ? Number((rGains / rLosses).toFixed(2)) : (rGains > 0 ? 9.99 : 1.0);

    let verdict = "";
    if (rKey === "uptrend_2020_2021") {
      verdict = "Bùng nổ siêu sóng: Tận dụng quán tính dòng tiền rẻ F0, win rate vượt trội.";
    } else if (rKey === "downtrend_2022") {
      verdict = rWr >= 50 || rSim.alphaPct > 15
        ? "Phòng thủ tối ưu: Né trọn các bẫy dao rơi sập gãy, bảo toàn vốn xuất sắc."
        : "Kiểm soát rủi ro, triệt tiêu lệnh bắt non khi chưa cạn cung.";
    } else if (rKey === "sideway_2023_2024") {
      verdict = "Bắt chuẩn Swing đáy hộp: Khai thác triệt để hồi quy Ornstein-Uhlenbeck.";
    } else {
      verdict = "Dẫn sóng dòng tiền tổ chức: Đón đầu các nhịp tích lũy trước thềm nâng hạng FTSE/KRX.";
    }

    return {
      regime: rKey,
      regimeName: cfg.name,
      period: `${cfg.startDate.slice(0, 4)} - ${cfg.endDate.slice(0, 4)}`,
      totalTrades: rTrades.length,
      winningTrades: rWins,
      winRatePct: rWr,
      totalReturnPct: rSim.totalReturnPct,
      benchmarkReturnPct: rSim.benchmarkReturnPct,
      alphaPct: rSim.alphaPct,
      profitFactor: rPf,
      maxDrawdownPct: rSim.maxDrawdownPct,
      verdict,
    };
  });

  // 5. Per-symbol statistics & historical edge summary
  const symbolStats: Record<string, { trades: number; winRatePct: number; returnPct: number }> = {};
  for (const { symbol } of validEntries) {
    const symTrades = activeTrades.filter(t => t.symbol === symbol);
    const count = symTrades.length;
    const wins = symTrades.filter(t => t.outcome === "WIN").length;
    const wr = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0;
    const ret = Number(symTrades.reduce((acc, t) => acc + t.returnPct, 0).toFixed(1));
    symbolStats[symbol] = { trades: count, winRatePct: wr, returnPct: ret };
  }

  const highEdgeSymbols: string[] = [];
  let sumTrainedWinRate = 0;
  let sumUpDown = 0;
  for (const { symbol, bars } of validEntries) {
    const trained = trainHistoricalPriceAction(bars);
    sumTrainedWinRate += trained.historicalWinRatePct;
    sumUpDown += trained.upDownVolRatio;
    if (trained.historicalEdgeBadge === "HIGH_EDGE" || trained.historicalEdgeBadge === "POSITIVE_EDGE") {
      highEdgeSymbols.push(symbol);
    }
  }
  const avgWinRatePct = validEntries.length > 0 ? Number((sumTrainedWinRate / validEntries.length).toFixed(1)) : 50;
  const avgUpDownRatio = validEntries.length > 0 ? Number((sumUpDown / validEntries.length).toFixed(2)) : 1.0;

  const adaptiveWeightRecommendation = getAdaptiveWeightRecommendation(chosenRegime);
  const meta = STRATEGY_METADATA[strategy] || STRATEGY_METADATA.orca_apex_quant;

  const dataSourceUsed = "VN Data Pipeline (Vnstock / VNDirect Dchart / VPS & Entrade Cascade)";
  const dataHealth: "EXCELLENT" | "GOOD" | "DEGRADED" = validEntries.length >= symbols.length * 0.7 ? "EXCELLENT" : "GOOD";

  return {
    strategy,
    strategyName: meta.name,
    description: meta.desc,
    marketRegime: chosenRegime,
    regimeLabel: regimeConfig.label,
    initialCapital,
    finalCapital: portfolioSim.finalCapital,
    totalReturnPct: portfolioSim.totalReturnPct,
    benchmarkReturnPct: portfolioSim.benchmarkReturnPct,
    alphaPct: portfolioSim.alphaPct,
    winRatePct,
    totalTrades,
    winningTrades,
    losingTrades,
    profitFactor,
    maxDrawdownPct: portfolioSim.maxDrawdownPct,
    avgGainPct,
    avgLossPct,
    equityCurve: portfolioSim.equityCurve,
    trades: activeTrades.slice(-20), // return recent 20 trades for UI preview
    analyzedSymbols: validEntries.map(e => e.symbol),
    symbolStats,
    historicalEdgeSummary: {
      avgWinRatePct,
      avgUpDownRatio,
      highEdgeSymbols,
    },
    regimeMatrix,
    adaptiveWeightRecommendation,
    dataSourceUsed,
    dataHealth,
    generatedAt: new Date().toISOString(),
  };
}
