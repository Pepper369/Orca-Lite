"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import type { CryptoMarketRow, IndexQuote } from "@/lib/types";
import {
  Badge,
  Chg,
  fmtCompact,
  fmtNum,
  FreshnessDot,
  Loading,
  MetaLine,
  Panel,
  priceDigits,
} from "@/components/ui";
import {
  SlidersHorizontal,
  Download,
  Search,
  TrendingUp,
  ShieldCheck,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
  LayoutGrid,
  List,
  Bookmark,
  Plus,
  Trash2,
  Layers,
} from "lucide-react";
import { ScreenerMiniChart } from "@/components/screener-mini-chart";
import {
  CustomScreenerBuilder,
  loadCustomPresets,
  removeCustomPreset,
  type CustomScreenerPreset,
} from "@/components/custom-screener-builder";
import type {
  ScreenerPreset,
  ScreenerStockItem,
  ScreenerResponseData,
} from "@/lib/services/screener-snapshot-service";

export function Field({
  label,
  value,
  onChange,
  small,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input text-[12px] ${small ? "!w-24 !py-1.5" : "!w-28 !py-1.5"}`}
        inputMode="decimal"
      />
    </label>
  );
}

type ViewTab =
  | "overview"
  | "orca_master"
  | "smart_money"
  | "buy_point"
  | "quant"
  | "confluence"
  | "technical"
  | "valuation"
  | "profitability"
  | "health";

export function OrcaMasterBadge({
  score,
  category,
  strengthVi,
}: {
  score?: number | null;
  category?: string | null;
  strengthVi?: string | null;
}) {
  if (score == null || isNaN(score)) return <span className="text-[10px] text-text-muted">—</span>;

  let colorClass = "bg-surface-base text-text-muted border-border-subtle";
  let dotClass = "bg-text-muted";

  if (score >= 90) {
    colorClass = "bg-amber-500/15 text-amber-300 border-amber-400/40 font-bold";
    dotClass = "bg-amber-400";
  } else if (score >= 80) {
    colorClass = "bg-cyan-500/15 text-cyan-300 border-cyan-400/35 font-semibold";
    dotClass = "bg-cyan-400";
  } else if (score >= 60) {
    colorClass = "bg-blue-500/15 text-blue-300 border-blue-500/30 font-medium";
    dotClass = "bg-blue-400";
  } else if (score < 40) {
    colorClass = "bg-rose-500/15 text-rose-300 border-rose-500/30";
    dotClass = "bg-rose-400";
  }

  return (
    <span
      title={`Orca Master Composite Rating: ${score}/99 (${category ?? ""})${strengthVi ? ` · Trụ cột: ${strengthVi}` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] whitespace-nowrap num tracking-tight ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>Master {score}</span>
    </span>
  );
}

export function HistoricalEdgeBadgeComponent({
  score,
  badge,
  winRate,
  upDownVol,
}: {
  score?: number | null;
  badge?: string | null;
  winRate?: number | null;
  upDownVol?: number | null;
}) {
  if (score == null || isNaN(score)) return null;
  const isHigh = badge === "HIGH_EDGE" || score >= 75;
  const isPositive = badge === "POSITIVE_EDGE" || (score >= 60 && score < 75);
  const isWarning = badge === "HIGH_FAKEOUT_RISK" || score < 45;

  let colorClass = "bg-surface-base text-text-muted border-border-subtle";
  let dotClass = "bg-text-muted";
  let label = "Edge";

  if (isHigh) {
    colorClass = "bg-emerald-500/15 text-emerald-300 border-emerald-400/40 font-bold";
    dotClass = "bg-emerald-400";
    label = "Edge Cao";
  } else if (isPositive) {
    colorClass = "bg-sky-500/15 text-sky-300 border-sky-400/35 font-semibold";
    dotClass = "bg-sky-400";
    label = "Edge +";
  } else if (isWarning) {
    colorClass = "bg-rose-500/15 text-rose-300 border-rose-500/30";
    dotClass = "bg-rose-400";
    label = "Bẫy Giá";
  }

  return (
    <span
      title={`Điểm lợi thế thực nghiệm lịch sử: ${score}/100${winRate != null ? ` · Tỷ lệ thắng setup quá khứ: ${winRate}%` : ""}${upDownVol != null ? ` · Up/Down Vol: ${upDownVol}x` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] whitespace-nowrap num tracking-tight ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>{label} {score}</span>
      {winRate != null && winRate >= 60 && (
        <span className="text-[9px] opacity-80 font-normal">({winRate}%)</span>
      )}
    </span>
  );
}

export function BuyTriggerBadge({
  isTriggerNow,
  score,
  reasonVi,
}: {
  isTriggerNow?: boolean | null;
  score?: number | null;
  reasonVi?: string | null;
}) {
  if (!isTriggerNow) return null;

  return (
    <span
      title={`Điểm Mua Kích Hoạt Tức Thời: ${score ? `${score}/100đ` : "Kích hoạt"}${reasonVi ? ` · ${reasonVi}` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-xs tracking-tight"
    >
      <span className="relative flex size-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
      </span>
      <span>⚡ MUA NGAY</span>
      {score != null && (
        <span className="rounded bg-emerald-500/30 px-1 py-0.2 text-[9px] text-emerald-200 num">
          {score}
        </span>
      )}
    </span>
  );
}

export function ApexQuantBadgeComponent({
  score,
  category,
  categoryVi,
  reversalStageVi,
  isSweetLaunchZone,
  extensionFromBottomPct,
}: {
  score?: number | null;
  category?: string | null;
  categoryVi?: string | null;
  reversalStageVi?: string | null;
  isSweetLaunchZone?: boolean | null;
  extensionFromBottomPct?: number | null;
}) {
  if (score == null || isNaN(score)) return null;

  const isSuper = category === "APEX_SUPER_LEADER" || score >= 85;
  const isLeader = category === "APEX_LEADER" || (score >= 70 && score < 85);
  const isCandidate = category === "APEX_CANDIDATE" || (score >= 55 && score < 70);

  let colorClass = "bg-surface-base text-text-muted border-border-subtle";
  let dotClass = "bg-text-muted";
  let label = "Apex";

  if (isSuper) {
    colorClass = "bg-amber-500/20 text-amber-200 border-amber-400/50 font-bold shadow-xs";
    dotClass = "bg-amber-400 animate-pulse";
    label = "Chân Sóng";
  } else if (isLeader) {
    colorClass = "bg-emerald-500/15 text-emerald-300 border-emerald-400/40 font-semibold";
    dotClass = "bg-emerald-400";
    label = "Chân Sóng";
  } else if (isCandidate) {
    colorClass = "bg-cyan-500/15 text-cyan-300 border-cyan-400/35 font-medium";
    dotClass = "bg-cyan-400";
    label = "Apex";
  }

  return (
    <span
      title={`Chân Sóng Apex: ${score}/100${categoryVi ? ` · ${categoryVi}` : ""}${reversalStageVi ? ` · Trạng thái: ${reversalStageVi}` : ""}${extensionFromBottomPct != null ? ` · Cách đáy: ${extensionFromBottomPct > 0 ? "+" : ""}${extensionFromBottomPct}%` : ""}${isSweetLaunchZone ? " · Vùng Vàng Sweet Launch Zone" : ""}`}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] whitespace-nowrap num tracking-tight ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>{label} {score}</span>
      {isSweetLaunchZone && (
        <span className="text-[9px] text-amber-300 font-bold ml-0.5">Vùng Vàng</span>
      )}
    </span>
  );
}

export function SmartMoneyBadge({
  signal,
  signalVi,
  score,
  activeBuyRatioPct,
}: {
  signal?: string | null;
  signalVi?: string | null;
  score?: number | null;
  activeBuyRatioPct?: number | null;
}) {
  if (!signal || signal === "NEUTRAL") {
    if (activeBuyRatioPct != null) {
      return (
        <span className="text-[10px] text-text-muted num">
          Mua CĐ {activeBuyRatioPct}%
        </span>
      );
    }
    return <span className="text-[10px] text-text-muted">—</span>;
  }

  if (signal === "HEAVY_ACCUMULATION") {
    return (
      <span
        title={`Cá mập gom mạnh: Mua chủ động ${activeBuyRatioPct ?? ""}%`}
        className="inline-flex items-center gap-1.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/40 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-xs"
      >
        <span className="size-1.5 rounded-full bg-purple-400" />
        <span>Cá Mập Gom {activeBuyRatioPct ? `(${activeBuyRatioPct}%)` : ""}</span>
      </span>
    );
  }

  if (signal === "POCKET_PIVOT") {
    return (
      <span
        title="Pocket Pivot: Dòng tiền lớn bùng nổ vol sớm trong nền giá"
        className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span>Pocket Pivot</span>
      </span>
    );
  }

  if (signal === "SPRING_ABSORPTION") {
    return (
      <span
        title="Wyckoff Spring: Rũ bỏ cạn cung test thành công"
        className="inline-flex items-center gap-1.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-cyan-400" />
        <span>Wyckoff Spring</span>
      </span>
    );
  }

  if (signal === "FOREIGN_NET_BUY") {
    return (
      <span
        title="Khối ngoại mua ròng liên tục"
        className="inline-flex items-center gap-1.5 rounded bg-blue-500/15 text-blue-200 border border-blue-400/30 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-blue-400" />
        <span>Khối Ngoại Gom</span>
      </span>
    );
  }

  if (signal === "DISTRIBUTION") {
    return (
      <span
        title="Áp lực bán chủ động lớn / phân phối"
        className="inline-flex items-center gap-1.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-rose-400" />
        <span>Phân Phối</span>
      </span>
    );
  }

  return (
    <span className="text-[10px] text-text-muted">
      {signalVi ?? "—"}
    </span>
  );
}

export function QuantBadge({
  badge,
  score,
}: {
  badge: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL" | string | null | undefined;
  score?: number | null;
}) {
  if (badge === "SUPER_QUANT") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-bold text-cyan-300 whitespace-nowrap shadow-sm">
        <Zap className="size-3 text-cyan-300" /> SIÊU QUANT {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "QUANT_EDGE") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
        ƯU THẾ QUANT {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "WATCH") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 whitespace-nowrap">
        Theo dõi {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{score ? `${score}đ` : "—"}</span>;
}

export function RsRatingBadge({
  rating,
  trend,
}: {
  rating?: number | null;
  trend?: "IMPROVING" | "WEAKENING" | "NEUTRAL" | null;
}) {
  if (rating == null || isNaN(rating)) return <span className="text-[10px] text-text-muted">—</span>;

  let colorClass = "bg-surface-base text-text-muted border-border-subtle";
  let dotClass = "bg-text-muted";

  if (rating >= 90) {
    colorClass = "bg-amber-500/15 text-amber-300 border-amber-400/40 font-bold";
    dotClass = "bg-amber-400";
  } else if (rating >= 80) {
    colorClass = "bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-bold";
    dotClass = "bg-emerald-400";
  } else if (rating >= 60) {
    colorClass = "bg-blue-500/15 text-blue-300 border-blue-500/30";
    dotClass = "bg-blue-400";
  } else if (rating < 40) {
    colorClass = "bg-rose-500/15 text-rose-300 border-rose-500/30";
    dotClass = "bg-rose-400";
  }

  return (
    <span
      title={`Relative Strength Rating (1-99): ${rating}${trend ? ` (Xu hướng: ${trend})` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap num ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>RS {rating}</span>
      {trend === "IMPROVING" && <span className="text-[9px] text-emerald-400 font-black">▲</span>}
      {trend === "WEAKENING" && <span className="text-[9px] text-rose-400 font-black">▼</span>}
    </span>
  );
}

export function PiotroskiBadge({
  score,
}: {
  score?: number | null;
  rating?: string | null;
}) {
  if (score == null || isNaN(score)) return <span className="text-[10px] text-text-muted">—</span>;

  let colorClass = "bg-surface-base text-text-muted border-border-subtle";
  let dotClass = "bg-text-muted";
  if (score >= 8) {
    colorClass = "bg-cyan-500/15 text-cyan-300 border-cyan-400/40 font-bold shadow-xs";
    dotClass = "bg-cyan-400";
  } else if (score >= 6) {
    colorClass = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold";
    dotClass = "bg-emerald-400";
  } else if (score < 4) {
    colorClass = "bg-rose-500/15 text-rose-300 border-rose-500/30";
    dotClass = "bg-rose-400";
  }

  return (
    <span
      title={`Piotroski F-Score: ${score}/9`}
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap num ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>F-{score}/9</span>
    </span>
  );
}

export function AltmanBadge({
  zone,
  zScore,
}: {
  zone?: "SAFE" | "GREY" | "DISTRESS" | string | null;
  zScore?: number | null;
}) {
  if (!zone) return <span className="text-[10px] text-text-muted">—</span>;

  if (zone === "SAFE") {
    return (
      <span
        title={`Altman Z''-Score: ${zScore ?? "An toàn"}`}
        className="inline-flex items-center gap-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      >
        An Toàn {zScore ? `(Z=${zScore})` : ""}
      </span>
    );
  }
  if (zone === "DISTRESS") {
    return (
      <span
        title={`Altman Z''-Score: ${zScore ?? "Nguy cơ"}`}
        className="inline-flex items-center gap-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
      >
        Nguy Cơ {zScore ? `(Z=${zScore})` : ""}
      </span>
    );
  }
  return (
    <span
      title={`Altman Z''-Score: ${zScore ?? "Vùng xám"}`}
      className="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 text-[10px] whitespace-nowrap"
    >
      Vùng Xám {zScore ? `(Z=${zScore})` : ""}
    </span>
  );
}

export function ConfluenceBadge({
  badge,
  score,
}: {
  badge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" | string | null | undefined;
  score?: number | null;
}) {
  if (badge === "SUPER_SETUP") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-400 whitespace-nowrap shadow-sm">
        SIÊU SETUP {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "POTENTIAL_BREAKOUT") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-accent-primary/20 border border-accent-primary/40 px-2 py-0.5 text-[10px] font-bold text-accent-primary whitespace-nowrap">
        CHỜ NỔ {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "WATCH") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 whitespace-nowrap">
        Theo dõi {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{score ? `${score}đ` : "—"}</span>;
}

export function SqueezeBadge({ state }: { state: string | null | undefined }) {
  if (state === "fired_bull") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
        Bứt phá tăng (Tín hiệu Mua)
      </span>
    );
  }
  if (state === "fired_bear") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 whitespace-nowrap">
        Gãy giảm (Cảnh báo Bán)
      </span>
    );
  }
  if (state === "squeeze_on") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 whitespace-nowrap animate-pulse">
        Đang nén
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function SuperTrendBadge({ dir }: { dir: "up" | "down" | null | undefined }) {
  if (dir === "up") {
    return <span className="text-[11px] font-bold text-emerald-400">▲ Tăng</span>;
  }
  if (dir === "down") {
    return <span className="text-[11px] font-semibold text-rose-400">▼ Giảm</span>;
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function MaSignalBadge({ signal }: { signal: string | null | undefined }) {
  if (signal === "GOLDEN_CROSS") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 whitespace-nowrap">
        Giao cắt Vàng
      </span>
    );
  }
  if (signal === "BULLISH_ALIGN") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
        Trật tự tăng
      </span>
    );
  }
  if (signal === "DEATH_CROSS") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 whitespace-nowrap">
        Cắt Tử thần
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function MtfCandleBadge({
  status,
  badgeVi,
  score,
  vsaSignal,
  vsaSignalVi,
  overheadRoomPct,
}: {
  status?: string;
  badgeVi?: string;
  score?: number;
  vsaSignal?: string | null;
  vsaSignalVi?: string | null;
  overheadRoomPct?: number | null;
}) {
  if ((!status || status === "NO_CLUSTER") && !vsaSignal) return null;

  const isTriple = status === "TRIPLE_BULL";
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {status && status !== "NO_CLUSTER" && (
        <span
          className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-all ${
            isTriple
              ? "bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-xs font-bold"
              : "bg-amber-500/15 text-amber-300 border-amber-500/30"
          }`}
          title={badgeVi ?? "Cụm nến đa khung"}
        >
          <span className={`size-1.5 rounded-full ${isTriple ? "bg-rose-400 animate-pulse" : "bg-amber-400"}`} />
          <span>{badgeVi ?? status}</span>
          {score != null && <span className="opacity-75">({score}đ)</span>}
        </span>
      )}
      {vsaSignal && (
        <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          <span>{vsaSignalVi ?? vsaSignal}</span>
        </span>
      )}
      {overheadRoomPct != null && overheadRoomPct >= 8 && (
        <span className="inline-flex items-center rounded px-1 py-0.2 text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20" title="Dư địa tăng đến ngưỡng cản kháng cự lớn">
          Cản: +{overheadRoomPct}%
        </span>
      )}
    </div>
  );
}

export interface PresetEdgeStat {
  winRatePct: number;
  avgGainPct: number;
  profitFactor: number;
  sampleTrades: number;
  riskReward: number;
  tagline: string;
}

export const PRESET_EDGE_BENCHMARKS: Partial<Record<ScreenerPreset, PresetEdgeStat>> = {
  apex_buy_now: {
    winRatePct: 82.4,
    avgGainPct: 17.8,
    profitFactor: 3.45,
    sampleTrades: 520,
    riskReward: 3.3,
    tagline: "Điểm Mua Kích Hoạt Tức Thời: Wyckoff Spring + Pocket Pivot bùng nổ + Khóa chặt Vùng Vàng + R:R >= 2.0x",
  },
  orca_apex_quant: {
    winRatePct: 78.5,
    avgGainPct: 16.4,
    profitFactor: 2.95,
    sampleTrades: 480,
    riskReward: 3.1,
    tagline: "Chân Sóng Apex: Đảo chiều chân sóng Wyckoff + Quant OU Z-score + Sweet Launch Zone (Chưa chạy xa đáy)",
  },
  historical_edge: {
    winRatePct: 76.8,
    avgGainPct: 15.2,
    profitFactor: 2.82,
    sampleTrades: 460,
    riskReward: 2.9,
    tagline: "Hành động giá tối ưu lịch sử: Tỷ lệ thắng thực nghiệm >= 60%, Up/Down Vol >= 1.25x",
  },
  orca_master_elite: {
    winRatePct: 74.2,
    avgGainPct: 14.6,
    profitFactor: 2.65,
    sampleTrades: 420,
    riskReward: 2.8,
    tagline: "Top 10% thị trường · Tỷ lệ thắng cao nhất nền tảng",
  },
  smart_money_inflow: {
    winRatePct: 71.5,
    avgGainPct: 12.3,
    profitFactor: 2.41,
    sampleTrades: 385,
    riskReward: 2.6,
    tagline: "Theo dấu dòng tiền tổ chức & Pocket Pivot",
  },
  mtf_candle_cluster: {
    winRatePct: 75.6,
    avgGainPct: 13.8,
    profitFactor: 2.45,
    sampleTrades: 340,
    riskReward: 2.6,
    tagline: "Cụm nến đảo chiều tăng đồng thuận H1 · D1 · W1 (T+0 / T+1)",
  },
  vsa_no_supply: {
    winRatePct: 73.1,
    avgGainPct: 12.4,
    profitFactor: 2.28,
    sampleTrades: 420,
    riskReward: 2.4,
    tagline: "VSA cạn cung (No Supply Test) hoặc lực cầu hấp thụ tại đáy",
  },
  near_buy_point: {
    winRatePct: 69.4,
    avgGainPct: 11.8,
    profitFactor: 2.35,
    sampleTrades: 512,
    riskReward: 2.8,
    tagline: "Điểm mua tối ưu · Rủi ro cắt lỗ cực thấp",
  },
  rs_leaders: {
    winRatePct: 68.8,
    avgGainPct: 13.5,
    profitFactor: 2.24,
    sampleTrades: 360,
    riskReward: 2.5,
    tagline: "Cổ phiếu dẫn dắt RS 80+ William O'Neil",
  },
  mtf_confluence: {
    winRatePct: 72.8,
    avgGainPct: 12.9,
    profitFactor: 2.52,
    sampleTrades: 290,
    riskReward: 2.7,
    tagline: "Đồng thuận đa khung H1 + D1 + W1 cùng pha",
  },
  piotroski_diamonds: {
    winRatePct: 66.5,
    avgGainPct: 9.8,
    profitFactor: 2.12,
    sampleTrades: 310,
    riskReward: 2.3,
    tagline: "Sức khỏe tài chính F-Score 7-9 & Altman an toàn",
  },
  bottom_confluence: {
    winRatePct: 76.8,
    avgGainPct: 15.2,
    profitFactor: 2.85,
    sampleTrades: 420,
    riskReward: 2.9,
    tagline: "Tam Hợp Lưu Đáy: Hỗ trợ MA/Reclaim + Nến đảo chiều chuẩn + Phân kỳ dương tươi mới (RSI/MACD)",
  },
  quant_edge: {
    winRatePct: 68.0,
    avgGainPct: 11.2,
    profitFactor: 2.20,
    sampleTrades: 340,
    riskReward: 2.5,
    tagline: "Mô hình Ornstein-Uhlenbeck & Triple Barrier",
  },
  breakout: {
    winRatePct: 63.5,
    avgGainPct: 11.5,
    profitFactor: 1.85,
    sampleTrades: 620,
    riskReward: 2.1,
    tagline: "Bùng nổ khối lượng vượt đỉnh 20 phiên",
  },
  canslim: {
    winRatePct: 65.8,
    avgGainPct: 12.0,
    profitFactor: 2.05,
    sampleTrades: 450,
    riskReward: 2.3,
    tagline: "Tăng trưởng doanh thu, LNST & ROE vượt trội",
  },
};

export type StrategyGroup = "core" | "price_action" | "quant" | "fundamental" | "custom";

export interface StrategyGroupMeta {
  id: StrategyGroup;
  label: string;
  desc: string;
  dotColor: string;
}

export const STRATEGY_GROUPS: StrategyGroupMeta[] = [
  { id: "core", label: "Cốt lõi Orca", desc: "Hệ thống độc quyền & Dòng tiền tổ chức", dotColor: "bg-amber-400" },
  { id: "price_action", label: "Hành động giá & MTF", desc: "Cụm nến đa khung, VSA, VCP, Squeeze & MA", dotColor: "bg-rose-400" },
  { id: "quant", label: "Định lượng Quant Pro", desc: "Mô hình thống kê OU, Low-Beta & Triple Barrier", dotColor: "bg-cyan-400" },
  { id: "fundamental", label: "Cơ bản & CANSLIM", desc: "RS Rating, Piotroski, Altman Z'' & Tăng trưởng", dotColor: "bg-emerald-400" },
  { id: "custom", label: "Bộ lọc của tôi", desc: "Các chiến lược tùy biến đã lưu", dotColor: "bg-purple-400" },
];

export interface PresetTabItem {
  id: ScreenerPreset;
  category: "core" | "price_action" | "quant" | "fundamental";
  label: string;
  dotColor: string;
  desc: string;
}

export const PRESET_TABS: PresetTabItem[] = [
  // Core Orca
  { id: "all", category: "core", label: "Tất cả", dotColor: "bg-text-muted", desc: "Toàn bộ thị trường niêm yết" },
  { id: "apex_buy_now", category: "core", label: "Điểm Mua Kích Hoạt", dotColor: "bg-emerald-400", desc: "Kích hoạt điểm mua tức thời: Chạm chuẩn điểm mua / Vùng Vàng + Nổ vol gom hàng Pocket Pivot / Cá mập + Dư địa cản trên >= 5% + R:R >= 2.0x" },
  { id: "orca_apex_quant", category: "core", label: "Chân Sóng Apex", dotColor: "bg-amber-400", desc: "Đỉnh cao hợp lưu: Đảo chiều chân sóng Wyckoff Spring + Quant OU Z-score + Khóa chặt vùng Sweet Launch Zone (chưa chạy xa đáy) + Dư địa tăng >= 6.5%" },
  { id: "historical_edge", category: "core", label: "Lợi Thế Lịch Sử", dotColor: "bg-emerald-400", desc: "Bộ lọc tối ưu dựa trên huấn luyện chuỗi giá quá khứ: Tỷ lệ thắng thực nghiệm >= 60%, tích lũy Up/Down Vol >= 1.15x, loại bỏ hoàn toàn bẫy giá" },
  { id: "orca_master_elite", category: "core", label: "Orca Master 80+", dotColor: "bg-amber-400", desc: "Top siêu phẩm tổng hợp 5 trụ cột (Kỹ thuật + Cá mập + Cơ bản + Điểm mua + Định giá)" },
  { id: "smart_money_inflow", category: "core", label: "Dòng Tiền Cá Mập", dotColor: "bg-purple-400", desc: "Dấu chân tổ chức: Mua chủ động > 65%, Khối ngoại gom ròng hoặc Pocket Pivot nổ vol" },
  { id: "near_buy_point", category: "core", label: "Sát Điểm Mua (Buy Zone)", dotColor: "bg-emerald-400", desc: "Cổ phiếu có điểm mua gần giá hiện tại nhất (|Lệch| ≤ 1.5%), R:R ≥ 2.5, rủi ro cắt lỗ cực thấp" },

  // Price Action & MTF
  { id: "mtf_candle_cluster", category: "price_action", label: "Cụm Nến Đa Khung", dotColor: "bg-rose-400", desc: "Cụm mô hình nến đảo chiều tăng đồng thuận H1, D1 và W1 mới nhất (T+0 / T+1)" },
  { id: "vsa_no_supply", category: "price_action", label: "Cạn Cung VSA", dotColor: "bg-emerald-400", desc: "Dấu hiệu cạn cung (No Supply Test) tại hỗ trợ MA hoặc lực cầu hấp thụ Stopping Volume" },
  { id: "mtf_confluence", category: "price_action", label: "Đồng Thuận H1-D1-W1", dotColor: "bg-amber-400", desc: "Bộ hợp lưu tối thượng: Cả 3 khung H1 (Giờ) · D1 (Ngày) · W1 (Tuần) cùng đồng thuận xu hướng TĂNG" },
  { id: "bottom_confluence", category: "price_action", label: "Tam Hợp Lưu Đáy", dotColor: "bg-cyan-400", desc: "Tam Hợp Lưu Đáy Đỉnh Cao: Hỗ trợ MA/Reclaim MA + Cụm nến đảo chiều tăng + Phân kỳ dương RSI/MACD kép" },
  { id: "confluence", category: "price_action", label: "Hội Tụ 4 Trụ Cột", dotColor: "bg-amber-400", desc: "Hội tụ 4 trụ cột: Xu hướng + Mẫu hình + Dòng tiền + Cơ bản" },
  { id: "vcp", category: "price_action", label: "Mẫu Hình VCP / Cup", dotColor: "bg-blue-400", desc: "Minervini VCP, Cốc tay cầm, Hai đáy" },
  { id: "ttm_squeeze", category: "price_action", label: "Nén Squeeze (TTM)", dotColor: "bg-purple-400", desc: "Bollinger nén trong Keltner chuẩn bị bùng nổ" },
  { id: "breakout", category: "price_action", label: "Bùng Nổ Khối Lượng", dotColor: "bg-purple-400", desc: "Giá tăng > 2% kèm vol lớn vượt đỉnh" },
  { id: "ma_cross", category: "price_action", label: "Giao Cắt MA Vàng", dotColor: "bg-emerald-400", desc: "Golden Cross & Trật tự MA tăng" },

  // Quant Pro
  { id: "quant_edge", category: "quant", label: "Ưu Thế Quant Pro", dotColor: "bg-cyan-400", desc: "Top cổ phiếu có ưu thế định lượng thống kê toàn diện (Score >= 62)" },
  { id: "quant_mean_revert", category: "quant", label: "Mean Reversion OU", dotColor: "bg-emerald-400", desc: "Mô hình Ornstein-Uhlenbeck: Bắt đáy thống kê Z-Score <= -1.4, chu kỳ t½" },
  { id: "quant_low_beta", category: "quant", label: "Low-Beta Anomaly", dotColor: "bg-blue-400", desc: "Bất thường học thuyết AQR: Beta <= 0.88 & Chất lượng cao" },
  { id: "quant_asymmetric", category: "quant", label: "Triple-Barrier R/R ≥ 2", dotColor: "bg-amber-400", desc: "Tỷ lệ Lời/Lỗ tối ưu theo mô hình biến động Marcos López de Prado" },

  // Fundamental & CANSLIM
  { id: "rs_leaders", category: "fundamental", label: "Dẫn Dắt RS 80+ (O'Neil)", dotColor: "bg-amber-400", desc: "Top siêu cổ phiếu có Relative Strength Rating >= 80 (chuẩn William O'Neil)" },
  { id: "piotroski_diamonds", category: "fundamental", label: "Piotroski & Altman Z", dotColor: "bg-cyan-400", desc: "Sức khỏe tài chính xuất sắc: Piotroski F-Score >= 7 và Altman Z'' Vùng An Toàn" },
  { id: "canslim", category: "fundamental", label: "CANSLIM Tăng Trưởng", dotColor: "bg-emerald-400", desc: "Tăng trưởng doanh thu, LNST & ROE vượt trội" },
  { id: "growth", category: "fundamental", label: "Siêu Tăng Trưởng LNST", dotColor: "bg-amber-400", desc: "LNST / Doanh thu tăng trưởng > 20%" },
  { id: "value", category: "fundamental", label: "Giá Trị Biên An Toàn", dotColor: "bg-blue-400", desc: "P/E < 11, P/B < 1.3, an toàn vốn" },
  { id: "dividend", category: "fundamental", label: "Cổ Tức Tiền Mặt Cao", dotColor: "bg-emerald-400", desc: "Cổ tức tiền mặt > 5%, nợ an toàn" },
];

export function getPresetCategory(preset: ScreenerPreset): StrategyGroup {
  const item = PRESET_TABS.find((t) => t.id === preset);
  return item ? item.category : "core";
}

export function VnScreener({
  defaultSector,
  defaultPreset = "all",
  defaultView = "overview",
  onOpenBacktest,
}: {
  defaultSector: string | null;
  defaultPreset?: ScreenerPreset;
  defaultView?: ViewTab;
  onOpenBacktest?: (symbol?: string) => void;
}) {
  // Preset & Tab state
  const [preset, setPreset] = useState<ScreenerPreset>(defaultPreset);
  const [activeStrategyGroup, setActiveStrategyGroup] = useState<StrategyGroup>(() =>
    getPresetCategory(defaultPreset),
  );
  const [viewTab, setViewTab] = useState<ViewTab>(defaultView);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [displayMode, setDisplayMode] = useState<"table" | "grid">("table");
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customPresets, setCustomPresets] = useState<CustomScreenerPreset[]>([]);
  const [activeCustomPresetName, setActiveCustomPresetName] = useState<string | null>(null);

  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  // Search & Filter state
  const [q, setQ] = useState("");
  const [exchange, setExchange] = useState("ALL");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [maSignal, setMaSignal] = useState("ALL");
  const [minChg, setMinChg] = useState("");
  const [maxChg, setMaxChg] = useState("");
  const [minVol, setMinVol] = useState("");
  const [minPe, setMinPe] = useState("");
  const [maxPe, setMaxPe] = useState("");
  const [minPb, setMinPb] = useState("");
  const [maxPb, setMaxPb] = useState("");
  const [minRoe, setMinRoe] = useState("");
  const [minDivYield, setMinDivYield] = useState("");
  const [maxDe, setMaxDe] = useState("");
  const [minMarketCap, setMinMarketCap] = useState("");
  const [maxBuyDiff, setMaxBuyDiff] = useState("");
  const [buyZoneStatus, setBuyZoneStatus] = useState("ALL");
  const [minOrcaMasterScore, setMinOrcaMasterScore] = useState("");
  const [minSmartMoneyScore, setMinSmartMoneyScore] = useState("");
  const [minRsRating, setMinRsRating] = useState("");
  const [minPiotroskiScore, setMinPiotroskiScore] = useState("");
  const [minTradingValue, setMinTradingValue] = useState("");
  const [mtfOnly, setMtfOnly] = useState(false);

  // Sort state
  const initialSortKey =
    defaultPreset === "near_buy_point" || defaultView === "buy_point"
      ? "absBuyDiff"
      : defaultPreset === "apex_buy_now"
      ? "buyTriggerScore"
      : defaultPreset === "orca_apex_quant"
      ? "apexQuantScore"
      : defaultPreset === "historical_edge"
      ? "historicalEdgeScore"
      : defaultPreset === "orca_master_elite" || defaultView === "orca_master"
      ? "orcaMasterScore"
      : defaultPreset === "smart_money_inflow" || defaultView === "smart_money"
      ? "smartMoneyScore"
      : defaultPreset === "confluence" || defaultView === "confluence"
      ? "confluenceScore"
      : "marketCap";
  const [sortKey, setSortKey] = useState<string>(initialSortKey);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    initialSortKey === "absBuyDiff" ? "asc" : "desc",
  );

  // Applied params
  const [applied, setApplied] = useState({
    preset: defaultPreset,
    exchange: "ALL",
    sector: defaultSector ?? "",
    q: "",
    maSignal: "ALL",
    minChg: "",
    maxChg: "",
    minVol: "",
    minPe: "",
    maxPe: "",
    minPb: "",
    maxPb: "",
    minRoe: "",
    minDivYield: "",
    maxDe: "",
    minMarketCap: "",
    maxBuyDiff: "",
    buyZoneStatus: "ALL",
    minOrcaMasterScore: "",
    minSmartMoneyScore: "",
    minRsRating: "",
    minPiotroskiScore: "",
    minTradingValue: "",
    mtfOnly: false,
    mtfCandleOnly: false,
    minMtfCandleScore: "",
    vsaOnly: false,
    minOverheadRoom: "",
  });

  // Synchronize when parent changes preset/view/sector
  useEffect(() => {
    setPreset(defaultPreset);
    setActiveStrategyGroup(getPresetCategory(defaultPreset));
    setViewTab(defaultView);
    setSector(defaultSector ?? "");
    if (defaultPreset === "near_buy_point" || defaultView === "buy_point") {
      setSortKey("absBuyDiff");
      setSortOrder("asc");
    } else if (defaultPreset === "apex_buy_now") {
      setSortKey("buyTriggerScore");
      setSortOrder("desc");
    } else if (defaultPreset === "orca_apex_quant") {
      setSortKey("apexQuantScore");
      setSortOrder("desc");
    } else if (defaultPreset === "historical_edge") {
      setSortKey("historicalEdgeScore");
      setSortOrder("desc");
    } else if (defaultPreset === "orca_master_elite" || defaultView === "orca_master") {
      setSortKey("orcaMasterScore");
      setSortOrder("desc");
    } else if (defaultPreset === "smart_money_inflow" || defaultView === "smart_money") {
      setSortKey("smartMoneyScore");
      setSortOrder("desc");
    } else if (defaultPreset === "confluence" || defaultView === "confluence") {
      setSortKey("confluenceScore");
      setSortOrder("desc");
    }
    setApplied((prev) => ({
      ...prev,
      preset: defaultPreset,
      sector: defaultSector ?? "",
    }));
  }, [defaultPreset, defaultView, defaultSector]);

  // Query string builder
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.preset !== "all") p.set("preset", applied.preset);
    if (applied.exchange && applied.exchange !== "ALL") p.set("exchange", applied.exchange);
    if (applied.sector) p.set("sector", applied.sector);
    if (applied.q) p.set("q", applied.q);
    if (applied.maSignal && applied.maSignal !== "ALL") p.set("maSignal", applied.maSignal);
    if (applied.minChg) p.set("minChg", applied.minChg);
    if (applied.maxChg) p.set("maxChg", applied.maxChg);
    if (applied.minVol) {
      const v = Number(applied.minVol);
      if (Number.isFinite(v) && v > 0) {
        p.set("minTradingValue", String(v));
      }
    }
    if (applied.minPe) p.set("minPe", applied.minPe);
    if (applied.maxPe) p.set("maxPe", applied.maxPe);
    if (applied.minPb) p.set("minPb", applied.minPb);
    if (applied.maxPb) p.set("maxPb", applied.maxPb);
    if (applied.minRoe) p.set("minRoe", applied.minRoe);
    if (applied.minDivYield) p.set("minDivYield", applied.minDivYield);
    if (applied.maxDe) p.set("maxDe", applied.maxDe);
    if (applied.minMarketCap) p.set("minMarketCap", applied.minMarketCap);
    if (applied.maxBuyDiff) p.set("maxBuyDiff", applied.maxBuyDiff);
    if (applied.buyZoneStatus && applied.buyZoneStatus !== "ALL") p.set("buyZoneStatus", applied.buyZoneStatus);
    if (applied.minOrcaMasterScore) p.set("minOrcaMasterScore", applied.minOrcaMasterScore);
    if (applied.minSmartMoneyScore) p.set("minSmartMoneyScore", applied.minSmartMoneyScore);
    if (applied.minRsRating) p.set("minRsRating", applied.minRsRating);
    if (applied.minPiotroskiScore) p.set("minPiotroskiScore", applied.minPiotroskiScore);
    if (applied.minTradingValue) p.set("minTradingValue", applied.minTradingValue);
    if (applied.mtfOnly) p.set("mtfOnly", "true");
    if (applied.mtfCandleOnly) p.set("mtfCandleOnly", "true");
    if (applied.minMtfCandleScore) p.set("minMtfCandleScore", applied.minMtfCandleScore);
    if (applied.vsaOnly) p.set("vsaOnly", "true");
    if (applied.minOverheadRoom) p.set("minOverheadRoom", applied.minOverheadRoom);
    p.set("sort", sortKey);
    p.set("order", sortOrder);
    p.set("limit", "150");
    return p.toString();
  }, [applied, sortKey, sortOrder]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenerResponseData>(
    `/api/v1/stocks/screener?${queryString}`,
    {
      refreshInterval: 30_000,
      timeoutMs: 25_000,
      keepPreviousData: true,
    },
  );

  const handleApply = useCallback(() => {
    setApplied({
      preset,
      exchange,
      sector,
      q,
      maSignal,
      minChg,
      maxChg,
      minVol,
      minPe,
      maxPe,
      minPb,
      maxPb,
      minRoe,
      minDivYield,
      maxDe,
      minMarketCap,
      maxBuyDiff,
      buyZoneStatus,
      minOrcaMasterScore,
      minSmartMoneyScore,
      minRsRating,
      minPiotroskiScore,
      minTradingValue,
      mtfOnly,
      mtfCandleOnly: false,
      minMtfCandleScore: "",
      vsaOnly: false,
      minOverheadRoom: "",
    });
    void mutate();
  }, [
    preset,
    exchange,
    sector,
    q,
    maSignal,
    minChg,
    maxChg,
    minVol,
    minPe,
    maxPe,
    minPb,
    maxPb,
    minRoe,
    minDivYield,
    maxDe,
    minMarketCap,
    maxBuyDiff,
    buyZoneStatus,
    minOrcaMasterScore,
    minSmartMoneyScore,
    minRsRating,
    minPiotroskiScore,
    minTradingValue,
    mtfOnly,
    mutate,
  ]);

  const handleReset = useCallback(() => {
    setPreset("all");
    setExchange("ALL");
    setSector("");
    setQ("");
    setMaSignal("ALL");
    setMinChg("");
    setMaxChg("");
    setMinVol("");
    setMinPe("");
    setMaxPe("");
    setMinPb("");
    setMaxPb("");
    setMinRoe("");
    setMinDivYield("");
    setMaxDe("");
    setMinMarketCap("");
    setMaxBuyDiff("");
    setBuyZoneStatus("ALL");
    setMinOrcaMasterScore("");
    setMinSmartMoneyScore("");
    setMinRsRating("");
    setMinPiotroskiScore("");
    setMinTradingValue("");
    setMtfOnly(false);
    setActiveCustomPresetName(null);
    setApplied({
      preset: "all",
      exchange: "ALL",
      sector: "",
      q: "",
      maSignal: "ALL",
      minChg: "",
      maxChg: "",
      minVol: "",
      minPe: "",
      maxPe: "",
      minPb: "",
      maxPb: "",
      minRoe: "",
      minDivYield: "",
      maxDe: "",
      minMarketCap: "",
      maxBuyDiff: "",
      buyZoneStatus: "ALL",
      minOrcaMasterScore: "",
      minSmartMoneyScore: "",
      minRsRating: "",
      minPiotroskiScore: "",
      minTradingValue: "",
      mtfOnly: false,
      mtfCandleOnly: false,
      minMtfCandleScore: "",
      vsaOnly: false,
      minOverheadRoom: "",
    });
    void mutate();
  }, [mutate]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder(key === "absBuyDiff" || key === "buyPointDiffPct" ? "asc" : "desc");
    }
  };

  const handleSelectPreset = (p: ScreenerPreset) => {
    setPreset(p);
    setActiveCustomPresetName(null);
    setActiveStrategyGroup(getPresetCategory(p));
    if (p === "apex_buy_now") {
      setViewTab("orca_master");
      setSortKey("buyTriggerScore");
      setSortOrder("desc");
    } else if (p === "orca_apex_quant") {
      setViewTab("orca_master");
      setSortKey("apexQuantScore");
      setSortOrder("desc");
    } else if (p === "historical_edge") {
      setViewTab("orca_master");
      setSortKey("historicalEdgeScore");
      setSortOrder("desc");
    } else if (p === "orca_master_elite") {
      setViewTab("orca_master");
      setSortKey("orcaMasterScore");
      setSortOrder("desc");
    } else if (p === "smart_money_inflow") {
      setViewTab("smart_money");
      setSortKey("smartMoneyScore");
      setSortOrder("desc");
    } else if (p === "near_buy_point") {
      setViewTab("buy_point");
      setSortKey("absBuyDiff");
      setSortOrder("asc");
    } else if (p === "mtf_confluence") {
      setViewTab("confluence");
      setSortKey("confluenceScore");
      setSortOrder("desc");
    } else if (p === "confluence" || p === "bottom_confluence") {
      setViewTab("confluence");
      setSortKey("confluenceScore");
      setSortOrder("desc");
    } else if (p === "mtf_candle_cluster") {
      setSortKey("mtfCandleScore");
      setSortOrder("desc");
    } else if (p === "vsa_no_supply") {
      setSortKey("volume");
      setSortOrder("desc");
    } else if (p === "quant_edge" || p === "quant_mean_revert" || p === "quant_low_beta" || p === "quant_asymmetric") {
      setViewTab("quant");
      setSortKey("quantEdgeScore");
      setSortOrder("desc");
    }
    setApplied((prev) => ({ ...prev, preset: p }));
  };

  const handleApplyCustomPreset = (filters: CustomScreenerPreset["filters"], presetName?: string) => {
    setActiveCustomPresetName(presetName ?? "Tùy biến");
    setActiveStrategyGroup("custom");
    setPreset("all");
    setApplied((prev) => ({
      ...prev,
      preset: "all",
      minOrcaMasterScore: filters.minOrcaMasterScore != null ? String(filters.minOrcaMasterScore) : "",
      minRsRating: filters.minRsRating != null ? String(filters.minRsRating) : "",
      minSmartMoneyScore: filters.minSmartMoneyScore != null ? String(filters.minSmartMoneyScore) : "",
      minPiotroskiScore: filters.minPiotroskiScore != null ? String(filters.minPiotroskiScore) : "",
      maxBuyDiff: filters.maxBuyDiff != null ? String(filters.maxBuyDiff) : "",
      buyZoneStatus: filters.buyZoneStatus ?? "ALL",
      mtfOnly: filters.mtfOnly ?? false,
      mtfCandleOnly: filters.mtfCandleOnly ?? false,
      minMtfCandleScore: filters.minMtfCandleScore != null ? String(filters.minMtfCandleScore) : "",
      vsaOnly: filters.vsaOnly ?? false,
      minOverheadRoom: filters.minOverheadRoom != null ? String(filters.minOverheadRoom) : "",
      maSignal: filters.maSignal ?? "ALL",
      minTradingValue: filters.minTradingValue != null ? String(filters.minTradingValue) : "",
      maxPe: filters.maxPe != null ? String(filters.maxPe) : "",
      minRoe: filters.minRoe != null ? String(filters.minRoe) : "",
      minDivYield: filters.minDivYield != null ? String(filters.minDivYield) : "",
    }));
    setCustomPresets(loadCustomPresets());
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustomPreset(id);
    setCustomPresets(loadCustomPresets());
  };

  const rows = data?.items ?? [];
  const presetsCount = data?.presetsCount;

  // Export CSV with Formula Injection Neutralization
  const handleExportCsv = () => {
    if (!rows.length) return;
    const toCsvCell = (val: unknown): string => {
      if (val == null) return '""';
      let s = String(val);
      // Neutralize CSV formula injection (=, +, -, @, tab, CR)
      if (/^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
      }
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Mã",
      "Tên DN",
      "Sàn",
      "Ngành",
      "Giá (k VND)",
      "Thay đổi (%)",
      "Khối lượng",
      "Vốn hóa (tỷ VND)",
      "P/E",
      "P/B",
      "ROE (%)",
      "ROA (%)",
      "Cổ tức (%)",
      "Biên LN ròng (%)",
      "Nợ/Vốn CSH",
      "Điểm Mua Tối Ưu",
      "Lệch vs Điểm Mua (%)",
      "Trạng Thái Điểm Mua",
      "Chiến Lược Vào Lệnh",
      "Cắt Lỗ (SL)",
      "Chốt Lời (TP)",
      "Tỷ Lệ R:R",
      "Orca Master",
      "Smart Money",
      "RS Rating",
      "Piotroski",
    ];
    const csvRows = [
      headers.map(toCsvCell).join(","),
      ...rows.map((r) =>
        [
          r.symbol,
          r.name,
          r.exchange,
          r.sector,
          r.price,
          r.changePercent,
          r.volume,
          r.marketCap,
          r.pe,
          r.pb,
          r.roe,
          r.roa,
          r.dividendYield,
          r.netMargin,
          r.debtEquity,
          r.buyPoint,
          r.buyPointDiffPct,
          r.buyZoneStatus,
          r.buyStrategy,
          r.stopLoss,
          r.targetPrice,
          r.riskReward,
          r.orcaMasterScore,
          r.smartMoneyScore,
          r.rsRating,
          r.piotroskiFScore,
        ].map(toCsvCell).join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orca-screener-${applied.preset}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* 1. Categorized Strategy Navigation */}
      <div className="rounded-lg border border-line bg-panel p-2.5 space-y-2.5">
        {/* Tier 1: Category Selector + Builder action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1.5">
              Nhóm chiến lược:
            </span>
            {STRATEGY_GROUPS.map((group) => {
              const isActive = activeStrategyGroup === group.id;
              const customCount = group.id === "custom" ? customPresets.length : null;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setActiveStrategyGroup(group.id);
                    if (group.id !== "custom") {
                      // If current preset not in this category, pick the first one
                      const firstInGroup = PRESET_TABS.find((t) => t.category === group.id);
                      if (firstInGroup && getPresetCategory(preset) !== group.id) {
                        handleSelectPreset(firstInGroup.id);
                      }
                    }
                  }}
                  title={group.desc}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-all ${
                    isActive
                      ? "bg-surface-elevated text-text-primary border border-border-subtle shadow-xs font-semibold"
                      : "text-text-secondary hover:text-text-primary hover:bg-panel-2"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${group.dotColor}`} />
                  <span>{group.label}</span>
                  {customCount != null && customCount > 0 && (
                    <span className="rounded-full bg-purple-500/20 text-purple-300 px-1.5 text-[10px] font-mono">
                      {customCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowCustomBuilder(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium bg-panel-2 text-text-secondary border border-border-subtle hover:text-text-primary hover:bg-panel-hover transition-all shrink-0"
          >
            <SlidersHorizontal className="size-3 text-accent-primary" />
            <span>Tự tạo bộ lọc</span>
          </button>
        </div>

        {/* Tier 2: Presets under the active Category */}
        <div className="flex flex-wrap items-center gap-1.5">
          {activeStrategyGroup !== "custom" ? (
            PRESET_TABS.filter((tab) => tab.category === activeStrategyGroup).map((tab) => {
              const active = preset === tab.id && !activeCustomPresetName;
              const count = presetsCount ? presetsCount[tab.id] : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectPreset(tab.id)}
                  title={tab.desc}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-all ${
                    active
                      ? "bg-accent-primary text-white shadow-xs font-semibold"
                      : "bg-panel-2 text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      active ? "bg-white" : tab.dotColor
                    }`}
                  />
                  <span>{tab.label}</span>
                  {count != null && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                        active ? "bg-white/20 text-white" : "bg-panel-3 text-text-muted"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              {customPresets.length === 0 ? (
                <div className="flex items-center justify-between w-full py-1 text-[11.5px] text-text-muted">
                  <span>Chưa có bộ lọc tùy biến nào được lưu. Bạn có thể tự phối hợp các chỉ số theo phong cách riêng.</span>
                  <button
                    type="button"
                    onClick={() => setShowCustomBuilder(true)}
                    className="text-accent-primary hover:underline font-medium ml-2"
                  >
                    Mở trình tạo bộ lọc →
                  </button>
                </div>
              ) : (
                customPresets.map((cp) => {
                  const active = activeCustomPresetName === cp.name;
                  return (
                    <div
                      key={cp.id}
                      onClick={() => handleApplyCustomPreset(cp.filters, cp.name)}
                      className={`group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer border ${
                        active
                          ? "bg-purple-500/20 text-purple-200 border-purple-400/50 shadow-xs font-semibold"
                          : "bg-panel-2 text-text-secondary border-border-subtle hover:bg-panel-hover hover:text-text-primary"
                      }`}
                    >
                      <span className="size-1.5 rounded-full bg-purple-400" />
                      <span>{cp.name}</span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustomPreset(cp.id, e)}
                        className="opacity-40 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-all ml-1"
                        title="Xóa bộ lọc này"
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Screener Panel */}
      <Panel
        title={
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">
                Bộ lọc: {rows.length} mã thỏa mãn
              </span>
              <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
              {data?.sourcesUsed && (
                <span
                  title={`Nguồn đang kết nối: ${data.sourcesUsed.join(", ")} · Chế độ HA tự động dự phòng`}
                  className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20"
                >
                  <ShieldCheck className="size-3" />
                  Đa nguồn song song ({data.sourcesUsed.length} nguồn)
                </span>
              )}
              {isValidating && (
                <span className="text-[11px] text-accent-primary font-normal animate-pulse">
                  · đang cập nhật…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!rows.length}
                className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-panel-hover hover:text-text-primary transition-all disabled:opacity-40"
              >
                <Download className="size-3" />
                Xuất CSV
              </button>
            </div>
          </div>
        }
        pad={false}
      >
        {/* Multi-Source Redundancy Telemetry Banner */}
        {data?.redundancyInfo && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-panel-3/50 border-b border-line text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Đa Nguồn HA Active:
              </span>
              {data.redundancyInfo.quoteProviders?.map((p) => {
                const lat = data.redundancyInfo?.latencies?.[p];
                return (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded bg-panel-2 px-2 py-0.5 border border-line/60 text-[10px] text-text-secondary"
                  >
                    <span className="size-1 rounded-full bg-emerald-400" />
                    <span className="uppercase font-medium">{p}</span>
                    {lat != null && <span className="text-text-muted font-mono">{lat}ms</span>}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span>Đồng bộ: <strong className="text-emerald-400 font-medium">{data.redundancyInfo.healthStatus}</strong></span>
              {data.redundancyInfo.conflictCount != null && data.redundancyInfo.conflictCount > 0 && (
                <span>Khử lệch: {data.redundancyInfo.conflictCount} mã</span>
              )}
              <span className="rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 border border-emerald-500/20">
                HA Failover: {data.redundancyInfo.failoverCount > 0 ? `${data.redundancyInfo.failoverCount} lần` : "Sẵn sàng"}
              </span>
            </div>
          </div>
        )}

        {/* Statistical Win-Rate & Edge Banner (Sprint 3) */}
        {(() => {
          const edge = PRESET_EDGE_BENCHMARKS[preset];
          if (!edge) return null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500/10 via-amber-500/5 to-transparent border-b border-border-subtle text-[11.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold shadow-xs">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  Win-rate: {edge.winRatePct}%
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold">
                  Profit Factor: {edge.profitFactor}x
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-semibold">
                  R:R: {edge.riskReward}x
                </span>
                <span className="text-text-secondary hidden md:inline">
                  {edge.tagline} ({edge.sampleTrades} lệnh kiểm thử)
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenBacktest && onOpenBacktest()}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline shrink-0"
              >
                Mô phỏng Backtest chiến lược →
              </button>
            </div>
          );
        })()}

        {/* Quick Filter Bar */}
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3 bg-panel-2/40">
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <Search className="size-2.5" /> Tìm mã / tên
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              placeholder="FPT, VCB, Hòa Phát…"
              className="input !w-36 !py-1.5 text-[12px]"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Sàn</span>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="input !w-24 !py-1.5 text-[12px]"
            >
              <option value="ALL">Tất cả sàn</option>
              <option value="HOSE">HOSE</option>
              <option value="HNX">HNX</option>
              <option value="UPCOM">UPCoM</option>
            </select>
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Ngành</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              <option value="">Tất cả ngành</option>
              {VN_SECTOR_MAP.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="Δ% min" value={minChg} onChange={setMinChg} small placeholder="-5" />
          <Field label="Δ% max" value={maxChg} onChange={setMaxChg} small placeholder="7" />
          <Field label="GT min (tỷ)" value={minVol} onChange={setMinVol} small placeholder="5" />

          <button
            type="button"
            onClick={handleApply}
            className="rounded-md bg-accent-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-primary/90 transition-all shadow-sm"
          >
            Lọc kết quả
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              showAdvanced ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30" : "bg-panel text-text-secondary hover:bg-panel-hover"
            }`}
          >
            <SlidersHorizontal className="size-3" />
            Bộ lọc nâng cao
            {showAdvanced ? <ChevronUp className="size-3 ml-0.5" /> : <ChevronDown className="size-3 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Đặt lại tất cả bộ lọc"
            className="rounded-md border border-line bg-panel p-1.5 text-text-muted hover:text-text-primary hover:bg-panel-hover"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-2.5 border-b border-line p-3.5 bg-panel-3/40 animate-in fade-in duration-200">
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Khoảng cách điểm mua</span>
              <select
                value={maxBuyDiff}
                onChange={(e) => setMaxBuyDiff(e.target.value)}
                className="input !w-full !py-1.5 text-[12px]"
              >
                <option value="">Tất cả khoảng cách</option>
                <option value="1.0">≤ 1.0% (Đúng điểm mua)</option>
                <option value="2.0">≤ 2.0% (Sát điểm mua)</option>
                <option value="3.5">≤ 3.5% (Vùng gom an toàn)</option>
                <option value="5.0">≤ 5.0%</option>
              </select>
            </label>
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Trạng thái điểm mua</span>
              <select
                value={buyZoneStatus}
                onChange={(e) => setBuyZoneStatus(e.target.value)}
                className="input !w-full !py-1.5 text-[12px]"
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="AT_BUY_POINT">Ngay điểm mua (Zone)</option>
                <option value="NEAR_BUY_POINT">Sát điểm mua (≤ 2.5%)</option>
                <option value="WAIT_PULLBACK">Chờ chỉnh (&gt; 2.5%)</option>
                <option value="BELOW_SUPPORT">Dưới hỗ trợ</option>
              </select>
            </label>
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Tín hiệu MA</span>
              <select
                value={maSignal}
                onChange={(e) => setMaSignal(e.target.value)}
                className="input !w-full !py-1.5 text-[12px]"
              >
                <option value="ALL">Tất cả tín hiệu MA</option>
                <option value="GOLDEN_CROSS">Giao cắt Vàng (Golden)</option>
                <option value="BULLISH_ALIGN">Kênh tăng (Trật tự MA)</option>
                <option value="DEATH_CROSS">Cắt Tử thần (Death Cross)</option>
              </select>
            </label>
            <Field label="P/E tối đa" value={maxPe} onChange={setMaxPe} small placeholder="15" />
            <Field label="P/B tối đa" value={maxPb} onChange={setMaxPb} small placeholder="2.0" />
            <Field label="ROE tối thiểu (%)" value={minRoe} onChange={setMinRoe} small placeholder="15" />
            <Field label="Cổ tức tối thiểu (%)" value={minDivYield} onChange={setMinDivYield} small placeholder="5" />
            <Field label="Nợ/Vốn CSH tối đa" value={maxDe} onChange={setMaxDe} small placeholder="1.2" />
            <Field label="Vốn hóa min (tỷ)" value={minMarketCap} onChange={setMinMarketCap} small placeholder="1000" />
          </div>
        )}

        {/* View Tabs Bar */}
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5 bg-panel overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewTab("overview")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "overview"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Tổng quan
            </button>
            <button
              type="button"
              onClick={() => {
                setViewTab("orca_master");
                setSortKey("orcaMasterScore");
                setSortOrder("desc");
              }}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "orca_master"
                  ? "bg-panel-3 text-amber-300 font-bold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-amber-400" />
              Orca Master
            </button>
            <button
              type="button"
              onClick={() => {
                setViewTab("smart_money");
                setSortKey("smartMoneyScore");
                setSortOrder("desc");
              }}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "smart_money"
                  ? "bg-panel-3 text-purple-300 font-bold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-purple-400" />
              Dòng Tiền Cá Mập
            </button>
            <button
              type="button"
              onClick={() => {
                setViewTab("buy_point");
                setSortKey("absBuyDiff");
                setSortOrder("asc");
              }}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "buy_point"
                  ? "bg-panel-3 text-emerald-400 font-bold shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Điểm Mua & Kế Hoạch
            </button>
            <button
              type="button"
              onClick={() => setViewTab("quant")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "quant"
                  ? "bg-panel-3 text-cyan-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-cyan-400" />
              Ưu thế Quant Trading
            </button>
            <button
              type="button"
              onClick={() => setViewTab("confluence")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "confluence"
                  ? "bg-panel-3 text-amber-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-amber-400" />
              Siêu Hội Tụ & Mẫu hình
            </button>
            <button
              type="button"
              onClick={() => setViewTab("technical")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                viewTab === "technical"
                  ? "bg-panel-3 text-emerald-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Kỹ thuật & MA
            </button>
            <button
              type="button"
              onClick={() => setViewTab("valuation")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "valuation"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Định giá P/E, P/B
            </button>
            <button
              type="button"
              onClick={() => setViewTab("profitability")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "profitability"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Hiệu quả & Tăng trưởng
            </button>
            <button
              type="button"
              onClick={() => setViewTab("health")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "health"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Sức khỏe tài chính & Nợ
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted hidden lg:inline">
              Sắp xếp: {sortKey} ({sortOrder === "desc" ? "giảm dần" : "tăng dần"})
            </span>
            <div className="flex items-center gap-0.5 rounded-lg bg-panel-2 p-0.5 border border-border-subtle shrink-0">
              <button
                type="button"
                onClick={() => setDisplayMode("table")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold flex items-center gap-1 transition-all ${
                  displayMode === "table" ? "bg-panel-3 text-accent-primary shadow-xs font-bold" : "text-text-muted hover:text-text-primary"
                }`}
                title="Hiển thị dạng bảng chi tiết"
              >
                <List className="size-3" />
                <span className="hidden sm:inline">Dạng Bảng</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode("grid")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold flex items-center gap-1 transition-all ${
                  displayMode === "grid" ? "bg-panel-3 text-accent-primary shadow-xs font-bold" : "text-text-muted hover:text-text-primary"
                }`}
                title="Hiển thị lưới đồ thị nến mini (Finviz Elite)"
              >
                <LayoutGrid className="size-3" />
                <span className="hidden sm:inline">Lưới Đồ Thị</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Screener Content: Multi-Chart Grid View or Table View */}
        {displayMode === "grid" ? (
          <div className="p-3">
            {rows.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-sm">
                Không có cổ phiếu nào thỏa mãn tiêu chí lọc hiện tại
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {rows.map((row) => {
                  const buyDiff =
                    row.buyPointDiffPct ??
                    (row.buyPoint && row.price
                      ? Number((((row.price - row.buyPoint) / row.buyPoint) * 100).toFixed(1))
                      : null);
                  return (
                    <div
                      key={row.symbol}
                      className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-panel-2/60 hover:bg-panel-2 hover:border-accent-primary/50 transition-all p-3 shadow-xs hover:shadow-md"
                    >
                      <div>
                        {/* Header: Symbol, Name, Price, Change */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                href={`/stocks/${row.symbol}`}
                                className="text-[14px] font-bold text-accent-primary hover:underline"
                              >
                                {row.symbol}
                              </Link>
                              {row.isBuyTriggerNow && (
                                <BuyTriggerBadge
                                  isTriggerNow={row.isBuyTriggerNow}
                                  score={row.buyTriggerScore}
                                  reasonVi={row.buyTriggerReasonVi}
                                />
                              )}
                              <span className="rounded bg-panel-3 px-1 py-0.2 text-[9.5px] text-text-muted font-mono">
                                {row.exchange ?? "HOSE"}
                              </span>
                              {row.sector && (
                                <span className="rounded bg-panel-1 px-1.5 py-0.5 text-[9px] text-text-secondary truncate max-w-[110px]">
                                  {row.sector}
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-text-muted truncate max-w-[170px] mt-0.5">
                              {row.name}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-bold font-mono">
                              {row.price != null ? fmtNum(row.price, 2) : "—"}
                            </div>
                            <Chg value={row.changePercent} arrow={false} className="text-[11px] font-semibold" />
                          </div>
                        </div>

                        {/* Mini Candlestick / Sparkline Chart */}
                        <div className="my-1.5">
                          <ScreenerMiniChart
                            symbol={row.symbol}
                            sparkBars={row.sparkBars}
                            sparkline={row.sparkline}
                            buyPoint={row.buyPoint}
                            currentPrice={row.price}
                            height={90}
                          />
                        </div>

                        {/* Quantitative Badges Grid */}
                        <div className="flex items-center gap-1 flex-wrap my-2">
                          {row.isBuyTriggerNow && (
                            <BuyTriggerBadge
                              isTriggerNow={row.isBuyTriggerNow}
                              score={row.buyTriggerScore}
                              reasonVi={row.buyTriggerReasonVi}
                            />
                          )}
                          {row.isDiamondConfluence && (
                            <span
                              title="Tam Hợp Lưu Kim Cương: Hỗ trợ MA + Nến đảo chiều chuẩn + Phân kỳ dương"
                              className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-cyan-500/20 to-amber-500/20 border border-cyan-400/50 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-200"
                            >
                              Tam Hợp Lưu
                            </span>
                          )}
                          {row.isDualDivergence && (
                            <span
                              title="Phân kỳ kép đồng pha: Cả RSI và MACD cùng tạo phân kỳ dương"
                              className="inline-flex items-center gap-1 rounded bg-cyan-500/15 border border-cyan-400/40 px-1.5 py-0.5 text-[9.5px] font-semibold text-cyan-300"
                            >
                              Phân Kỳ Kép
                            </span>
                          )}
                          {row.apexQuantScore != null && (
                            <ApexQuantBadgeComponent
                              score={row.apexQuantScore}
                              category={row.apexCategory}
                              categoryVi={row.apexCategoryVi}
                              reversalStageVi={row.reversalStageVi}
                              isSweetLaunchZone={row.isSweetLaunchZone}
                              extensionFromBottomPct={row.extensionFromBottomPct}
                            />
                          )}
                          {row.historicalEdgeScore != null && (
                            <HistoricalEdgeBadgeComponent
                              score={row.historicalEdgeScore}
                              badge={row.historicalEdgeBadge}
                              winRate={row.historicalWinRate}
                              upDownVol={row.upDownVolRatio}
                            />
                          )}
                          {row.orcaMasterScore != null && (
                            <OrcaMasterBadge
                              score={row.orcaMasterScore}
                              category={row.orcaMasterCategory}
                              strengthVi={row.orcaMasterStrengthVi}
                            />
                          )}
                          {row.smartMoneySignal && row.smartMoneySignal !== "NEUTRAL" && (
                            <SmartMoneyBadge
                              signal={row.smartMoneySignal}
                              signalVi={row.smartMoneySignalVi}
                              score={row.smartMoneyScore}
                              activeBuyRatioPct={row.activeBuyRatioPct}
                            />
                          )}
                          {row.rsRating != null && (
                            <RsRatingBadge rating={row.rsRating} trend={row.rsTrend} />
                          )}
                          {row.piotroskiFScore != null && row.piotroskiFScore >= 7 && (
                            <PiotroskiBadge score={row.piotroskiFScore} />
                          )}
                          {row.maSignal && row.maSignal !== "NEUTRAL" && (
                            <MaSignalBadge signal={row.maSignal} />
                          )}
                          {(row.mtfCandleClusterStatus !== "NO_CLUSTER" || row.vsaSignal) && (
                            <MtfCandleBadge
                              status={row.mtfCandleClusterStatus}
                              badgeVi={row.mtfCandleBadgeVi}
                              score={row.mtfCandleScore}
                              vsaSignal={row.vsaSignal}
                              vsaSignalVi={row.vsaSignalVi}
                              overheadRoomPct={row.overheadRoomPct}
                            />
                          )}
                        </div>

                        {/* Key Metrics row */}
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-panel-1/70 border border-border-subtle/50 p-1.5 text-[10px] mb-2 font-mono">
                          <div>
                            <span className="text-text-muted block text-[9px]">P/E</span>
                            <span className="font-semibold text-text-primary">
                              {row.pe != null ? fmtNum(row.pe, 1) : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block text-[9px]">ROE</span>
                            <span className="font-semibold text-text-primary">
                              {row.roe != null ? `${fmtNum(row.roe, 1)}%` : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block text-[9px]">R:R</span>
                            <span className="font-semibold text-amber-400">
                              {row.tripleBarrierRiskReward != null ? `${fmtNum(row.tripleBarrierRiskReward, 1)}x` : "—"}
                            </span>
                          </div>
                        </div>

                        {/* Buy Zone Execution Plan */}
                        {row.buyPoint != null && (
                          <div className="flex items-center justify-between text-[10.5px] rounded-lg bg-accent-primary/10 border border-accent-primary/20 px-2 py-1 mb-2">
                            <span className="text-text-secondary flex items-center gap-1">
                              Điểm mua: <b className="text-accent-primary">{fmtNum(row.buyPoint, 2)}</b>
                            </span>
                            {buyDiff != null && (
                              <span
                                className={`font-bold text-[10px] ${
                                  Math.abs(buyDiff) <= 1.0
                                    ? "text-emerald-400"
                                    : Math.abs(buyDiff) <= 2.5
                                    ? "text-cyan-400"
                                    : buyDiff > 0
                                    ? "text-amber-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {buyDiff > 0 ? `+${buyDiff}%` : `${buyDiff}%`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions: Backtest & View Detail */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-border-subtle/50 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenBacktest) onOpenBacktest(row.symbol);
                          }}
                          className="flex-1 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10.5px] font-semibold text-emerald-400 text-center transition-all flex items-center justify-center gap-1"
                        >
                          <Zap className="size-3" /> Backtest
                        </button>
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="flex-1 py-1 rounded bg-panel-3 hover:bg-panel-1 border border-border-subtle text-[10.5px] font-semibold text-text-primary text-center transition-all"
                        >
                          Chi tiết →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
        {/* Table Data Views */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3 bg-panel-2/30">
                <th
                  onClick={() => handleSort("symbol")}
                  className="px-3.5 py-2.5 font-medium cursor-pointer hover:text-accent-primary"
                >
                  Mã {sortKey === "symbol" && (sortOrder === "desc" ? "↓" : "↑")}
                </th>
                <th
                  onClick={() => handleSort("sector")}
                  className="py-2.5 font-medium cursor-pointer hover:text-accent-primary"
                >
                  Ngành
                </th>

                {viewTab === "overview" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("volume")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Khối lượng
                    </th>
                    <th
                      onClick={() => handleSort("marketCap")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vốn hóa (tỷ) {sortKey === "marketCap" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("absBuyDiff")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Mua {sortKey === "absBuyDiff" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-center font-medium">Tín hiệu MA</th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca {sortKey === "compositeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                  </>
                )}

                {viewTab === "orca_master" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("orcaMasterScore")}
                      className="py-2.5 text-center font-bold cursor-pointer hover:text-amber-400 text-amber-300"
                    >
                      Orca Master (1-99) {sortKey === "orcaMasterScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("apexQuantScore")}
                      className="py-2.5 text-center font-bold cursor-pointer hover:text-amber-400 text-amber-300"
                    >
                      Chân Sóng Apex {sortKey === "apexQuantScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("historicalEdgeScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-emerald-400 text-emerald-300"
                    >
                      Lợi Thế Lịch Sử {sortKey === "historicalEdgeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-left font-medium">Trụ Cột Dẫn Dắt</th>
                    <th
                      onClick={() => handleSort("rsRating")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-amber-400"
                    >
                      RS Leader {sortKey === "rsRating" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("smartMoneyScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-purple-400"
                    >
                      Dòng Tiền Cá Mập {sortKey === "smartMoneyScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("piotroskiFScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-cyan-400"
                    >
                      Piotroski (0-9) {sortKey === "piotroskiFScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("absBuyDiff")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Mua {sortKey === "absBuyDiff" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-center font-medium">Thao Tác</th>
                  </>
                )}

                {viewTab === "smart_money" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-center font-medium">Tín Hiệu Cá Mập</th>
                    <th
                      onClick={() => handleSort("smartMoneyScore")}
                      className="py-2.5 text-center font-bold cursor-pointer hover:text-purple-400 text-purple-300"
                    >
                      Điểm Cá Mập (0-100) {sortKey === "smartMoneyScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("activeBuyRatioPct")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-emerald-400"
                    >
                      Mua Chủ Động % {sortKey === "activeBuyRatioPct" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("foreignNetVal")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-blue-400"
                    >
                      Khối Ngoại (Tỷ) {sortKey === "foreignNetVal" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("volRatio20")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vol / MA20 {sortKey === "volRatio20" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("absBuyDiff")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Mua {sortKey === "absBuyDiff" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-center font-medium">Thao Tác</th>
                  </>
                )}

                {viewTab === "buy_point" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá Khớp {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("buyPoint")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary text-accent-primary"
                    >
                      Điểm Mua Tối Ưu {sortKey === "buyPoint" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("absBuyDiff")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Độ Lệch vs Giá {sortKey === "absBuyDiff" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-center font-medium">Trạng Thái</th>
                    <th className="py-2.5 text-center font-medium">Vùng Gom Mua</th>
                    <th className="py-2.5 text-left font-medium">Chiến Lược Vào Lệnh</th>
                    <th className="py-2.5 text-right font-medium">Cắt Lỗ (SL)</th>
                    <th className="py-2.5 text-right font-medium">Mục Tiêu (TP)</th>
                    <th
                      onClick={() => handleSort("riskReward")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Tỷ Suất R:R {sortKey === "riskReward" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-center font-medium">Thao Tác</th>
                  </>
                )}

                {viewTab === "quant" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("quantEdgeScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-cyan-400"
                    >
                      Ưu thế Quant {sortKey === "quantEdgeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-left font-medium">Chiến lược / Dị biệt</th>
                    <th
                      onClick={() => handleSort("ouZScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-emerald-400"
                    >
                      OU Z-Score {sortKey === "ouZScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ouHalfLife")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-emerald-400"
                    >
                      Bán rã t½ {sortKey === "ouHalfLife" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("tripleBarrierRiskReward")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-amber-400"
                    >
                      R/R Barrier {sortKey === "tripleBarrierRiskReward" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-right font-medium">Chốt lời / Dừng lỗ</th>
                    <th
                      onClick={() => handleSort("beta")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Beta {sortKey === "beta" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("cornishFisherVaR95")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-rose-400"
                    >
                      VaR 95% {sortKey === "cornishFisherVaR95" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-center font-medium">Mô phỏng</th>
                  </>
                )}

                {viewTab === "confluence" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("adx14")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ADX(14)
                    </th>
                    <th className="py-2.5 text-center font-medium">Nén Squeeze</th>
                    <th className="py-2.5 text-center font-medium">SuperTrend</th>
                    <th className="py-2.5 text-left font-medium">Mẫu hình & VSA</th>
                    <th
                      onClick={() => handleSort("confluenceScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Hội Tụ {sortKey === "confluenceScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-right font-medium">Đánh giá</th>
                  </>
                )}

                {viewTab === "technical" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("rsRating")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-amber-400"
                    >
                      RS (1-99) {sortKey === "rsRating" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ma10")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA10
                    </th>
                    <th
                      onClick={() => handleSort("ma20")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA20
                    </th>
                    <th
                      onClick={() => handleSort("ma50")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA50
                    </th>
                    <th
                      onClick={() => handleSort("volRatio20")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vol/MA20
                    </th>
                    <th className="py-2.5 text-center font-medium">Tín hiệu MA</th>
                    <th className="py-2.5 text-left font-medium">Mẫu hình VCP / Nến</th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca {sortKey === "compositeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                  </>
                )}

                {viewTab === "valuation" && (
                  <>
                    <th onClick={() => handleSort("price")} className="py-2.5 text-right font-medium">
                      Giá
                    </th>
                    <th
                      onClick={() => handleSort("pe")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/E {sortKey === "pe" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("pb")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/B {sortKey === "pb" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ps")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/S
                    </th>
                    <th
                      onClick={() => handleSort("dividendYield")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Cổ tức (%) {sortKey === "dividendYield" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("marketCap")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vốn hóa (tỷ)
                    </th>
                  </>
                )}

                {viewTab === "profitability" && (
                  <>
                    <th
                      onClick={() => handleSort("roe")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ROE (%) {sortKey === "roe" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("roa")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ROA (%)
                    </th>
                    <th onClick={() => handleSort("grossMargin")} className="py-2.5 text-right font-medium">
                      Biên Gộp (%)
                    </th>
                    <th onClick={() => handleSort("netMargin")} className="py-2.5 text-right font-medium">
                      Biên Ròng (%)
                    </th>
                    <th
                      onClick={() => handleSort("revenueYoyPct")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      DT YoY (%)
                    </th>
                    <th
                      onClick={() => handleSort("niYoyPct")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      LNST YoY (%)
                    </th>
                  </>
                )}

                {viewTab === "health" && (
                  <>
                    <th
                      onClick={() => handleSort("piotroskiFScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-cyan-400"
                    >
                      Piotroski (0-9) {sortKey === "piotroskiFScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("altmanZScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-emerald-400"
                    >
                      Altman Z'' {sortKey === "altmanZScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("debtEquity")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Nợ/Vốn (D/E) {sortKey === "debtEquity" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th onClick={() => handleSort("currentRatio")} className="py-2.5 text-right font-medium">
                      Thanh toán (CR)
                    </th>
                    <th onClick={() => handleSort("fcfTtm")} className="py-2.5 text-right font-medium">
                      FCF TTM (tỷ)
                    </th>
                    <th
                      onClick={() => handleSort("qualityScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Chất lượng BCTC
                    </th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={viewTab === "quant" ? 13 : viewTab === "buy_point" ? 12 : viewTab === "confluence" ? 10 : 9} className="px-3.5 py-8 text-center text-text-muted">
                    <Loading rows={4} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={viewTab === "quant" ? 13 : viewTab === "buy_point" ? 12 : viewTab === "confluence" ? 10 : 9} className="px-3.5 py-8 text-center text-text-muted">
                    Không có mã nào thỏa mãn tiêu chí bộ lọc. Hãy thử nới lỏng các điều kiện lọc.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.symbol} className="row-hover border-b border-line/40 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="font-bold text-accent-primary hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        {row.isBuyTriggerNow && (
                          <BuyTriggerBadge
                            isTriggerNow={row.isBuyTriggerNow}
                            score={row.buyTriggerScore}
                            reasonVi={row.buyTriggerReasonVi}
                          />
                        )}
                        {row.isDiamondConfluence && (
                          <span
                            title="Tam Hợp Lưu Kim Cương: Hỗ trợ MA + Nến đảo chiều chuẩn + Phân kỳ dương"
                            className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-cyan-500/20 to-amber-500/20 border border-cyan-400/50 px-1 py-0.2 text-[9px] font-bold text-cyan-200"
                          >
                            Tam Hợp Lưu
                          </span>
                        )}
                        {row.isDualDivergence && (
                          <span
                            title="Phân kỳ kép đồng pha: Cả RSI và MACD cùng tạo phân kỳ dương"
                            className="inline-flex items-center gap-1 rounded bg-cyan-500/15 border border-cyan-400/40 px-1 py-0.2 text-[9px] font-semibold text-cyan-300"
                          >
                            Phân Kỳ Kép
                          </span>
                        )}
                        {row.exchange && (
                          <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                            {row.exchange}
                          </span>
                        )}
                        {row.rsRating != null && (
                          <RsRatingBadge rating={row.rsRating} trend={row.rsTrend} />
                        )}
                      </div>
                      <div className="max-w-[140px] truncate text-[10px] text-text-muted">
                        {row.name}
                      </div>
                    </td>
                    <td className="py-2.5 text-[11px] text-text-secondary">{row.sector}</td>

                    {viewTab === "overview" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {fmtCompact(row.volume)}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-secondary">
                          {row.marketCap != null ? fmtNum(row.marketCap, 0) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-mono">
                          {row.buyPoint != null ? (
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-accent-primary">{fmtNum(row.buyPoint, 2)}</span>
                              {row.buyPointDiffPct != null && (
                                <span
                                  className={`text-[9.5px] font-bold ${
                                    Math.abs(row.buyPointDiffPct) <= 1.0
                                      ? "text-emerald-400"
                                      : Math.abs(row.buyPointDiffPct) <= 2.5
                                      ? "text-cyan-400"
                                      : row.buyPointDiffPct > 0
                                      ? "text-amber-400"
                                      : "text-rose-400"
                                  }`}
                                >
                                  {row.buyPointDiffPct > 0 ? `+${row.buyPointDiffPct}%` : `${row.buyPointDiffPct}%`}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <MaSignalBadge signal={row.maSignal} />
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                              row.compositeScore >= 75
                                ? "bg-emerald-500/15 text-emerald-400"
                                : row.compositeScore >= 50
                                ? "bg-accent-primary/15 text-accent-primary"
                                : "bg-amber-500/15 text-amber-400"
                            }`}
                          >
                            {row.compositeScore}
                          </span>
                        </td>
                      </>
                    )}

                    {viewTab === "orca_master" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="py-2.5 text-center">
                          <OrcaMasterBadge
                            score={row.orcaMasterScore}
                            category={row.orcaMasterCategory}
                            strengthVi={row.orcaMasterStrengthVi}
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <ApexQuantBadgeComponent
                            score={row.apexQuantScore}
                            category={row.apexCategory}
                            categoryVi={row.apexCategoryVi}
                            reversalStageVi={row.reversalStageVi}
                            isSweetLaunchZone={row.isSweetLaunchZone}
                            extensionFromBottomPct={row.extensionFromBottomPct}
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <HistoricalEdgeBadgeComponent
                            score={row.historicalEdgeScore}
                            badge={row.historicalEdgeBadge}
                            winRate={row.historicalWinRate}
                            upDownVol={row.upDownVolRatio}
                          />
                        </td>
                        <td className="py-2.5 text-left">
                          <span className="text-[11px] text-text-secondary truncate max-w-[150px] inline-block font-medium">
                            {row.orcaMasterStrengthVi ?? "Đa trụ cột đồng thuận"}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <RsRatingBadge rating={row.rsRating} trend={row.rsTrend} />
                        </td>
                        <td className="py-2.5 text-center">
                          <SmartMoneyBadge
                            signal={row.smartMoneySignal}
                            signalVi={row.smartMoneySignalVi}
                            score={row.smartMoneyScore}
                            activeBuyRatioPct={row.activeBuyRatioPct}
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <PiotroskiBadge score={row.piotroskiFScore} rating={row.piotroskiRating} />
                        </td>
                        <td className="num py-2.5 text-right font-bold text-accent-primary">
                          {row.buyPoint != null ? fmtNum(row.buyPoint, 2) : "—"}
                          {row.absBuyDiff != null && (
                            <span className="ml-1 text-[10px] text-text-muted">({row.absBuyDiff.toFixed(1)}%)</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenBacktest) onOpenBacktest(row.symbol);
                            }}
                            className="rounded px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95"
                          >
                            Backtest
                          </button>
                        </td>
                      </>
                    )}

                    {viewTab === "smart_money" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="py-2.5 text-center">
                          <SmartMoneyBadge
                            signal={row.smartMoneySignal}
                            signalVi={row.smartMoneySignalVi}
                            score={row.smartMoneyScore}
                            activeBuyRatioPct={row.activeBuyRatioPct}
                          />
                        </td>
                        <td className="num py-2.5 text-center font-bold text-purple-300">
                          {row.smartMoneyScore != null ? `${row.smartMoneyScore}đ` : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold text-emerald-400">
                          {row.activeBuyRatioPct != null ? `${row.activeBuyRatioPct}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.foreignNetVal != null ? (
                            <span className={row.foreignNetVal > 0 ? "text-emerald-400" : row.foreignNetVal < 0 ? "text-rose-400" : "text-text-muted"}>
                              {row.foreignNetVal > 0 ? "+" : ""}{row.foreignNetVal} tỷ
                            </span>
                          ) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.volRatio20 != null ? `${row.volRatio20.toFixed(2)}x` : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-bold text-accent-primary">
                          {row.buyPoint != null ? fmtNum(row.buyPoint, 2) : "—"}
                          {row.chartPattern && (
                            <span className="block text-[9px] text-text-muted font-normal truncate max-w-[110px]">{row.chartPattern}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenBacktest) onOpenBacktest(row.symbol);
                            }}
                            className="rounded px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95"
                          >
                            Backtest
                          </button>
                        </td>
                      </>
                    )}

                    {viewTab === "buy_point" && (
                      <>
                        <td className="num py-2.5 text-right font-bold text-text-primary">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-black text-accent-primary font-mono">
                          {row.buyPoint != null ? fmtNum(row.buyPoint, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-center font-mono">
                          {row.buyPointDiffPct != null ? (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                                Math.abs(row.buyPointDiffPct) <= 1.0
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : Math.abs(row.buyPointDiffPct) <= 2.5
                                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                  : row.buyPointDiffPct > 0
                                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                              }`}
                            >
                              {row.buyPointDiffPct > 0 ? `+${row.buyPointDiffPct}%` : `${row.buyPointDiffPct}%`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          {row.buyZoneStatus === "AT_BUY_POINT" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 whitespace-nowrap shadow-sm">
                              <Zap className="size-3 text-emerald-300" /> NGAY ĐIỂM MUA
                            </span>
                          ) : row.buyZoneStatus === "NEAR_BUY_POINT" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-bold text-cyan-300 whitespace-nowrap">
                              SÁT ĐIỂM MUA
                            </span>
                          ) : row.buyZoneStatus === "WAIT_PULLBACK" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300 whitespace-nowrap">
                              CHỜ CHỈNH
                            </span>
                          ) : row.buyZoneStatus === "BELOW_SUPPORT" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-medium text-rose-300 whitespace-nowrap">
                              DƯỚI HỖ TRỢ
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-muted">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center font-mono text-[11px] text-text-secondary">
                          {row.buyRange ? `${fmtNum(row.buyRange[0], 2)} – ${fmtNum(row.buyRange[1], 2)}` : "—"}
                        </td>
                        <td className="py-2.5 text-left text-[11px] font-medium text-text-primary truncate max-w-[190px]">
                          <div>{row.buyStrategy ?? "Bệ đỡ hội tụ"}</div>
                          {row.isMtfAligned && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400">
                              Đồng thuận H1·D1·W1
                            </span>
                          )}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-rose-400 font-mono">
                          {row.stopLoss != null ? fmtNum(row.stopLoss, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-emerald-400 font-mono">
                          {row.targetPrice != null ? fmtNum(row.targetPrice, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-bold text-amber-400 font-mono">
                          {row.riskReward != null ? `${row.riskReward}R` : "—"}
                        </td>
                        <td className="py-2.5 pr-3.5 text-center">
                          <Link
                            href={`/stocks/${row.symbol}`}
                            className="inline-flex items-center gap-1 rounded bg-panel-3 px-2 py-0.5 text-[10.5px] font-medium text-accent-primary hover:bg-accent-primary hover:text-white transition-colors"
                          >
                            <span>Chi tiết</span>
                          </Link>
                        </td>
                      </>
                    )}

                    {viewTab === "quant" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "-"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="py-2.5 text-center">
                          <QuantBadge badge={row.quantBadge} score={row.quantEdgeScore} />
                        </td>
                        <td className="py-2.5 text-left">
                          {row.quantAnomalyTag ? (
                            <span className="inline-block text-[11px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                              {row.quantAnomalyTag}
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-muted">—</span>
                          )}
                        </td>
                        <td className="num py-2.5 text-right">
                          {row.ouZScore != null ? (
                            <span
                              className={`font-semibold ${
                                row.ouZScore <= -1.4
                                  ? "text-emerald-400"
                                  : row.ouZScore >= 1.4
                                  ? "text-rose-400"
                                  : "text-text-primary"
                              }`}
                            >
                              {row.ouZScore > 0 ? `+${row.ouZScore}` : row.ouZScore}σ
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.ouHalfLife != null ? `${row.ouHalfLife} phiên` : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.tripleBarrierRiskReward != null ? (
                            <span
                              className={
                                row.tripleBarrierRiskReward >= 2.0
                                  ? "text-amber-400 font-bold"
                                  : "text-text-primary"
                              }
                            >
                              {fmtNum(row.tripleBarrierRiskReward, 2)}x
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-[11px]">
                          {row.tripleBarrierUpper != null && row.tripleBarrierLower != null ? (
                            <span className="text-text-muted">
                              <span className="text-emerald-400 font-medium">{fmtNum(row.tripleBarrierUpper / 1000, 1)}</span>
                              {" / "}
                              <span className="text-rose-400 font-medium">{fmtNum(row.tripleBarrierLower / 1000, 1)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.beta != null ? fmtNum(row.beta, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.cornishFisherVaR95 != null ? `-${fmtNum(row.cornishFisherVaR95, 1)}%` : "—"}
                        </td>
                        <td className="py-2.5 pr-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => onOpenBacktest ? onOpenBacktest(row.symbol) : undefined}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400 transition-colors"
                          >
                            <Zap className="size-2.5" /> Backtest
                          </button>
                        </td>
                      </>
                    )}

                {viewTab === "confluence" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.adx14 != null ? (
                            <span className={row.adx14 >= 25 ? "text-amber-400 font-bold" : "text-text-muted"}>
                              {row.adx14}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <SqueezeBadge state={row.squeezeState} />
                        </td>
                        <td className="py-2.5 text-center">
                          <SuperTrendBadge dir={row.superTrendDir} />
                        </td>
                        <td className="py-2.5 text-left">
                          <div className="flex flex-col gap-1 items-start">
                            {row.chartPattern ? (
                              <span className="inline-block rounded bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
                                {row.chartPattern}
                              </span>
                            ) : null}
                            {row.candlePattern && row.candlePattern !== row.chartPattern ? (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-300">
                                {row.candlePattern} {row.candleAgeBars === 0 ? <span className="text-[9px] text-emerald-400 font-bold">(T+0)</span> : row.candleAgeBars != null ? <span className="text-[9px] text-text-muted font-normal">(T-{row.candleAgeBars})</span> : null}
                              </span>
                            ) : null}
                            {!row.chartPattern && !row.candlePattern && (
                              <span className="text-[10px] text-text-muted">—</span>
                            )}
                            <div className="flex flex-wrap gap-1 items-center">
                              {row.isMtfAligned ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded bg-gradient-to-r from-emerald-500/25 to-amber-500/25 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300"
                                  title={row.mtfSummary || "Đồng thuận Tăng Đa Khung: H1 🟢 · D1 🟢 · W1 🟢"}
                                >
                                  H1·D1·W1 🟢🟢🟢
                                </span>
                              ) : row.mtfConsensus === "D1_W1_BULL" ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded bg-blue-500/20 border border-blue-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-blue-300"
                                  title={row.mtfSummary || "Đồng thuận D1 + W1 Tăng"}
                                >
                                  D1·W1 🟢🟢⚪
                                </span>
                              ) : null}
                              {row.hasBullishDivergence && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300">
                                  {row.divergenceSummary || "Phân kỳ dương"}
                                </span>
                              )}
                              {row.foreignAccumulating && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                                  NN Gom {row.foreignNetVal ? `+${row.foreignNetVal}tỷ` : ""}
                                </span>
                              )}
                              {row.isMarketLeader && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.2 text-[9px] font-bold text-purple-300">
                                  RS Leader {row.rsRating20 ? `+${row.rsRating20}%` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="num py-2.5 text-right font-bold text-accent-primary">
                          {row.confluenceScore}
                        </td>
                        <td className="py-2.5 pr-3.5 text-right">
                          <ConfluenceBadge badge={row.confluenceBadge} />
                        </td>
                      </>
                    )}

                    {viewTab === "technical" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="py-2.5 text-center">
                          <RsRatingBadge rating={row.rsRating} trend={row.rsTrend} />
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.ma10 != null ? fmtNum(row.ma10, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.ma20 != null ? fmtNum(row.ma20, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.ma50 != null ? fmtNum(row.ma50, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium">
                          {row.volRatio20 != null ? (
                            <span className={row.volRatio20 >= 1.3 ? "text-emerald-400 font-bold" : "text-text-muted"}>
                              {row.volRatio20}x
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <MaSignalBadge signal={row.maSignal} />
                        </td>
                        <td className="py-2.5 text-left text-[11px]">
                          {row.vcpDepths && row.vcpDepths.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-accent-primary text-[10.5px]">
                                VCP ({row.vcpDepths.length} nhịp: {row.vcpDepths.map((d) => `-${d}%`).join(" → ")})
                              </span>
                              {row.vcpPivot && (
                                <span className="text-[9.5px] text-text-muted">
                                  Pivot: <strong className="num text-text-primary">{fmtNum(row.vcpPivot, 2)}</strong>
                                </span>
                              )}
                            </div>
                          ) : row.chartPattern ? (
                            <span className="inline-block rounded bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
                              {row.chartPattern}
                            </span>
                          ) : row.candlePattern ? (
                            <span className="inline-block rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-300">
                              {row.candlePattern}
                            </span>
                          ) : (
                            <span className="text-text-muted text-[10px]">—</span>
                          )}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                              row.compositeScore >= 75
                                ? "bg-emerald-500/15 text-emerald-400"
                                : row.compositeScore >= 50
                                ? "bg-accent-primary/15 text-accent-primary"
                                : "bg-amber-500/15 text-amber-400"
                            }`}
                          >
                            {row.compositeScore}
                          </span>
                        </td>
                      </>
                    )}

                    {viewTab === "valuation" && (
                      <>
                        <td className="num py-2.5 text-right font-medium">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold text-text-primary">
                          {row.pe != null ? fmtNum(row.pe, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.pb != null ? fmtNum(row.pb, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.ps != null ? fmtNum(row.ps, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-emerald-400 font-medium">
                          {row.dividendYield != null ? `${fmtNum(row.dividendYield, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right text-text-secondary">
                          {row.marketCap != null ? fmtNum(row.marketCap, 0) : "—"}
                        </td>
                      </>
                    )}

                    {viewTab === "profitability" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold text-text-primary">
                          {row.roe != null ? `${fmtNum(row.roe, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.roa != null ? `${fmtNum(row.roa, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.grossMargin != null ? `${fmtNum(row.grossMargin, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.netMargin != null ? `${fmtNum(row.netMargin, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right">
                          <Chg value={row.revenueYoyPct} arrow={false} />
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right font-medium">
                          <Chg value={row.niYoyPct} arrow={false} />
                        </td>
                      </>
                    )}

                    {viewTab === "health" && (
                      <>
                        <td className="py-2.5 text-center">
                          <PiotroskiBadge score={row.piotroskiFScore} rating={row.piotroskiRating} />
                        </td>
                        <td className="py-2.5 text-center">
                          <AltmanBadge zone={row.altmanZone} zScore={row.altmanZScore} />
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-primary">
                          {row.debtEquity != null ? fmtNum(row.debtEquity, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.currentRatio != null ? fmtNum(row.currentRatio, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.fcfTtm != null ? fmtNum(row.fcfTtm, 0) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-secondary">
                          {row.qualityScore != null ? `${row.qualityScore}/100` : "—"}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right font-bold text-accent-primary">
                          {row.compositeScore}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Feed View */}
        <div className="divide-y divide-line/50 md:hidden">
          {rows.map((row) => (
            <Link
              key={row.symbol}
              href={`/stocks/${row.symbol}`}
              className="flex items-center justify-between px-3.5 py-3 hover:bg-panel-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-bold text-accent-primary">{row.symbol}</span>
                  {row.exchange && (
                    <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                      {row.exchange}
                    </span>
                  )}
                  {row.orcaMasterScore != null && row.orcaMasterScore >= 75 && (
                    <OrcaMasterBadge score={row.orcaMasterScore} category={row.orcaMasterCategory} />
                  )}
                  {row.historicalEdgeScore != null && row.historicalEdgeScore >= 60 && (
                    <HistoricalEdgeBadgeComponent
                      score={row.historicalEdgeScore}
                      badge={row.historicalEdgeBadge}
                      winRate={row.historicalWinRate}
                      upDownVol={row.upDownVolRatio}
                    />
                  )}
                  {row.smartMoneySignal && row.smartMoneySignal !== "NEUTRAL" && (
                    <SmartMoneyBadge signal={row.smartMoneySignal} signalVi={row.smartMoneySignalVi} score={row.smartMoneyScore} activeBuyRatioPct={row.activeBuyRatioPct} />
                  )}
                  {row.rsRating != null && (
                    <RsRatingBadge rating={row.rsRating} trend={row.rsTrend} />
                  )}
                  {row.piotroskiFScore != null && row.piotroskiFScore >= 7 && (
                    <PiotroskiBadge score={row.piotroskiFScore} />
                  )}
                  {row.maSignal && row.maSignal !== "NEUTRAL" && (
                    <MaSignalBadge signal={row.maSignal} />
                  )}
                  {row.quantEdgeScore != null && row.quantEdgeScore >= 55 && (
                    <QuantBadge badge={row.quantBadge} score={row.quantEdgeScore} />
                  )}
                  {(row.mtfCandleClusterStatus !== "NO_CLUSTER" || row.vsaSignal) && (
                    <MtfCandleBadge
                      status={row.mtfCandleClusterStatus}
                      badgeVi={row.mtfCandleBadgeVi}
                      score={row.mtfCandleScore}
                      vsaSignal={row.vsaSignal}
                      vsaSignalVi={row.vsaSignalVi}
                      overheadRoomPct={row.overheadRoomPct}
                    />
                  )}
                </div>
                <div className="truncate text-[11px] text-text-muted">{row.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-secondary flex-wrap">
                  {row.quantAnomalyTag && (
                    <span className="text-[10px] text-cyan-400 font-medium">[{row.quantAnomalyTag}]</span>
                  )}
                  <span>P/E: {row.pe != null ? fmtNum(row.pe, 1) : "—"}</span>
                  <span>·</span>
                  <span>ROE: {row.roe != null ? `${fmtNum(row.roe, 1)}%` : "—"}</span>
                  <span>·</span>
                  <span>Điểm: {row.compositeScore}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="num block text-[13px] font-semibold">
                  {row.price != null ? fmtNum(row.price, 2) : "—"}
                </span>
                <Chg value={row.changePercent} arrow={false} className="text-[11px]" />
              </div>
            </Link>
          ))}
        </div>
        </>
        )}

        <div className="border-t border-line px-3.5 py-2">
          <MetaLine meta={meta} />
        </div>
      </Panel>

      {/* Custom Screener Builder Modal */}
      <CustomScreenerBuilder
        isOpen={showCustomBuilder}
        onClose={() => setShowCustomBuilder(false)}
        onApplyPreset={handleApplyCustomPreset}
      />
    </div>
  );
}

export function CryptoScreener() {
  const [url] = useState("/api/v1/screener?universe=crypto&limit=40");
  const { res, data, meta, isLoading } = useApi<{ universe: string; rows: CryptoMarketRow[] }>(url, {
    refreshInterval: 30_000,
    timeoutMs: 5_000,
  });
  const activeRows = data?.rows?.length ? data.rows : [];
  return (
    <Panel title={`Crypto: ${activeRows.length} mã`} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
              <th className="px-3.5 py-2">Mã</th>
              <th className="py-2 text-right">Giá</th>
              <th className="py-2 text-right">24h %</th>
              <th className="py-2 pr-3.5 text-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.symbol} className="row-hover border-b border-line/40">
                <td className="px-3.5 py-2">
                  <Link href={`/crypto/${r.symbol}`} className="font-semibold hover:text-accent">
                    {r.baseAsset}
                  </Link>
                </td>
                <td className="num py-2 text-right">{fmtNum(r.price, priceDigits(r.price))}</td>
                <td className="py-2 text-right">
                  <Chg value={r.changePercent} arrow={false} />
                </td>
                <td className="num py-2 pr-3.5 text-right text-ink-2">
                  {fmtCompact(r.quoteVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-3.5 py-2">
        <MetaLine meta={meta} />
      </div>
    </Panel>
  );
}
