"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { Badge, Chg, fmtNum, FreshnessDot, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import { DarkSelect } from "@/components/dark-select";
import { Play } from "@/components/screener-icons";
import type { MaCandleConfluenceRow } from "@/lib/services/ma-candle-confluence-screener";

type ScreenPayload = {
  rows: MaCandleConfluenceRow[];
  scanned: number;
  skipped: number;
  meta?: { freshness?: string; ageMs?: number; note?: string };
};

const SCENARIOS = [
  { id: "all", label: "Tất cả kịch bản" },
  { id: "ma50_bounce", label: "🛡️ Nảy hỗ trợ MA50 (Tổ chức)" },
  { id: "ma20_bounce", label: "🎯 Nảy hỗ trợ MA20 (Sóng ngắn)" },
  { id: "ma200_reclaim", label: "👑 Lấy lại MA200 (Thoát đáy)" },
  { id: "golden_cross_confirm", label: "⚡ Xác nhận Golden Cross" },
  { id: "ma_squeeze_breakout", label: "🌀 Nén chặt MA bung nổ" },
  { id: "trend_pullback", label: "📈 Retest Kênh Tăng" },
] as const;

export function MaCandleConfluenceScreener({ defaultSector }: { defaultSector?: string | null }) {
  const [scenario, setScenario] = useState("all");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [minScore, setMinScore] = useState("60");
  const [qualityOnly, setQualityOnly] = useState<"all" | "A+" | "A">("all");
  const [volumeOnly, setVolumeOnly] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  const applyPreset = useCallback((scen: string, score: string) => {
    setScenario(scen);
    setMinScore(score);
    if (scen === "all") {
      setVolumeOnly(false);
      setQualityOnly("all");
    }
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (scenario !== "all") p.set("scenario", scenario);
    if (sector) p.set("sector", sector);
    if (minScore) p.set("minScore", minScore);
    if (qualityOnly !== "all") p.set("qualityOnly", qualityOnly);
    if (volumeOnly) p.set("volumeOnly", "1");
    p.set("limit", "50");
    return p.toString();
  }, [scenario, sector, minScore, qualityOnly, volumeOnly]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenPayload>(
    `/api/v1/screener/ma-candle-confluence?${qs}`,
    { refreshInterval: 90_000, timeoutMs: 90_000 },
  );

  const run = useCallback(() => {
    setPressed(true);
    void mutate();
    window.setTimeout(() => setPressed(false), 180);
  }, [mutate]);

  const rows = data?.rows ?? [];

  if (isLoading && !res) return <Loading rows={8} />;

  if (!res?.success && !data) {
    return (
      <Unavailable
        title="Screener Hợp Lưu MA & Nến chưa sẵn sàng"
        note={res && !res.success ? res.error.message : "Thử lại sau vài giây"}
      />
    );
  }

  return (
    <>
      <Panel title="Bộ lọc Hợp Lưu Đường MA & Nến Đảo Chiều (MA-Candle Confluence)" pad={false}>
        {/* Quick Presets Bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line/40 px-3 py-2 bg-surface-elevated/20">
          <span className="text-[11px] font-semibold text-text-muted mr-1">Chiến lược Hợp lưu:</span>
          <button
            type="button"
            onClick={() => applyPreset("ma50_bounce", "65")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "ma50_bounce"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            🛡️ Nảy MA50 Tổ chức
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ma20_bounce", "60")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "ma20_bounce"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            🎯 Nảy MA20 Sóng tăng
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ma200_reclaim", "65")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "ma200_reclaim"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            👑 Lấy lại MA200
          </button>
          <button
            type="button"
            onClick={() => applyPreset("golden_cross_confirm", "65")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "golden_cross_confirm"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            ⚡ Golden Cross + Nến nổ
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ma_squeeze_breakout", "60")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "ma_squeeze_breakout"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            🌀 Nén MA Bung Nổ
          </button>
          <button
            type="button"
            onClick={() => applyPreset("all", "55")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === "all"
                ? "bg-surface-elevated text-text-primary border border-line"
                : "bg-surface-elevated/40 text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            Tất cả hợp lưu
          </button>
        </div>

        {/* Detailed Controls */}
        <div className="flex flex-wrap items-end gap-2.5 p-3">
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Kịch bản</span>
            <DarkSelect
              value={scenario}
              onChange={setScenario}
              className="!w-48"
              options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
            />
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Ngành</span>
            <DarkSelect
              value={sector}
              onChange={setSector}
              className="!w-36"
              options={[{ value: "", label: "Tất cả" }, ...VN_SECTOR_MAP.map((s) => ({ value: s.name, label: s.name }))]}
            />
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Chất lượng</span>
            <DarkSelect
              value={qualityOnly}
              onChange={(v) => setQualityOnly(v as "all" | "A+" | "A")}
              className="!w-24"
              options={[
                { value: "all", label: "Tất cả" },
                { value: "A+", label: "Chỉ A+" },
                { value: "A", label: "A+ & A" },
              ]}
            />
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Điểm min</span>
            <input
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="input !w-16 !py-1.5 text-[12px] text-center"
              inputMode="numeric"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[11.5px] cursor-pointer text-text-secondary select-none">
            <input
              type="checkbox"
              checked={volumeOnly}
              onChange={(e) => setVolumeOnly(e.target.checked)}
              className="rounded"
            />
            Có Volume xác nhận
          </label>
          <button
            type="button"
            onClick={run}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-white transition ${
              pressed ? "scale-95 bg-accent-primary" : "bg-accent-primary/90 hover:bg-accent-primary"
            }`}
          >
            <Play className="size-3.5" />
            {isValidating ? "Đang quét…" : "Quét hợp lưu"}
          </button>
        </div>
      </Panel>

      <Panel
        title={
          <span>
            Hợp lưu MA & Nến: <strong className="text-text-primary font-semibold">{rows.length}</strong> mã đạt chuẩn
            {data ? ` · quét ${data.scanned}` : ""}
            <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
            {isValidating ? <span className="ml-1.5 text-[10px] text-accent-primary">· đang cập nhật</span> : null}
          </span>
        }
        pad={false}
      >
        {rows.length === 0 ? (
          <div className="px-3.5 py-8 text-center text-[13px] text-text-muted">
            Không tìm thấy mã nào thỏa mãn điều kiện hợp lưu. Hãy thử nới lỏng “Điểm min” hoặc chọn kịch bản “Tất cả hợp lưu”.
            {data?.skipped ? <div className="mt-1 text-[11px]">Đã bỏ qua {data.skipped} mã thiếu nến lịch sử.</div> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-3.5 py-2 font-medium">Mã CK</th>
                  <th className="py-2 font-medium">Kịch bản Hợp lưu MA</th>
                  <th className="py-2 font-medium">Mẫu nến kích hoạt</th>
                  <th className="py-2 font-medium">Kế hoạch Giao dịch (R:R)</th>
                  <th className="py-2 text-right font-medium">Điểm</th>
                  <th className="py-2 text-right font-medium">Giá</th>
                  <th className="py-2 pr-3.5 text-right font-medium">± %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedSymbol === row.symbol;

                  const badgeColors = {
                    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
                    purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
                    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                    cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
                  };

                  return (
                    <tr
                      key={row.symbol}
                      onClick={() => setExpandedSymbol(isExpanded ? null : row.symbol)}
                      className="row-hover border-b border-line/40 cursor-pointer transition-colors"
                    >
                      {/* Mã & Ngành */}
                      <td className="px-3.5 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/stocks/${row.symbol}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold text-text-primary hover:text-accent-primary transition-colors text-[13px]"
                          >
                            {row.symbol}
                          </Link>
                          {row.setupQuality === "A+" && (
                            <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 text-[9.5px] font-bold">
                              A+
                            </span>
                          )}
                          {row.setupQuality === "A" && (
                            <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 text-[9.5px] font-semibold">
                              A
                            </span>
                          )}
                          {row.alertWorthy && <Badge tone="bull">Alert</Badge>}
                        </div>
                        <div className="text-[10.5px] text-text-muted truncate max-w-[120px]">
                          {row.sector ?? row.name ?? "—"}
                        </div>
                      </td>

                      {/* Kịch bản Hợp lưu MA */}
                      <td className="py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${
                              badgeColors[row.scenarioBadgeTone]
                            }`}
                          >
                            {row.scenarioLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
                          <span>Neo: <strong className="text-text-secondary">{row.anchorMa}</strong> ({fmtNum(row.anchorMaPrice, 2)})</span>
                          {row.distToMaPct != null && (
                            <span>Cách MA: <strong className={row.distToMaPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                              {row.distToMaPct >= 0 ? `+${row.distToMaPct}%` : `${row.distToMaPct}%`}
                            </strong></span>
                          )}
                        </div>
                      </td>

                      {/* Mẫu nến kích hoạt */}
                      <td className="py-2.5 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-bull text-[12px]">
                            {row.candleNameVi}
                          </span>
                          {row.topPattern.candles ? (
                            <span className="text-[10px] text-text-muted bg-surface-elevated px-1 py-0.2 rounded border border-line/40">
                              {row.topPattern.candles} cây
                            </span>
                          ) : null}
                          {row.patternAgeBars === 0 ? (
                            <span className="text-[9.5px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-medium">
                              T+0
                            </span>
                          ) : (
                            <span className="text-[9.5px] text-text-muted bg-surface-elevated px-1 py-0.2 rounded">
                              T-{row.patternAgeBars}
                            </span>
                          )}
                        </div>

                        {/* Confluence Tags */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {row.confluenceTags.map((tag, i) => (
                            <span
                              key={i}
                              className="rounded bg-surface-elevated text-text-secondary border border-line/50 px-1 py-0.2 text-[9px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Expandable info */}
                        {isExpanded && row.confirmation && (
                          <div className="mt-1.5 text-[10.5px] text-text-secondary bg-surface-elevated/60 p-1.5 rounded border border-line/40">
                            <strong>Điều kiện xác nhận:</strong> {row.confirmation}
                          </div>
                        )}
                      </td>

                      {/* Kế hoạch Giao dịch (R:R) */}
                      <td className="py-2.5 align-top text-[11px]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-text-muted">SL ({row.stopLossType === "BELOW_MA" ? "Dưới MA" : "Đáy nến"}):</span>
                            <span className="text-rose-400 font-medium">{fmtNum(row.stopLoss, 2)}</span>
                            <span className="text-[10px] text-rose-400/80">(-{row.riskPercent}%)</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-text-muted">TP1:</span>
                            <span className="text-emerald-400 font-medium">{fmtNum(row.target1, 2)}</span>
                            <span className="text-[10px] text-emerald-400/80">(+{row.rewardPercent}%)</span>
                            <span
                              className={`ml-auto font-bold px-1.5 py-0.2 rounded text-[10px] ${
                                row.riskReward >= 2.0
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-surface-elevated text-text-secondary"
                              }`}
                            >
                              R:R 1:{row.riskReward}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Điểm Hợp lưu */}
                      <td className="num py-2.5 text-right align-top">
                        <span
                          className={`font-bold text-[13px] ${
                            row.confluenceScore >= 80
                              ? "text-emerald-400"
                              : row.confluenceScore >= 70
                                ? "text-cyan-400"
                                : "text-amber-400"
                          }`}
                        >
                          {row.confluenceScore}
                        </span>
                      </td>

                      {/* Giá */}
                      <td className="num py-2.5 text-right align-top font-medium text-[12px]">
                        {fmtNum(row.price, 2)}
                      </td>

                      {/* ± % */}
                      <td className="py-2.5 pr-3.5 text-right align-top">
                        <Chg value={row.changePercent} arrow={false} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <MetaLine meta={meta ?? data?.meta} />
          <p className="text-[10.5px] text-text-muted">
            💡 Gợi ý: Hợp lưu MA và Nến đảo chiều cung cấp điểm vào lệnh chuẩn xác tại các ngưỡng hỗ trợ của dòng tiền lớn.
          </p>
        </div>
      </Panel>
    </>
  );
}
