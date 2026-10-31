"use client";

import "./bang-dien.css";
import { memo, useMemo, useState } from "react";
import { SectorCompareChart } from "@/components/stocks/sector-compare-chart";
import { SectorScrollRail, SectorColumnShell } from "@/components/stocks/sector-scroll-rail";
import { sectorOf, VN_SECTOR_MAP } from "@/lib/vn/master";
import type { IndexQuote, Quote } from "@/lib/types";
import { useApi } from "@/lib/hooks";
import { Chg, fmtCompact, fmtNum } from "@/components/ui";
import { BarChart2, ChevronDown, ChevronUp } from "lucide-react";

const PRIORITY_SECTORS = [
  "Ngân hàng",
  "Bất động sản",
  "Chứng khoán",
  "Thép",
  "Dầu khí",
  "Bán lẻ",
  "Bảo hiểm",
  "Công nghệ",
  "Thực phẩm & Đồ uống",
  "Điện lực",
  "Xây dựng & Vật liệu",
  "Hàng không & Vận tải",
];

const VN30_PROXY = new Set([
  "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
  "MBB", "MSN", "MWG", "PLX", "SAB", "SHB", "SSB", "SSI", "STB", "TCB",
  "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
]);

type IntelLite = {
  condition?: {
    score?: number;
    rating?: string;
    confidence?: string;
    drivers?: string[];
    risks?: string[];
  };
  breadth?: {
    advancers?: number;
    decliners?: number;
    unchanged?: number;
    available?: boolean;
  };
  flow?: {
    foreignNet?: number | null;
    propNet?: number | null;
    available?: boolean;
  };
  session?: { labelVi?: string; trading?: boolean };
};

function hitsBand(price: number | null | undefined, band: number | null | undefined): boolean {
  if (price == null || band == null || Number.isNaN(price) || Number.isNaN(band)) return false;
  return Math.abs(price - band) <= 0.051;
}

function pctLabel(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function rowTone(q: Quote): string {
  if (hitsBand(q.price, q.ceilingPrice)) return "bd-ceil";
  if (hitsBand(q.price, q.floorPrice)) return "bd-floor";
  const p = q.changePercent;
  if (p == null) return "bd-flat";
  if (p >= 2) return "bd-up-strong";
  if (p > 0.05) return "bd-up";
  if (p <= -2) return "bd-down-strong";
  if (p < -0.05) return "bd-down";
  return "bd-flat";
}

function ratingVi(r?: string): string {
  if (!r) return "Trung lập";
  const map: Record<string, string> = {
    BULLISH: "Tích cực",
    "MODERATELY BULLISH": "Hơi tích cực",
    NEUTRAL: "Trung lập",
    MIXED: "Trộn lẫn",
    "MODERATELY BEARISH": "Hơi tiêu cực",
    BEARISH: "Tiêu cực",
  };
  return map[r] ?? r;
}

function volumeImbalance(rows: Quote[]): {
  buyVol: number;
  sellVol: number;
  flatVol: number;
  imbalance: number | null;
} {
  let buyVol = 0;
  let sellVol = 0;
  let flatVol = 0;
  for (const q of rows) {
    const v = q.volume ?? 0;
    if (!v || !Number.isFinite(v)) continue;
    const p = q.changePercent;
    if (p == null) {
      flatVol += v;
      continue;
    }
    if (p > 0.05) buyVol += v;
    else if (p < -0.05) sellVol += v;
    else flatVol += v;
  }
  const tot = buyVol + sellVol;
  const imbalance = tot > 0 ? (buyVol - sellVol) / tot : null;
  return { buyVol, sellVol, flatVol, imbalance };
}

type SectorCol = {
  name: string;
  avgPct: number | null;
  rows: Quote[];
  imbalance: number | null;
  buyVol: number;
  sellVol: number;
  featured?: boolean;
};

function buildColumns(quotes: Quote[]): SectorCol[] {
  const bySym = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const vn30Rows = [...VN30_PROXY]
    .map((s) => bySym.get(s))
    .filter((q): q is Quote => Boolean(q))
    .sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
  const cols: SectorCol[] = [];
  const pushCol = (name: string, rows: Quote[], featured = false) => {
    // Featured (VN30) may show with a single liquid ticker during partial outages
    if (rows.length < (featured ? 1 : 2)) return;
    const sorted = [...rows].sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
    const withPct = sorted.filter((q) => q.changePercent != null);
    const avg = withPct.length
      ? withPct.reduce((s, q) => s + (q.changePercent ?? 0), 0) / withPct.length
      : null;
    const imb = volumeImbalance(sorted);
    cols.push({
      name,
      avgPct: avg,
      rows: sorted,
      imbalance: imb.imbalance,
      buyVol: imb.buyVol,
      sellVol: imb.sellVol,
      featured,
    });
  };
  if (vn30Rows.length) pushCol("VN30", vn30Rows, true);
  const sectorOrder = [
    ...PRIORITY_SECTORS,
    ...VN_SECTOR_MAP.map((s) => s.name).filter((n) => !PRIORITY_SECTORS.includes(n)),
  ];
  for (const name of sectorOrder) {
    if (cols.length >= 16) break;
    const rows = quotes
      .filter((q) => sectorOf(q.symbol) === name)
      .sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
    if (rows.length < 2) continue;
    const featured = PRIORITY_SECTORS.includes(name);
    pushCol(name, rows, featured);
  }
  return cols;
}

function SentimentGauge({ intel }: { intel: IntelLite | null | undefined }) {
  const score = intel?.condition?.score;
  const rating = intel?.condition?.rating;
  const conf = intel?.condition?.confidence;
  const breadth = intel?.breadth;
  const flow = intel?.flow;
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  const label = ratingVi(rating);
  const needle = s ?? 50;
  const tone = needle >= 62 ? "text-up" : needle <= 38 ? "text-down" : "text-amber-300";
  const denom =
    (breadth?.advancers ?? 0) + (breadth?.decliners ?? 0) + (breadth?.unchanged ?? 0);
  const buyPct = denom > 0 && breadth?.advancers != null ? (breadth.advancers / denom) * 100 : null;
  const sellPct = denom > 0 && breadth?.decliners != null ? (breadth.decliners / denom) * 100 : null;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[160px] flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Tâm lý thị trường</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`num text-[22px] font-bold tabular-nums ${tone}`}>{s != null ? Math.round(s) : "—"}</span>
            <span className={`text-[13px] font-semibold ${tone}`}>{label}</span>
            {conf ? <span className="text-[10px] text-text-muted">· tin cậy {conf}</span> : null}
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500">
            <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-surface-base shadow" style={{ left: `${needle}%` }} title={`Score ${needle}`} />
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-text-muted">
            <span>Bi quan</span><span>Trung tính</span><span>Lạc quan</span>
          </div>
        </div>
        <div className="grid min-w-[180px] flex-1 gap-1.5 sm:max-w-xs">
          <div>
            <div className="mb-0.5 flex justify-between text-[10px] text-text-muted">
              <span>Chờ mua <span className="text-up">{breadth?.advancers != null ? breadth.advancers : "?"}</span></span>
              <span>Chờ bán <span className="text-down">{breadth?.decliners != null ? breadth.decliners : "?"}</span></span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-base">
              <div className="bg-up/80 transition-all" style={{ width: `${buyPct ?? 33}%` }} />
              <div className="bg-amber-400/50 transition-all" style={{ width: `${Math.max(0, 100 - (buyPct ?? 33) - (sellPct ?? 33))}%` }} />
              <div className="bg-down/80 transition-all" style={{ width: `${sellPct ?? 33}%` }} />
            </div>
          </div>
          {flow?.available && (flow.foreignNet != null || flow.propNet != null) ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
              {flow.foreignNet != null ? (
                <span>Ngoại net <span className={flow.foreignNet >= 0 ? "text-up" : "text-down"}>{flow.foreignNet >= 0 ? "+" : ""}{fmtCompact(flow.foreignNet)}</span></span>
              ) : null}
              {flow.propNet != null ? (
                <span>Tự doanh <span className={flow.propNet >= 0 ? "text-up" : "text-down"}>{flow.propNet >= 0 ? "+" : ""}{fmtCompact(flow.propNet)}</span></span>
              ) : null}
            </div>
          ) : null}
          {intel?.condition?.drivers?.[0] ? (
            <p className="line-clamp-2 text-[10px] leading-snug text-text-secondary">{intel.condition.drivers[0]}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImbalanceBar({ imbalance, buyVol, sellVol, compact }: { imbalance: number | null; buyVol: number; sellVol: number; compact?: boolean }) {
  const tot = buyVol + sellVol;
  const buyPct = tot > 0 ? (buyVol / tot) * 100 : 50;
  const label = imbalance == null ? "—" : imbalance > 0.15 ? "Mua áp đảo" : imbalance < -0.15 ? "Bán áp đảo" : "Cân bằng";
  const tone = imbalance == null ? "text-text-muted" : imbalance > 0.15 ? "text-up" : imbalance < -0.15 ? "text-down" : "text-amber-300";
  return (
    <div className={compact ? "px-0 pt-1.5" : ""}>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[9px]">
        <span className={`truncate font-medium ${tone}`}>{label}</span>
        <span className="num shrink-0 text-text-muted">{tot > 0 ? `${buyPct.toFixed(0)}% mua` : ""}</span>
      </div>
      <div className="flex h-1 overflow-hidden rounded-full bg-surface-base/80">
        <div className="bg-up/70 transition-all" style={{ width: `${buyPct}%` }} />
        <div className="bg-down/70 transition-all" style={{ width: `${100 - buyPct}%` }} />
      </div>
    </div>
  );
}

function IndexStrip({
  indices,
  quotes,
  showAnalytics,
  onToggleAnalytics,
}: {
  indices: IndexQuote[];
  quotes: Quote[];
  showAnalytics: boolean;
  onToggleAnalytics: () => void;
}) {
  const list = indices.slice(0, 4);
  let up = 0, down = 0, flat = 0;
  for (const q of quotes) {
    const p = q.changePercent;
    if (p == null) continue;
    if (p > 0.05) up++; else if (p < -0.05) down++; else flat++;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-elevated/40 px-2.5 py-1.5 shadow-xs">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 divide-x divide-border-subtle/60 overflow-x-auto no-scrollbar">
        {list.map((idx, i) => (
          <div key={idx.code} className={`flex items-baseline gap-1.5 ${i > 0 ? "pl-2 sm:pl-3" : ""}`}>
            <span className="text-[11px] font-bold text-text-primary">{idx.code}</span>
            <span className="num text-[12px] font-semibold tabular-nums text-text-primary">{fmtNum(idx.value, 2)}</span>
            <Chg value={idx.changePercent} arrow={false} className="text-[10.5px] font-medium" />
          </div>
        ))}
        <div className="pl-2 sm:pl-3 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="text-up font-medium">▲ {up}</span>
          <span className="text-amber-300 font-medium">● {flat}</span>
          <span className="text-down font-medium">▼ {down}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleAnalytics}
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
          showAnalytics
            ? "bg-accent-primary/20 text-accent-primary font-semibold"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
        }`}
      >
        <BarChart2 className="size-3 text-accent-primary" />
        <span>{showAnalytics ? "Thu gọn phân tích" : "Tâm lý & So sánh ngành"}</span>
        {showAnalytics ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
    </div>
  );
}

const SectorColumn = memo(
  function SectorColumn({ col }: { col: SectorCol }) {
    const avgUp = (col.avgPct ?? 0) >= 0;
    const headerCls = avgUp ? "bd-col-head bd-col-head-up" : "bd-col-head bd-col-head-down";
    return (
      <div className={`bd-col${col.featured ? " bd-col-featured" : ""}`}>
        <div className={headerCls}>
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-[13px] font-bold leading-snug text-text-primary" title={col.name}>
              {col.name}
            </span>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={`num rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${avgUp ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
                {pctLabel(col.avgPct)}
              </span>
              <span className="text-[9px] font-medium text-text-muted">{col.rows.length} mã</span>
            </div>
          </div>
          <ImbalanceBar imbalance={col.imbalance} buyVol={col.buyVol} sellVol={col.sellVol} compact />
        </div>
        <div className="bd-col-labels">
          <span>Mã</span>
          <span className="text-right">Giá</span>
          <span className="text-right">+/-</span>
          <span className="text-right">KL</span>
        </div>
        <div className="bd-col-rows">
          {col.rows.map((q) => (
            <a key={q.symbol} href={`/stocks/${q.symbol}`} className={`bd-row ${rowTone(q)}`} title={`${q.symbol}${q.name ? ` · ${q.name}` : ""}`}>
              <span className="bd-sym">{q.symbol}</span>
              <span className="num text-right font-medium tabular-nums">{fmtNum(q.price, 2)}</span>
              <span className="num text-right font-semibold tabular-nums">{pctLabel(q.changePercent)}</span>
              <span className="num text-right text-[11px] opacity-80">{q.volume != null ? fmtCompact(q.volume) : "—"}</span>
            </a>
          ))}
        </div>
      </div>
    );
  },
  (prev, next) => {
    const a = prev.col;
    const b = next.col;
    if (a.name !== b.name || a.avgPct !== b.avgPct || a.imbalance !== b.imbalance || a.featured !== b.featured) return false;
    if (a.rows.length !== b.rows.length) return false;
    for (let i = 0; i < a.rows.length; i++) {
      const ra = a.rows[i]!;
      const rb = b.rows[i]!;
      if (ra.symbol !== rb.symbol || ra.price !== rb.price || ra.changePercent !== rb.changePercent || ra.volume !== rb.volume) {
        return false;
      }
    }
    return true;
  },
);

export function BangDienBoard({ quotes, indices }: { quotes: Quote[]; indices: IndexQuote[] }) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const { data: intel } = useApi<IntelLite>("/api/v1/market/intel", { refreshInterval: 60_000 });
  const columns = useMemo(() => buildColumns(quotes), [quotes]);
  const fallbackIntel = useMemo((): IntelLite | null => {
    if (intel?.condition?.score != null) return intel;
    let up = 0, down = 0, flat = 0;
    for (const q of quotes) {
      const p = q.changePercent;
      if (p == null) continue;
      if (p > 0.05) up++; else if (p < -0.05) down++; else flat++;
    }
    const tot = up + down + flat;
    if (!tot) return intel ?? null;
    const ratio = (up - down) / tot;
    const score = Math.round(50 + ratio * 50);
    return {
      ...intel,
      condition: {
        score,
        rating: score >= 68 ? "BULLISH" : score >= 57 ? "MODERATELY BULLISH" : score > 43 ? "NEUTRAL" : score > 32 ? "MODERATELY BEARISH" : "BEARISH",
        confidence: "LOW",
        drivers: ["Ước lượng từ độ rộng bảng giá (thiếu market-intel đầy đủ)."],
      },
      breadth: { advancers: up, decliners: down, unchanged: flat, available: true },
    };
  }, [intel, quotes]);

  if (!quotes.length) {
    return (
      <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-4 text-center text-[12px] text-amber-100/90">
        Bảng điện đang kết nối lại nguồn giá Orca Data Stream. Dữ liệu sẽ hiện lại tự động.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* 1. Dải chỉ số thị trường thanh mảnh + Nút mở rộng phân tích */}
      <IndexStrip
        indices={indices}
        quotes={quotes}
        showAnalytics={showAnalytics}
        onToggleAnalytics={() => setShowAnalytics((v) => !v)}
      />

      {/* 2. Khối phân tích tâm lý & bản đồ so sánh ngành (Mặc định thu gọn để ưu tiên bảng giá cổ phiếu) */}
      {showAnalytics && (
        <div className="grid gap-2.5 lg:grid-cols-2 pt-0.5 pb-1 animate-fadeIn">
          <SentimentGauge intel={fallbackIntel} />
          <SectorCompareChart cols={columns} />
        </div>
      )}

      {/* 3. BẢNG ĐIỆN CỔ PHIẾU THEO NGÀNH (TRỌNG TÂM TRỰC TIẾP TRÊN TOÀN KHUNG HÌNH) */}
      <SectorScrollRail itemCount={columns.length}>
        {columns.map((col) => (
          <SectorColumnShell key={col.name}>
            <SectorColumn col={col} />
          </SectorColumnShell>
        ))}
      </SectorScrollRail>
    </div>
  );
}
