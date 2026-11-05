/**
 * Sector Flow Ranking & Alpha Rotation Matrix.
 * Ranks economic sectors by composite money flow, breadth ratio, and normalized trading value.
 * Ported from lotusmarket (Go/Python sector flow).
 */

import { sectorOf } from "../vn/master";

export interface StockFlowItem {
  ticker: string;
  netForeignVnd: number;
  changePct: number;
}

export interface SectorFlowItem {
  sector: string;
  rank: number;
  signal: "inflow" | "neutral" | "outflow";
  signalVi: string;
  netForeignVnd: number;
  avgChangePct: number;
  totalVolumeVnd: number;
  advancesCount: number;
  totalCount: number;
  breadth: string;
  topStocks: StockFlowItem[];
  score: number;
}

export interface InputStockQuote {
  ticker: string;
  close: number;
  volume: number;
  changePercent: number;
  foreignNetVol?: number;
  sector?: string;
}

export function rankSectorsByFlow(stocks: InputStockQuote[]): SectorFlowItem[] {
  interface SectorAccumulator {
    totalForeignValue: number;
    advances: number;
    total: number;
    totalVolume: number;
    totalVolumeVND: number;
    sumChangePct: number;
    stockFlows: StockFlowItem[];
  }

  const accMap = new Map<string, SectorAccumulator>();

  for (const s of stocks) {
    const sec = s.sector || sectorOf(s.ticker) || "Others";
    if (sec === "Others" || !sec) continue;

    let acc = accMap.get(sec);
    if (!acc) {
      acc = {
        totalForeignValue: 0,
        advances: 0,
        total: 0,
        totalVolume: 0,
        totalVolumeVND: 0,
        sumChangePct: 0,
        stockFlows: [],
      };
      accMap.set(sec, acc);
    }

    const flowValue = (s.foreignNetVol ?? 0) * s.close;
    acc.totalForeignValue += flowValue;
    acc.total++;
    acc.totalVolume += s.volume;
    acc.totalVolumeVND += s.volume * s.close;
    acc.sumChangePct += s.changePercent;
    if (s.changePercent > 0) acc.advances++;

    acc.stockFlows.push({
      ticker: s.ticker,
      netForeignVnd: flowValue,
      changePct: s.changePercent,
    });
  }

  if (accMap.size === 0) return [];

  const allFlows = Array.from(accMap.values()).map((a) => a.totalForeignValue);
  const minFlow = Math.min(...allFlows);
  const maxFlow = Math.max(...allFlows);
  const flowRange = maxFlow - minFlow;

  const allVols = Array.from(accMap.values()).map((a) => a.totalVolume);
  const minVol = Math.min(...allVols);
  const maxVol = Math.max(...allVols);
  const volRange = maxVol - minVol;

  const results: SectorFlowItem[] = [];

  for (const [sector, acc] of accMap.entries()) {
    const normFlow = flowRange === 0 ? 50 : ((acc.totalForeignValue - minFlow) / flowRange) * 100;
    const breadth = acc.total > 0 ? (acc.advances / acc.total) * 100 : 50;
    const normVol = volRange === 0 ? 50 : ((acc.totalVolume - minVol) / volRange) * 100;

    const score = Number((normFlow * 0.4 + breadth * 0.3 + normVol * 0.3).toFixed(1));

    let signal: "inflow" | "neutral" | "outflow" = "neutral";
    let signalVi = "Cân bằng";
    if (score > 60) {
      signal = "inflow";
      signalVi = "Tiền vào mạnh";
    } else if (score < 40) {
      signal = "outflow";
      signalVi = "Rút ròng";
    }

    const avgChangePct = acc.total > 0 ? Number((acc.sumChangePct / acc.total).toFixed(2)) : 0;

    const sortedStocks = [...acc.stockFlows].sort(
      (a, b) => Math.abs(b.netForeignVnd) - Math.abs(a.netForeignVnd)
    );
    const topStocks = sortedStocks.slice(0, 2);

    results.push({
      sector,
      rank: 0,
      signal,
      signalVi,
      netForeignVnd: Math.round(acc.totalForeignValue),
      avgChangePct,
      totalVolumeVnd: Math.round(acc.totalVolumeVND),
      advancesCount: acc.advances,
      totalCount: acc.total,
      breadth: `${acc.advances}/${acc.total} mã tăng`,
      topStocks,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  results.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return results;
}
