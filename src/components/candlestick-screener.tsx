"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { Badge, Chg, fmtNum, FreshnessDot, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import { DarkSelect } from "@/components/dark-select";
import { Play } from "@/components/screener-icons";

type PatternHit = {
  name: string;
  nameVi: string;
  type: "bullish" | "bearish" | "neutral";
  category: string;
  reliability: string;
  score: number;
  candles?: number;
  description?: string;
  confirmation?: string;
  volumeConfirmed: boolean;
  ageBars?: number;
};

type CandleTradeSetup = {
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: number;
  riskPercent: number;
  rewardPercent: number;
  setupQuality: "A+" | "A" | "B";
};

type CandleTechConfluence = {
  rsi14: number | null;
  atLowerBb: boolean;
  volClimax: boolean;
  volDryUp: boolean;
  rsiBullishDiv: boolean;
  distTo20dLowPct: number | null;
};

type CandleRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  patterns: PatternHit[];
  topPattern?: PatternHit | null;
  bestScore?: number;
  bestPattern?: PatternHit | null;
  alertWorthy: boolean;
  tradeSetup?: CandleTradeSetup | null;
  techConfluence?: CandleTechConfluence | null;
};

type ScreenPayload = {
  rows: CandleRow[];
  scanned: number;
  skipped: number;
  meta?: { freshness?: string; ageMs?: number; note?: string };
};

const CATEGORIES = [
  { id: "all", label: "Tất cả nhóm" },
  { id: "bullish_reversal", label: "Đảo chiều tăng (Đáy)" },
  { id: "bearish_reversal", label: "Đảo chiều giảm (Đỉnh)" },
  { id: "continuation", label: "Tiếp diễn" },
  { id: "neutral", label: "Trung tính" },
] as const;

type PresetKey = "all" | "bottom_a_plus" | "confirmed_reversal" | "rebound";

export function CandlestickScreener({ defaultSector }: { defaultSector?: string | null }) {
  const [preset, setPreset] = useState<PresetKey>("bottom_a_plus");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [category, setCategory] = useState("bullish_reversal");
  const [minScore, setMinScore] = useState("65");
  const [volumeOnly, setVolumeOnly] = useState(false);
  const [reversalOnly, setReversalOnly] = useState(true);
  const [bottomConfluenceOnly, setBottomConfluenceOnly] = useState(true);
  const [qualityOnly, setQualityOnly] = useState<"all" | "A+" | "A">("all");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  const applyPreset = useCallback((p: PresetKey) => {
    setPreset(p);
    if (p === "bottom_a_plus") {
      setCategory("bullish_reversal");
      setMinScore("65");
      setReversalOnly(true);
      setBottomConfluenceOnly(true);
      setVolumeOnly(false);
      setQualityOnly("all");
    } else if (p === "confirmed_reversal") {
      setCategory("bullish_reversal");
      setMinScore("60");
      setReversalOnly(true);
      setBottomConfluenceOnly(false);
      setVolumeOnly(false);
      setQualityOnly("all");
    } else if (p === "rebound") {
      setCategory("bullish_reversal");
      setMinScore("55");
      setReversalOnly(true);
      setVolumeOnly(true);
      setBottomConfluenceOnly(false);
      setQualityOnly("all");
    } else {
      setCategory("all");
      setMinScore("50");
      setReversalOnly(false);
      setBottomConfluenceOnly(false);
      setVolumeOnly(false);
      setQualityOnly("all");
    }
  }, []);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (sector) p.set("sector", sector);
    if (category !== "all") p.set("category", category);
    if (minScore) p.set("minScore", minScore);
    if (volumeOnly) p.set("volumeOnly", "1");
    if (reversalOnly) p.set("reversalOnly", "1");
    if (bottomConfluenceOnly) p.set("bottomConfluenceOnly", "1");
    if (qualityOnly !== "all") p.set("qualityOnly", qualityOnly);
    p.set("limit", "50");
    return p.toString();
  }, [sector, category, minScore, volumeOnly, reversalOnly, bottomConfluenceOnly, qualityOnly]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenPayload>(
    `/api/v1/screener/candlestick?${qs}`,
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
        title="Screener mẫu nến chưa sẵn sàng"
        note={res && !res.success ? res.error.message : "Thử lại sau vài giây"}
      />
    );
  }

  return (
    <>
      <Panel title="Bộ lọc mẫu hình nến & Điểm bắt đáy" pad={false}>
        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line/40 px-3 py-2 bg-surface-elevated/20">
          <span className="text-[11px] font-semibold text-text-muted mr-1">Chiến lược mẫu hình:</span>
          <button
            type="button"
            onClick={() => applyPreset("bottom_a_plus")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              preset === "bottom_a_plus"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            🌟 Săn Đáy A+ (Hợp lưu cao)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("confirmed_reversal")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              preset === "confirmed_reversal"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            🛡️ Đáy xác nhận (3-Bar)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("rebound")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              preset === "rebound"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm"
                : "bg-surface-elevated text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            ⚡ Bắt rút chân (Búa/Nhíp)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              preset === "all"
                ? "bg-surface-elevated text-text-primary border border-line"
                : "bg-surface-elevated/40 text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            Tất cả mẫu hình
          </button>
        </div>

        {/* Detailed Controls */}
        <div className="flex flex-wrap items-end gap-2.5 p-3">
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
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Nhóm mẫu</span>
            <DarkSelect
              value={category}
              onChange={setCategory}
              className="!w-44"
              options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
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
              checked={bottomConfluenceOnly}
              onChange={(e) => setBottomConfluenceOnly(e.target.checked)}
              className="rounded"
            />
            Hợp lưu đáy (BB/Div/Vol)
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[11.5px] cursor-pointer text-text-secondary select-none">
            <input
              type="checkbox"
              checked={volumeOnly}
              onChange={(e) => setVolumeOnly(e.target.checked)}
              className="rounded"
            />
            Có Volume
          </label>
          <button
            type="button"
            onClick={run}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-white transition ${
              pressed ? "scale-95 bg-accent-primary" : "bg-accent-primary/90 hover:bg-accent-primary"
            }`}
          >
            <Play className="size-3.5" />
            {isValidating ? "Đang quét…" : "Quét mẫu nến"}
          </button>
        </div>
      </Panel>

      <Panel
        title={
          <span>
            Kết quả: <strong className="text-text-primary font-semibold">{rows.length}</strong> mã phát hiện
            {data ? ` · quét ${data.scanned}` : ""}
            <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
            {isValidating ? <span className="ml-1.5 text-[10px] text-accent-primary">· đang cập nhật</span> : null}
          </span>
        }
        pad={false}
      >
        {rows.length === 0 ? (
          <div className="px-3.5 py-8 text-center text-[13px] text-text-muted">
            Không tìm thấy mã nào thỏa mãn điều kiện. Hãy thử nới lỏng “Điểm min” hoặc bỏ chọn “Hợp lưu đáy”.
            {data?.skipped ? <div className="mt-1 text-[11px]">Đã bỏ qua {data.skipped} mã thiếu nến lịch sử.</div> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-3.5 py-2 font-medium">Mã CK</th>
                  <th className="py-2 font-medium">Mẫu hình đảo chiều</th>
                  <th className="py-2 font-medium">Kế hoạch Giao dịch (R:R)</th>
                  <th className="py-2 text-right font-medium">Điểm</th>
                  <th className="py-2 text-right font-medium">Giá</th>
                  <th className="py-2 pr-3.5 text-right font-medium">± %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pat = row.topPattern ?? row.bestPattern ?? row.patterns[0];
                  const score = pat?.score ?? row.bestScore ?? 0;
                  const setup = row.tradeSetup;
                  const conf = row.techConfluence;
                  const isExpanded = expandedSymbol === row.symbol;

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
                          {setup?.setupQuality === "A+" && (
                            <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 text-[9.5px] font-bold">
                              A+
                            </span>
                          )}
                          {setup?.setupQuality === "A" && (
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

                      {/* Mẫu nến & Confluence Chips */}
                      <td className="py-2.5 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`font-semibold text-[12px] ${
                              pat?.type === "bullish"
                                ? "text-bull"
                                : pat?.type === "bearish"
                                  ? "text-bear"
                                  : "text-text-primary"
                            }`}
                          >
                            {pat?.nameVi ?? pat?.name ?? "—"}
                          </span>
                          {pat?.candles ? (
                            <span className="text-[10px] text-text-muted bg-surface-elevated px-1 py-0.2 rounded border border-line/40">
                              {pat.candles} cây
                            </span>
                          ) : null}
                          {pat?.ageBars === 0 ? (
                            <span className="text-[9.5px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-medium">
                              T+0
                            </span>
                          ) : pat?.ageBars != null ? (
                            <span className="text-[9.5px] text-text-muted bg-surface-elevated px-1 py-0.2 rounded">
                              T-{pat.ageBars}
                            </span>
                          ) : null}
                        </div>

                        {/* Confluence Badges */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {conf?.rsiBullishDiv && (
                            <span className="rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1 py-0.2 text-[9px] font-medium">
                              ✦ RSI Phân kỳ
                            </span>
                          )}
                          {conf?.atLowerBb && (
                            <span className="rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-1 py-0.2 text-[9px] font-medium">
                              ✦ Chạm BB Dưới
                            </span>
                          )}
                          {conf?.volClimax && (
                            <span className="rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 px-1 py-0.2 text-[9px] font-medium">
                              ✦ Vol Gom Hàng
                            </span>
                          )}
                          {conf?.volDryUp && (
                            <span className="rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 px-1 py-0.2 text-[9px] font-medium">
                              ✦ Cạn Kiệt Cung
                            </span>
                          )}
                          {conf?.distTo20dLowPct != null && conf.distTo20dLowPct <= 3.5 && (
                            <span className="rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 px-1 py-0.2 text-[9px] font-medium">
                              ✦ Đáy 20P (+{conf.distTo20dLowPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>

                        {/* Expandable confirmation */}
                        {isExpanded && pat?.confirmation && (
                          <div className="mt-1.5 text-[10.5px] text-text-secondary bg-surface-elevated/60 p-1.5 rounded border border-line/40">
                            <strong>Xác nhận:</strong> {pat.confirmation}
                            {pat.description && <div className="text-text-muted mt-0.5">{pat.description}</div>}
                          </div>
                        )}
                      </td>

                      {/* Setup Giao dịch (R:R) */}
                      <td className="py-2.5 align-top text-[11px]">
                        {setup ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-text-muted">SL:</span>
                              <span className="text-rose-400 font-medium">{fmtNum(setup.stopLoss, 2)}</span>
                              <span className="text-[10px] text-rose-400/80">(-{setup.riskPercent}%)</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-text-muted">TP1:</span>
                              <span className="text-emerald-400 font-medium">{fmtNum(setup.target1, 2)}</span>
                              <span className="text-[10px] text-emerald-400/80">(+{setup.rewardPercent}%)</span>
                              <span
                                className={`ml-auto font-bold px-1.5 py-0.2 rounded text-[10px] ${
                                  setup.riskReward >= 2.0
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : "bg-surface-elevated text-text-secondary"
                                }`}
                              >
                                R:R 1:{setup.riskReward}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      {/* Điểm số */}
                      <td className="num py-2.5 text-right align-top">
                        <span
                          className={`font-bold text-[13px] ${
                            score >= 75
                              ? "text-emerald-400"
                              : score >= 65
                                ? "text-cyan-400"
                                : "text-amber-400"
                          }`}
                        >
                          {score}
                        </span>
                      </td>

                      {/* Giá */}
                      <td className="num py-2.5 text-right align-top font-medium text-[12px]">
                        {fmtNum(row.price, 2)}
                      </td>

                      {/* Thay đổi % */}
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
            💡 Gợi ý: Click vào từng dòng để xem hướng dẫn nến xác nhận và điều kiện vào lệnh.
          </p>
        </div>
      </Panel>
    </>
  );
}
