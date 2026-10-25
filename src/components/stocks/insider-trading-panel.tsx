"use client";

import { memo } from "react";
import { useApi } from "@/lib/hooks";
import type { InsiderDealsResult } from "@/lib/services/stock-insider-deals";
import { Loading, Panel, EmptyState } from "@/components/ui";
import {
  Users2,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  ExternalLink,
  ShieldCheck,
  Calendar,
  AlertCircle,
  Award,
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

export const InsiderTradingPanel = memo(function InsiderTradingPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<{ data: InsiderDealsResult }>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/insider-deals?limit=25` : null,
    { refreshInterval: 120_000 }
  );

  const res = data?.data;
  const deals = res?.deals || [];
  const summary = res?.summary;

  const title = (
    <span className="flex items-center gap-2">
      <Users2 className="size-4 text-accent-primary" /> Giao Dịch Người Nội Bộ & Ban Lãnh Đạo ({symbol})
    </span>
  );

  if (isLoading && !res) {
    return (
      <Panel title={title}>
        <Loading rows={4} label={`Đang tải lịch sử giao dịch lãnh đạo ${symbol}…`} />
      </Panel>
    );
  }

  if (!deals.length) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa ghi nhận giao dịch nội bộ gần đây của ${symbol}`}
          description="Ban lãnh đạo và người có liên quan không phát sinh thông báo mua bán mới trong các tháng qua."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title={title}
      right={
        summary && (
          <span
            className={`rounded px-2.5 py-0.5 text-[11px] font-bold ${
              summary.signal === "NET_ACCUMULATION"
                ? "bg-emerald-500/15 text-emerald-400"
                : summary.signal === "NET_DISTRIBUTION"
                ? "bg-rose-500/15 text-rose-400"
                : "bg-surface-elevated text-text-muted"
            }`}
          >
            {summary.signalVi}
          </span>
        )
      }
    >
      <div className="space-y-4">
        {/* Quick summary metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
            <span className="text-[11px] text-text-muted">Tổng giao dịch ghi nhận</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-text-primary">{res?.totalDeals || 0}</span>
              <span className="text-[11px] text-text-muted">thông báo</span>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
            <span className="text-[11px] text-text-muted">Giao dịch Đăng ký Mua</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-emerald-400">+{summary?.buyCount || 0}</span>
              <TrendingUp className="size-3.5 text-emerald-400" />
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
            <span className="text-[11px] text-text-muted">Giao dịch Đăng ký Bán</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-rose-400">-{summary?.sellCount || 0}</span>
              <TrendingDown className="size-3.5 text-rose-400" />
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
            <span className="text-[11px] text-text-muted">Tín hiệu Dòng tiền Lãnh đạo</span>
            <div className="mt-1 text-xs font-bold text-text-primary truncate">
              {summary?.signal === "NET_ACCUMULATION" ? "Gom Tích Lũy 🟢" : summary?.signal === "NET_DISTRIBUTION" ? "Chốt Lời / Hạ Tỷ Trọng 🔴" : "Cân Bằng ⚪"}
            </div>
          </div>
        </div>

        {/* Timeline table */}
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-base">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-elevated/40 text-text-muted">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Ngày công bố</th>
                <th className="py-2.5 px-3 font-semibold">Người thực hiện</th>
                <th className="py-2.5 px-3 font-semibold">Chức vụ / Quan hệ</th>
                <th className="py-2.5 px-3 font-semibold text-center">Hành động</th>
                <th className="py-2.5 px-3 font-semibold">Nội dung thông báo giao dịch</th>
                <th className="py-2.5 px-3 font-semibold text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {deals.map((deal) => {
                let badgeClass = "bg-surface-elevated text-text-muted";
                let actionLabel = "GIAO DỊCH";
                if (deal.action === "BUY") {
                  badgeClass = "bg-emerald-500/15 text-emerald-400 font-bold";
                  actionLabel = "ĐĂNG KÝ MUA";
                } else if (deal.action === "SELL") {
                  badgeClass = "bg-rose-500/15 text-rose-400 font-bold";
                  actionLabel = "ĐĂNG KÝ BÁN";
                } else if (deal.action === "TRANSFER") {
                  badgeClass = "bg-amber-500/15 text-amber-400 font-bold";
                  actionLabel = "CHUYỂN NHƯỢNG";
                }

                return (
                  <tr key={deal.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="py-2 px-3 font-mono text-text-muted whitespace-nowrap">
                      {fmtDate(deal.date)}
                    </td>
                    <td className="py-2 px-3 font-bold text-text-primary whitespace-nowrap">
                      {deal.person}
                    </td>
                    <td className="py-2 px-3 text-text-muted whitespace-nowrap">
                      {deal.role}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span className={`rounded px-2 py-0.5 text-[10px] ${badgeClass}`}>
                        {actionLabel}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-text-secondary max-w-md truncate" title={deal.title}>
                      {deal.title}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <a
                        href={deal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-primary hover:underline"
                      >
                        Công bố <ExternalLink className="size-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
});
