"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { ForexMarket } from "@/lib/services/forex";
import type { ForexRow } from "@/lib/types";
import { Chg, FreshnessDot, MetaLine, Panel } from "@/components/ui";
import { Globe2, Crosshair, BarChart3, ShieldCheck } from "lucide-react";
import { BOOTSTRAP_FOREX_DATA } from "@/lib/bootstrap-data";
import { ForexSignalsPanel } from "./forex-signals-panel";

export function ForexDashboard() {
  const [activeTab, setActiveTab] = useState<"signals" | "rates">("signals");

  const { data, meta } = useApi<ForexMarket>("/api/v1/forex/markets", {
    refreshInterval: 25_000,
    keepPreviousData: true,
    timeoutMs: 5_000,
    initialData: (BOOTSTRAP_FOREX_DATA as ForexMarket),
  });

  const activeData = (data?.rows?.length ? data : BOOTSTRAP_FOREX_DATA) as ForexMarket;

  const groups: { key: NonNullable<ForexRow["group"]>; title: string }[] = [
    { key: "major", title: "Cặp chính" },
    { key: "cross", title: "Cặp chéo" },
    { key: "vnd", title: "VND" },
    { key: "metal", title: "Kim loại (XAU · XAG · XPT)" },
    { key: "energy", title: "Dầu · Gas · Đồng" },
  ];

  return (
    <div className="space-y-4">
      {/* Header Panel with Mode Switcher */}
      <Panel pad={false}>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-ink-1">
              <Globe2 className="size-5 text-accent" /> Thị Trường Ngoại Hối & Tín Hiệu Định Lượng
              <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">{activeData.usdStrengthNote}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setActiveTab("signals")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all ${
                  activeTab === "signals"
                    ? "bg-accent text-white shadow-xs"
                    : "text-ink-2 hover:text-ink-1"
                }`}
              >
                <Crosshair className="size-3.5" /> Tín Hiệu Quant VIP
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("rates")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all ${
                  activeTab === "rates"
                    ? "bg-accent text-white shadow-xs"
                    : "text-ink-2 hover:text-ink-1"
                }`}
              >
                <BarChart3 className="size-3.5" /> Bảng Giá Tổng Quan
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* Tab 1: Quantitative Signals Hub with Multi-Tier TP & Lot Sizer */}
      {activeTab === "signals" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" />
              <h2 className="text-[14px] font-bold text-ink-1 uppercase tracking-wider">
                Ma Trận Tín Hiệu Đa Khung Thời Gian (M15 → M5 → M1) & Chốt Lời Phân Tầng
              </h2>
            </div>
            <span className="text-[11px] text-ink-3">
              Chốt lời 3 tầng (TP1 · TP2 · TP3) + Quản trị vốn 1%
            </span>
          </div>
          <ForexSignalsPanel />
        </section>
      )}

      {/* Tab 2: Classic Multi-Group Rates */}
      {activeTab === "rates" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {groups.map((g) => {
              const rows = activeData.rows.filter((r) => r.group === g.key);
              const placeholders =
                g.key === "metal"
                  ? [
                      { pair: "XAUUSD", symbol: "XAU/USD" },
                      { pair: "XAGUSD", symbol: "XAG/USD" },
                      { pair: "XPTUSD", symbol: "XPT/USD" },
                    ]
                  : g.key === "energy"
                    ? [
                        { pair: "OILUSD", symbol: "OIL/USD" },
                        { pair: "UKOIL", symbol: "UKO/USD" },
                        { pair: "USOIL", symbol: "USO/USD" },
                      ]
                    : [];
              const show = rows.length
                ? rows
                : placeholders.map((p) => ({
                    pair: p.pair,
                    symbol: p.symbol,
                    price: null as number | null,
                    changePercent: null as number | null,
                  }));
              if (!show.length) return null;
              return (
                <Panel key={g.key} title={g.title} pad={false}>
                  <div className="divide-y divide-line/50">
                    {show.map((r) => (
                      <Link
                        key={r.pair}
                        href={`/forex/${r.pair}`}
                        className="row-hover flex items-center justify-between px-3.5 py-2.5"
                      >
                        <div>
                          <div className="text-[13px] font-semibold">{r.symbol}</div>
                          <div className="text-[10px] text-ink-3">{r.pair}</div>
                        </div>
                        <div className="text-right">
                          <div className="num text-[14px]">
                            {r.price == null
                              ? "—"
                              : r.price >= 1000
                                ? r.price.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
                                : r.price >= 100
                                  ? r.price.toFixed(2)
                                  : r.price.toFixed(4)}
                          </div>
                          <Chg value={r.changePercent} className="text-[11px]" arrow={false} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </Panel>
              );
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-ink-3">
            Realtime ≤15s: Biquote (FX) ∥ Yahoo (XAU/XAG/oil) ∥ ER-API. Bấm mã để mở chart + chỉ báo.
          </p>
        </div>
      )}
    </div>
  );
}
