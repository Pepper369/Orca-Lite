"use client";

import { memo } from "react";
import type { VnStockDetail } from "@/lib/services/stocks";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ShieldAlert, Sparkles, Target, Zap } from "lucide-react";

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

  const diffPct = plan && lastPrice > 0 ? ((lastPrice - plan.entry) / lastPrice) * 100 : 0;
  const isOptimalNow = Math.abs(diffPct) <= 0.5;
  const isWaitingPullback = diffPct > 0.5;

  return (
    <div className="space-y-2.5 text-xs">
      {/* 1. Header Khuyến nghị Tức Thì */}
      <div className={`p-2.5 rounded-lg border ${bgTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`font-extrabold text-[13px] flex items-center gap-1 ${tone}`}>
              {isBuy ? <ArrowUpRight className="size-4" /> : isSell ? <ArrowDownRight className="size-4" /> : <Sparkles className="size-4" />}
              LỆNH ĐỀ XUẤT: {signal}
            </span>
            {ts?.confidence != null && (
              <span className="rounded bg-surface-base px-1.5 py-0.5 text-[10px] font-bold text-text-primary border border-border-subtle">
                Độ chắc chắn {Math.round(ts.confidence)}%
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono font-bold text-accent-primary">
            {symbol}
          </span>
        </div>

        {/* Khuyến nghị hành động rõ ràng theo giá */}
        {plan && (
          <div className="mt-2 pt-2 border-t border-border-subtle/50 text-[11px] font-medium">
            {isWaitingPullback ? (
              <div className="text-amber-300 flex items-center gap-1">
                <span>⚠️ Thị trường đang cao hơn điểm an toàn <b>+{diffPct.toFixed(1)}%</b>. Đặt lệnh chờ tại <b>{fmt(plan.entry)}</b> để LỖ ÍT NHẤT.</span>
              </div>
            ) : isOptimalNow ? (
              <div className="text-emerald-400 flex items-center gap-1">
                <span>✅ Thị trường đang ở đúng vùng giá an toàn sát hỗ trợ. Có thể giải ngân ngay.</span>
              </div>
            ) : (
              <div className="text-sky-300 flex items-center gap-1">
                <span>⚡ Giá đã chiết khấu sâu về dưới hỗ trợ. Ưu tiên giải ngân tích lũy quanh <b>{fmt(plan.entry)}</b>.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Điểm Mua & Vùng gom lệnh tối ưu (Không mua đuổi) */}
      <div className="p-2.5 rounded-lg border border-border-subtle bg-surface-elevated/40 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>Điểm Vào Lệnh (Entry) Tối Ưu</span>
          <span className="text-accent-primary font-mono text-[9.5px]">Tối thiểu rủi ro thua lỗ</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-md bg-surface-base border border-border-subtle">
            <div className="text-[10px] text-text-muted">Giá khớp sàn hiện tại</div>
            <div className="num text-sm font-bold text-text-primary mt-0.5">
              {fmt(lastPrice)}
            </div>
            <div className="text-[9px] text-text-muted mt-0.5">Giá đang giao dịch</div>
          </div>

          <div className="p-2 rounded-md bg-accent-primary/10 border border-accent-primary/30">
            <div className="text-[10px] text-accent-primary font-bold flex items-center justify-between">
              <span>ĐIỂM MUA TỐI ƯU</span>
              <Zap className="size-3 text-accent-primary" />
            </div>
            <div className="num text-sm font-black text-accent-primary mt-0.5">
              {plan ? fmt(plan.entry) : fmt(lastPrice)}
            </div>
            <div className="text-[9px] font-semibold mt-0.5 text-text-secondary">
              {plan?.entryZone ? `Vùng gom: ${fmt(plan.entryZone[0])} – ${fmt(plan.entryZone[1])}` : "Sát hỗ trợ cứng"}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BẢNG KẾT QUẢ ĐẦU TƯ: LỖ ÍT NHẤT vs LÃI CAO NHẤT */}
      {plan && (
        <div className="p-2.5 rounded-lg border border-border-subtle bg-surface-elevated/40 space-y-2.5">
          <div className="flex items-center justify-between border-b border-border-subtle/60 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Kết Quả Kỳ Vọng (R:R Bất Đối Xứng)
            </span>
            <span className="rounded bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
              LÃI 1 ĂN {plan.riskReward.toFixed(1)}
            </span>
          </div>

          {/* 2 Cột Đối chiếu Rõ Ràng: Thua mất bao nhiêu? Thắng được bao nhiêu? */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Cột Thua: Lỗ ít nhất */}
            <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/30">
              <div className="flex items-center gap-1 text-[10px] text-rose-300 font-bold uppercase">
                <ShieldAlert className="size-3 text-rose-400" />
                <span>NẾU LỖ (TỐI THIỂU)</span>
              </div>
              <div className="num text-base font-black text-rose-400 mt-1">
                -{plan.riskPct}%
              </div>
              <div className="text-[10px] text-rose-300/90 mt-0.5">
                Cắt lỗ tại: <b>{fmt(plan.stopLoss)}</b>
              </div>
              <div className="text-[9px] text-text-muted mt-1 border-t border-rose-500/20 pt-1">
                Bảo vệ <b>{(100 - plan.riskPct).toFixed(1)}%</b> vốn
              </div>
            </div>

            {/* Cột Thắng: Lãi cao nhất */}
            <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold uppercase">
                <Target className="size-3 text-emerald-400" />
                <span>KHI LÃI (TỐI ĐA)</span>
              </div>
              <div className="num text-base font-black text-emerald-400 mt-1">
                +{plan.rewardPct}%
              </div>
              <div className="text-[10px] text-emerald-300/90 mt-0.5">
                Chốt lời tại: <b>{fmt(plan.takeProfit)}</b>
              </div>
              <div className="text-[9px] text-text-muted mt-1 border-t border-emerald-500/20 pt-1">
                Tỷ suất sinh lời cực đại
              </div>
            </div>
          </div>

          {/* 3 Mốc Chốt Lời Linh Hoạt */}
          <div className="p-2 rounded-md bg-surface-base border border-border-subtle space-y-1">
            <div className="text-[9.5px] font-bold text-text-muted uppercase tracking-wider mb-1">
              Phân bổ 3 nấc lợi nhuận từng phần:
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-1 rounded bg-surface-elevated/70 border border-border-subtle/50">
                <div className="text-[8.5px] text-text-muted">Nấc 1 (Bảo vệ lãi)</div>
                <div className="num text-[11px] font-bold text-emerald-400">+{((plan.takeProfit1 - plan.entry) / plan.entry * 100).toFixed(1)}%</div>
                <div className="num text-[9.5px] text-text-muted">{fmt(plan.takeProfit1)}</div>
              </div>
              <div className="p-1 rounded bg-surface-elevated/70 border border-emerald-500/30">
                <div className="text-[8.5px] text-emerald-300 font-bold">Nấc 2 (Mục tiêu)</div>
                <div className="num text-[11px] font-bold text-emerald-400">+{plan.rewardPct}%</div>
                <div className="num text-[9.5px] text-text-muted">{fmt(plan.takeProfit)}</div>
              </div>
              <div className="p-1 rounded bg-surface-elevated/70 border border-border-subtle/50">
                <div className="text-[8.5px] text-text-muted">Nấc 3 (Kéo sóng)</div>
                <div className="num text-[11px] font-bold text-emerald-400">+{((plan.takeProfit3 - plan.entry) / plan.entry * 100).toFixed(1)}%</div>
                <div className="num text-[9.5px] text-text-muted">{fmt(plan.takeProfit3)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Tóm tắt nguyên tắc kết quả */}
      <div className="p-2 rounded-md bg-surface-base border border-border-subtle text-[10px] text-text-muted space-y-0.5">
        <div className="font-semibold text-text-secondary">Nguyên tắc cốt lõi:</div>
        <div>• Mua sát điểm đỡ hỗ trợ để nếu sai, cắt lỗ ngay và mức lỗ tối đa chỉ quanh <b>2.5% – 3.5%</b>.</div>
        <div>• Khi thị trường vào sóng tăng, biên độ lợi nhuận mở rộng tối đa lên kháng cự trên (đạt từ <b>12% – 25%+</b>).</div>
      </div>
    </div>
  );
});
