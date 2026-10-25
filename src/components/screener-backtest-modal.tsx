"use client";

import React, { useState, useEffect, useTransition } from "react";
import type { ScreenerBacktestResult, StrategyType, BacktestTrade } from "@/lib/engines/screener-backtest-engine";
function formatPercent(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

interface ScreenerBacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STRATEGIES: { id: StrategyType; label: string; desc: string }[] = [
  { id: "breakout", label: "Breakout Khối lượng", desc: "Vượt đỉnh 20 phiên + Khối lượng đột biến > 1.3x TB20" },
  { id: "canslim", label: "CANSLIM Momentum", desc: "Đà tăng trưởng: RSI > 52, EMA20 > EMA50, thanh khoản tích cực" },
  { id: "ma_cross", label: "Golden Cross EMA", desc: "Giao cắt vàng EMA20 vượt lên trên EMA50 trung hạn" },
  { id: "value", label: "Bắt đáy Giá trị", desc: "Mua gom khi RSI < 45 và nến đảo chiều cắt vượt EMA20" },
];

export function ScreenerBacktestModal({ isOpen, onClose }: ScreenerBacktestModalProps) {
  const [strategy, setStrategy] = useState<StrategyType>("breakout");
  const [holdingDays, setHoldingDays] = useState<number>(20);
  const [stopLossPct, setStopLossPct] = useState<number>(7);
  const [takeProfitPct, setTakeProfitPct] = useState<number>(15);

  const [data, setData] = useState<ScreenerBacktestResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runSimulation = async (strat = strategy, hold = holdingDays, sl = stopLossPct, tp = takeProfitPct) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/screener/backtest?strategy=${strat}&holdingDays=${hold}&stopLossPct=${sl}&takeProfitPct=${tp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ScreenerBacktestResult = await res.json();
      setData(json);
    } catch (err) {
      console.error("Backtest failed:", err);
      setError("Không thể tải kết quả mô phỏng. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !data && !loading) {
      runSimulation();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Render SVG Chart for Equity Curve
  const renderEquityChart = () => {
    if (!data?.equityCurve || data.equityCurve.length < 2) return null;

    const curve = data.equityCurve;
    const values = curve.flatMap(p => [p.strategyValue, p.benchmarkValue]);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    const range = maxVal - minVal || 1;

    const width = 640;
    const height = 180;
    const padX = 40;
    const padY = 20;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const getX = (idx: number) => padX + (idx / (curve.length - 1)) * plotW;
    const getY = (val: number) => height - padY - ((val - minVal) / range) * plotH;

    const stratPoints = curve.map((p, i) => `${getX(i)},${getY(p.strategyValue)}`).join(" ");
    const benchPoints = curve.map((p, i) => `${getX(i)},${getY(p.benchmarkValue)}`).join(" ");

    return (
      <div className="w-full overflow-hidden rounded-lg bg-surface/50 p-3 border border-border/40">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <span className="inline-block w-3 h-0.5 bg-emerald-400 rounded"></span>
              Chiến lược ({formatPercent(data.totalReturnPct)})
            </span>
            <span className="flex items-center gap-1.5 font-medium text-slate-400">
              <span className="inline-block w-3 h-0.5 bg-slate-400 rounded"></span>
              VN-Index Benchmark ({formatPercent(data.benchmarkReturnPct)})
            </span>
          </div>
          <span>Mô phỏng 9 tháng gần nhất</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
          {/* Grid lines */}
          <line x1={padX} y1={getY(minVal + range * 0.5)} x2={width - padX} y2={getY(minVal + range * 0.5)} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
          <line x1={padX} y1={getY(data.initialCapital)} x2={width - padX} y2={getY(data.initialCapital)} stroke="rgba(255,255,255,0.15)" />

          {/* Benchmark Line */}
          <polyline fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" points={benchPoints} />

          {/* Strategy Line */}
          <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={stratPoints} />

          {/* Points for start and end */}
          <circle cx={getX(curve.length - 1)} cy={getY(curve[curve.length - 1].strategyValue)} r="4" fill="#10b981" />
        </svg>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-2">
          <span>{curve[0].date}</span>
          <span>{curve[Math.floor(curve.length / 2)].date}</span>
          <span>{curve[curve.length - 1].date}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">
              ⚡
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                Screener Backtest Simulator
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  MiQuant Algorithmic
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Kiểm nghiệm hiệu suất quá khứ của bộ lọc trên rổ cổ phiếu thanh khoản cao VN30/VN100
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface/80 transition-colors"
            title="Đóng modal"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Strategy Selection Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setStrategy(s.id);
                  runSimulation(s.id, holdingDays, stopLossPct, takeProfitPct);
                }}
                className={`p-3 text-left rounded-xl border transition-all ${
                  strategy === s.id
                    ? "bg-primary/10 border-primary/50 ring-1 ring-primary/40"
                    : "bg-surface/40 border-border/60 hover:bg-surface/80"
                }`}
              >
                <div className="text-xs font-semibold text-foreground">{s.label}</div>
                <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.desc}</div>
              </button>
            ))}
          </div>

          {/* Parameter Sliders / Toggles */}
          <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-xl bg-surface/30 border border-border/40 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Thời gian nắm giữ:</span>
              <select
                value={holdingDays}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setHoldingDays(val);
                  runSimulation(strategy, val, stopLossPct, takeProfitPct);
                }}
                className="bg-card border border-border rounded px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={10}>10 phiên (~2 tuần)</option>
                <option value={20}>20 phiên (~1 tháng)</option>
                <option value={40}>40 phiên (~2 tháng)</option>
                <option value={60}>60 phiên (~3 tháng)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Cắt lỗ (Stop Loss):</span>
              <select
                value={stopLossPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStopLossPct(val);
                  runSimulation(strategy, holdingDays, val, takeProfitPct);
                }}
                className="bg-card border border-border rounded px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={5}>-5%</option>
                <option value={7}>-7% (Khuyến nghị)</option>
                <option value={10}>-10%</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Chốt lời (Take Profit):</span>
              <select
                value={takeProfitPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTakeProfitPct(val);
                  runSimulation(strategy, holdingDays, stopLossPct, val);
                }}
                className="bg-card border border-border rounded px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={10}>+10%</option>
                <option value={15}>+15% (Khuyến nghị)</option>
                <option value={25}>+25%</option>
              </select>
            </div>

            <button
              onClick={() => runSimulation()}
              disabled={loading}
              className="ml-auto px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Đang tính toán..." : "⚡ Chạy lại"}
            </button>
          </div>

          {/* Loading or Error */}
          {loading && (
            <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span>Đang thu thập dữ liệu nến OHLCV và mô phỏng giao dịch quá khứ...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
              {error}
            </div>
          )}

          {/* Results Summary & KPI Cards */}
          {!loading && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-surface/40 border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Tổng lợi nhuận</div>
                  <div className={`text-xl font-bold mt-1 ${data.totalReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatPercent(data.totalReturnPct)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Alpha vs VN-Index: <span className={data.alphaPct >= 0 ? "text-emerald-400" : "text-rose-400"}>+{data.alphaPct}%</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/40 border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Tỷ lệ thắng (Win Rate)</div>
                  <div className="text-xl font-bold mt-1 text-sky-400">
                    {data.winRatePct}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {data.winningTrades} thắng / {data.totalTrades} lệnh
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/40 border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Profit Factor</div>
                  <div className="text-xl font-bold mt-1 text-amber-400">
                    {data.profitFactor}x
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    TB Lời: +{data.avgGainPct}% | TB Lỗ: -{data.avgLossPct}%
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/40 border border-border/50">
                  <div className="text-[11px] text-muted-foreground">Sụt giảm lớn nhất (MDD)</div>
                  <div className="text-xl font-bold mt-1 text-rose-400">
                    -{data.maxDrawdownPct}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Peak-to-trough decline
                  </div>
                </div>
              </div>

              {/* Equity Chart */}
              {renderEquityChart()}

              {/* Trade Log Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">
                    Nhật ký lệnh mô phỏng gần nhất ({data.trades.length} lệnh gần đây)
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Rổ phân tích: {data.analyzedSymbols.join(", ")}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface/60 text-muted-foreground border-b border-border/40 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Mã CP</th>
                        <th className="py-2 px-3">Ngày Mua</th>
                        <th className="py-2 px-3 text-right">Giá Mua</th>
                        <th className="py-2 px-3">Ngày Bán</th>
                        <th className="py-2 px-3 text-right">Giá Bán</th>
                        <th className="py-2 px-3 text-center">Nắm giữ</th>
                        <th className="py-2 px-3 text-right">Hiệu suất</th>
                        <th className="py-2 px-3 text-center">Lý do đóng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {data.trades.map((t) => (
                        <tr key={t.id} className="hover:bg-surface/30 transition-colors">
                          <td className="py-2 px-3 font-semibold text-foreground">{t.symbol}</td>
                          <td className="py-2 px-3 text-muted-foreground">{t.entryDate}</td>
                          <td className="py-2 px-3 text-right text-foreground">{t.entryPrice.toLocaleString()}</td>
                          <td className="py-2 px-3 text-muted-foreground">{t.exitDate}</td>
                          <td className="py-2 px-3 text-right text-foreground">{t.exitPrice.toLocaleString()}</td>
                          <td className="py-2 px-3 text-center text-muted-foreground">{t.holdingDays} phiên</td>
                          <td className={`py-2 px-3 text-right font-semibold ${t.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {t.returnPct >= 0 ? `+${t.returnPct}%` : `${t.returnPct}%`}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              t.exitReason === "TAKE_PROFIT" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : t.exitReason === "STOP_LOSS"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                            }`}>
                              {t.exitReason === "TAKE_PROFIT" ? "Chốt lời" : t.exitReason === "STOP_LOSS" ? "Cắt lỗ" : "Hết kỳ"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface/30 text-xs text-muted-foreground">
          <span>* Kết quả mô phỏng quá khứ dựa trên nến ngày (OHLCV) và không bao gồm phí giao dịch / trượt giá.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface hover:bg-surface/80 text-foreground border border-border transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
