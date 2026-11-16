"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  X,
  Copy,
  Check,
  RotateCcw,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Cpu,
  Clock,
  Layers,
} from "lucide-react";
import type { ScreenerStockItem } from "@/lib/services/screener-snapshot-service";

interface ScreenerAiSynthesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  preset?: string;
  stocks: ScreenerStockItem[];
  totalMatched?: number;
}

interface SynthesisResponse {
  synthesis: string;
  model: string;
  latencyMs?: number;
  stockCount?: number;
  generatedAt?: string;
}

export function ScreenerAiSynthesisModal({
  isOpen,
  onClose,
  preset,
  stocks,
  totalMatched,
}: ScreenerAiSynthesisModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SynthesisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");

  const analyzeStocks = useCallback(
    async (overrideQuestion?: string) => {
      if (stocks.length === 0) return;
      setLoading(true);
      setError(null);

      try {
        const topStocks = stocks.slice(0, 10).map((s) => ({
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          price: s.price,
          changePercent: s.changePercent,
          volume: s.volume,
          pe: s.pe,
          pb: s.pb,
          roe: s.roe,
          compositeScore: s.compositeScore,
          qualityScore: s.qualityScore,
          rsRating: s.rsRating,
          buyPoint: s.buyPoint,
          buyPointDiffPct: s.buyPointDiffPct,
          buyZoneStatus: s.buyZoneStatus,
          smartMoneySignal: s.smartMoneySignal,
          vsaSignal: s.vsaSignal,
          setupGrade: s.setupGrade,
          confluenceBadge: s.confluenceBadge,
          tripleBarrierRiskReward: s.tripleBarrierRiskReward,
          tripleBarrierUpper: s.tripleBarrierUpper,
          tripleBarrierLower: s.tripleBarrierLower,
        }));

        const res = await fetch("/api/v1/screener/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preset,
            totalMatched: totalMatched ?? stocks.length,
            stocks: topStocks,
            question: overrideQuestion ?? (customQuestion.trim() ? customQuestion.trim() : undefined),
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error?.message || "Không thể tổng hợp chiến lược lúc này.");
        }

        const json = await res.json();
        if (json.data) {
          setData(json.data);
        } else {
          throw new Error("Dữ liệu phản hồi không hợp lệ.");
        }
      } catch (err: any) {
        console.error("[Screener AI Synthesis Error]:", err);
        setError(err.message || "Đã xảy ra lỗi khi kết nối tới Orca AI Copilot.");
      } finally {
        setLoading(false);
      }
    },
    [stocks, preset, totalMatched, customQuestion]
  );

  // Auto analyze on open if no data
  useEffect(() => {
    if (isOpen && !data && !loading && stocks.length > 0) {
      analyzeStocks();
    }
  }, [isOpen, data, loading, stocks.length, analyzeStocks]);

  const handleCopy = () => {
    if (!data?.synthesis) return;
    navigator.clipboard.writeText(data.synthesis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-panel-1 border border-border-default shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-gradient-to-r from-purple-500/10 via-panel-2 to-panel-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400">
              <Sparkles className="size-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary tracking-tight">
                  Orca AI Screener Copilot
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                  Smart Basket Synthesis
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Tổng hợp chiến lược rổ cổ phiếu, tương quan dòng tiền và ma trận giải ngân định lượng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-panel-3 transition-colors"
            title="Đóng modal"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Stock Basket Preview Strip */}
        <div className="px-5 py-2.5 bg-panel-2/60 border-b border-border-subtle flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-text-muted flex items-center gap-1">
            <Layers className="size-3 text-accent-primary" /> Rổ phân tích ({stocks.slice(0, 10).length}/{totalMatched ?? stocks.length} mã):
          </span>
          <div className="flex flex-wrap items-center gap-1.5 max-h-16 overflow-y-auto">
            {stocks.slice(0, 10).map((s) => {
              const chg = s.changePercent ?? 0;
              const isUp = chg >= 0;
              return (
                <span
                  key={s.symbol}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-panel-3 border border-border-subtle"
                >
                  <span className="font-bold text-text-primary">{s.symbol}</span>
                  <span className={isUp ? "text-emerald-400 text-[10px]" : "text-rose-400 text-[10px]"}>
                    {isUp ? "+" : ""}{chg.toFixed(1)}%
                  </span>
                  {s.rsRating != null && (
                    <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-300 font-sans">
                      RS {s.rsRating}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="relative">
                <div className="size-12 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin" />
                <Sparkles className="size-5 text-purple-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-text-primary">
                  Orca AI đang tổng hợp ma trận định lượng...
                </p>
                <p className="text-xs text-text-muted max-w-sm">
                  Đang bóc tách tương quan dòng tiền ngành, điểm mua Sweet Launch Zone, và lập bảng tỷ trọng đi vốn R:R tối ưu.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <ShieldAlert className="size-4" />
                <span>Không thể hoàn thành tổng hợp chiến lược</span>
              </div>
              <p className="text-xs text-rose-200/80">{error}</p>
              <button
                type="button"
                onClick={() => analyzeStocks()}
                className="mt-2 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="size-3" /> Thử lại
              </button>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* Metadata bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-panel-2 border border-border-subtle text-[11px] text-text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Cpu className="size-3 text-purple-400" />
                    <span>Engine: <strong className="text-text-primary">{data.model}</strong></span>
                  </span>
                  {data.latencyMs != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-cyan-400" />
                      <span>Độ trễ: <strong className="text-text-primary">{data.latencyMs}ms</strong></span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-panel-3 hover:bg-panel-1 border border-border-subtle text-text-primary text-[11px] font-medium transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 text-emerald-400" />
                        <span className="text-emerald-400">Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 text-text-muted" />
                        <span>Sao chép báo cáo</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => analyzeStocks()}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-panel-3 hover:bg-panel-1 border border-border-subtle text-text-primary text-[11px] font-medium transition-colors"
                    title="Phân tích lại rổ cổ phiếu"
                  >
                    <RotateCcw className="size-3 text-text-muted" />
                    <span>Phân tích lại</span>
                  </button>
                </div>
              </div>

              {/* Formatted Report Content */}
              <div className="p-4 rounded-xl bg-panel-2/40 border border-border-subtle/80 text-xs sm:text-sm leading-relaxed text-text-primary whitespace-pre-wrap font-sans select-text">
                {data.synthesis}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Question Input */}
        <div className="px-5 py-3 border-t border-border-subtle bg-panel-2/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              analyzeStocks(customQuestion);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="Đặt câu hỏi chi tiết về rổ này (VD: Nếu thị trường giảm mạnh thì mã nào phòng thủ tốt nhất?)..."
              className="flex-1 bg-panel-1 border border-border-default rounded-xl px-3.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-purple-500/50"
            />
            <button
              type="submit"
              disabled={loading || stocks.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-accent-primary hover:from-purple-500 hover:to-accent-primary/90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span>Phân Tích</span>
              <ArrowRight className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
