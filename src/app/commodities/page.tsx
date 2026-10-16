"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { CommodityMarket } from "@/lib/services/commodities";
import type { CommodityStockImpact, SentimentLabel } from "@/lib/commodities-impact";
import {
  Badge,
  Chg,
  fmtNum,
  FreshnessDot,
  Loading,
  MetaLine,
  ErrorState,
  EmptyState,
  FreshnessAlertBanner,
} from "@/components/ui";
import { AddToWatchlist } from "@/components/watchlist-button";
import { CurrencyConverter } from "@/components/currency-converter";
import {
  CommodityLineChart,
  resolveCommodityChartSymbol,
} from "@/components/commodity-line-chart";
import { Boxes, ChevronDown, ChevronUp, Flame, Info, RefreshCw, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { BOOTSTRAP_COMMODITIES_DATA } from "@/lib/bootstrap-data";

type CatalogItem = {
  key: string;
  name: string;
  nameVi: string;
  group: string;
  symbol: string;
  unit: string;
  vnImpact: CommodityStockImpact | null;
};

type Data = Omit<CommodityMarket, "catalog"> & {
  catalog: CatalogItem[];
  groups?: Record<string, { title: string; desc: string }>;
};

const FALLBACK_GROUPS: { key: string; title: string; desc: string }[] = [
  { key: "", title: "Tất cả", desc: "" },
  { key: "hang_tieu_dung", title: "Hàng tiêu dùng", desc: "Heo · Cà phê · Gạo…" },
  { key: "kim_loai_phi_kim", title: "Kim loại & phi kim", desc: "Vàng · Đồng…" },
  { key: "hoa_chat", title: "Hóa chất", desc: "Ure · Phân…" },
  { key: "vat_lieu_xay_dung", title: "Vật liệu XD", desc: "Thép · Xi măng…" },
  { key: "nang_luong", title: "Năng lượng", desc: "WTI · Xăng…" },
  { key: "nhua_va_cao_su", title: "Nhựa & cao su", desc: "PVC · PP…" },
];

/** Prefer liquid international series first so the chart is never blank on load. */
const CHART_PRIORITY = ["GOLD", "SILVER", "WTI", "BRENT", "COPPER", "NATGAS", "PLATINUM", "COFFEE", "SUGAR", "CORN", "IRON"] as const;

function chartRank(sym: string): number {
  const i = CHART_PRIORITY.indexOf(sym as (typeof CHART_PRIORITY)[number]);
  return i < 0 ? 50 : i;
}

export default function CommoditiesPage() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const { data, meta, isLoading, isValidating, mutate } = useApi<Data>("/api/v1/commodities", {
    refreshInterval: 5 * 60_000,
    keepPreviousData: true,
    timeoutMs: 5_000,
  });

  const activeData = (data?.catalog?.length ? data : BOOTSTRAP_COMMODITIES_DATA) as unknown as Data;

  const groups = useMemo(() => {
    if (activeData?.groups) {
      return [
        { key: "", title: "Tất cả", desc: "" },
        ...Object.entries(activeData.groups).map(([key, v]) => ({ key, title: v.title, desc: v.desc })),
      ];
    }
    return FALLBACK_GROUPS;
  }, [activeData]);

  const bySymbol = useMemo(() => new Map((activeData?.rows ?? []).map((r) => [r.symbol, r])), [activeData]);

  const catalog = useMemo((): CatalogItem[] => {
    let defs: CatalogItem[] = (activeData?.catalog as unknown as CatalogItem[]) ?? [];
    if (group) defs = defs.filter((d) => d.group === group);

    if (sentimentFilter) {
      defs = defs.filter((d) => d.vnImpact?.sentiment === sentimentFilter);
    }

    if (q.trim()) {
      const needle = q.trim().toUpperCase();
      defs = defs.filter((d) => {
        const vi = d.nameVi.toUpperCase();
        const en = d.name.toUpperCase();
        const sym = d.symbol.toUpperCase();
        const sec = (d.vnImpact?.sector ?? "").toUpperCase();
        const hasStock = d.vnImpact?.stocks.some((s) => s.toUpperCase().includes(needle));
        return vi.includes(needle) || en.includes(needle) || sym.includes(needle) || sec.includes(needle) || hasStock;
      });
    }
    return defs;
  }, [activeData, group, sentimentFilter, q]);

  // Sentiment breakdown counts
  const sentimentStats = useMemo(() => {
    let positive = 0;
    let negative = 0;
    let mixed = 0;
    for (const d of (activeData?.catalog as unknown as CatalogItem[]) ?? []) {
      const s = d.vnImpact?.sentiment;
      if (s === "TÍCH CỰC") positive++;
      else if (s === "TIÊU CỰC") negative++;
      else mixed++;
    }
    return { positive, negative, mixed, total: ((activeData?.catalog as unknown as CatalogItem[]) ?? []).length };
  }, [activeData?.catalog]);

  const chartOptions = useMemo(() => {
    const acc: { chartSymbol: string; label: string }[] = [];
    for (const d of (activeData?.catalog as unknown as CatalogItem[]) ?? []) {
      const cs = resolveCommodityChartSymbol(d.symbol, d.nameVi);
      if (!cs || acc.some((x) => x.chartSymbol === cs)) continue;
      acc.push({ chartSymbol: cs, label: d.nameVi });
    }
    for (const fallback of [
      { chartSymbol: "GOLD", label: "Vàng (quốc tế)" },
      { chartSymbol: "SILVER", label: "Bạc (quốc tế)" },
      { chartSymbol: "WTI", label: "Dầu WTI" },
      { chartSymbol: "BRENT", label: "Dầu Brent" },
      { chartSymbol: "COPPER", label: "Đồng (Copper)" },
      { chartSymbol: "COFFEE", label: "Cà phê (KC)" },
      { chartSymbol: "IRON", label: "Quặng sắt (TIO)" },
    ] as const) {
      if (!acc.some((x) => x.chartSymbol === fallback.chartSymbol)) {
        acc.push({ chartSymbol: fallback.chartSymbol, label: fallback.label });
      }
    }
    acc.sort((a, b) => chartRank(a.chartSymbol) - chartRank(b.chartSymbol) || a.label.localeCompare(b.label, "vi"));
    return acc;
  }, [activeData?.catalog]);

  return (
    <div className="space-y-3">
      {/* Header and Search */}
      <div className="panel overflow-visible p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
              <Boxes className="size-5 text-accent-primary" /> Hàng hóa & Tác động Cổ phiếu
              <Badge tone="neutral">VietnamBiz Data</Badge>
              {meta && <FreshnessDot status={meta.freshness} ageMs={meta.ageMs} />}
            </h1>
            <button
              type="button"
              onClick={() => void mutate()}
              disabled={isValidating}
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated/80 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              title="Làm mới bảng giá hàng hóa"
            >
              <RefreshCw className={`size-3 ${isValidating ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>

          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm hàng hóa hoặc cổ phiếu: HPG, GAS, vàng, dầu..."
              className="w-full rounded-xl border border-border-subtle bg-surface-elevated py-2 pl-9 pr-8 text-[13px] text-text-primary shadow-inner outline-none transition-all placeholder:text-text-muted focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/20"
              aria-label="Tìm kiếm hàng hóa hoặc mã cổ phiếu"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sentiment Overview Bar */}
        {sentimentStats.total > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border-subtle/80 bg-surface-elevated/40 p-2 sm:flex sm:items-center sm:gap-3">
            <span className="col-span-3 text-[11px] font-medium text-text-muted sm:col-auto sm:border-r sm:border-border-subtle sm:pr-3">
              Sentiment thị trường:
            </span>
            <button
              type="button"
              onClick={() => setSentimentFilter(sentimentFilter === "TÍCH CỰC" ? "" : "TÍCH CỰC")}
              className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                sentimentFilter === "TÍCH CỰC"
                  ? "bg-positive/20 text-positive ring-1 ring-positive/40"
                  : "bg-positive/10 text-positive/90 hover:bg-positive/15"
              }`}
            >
              <span className="flex items-center gap-1">
                <TrendingUp className="size-3.5" /> Tích cực:
              </span>
              <span className="num font-bold">{sentimentStats.positive}</span>
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter(sentimentFilter === "TIÊU CỰC" ? "" : "TIÊU CỰC")}
              className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                sentimentFilter === "TIÊU CỰC"
                  ? "bg-negative/20 text-negative ring-1 ring-negative/40"
                  : "bg-negative/10 text-negative/90 hover:bg-negative/15"
              }`}
            >
              <span className="flex items-center gap-1">
                <TrendingDown className="size-3.5" /> Tiêu cực:
              </span>
              <span className="num font-bold">{sentimentStats.negative}</span>
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter(sentimentFilter === "PHÂN HÓA" ? "" : "PHÂN HÓA")}
              className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                sentimentFilter === "PHÂN HÓA"
                  ? "bg-warning/20 text-warning ring-1 ring-warning/40"
                  : "bg-warning/10 text-warning/90 hover:bg-warning/15"
              }`}
            >
              <span className="flex items-center gap-1">
                <Flame className="size-3.5" /> Phân hóa:
              </span>
              <span className="num font-bold">{sentimentStats.mixed}</span>
            </button>
            {sentimentFilter && (
              <button
                type="button"
                onClick={() => setSentimentFilter("")}
                className="text-[11px] text-accent-primary hover:underline ml-auto"
              >
                Xóa lọc sentiment
              </button>
            )}
          </div>
        )}

        {/* Commodity Group Selector */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {groups.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`group rounded-full border px-3 py-1 text-[11.5px] transition-all ${
                group === g.key
                  ? "border-accent-primary/50 bg-accent-primary/12 text-accent-primary shadow-[0_0_0_3px_rgba(76,141,255,0.10)] font-medium"
                  : "border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary"
              }`}
            >
              {g.title}
              {g.desc && <span className="ml-1 text-[10px] text-text-muted group-hover:text-text-secondary">{g.desc}</span>}
            </button>
          ))}
          <span className="ml-auto hidden md:block">
            <MetaLine meta={meta} />
          </span>
        </div>

        {data?.rows && (
          <p className="mt-2 text-[11px] text-text-muted">
            {data.rows.length} mặt hàng · nguồn{" "}
            <a href="https://data.vietnambiz.vn/goods" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
              data.vietnambiz.vn/goods
            </a>
          </p>
        )}
      </div>

      <CurrencyConverter />

      <CommodityLineChart options={chartOptions} height={320} />

      {meta?.freshness && (meta.freshness === "DELAYED" || meta.freshness === "STALE" || meta.degraded) && (
        <FreshnessAlertBanner
          state={meta.freshness === "STALE" ? "stale" : meta.degraded ? "degraded" : "delayed"}
          ageMs={meta.ageMs}
          note={meta.note}
          source="VietnamBiz"
          className="my-3"
        />
      )}

      {!data ? (
        <ErrorState
          title="VietnamBiz Data chưa phản hồi bảng giá"
          message={meta?.note || "Không nhận được phản hồi từ máy chủ bảng giá hàng hóa. Bấm nút bên dưới để thử lại."}
          onRetry={() => void mutate()}
          className="mt-3"
        />
      ) : catalog.length === 0 ? (
        <EmptyState
          title="Không tìm thấy mặt hàng hoặc cổ phiếu"
          description={`Không có mặt hàng nào khớp với từ khóa "${q}" ${sentimentFilter ? `hoặc sentiment "${sentimentFilter}"` : ""} trong nhóm này.`}
          actionLabel="Xóa toàn bộ bộ lọc"
          onAction={() => {
            setQ("");
            setGroup("");
            setSentimentFilter("");
          }}
          className="mt-3"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.map((d) => {
            const row = bySymbol.get(d.symbol);
            const groupMeta = groups.find((x) => x.key === d.group);
            const impact = d.vnImpact;
            const isExpanded = expandedCard === d.key;

            if (!row) {
              return (
                <div key={d.key} className="panel flex items-center justify-between p-3 opacity-60">
                  <div>
                    <div className="text-[13px] font-medium">{d.nameVi}</div>
                    <div className="text-[10px] text-text-muted">
                      {d.symbol} · {groupMeta?.title}
                    </div>
                  </div>
                  <Badge tone="warn">UNAVAILABLE</Badge>
                </div>
              );
            }

            const dgt = row.price >= 1000 ? 0 : row.price >= 10 ? 2 : 3;
            const up = (row.changePercent ?? 0) > 0;
            const down = (row.changePercent ?? 0) < 0;

            const sentiment = impact?.sentiment ?? (up ? "TÍCH CỰC" : down ? "TIÊU CỰC" : "PHÂN HÓA");
            const sentimentTone = sentiment === "TÍCH CỰC" ? "up" : sentiment === "TIÊU CỰC" ? "down" : "warn";

            return (
              <div
                key={d.key}
                className="panel hover-lift relative flex flex-col justify-between overflow-hidden p-3.5 transition-all"
              >
                {/* Border strip by change */}
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 w-[3.5px] ${
                    up ? "bg-positive" : down ? "bg-negative" : "bg-border-default"
                  }`}
                />

                <div>
                  {/* Top Bar: Title, Group & Watchlist */}
                  <div className="flex items-start justify-between gap-2 pl-1.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-bold text-text-primary leading-snug">{d.nameVi}</span>
                        {d.symbol !== d.nameVi && (
                          <span className="text-[11px] font-mono text-text-muted">({d.symbol})</span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-text-muted">
                        {impact?.sector ?? groupMeta?.title ?? d.group} · {row.unit}
                      </div>
                    </div>
                    <AddToWatchlist assetType="commodity" symbol={d.symbol} />
                  </div>

                  {/* Price & Change */}
                  <div className="mt-2 flex items-baseline justify-between pl-1.5">
                    <span className="num text-[20px] font-bold tracking-tight text-text-primary">
                      {fmtNum(row.price, dgt)}
                      <span className="ml-1 text-[11px] font-normal text-text-muted">{row.currency}</span>
                    </span>
                    <Chg value={row.changePercent} className="text-[12.5px] font-semibold" arrow={true} />
                  </div>

                  {/* SENTIMENT & STOCK IMPACT SECTION */}
                  {impact && (
                    <div className="mt-3 rounded-lg border border-border-subtle/80 bg-surface-elevated/60 p-2 pl-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-semibold text-text-muted">Sentiment:</span>
                          <Badge tone={sentimentTone} className="text-[10.5px] font-bold">
                            {sentiment}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-text-muted">
                          {impact.impactType === "benefit" ? "Hưởng lợi trực tiếp" : impact.impactType === "headwind" ? "Áp lực chi phí" : "Tác động 2 chiều"}
                        </span>
                      </div>

                      {/* Impacted Stocks Badges */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-text-secondary">
                          <span>Cổ phiếu ảnh hưởng:</span>
                          {impact.mechanism && (
                            <button
                              type="button"
                              onClick={() => setExpandedCard(isExpanded ? null : d.key)}
                              className="inline-flex items-center gap-0.5 text-accent-primary hover:underline text-[9.5px]"
                            >
                              {isExpanded ? "Thu gọn" : "Cơ chế"}
                              {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </button>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap gap-1">
                          {impact.beneficiaryStocks.map((sym) => (
                            <Link
                              key={sym}
                              href={`/stocks/${sym}`}
                              className="inline-flex items-center rounded-md border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[10.5px] font-bold text-positive hover:bg-positive/20 transition-colors"
                              title={`Cổ phiếu ${sym} hưởng lợi từ diễn biến giá ${d.nameVi}`}
                            >
                              {sym} <span className="ml-0.5 text-[9px]">+</span>
                            </Link>
                          ))}
                          {impact.headwindStocks.map((sym) => (
                            <Link
                              key={sym}
                              href={`/stocks/${sym}`}
                              className="inline-flex items-center rounded-md border border-negative/30 bg-negative/10 px-1.5 py-0.5 text-[10.5px] font-bold text-negative hover:bg-negative/20 transition-colors"
                              title={`Cổ phiếu ${sym} chịu ảnh hưởng tiêu cực/chi phí từ giá ${d.nameVi}`}
                            >
                              {sym} <span className="ml-0.5 text-[9px]">-</span>
                            </Link>
                          ))}
                          {impact.beneficiaryStocks.length === 0 && impact.headwindStocks.length === 0 && impact.stocks.map((sym) => (
                            <Link
                              key={sym}
                              href={`/stocks/${sym}`}
                              className="inline-flex items-center rounded-md border border-border-subtle bg-surface-primary px-1.5 py-0.5 text-[10.5px] font-bold text-text-primary hover:border-accent-primary transition-colors"
                            >
                              {sym}
                            </Link>
                          ))}
                        </div>
                      </div>

                      {/* Mechanism Explanation */}
                      {impact.mechanism && (
                        <div className={`mt-2 border-t border-border-subtle/60 pt-1.5 text-[10.5px] text-text-secondary leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                          <span className="font-medium text-text-muted">Cơ chế: </span>
                          {impact.mechanism}
                        </div>
                      )}

                      {/* Detailed Stock Breakdown if expanded */}
                      {isExpanded && impact.detail && impact.detail.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-border-subtle/60 pt-1.5">
                          <div className="text-[10px] font-semibold text-text-muted">Chi tiết phân khúc:</div>
                          {impact.detail.map((dt) => (
                            <div key={dt.symbol} className="flex items-start justify-between gap-1 text-[10px]">
                              <Link href={`/stocks/${dt.symbol}`} className="font-bold text-accent-primary hover:underline">
                                {dt.symbol}:
                              </Link>
                              <span className="flex-1 text-text-secondary truncate" title={dt.reason}>
                                {dt.role} · {dt.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Source Quotes */}
                <div className="mt-3 space-y-0.5 border-t border-border-subtle pt-1.5 pl-1.5">
                  {row.sourceRecords.map((s) => (
                    <div key={s.source} className="flex items-center justify-between text-[10px] text-text-muted">
                      <span className="truncate">{s.source}</span>
                      <span className="num">
                        {fmtNum(s.price, dgt)}
                        {s.timestamp && (
                          <>
                            {" "}·{" "}
                            {new Date(s.timestamp).toLocaleString("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
