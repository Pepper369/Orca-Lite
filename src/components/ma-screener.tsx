"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw, TrendingUp, Sparkles, AlertTriangle, Filter, Search, Zap, CheckCircle2 } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { Badge, Chg, fmtCompact, fmtNum, Loading, MetaLine, Panel } from "@/components/ui";
import type { MaScreenRow, MaRegime } from "@/lib/services/ma-screener";

type SignalFilter = "ALL" | "GOLDEN_CROSS" | "BULLISH_ALIGN" | "BULLISH" | "MA_SQUEEZE" | "DEATH_CROSS";

const SIGNAL_TABS: { id: SignalFilter; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "ALL", label: "Tất cả tín hiệu", icon: <Sparkles className="size-3.5 text-accent-primary" />, desc: "Toàn bộ cổ phiếu" },
  { id: "GOLDEN_CROSS", label: "Giao cắt Vàng 🌟", icon: <TrendingUp className="size-3.5 text-amber-400" />, desc: "MA20/50 cắt lên MA50/100/200" },
  { id: "BULLISH_ALIGN", label: "Trật tự xu hướng tăng 🚀", icon: <CheckCircle2 className="size-3.5 text-emerald-400" />, desc: "Giá > MA10 > MA20 > MA50 > MA200" },
  { id: "BULLISH", label: "Tất cả đà tăng 📈", icon: <TrendingUp className="size-3.5 text-blue-400" />, desc: "Mọi tín hiệu tăng giá MA" },
  { id: "MA_SQUEEZE", label: "Nén chặt chờ nổ 🎯", icon: <Zap className="size-3.5 text-purple-400" />, desc: "MA co thắt nén chuẩn bị bung" },
  { id: "DEATH_CROSS", label: "Giao cắt Tử thần ⚠️", icon: <AlertTriangle className="size-3.5 text-rose-400" />, desc: "MA ngắn cắt xuống MA dài" },
];

function RegimeBadge({ regime }: { regime: MaRegime }) {
  switch (regime) {
    case "GOLDEN_CROSS":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-400 whitespace-nowrap shadow-sm">
          <span>🌟</span> Golden Cross
        </span>
      );
    case "BULLISH_ALIGNMENT":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400 whitespace-nowrap shadow-sm">
          <span>🚀</span> Kênh tăng MA
        </span>
      );
    case "BULLISH_MOMENTUM":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-semibold text-blue-400 whitespace-nowrap">
          <span>📈</span> Đà tăng ngắn
        </span>
      );
    case "MA_SQUEEZE":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] font-semibold text-purple-400 whitespace-nowrap">
          <span>🎯</span> MA Nén chặt
        </span>
      );
    case "DEATH_CROSS":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-400 whitespace-nowrap">
          <span>⚠️</span> Death Cross
        </span>
      );
    case "BEARISH_ALIGNMENT":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-900/30 border border-rose-800/40 px-2 py-0.5 text-[11px] font-medium text-rose-400 whitespace-nowrap">
          <span>🔴</span> Kênh giảm điểm
        </span>
      );
    default:
      return <span className="text-[11px] text-text-muted">Đi ngang</span>;
  }
}

export function MaScreener({ defaultSector }: { defaultSector?: string | null }) {
  const [signal, setSignal] = useState<SignalFilter>("ALL");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("8");
  const [minVol, setMinVol] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (signal !== "ALL") p.set("signal", signal);
    if (sector) p.set("sector", sector);
    if (minPrice) p.set("minPrice", minPrice);
    if (minVol) p.set("minVol", String(Number(minVol) * 1_000_000));
    p.set("limit", "80");
    return p.toString();
  }, [signal, sector, minPrice, minVol]);

  const { data, meta, isLoading, isValidating, mutate } = useApi<{
    rows: MaScreenRow[];
    total: number;
  }>(`/api/v1/screener/ma-cross?${queryString}`, {
    refreshInterval: 30_000,
    timeoutMs: 12_000,
  });

  // Filter local search
  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toUpperCase();
    return rows.filter((r) => r.symbol.includes(q) || (r.name && r.name.toUpperCase().includes(q)));
  }, [data?.rows, search]);

  return (
    <div className="space-y-3">
      {/* 1. Header Information & Strategy Explanation */}
      <Panel pad={false}>
        <div className="p-4 border-b border-line bg-panel-2/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <TrendingUp className="size-4" />
                </span>
                <h2 className="text-base font-bold text-text-primary">
                  Bộ lọc Đường MA (Moving Average Strategy)
                </h2>
                <span className="rounded bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
                  Xác suất cao
                </span>
              </div>
              <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
                Chiến lược bám theo xu hướng: Khi MA nhỏ (MA10, MA20) cắt lên MA lớn (MA50, MA100, MA200) báo hiệu xác suất tăng giá rất cao.
                Ngược lại, khi MA nhỏ cắt xuống MA lớn cảnh báo rủi ro đảo chiều giảm.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void mutate()}
                disabled={isValidating}
                className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-primary hover:bg-panel-hover transition-all"
              >
                <RefreshCw className={`size-3 ${isValidating ? "animate-spin text-accent-primary" : ""}`} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Signal Strategy Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {SIGNAL_TABS.map((tab) => {
              const active = signal === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSignal(tab.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                    active
                      ? "border-accent-primary bg-accent-primary/15 text-text-primary font-semibold shadow-sm"
                      : "border-line bg-panel hover:bg-panel-hover text-text-muted hover:text-text-primary"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Filter Bar */}
        <div className="flex flex-wrap items-end gap-2.5 p-3 border-b border-line bg-panel">
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <Search className="size-2.5" /> Tìm mã
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="FPT, HPG, VCB…"
              className="input !w-36 !py-1 text-[12px]"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Ngành</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="input !w-40 !py-1 text-[12px]"
            >
              <option value="">Tất cả ngành</option>
              {VN_SECTOR_MAP.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Giá min (k)</span>
            <input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="8"
              className="input !w-20 !py-1 text-[12px]"
              inputMode="decimal"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Vol min (triệu cp)</span>
            <input
              value={minVol}
              onChange={(e) => setMinVol(e.target.value)}
              placeholder="0.1"
              className="input !w-24 !py-1 text-[12px]"
              inputMode="decimal"
            />
          </label>

          <div className="ml-auto text-right text-[11px] text-text-muted self-center">
            Tìm thấy: <span className="font-bold text-accent-primary">{filteredRows.length}</span> mã
          </div>
        </div>

        {/* 3. MA Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-text-muted bg-panel-2/40">
                <th className="px-3.5 py-2.5 font-medium">Mã CK</th>
                <th className="py-2.5 font-medium">Ngành</th>
                <th className="py-2.5 text-right font-medium">Giá</th>
                <th className="py-2.5 text-right font-medium">± %</th>
                <th className="py-2.5 text-right font-semibold text-text-primary">MA10</th>
                <th className="py-2.5 text-right font-semibold text-text-primary">MA20</th>
                <th className="py-2.5 text-right font-semibold text-blue-400">MA50</th>
                <th className="py-2.5 text-right font-semibold text-purple-400">MA100</th>
                <th className="py-2.5 text-right font-semibold text-amber-400">MA200</th>
                <th className="py-2.5 text-right font-medium">Giá vs MA200</th>
                <th className="py-2.5 text-right font-medium">Vol / TB20</th>
                <th className="py-2.5 text-center font-medium">Trạng thái kỹ thuật</th>
                <th className="py-2.5 pr-3.5 text-right font-medium">Điểm MA</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3.5 py-8 text-center text-text-muted">
                    <Loading rows={4} />
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3.5 py-8 text-center text-text-muted">
                    Không có mã nào thỏa mãn điều kiện lọc đường MA hiện tại. Hãy thử chọn &quot;Tất cả tín hiệu&quot; hoặc nới lỏng ngành.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.symbol} className="row-hover border-b border-line/40 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="font-bold text-accent-primary hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        {row.exchange && (
                          <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                            {row.exchange}
                          </span>
                        )}
                      </div>
                      <div className="max-w-[130px] truncate text-[10px] text-text-muted">
                        {row.name}
                      </div>
                    </td>

                    <td className="py-2.5 text-[11px] text-text-secondary">{row.sector}</td>

                    <td className="num py-2.5 text-right font-bold text-text-primary">
                      {row.price != null ? fmtNum(row.price, 2) : "—"}
                    </td>

                    <td className="py-2.5 text-right">
                      <Chg value={row.changePercent} arrow={false} />
                    </td>

                    <td className="num py-2.5 text-right text-text-primary font-medium">
                      {row.metrics.sma10 != null ? fmtNum(row.metrics.sma10, 2) : "—"}
                    </td>

                    <td className="num py-2.5 text-right text-text-primary font-medium">
                      {row.metrics.sma20 != null ? fmtNum(row.metrics.sma20, 2) : "—"}
                    </td>

                    <td className="num py-2.5 text-right text-blue-400 font-semibold">
                      {row.metrics.sma50 != null ? fmtNum(row.metrics.sma50, 2) : "—"}
                    </td>

                    <td className="num py-2.5 text-right text-purple-400 font-semibold">
                      {row.metrics.sma100 != null ? fmtNum(row.metrics.sma100, 2) : "—"}
                    </td>

                    <td className="num py-2.5 text-right text-amber-400 font-bold">
                      {row.metrics.sma200 != null ? fmtNum(row.metrics.sma200, 2) : "—"}
                    </td>

                    <td className="num py-2.5 text-right">
                      {row.metrics.distMa200Pct != null ? (
                        <span className={row.metrics.distMa200Pct >= 0 ? "text-emerald-400 font-medium" : "text-rose-400"}>
                          {row.metrics.distMa200Pct >= 0 ? "+" : ""}{row.metrics.distMa200Pct}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="num py-2.5 text-right">
                      {row.metrics.volRatio20 != null ? (
                        <span className={row.metrics.volRatio20 >= 1.3 ? "text-emerald-400 font-bold" : "text-text-muted"}>
                          {row.metrics.volRatio20}x
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-2.5 text-center">
                      <RegimeBadge regime={row.regime} />
                    </td>

                    <td className="num py-2.5 pr-3.5 text-right">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                          row.bullScore >= 75
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : row.bullScore >= 50
                            ? "bg-accent-primary/15 text-accent-primary"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {row.bullScore}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line px-3.5 py-2 bg-panel">
          <MetaLine meta={meta} />
        </div>
      </Panel>
    </div>
  );
}
