"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/hooks";
import { Loading, fmtNum, fmtCompact, Chg } from "@/components/ui";
import {
  Landmark,
  ShieldCheck,
  TrendingUp,
  Percent,
  Layers,
  Coins,
  FileSpreadsheet,
  AlertTriangle,
  Sparkles,
  PieChart,
  ArrowUpRight,
} from "lucide-react";
import type {
  MiQuantBankRatiosItem,
  MiQuantAssetComposition,
} from "@/lib/providers/miquant";

export function DeepFinancialsPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<{
    data: {
      symbol: string;
      isBank: boolean;
      latest?: MiQuantBankRatiosItem;
      history?: MiQuantBankRatiosItem[];
      benchmarks?: {
        nim_rating: string;
        casa_rating: string;
        npl_safety: string;
        llr_cushion: string;
      };
      assetComposition?: MiQuantAssetComposition;
      breakdown?: {
        cash_pct: number;
        receivables_pct: number;
        inventory_pct: number;
        fixed_assets_pct: number;
        remaining_pct: number;
      };
    };
  }>(`/api/v1/stocks/${symbol}/deep-financials`, {
    refreshInterval: 120000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface p-5">
        <Loading rows={4} label="Đang tải dữ liệu phân tích chuyên sâu BCTC..." />
      </div>
    );
  }

  const res = data?.data;

  // BANK STOCKS DASHBOARD
  if (res?.isBank) {
    const l = res.latest;
    const hist = res.history || [];
    const b = res.benchmarks;

    return (
      <div className="rounded-2xl border border-border/80 bg-bg-surface p-5 shadow-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Landmark className="size-3.5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Chỉ Số Vàng Chuyên Biệt Ngân Hàng (Bank Ratios)
              </span>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                Q{l?.quarter}/{l?.year}
              </span>
            </div>
            <h3 className="text-base font-bold text-text-primary">
              NIM · CASA · NPL (Nợ xấu) · LLR (Bao phủ) · LDR
            </h3>
          </div>
          <span className="text-xs text-text-muted">
            Mô hình định lượng OQuant Banking Benchmark
          </span>
        </div>

        {/* 4 Core Bank KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: NIM */}
          <div className="rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1 font-bold text-text-primary">
                <Percent className="size-3.5 text-blue-400" /> NIM (Biên Lãi Thuần)
              </span>
              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                {b?.nim_rating}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-400">
              {((l?.nim || 0) * 100).toFixed(2)}%
            </div>
            <p className="text-[11px] text-text-muted">
              Tỷ suất sinh lời chênh lệch giữa lãi suất cho vay và chi phí huy động vốn.
            </p>
          </div>

          {/* Card 2: CASA */}
          <div className="rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1 font-bold text-text-primary">
                <Coins className="size-3.5 text-emerald-400" /> Tỷ Lệ CASA
              </span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                {b?.casa_rating}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {((l?.casa || 0) * 100).toFixed(2)}%
            </div>
            <p className="text-[11px] text-text-muted">
              Tiền gửi không kỳ hạn giá rẻ (lãi suất &lt;0.5%), tạo lợi thế chi phí vốn cực lớn.
            </p>
          </div>

          {/* Card 3: NPL (Nợ Xấu) */}
          <div className="rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1 font-bold text-text-primary">
                <AlertTriangle className="size-3.5 text-amber-400" /> Tỷ Lệ Nợ Xấu (NPL)
              </span>
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                {b?.npl_safety}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {((l?.npl || 0) * 100).toFixed(2)}%
            </div>
            <p className="text-[11px] text-text-muted">
              Nợ nhóm 3-5 trên tổng dư nợ. Duy trì dưới 1.5% là ngân hàng kiểm soát rủi ro hàng đầu.
            </p>
          </div>

          {/* Card 4: LLR (Bao Phủ Nợ Xấu) */}
          <div className="rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1 font-bold text-text-primary">
                <ShieldCheck className="size-3.5 text-purple-400" /> Bao Phủ Nợ Xấu (LLR)
              </span>
              <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-400">
                {b?.llr_cushion}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-purple-400">
              {((l?.llr || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-[11px] text-text-muted">
              Bộ đệm trích lập dự phòng. LLR &gt; 100% đảm bảo ngân hàng có thể xóa toàn bộ nợ xấu.
            </p>
          </div>
        </div>

        {/* Growth & Liquidity Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/50 bg-bg-base/40 p-3 text-xs">
          <div>
            <span className="text-[10px] text-text-muted block">Tỷ lệ LDR (Cho vay/Huy động)</span>
            <span className="font-mono font-bold text-text-primary">
              {((l?.ldr || 0) * 100).toFixed(1)}%
            </span>
            <span className="ml-1 text-[10px] text-emerald-400">(Trần NHNN 85%)</span>
          </div>

          <div>
            <span className="text-[10px] text-text-muted block">Tăng trưởng tín dụng YoY</span>
            <span className="font-mono font-bold text-emerald-400">
              +{((l?.loans_to_customers_gross_growth_yoy || 0) * 100).toFixed(1)}%
            </span>
          </div>

          <div>
            <span className="text-[10px] text-text-muted block">Tăng trưởng tiền gửi YoY</span>
            <span className="font-mono font-bold text-blue-400">
              +{((l?.customer_deposits_growth_yoy || 0) * 100).toFixed(1)}%
            </span>
          </div>

          <div>
            <span className="text-[10px] text-text-muted block">Hiệu quả sinh lời (ROE / ROA)</span>
            <span className="font-mono font-bold text-text-primary">
              {((l?.roe || 0) * 100).toFixed(1)}% / {((l?.roa || 0) * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Historical 8 Quarters Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
            <span>Lịch Sử Biến Động Các Chỉ Số Ngân Hàng ({hist.length} Quý Gần Nhất)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase text-text-muted">
                  <th className="py-2">Kỳ BCTC</th>
                  <th className="py-2 text-right">NIM</th>
                  <th className="py-2 text-right">CASA</th>
                  <th className="py-2 text-right">NPL (Nợ xấu)</th>
                  <th className="py-2 text-right">LLR (Bao phủ)</th>
                  <th className="py-2 text-right">LDR</th>
                  <th className="py-2 text-right">Tăng trưởng vay</th>
                  <th className="py-2 text-right">Tăng trưởng gửi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {[...hist].reverse().map((h) => (
                  <tr key={`${h.year}-Q${h.quarter}`} className="hover:bg-bg-base/40">
                    <td className="py-2 font-bold text-text-primary">
                      Q{h.quarter}/{h.year}
                    </td>
                    <td className="py-2 text-right text-blue-400">
                      {(h.nim * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 text-right text-emerald-400">
                      {(h.casa * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 text-right text-amber-400">
                      {(h.npl * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 text-right text-purple-400">
                      {(h.llr * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-right text-text-secondary">
                      {(h.ldr * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-right text-emerald-400">
                      +{(h.loans_to_customers_gross_growth_yoy * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-right text-blue-400">
                      +{(h.customer_deposits_growth_yoy * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // CORPORATE / MANUFACTURING / REAL ESTATE ASSET COMPOSITION DASHBOARD
  const ac = res?.assetComposition;
  const b = res?.breakdown;

  return (
    <div className="rounded-2xl border border-border/80 bg-bg-surface p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
              <PieChart className="size-3.5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Phân Rã Cơ Cấu Tài Sản (Asset Composition)
            </span>
            {ac && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                Q{ac.quarter}/{ac.year}
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-text-primary">
            Cấu Trúc Tài Sản: Tiền Mặt · Phải Thu · Tồn Kho · Tài Sản Cố Định
          </h3>
        </div>
        <div className="text-xs font-mono font-bold text-text-primary">
          Tổng tài sản: <span className="text-blue-400">{fmtNum(Math.round((ac?.totalAssets || 0) / 1e9))} Tỷ VND</span>
        </div>
      </div>

      {/* Visual Multi-Segment Stacked Bar */}
      {b && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Tỷ trọng danh mục tài sản (% Tổng tài sản):</span>
            <span className="text-[10px]">100% Bảng cân đối</span>
          </div>

          <div className="flex h-5 w-full overflow-hidden rounded-xl border border-border/60 bg-bg-base text-[10px] font-bold text-white text-center">
            {b.cash_pct > 0 && (
              <div
                style={{ width: `${b.cash_pct}%` }}
                className="bg-emerald-500 flex items-center justify-center hover:opacity-90 transition"
                title={`Tiền mặt: ${b.cash_pct}%`}
              >
                {b.cash_pct > 5 ? `${b.cash_pct}%` : ""}
              </div>
            )}
            {b.inventory_pct > 0 && (
              <div
                style={{ width: `${b.inventory_pct}%` }}
                className="bg-amber-500 flex items-center justify-center hover:opacity-90 transition"
                title={`Hàng tồn kho: ${b.inventory_pct}%`}
              >
                {b.inventory_pct > 5 ? `${b.inventory_pct}%` : ""}
              </div>
            )}
            {b.receivables_pct > 0 && (
              <div
                style={{ width: `${b.receivables_pct}%` }}
                className="bg-rose-500 flex items-center justify-center hover:opacity-90 transition"
                title={`Phải thu: ${b.receivables_pct}%`}
              >
                {b.receivables_pct > 5 ? `${b.receivables_pct}%` : ""}
              </div>
            )}
            {b.fixed_assets_pct > 0 && (
              <div
                style={{ width: `${b.fixed_assets_pct}%` }}
                className="bg-blue-600 flex items-center justify-center hover:opacity-90 transition"
                title={`Tài sản cố định: ${b.fixed_assets_pct}%`}
              >
                {b.fixed_assets_pct > 5 ? `${b.fixed_assets_pct}%` : ""}
              </div>
            )}
            {b.remaining_pct > 0 && (
              <div
                style={{ width: `${b.remaining_pct}%` }}
                className="bg-purple-600 flex items-center justify-center hover:opacity-90 transition"
                title={`Tài sản khác: ${b.remaining_pct}%`}
              >
                {b.remaining_pct > 5 ? `${b.remaining_pct}%` : ""}
              </div>
            )}
          </div>

          {/* Legends */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500" />
              <span>Tiền & tương đương: <strong>{b.cash_pct}%</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-500" />
              <span>Hàng tồn kho: <strong>{b.inventory_pct}%</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-500" />
              <span>Khoản phải thu: <strong>{b.receivables_pct}%</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-blue-600" />
              <span>Tài sản cố định: <strong>{b.fixed_assets_pct}%</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-purple-600" />
              <span>Tài sản dở dang/khác: <strong>{b.remaining_pct}%</strong></span>
            </span>
          </div>
        </div>
      )}

      {/* Breakdown Value Cards */}
      {ac && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3">
            <span className="text-[10px] text-emerald-400 block font-medium">Tiền Mặt</span>
            <div className="text-base font-bold font-mono text-emerald-400">
              {fmtNum(Math.round(ac.cash / 1e9))} Tỷ
            </div>
            <span className="text-[10px] text-text-muted">Thanh khoản tức thì</span>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3">
            <span className="text-[10px] text-amber-400 block font-medium">Hàng Tồn Kho</span>
            <div className="text-base font-bold font-mono text-amber-400">
              {fmtNum(Math.round(ac.inventory / 1e9))} Tỷ
            </div>
            <span className="text-[10px] text-text-muted">Nguyên liệu & thành phẩm</span>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-3">
            <span className="text-[10px] text-rose-400 block font-medium">Khoản Phải Thu</span>
            <div className="text-base font-bold font-mono text-rose-400">
              {fmtNum(Math.round(ac.receivables / 1e9))} Tỷ
            </div>
            <span className="text-[10px] text-text-muted">Bị chiếm dụng vốn</span>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 p-3">
            <span className="text-[10px] text-blue-400 block font-medium">Tài Sản Cố Định</span>
            <div className="text-base font-bold font-mono text-blue-400">
              {fmtNum(Math.round(ac.fixedAssets / 1e9))} Tỷ
            </div>
            <span className="text-[10px] text-text-muted">Nhà xưởng & máy móc</span>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-950/10 p-3">
            <span className="text-[10px] text-purple-400 block font-medium">Dở Dang & Khác</span>
            <div className="text-base font-bold font-mono text-purple-400">
              {fmtNum(Math.round(ac.remaining / 1e9))} Tỷ
            </div>
            <span className="text-[10px] text-text-muted">Dự án đầu tư mở rộng</span>
          </div>
        </div>
      )}

      {/* Health Assessment Note */}
      {b && (
        <div className="rounded-xl bg-bg-base/70 border border-border/40 p-3 text-xs leading-relaxed text-text-secondary space-y-1">
          <div className="font-bold text-text-primary flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-blue-400" />
            Nhận định cấu trúc tài sản AI:
          </div>
          <p>
            {b.cash_pct > 15
              ? `Tỷ lệ tiền mặt và tương đương tiền dồi dào (${b.cash_pct}%), doanh nghiệp có khả năng tự chủ tài chính tốt và sẵn sàng chớp cơ hội mở rộng.`
              : b.receivables_pct > 35
              ? `Cảnh báo: Khoản phải thu chiếm tỷ trọng cao (${b.receivables_pct}%), cho thấy doanh nghiệp đang bị khách hàng hoặc đối tác chiếm dụng vốn lớn.`
              : b.inventory_pct > 30
              ? `Hàng tồn kho chiếm tỷ trọng lớn (${b.inventory_pct}%), cần theo dõi biến động giá nguyên vật liệu và chu kỳ vòng quay tồn kho.`
              : `Cơ cấu tài sản cân bằng, tỷ trọng tài sản cố định (${b.fixed_assets_pct}%) và tài sản dở dang phản ánh năng lực sản xuất kinh doanh ổn định.`}
          </p>
        </div>
      )}
    </div>
  );
}
