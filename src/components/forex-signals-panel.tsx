"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge, Panel } from "@/components/ui";
import {
  calculateForexPositionSize,
  type PositionSizerResult,
} from "@/lib/engines/forex-position-sizer";
import type { ForexSignalsHubData, ForexQuantSignalItem } from "@/lib/services/forex-signals-hub";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Calculator,
  ShieldCheck,
  Target,
  Zap,
  Info,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Percent,
} from "lucide-react";

export function ForexSignalsPanel() {
  const { data, isLoading } = useApi<ForexSignalsHubData>("/api/v1/forex/signals", {
    refreshInterval: 20_000,
    keepPreviousData: true,
  });

  const [selectedSignal, setSelectedSignal] = useState<ForexQuantSignalItem | null>(null);
  const [accountBalance, setAccountBalance] = useState<number>(10_000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(100);

  // Position size result calculated client-side reactively
  const sizerResult: PositionSizerResult | null = useMemo(() => {
    if (!selectedSignal || !selectedSignal.entryPrice || !selectedSignal.stopLossPrice) {
      return null;
    }
    return calculateForexPositionSize({
      accountBalance,
      riskPercent,
      pair: selectedSignal.pair,
      entryPrice: selectedSignal.entryPrice,
      stopLossPrice: selectedSignal.stopLossPrice,
      takeProfit1: selectedSignal.tp1,
      takeProfit2: selectedSignal.tp2,
      takeProfit3: selectedSignal.tp3,
      leverage,
    });
  }, [selectedSignal, accountBalance, riskPercent, leverage]);

  const signals = data?.signals ?? [];
  const marketSessions = data?.marketSessions ?? [];

  return (
    <div className="space-y-4">
      {/* Session tracker bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/60 bg-surface-1/70 px-4 py-2.5 text-[12px]">
        <div className="flex items-center gap-2 font-medium text-ink-1">
          <Clock className="size-4 text-accent" />
          <span>Phiên giao dịch quốc tế:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {marketSessions.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  s.isOpen ? "bg-positive animate-pulse" : "bg-ink-3/40"
                }`}
              />
              <span className={s.isOpen ? "font-semibold text-ink-1" : "text-ink-3"}>
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Signals Grid */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        {isLoading && signals.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-lg border border-line/50 bg-surface-1/50 p-4"
            />
          ))
        ) : (
          signals.map((sig) => {
            const isBuy = sig.direction === "BUY";
            const isSell = sig.direction === "SELL";
            const isNeutral = sig.direction === "NEUTRAL";

            return (
              <div
                key={sig.pair}
                className="group relative flex flex-col justify-between rounded-xl border border-line/70 bg-surface-1 p-3.5 shadow-sm transition-all hover:border-accent/60 hover:shadow-md"
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/forex/${sig.pair}`}
                          className="text-[14px] font-bold text-ink-1 hover:text-accent hover:underline"
                        >
                          {sig.symbol}
                        </Link>
                      </div>
                      <div className="num mt-0.5 text-[15px] font-semibold text-ink-1">
                        {sig.lastPrice >= 100
                          ? sig.lastPrice.toFixed(2)
                          : sig.lastPrice.toFixed(4)}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        tone={isBuy ? "up" : isSell ? "down" : "neutral"}
                        className="flex items-center gap-1 font-bold text-[11px] uppercase tracking-wide"
                      >
                        {isBuy ? (
                          <TrendingUp className="size-3" />
                        ) : isSell ? (
                          <TrendingDown className="size-3" />
                        ) : (
                          <Zap className="size-3" />
                        )}
                        {sig.direction}
                      </Badge>
                      <span className="text-[10px] text-ink-3">
                        Độ tin cậy: <strong className="text-accent">{sig.probability}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* Multi-Tier TP & SL Matrix */}
                  <div className="mt-3 space-y-1.5 rounded-lg border border-line/50 bg-surface-2/60 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between text-ink-2">
                      <span className="flex items-center gap-1">
                        <Crosshair className="size-3 text-ink-3" /> Điểm vào (Entry):
                      </span>
                      <strong className="num text-ink-1">
                        {sig.entryPrice
                          ? sig.entryPrice >= 100
                            ? sig.entryPrice.toFixed(2)
                            : sig.entryPrice.toFixed(4)
                          : "—"}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-negative">
                      <span>Cắt lỗ (SL - {sig.stopPips} pip):</span>
                      <strong className="num font-semibold">
                        {sig.stopLossPrice
                          ? sig.stopLossPrice >= 100
                            ? sig.stopLossPrice.toFixed(2)
                            : sig.stopLossPrice.toFixed(4)
                          : "—"}
                      </strong>
                    </div>

                    <div className="border-t border-line/40 pt-1">
                      <div className="flex items-center justify-between text-positive font-medium">
                        <span className="flex items-center gap-1">
                          <Target className="size-3" /> TP1 (R:R 1.2):
                        </span>
                        <span className="num">
                          {sig.tp1
                            ? sig.tp1 >= 100
                              ? sig.tp1.toFixed(2)
                              : sig.tp1.toFixed(4)
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-positive/90 text-[10px] mt-0.5">
                        <span>TP2 (R:R 2.0):</span>
                        <span className="num">
                          {sig.tp2
                            ? sig.tp2 >= 100
                              ? sig.tp2.toFixed(2)
                              : sig.tp2.toFixed(4)
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-positive/75 text-[10px] mt-0.5">
                        <span>TP3 (R:R 3.0):</span>
                        <span className="num">
                          {sig.tp3
                            ? sig.tp3 >= 100
                              ? sig.tp3.toFixed(2)
                              : sig.tp3.toFixed(4)
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-3 pt-2">
                  <button
                    onClick={() => setSelectedSignal(sig)}
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                  >
                    <Calculator className="size-3.5" /> Tính Lot & Quản Lý Vốn
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Position Sizing Calculator Modal / Drawer */}
      {selectedSignal && sizerResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Quản Lý Vị Thế Định Lượng — {selectedSignal.symbol}
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Tự động tính Lot chuẩn theo rủi ro tài khoản & phân tầng chốt lời 1-2-3
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSignal(null)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
              >
                ✕
              </button>
            </div>

            {/* Inputs */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-ink-2">Số dư vốn (USD):</label>
                <div className="mt-1 flex items-center rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="text-[12px] text-ink-3">$</span>
                  <input
                    type="number"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(Number(e.target.value) || 1000)}
                    className="w-full bg-transparent pl-1 text-[13px] font-semibold text-ink-1 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-ink-2">Mức rủi ro (% vốn):</label>
                <div className="mt-1 flex items-center rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(Number(e.target.value) || 1.0)}
                    className="w-full bg-transparent text-[13px] font-semibold text-ink-1 focus:outline-hidden"
                  />
                  <Percent className="size-3 text-ink-3" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-ink-2">Đòn bẩy tài khoản:</label>
                <select
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] font-semibold text-ink-1 focus:outline-hidden"
                >
                  <option value={30}>1:30</option>
                  <option value={50}>1:50</option>
                  <option value={100}>1:100</option>
                  <option value={200}>1:200</option>
                  <option value={500}>1:500</option>
                </select>
              </div>
            </div>

            {/* Calculated Results Box */}
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="border-r border-line/60 pr-2">
                  <div className="text-[10px] text-ink-3 uppercase tracking-wider">Khối lượng vào</div>
                  <div className="num mt-0.5 text-xl font-black text-accent">
                    {sizerResult.standardLots} <span className="text-xs font-normal">Lot</span>
                  </div>
                  <div className="text-[10px] text-ink-3">{sizerResult.microLots} Micro lots</div>
                </div>

                <div className="border-r border-line/60 pr-2">
                  <div className="text-[10px] text-ink-3 uppercase tracking-wider">Rủi ro tối đa</div>
                  <div className="num mt-0.5 text-xl font-black text-negative">
                    -${sizerResult.riskAmountUsd.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-ink-3">{sizerResult.stopLossPips} pips SL</div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-3 uppercase tracking-wider">Ký quỹ (Margin)</div>
                  <div className="num mt-0.5 text-xl font-bold text-ink-1">
                    ${sizerResult.marginRequiredUsd.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-ink-3">Đòn bẩy 1:{leverage}</div>
                </div>
              </div>
            </div>

            {/* Actionable Plan 1-2-3 */}
            <div className="mt-3.5 space-y-1.5 rounded-lg border border-line/60 bg-surface-2/70 p-3 text-[11px]">
              <div className="font-semibold text-ink-1 flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-positive" /> {sizerResult.advice.rule}:
              </div>
              <ul className="list-inside list-disc space-y-1 text-ink-2 pl-1">
                {sizerResult.advice.actionablePlan.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ul>
              {sizerResult.advice.riskWarning && (
                <div className="mt-2 rounded-md bg-negative/10 p-2 text-[11px] font-medium text-negative">
                  ⚠ {sizerResult.advice.riskWarning}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedSignal(null)}
                className="rounded-lg border border-line px-4 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
              >
                Đóng
              </button>
              <Link
                href={`/forex/${selectedSignal.pair}`}
                className="flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
              >
                Mở Đồ Thị Chi Tiết <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
