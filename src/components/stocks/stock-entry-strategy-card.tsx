"use client";

import { memo } from "react";
import type { VnStockDetail } from "@/lib/services/stocks";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Crosshair, HelpCircle, ShieldAlert, Target, Zap } from "lucide-react";

export const StockEntryStrategyCard = memo(function StockEntryStrategyCard({
  symbol,
  quote,
  technical,
}: {
  symbol: string;
  quote?: VnStockDetail["quote"];
  technical?: VnStockDetail["technical"];
}) {
  const ts = technical?.tradeSignal;
  const plan = ts?.plan;
  const lastPrice = quote?.price ?? technical?.last ?? 0;

  const signal = ts?.action === "buy" ? "MUA" : ts?.action === "sell" ? "BÁN" : "QUAN SÁT";
  const isBuy = signal === "MUA";
  const isSell = signal === "BÁN";
  const tone = isBuy ? "text-emerald-400" : isSell ? "text-rose-400" : "text-amber-400";
  const bgTone = isBuy ? "bg-emerald-500/10 border-emerald-500/30" : isSell ? "bg-rose-500/10 border-rose-500/30" : "bg-surface-elevated border-border-subtle";

  const fmt = (n?: number | null) => (n != null ? n.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—");

  return (
    <div className="space-y-2.5 text-xs">
      {/* 1. Header Khuyến nghị & Chiến lược */}
      <div className={`p-2.5 rounded-lg border ${bgTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`font-extrabold text-[13px] flex items-center gap-1 ${tone}`}>
              {isBuy ? <ArrowUpRight className="size-4" /> : isSell ? <ArrowDownRight className="size-4" /> : <Crosshair className="size-4" />}
              TÍN HIỆU {signal}
            </span>
            {ts?.confidence != null && (
              <span className="rounded bg-surface-base px-1.5 py-0.5 text-[10px] font-bold text-text-primary border border-border-subtle">
                Độ tin cậy {Math.round(ts.confidence)}%
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-text-muted">
            {symbol}
          </span>
        </div>

        <div className="mt-1.5 text-[11px] font-medium text-text-secondary">
          Chiến lược: <span className="text-accent-primary font-semibold">{plan?.entryStrategyVi ?? "Phân tích xu hướng & hỗ trợ kỹ thuật"}</span>
        </div>
      </div>

      {/* 2. So sánh Giá hiện tại vs Điểm Entry Mua đề xuất */}
      <div className="p-2.5 rounded-lg border border-border-subtle bg-surface-elevated/40 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>Kế hoạch Điểm Mua (Entry Optimization)</span>
          <span className="text-accent-primary font-mono text-[9.5px]">Không neo cứng giá thị trường</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="p-2 rounded-md bg-surface-base border border-border-subtle/80">
            <div className="text-[10px] text-text-muted">Giá khớp hiện tại</div>
            <div className="num text-sm font-bold text-text-primary mt-0.5">
              {fmt(lastPrice)}
            </div>
            <div className="text-[9.5px] text-text-muted mt-0.5">Giá giao dịch trên sàn</div>
          </div>

          <div className="p-2 rounded-md bg-accent-primary/10 border border-accent-primary/30">
            <div className="text-[10px] text-accent-primary font-semibold flex items-center justify-between">
              <span>Điểm Entry tối ưu</span>
              <Zap className="size-3 text-accent-primary" />
            </div>
            <div className="num text-sm font-bold text-accent-primary mt-0.5">
              {plan ? fmt(plan.entry) : fmt(lastPrice)}
            </div>
            <div className="text-[9.5px] font-medium mt-0.5">
              {plan?.currentPriceDiffPct != null && plan.currentPriceDiffPct < -0.2 ? (
                <span className="text-emerald-400">Canh chỉnh {Math.abs(plan.currentPriceDiffPct).toFixed(1)}%</span>
              ) : plan?.currentPriceDiffPct != null && plan.currentPriceDiffPct > 0.2 ? (
                <span className="text-amber-300">Vượt cản +{plan.currentPriceDiffPct.toFixed(1)}%</span>
              ) : (
                <span className="text-text-muted">Vùng giá tích lũy</span>
              )}
            </div>
          </div>
        </div>

        {/* Vùng gom lệnh an toàn */}
        {plan?.entryZone && (
          <div className="flex items-center justify-between p-2 rounded-md bg-surface-base border border-border-subtle text-[11px]">
            <span className="text-text-muted">Vùng gom lệnh đề xuất:</span>
            <span className="num font-bold text-text-primary">
              {fmt(plan.entryZone[0])} — {fmt(plan.entryZone[1])}
            </span>
          </div>
        )}
      </div>

      {/* 3. Mục tiêu Chốt lời (TP) & Cắt lỗ (SL) */}
      {plan && (
        <div className="p-2.5 rounded-lg border border-border-subtle bg-surface-elevated/40 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
            <span>Quản trị Rủi ro & Mục tiêu (R:R)</span>
            <span className="font-mono text-accent-primary font-bold">R:R 1:{plan.riskReward.toFixed(1)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/25">
              <div className="text-[10px] text-rose-300 font-medium">Cắt lỗ (Stop Loss)</div>
              <div className="num text-sm font-bold text-rose-400 mt-0.5">{fmt(plan.stopLoss)}</div>
              <div className="text-[9.5px] text-rose-300/80 mt-0.5">Rủi ro: -{plan.riskPct}%</div>
            </div>

            <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25">
              <div className="text-[10px] text-emerald-300 font-medium">Chốt lời (Target TP)</div>
              <div className="num text-sm font-bold text-emerald-400 mt-0.5">{fmt(plan.takeProfit)}</div>
              <div className="text-[9.5px] text-emerald-300/80 mt-0.5">Kỳ vọng: +{plan.rewardPct}%</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
            <div className="p-1.5 rounded bg-surface-base border border-border-subtle">
              <div className="text-[9px] text-text-muted">TP1 (1.5R)</div>
              <div className="num text-[11px] font-semibold text-emerald-400">{fmt(plan.takeProfit1)}</div>
            </div>
            <div className="p-1.5 rounded bg-surface-base border border-border-subtle">
              <div className="text-[9px] text-text-muted">TP2 (2.5R)</div>
              <div className="num text-[11px] font-semibold text-emerald-400">{fmt(plan.takeProfit2)}</div>
            </div>
            <div className="p-1.5 rounded bg-surface-base border border-border-subtle">
              <div className="text-[9px] text-text-muted">TP3 (4.0R)</div>
              <div className="num text-[11px] font-semibold text-emerald-400">{fmt(plan.takeProfit3)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Căn cứ & Luận điểm kỹ thuật */}
      {plan?.basis && plan.basis.length > 0 && (
        <div className="p-2 rounded-lg border border-border-subtle bg-surface-base text-[11px] space-y-1">
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
            Căn cứ kỹ thuật & Điểm tựa:
          </div>
          {plan.basis.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 text-text-secondary">
              <CheckCircle2 className="size-3 text-accent-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      )}

      {/* 5. Ghi chú thị trường */}
      <p className="text-[10px] text-text-muted leading-relaxed px-1">
        * Lưu ý: Điểm Entry tối ưu được thuật toán tính toán theo vùng hỗ trợ động (SMA20/EMA20/VWAP) nhằm tối đa hóa tỷ lệ R:R và tránh rủi ro mua đuổi đỉnh ngắn hạn.
      </p>
    </div>
  );
});
