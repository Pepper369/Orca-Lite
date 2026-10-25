"use client";

import { memo, useMemo, useState } from "react";
import { Users, Building2, User, Globe2, ShieldCheck, Search, Filter } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { StockShareholdersResult } from "@/lib/services/stock-shareholders";
import type { VietcapShareholder } from "@/lib/providers/vietcap";
import { Loading, Panel, EmptyState } from "@/components/ui";

const fmtQty = (q: number) => {
  if (q >= 1_000_000_000) return `${(q / 1_000_000_000).toFixed(2)}B cp`;
  if (q >= 1_000_000) return `${(q / 1_000_000).toFixed(2)}M cp`;
  if (q >= 1_000) return `${(q / 1_000).toFixed(1)}K cp`;
  return `${q.toLocaleString("vi-VN")} cp`;
};

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

export const ShareholdersPanel = memo(function ShareholdersPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<StockShareholdersResult>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/shareholders` : null,
    { refreshInterval: 600_000 }
  );

  const [filterType, setFilterType] = useState<"all" | "major" | "corporate" | "individual" | "foreign">("all");
  const [search, setSearch] = useState("");

  const title = (
    <span className="flex items-center gap-2">
      <Users className="size-4 text-accent-primary" /> Cơ Cấu Cổ Đông & Ban Lãnh Đạo ({symbol})
    </span>
  );

  const filteredHolders = useMemo(() => {
    if (!data?.shareholders) return [];
    return data.shareholders.filter((h) => {
      // Type filter
      if (filterType === "major" && h.percentage < 5) return false;
      if (filterType === "corporate" && !h.ownerType.toUpperCase().includes("CORPORATE") && !h.ownerType.toUpperCase().includes("TỔ CHỨC")) return false;
      if (filterType === "individual" && !h.ownerType.toUpperCase().includes("INDIVIDUAL") && !h.ownerType.toUpperCase().includes("CÁ NHÂN")) return false;
      if (filterType === "foreign" && !h.ownerType.toUpperCase().includes("FOREIGN") && !h.ownerType.toUpperCase().includes("NƯỚC NGOÀI")) return false;

      // Text search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nameMatch = h.ownerName.toLowerCase().includes(q) || (h.ownerNameEn?.toLowerCase().includes(q) ?? false);
        const codeMatch = h.ownerCode?.toLowerCase().includes(q) ?? false;
        const posMatch = h.positionName?.toLowerCase().includes(q) ?? false;
        if (!nameMatch && !codeMatch && !posMatch) return false;
      }
      return true;
    });
  }, [data?.shareholders, filterType, search]);

  if (isLoading && !data) {
    return (
      <Panel title={title}>
        <Loading rows={4} />
      </Panel>
    );
  }

  const holders = data?.shareholders ?? [];
  if (!holders.length) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa có dữ liệu sổ cổ đông cho ${symbol}`}
          description="Chưa có dữ liệu danh bạ sở hữu từ Vietcap IQ Insight cho mã này."
        />
      </Panel>
    );
  }

  const s = data.structure;

  return (
    <Panel title={title}>
      {/* 4-Segment Ownership Distribution Bar */}
      <div className="mb-5 space-y-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5">
        <div className="flex items-center justify-between text-[12px] font-medium text-text-secondary">
          <span>Cơ cấu phân bổ sở hữu vốn điều lệ:</span>
          <span>{data.totalHolders} cổ đông ghi nhận · {data.majorHoldersCount} cổ đông lớn (≥5%)</span>
        </div>

        {/* Stacked Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-base">
          {s.corporatePct > 0 && (
            <div
              style={{ width: `${s.corporatePct}%` }}
              className="bg-blue-500 transition-all"
              title={`Tổ chức trong nước: ${s.corporatePct}%`}
            />
          )}
          {s.foreignPct > 0 && (
            <div
              style={{ width: `${s.foreignPct}%` }}
              className="bg-purple-500 transition-all"
              title={`Khối ngoại: ${s.foreignPct}%`}
            />
          )}
          {s.individualPct > 0 && (
            <div
              style={{ width: `${s.individualPct}%` }}
              className="bg-emerald-500 transition-all"
              title={`Cá nhân: ${s.individualPct}%`}
            />
          )}
          {s.otherPct > 0 && (
            <div
              style={{ width: `${s.otherPct}%` }}
              className="bg-surface-elevated transition-all"
              title={`Trôi nổi / Cổ đông khác: ${s.otherPct}%`}
            />
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] sm:grid-cols-4">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" />
            <span className="text-text-muted">Tổ chức:</span>
            <span className="font-semibold text-text-primary">{s.corporatePct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-purple-500" />
            <span className="text-text-muted">Khối ngoại:</span>
            <span className="font-semibold text-text-primary">{s.foreignPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            <span className="text-text-muted">Cá nhân:</span>
            <span className="font-semibold text-text-primary">{s.individualPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-zinc-500" />
            <span className="text-text-muted">Cổ đông khác:</span>
            <span className="font-semibold text-text-primary">{s.otherPct}%</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterType("all")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filterType === "all" ? "bg-accent-primary text-black font-semibold" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            Tất cả ({holders.length})
          </button>
          <button
            onClick={() => setFilterType("major")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filterType === "major" ? "bg-accent-primary text-black font-semibold" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            Cổ đông lớn ≥5% ({holders.filter((h) => h.percentage >= 5).length})
          </button>
          <button
            onClick={() => setFilterType("corporate")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filterType === "corporate" ? "bg-accent-primary text-black font-semibold" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            Tổ chức
          </button>
          <button
            onClick={() => setFilterType("individual")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filterType === "individual" ? "bg-accent-primary text-black font-semibold" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            Cá nhân / Lãnh đạo
          </button>
          <button
            onClick={() => setFilterType("foreign")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filterType === "foreign" ? "bg-accent-primary text-black font-semibold" : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            Nước ngoài
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[180px] max-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc mã..."
            className="w-full rounded-md border border-border-subtle bg-surface-base py-1 pl-8 pr-2.5 text-[11px] text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Shareholders Table */}
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-border-subtle bg-surface-elevated/70 text-[11px] font-semibold text-text-muted">
            <tr>
              <th className="py-2.5 pl-3 pr-2">Cổ đông / Tổ chức</th>
              <th className="py-2.5 px-2 text-right">Khối lượng (CP)</th>
              <th className="py-2.5 px-3 text-right">Tỷ lệ sở hữu</th>
              <th className="py-2.5 pl-2 pr-3 text-right">Cập nhật</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredHolders.map((h, i) => {
              const isMajor = h.percentage >= 5;
              const isCorporate = h.ownerType.toUpperCase().includes("CORPORATE");
              const isForeign = h.ownerType.toUpperCase().includes("FOREIGN");

              return (
                <tr
                  key={`${h.ownerName}-${i}`}
                  className="transition-colors hover:bg-surface-elevated/50"
                >
                  <td className="py-2.5 pl-3 pr-2">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0 text-text-muted">
                        {isCorporate ? (
                          <Building2 className="size-3.5 text-blue-400" />
                        ) : isForeign ? (
                          <Globe2 className="size-3.5 text-purple-400" />
                        ) : (
                          <User className="size-3.5 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-text-primary">
                            {h.ownerName}
                          </span>
                          {h.ownerCode && (
                            <span className="rounded bg-accent-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-accent-primary">
                              {h.ownerCode}
                            </span>
                          )}
                          {isMajor && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-amber-400">
                              Cổ đông lớn
                            </span>
                          )}
                        </div>
                        {(h.positionName || h.ownerNameEn) && (
                          <p className="text-[11px] text-text-muted truncate">
                            {h.positionName ? `${h.positionName} · ` : ""}
                            {h.ownerNameEn ?? ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-text-secondary whitespace-nowrap">
                    {fmtQty(h.quantity)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`font-mono font-semibold ${isMajor ? "text-emerald-400" : "text-text-primary"}`}>
                        {h.percentage.toFixed(2)}%
                      </span>
                      <div className="h-1.5 w-12 rounded-full bg-surface-base overflow-hidden shrink-0 hidden sm:block">
                        <div
                          style={{ width: `${Math.min(100, (h.percentage / 20) * 100)}%` }}
                          className={`h-full ${isMajor ? "bg-emerald-400" : "bg-accent-primary/70"}`}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pl-2 pr-3 text-right text-[11px] text-text-muted whitespace-nowrap font-mono">
                    {fmtDate(h.publicDate || h.updateDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
});
