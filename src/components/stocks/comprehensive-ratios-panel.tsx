"use client";

import { memo } from "react";
import { BarChart2, TrendingUp, TrendingDown, Gauge, Shield, PieChart, Activity, Calendar } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { VndComprehensiveRatios } from "@/lib/providers/vndirect-company";
import { Loading, Panel, EmptyState } from "@/components/ui";

const fmtPrice = (p: number | null) => {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toLocaleString("vi-VN") + " ₫";
};

const fmtNum = (n: number | null, dec = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: dec });
};

const fmtVol = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M cp`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K cp`;
  return `${v.toLocaleString("vi-VN")} cp`;
};

const fmtVal = (val: number | null) => {
  if (val == null || !Number.isFinite(val)) return "—";
  if (val >= 1_000_000_000_000) return `${(val / 1_000_000_000_000).toFixed(2)} nghìn tỷ`;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
  return `${val.toLocaleString("vi-VN")} ₫`;
};

function PctTag({ val }: { val: number | null }) {
  if (val == null) return <span className="text-text-muted">—</span>;
  const isPos = val > 0;
  const isZero = val === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono font-semibold ${isPos ? "text-emerald-400" : isZero ? "text-text-muted" : "text-rose-400"}`}>
      {isPos ? "+" : ""}{val.toFixed(2)}%
    </span>
  );
}

export const ComprehensiveRatiosPanel = memo(function ComprehensiveRatiosPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<VndComprehensiveRatios>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/comprehensive-ratios` : null,
    { refreshInterval: 600_000 }
  );

  const title = (
    <span className="flex items-center gap-2">
      <Gauge className="size-4 text-accent-primary" /> Chỉ Số Tài Chính & Định Giá Lịch Sử 3 Năm ({symbol})
    </span>
  );

  if (isLoading && !data) {
    return (
      <Panel title={title}>
        <Loading rows={4} />
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa có dữ liệu chỉ số cho ${symbol}`}
          description="Chưa nạp được kho chỉ số tài chính tính sẵn từ Orca Financial Engine cho mã này."
        />
      </Panel>
    );
  }

  return (
    <Panel title={title}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: 52-Week Range */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
            <Activity className="size-4 text-accent-primary" />
            <span>Biên Độ 52 Tuần (1 Năm)</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>Đáy 52W: <strong className="text-text-primary font-mono">{fmtPrice(data.low52w)}</strong></span>
            <span>Đỉnh 52W: <strong className="text-text-primary font-mono">{fmtPrice(data.high52w)}</strong></span>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded bg-surface-base/80 p-2 text-[11px]">
            <div>
              <span className="text-text-muted block">Cách đỉnh 52W:</span>
              <PctTag val={data.pctFromHigh52w} />
            </div>
            <div>
              <span className="text-text-muted block">Cách đáy 52W:</span>
              <PctTag val={data.pctFromLow52w} />
            </div>
          </div>
        </div>

        {/* Card 2: Historical Multiples vs Current */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
            <BarChart2 className="size-4 text-blue-400" />
            <span>Định Giá So Sánh Lịch Sử</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block">P/E Hiện Tại / TB 3 Năm:</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-mono font-bold text-text-primary text-[13px]">{fmtNum(data.pe)}x</span>
                <span className="text-text-muted text-[10px]">/ {fmtNum(data.peAvg3y)}x</span>
              </div>
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block">P/B Hiện Tại / TB 3 Năm:</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-mono font-bold text-text-primary text-[13px]">{fmtNum(data.pb)}x</span>
                <span className="text-text-muted text-[10px]">/ {fmtNum(data.pbAvg3y)}x</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle/50 text-text-muted">
            <span>Tỷ suất cổ tức 1M: <strong className="text-emerald-400 font-mono font-semibold">{data.divYield1m != null ? `${data.divYield1m}%` : "—"}</strong></span>
            <span>Beta: <strong className="text-text-primary font-mono">{fmtNum(data.beta)}</strong></span>
          </div>
        </div>

        {/* Card 3: Free-float & Ownership */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
            <PieChart className="size-4 text-purple-400" />
            <span>Tỷ Lệ Trôi Nổi & Nội Bộ</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">Free-float</span>
              <span className="font-mono font-bold text-accent-primary text-[13px]">
                {data.freeFloatPct != null ? `${data.freeFloatPct}%` : "—"}
              </span>
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">Nội bộ</span>
              <span className="font-mono font-bold text-text-primary text-[13px]">
                {data.internalOwnershipPct != null ? `${data.internalOwnershipPct}%` : "—"}
              </span>
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">Nhà nước</span>
              <span className="font-mono font-bold text-text-primary text-[13px]">
                {data.stateOwnershipPct != null ? `${data.stateOwnershipPct}%` : "0%"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle/50 text-text-muted">
            <span>SL Lưu hành: <strong className="text-text-primary font-mono">{fmtVol(data.outstandingShares)}</strong></span>
          </div>
        </div>

        {/* Card 4: Multi-Timeframe Price Performance */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2.5 md:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
            <TrendingUp className="size-4 text-emerald-400" />
            <span>Hiệu Suất Tăng Trưởng Giá Đa Khung Thời Gian</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px]">
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">1 Tháng</span>
              <PctTag val={data.priceChg1m} />
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">3 Tháng</span>
              <PctTag val={data.priceChg3m} />
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">6 Tháng</span>
              <PctTag val={data.priceChg6m} />
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">1 Năm</span>
              <PctTag val={data.priceChg1y} />
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">3 Năm</span>
              <PctTag val={data.priceChg3y} />
            </div>
            <div className="rounded bg-surface-base/80 p-2">
              <span className="text-text-muted block text-[10px]">5 Năm</span>
              <PctTag val={data.priceChg5y} />
            </div>
          </div>
        </div>

        {/* Card 5: Liquidity Average */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
            <Shield className="size-4 text-amber-400" />
            <span>Thanh Khoản Bình Quân 20 Phiên</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between rounded bg-surface-base/80 p-2">
              <span className="text-text-muted">KL Khớp TB 20D:</span>
              <strong className="text-text-primary font-mono">{fmtVol(data.avgVol20d)}</strong>
            </div>
            <div className="flex items-center justify-between rounded bg-surface-base/80 p-2">
              <span className="text-text-muted">GTGD Khớp TB 20D:</span>
              <strong className="text-text-primary font-mono">{fmtVal(data.avgVal20d)}</strong>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
});
