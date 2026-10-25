import { OhlcvBar } from "../types";
import { batchVnOhlcv } from "../services/ohlcv-batch";

export type StrategyType = "breakout" | "canslim" | "ma_cross" | "value";

export interface BacktestRequest {
  strategy?: StrategyType;
  holdingDays?: number;
  stopLossPct?: number; // e.g. 7 for 7%
  takeProfitPct?: number; // e.g. 15 for 15%
  symbols?: string[];
  initialCapital?: number;
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
  generatedAt: string;
}

const STRATEGY_METADATA: Record<StrategyType, { name: string; desc: string }> = {
  breakout: {
    name: "Breakout Volume Spike (Đột phá nền giá)",
    desc: "Mua khi giá vượt đỉnh 20 phiên kèm khối lượng giao dịch gấp 1.5x khối lượng trung bình 20 phiên.",
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

export async function runScreenerBacktest(req: BacktestRequest = {}): Promise<ScreenerBacktestResult> {
  const validStrategies: StrategyType[] = ["breakout", "canslim", "ma_cross", "value"];
  const strategy: StrategyType = validStrategies.includes(req.strategy as StrategyType)
    ? (req.strategy as StrategyType)
    : "breakout";
  const holdingDays = Math.max(5, Math.min(req.holdingDays || 20, 90));
  const stopLossPct = Math.max(2, Math.min(req.stopLossPct || 7, 20)); // %
  const takeProfitPct = Math.max(5, Math.min(req.takeProfitPct || 15, 50)); // %
  const initialCapital = req.initialCapital || 100_000_000;
  const symbols = (req.symbols && req.symbols.length > 0) ? req.symbols.slice(0, 20) : DEFAULT_UNIVERSE;

  // 1. Fetch OHLCV batch for symbols (180 bars for 9 months historical lookback)
  const ohlcvMap = await batchVnOhlcv(symbols, {
    bars: 180,
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

        if (strategy === "breakout") {
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

  // 3. Compute Metrics
  const totalTrades = allTrades.length;
  const winningTrades = allTrades.filter(t => t.outcome === "WIN").length;
  const losingTrades = allTrades.filter(t => t.outcome === "LOSS").length;
  const winRatePct = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const totalGains = allTrades.filter(t => t.returnPct > 0).reduce((acc, t) => acc + t.returnPct, 0);
  const totalLosses = Math.abs(allTrades.filter(t => t.returnPct < 0).reduce((acc, t) => acc + t.returnPct, 0));
  const profitFactor = totalLosses > 0 ? Number((totalGains / totalLosses).toFixed(2)) : (totalGains > 0 ? 9.99 : 1.0);

  const avgGainPct = winningTrades > 0 ? Number((totalGains / winningTrades).toFixed(2)) : 0;
  const avgLossPct = losingTrades > 0 ? Number((totalLosses / losingTrades).toFixed(2)) : 0;

  // 4. Build Equity Curve Simulation
  // We allocate capital equally into concurrent trade slots (max 5 slots)
  const MAX_SLOTS = 5;
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownPct = 0;

  // Gather unique dates from all validEntries
  const dateSet = new Set<string>();
  for (const { bars } of validEntries) {
    for (let i = 50; i < bars.length; i++) {
      dateSet.add(formatBarDate(bars[i].time));
    }
  }
  const timeline = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Benchmark: Equal weighted portfolio of all analyzed stocks over timeline
  let benchmarkValue = initialCapital;
  const equityCurve: EquityPoint[] = [];

  // Track trade exits on dates
  const tradesByExitDate = new Map<string, BacktestTrade[]>();
  for (const trade of allTrades) {
    const list = tradesByExitDate.get(trade.exitDate) || [];
    list.push(trade);
    tradesByExitDate.set(trade.exitDate, list);
  }

  // Benchmark step calculation
  const firstDate = timeline[0];
  const baselineCloses = new Map<string, number>();
  for (const { symbol, bars } of validEntries) {
    const bar = bars.find(b => formatBarDate(b.time) >= firstDate);
    if (bar) baselineCloses.set(symbol, bar.close);
  }

  for (let t = 0; t < timeline.length; t++) {
    const d = timeline[t];

    // Check if any trades closed today
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

    // Benchmark value based on basket close ratio
    let basketRatioSum = 0;
    let basketCount = 0;
    for (const { symbol, bars } of validEntries) {
      const base = baselineCloses.get(symbol);
      const curBar = bars.find(b => formatBarDate(b.time) === d);
      if (base && curBar && base > 0) {
        basketRatioSum += curBar.close / base;
        basketCount++;
      }
    }

    const avgBasketRatio = basketCount > 0 ? basketRatioSum / basketCount : 1;
    benchmarkValue = Math.round(initialCapital * avgBasketRatio);

    // Record sample point (weekly or final to keep curve concise)
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

  const meta = STRATEGY_METADATA[strategy] || STRATEGY_METADATA.breakout;

  return {
    strategy,
    strategyName: meta.name,
    description: meta.desc,
    initialCapital,
    finalCapital,
    totalReturnPct,
    benchmarkReturnPct,
    alphaPct,
    winRatePct,
    totalTrades,
    winningTrades,
    losingTrades,
    profitFactor,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    avgGainPct,
    avgLossPct,
    equityCurve,
    trades: allTrades.slice(-20), // return recent 20 trades for UI preview
    analyzedSymbols: validEntries.map(e => e.symbol),
    generatedAt: new Date().toISOString(),
  };
}
