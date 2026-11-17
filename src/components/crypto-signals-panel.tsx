"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import {
  calculateCryptoPositionSize,
  type CryptoPositionSizerResult,
} from "@/lib/engines/crypto-position-sizer";
import type {
  CryptoSignalsHubData,
  CryptoQuantSignalItem,
} from "@/lib/services/crypto-signals-hub";
import type { CryptoDerivativesMetrics } from "@/lib/engines/crypto-derivatives-engine";
import type { CryptoCascadeShieldResult } from "@/lib/engines/crypto-news-shield";
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  ShieldCheck,
  ShieldAlert,
  Target,
  Zap,
  Crosshair,
  Percent,
  Layers,
  Activity,
  Radio,
  Lock,
  Cpu,
  Copy,
  AlertTriangle,
  Flame,
  Users,
} from "lucide-react";

interface DerivativesDetailResponse {
  pair: string;
  metrics: CryptoDerivativesMetrics;
  shield: CryptoCascadeShieldResult;
  slippageBuffer: {
    bufferUsd: number;
    maxAllowedSlippageUsd: number;
  };
}

export function CryptoSignalsPanel() {
  const { data: hubData, isLoading: hubLoading } = useApi<CryptoSignalsHubData>(
    "/api/v1/crypto/signals",
    {
      refreshInterval: 15_000,
      keepPreviousData: true,
    }
  );

  const [selectedSignal, setSelectedSignal] = useState<CryptoQuantSignalItem | null>(null);
  const [derivativesPair, setDerivativesPair] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Position Sizer State
  const [accountBalance, setAccountBalance] = useState<number>(10_000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(5);

  // Fetch derivatives & True L2 DOM details on demand
  const { data: derivData, isLoading: derivLoading } = useApi<DerivativesDetailResponse>(
    derivativesPair ? `/api/v1/crypto/derivatives/${derivativesPair}` : null,
    { keepPreviousData: true }
  );

  // Client-side reactive position sizer
  const sizerResult: CryptoPositionSizerResult | null = useMemo(() => {
    if (!selectedSignal || !selectedSignal.entryPrice || !selectedSignal.stopLossPrice) {
      return null;
    }
    return calculateCryptoPositionSize({
      accountBalance,
      riskPercent,
      entryPrice: selectedSignal.entryPrice,
      stopLossPrice: selectedSignal.stopLossPrice,
      takeProfit1: selectedSignal.tp1,
      takeProfit2: selectedSignal.tp2,
      takeProfit3: selectedSignal.tp3,
      leverage,
      direction: selectedSignal.direction === "SELL" ? "SELL" : "BUY",
    });
  }, [selectedSignal, accountBalance, riskPercent, leverage]);

  const signals = hubData?.signals ?? [];
  const stats = hubData?.stats;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP STATS BAR & WEBHOOK BUTTON */}
      <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-surface-1 p-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Flame className="size-5" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink-1">
              Trung Tâm Tín Hiệu Định Lượng & Scalp Phái Sinh (Binance Futures)
            </h3>
            <p className="text-[11px] text-ink-3">
              Quét đa khung 15m · Sổ lệnh True L2 DOM · Funding Squeeze & Khiên Ngắt Mạch
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="font-semibold text-positive">{stats.buyCount} BUY</span>
              <span>/</span>
              <span className="font-semibold text-negative">{stats.sellCount} SELL</span>
              <span>/</span>
              <span className="text-ink-3">{stats.neutralCount} WAIT</span>
            </div>
          )}
          <Link
            href="/copytrade"
            className="flex items-center gap-1.5 rounded-lg border border-positive/40 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive hover:bg-positive hover:text-white transition-colors"
          >
            <Users className="size-3.5" /> Copy Trading & Bot API
          </Link>
          <button
            type="button"
            onClick={() => setShowWebhookModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
          >
            <Cpu className="size-3.5" /> Webhook
          </button>
        </div>
      </div>

      {/* 2. MAIN SIGNALS GRID */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        {hubLoading && signals.length === 0 ? (
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

            return (
              <div
                key={sig.pair}
                className="group relative flex flex-col justify-between rounded-xl border border-line/70 bg-surface-1 p-3.5 shadow-sm transition-all hover:border-accent/60 hover:shadow-md"
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <Link
                        href={`/crypto/${sig.pair}`}
                        className="text-[14px] font-bold text-ink-1 hover:text-accent hover:underline"
                      >
                        {sig.symbol}
                      </Link>
                      <div className="num mt-0.5 text-[15px] font-semibold text-ink-1">
                        ${sig.lastPrice >= 1 ? sig.lastPrice.toLocaleString() : sig.lastPrice.toFixed(4)}
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

                  {/* Badges: Lockout, Leverage, Funding, DOM */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {sig.circuitBreakerLockout && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-negative/15 px-1.5 py-0.5 text-[10px] font-bold text-negative border border-negative/40 animate-pulse">
                        <Lock className="size-2.5" /> KHÓA LỆNH
                      </span>
                    )}
                    {sig.isHighWinrateVerified && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-positive/15 px-1.5 py-0.5 text-[10px] font-bold text-positive border border-positive/40">
                        🎯 VIP {sig.winrateScore ?? sig.probability}%
                      </span>
                    )}
                    {sig.liquiditySweepDetected && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent border border-accent/40">
                        ⚡ SWEEP
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent border border-accent/40">
                      {sig.recommendedLeverage}x
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        sig.fundingRate > 0.0003
                          ? "bg-negative/10 text-negative border border-negative/30"
                          : sig.fundingRate < -0.0002
                          ? "bg-positive/10 text-positive border border-positive/30"
                          : "bg-surface-2 text-ink-3 border border-line"
                      }`}
                    >
                      FR {(sig.fundingRate * 100).toFixed(3)}%
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        sig.domImbalance > 15
                          ? "bg-positive/10 text-positive border border-positive/30"
                          : sig.domImbalance < -15
                          ? "bg-negative/10 text-negative border border-negative/30"
                          : "bg-surface-2 text-ink-3 border border-line"
                      }`}
                    >
                      DOM {sig.domImbalance > 0 ? `+${sig.domImbalance}%` : `${sig.domImbalance}%`}
                    </span>
                  </div>

                  {/* Multi-Tier TP & SL Matrix */}
                  <div className="mt-2.5 space-y-1.5 rounded-lg border border-line/50 bg-surface-2/60 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between text-ink-2">
                      <span className="flex items-center gap-1">
                        <Crosshair className="size-3 text-ink-3" /> Điểm vào (Entry):
                      </span>
                      <strong className="num text-ink-1">
                        {sig.entryPrice
                          ? `$${sig.entryPrice >= 1 ? sig.entryPrice.toLocaleString() : sig.entryPrice.toFixed(4)}`
                          : "—"}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-negative">
                      <span>Cắt lỗ (SL - {sig.stopPct}%):</span>
                      <strong className="num font-semibold">
                        {sig.stopLossPrice
                          ? `$${sig.stopLossPrice >= 1 ? sig.stopLossPrice.toLocaleString() : sig.stopLossPrice.toFixed(4)}`
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
                            ? `$${sig.tp1 >= 1 ? sig.tp1.toLocaleString() : sig.tp1.toFixed(4)}`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-positive/90 text-[10px] mt-0.5">
                        <span>TP2 (R:R 2.0):</span>
                        <span className="num">
                          {sig.tp2
                            ? `$${sig.tp2 >= 1 ? sig.tp2.toLocaleString() : sig.tp2.toFixed(4)}`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-positive/75 text-[10px] mt-0.5">
                        <span>TP3 (R:R 3.0):</span>
                        <span className="num">
                          {sig.tp3
                            ? `$${sig.tp3 >= 1 ? sig.tp3.toLocaleString() : sig.tp3.toFixed(4)}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-3 grid grid-cols-3 gap-1 pt-2">
                  <button
                    onClick={() => setSelectedSignal(sig)}
                    type="button"
                    className="flex items-center justify-center gap-0.5 rounded-lg border border-accent/40 bg-accent/10 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                  >
                    <Calculator className="size-3" /> Ký Quỹ
                  </button>
                  <Link
                    href={`/crypto/${sig.pair}`}
                    className="flex items-center justify-center gap-0.5 rounded-lg border border-line bg-surface-2 py-1.5 text-[10px] font-semibold text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink-1"
                  >
                    <Layers className="size-3 text-accent" /> Chart
                  </Link>
                  <button
                    onClick={() => setDerivativesPair(sig.pair)}
                    type="button"
                    className={`flex items-center justify-center gap-0.5 rounded-lg border py-1.5 text-[10px] font-semibold transition-colors ${
                      sig.circuitBreakerLockout
                        ? "border-negative/50 bg-negative/20 text-negative hover:bg-negative hover:text-white animate-pulse"
                        : "border-line bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink-1"
                    }`}
                  >
                    <ShieldCheck className="size-3 text-accent" /> L2 DOM
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. POSITION SIZER & LEVERAGE MODAL */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Bộ Tính Ký Quỹ & An Toàn Thanh Lý — #{selectedSignal.symbol}
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Quản trị rủi ro Isolated Margin theo % tài khoản · Cảnh báo bẫy thanh lý sớm
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

            <div className="mt-4 space-y-4">
              {/* Input Controls */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Quy mô vốn ($)</label>
                  <input
                    type="number"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(Math.max(10, Number(e.target.value)))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink-1 focus:border-accent focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Rủi ro chấp nhận (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(Math.max(0.1, Math.min(10, Number(e.target.value))))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink-1 focus:border-accent focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Đòn bẩy chọn ({leverage}x)</label>
                  <select
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink-1 focus:border-accent focus:outline-hidden"
                  >
                    <option value={1}>1x (Spot)</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                    <option value={5}>5x (Khuyên dùng)</option>
                    <option value={10}>10x</option>
                    <option value={20}>20x</option>
                    <option value={50}>50x</option>
                  </select>
                </div>
              </div>

              {/* Calculated Outputs */}
              {sizerResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                      <span className="text-[10px] text-ink-3 uppercase tracking-wider">Ký Quỹ Yêu Cầu</span>
                      <div className="num text-xl font-black text-accent mt-0.5">
                        ${sizerResult.requiredMarginUsd.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-ink-3">Cho rủi ro ${sizerResult.riskAmountUsd}</span>
                    </div>

                    <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                      <span className="text-[10px] text-ink-3 uppercase tracking-wider">Khối Lượng Vị Thế</span>
                      <div className="num text-xl font-bold text-ink-1 mt-0.5">
                        {sizerResult.positionQty.toLocaleString()} coin
                      </div>
                      <span className="text-[10px] text-ink-3">${sizerResult.symbolNotionalUsd.toLocaleString()} notional</span>
                    </div>

                    <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                      <span className="text-[10px] text-ink-3 uppercase tracking-wider">Giá Thanh Lý Ước Tính</span>
                      <div className="num text-xl font-bold text-negative mt-0.5">
                        ${sizerResult.estimatedLiquidationPrice?.toLocaleString() ?? "Không (Spot)"}
                      </div>
                      <span className="text-[10px] text-ink-3">
                        Khoảng cách: {sizerResult.liquidationDistancePct}%
                      </span>
                    </div>
                  </div>

                  {/* Liquidation Safety Warning */}
                  <div
                    className={`rounded-xl border p-3 text-[11.5px] ${
                      sizerResult.isSafeFromEarlyLiquidation
                        ? "border-positive/40 bg-positive/5 text-positive"
                        : "border-negative/50 bg-negative/10 text-negative animate-pulse"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      {sizerResult.isSafeFromEarlyLiquidation ? (
                        <ShieldCheck className="size-4" />
                      ) : (
                        <AlertTriangle className="size-4" />
                      )}
                      <span>
                        Hệ số an toàn thanh lý: {sizerResult.liquidationSafetyRatio ?? "Spot"}x khoảng cách SL
                      </span>
                    </div>
                    <p className="mt-1 text-ink-2">{sizerResult.advice}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSignal(null)}
                className="rounded-lg bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-3"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. TRUE L2 DOM & DERIVATIVES SHIELD MODAL */}
      {derivativesPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Sổ Lệnh True L2 DOM & Khiên Phái Sinh — #{derivativesPair}
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Binance Futures L2 Order Book · Phân tích Funding Squeeze & Khiên Ngắt Mạch
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDerivativesPair(null)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
              >
                ✕
              </button>
            </div>

            {derivLoading ? (
              <div className="py-12 text-center text-[13px] text-ink-3 animate-pulse">
                Đang nạp dữ liệu sổ lệnh thời gian thực từ Binance Futures...
              </div>
            ) : derivData ? (
              <div className="mt-4 space-y-4">
                {/* Circuit Breaker Status */}
                <div
                  className={`rounded-xl border p-3.5 ${
                    derivData.shield.isLockout
                      ? "border-negative/50 bg-negative/10 text-negative"
                      : "border-positive/40 bg-positive/5 text-positive"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-[13px]">
                    {derivData.shield.isLockout ? (
                      <>
                        <ShieldAlert className="size-4.5 animate-pulse" />
                        <span>🚨 CỬA SỔ ĐÓNG BĂNG GIAO DỊCH (CIRCUIT BREAKER LOCKOUT)</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4.5" />
                        <span>HỆ THỐNG AN TOÀN — KHÔNG CÓ BÃO THANH LÝ HOẶC TIN ĐỎ VĨ MÔ</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-2">
                    {derivData.shield.warningMessage ??
                      "Thanh khoản hai chiều bình thường, không ghi nhận đợt thanh lý tuyết lở (cascade) đột biến hoặc biến động vĩ mô nguy hiểm."}
                  </p>
                </div>

                {/* Funding Rate & OI Metrics */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                    <span className="text-[10px] text-ink-3 uppercase tracking-wider">Funding Rate (8h)</span>
                    <div
                      className={`num text-lg font-bold mt-0.5 ${
                        derivData.metrics.fundingRate > 0.0003
                          ? "text-negative"
                          : derivData.metrics.fundingRate < -0.0002
                          ? "text-positive"
                          : "text-ink-1"
                      }`}
                    >
                      {(derivData.metrics.fundingRate * 100).toFixed(4)}%
                    </div>
                    <span className="text-[10px] text-ink-3">
                      {derivData.metrics.annualizedFundingPct > 0 ? "+" : ""}
                      {derivData.metrics.annualizedFundingPct}%/năm
                    </span>
                  </div>

                  <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                    <span className="text-[10px] text-ink-3 uppercase tracking-wider">Trạng Thái Open Interest</span>
                    <div className="num text-base font-bold text-accent mt-0.5">
                      {derivData.metrics.oiState.replace("_", " ")}
                    </div>
                    <span className="text-[10px] text-ink-3">
                      ${(derivData.metrics.openInterestUsd / 1_000_000).toFixed(1)}M USD vị thế
                    </span>
                  </div>

                  <div className="rounded-xl border border-line/60 bg-surface-2 p-3 text-center">
                    <span className="text-[10px] text-ink-3 uppercase tracking-wider">Đệm Trượt Giá Khuyên Dùng</span>
                    <div className="num text-lg font-bold text-ink-1 mt-0.5">
                      ${derivData.slippageBuffer.bufferUsd}
                    </div>
                    <span className="text-[10px] text-ink-3">
                      Max: ${derivData.slippageBuffer.maxAllowedSlippageUsd}
                    </span>
                  </div>
                </div>

                {/* True L2 DOM Depth Table */}
                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3.5">
                  <div className="flex items-center justify-between border-b border-line/50 pb-2.5">
                    <div>
                      <div className="text-[12px] font-bold text-ink-1 flex items-center gap-1.5">
                        <Activity className="size-3.5 text-accent" />
                        Sổ Lệnh Binance Futures Level 2 DOM (Top 5 Bậc Giá)
                      </div>
                      <span className="text-[10px] text-ink-3">
                        Thanh khoản mua/bán khớp lệnh tức thì từ sàn tập trung lớn nhất thế giới
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-ink-3">Mất cân bằng sổ lệnh (Imbalance):</span>
                      <div
                        className={`text-[12px] font-black ${
                          derivData.metrics.orderBook.imbalanceRatio > 15
                            ? "text-positive"
                            : derivData.metrics.orderBook.imbalanceRatio < -15
                            ? "text-negative"
                            : "text-ink-2"
                        }`}
                      >
                        {derivData.metrics.orderBook.imbalanceRatio > 0 ? "+" : ""}
                        {derivData.metrics.orderBook.imbalanceRatio}%{" "}
                        {derivData.metrics.orderBook.institutionalBias === "STRONG_BUY_WALL"
                          ? "(Tường Mua Lớn)"
                          : derivData.metrics.orderBook.institutionalBias === "STRONG_SELL_WALL"
                          ? "(Tường Bán Lớn)"
                          : "(Cân bằng)"}
                      </div>
                    </div>
                  </div>

                  {/* DOM Table */}
                  <div className="mt-3 overflow-hidden rounded-lg border border-line/60">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-surface-3/60 text-[10px] uppercase text-ink-3">
                        <tr>
                          <th className="py-1.5 px-3 text-right">Khối lượng Mua (Bids)</th>
                          <th className="py-1.5 px-3 text-center text-positive font-bold">Giá Bid</th>
                          <th className="py-1.5 px-3 text-center text-negative font-bold">Giá Ask</th>
                          <th className="py-1.5 px-3 text-left">Khối lượng Bán (Asks)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/30 bg-surface-1/50">
                        {derivData.metrics.orderBook.levels.map((lvl) => {
                          const maxNotional = Math.max(
                            ...derivData.metrics.orderBook.levels.map((d) =>
                              Math.max(d.bidNotionalUsd, d.askNotionalUsd)
                            ),
                            1
                          );
                          const bidWidth = Math.round((lvl.bidNotionalUsd / maxNotional) * 100);
                          const askWidth = Math.round((lvl.askNotionalUsd / maxNotional) * 100);

                          return (
                            <tr key={lvl.level} className="hover:bg-surface-2/60 transition-colors">
                              <td className="py-1.5 px-3 text-right relative">
                                <div
                                  className="absolute inset-y-0 right-0 bg-positive/15 -z-10 transition-all"
                                  style={{ width: `${bidWidth}%` }}
                                />
                                <span className="num font-semibold text-positive">
                                  ${lvl.bidNotionalUsd.toLocaleString()}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-center num font-bold text-ink-1">
                                ${lvl.bidPrice >= 1 ? lvl.bidPrice.toLocaleString() : lvl.bidPrice.toFixed(4)}
                              </td>
                              <td className="py-1.5 px-3 text-center num font-bold text-ink-1">
                                ${lvl.askPrice >= 1 ? lvl.askPrice.toLocaleString() : lvl.askPrice.toFixed(4)}
                              </td>
                              <td className="py-1.5 px-3 text-left relative">
                                <div
                                  className="absolute inset-y-0 left-0 bg-negative/15 -z-10 transition-all"
                                  style={{ width: `${askWidth}%` }}
                                />
                                <span className="num font-semibold text-negative">
                                  ${lvl.askNotionalUsd.toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-ink-3">
                    <span>
                      Tổng thanh khoản Bids: ${derivData.metrics.orderBook.totalBidNotional.toLocaleString()}
                    </span>
                    <span>
                      Tổng thanh khoản Asks: ${derivData.metrics.orderBook.totalAskNotional.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setDerivativesPair(null)}
                className="rounded-lg bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-3"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BOT WEBHOOK & CCXT INTEGRATION MODAL */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Cầu Nối Tự Động Hóa (Binance / Bybit Bot & Telegram Webhook)
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Kết nối trực tiếp tín hiệu VIP với Bot giao dịch tự động qua CCXT hoặc Webhook
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <span className="text-[11px] font-bold text-ink-1 uppercase">1. REST Endpoint cho Trading Bot</span>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] font-mono text-ink-1">
                  <span>GET /api/v1/crypto/signals</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("/api/v1/crypto/signals", "url")}
                    className="flex items-center gap-1 text-accent hover:underline"
                  >
                    <Copy className="size-3" />
                    {copiedText === "url" ? "Đã chép!" : "Sao chép"}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-ink-1 uppercase">2. Mẫu Payload JSON tín hiệu tự động</span>
                <pre className="mt-1 rounded-lg border border-line bg-surface-2 p-3 text-[10px] font-mono text-ink-2 overflow-x-auto">
{`{
  "event": "CRYPTO_QUANT_SIGNAL",
  "symbol": "BTCUSDT",
  "direction": "BUY",
  "entry": 92450.0,
  "stopLoss": 91200.0,
  "takeProfit1": 93950.0,
  "takeProfit2": 94950.0,
  "leverage": 10,
  "orderBookImbalance": "+32%",
  "circuitBreaker": "NORMAL",
  "timestamp": ${Date.now()}
}`}
                </pre>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="rounded-lg bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-3"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

