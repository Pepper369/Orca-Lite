"use client";

import { memo } from "react";
import { useApi } from "@/lib/hooks";
import type { BusinessGoalsResult } from "@/lib/services/stock-business-goals";
import { Loading, Panel, EmptyState, fmtCompact } from "@/components/ui";
import {
  Target,
  Award,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  FileText,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export const BusinessGoalsPanel = memo(function BusinessGoalsPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<{ data: BusinessGoalsResult }>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/business-goals` : null,
    { refreshInterval: 180_000 }
  );

  const res = data?.data;
  const target = res?.target;
  const realized = res?.realized;
  const progress = res?.progress;
  const announcements = res?.recentAgmAnnouncements || [];

  const title = (
    <span className="flex items-center gap-2">
      <Target className="size-4 text-accent-primary" /> Tiến Độ Thực Hiện Kế Hoạch ĐHĐCĐ ({symbol})
    </span>
  );

  if (isLoading && !res) {
    return (
      <Panel title={title}>
        <Loading rows={4} label={`Đang phân tích kế hoạch kinh doanh năm của ${symbol}…`} />
      </Panel>
    );
  }

  if (!res) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa có dữ liệu kế hoạch ĐHCĐ của ${symbol}`}
          description="Hệ thống đang đồng bộ nghị quyết Đại hội đồng Cổ đông thường niên."
        />
      </Panel>
    );
  }

  const isExceeded = progress?.status === "EXCEEDED";
  const isBehind = progress?.status === "BEHIND";

  return (
    <Panel
      title={title}
      right={
        progress && (
          <span
            className={`rounded px-2.5 py-0.5 text-[11px] font-bold ${
              isExceeded
                ? "bg-emerald-500/15 text-emerald-400"
                : isBehind
                ? "bg-rose-500/15 text-rose-400"
                : "bg-cyan-500/15 text-cyan-400"
            }`}
          >
            {isExceeded ? "VƯỢT KẾ HOẠCH NĂM 🌟" : isBehind ? "CẦN TĂNG TỐC ⚠️" : "ĐẠT TIẾN ĐỘ ĐHCĐ 🟢"}
          </span>
        )
      }
    >
      <div className="space-y-4">
        {/* Banner Nhận định */}
        <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-text-muted">Đánh giá thực hiện mục tiêu năm {res.year}</span>
            <p className="text-sm font-bold text-text-primary">{progress?.verdictVi}</p>
          </div>
          <span className="text-xs text-text-muted font-medium">
            {target?.sourceResolution}
          </span>
        </div>

        {/* 2 Progress Bars: Doanh thu & Lợi nhuận */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 1. Doanh thu */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Chỉ tiêu Doanh Thu Thuần</span>
              <span className="text-sm font-extrabold text-text-primary">
                {progress?.revenuePct}%
              </span>
            </div>

            {/* Progress bar line */}
            <div className="h-2.5 w-full rounded-full bg-surface-elevated overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (progress?.revenuePct || 0) >= 100
                    ? "bg-emerald-500"
                    : (progress?.revenuePct || 0) >= 75
                    ? "bg-cyan-500"
                    : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress?.revenuePct || 0))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border-subtle/50 text-text-muted">
              <div>
                <span>Đã thực hiện:</span>{" "}
                <span className="font-bold text-text-primary">{fmtCompact(realized?.revenueBillion ? realized.revenueBillion * 1e9 : 0)} ₫</span>
              </div>
              <div>
                <span>Mục tiêu ĐHCĐ:</span>{" "}
                <span className="font-bold text-text-primary">{fmtCompact(target?.revenueBillion ? target.revenueBillion * 1e9 : 0)} ₫</span>
              </div>
            </div>
          </div>

          {/* 2. Lợi nhuận sau thuế */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Chỉ tiêu Lợi Nhuận Sau Thuế (LNST)</span>
              <span className="text-sm font-extrabold text-emerald-400">
                {progress?.profitPct}%
              </span>
            </div>

            {/* Progress bar line */}
            <div className="h-2.5 w-full rounded-full bg-surface-elevated overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (progress?.profitPct || 0) >= 100
                    ? "bg-emerald-400"
                    : (progress?.profitPct || 0) >= 75
                    ? "bg-cyan-400"
                    : "bg-rose-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress?.profitPct || 0))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border-subtle/50 text-text-muted">
              <div>
                <span>Đã thực hiện:</span>{" "}
                <span className="font-bold text-emerald-400">{fmtCompact(realized?.profitBillion ? realized.profitBillion * 1e9 : 0)} ₫</span>
              </div>
              <div>
                <span>Mục tiêu ĐHCĐ:</span>{" "}
                <span className="font-bold text-text-primary">{fmtCompact(target?.profitBillion ? target.profitBillion * 1e9 : 0)} ₫</span>
              </div>
            </div>
          </div>
        </div>

        {/* Thông báo ĐHCĐ & Cổ tức dự kiến */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Cổ tức kế hoạch */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
              <Award className="size-4 text-amber-400" />
              <span>Chính Sách Cổ Tức ĐHCĐ Thông Qua</span>
            </div>
            <p className="text-xs text-text-secondary">{target?.dividendPlan}</p>
            <p className="text-[11px] text-text-muted pt-1">
              *Tùy thuộc kết quả kinh doanh kiểm toán và tờ trình được phê duyệt tại ĐHĐCĐ thường niên.
            </p>
          </div>

          {/* Danh sách thông báo ĐHCĐ */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
              <FileText className="size-4 text-accent-primary" />
              <span>Nghị Quyết & Tài Liệu ĐHĐCĐ Gần Nhất</span>
            </div>
            {announcements.length ? (
              <div className="space-y-1 pt-1">
                {announcements.slice(0, 2).map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="truncate max-w-[280px]" title={a.title}>• {a.title}</span>
                    <span className="text-[10px] text-text-muted font-mono">{a.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">Đang cập nhật nghị quyết mới nhất.</p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
});
