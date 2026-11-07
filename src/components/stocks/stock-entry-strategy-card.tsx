"use client";

import { memo } from "react";
import type { VnStockDetail } from "@/lib/services/stocks";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Layers, ShieldAlert, Sparkles, Target, Zap } from "lucide-react";

export const StockEntryStrategyCard = memo(function StockEntryStrategyCard({
  symbol,
  quote,
  technical,
  screenerSync,
}: {
  symbol: string;
  quote?: VnStockDetail["quote"];
  technical?: VnStockDetail["technical"];
  screenerSync?: VnStockDetail["screenerSync"];
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

  // Đồng bộ điểm mua chuẩn & vùng gom với Screener
  const buyPoint = screenerSync?.buyPoint ?? plan?.buyPoint ?? plan?.entry ?? 0;
  const buyRange = screenerSync?.buyRange ?? plan?.buyRange ?? plan?.entryZone ?? (buyPoint > 0 ? [buyPoint * 0.99, buyPoint * 1.015] : null);

  // Tính chênh lệch thời gian thực giữa giá thị trường hiện tại vs Điểm mua
  const diffPct = lastPrice > 0 && buyPoint > 0 ? Number((((lastPrice - buyPoint) / lastPrice) * 100).toFixed(1)) : 0;
  const absDiff = Math.abs(diffPct);

  // Đánh giá trạng thái vùng mua theo chuẩn Screener Engine
  let buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "EXTENDED" | "BELOW_SUPPORT" =
    screenerSync?.buyZoneStatus ?? plan?.buyZoneStatus ?? "NEAR_BUY_POINT";
  if (buyRange && lastPrice > 0 && buyPoint > 0) {
    if (diffPct > 4.5) {
      buyZoneStatus = "EXTENDED";
    } else if (diffPct > 2.8) {
      buyZoneStatus = "WAIT_PULLBACK";
    } else if (absDiff <= 1.2 || (lastPrice >= buyRange[0] && lastPrice <= buyRange[1])) {
      buyZoneStatus = "AT_BUY_POINT";
    } else if (absDiff <= 2.8) {
      buyZoneStatus = "NEAR_BUY_POINT";
    } else {
      buyZoneStatus = "BELOW_SUPPORT";
    }
  }

  const isTriggerNow = Boolean(plan?.isBuyTriggerNow ?? screenerSync?.isBuyTriggerNow);
  const triggerScore = plan?.buyTriggerScore ?? screenerSync?.buyTriggerScore ?? 85;
  const triggerReason = plan?.buyTriggerReasonVi ?? screenerSync?.buyTriggerReasonVi ?? "Đạt chuẩn tín hiệu bứt phá";

  return (
    <div className="space-y-2.5 text-xs">
      {/* 0. Banner Tín Hiệu Mua Ngay Đồng Bộ Bộ Lọc (nếu kích hoạt) */}
      {isTriggerNow && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/10 border border-emerald-500/50 text-emerald-300">
          <div className="flex items-center gap-1.5 font-bold text-[11px]">
            <Zap className="size-3.5 text-accent-primary animate-pulse" />
            <span>⚡ TÍN HIỆU MUA NGAY (Trigger {triggerScore}/99)</span>
          </div>
          <span className="text-[10px] font-semibold text-emerald-400">
            {triggerReason}
          </span>
        </div>
      )}

      {/* 1. Header Khuyến nghị Tức Thì & Điểm Số Định Lượng Bất Đối Xứng */}
      <div className={`p-2.5 rounded-lg border ${bgTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`font-extrabold text-[13px] flex items-center gap-1 ${tone}`}>
              {isBuy ? <ArrowUpRight className="size-4" /> : isSell ? <ArrowDownRight className="size-4" /> : <Sparkles className="size-4" />}
              LỆNH: {signal}
            </span>
            {plan?.asymmetricScore != null && (
              <span className="rounded bg-accent-primary/20 text-accent-primary px-1.5 py-0.5 text-[10px] font-black border border-accent-primary/40">
                AQS {plan.asymmetricScore}/100
              </span>
            )}
            {/* Vị thế Vùng mua đồng bộ bộ lọc */}
            {isBuy && buyPoint > 0 && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                  buyZoneStatus === "AT_BUY_POINT"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : buyZoneStatus === "NEAR_BUY_POINT"
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                      : buyZoneStatus === "WAIT_PULLBACK"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : buyZoneStatus === "EXTENDED"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                }`}
              >
                {buyZoneStatus === "AT_BUY_POINT"
                  ? "🎯 Ngay điểm mua"
                  : buyZoneStatus === "NEAR_BUY_POINT"
                    ? `⚡ Sát điểm mua (+${diffPct}%)`
                    : buyZoneStatus === "WAIT_PULLBACK"
                      ? `⏳ Chờ chỉnh (+${diffPct}%)`
                      : buyZoneStatus === "EXTENDED"
                        ? `🚫 Đã tăng rướn (+${diffPct}%)`
                        : `⚠️ Dưới hỗ trợ (${diffPct}%)`}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono font-bold text-accent-primary">
            {symbol}
          </span>
        </div>

        {/* Lời phán quyết hành động chuẩn Screener Engine */}
        {plan && (
          <div className="mt-2 pt-2 border-t border-border-subtle/50 text-[11px] font-medium leading-relaxed">
            {buyZoneStatus === "WAIT_PULLBACK" ? (
              <div className="text-amber-300">
                ⚠️ Giá sàn ({fmt(lastPrice)}) đã chạy cao hơn điểm mua <b>+{diffPct}%</b> (vượt biên an toàn 2.5%). Kiên nhẫn đặt lệnh chờ pullback tại <b>{fmt(buyPoint)}</b> để khống chế lỗ tối đa chỉ <b>-{plan.riskPct}%</b>.
              </div>
            ) : buyZoneStatus === "NEAR_BUY_POINT" ? (
              <div className="text-teal-300">
                ⚡ Giá sàn ({fmt(lastPrice)}) đang sát điểm mua (+<b>{diffPct}%</b> ≤ 2.5% — trong vùng gom an toàn). Vẫn hoàn toàn đạt tiêu chuẩn giải ngân trước khi bứt xa khỏi nền.
              </div>
            ) : buyZoneStatus === "AT_BUY_POINT" ? (
              <div className="text-emerald-400">
                ✅ Giá sàn ({fmt(lastPrice)}) đang ở đúng bệ đỡ hội tụ / điểm mua chuẩn. Giải ngân ngay để đạt tỷ suất <b>1 ăn {plan.riskReward.toFixed(1)}</b>.
              </div>
            ) : (
              <div className="text-sky-300">
                ⚡ Giá sàn ({fmt(lastPrice)}) đã chiết khấu dưới bệ đỡ (<b>{diffPct}%</b>). Theo dõi phản ứng nến rút chân quanh <b>{fmt(buyPoint)}</b> trước khi mở vị thế mới.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Điểm Mua & Vùng Gom Lệnh Tối Ưu */}
      <div className="p-2.5 rounded-lg border border-border-subtle bg-surface-elevated/40 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>Điểm Vào Lệnh (Entry) Tối Ưu</span>
          <span className="text-accent-primary font-mono text-[9.5px]">Đồng bộ Bộ lọc</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-md bg-surface-base border border-border-subtle">
            <div className="text-[10px] text-text-muted">Giá khớp sàn hiện tại</div>
            <div className="num text-sm font-bold text-text-primary mt-0.5">
              {fmt(lastPrice)}
            </div>
            <div className={`text-[9.5px] font-semibold mt-0.5 ${diffPct > 2.5 ? "text-amber-400" : diffPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {diffPct >= 0 ? `+${diffPct}%` : `${diffPct}%`} so với điểm mua
            </div>
          </div>

          <div className="p-2 rounded-md bg-accent-primary/10 border border-accent-primary/30">
            <div className="text-[10px] text-accent-primary font-bold flex items-center justify-between">
              <span>ĐIỂM MUA TỐI ƯU</span>
              <Zap className="size-3 text-accent-primary" />
            </div>
            <div className="num text-sm font-black text-accent-primary mt-0.5">
              {buyPoint > 0 ? fmt(buyPoint) : (plan ? fmt(plan.entry) : fmt(lastPrice))}
            </div>
            <div className="text-[9px] font-semibold mt-0.5 text-text-secondary">
              {buyRange ? `Vùng gom: ${fmt(buyRange[0])} – ${fmt(buyRange[1])}` : (plan?.entryZone ? `Vùng gom: ${fmt(plan.entryZone[0])} – ${fmt(plan.entryZone[1])}` : "Sát bệ đỡ")}
            </div>
          </div>
        </div>

        {/* Các lớp hỗ trợ bê tông hội tụ */}
        {plan?.confluenceLayers && plan.confluenceLayers.length > 0 && (
          <div className="pt-1 border-t border-border-subtle/50 text-[10px]">
            <div className="text-text-muted font-medium mb-1 flex items-center gap-1">
              <Layers className="size-3 text-accent-primary" />
              <span>Bệ đỡ hội tụ {plan.confluenceLayers.length} lớp kỹ thuật:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {plan.confluenceLayers.map((layer, i) => (
                <span key={i} className="rounded bg-surface-base px-1.5 py-0.5 text-[9.5px] font-medium text-text-secondary border border-border-subtle">
                  {layer}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. BẢNG KẾT QUẢ ĐẦU TƯ: LỖ TỐI THIỂU vs LÃI TỐI ĐA */}
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

          {/* 2 Cột Đối chiếu Rõ Ràng */}
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
                Bảo vệ an toàn <b>{(100 - plan.riskPct).toFixed(1)}%</b> vốn
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

      {/* 4. Căn cứ định lượng */}
      {plan?.basis && plan.basis.length > 0 && (
        <div className="p-2 rounded-lg border border-border-subtle bg-surface-base text-[11px] space-y-1">
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
            Xác nhận định lượng:
          </div>
          {plan.basis.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 text-text-secondary text-[10.5px]">
              <CheckCircle2 className="size-3 text-accent-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
