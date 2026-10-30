"use client";

import { memo } from "react";
import { useApi } from "@/lib/hooks";
import type { DividendIntelligenceResult } from "@/lib/services/stock-dividend-intelligence";
import { Loading, Panel, EmptyState } from "@/components/ui";
import {
  Coins,
  TrendingUp,
  Award,
  Calendar,
  Percent,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    const [y, m, day] = d.split("-");
    if (y && m && day) return `${day}/${m}/${y}`;
    return d;
  } catch {
    return d;
  }
};

const fmtVnd = (val: number | null | undefined) => {
  if (val == null || !Number.isFinite(val)) return "—";
  return `${val.toLocaleString("vi-VN")} ₫`;
};

export const DividendIntelligencePanel = memo(function DividendIntelligencePanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<{ data: DividendIntelligenceResult }>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/dividends` : null,
    { refreshInterval: 120_000 }
  );

  const res = data?.data;
  const metrics = res?.metrics;
  const yearly = res?.yearlyHistory || [];
  const upcoming = res?.upcomingDividends || [];
  const events = res?.allEvents || [];

  const title = (
    <span className="flex items-center gap-2">
      <Coins className="size-4 text-amber-400" /> Hồ Sơ Cổ Tức & Tỷ Suất Sinh Lời Dividend Yield ({symbol})
    </span>
  );

  if (isLoading && !res) {
    return (
      <Panel title={title}>
        <Loading rows={4} label={`Đang phân tích tỷ suất cổ tức tiền mặt của ${symbol}…`} />
      </Panel>
    );
  }

  if (!res || (!events.length && !yearly.length)) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa ghi nhận dữ liệu chia cổ tức của ${symbol}`}
          description="Công ty chưa phát sinh nghị quyết chia cổ tức bằng tiền hoặc cổ phiếu trong các năm qua."
        />
      </Panel>
    );
  }

  const isHighYield = metrics?.assessment === "HIGH_YIELD";

  return (
    <Panel
      title={title}
      right={
        metrics && (
          <span
            className={`rounded px-2.5 py-0.5 text-[11px] font-bold ${
              isHighYield
                ? "bg-emerald-500/15 text-emerald-400"
                : metrics.dividendYieldPct >= 4
                ? "bg-cyan-500/15 text-cyan-400"
                : "bg-surface-elevated text-text-muted"
            }`}
          >
            {metrics.assessmentVi}
          </span>
        )
      }
    >
      <div className="space-y-4">
        {/* Metric Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5">
            <span className="text-[11px] text-text-muted">Tỷ suất Cổ tức Hiện tại (Yield)</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-xl font-extrabold ${isHighYield ? "text-emerald-400" : "text-amber-400"}`}>
                {metrics?.dividendYieldPct}%
              </span>
              <span className="text-[11px] text-text-muted">/ năm</span>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              {metrics && metrics.spreadOverBankRatePct >= 0
                ? `Cao hơn gửi tiết kiệm +${metrics.spreadOverBankRatePct}%`
                : `Thấp hơn gửi tiết kiệm ${metrics?.spreadOverBankRatePct}%`}
            </p>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5">
            <span className="text-[11px] text-text-muted">Cổ tức tiền mặt 12 tháng</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-text-primary">
                {fmtVnd(metrics?.cashDividend12mVnd)}
              </span>
              <span className="text-[11px] text-text-muted">/ cp</span>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              Thị giá tham chiếu: {fmtVnd(res.currentPrice)}
            </p>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5">
            <span className="text-[11px] text-text-muted">Tỷ suất bình quân 3 năm</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-cyan-400">
                {metrics?.avgYield3yPct}%
              </span>
              <span className="text-[11px] text-text-muted">/ năm</span>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              Chu kỳ thanh toán ổn định
            </p>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5">
            <span className="text-[11px] text-text-muted">Độ Đều Đặn Trả Cổ Tức</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-text-primary">
                {metrics?.consistencyScore}/100
              </span>
              <Award className="size-4 text-amber-400" />
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              {metrics && metrics.consistencyScore >= 80 ? "Chi trả liên tục 5 năm" : "Không đều hoặc giữ lại vốn"}
            </p>
          </div>
        </div>

        {/* Cổ tức sắp tới (Upcoming Dividends) */}
        {upcoming.length > 0 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Clock className="size-4" />
              <span>Sự Kiện Cổ Tức Sắp Diễn Ra (Lịch Chốt Quyền & Thanh Toán)</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {upcoming.map((u) => (
                <div key={u.id} className="rounded-lg border border-emerald-500/20 bg-surface-base p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-text-primary">
                    <span>{u.typeDesc}</span>
                    <span className="text-emerald-400">{u.amountVnd ? fmtVnd(u.amountVnd) : `${u.ratioPct}%`}</span>
                  </div>
                  <div className="flex items-center justify-between text-text-muted text-[11px]">
                    <span>Ngày GDKHQ: {fmtDate(u.effectiveDate)}</span>
                    <span>Thanh toán: {fmtDate(u.actualDate)}</span>
                  </div>
                  {u.note && <p className="text-[11px] text-text-secondary truncate">{u.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lịch sử theo năm (Yearly breakdown bars) */}
        {yearly.length > 0 && (
          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-text-primary">
              <span>Lịch Sử Chi Trả Cổ Tức Qua Các Năm (Tiền Mặt & Cổ Phiếu)</span>
              <span className="text-[11px] text-text-muted">Nguồn: Báo cáo thường niên & HOSE/HNX</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {yearly.slice(0, 5).map((y) => (
                <div key={y.year} className="rounded-lg border border-border-subtle/60 bg-surface-elevated/40 p-2.5 text-center space-y-1">
                  <span className="text-xs font-extrabold text-accent-primary">Năm {y.year}</span>
                  <div className="text-sm font-bold text-text-primary">
                    {y.cashVndPerShare > 0 ? fmtVnd(y.cashVndPerShare) : "0 ₫"}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {y.stockDividendRatioPct > 0 ? `+${y.stockDividendRatioPct}% cổ phiếu` : "Không chia CP"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bảng chi tiết toàn bộ các đợt chia */}
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-base">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-elevated/40 text-text-muted">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Ngày GDKHQ</th>
                <th className="py-2.5 px-3 font-semibold">Ngày thanh toán</th>
                <th className="py-2.5 px-3 font-semibold">Hình thức</th>
                <th className="py-2.5 px-3 font-semibold text-right">Mức chi trả</th>
                <th className="py-2.5 px-3 font-semibold">Năm tài chính</th>
                <th className="py-2.5 px-3 font-semibold">Nội dung chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="py-2 px-3 font-mono text-text-muted whitespace-nowrap">
                    {fmtDate(e.effectiveDate)}
                  </td>
                  <td className="py-2 px-3 font-mono text-text-muted whitespace-nowrap">
                    {fmtDate(e.actualDate)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        e.type === "CASH"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-cyan-500/15 text-cyan-400"
                      }`}
                    >
                      {e.type === "CASH" ? "TIỀN MẶT" : "CỔ PHIẾU"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-text-primary whitespace-nowrap">
                    {e.type === "CASH" && e.amountVnd != null
                      ? fmtVnd(e.amountVnd)
                      : e.ratioPct != null
                      ? `${e.ratioPct}%`
                      : "—"}
                  </td>
                  <td className="py-2 px-3 text-text-muted whitespace-nowrap">
                    {e.year ? `Năm ${e.year}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-text-secondary max-w-sm truncate" title={e.note || e.typeDesc}>
                    {e.note || e.typeDesc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
});
