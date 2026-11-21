"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { Badge, Chg, fmtCompact, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import type {
  InvestmentHorizon,
  SectorHorizonFlowResult,
  SectorSortHorizon,
} from "@/lib/engines/sector-horizon-flow-engine";
import { Activity, Flame, Layers, Radio, TrendingUp } from "lucide-react";

interface MultiHorizonSectorFlowPayload {
  sectors: SectorHorizonFlowResult[];
  totalMarketTurnoverBillion: number;
  horizonLeaders: Record<InvestmentHorizon | "CURRENT_1D", string[]>;
  activeHorizon: SectorSortHorizon;
  sourcesConnected?: string[];
  timestamp: number;
  cached: boolean;
}

const HORIZON_TABS: Array<{ id: SectorSortHorizon; label: string; sub: string }> = [
  { id: "COMPOSITE", label: "Tổng hợp 5 Khung", sub: "Đa chu kỳ" },
  { id: "CURRENT_1D", label: "Hiện tại (1D)", sub: "Phiên nay" },
  { id: "SHORT_1_2W", label: "Ngắn hạn", sub: "1–2 tuần" },
  { id: "MEDIUM_3W_2M", label: "Trung hạn", sub: "3T–2 tháng" },
  { id: "MED_LONG_2_6M", label: "Trung–Dài hạn", sub: "2–6 tháng" },
  { id: "LONG_6M_PLUS", label: "Dài hạn", sub: "> 6 tháng" },
];

const SOURCE_LABELS: Record<string, string> = {
  VN_LIVE_QUOTES: "Bảng giá VN Live",
  MASTER_TA_FA_SNAPSHOT: "Master TA/FA Quant",
  VNDIRECT_FOREIGN_FLOW: "Khối ngoại VNDDirect",
  RRG_VNINDEX_BENCHMARK: "RRG vs VN-Index",
};

function scoreChipClass(score: number): string {
  if (score >= 76) return "bg-up/20 text-up border-up/40 font-bold";
  if (score >= 62) return "bg-up/10 text-up border-up/25 font-semibold";
  if (score >= 45) return "bg-surface-elevated text-text-secondary border-border-subtle";
  if (score >= 32) return "bg-warn/15 text-warn border-warn/30";
  return "bg-down/15 text-down border-down/30 font-semibold";
}

function quadrantTone(q: SectorHorizonFlowResult["quadrant"]): "up" | "down" | "warn" | "accent" {
  if (q === "Leading") return "up";
  if (q === "Improving") return "accent";
  if (q === "Weakening") return "warn";
  return "down";
}

export default function SectorTrendPage() {
  const [horizon, setHorizon] = useState<SectorSortHorizon>("COMPOSITE");
  const [q, setQ] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { res, data, meta, isLoading } = useApi<MultiHorizonSectorFlowPayload>(
    `/api/v1/screener/sector-flow?horizon=${encodeURIComponent(horizon)}`,
    { refreshInterval: 25_000, keepPreviousData: true },
  );

  const filtered = useMemo(() => {
    const list = data?.sectors ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (s) =>
        s.sector.toLowerCase().includes(needle) ||
        s.sectorCode.toLowerCase().includes(needle) ||
        s.topStock?.symbol.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const detail = useMemo(() => {
    if (!data?.sectors?.length) return null;
    if (!selectedCode) return data.sectors[0] ?? null;
    return data.sectors.find((s) => s.sectorCode === selectedCode) ?? data.sectors[0] ?? null;
  }, [selectedCode, data]);

  if (isLoading && !res) return <Loading rows={10} />;

  if (!res?.success || !data) {
    return (
      <Unavailable
        title="Chưa có phân tích dòng tiền ngành đa khung"
        note={res && !res.success ? res.error.message : "Đang kết nối dữ liệu bảng giá, khối ngoại và RRG."}
      />
    );
  }

  const activeHorizonKey: InvestmentHorizon =
    horizon === "COMPOSITE" || horizon === "CURRENT_1D" ? "SHORT_1_2W" : horizon;

  return (
    <div className="stock-workspace space-y-3">
      {/* Header + Connected Sources Provenance */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-text-primary flex items-center gap-2">
              <Layers className="size-5 text-accent-primary" />
              Dòng Tiền Ngành Đa Khung Thời Gian (5 Giai Đoạn)
            </h1>
            <Badge tone="up">
              {data.sectors.length} Nhóm ngành ICB
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1 font-medium text-text-secondary">
              <Radio className="size-3 text-up" />
              Nguồn đồng bộ:
            </span>
            {(data.sourcesConnected ?? ["VN_LIVE_QUOTES"]).map((src) => (
              <span
                key={src}
                className="rounded border border-border-subtle bg-surface-elevated px-1.5 py-0.5 text-[10px] font-mono text-text-secondary"
              >
                {SOURCE_LABELS[src] ?? src}
              </span>
            ))}
            <span>·</span>
            <span>
              Tổng GTGD: <strong className="font-mono text-text-primary">{fmtCompact(data.totalMarketTurnoverBillion * 1e9)}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetaLine meta={meta} />
          <Link
            href="/screener?universe=sector-flow"
            className="rounded-lg border border-accent-primary/30 bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            Bộ lọc Dòng tiền Ngành ↗
          </Link>
        </div>
      </div>

      {/* 5-Horizon Switcher */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-primary p-1.5">
        {HORIZON_TABS.map((t) => {
          const active = horizon === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setHorizon(t.id)}
              className={`rounded-lg px-3 py-1.5 text-left transition-colors ${
                active
                  ? "bg-accent-primary text-white shadow-sm"
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <div className="text-[12px] font-bold leading-tight">{t.label}</div>
              <div className={`text-[10px] ${active ? "text-white/80" : "text-text-muted"}`}>
                {t.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Top Leaders Strip across all 5 Horizons */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            { key: "CURRENT_1D" as const, title: "Hiện tại (1D)", tone: "text-accent-primary" },
            { key: "SHORT_1_2W" as const, title: "Ngắn hạn (1–2T)", tone: "text-up" },
            { key: "MEDIUM_3W_2M" as const, title: "Trung hạn (3T–2Th)", tone: "text-up" },
            { key: "MED_LONG_2_6M" as const, title: "Trung–Dài (2–6Th)", tone: "text-warn" },
            { key: "LONG_6M_PLUS" as const, title: "Dài hạn (>6Th)", tone: "text-text-primary" },
          ]
        ).map((box) => (
          <div
            key={box.key}
            className="rounded-xl border border-border-subtle bg-surface-primary p-2.5 space-y-1.5"
          >
            <div className={`text-[11px] font-bold uppercase tracking-wide ${box.tone}`}>
              Dẫn dắt · {box.title}
            </div>
            <div className="flex flex-wrap gap-1">
              {(data.horizonLeaders?.[box.key] ?? []).slice(0, 3).map((secName, idx) => (
                <span
                  key={secName}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-text-primary"
                >
                  <span className="font-mono text-[9.5px] text-text-muted">#{idx + 1}</span>
                  {secName}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Main 5-Horizon Matrix Table */}
      <Panel
        title="Ma trận Dòng tiền Ngành 5 Giai Đoạn & Chế độ Tổ chức"
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lọc ngành hoặc mã dẫn dắt..."
            className="rounded-md border border-border-subtle bg-background-secondary px-2.5 py-1 text-[11.5px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                <th className="py-2 pr-2">Nhóm Ngành &amp; Chế Độ Dòng Tiền</th>
                <th className="py-2 px-1.5 text-center">Hiện tại<br />(1D)</th>
                <th className="py-2 px-1.5 text-center">Ngắn hạn<br />(1–2T)</th>
                <th className="py-2 px-1.5 text-center">Trung hạn<br />(3T–2Th)</th>
                <th className="py-2 px-1.5 text-center">Trung–Dài<br />(2–6Th)</th>
                <th className="py-2 px-1.5 text-center">Dài hạn<br />(&gt;6Th)</th>
                <th className="py-2 px-1.5 text-right">Gia tốc /<br />Hội tụ</th>
                <th className="py-2 px-1.5 text-right">RRG &amp; Vol</th>
                <th className="py-2 px-1.5 text-right">Khối ngoại /<br />GTGD</th>
                <th className="py-2 pl-2 text-right">Mã dẫn dắt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              {filtered.map((s) => {
                const isSelected = detail?.sectorCode === s.sectorCode;
                return (
                  <tr
                    key={s.sectorCode}
                    onClick={() => setSelectedCode(s.sectorCode)}
                    className={`cursor-pointer transition-colors hover:bg-surface-elevated/70 ${
                      isSelected ? "bg-accent-primary/10" : ""
                    }`}
                  >
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-text-primary">{s.sector}</span>
                        <Chg value={s.vwapChangePercent} className="font-mono text-[11px]" />
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-text-muted">
                        {s.institutionalRegimeVi} ·{" "}
                        <span className="text-up">{s.gainersCount}↑</span>/
                        <span className="text-down">{s.losersCount}↓</span>
                      </div>
                    </td>

                    {(
                      [
                        s.horizonScores.current1d,
                        s.horizonScores.short1_2w,
                        s.horizonScores.medium3w_2m,
                        s.horizonScores.medLong2_6m,
                        s.horizonScores.long6mPlus,
                      ] as const
                    ).map((sc, idx) => (
                      <td key={idx} className="py-2 px-1.5 text-center font-mono">
                        <span
                          className={`inline-block min-w-[34px] rounded border px-1.5 py-0.5 text-[11px] ${scoreChipClass(sc)}`}
                        >
                          {sc}
                        </span>
                      </td>
                    ))}

                    <td className="py-2 px-1.5 text-right font-mono">
                      <div
                        className={`font-bold ${
                          s.inflowAcceleration >= 4
                            ? "text-up"
                            : s.inflowAcceleration <= -4
                              ? "text-down"
                              : "text-text-secondary"
                        }`}
                      >
                        {s.inflowAcceleration > 0 ? "+" : ""}
                        {s.inflowAcceleration}đ
                      </div>
                      <div className="text-[10px] text-text-muted">
                        Hội tụ {s.multiHorizonConvergencePct}%
                      </div>
                    </td>

                    <td className="py-2 px-1.5 text-right font-mono">
                      <Badge tone={quadrantTone(s.quadrant)}>{s.quadrant}</Badge>
                      <div className="mt-0.5 text-[10px] text-text-muted">
                        Vol {s.weightedVolRatio20}x · U/D {s.weightedUpDownVolRatio}
                      </div>
                    </td>

                    <td className="py-2 px-1.5 text-right font-mono">
                      <div
                        className={`font-semibold ${
                          s.foreignNetValBillion > 0.5
                            ? "text-up"
                            : s.foreignNetValBillion < -0.5
                              ? "text-down"
                              : "text-text-secondary"
                        }`}
                      >
                        {s.foreignNetValBillion > 0 ? "+" : ""}
                        {s.foreignNetValBillion.toFixed(1)} tỷ
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {s.totalTurnoverBillion.toFixed(0)} tỷ ({s.turnoverSharePct}%)
                      </div>
                    </td>

                    <td className="py-2 pl-2 text-right font-mono">
                      {s.topStock ? (
                        <Link
                          href={`/stocks/${encodeURIComponent(s.topStock.symbol)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex flex-col items-end hover:text-accent-primary"
                        >
                          <span className="font-bold text-text-primary">{s.topStock.symbol}</span>
                          <span className="text-[10px] text-up">
                            {s.topStock.horizonScore}đ · {s.topStock.changePercent > 0 ? "+" : ""}
                            {s.topStock.changePercent}%
                          </span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Deep-Dive Selected Sector Card */}
      {detail && (
        <Panel
          title={`Phân tích chuyên sâu ngành: ${detail.sector} (${detail.rotationPhaseVi})`}
          right={
            <div className="flex items-center gap-2">
              <Badge tone={quadrantTone(detail.quadrant)}>
                RRG: {detail.quadrantVi} (RS {detail.rsRatio} · Mom {detail.rsMomentum})
              </Badge>
              <Badge tone="accent">Tổng hợp {detail.horizonScores.compositeFlowScore}/99</Badge>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border-subtle bg-background-secondary p-3 text-[11.5px]">
              <div className="flex items-center gap-1.5 font-bold text-text-primary">
                <Activity className="size-4 text-accent-primary" />
                Luận điểm dòng tiền theo từng giai đoạn
              </div>
              <div className="space-y-1.5 text-text-secondary">
                <div>
                  <strong className="text-text-primary">Hiện tại (1D — {detail.horizonScores.current1d}đ):</strong>{" "}
                  {detail.horizonSignals.current1dVi} · Gia tốc {detail.inflowAcceleration > 0 ? "+" : ""}
                  {detail.inflowAcceleration}đ · {detail.buyTriggerStocksCount} mã tại điểm mua.
                </div>
                <div>
                  <strong className="text-text-primary">Ngắn hạn (1–2T):</strong> {detail.thesisByHorizonVi.SHORT_1_2W}
                </div>
                <div>
                  <strong className="text-text-primary">Trung hạn (3T–2Th):</strong> {detail.thesisByHorizonVi.MEDIUM_3W_2M}
                </div>
                <div>
                  <strong className="text-text-primary">Trung–Dài hạn (2–6Th):</strong> {detail.thesisByHorizonVi.MED_LONG_2_6M}
                </div>
                <div>
                  <strong className="text-text-primary">Dài hạn (&gt;6Th):</strong> {detail.thesisByHorizonVi.LONG_6M_PLUS}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border-subtle bg-background-secondary p-3 text-[11.5px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-text-primary">
                  <Flame className="size-4 text-up" />
                  Top cổ phiếu dẫn dắt ngành ({HORIZON_TABS.find((t) => t.id === horizon)?.label})
                </span>
                <span className="text-[10.5px] font-mono text-text-muted">
                  Smart Money: {detail.smartMoneyBreadthPct}% · VCP: {detail.vcpTightBreadthPct}%
                </span>
              </div>
              <div className="divide-y divide-border-subtle/50">
                {(detail.topPicksByHorizon[activeHorizonKey] ?? []).map((pick) => (
                  <Link
                    key={pick.symbol}
                    href={`/stocks/${encodeURIComponent(pick.symbol)}`}
                    className="flex items-center justify-between gap-2 py-2 hover:bg-surface-elevated/60 rounded px-1.5 -mx-1.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-primary">{pick.symbol}</span>
                        <span className="font-mono text-[11px] text-text-secondary">
                          {pick.price.toLocaleString("vi-VN")}
                        </span>
                        <Chg value={pick.changePercent} className="font-mono text-[11px]" />
                      </div>
                      <div className="text-[10.5px] text-text-muted">{pick.reasonVi}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="inline-flex items-center gap-1 font-bold text-up">
                        <TrendingUp className="size-3" />
                        {pick.horizonScore}đ
                      </div>
                      <div className="text-[10px] text-text-muted">{pick.turnoverBillion} tỷ</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
