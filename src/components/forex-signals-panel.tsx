"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge, Panel } from "@/components/ui";
import {
  calculateForexPositionSize,
  type PositionSizerResult,
} from "@/lib/engines/forex-position-sizer";
import type { CurrencyStrengthMatrixResult } from "@/lib/engines/forex-currency-strength";
import type { SmcScanResult } from "@/lib/engines/forex-smc-scanner";
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
  Layers,
  Send,
  Copy,
  Cpu,
} from "lucide-react";

export function ForexSignalsPanel() {
  const { data: hubData, isLoading: hubLoading } = useApi<ForexSignalsHubData>(
    "/api/v1/forex/signals",
    {
      refreshInterval: 20_000,
      keepPreviousData: true,
    }
  );

  const { data: csmData } = useApi<CurrencyStrengthMatrixResult>("/api/v1/forex/csm", {
    refreshInterval: 25_000,
    keepPreviousData: true,
  });

  const [selectedSignal, setSelectedSignal] = useState<ForexQuantSignalItem | null>(null);
  const [smcPair, setSmcPair] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const [accountBalance, setAccountBalance] = useState<number>(10_000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(100);

  // Fetch SMC details on demand when user clicks on a pair
  const { data: smcData, isLoading: smcLoading } = useApi<SmcScanResult>(
    smcPair ? `/api/v1/forex/smc/${smcPair}` : null,
    { keepPreviousData: true }
  );

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

  const signals = hubData?.signals ?? [];
  const marketSessions = hubData?.marketSessions ?? [];

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* 1. GIAI ĐOẠN 1: CURRENCY STRENGTH METER (CSM) & DXY BAR */}
      {csmData && (
        <div className="rounded-xl border border-line/70 bg-surface-1 p-3.5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-accent" />
              <h3 className="text-[13px] font-bold text-ink-1">
                Ma Trận Sức Mạnh 8 Đồng Tiền (Currency Strength Meter - CSM)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowWebhookModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
              >
                <Cpu className="size-3.5" /> Kết Nối MT5 EA & Webhook
              </button>
            </div>
          </div>

          {/* 8 Currency Strength Bars */}
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {csmData.scores.map((s) => {
              const isStrong = s.score >= 6.0;
              const isWeak = s.score <= 4.0;
              const barWidth = `${Math.min(100, Math.max(10, s.score * 10))}%`;

              return (
                <div
                  key={s.currency}
                  className="rounded-lg border border-line/50 bg-surface-2/60 p-2 text-center"
                >
                  <div className="text-[12px] font-bold text-ink-1">{s.currency}</div>
                  <div
                    className={`num text-[15px] font-black ${
                      isStrong
                        ? "text-positive"
                        : isWeak
                        ? "text-negative"
                        : "text-ink-2"
                    }`}
                  >
                    {s.score.toFixed(1)}
                  </div>
                  {/* Progress Bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isStrong ? "bg-positive" : isWeak ? "bg-negative" : "bg-ink-3"
                      }`}
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Institutional Divergence Insight */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-2 text-[11px] text-ink-2">
            <div>
              <span className="font-semibold text-accent">Cặp lệch pha tối ưu:</span>{" "}
              <strong className="text-ink-1 font-bold">
                {csmData.bestPairToTrade.action} {csmData.bestPairToTrade.pair}
              </strong>{" "}
              (Lệch {csmData.bestPairToTrade.strengthDiff} điểm)
            </div>
            <div>
              <span className="font-semibold">DXY Bias:</span>{" "}
              <Badge
                tone={
                  csmData.dxyEstimate.bias === "BULLISH"
                    ? "up"
                    : csmData.dxyEstimate.bias === "BEARISH"
                    ? "down"
                    : "neutral"
                }
              >
                {csmData.dxyEstimate.bias} ({csmData.dxyEstimate.score}/10)
              </Badge>
            </div>
          </div>
        </div>
      )}

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

                {/* Footer Actions: Lot Sizer + SMC Inspector */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2">
                  <button
                    onClick={() => setSelectedSignal(sig)}
                    type="button"
                    className="flex items-center justify-center gap-1 rounded-lg border border-accent/40 bg-accent/10 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                  >
                    <Calculator className="size-3" /> Tính Lot
                  </button>
                  <button
                    onClick={() => setSmcPair(sig.pair)}
                    type="button"
                    className="flex items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 py-1.5 text-[11px] font-semibold text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink-1"
                  >
                    <Layers className="size-3 text-accent" /> Soi SMC / FVG
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. GIAI ĐOẠN 2: SMC / FVG SCANNER MODAL */}
      {smcPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Cấu Trúc SMC & Vùng Thanh Khoản FVG — #{smcPair}
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Quét tự động Unmitigated Fair Value Gaps, Order Blocks & Liquidity Sweeps
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSmcPair(null)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
              >
                ✕
              </button>
            </div>

            {smcLoading ? (
              <div className="py-12 text-center text-[13px] text-ink-3 animate-pulse">
                Đang giải mã cấu trúc nến tổ chức...
              </div>
            ) : smcData ? (
              <div className="mt-4 space-y-3">
                {/* Bias Box */}
                <div className="flex items-center justify-between rounded-xl border border-line/60 bg-surface-2 p-3">
                  <div>
                    <span className="text-[11px] text-ink-3">Xu hướng cấu trúc vi mô:</span>
                    <div className="text-sm font-bold text-ink-1">{smcData.summary}</div>
                  </div>
                  <Badge tone={smcData.bias === "BULLISH" ? "up" : smcData.bias === "BEARISH" ? "down" : "neutral"}>
                    {smcData.bias} ({smcData.score}%)
                  </Badge>
                </div>

                {/* Unmitigated FVG List */}
                <div>
                  <h4 className="text-[12px] font-bold text-ink-1">
                    Vùng mất cân bằng giá (Unmitigated FVGs):
                  </h4>
                  {smcData.unmitigatedFvgList.length === 0 ? (
                    <div className="text-[11px] text-ink-3 mt-1">Không có FVG tồn đọng.</div>
                  ) : (
                    <div className="mt-1.5 space-y-1.5 max-h-36 overflow-y-auto">
                      {smcData.unmitigatedFvgList.map((fvg, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-line/40 bg-surface-2/70 px-3 py-1.5 text-[11px]"
                        >
                          <span
                            className={
                              fvg.type === "BULLISH_FVG" ? "font-semibold text-positive" : "font-semibold text-negative"
                            }
                          >
                            {fvg.type === "BULLISH_FVG" ? "▲ Bullish FVG" : "▼ Bearish FVG"}
                          </span>
                          <span className="num text-ink-1">
                            {fvg.bottom.toFixed(4)} — {fvg.top.toFixed(4)} ({fvg.sizePips} pips)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Order Blocks */}
                <div>
                  <h4 className="text-[12px] font-bold text-ink-1">
                    Khối lệnh tổ chức đang mở (Active Order Blocks):
                  </h4>
                  {smcData.activeOrderBlocks.length === 0 ? (
                    <div className="text-[11px] text-ink-3 mt-1">Chưa có Order Block mới.</div>
                  ) : (
                    <div className="mt-1.5 space-y-1.5 max-h-36 overflow-y-auto">
                      {smcData.activeOrderBlocks.map((ob, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-line/40 bg-surface-2/70 px-3 py-1.5 text-[11px]"
                        >
                          <span
                            className={
                              ob.type === "BULLISH_OB" ? "font-semibold text-positive" : "font-semibold text-negative"
                            }
                          >
                            {ob.type === "BULLISH_OB" ? "🟩 Demand OB" : "🟥 Supply OB"} [{ob.status}]
                          </span>
                          <span className="num text-ink-1">
                            {ob.low.toFixed(4)} — {ob.high.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SMC Trade Setup */}
                {smcData.optimalTradeSetup.direction !== "WAIT" && (
                  <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-[11px]">
                    <div className="font-bold text-accent">Kế hoạch vào lệnh theo SMC:</div>
                    <div className="mt-1 text-ink-2">
                      Khuyến nghị {smcData.optimalTradeSetup.direction} tại vùng Entry:{" "}
                      <strong className="text-ink-1">
                        {smcData.optimalTradeSetup.entry?.toFixed(4)}
                      </strong>{" "}
                      | Cắt lỗ siết hẹp (SL):{" "}
                      <strong className="text-negative">
                        {smcData.optimalTradeSetup.tightStopLoss?.toFixed(4)}
                      </strong>{" "}
                      ({smcData.optimalTradeSetup.stopPips} pips) | Tỷ lệ R:R:{" "}
                      <strong className="text-positive">
                        1:{smcData.optimalTradeSetup.riskRewardRatio}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSmcPair(null)}
                className="rounded-lg bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-3"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. GIAI ĐOẠN 3: WEBHOOK & MT4/MT5 EA INTEGRATION DRAWER */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="size-5 text-accent" />
                  <h3 className="text-base font-bold text-ink-1">
                    Cầu Nối Tự Động Hóa (MT4 / MT5 EA & Telegram Webhook)
                  </h3>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Kết nối trực tiếp tín hiệu VIP với Robot giao dịch MQL4/MQL5 hoặc Bot Telegram
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

            <div className="mt-4 space-y-3.5 text-[12px]">
              {/* Endpoint 1: MT4/MT5 Polling Endpoint */}
              <div>
                <label className="font-semibold text-ink-1">
                  1. Đường dẫn cấp lệnh cho MT4/MT5 EA (WebRequest Polling URL):
                </label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-line bg-surface-2 p-2">
                  <code className="text-[11px] text-accent select-all">
                    http://localhost:3000/api/v1/forex/ea-feed?magic=888369
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        "http://localhost:3000/api/v1/forex/ea-feed?magic=888369",
                        "ea-feed"
                      )
                    }
                    className="flex items-center gap-1 rounded bg-surface-3 px-2 py-1 text-[10px] font-semibold text-ink-1 hover:bg-accent hover:text-white"
                  >
                    <Copy className="size-3" />
                    {copiedText === "ea-feed" ? "Đã chép!" : "Copy URL"}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-ink-3">
                  Robot MT5 gửi lệnh `WebRequest("GET", url)` định kỳ 5s để tự động khớp Entry, SL và TP1/2/3.
                </p>
              </div>

              {/* Endpoint 2: Telegram / External Webhook */}
              <div>
                <label className="font-semibold text-ink-1">
                  2. Endpoint bắn Webhook tự động (POST Webhook Dispatcher):
                </label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-line bg-surface-2 p-2">
                  <code className="text-[11px] text-ink-1 select-all">
                    http://localhost:3000/api/v1/forex/webhook
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy("http://localhost:3000/api/v1/forex/webhook", "webhook")
                    }
                    className="flex items-center gap-1 rounded bg-surface-3 px-2 py-1 text-[10px] font-semibold text-ink-1 hover:bg-accent hover:text-white"
                  >
                    <Copy className="size-3" />
                    {copiedText === "webhook" ? "Đã chép!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Sample MT5 Order Payload preview */}
              <div>
                <label className="font-semibold text-ink-1">Mẫu cấu trúc lệnh MT5 (JSON format):</label>
                <pre className="mt-1 rounded-lg border border-line bg-surface-2 p-2.5 text-[10px] text-ink-2 overflow-x-auto max-h-32">
{`{
  "version": "1.0",
  "symbol": "EURUSD",
  "cmd": "OP_BUY",
  "price": 1.0850,
  "sl": 1.0825,
  "tp1": 1.0880,
  "tp2": 1.0900,
  "tp3": 1.0925,
  "lots": 0.40,
  "magicNumber": 888369
}`}
                </pre>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

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
