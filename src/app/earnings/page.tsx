"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Panel, Loading, FreshnessDot } from "@/components/ui";
import {
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Search,
  Building,
  ShieldCheck,
  Scale,
} from "lucide-react";
import type { CompanyEarningsItem } from "@/app/api/v1/earnings/calendar/route";
import type { BctcDeadline } from "@/lib/services/earnings-intel";

interface EarningsCalendarApiResponse {
  deadlines: BctcDeadline[];
  upcomingDeadline: BctcDeadline;
  progress: {
    totalCompanies: number;
    publishedCount: number;
    pendingCount: number;
    overdueCount: number;
    progressPct: number;
  };
  companies: CompanyEarningsItem[];
  legalBasisVi: string;
}

export default function EarningsCalendarPage() {
  const { data, isLoading } = useApi<EarningsCalendarApiResponse>(
    "/api/v1/earnings/calendar",
    { refreshInterval: 60_000 }
  );

  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | "HOSE" | "HNX" | "UPCOM">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "PENDING" | "OVERDUE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const companies = data?.companies ?? [];

  // Lọc dữ liệu công ty
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (exchangeFilter !== "ALL" && c.exchange !== exchangeFilter) return false;
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        return (
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [companies, exchangeFilter, statusFilter, searchQuery]);

  if (isLoading && !data) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        <Panel title="Lịch BCTC & Đồng Hồ Đếm Ngược Thông Tư 96/2020/TT-BTC">
          <Loading />
        </Panel>
      </div>
    );
  }

  const upcoming = data?.upcomingDeadline;
  const progress = data?.progress;
  const deadlines = data?.deadlines ?? [];

  const getQualityBadge = (grade?: string) => {
    switch (grade) {
      case "GRADE_A":
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded">HẠNG A: CỐT LÕI MẠNH</span>;
      case "GRADE_B":
        return <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold px-2 py-0.5 rounded">HẠNG B: KHÁ</span>;
      case "GRADE_C":
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded">HẠNG C: THU NHẬP PHỤ</span>;
      case "GRADE_D":
        return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">HẠNG D: THOÁT LỖ GIẤY</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Scale className="size-6 text-accent" />
            <h1 className="text-xl sm:text-2xl font-bold text-ink">
              Lịch BCTC & Đếm Ngược Hạn Nộp Thông Tư 96/2020/TT-BTC
            </h1>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Giám sát tiến độ công bố Báo cáo Tài chính toàn bộ 3 sàn (HOSE, HNX, UPCOM) và đối chiếu tính pháp lý chuẩn UBCKNN.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-panel-2 border border-line text-ink-2">
            Luật định: TT 96/2020/TT-BTC
          </span>
        </div>
      </div>

      {/* Grid 2 Thẻ: Đồng Hồ Đếm Ngược & Thanh Tiến Độ Công Bố */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Thẻ 1: Đồng hồ đếm ngược hạn nộp gần nhất */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-5 text-accent animate-spin" style={{ animationDuration: "12s" }} />
              <span className="font-bold text-ink text-sm">Hạn Chót Công Bố Kế Tiếp</span>
            </div>
            <span className="text-xs font-mono font-bold text-accent px-2 py-0.5 rounded bg-accent/15 border border-accent/30">
              {upcoming?.period}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl sm:text-4xl font-extrabold text-ink font-mono tracking-tight">
              {upcoming?.daysRemaining != null ? Math.max(0, upcoming.daysRemaining) : "--"}
            </span>
            <span className="text-sm font-semibold text-ink-2">ngày còn lại</span>
            <span className="text-xs text-ink-3 font-mono">
              (Hạn chót: {upcoming?.date})
            </span>
          </div>

          <p className="text-xs text-ink-2 leading-relaxed">
            {upcoming?.descriptionVi}. Doanh nghiệp chậm công bố sau mốc này sẽ bị UBCKNN nhắc nhở, phạt hành chính và đưa vào diện cảnh báo/kiểm soát.
          </p>
        </div>

        {/* Thẻ 2: Thanh tiến độ công bố thị trường */}
        <div className="rounded-xl border border-line bg-panel-1 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-400" />
              <span className="font-bold text-ink text-sm">Tiến Độ Mùa Báo Cáo</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {progress?.progressPct}% Hoàn tất
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-3 w-full bg-panel-3 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress?.progressPct ?? 0}%` }}
              title={`Đã công bố: ${progress?.publishedCount} doanh nghiệp`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-1">
            <div className="bg-panel-2 p-1.5 rounded border border-line">
              <span className="text-[10px] text-ink-3 block">Đã nộp</span>
              <span className="text-emerald-400 font-bold">{progress?.publishedCount}</span>
            </div>
            <div className="bg-panel-2 p-1.5 rounded border border-line">
              <span className="text-[10px] text-ink-3 block">Chờ nộp</span>
              <span className="text-amber-400 font-bold">{progress?.pendingCount}</span>
            </div>
            <div className="bg-panel-2 p-1.5 rounded border border-line">
              <span className="text-[10px] text-ink-3 block">Quá hạn</span>
              <span className="text-rose-400 font-bold">{progress?.overdueCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Accordion 6 Mốc Hạn Nộp Theo Luật Định TT96 */}
      <div className="rounded-xl border border-line bg-panel-1 p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
          <Calendar className="size-4 text-accent" />
          <span>Quy Định Hạn Nộp 6 Kỳ BCTC Trong Năm Theo Luật (TT 96/2020/TT-BTC)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
          {deadlines.map((d) => (
            <div
              key={d.period}
              className={`p-2.5 rounded-lg border transition-all ${
                d.period === upcoming?.period
                  ? "border-accent bg-accent/10 shadow-xs"
                  : "border-line bg-panel-2"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-ink">{d.period}</span>
                {d.daysRemaining <= 30 && d.daysRemaining >= 0 && (
                  <span className="size-2 rounded-full bg-accent animate-ping" />
                )}
              </div>
              <div className="text-[11px] text-ink-3">{d.date}</div>
              <div className="text-[10px] mt-1 text-ink-2 font-sans line-clamp-1">
                {d.descriptionVi}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Exchange Tabs */}
        <div className="flex rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
          {(["ALL", "HOSE", "HNX", "UPCOM"] as const).map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setExchangeFilter(ex)}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                exchangeFilter === ex
                  ? "bg-accent text-white font-bold"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {ex === "ALL" ? "Toàn Bộ Sàn" : ex}
            </button>
          ))}
        </div>

        {/* Status Filter & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-xs text-ink focus:outline-none"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="PUBLISHED">Đã nộp BCTC</option>
            <option value="PENDING">Đang chờ nộp</option>
            <option value="OVERDUE">Quá hạn nộp</option>
          </select>

          <div className="relative w-44 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã / tên cty..."
              className="w-full rounded-lg border border-line bg-panel-2 py-1 pl-8 pr-2.5 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách BCTC & Chất Lượng Lợi Nhuận */}
      <div className="overflow-x-auto rounded-xl border border-line bg-panel-1 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-panel-2 text-ink-3 font-semibold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Mã CP / Doanh Nghiệp</th>
              <th className="py-2.5 px-2">Sàn</th>
              <th className="py-2.5 px-2">Kỳ BCTC</th>
              <th className="py-2.5 px-3">Hạn Chót</th>
              <th className="py-2.5 px-3">Trạng Thái</th>
              <th className="py-2.5 px-3 text-right">Doanh Thu (Tỷ)</th>
              <th className="py-2.5 px-3 text-right">LNST (Tỷ)</th>
              <th className="py-2.5 px-3 text-right">Tăng Trưởng</th>
              <th className="py-2.5 px-3">Chất Lượng Lợi Nhuận (AI)</th>
              <th className="py-2.5 px-3 text-right">Hành Động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/30">
            {filteredCompanies.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-xs text-ink-3">
                  Không tìm thấy doanh nghiệp phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredCompanies.map((c) => (
                <tr key={c.symbol} className="hover:bg-panel-2/60 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/stocks/${c.symbol}`}
                        className="font-bold text-accent hover:underline text-sm font-mono"
                      >
                        {c.symbol}
                      </Link>
                      <span className="text-ink-2 font-medium line-clamp-1">
                        {c.name}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-2 font-mono text-ink-3">
                    <span className="px-1.5 py-0.5 rounded bg-panel-2 border border-line text-[10px]">
                      {c.exchange}
                    </span>
                  </td>

                  <td className="py-2.5 px-2 font-mono text-ink font-semibold">
                    {c.period}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-ink-3">
                    {c.deadlineDate}
                  </td>

                  <td className="py-2.5 px-3">
                    {c.status === "PUBLISHED" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="size-3" /> Đã nộp
                      </span>
                    ) : c.status === "PENDING" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                        <Clock className="size-3" /> Đang chờ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                        <AlertTriangle className="size-3" /> Quá hạn
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono font-medium text-ink">
                    {c.revenueVndBillions != null ? c.revenueVndBillions.toLocaleString("vi-VN") : "--"}
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                    {c.netProfitVndBillions != null ? c.netProfitVndBillions.toLocaleString("vi-VN") : "--"}
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    {c.growthPct != null ? (
                      <span className={c.growthPct >= 0 ? "text-up" : "text-down"}>
                        {c.growthPct >= 0 ? `+${c.growthPct}%` : `${c.growthPct}%`}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="space-y-0.5">
                      {getQualityBadge(c.qualityGrade)}
                      {c.qualityTitleVi && (
                        <div className="text-[10px] text-ink-3 line-clamp-1" title={c.qualityTitleVi}>
                          {c.qualityTitleVi}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <Link
                      href={`/stocks/${c.symbol}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                    >
                      Chi tiết <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
