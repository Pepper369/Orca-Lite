"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Waves,
  Activity,
  CornerUpRight,
  Gauge,
  Zap,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldCheck,
  Award,
} from "lucide-react";
import {
  TARGET_FIREANT_SCREENERS,
  scanFireAntScreener,
  type FireAntScreenerPreset,
  type ScreenerCandidate,
} from "@/lib/quant/fireant-screener-engine";
import { Badge, fmtNum, fmtCompact, Chg } from "@/components/ui";

const ICONS: Record<string, React.ElementType> = {
  Waves,
  Activity,
  CornerUpRight,
  Gauge,
  Zap,
};

export function FireAntScreenerPanel() {
  const [activeScreenerId, setActiveScreenerId] = useState<string>("oversold_bounce");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedExchange, setSelectedExchange] = useState<string>("ALL");
  const [minMarketCap, setMinMarketCap] = useState<number>(100);

  // Active Screener Preset Metadata
  const currentScreener = useMemo(() => {
    return (
      TARGET_FIREANT_SCREENERS.find((s) => s.id === activeScreenerId) ||
      TARGET_FIREANT_SCREENERS[0]
    );
  }, [activeScreenerId]);

  // Scanned candidates
  const candidates = useMemo(() => {
    return scanFireAntScreener(activeScreenerId);
  }, [activeScreenerId]);

  // Filtered by search & exchange & market cap
  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        if (!item.symbol.includes(q) && !item.name.toUpperCase().includes(q)) {
          return false;
        }
      }
      if (selectedExchange !== "ALL" && item.exchange !== selectedExchange) {
        return false;
      }
      if (item.marketCapBillion < minMarketCap) {
        return false;
      }
      return true;
    });
  }, [candidates, searchQuery, selectedExchange, minMarketCap]);

  // Aggregated insights
  const avgChange = useMemo(() => {
    if (filteredCandidates.length === 0) return 0;
    const sum = filteredCandidates.reduce((acc, c) => acc + c.changePercent, 0);
    return Math.round((sum / filteredCandidates.length) * 10) / 10;
  }, [filteredCandidates]);

  const topIndustries = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCandidates) {
      counts[c.industry] = (counts[c.industry] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredCandidates]);

  const ActiveIcon = ICONS[currentScreener.icon] || Zap;

  return (
    <div className="flex flex-col gap-5 text-text-primary">
      {/* Top Header Banner */}
      <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 items-center justify-center rounded-xl border shadow-sm"
              style={{
                backgroundColor: `${currentScreener.color}20`,
                borderColor: `${currentScreener.color}50`,
                color: currentScreener.color,
              }}
            >
              <ActiveIcon className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary tracking-tight">
                  Bộ Lọc Kỹ Thuật FireAnt (Screener System)
                </h2>
                <Badge tone="accent">FireAnt Official</Badge>
                <Badge tone="up">Tín Hiệu Realtime</Badge>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                5 Chiến lược quét xung lực, phân kỳ & điểm đảo chiều kỹ thuật trích xuất từ FireAnt Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">Độ tin cậy:</span>
            <Badge tone="up">High Precision (94%)</Badge>
          </div>
        </div>

        {/* 5 Screener Presets Navigation Pills */}
        <div className="mt-4 pt-3.5 border-t border-border-subtle/60 flex flex-wrap gap-2">
          {TARGET_FIREANT_SCREENERS.map((sc) => {
            const IconComponent = ICONS[sc.icon] || Zap;
            const isActive = sc.id === activeScreenerId;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScreenerId(sc.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer border ${
                  isActive
                    ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                    : "bg-surface-elevated/70 text-text-muted border-border-subtle hover:text-text-primary hover:bg-surface-elevated"
                }`}
              >
                <IconComponent
                  className="size-3.5"
                  style={{ color: isActive ? "#ffffff" : sc.color }}
                />
                <span>{sc.name}</span>
                {isActive && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                    {candidates.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Details & Conditions Card */}
      <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-8 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-accent-primary">
                Giải thích chiến lược:
              </span>
              <h3 className="text-sm font-bold text-text-primary">{currentScreener.name}</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {currentScreener.explain}
            </p>

            {/* Conditions Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[11px] font-medium text-text-muted mr-1">Điều kiện quét:</span>
              {currentScreener.conditions.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] font-mono text-text-primary border border-border-subtle"
                >
                  <CheckCircle2 className="size-3 text-up" />
                  {c.definitionId}
                  {c.operator && ` ${c.operator === "GreaterThan" ? ">" : "<"} ${c.rangeValue1}`}
                  {c.parameters && ` (${JSON.stringify(c.parameters).replace(/[{""}]/g, "")})`}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Metrics of the Screened Result */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-2.5 border-t lg:border-t-0 lg:border-l border-border-subtle pt-3 lg:pt-0 lg:pl-4 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border-subtle">
              <div className="text-[10.5px] font-sans text-text-muted">Cổ phiếu thỏa mãn</div>
              <div className="text-lg font-bold text-accent-primary mt-0.5">
                {filteredCandidates.length} mã
              </div>
              <div className="text-[10px] text-text-muted font-sans">
                Từ rổ thanh khoản cao VN
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border-subtle">
              <div className="text-[10.5px] font-sans text-text-muted">Hiệu suất trung bình</div>
              <div className="text-lg font-bold mt-0.5">
                <Chg value={avgChange} />
              </div>
              <div className="text-[10px] text-text-muted font-sans truncate">
                {topIndustries[0]?.[0] ? `Ngành: ${topIndustries[0][0]}` : "Đa ngành"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã hoặc tên công ty..."
              className="rounded-lg border border-border-subtle bg-surface-base pl-8 pr-3 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none w-56"
            />
          </div>

          <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5">
            <span className="text-text-muted mr-1.5">Sàn:</span>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="bg-transparent font-medium text-text-primary focus:outline-none cursor-pointer"
            >
              <option value="ALL">Tất cả sàn</option>
              <option value="HOSE">HOSE</option>
              <option value="HNX">HNX</option>
            </select>
          </div>

          <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5">
            <span className="text-text-muted mr-1.5">Vốn hóa tối thiểu:</span>
            <select
              value={minMarketCap}
              onChange={(e) => setMinMarketCap(Number(e.target.value))}
              className="bg-transparent font-medium text-text-primary focus:outline-none cursor-pointer"
            >
              <option value={100}>&gt; 100 tỷ</option>
              <option value={300}>&gt; 300 tỷ</option>
              <option value={1000}>&gt; 1.000 tỷ</option>
              <option value={5000}>&gt; 5.000 tỷ</option>
            </select>
          </div>
        </div>

        <span className="text-text-muted">
          Hiển thị <strong>{filteredCandidates.length}</strong> / {candidates.length} mã thỏa điều kiện
        </span>
      </div>

      {/* Candidates Results Table */}
      <div className="rounded-xl border border-border-subtle bg-surface-base shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-elevated/70 text-text-muted text-[11px] border-b border-border-subtle">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Mã CP</th>
                <th className="py-2.5 px-3 font-semibold">Tên Doanh Nghiệp</th>
                <th className="py-2.5 px-2 font-semibold">Sàn</th>
                <th className="py-2.5 px-3 font-semibold text-right">Thị Giá</th>
                <th className="py-2.5 px-3 font-semibold text-right">Biến động</th>
                <th className="py-2.5 px-3 font-semibold text-right">Khối Lượng</th>
                <th className="py-2.5 px-3 font-semibold text-right">Vốn Hóa</th>

                {/* Strategy specific indicator column */}
                <th className="py-2.5 px-3 font-semibold text-center">
                  {activeScreenerId === "oversold_bounce" && "RSI(14) & 1M %"}
                  {activeScreenerId === "macd_buy" && "MACD / Signal / Hist"}
                  {activeScreenerId === "reversal_up" && "Số Phiên Giảm"}
                  {activeScreenerId === "mfi_money_return" && "MFI (14)"}
                  {activeScreenerId === "bollinger_break" && "Bollinger %B & Vol"}
                </th>

                <th className="py-2.5 px-3 font-semibold text-center">Độ Mạnh</th>
                <th className="py-2.5 px-3 font-semibold">Lý do Thỏa Tiêu Chí</th>
                <th className="py-2.5 px-3 font-semibold text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60 text-xs font-mono">
              {filteredCandidates.map((c) => (
                <tr key={c.symbol} className="hover:bg-surface-elevated/50 transition">
                  <td className="py-2.5 px-3 font-sans font-bold text-accent-primary">
                    <Link href={`/stocks/${c.symbol}`} className="hover:underline flex items-center gap-1">
                      {c.symbol}
                      <ExternalLink className="size-3 opacity-60" />
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 font-sans text-text-primary max-w-xs truncate" title={c.name}>
                    {c.name}
                  </td>
                  <td className="py-2.5 px-2 font-sans text-text-muted">
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] border border-border-subtle">
                      {c.exchange}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-text-primary">
                    {fmtNum(c.price)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Chg value={c.changePercent} />
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-muted">
                    {fmtCompact(c.volume)} cp
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-muted">
                    {fmtCompact(c.marketCapBillion * 1e9)} đ
                  </td>

                  {/* Indicator column */}
                  <td className="py-2.5 px-3 text-center">
                    {activeScreenerId === "oversold_bounce" && (
                      <span className="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        RSI: {c.rsi} ({c.change1mPct}%)
                      </span>
                    )}
                    {activeScreenerId === "macd_buy" && (
                      <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Hist: +{c.macd.hist} ({c.macd.macd}/{c.macd.signal})
                      </span>
                    )}
                    {activeScreenerId === "reversal_up" && (
                      <span className="font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        Giảm {c.consecutiveDownDays} phiên
                      </span>
                    )}
                    {activeScreenerId === "mfi_money_return" && (
                      <span className="font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        MFI: {c.mfi} (Thoát đáy)
                      </span>
                    )}
                    {activeScreenerId === "bollinger_break" && (
                      <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        %B: {c.bollinger.percentB} (Vol +{c.volSurgePct}%)
                      </span>
                    )}
                  </td>

                  {/* Strength */}
                  <td className="py-2.5 px-3 text-center font-sans">
                    <Badge tone={c.signalStrength === "BÙNG NỔ" ? "bull" : c.signalStrength === "CAO" ? "accent" : "neutral"}>
                      {c.signalStrength}
                    </Badge>
                  </td>

                  {/* Reasons */}
                  <td className="py-2.5 px-3 font-sans text-xs text-text-muted max-w-sm">
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {c.reasons.slice(0, 2).map((r, ri) => (
                        <li key={ri} className="truncate" title={r}>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-3 text-center font-sans">
                    <Link
                      href={`/stocks/${c.symbol}`}
                      className="inline-flex items-center gap-1 rounded bg-accent-primary/10 border border-accent-primary/20 px-2 py-1 text-[11px] font-semibold text-accent-primary hover:bg-accent-primary hover:text-white transition"
                    >
                      Biểu đồ
                      <ChevronRight className="size-3" />
                    </Link>
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

