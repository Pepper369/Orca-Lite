"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw, TrendingUp, Sparkles, AlertTriangle, Filter, Search, Zap, CheckCircle2 } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { Badge, Chg, fmtCompact, fmtNum, Loading, MetaLine, Panel } from "@/components/ui";
import type {
  MaScreenRow,
  MaRegime,
  MaClassification,
  MaSignalCategory,
  MaTimeHorizon,
  MaActionGrade,
} from "@/lib/services/ma-screener";

type SignalFilter =
  | "ALL"
  | "GOLDEN_CROSS"
  | "PULLBACK_RETEST"
  | "BREAKOUT_RECLAIM"
  | "BULLISH_ALIGN"
  | "MA_SQUEEZE"
  | "SLOPE_BULLISH"
  | "OVEREXTENDED"
  | "DEATH_CROSS";

const SIGNAL_TABS: { id: SignalFilter; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "ALL", label: "Tất cả tín hiệu", icon: <Sparkles className="size-3.5 text-accent-primary" />, desc: "Toàn bộ cổ phiếu" },
  { id: "GOLDEN_CROSS", label: "Giao cắt Vàng (Golden Cross)", icon: <TrendingUp className="size-3.5 text-amber-400" />, desc: "Tối ưu tín hiệu mới nhất hôm nay, T-1..T-3 và giao cắt kinh điển" },
  { id: "PULLBACK_RETEST", label: "Kiểm định Hỗ trợ (Retest)", icon: <CheckCircle2 className="size-3.5 text-emerald-400" />, desc: "Kiểm định MA20/50/200 rút chân (Điểm mua chuẩn R:R)" },
  { id: "BREAKOUT_RECLAIM", label: "Vượt cản MA (Reclaim)", icon: <Zap className="size-3.5 text-cyan-400" />, desc: "Bứt phá lấy lại MA20, MA50 hoặc MA200 dài hạn" },
  { id: "BULLISH_ALIGN", label: "Trật tự MA Ribbon", icon: <CheckCircle2 className="size-3.5 text-emerald-400" />, desc: "Giá > MA10 > MA20 > MA50 > MA200 (Kênh tăng mạnh nhất)" },
  { id: "MA_SQUEEZE", label: "Nén chặt chờ nổ", icon: <Zap className="size-3.5 text-purple-400" />, desc: "MA co thắt nén biên độ chuẩn bị bung nổ biến động" },
  { id: "SLOPE_BULLISH", label: "Gia tốc dốc mạnh", icon: <TrendingUp className="size-3.5 text-blue-400" />, desc: "MA20 & MA50 dốc tăng thuận xu hướng gia tốc" },
  { id: "OVEREXTENDED", label: "Kéo căng quá mua", icon: <AlertTriangle className="size-3.5 text-amber-400" />, desc: "Giá vượt MA20 > 8.5% (Cảnh báo rủi ro rung lắc)" },
  { id: "DEATH_CROSS", label: "Giao cắt Tử thần", icon: <AlertTriangle className="size-3.5 text-rose-400" />, desc: "MA ngắn cắt xuống MA dài (Cảnh báo bán phòng vệ)" },
];

function ActionGradeBadge({ classification }: { classification?: MaClassification }) {
  if (!classification) return null;
  const { action, actionLabel, actionBadgeColor } = classification;
  const colorMap = {
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    blue: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    purple: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    rose: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-sm ${
        colorMap[actionBadgeColor] ?? colorMap.blue
      }`}
    >
      {action === "STRONG_BUY" && <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {actionLabel}
    </span>
  );
}

function RegimeBadge({ row }: { row: MaScreenRow }) {
  const { regime, criteria, metrics } = row;

  if (regime === "FRESH_CROSS" || (criteria.isFreshCross && regime === "GOLDEN_CROSS")) {
    if (metrics.crossBarsAgo === 0 || criteria.isTodayCross) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 border border-emerald-500/50 px-2 py-0.5 text-[11px] font-bold text-emerald-300 whitespace-nowrap shadow-sm">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Golden Cross Hôm Nay
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 text-[11px] font-bold text-cyan-300 whitespace-nowrap shadow-sm">
        Golden Cross T-{metrics.crossBarsAgo ?? 1}
      </span>
    );
  }

  switch (regime) {
    case "PULLBACK_RETEST":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-bold text-emerald-300 whitespace-nowrap shadow-sm">
          Test MA Hỗ trợ
        </span>
      );
    case "BREAKOUT_RECLAIM":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-400 whitespace-nowrap shadow-sm">
          Vượt cản MA
        </span>
      );
    case "GOLDEN_CROSS":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-400 whitespace-nowrap shadow-sm">
          Golden Cross
        </span>
      );
    case "BULLISH_ALIGNMENT":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400 whitespace-nowrap shadow-sm">
          Kênh tăng MA
        </span>
      );
    case "BULLISH_MOMENTUM":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-semibold text-blue-400 whitespace-nowrap">
          Đà tăng ngắn
        </span>
      );
    case "OVEREXTENDED":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-900/30 border border-amber-600/40 px-2 py-0.5 text-[11px] font-semibold text-amber-300 whitespace-nowrap">
          Kéo căng MA20
        </span>
      );
    case "MA_SQUEEZE":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] font-semibold text-purple-400 whitespace-nowrap">
          MA Nén chặt
        </span>
      );
    case "DEATH_CROSS":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-400 whitespace-nowrap">
          Death Cross
        </span>
      );
    case "BEARISH_ALIGNMENT":
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-900/30 border border-rose-800/40 px-2 py-0.5 text-[11px] font-medium text-rose-400 whitespace-nowrap">
          Kênh giảm điểm
        </span>
      );
    default:
      return <span className="text-[11px] text-text-muted">Đi ngang</span>;
  }
}

export function MaScreener({ defaultSector }: { defaultSector?: string | null }) {
  const [signal, setSignal] = useState<SignalFilter>("ALL");
  const [horizon, setHorizon] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("8");
  const [minVol, setMinVol] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (signal !== "ALL") p.set("signal", signal);
    if (horizon !== "ALL") p.set("horizon", horizon);
    if (actionFilter !== "ALL") p.set("action", actionFilter);
    if (sector) p.set("sector", sector);
    if (minPrice) p.set("minPrice", minPrice);
    if (minVol) p.set("minVol", String(Number(minVol) * 1_000_000));
    p.set("limit", "80");
    return p.toString();
  }, [signal, horizon, actionFilter, sector, minPrice, minVol]);

  const { data, meta, isLoading, isValidating, mutate } = useApi<{
    rows: MaScreenRow[];
    total: number;
  }>(`/api/v1/screener/ma-cross?${queryString}`, {
    refreshInterval: 30_000,
    timeoutMs: 12_000,
  });

  // Filter local search and extra controls
  const filteredRows = useMemo(() => {
    let rows = data?.rows ?? [];
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      rows = rows.filter((r) => r.symbol.includes(q) || (r.name && r.name.toUpperCase().includes(q)));
    }
    return rows;
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
              className="input !w-32 !py-1 text-[12px]"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Ngành</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="input !w-36 !py-1 text-[12px]"
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
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Khung thời gian</span>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className="input !w-36 !py-1 text-[12px]"
            >
              <option value="ALL">Tất cả khung TG</option>
              <option value="LONG_TERM">Dài hạn (MA200)</option>
              <option value="MEDIUM_TERM">Trung hạn (MA50)</option>
              <option value="SHORT_TERM">Ngắn hạn (MA20)</option>
              <option value="MULTI_HORIZON">Đa khung (Ribbon)</option>
            </select>
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Khuyến nghị</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input !w-36 !py-1 text-[12px]"
            >
              <option value="ALL">Tất cả hành động</option>
              <option value="STRONG_BUY">Điểm mua Kim cương</option>
              <option value="BUY_ENTRY">Điểm mua Chuẩn</option>
              <option value="HOLD">Nắm giữ theo Sóng</option>
              <option value="WATCH">Chờ bùng nổ (Watch)</option>
              <option value="TAKE_PROFIT">Cảnh báo chốt lời</option>
              <option value="SELL_WARNING">Bán phòng vệ</option>
            </select>
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Giá min (k)</span>
            <input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="8"
              className="input !w-16 !py-1 text-[12px]"
              inputMode="decimal"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Vol min (tr cp)</span>
            <input
              value={minVol}
              onChange={(e) => setMinVol(e.target.value)}
              placeholder="0.1"
              className="input !w-20 !py-1 text-[12px]"
              inputMode="decimal"
            />
          </label>

          <div className="ml-auto text-right text-[11px] text-text-muted self-center">
            Tìm thấy: <span className="font-bold text-accent-primary">{filteredRows.length}</span> mã
          </div>
        </div>

        {/* 3. MA Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-text-muted bg-panel-2/40">
                <th className="px-3.5 py-2.5 font-medium">Mã CK</th>
                <th className="py-2.5 font-medium">Ngành</th>
                <th className="py-2.5 text-right font-medium">Giá</th>
                <th className="py-2.5 text-right font-medium">± %</th>
                <th className="py-2.5 text-center font-medium">Khuyến nghị & Tín hiệu</th>
                <th className="py-2.5 text-center font-medium">Khung TG</th>
                <th className="py-2.5 text-right font-semibold text-text-primary">MA10</th>
                <th className="py-2.5 text-right font-semibold text-text-primary">MA20</th>
                <th className="py-2.5 text-right font-semibold text-blue-400">MA50</th>
                <th className="py-2.5 text-right font-semibold text-purple-400">MA100</th>
                <th className="py-2.5 text-right font-semibold text-amber-400">MA200</th>
                <th className="py-2.5 text-right font-medium">Giá vs MA200</th>
                <th className="py-2.5 text-right font-medium">Vol / TB20</th>
                <th className="py-2.5 pr-3.5 text-right font-medium">Điểm MA</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3.5 py-8 text-center text-text-muted">
                    <Loading rows={4} />
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3.5 py-8 text-center text-text-muted">
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
                        {row.criteria.isTodayCross && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 text-[9px] font-bold">
                            <span className="size-1 rounded-full bg-emerald-400 animate-ping" />
                            MỚI
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

                    <td className="py-2.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ActionGradeBadge classification={row.classification} />
                        <div className="flex items-center gap-1 text-[10px]">
                          <RegimeBadge row={row} />
                          {row.metrics.crossType && (
                            <span className="font-semibold text-accent-primary">
                              {row.metrics.crossType}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 text-center">
                      <span className="rounded bg-panel-2 border border-line/70 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary whitespace-nowrap">
                        {row.classification?.horizonLabel ?? "Đa khung"}
                      </span>
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
                        <div>
                          <span className={row.metrics.distMa200Pct >= 0 ? "text-emerald-400 font-medium" : "text-rose-400"}>
                            {row.metrics.distMa200Pct >= 0 ? "+" : ""}{row.metrics.distMa200Pct}%
                          </span>
                          {row.metrics.distMa20Pct != null ? (
                            <div className="text-[10px] text-text-muted">
                              MA20: {row.metrics.distMa20Pct >= 0 ? "+" : ""}{row.metrics.distMa20Pct}%
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="num py-2.5 text-right">
                      {row.metrics.volRatio20 != null ? (
                        <div className="flex flex-col items-end">
                          <span className={row.metrics.volRatio20 >= 1.2 ? "text-emerald-400 font-bold" : "text-text-muted"}>
                            {row.metrics.volRatio20}x
                          </span>
                          {row.metrics.volRatio20 >= 1.2 && (
                            <span className="text-[9px] text-emerald-400/90 font-medium">Xác nhận</span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
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
