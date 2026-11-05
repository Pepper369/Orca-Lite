/**
 * Domestic Flow & Orderbook Pressure Engine.
 * Analyzes active buyer vs seller volume balance and domestic vs foreign participation.
 * Ported from lotusmarket (Go/Python signals).
 */

export interface StockOrderData {
  ticker: string;
  volume: number;
  bidVol?: number;
  askVol?: number;
  foreignBuyVol?: number;
  foreignSellVol?: number;
}

export type DomesticFlowSignal =
  | "mua mạnh"
  | "nghiêng mua"
  | "cân bằng"
  | "nghiêng bán"
  | "bán mạnh";

export interface DomesticFlowResult {
  totalVolume: number;
  domesticVolume: number;
  foreignVolume: number;
  foreignPct: number;
  buyPressure: number; // 0 - 100%
  signal: DomesticFlowSignal;
  signalVi: string;
  topBuyers: string[];
  topSellers: string[];
  summaryVi: string;
}

function classifyDomesticSignal(buyPressure: number): DomesticFlowSignal {
  if (buyPressure >= 60) return "mua mạnh";
  if (buyPressure >= 53) return "nghiêng mua";
  if (buyPressure >= 47) return "cân bằng";
  if (buyPressure >= 40) return "nghiêng bán";
  return "bán mạnh";
}

export function computeDomesticFlow(stocks: StockOrderData[]): DomesticFlowResult {
  let totalVol = 0;
  let foreignVol = 0;
  let totalBid = 0;
  let totalAsk = 0;

  const pressures: Array<{ ticker: string; ratio: number }> = [];

  for (const s of stocks) {
    totalVol += s.volume;
    const fVol = (s.foreignBuyVol ?? 0) + (s.foreignSellVol ?? 0);
    foreignVol += fVol;

    const bVol = s.bidVol ?? 0;
    const aVol = s.askVol ?? 0;
    totalBid += bVol;
    totalAsk += aVol;

    if (bVol + aVol > 0) {
      const ratio = (bVol / (bVol + aVol)) * 100;
      pressures.push({ ticker: s.ticker, ratio });
    }
  }

  let buyPressure = 50.0;
  if (totalBid + totalAsk > 0) {
    buyPressure = Number(((totalBid / (totalBid + totalAsk)) * 100).toFixed(1));
  }

  const domesticVolume = Math.max(0, totalVol - foreignVol);
  const foreignPct = totalVol > 0 ? Number(((foreignVol / totalVol) * 100).toFixed(1)) : 0;
  const signal = classifyDomesticSignal(buyPressure);

  pressures.sort((a, b) => b.ratio - a.ratio);
  const topBuyers = pressures.slice(0, 3).map((p) => p.ticker);
  const topSellers = pressures.slice(-3).reverse().map((p) => p.ticker);

  const signalVi =
    signal === "mua mạnh"
      ? "Lực mua chủ động áp đảo (>=60%)"
      : signal === "nghiêng mua"
      ? "Phe mua chiếm ưu thế (53-60%)"
      : signal === "cân bằng"
      ? "Cung cầu giằng co (47-53%)"
      : signal === "nghiêng bán"
      ? "Phe bán chiếm ưu thế (40-47%)"
      : "Lực bán tháo áp đảo (<40%)";

  const summaryVi = `Dòng tiền nội chiếm ${(100 - foreignPct).toFixed(1)}% thanh khoản. Tỷ lệ đặt mua đạt ${buyPressure}% (${signalVi}).`;

  return {
    totalVolume: totalVol,
    domesticVolume,
    foreignVolume: foreignVol,
    foreignPct,
    buyPressure,
    signal,
    signalVi,
    topBuyers,
    topSellers,
    summaryVi,
  };
}
