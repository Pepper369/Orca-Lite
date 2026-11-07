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
import { ScreenerMatrixToolbar } from "@/components/screener-matrix-toolbar";
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
  subtype,
  labelVi,
  entryMin,
  entryMax,
  stopLoss,
  target1,
  target2,
  riskReward,
}: {
  isTriggerNow?: boolean | null;
  score?: number | null;
  reasonVi?: string | null;
  subtype?: "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | string | null;
  labelVi?: string | null;
  entryMin?: number | null;
  entryMax?: number | null;
  stopLoss?: number | null;
  target1?: number | null;
  target2?: number | null;
  riskReward?: number | null;
}) {
  if (!isTriggerNow) return null;

  const tooltipParts = [
    `Điểm Mua Kích Hoạt Tức Thời: ${score ? `${score}/100đ` : "Kích hoạt"}`,
    labelVi ? `Chiến lược: ${labelVi}` : subtype ? `Kịch bản: ${subtype}` : null,
    entryMin != null && entryMax != null ? `Vùng mua: [${fmtNum(entryMin, 2)} - ${fmtNum(entryMax, 2)}]` : null,
    stopLoss != null ? `Cắt lỗ (SL): ${fmtNum(stopLoss, 2)}` : null,
    target1 != null ? `Mục tiêu (TP1): ${fmtNum(target1, 2)}` : null,
    target2 != null ? `Mục tiêu (TP2): ${fmtNum(target2, 2)}` : null,
    riskReward != null ? `Tỷ lệ R:R: ${riskReward.toFixed(1)}x` : null,
    reasonVi ? `Luận điểm: ${reasonVi}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <span
      title={tooltipParts}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-xs tracking-tight"
    >
      <span className="relative flex size-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
      </span>
      <span>⚡ MUA NGAY</span>
      {labelVi && (
        <span className="hidden sm:inline font-semibold text-emerald-200">
          {labelVi}
        </span>
      )}
      {riskReward != null && (
        <span className="rounded bg-emerald-500/40 px-1 py-0.2 text-[9px] text-amber-200 font-mono font-bold">
          {riskReward.toFixed(1)}R
        </span>
      )}
      {score != null && (
        <span className="rounded bg-emerald-500/30 px-1 py-0.2 text-[9px] text-emerald-200 num">
          {score}
        </span>
      )}
    </span>
  );
}

export function SniperTradePlanBadge({
  subtype,
  labelVi,
  entryMin,
  entryMax,
  stopLoss,
  target1,
  target2,
  riskReward,
  reasonVi,
}: {
  subtype?: "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | string | null;
  labelVi?: string | null;
  entryMin?: number | null;
  entryMax?: number | null;
  stopLoss?: number | null;
  target1?: number | null;
  target2?: number | null;
  riskReward?: number | null;
  reasonVi?: string | null;
}) {
  if (!subtype) return null;

  let colorClasses = "bg-emerald-500/15 border-emerald-400/50 text-emerald-300";
  let iconText = "🎯";
  if (subtype === "SQUEEZE_BREAKOUT") {
    colorClasses = "bg-cyan-500/15 border-cyan-400/50 text-cyan-300";
    iconText = "⚡";
  } else if (subtype === "SWEEP_RECLAIM") {
    colorClasses = "bg-amber-500/15 border-amber-400/50 text-amber-300";
    iconText = "🔄";
  }

  const tooltipParts = [
    `Kế hoạch Sniper: ${labelVi || subtype}`,
    entryMin != null && entryMax != null ? `Vùng mua: [${fmtNum(entryMin, 2)} - ${fmtNum(entryMax, 2)}]` : null,
    stopLoss != null ? `Cắt lỗ (SL): ${fmtNum(stopLoss, 2)}` : null,
    target1 != null ? `TP1: ${fmtNum(target1, 2)}` : null,
    target2 != null ? `TP2: ${fmtNum(target2, 2)}` : null,
    riskReward != null ? `Tỷ lệ R:R: ${riskReward.toFixed(1)}x` : null,
    reasonVi ? `Luận điểm: ${reasonVi}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      title={tooltipParts}
      className={`inline-flex flex-col gap-0.5 rounded-md border px-2 py-1 text-[10px] ${colorClasses} shadow-xs select-none`}
    >
      <div className="flex items-center gap-1 font-bold">
        <span>{iconText}</span>
        <span className="truncate max-w-[130px]">{labelVi || subtype}</span>
        {riskReward != null && (
          <span className="ml-auto rounded bg-black/30 px-1 py-0.2 text-[9px] font-mono font-black text-amber-300 border border-amber-400/30">
            {riskReward.toFixed(1)}R
          </span>
        )}
      </div>
      {(entryMin != null || stopLoss != null) && (
        <div className="flex items-center gap-1.5 text-[9px] font-mono opacity-90">
          {entryMin != null && entryMax != null && (
            <span title="Vùng gom tối ưu">Mua: {fmtNum(entryMin, 1)}-{fmtNum(entryMax, 1)}</span>
          )}
          {stopLoss != null && (
            <span className="text-rose-400 font-semibold" title="Điểm cắt lỗ Invalidation">SL: {fmtNum(stopLoss, 1)}</span>
          )}
        </div>
      )}
    </div>
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
  grade,
  pillarsPassed,
}: {
  badge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" | string | null | undefined;
  score?: number | null;
  grade?: "A+" | "A" | "B" | "C" | string | null;
  pillarsPassed?: number | null;
}) {
  if (grade === "A+" || badge === "SUPER_SETUP") {
    return (
      <span
        title={`Hợp lưu Hạng A+ (Hoàn hảo ${pillarsPassed ?? 5}/5 Trục độc lập)`}
        className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-amber-500/25 to-purple-500/25 border border-amber-400/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 whitespace-nowrap shadow-sm"
      >
        HẠNG A+ {pillarsPassed ? `(${pillarsPassed}/5)` : ""} {score ? `· ${score}đ` : ""}
      </span>
    );
  }
  if (grade === "A" || badge === "POTENTIAL_BREAKOUT") {
    return (
      <span
        title={`Hợp lưu Hạng A (Tối ưu ${pillarsPassed ?? 4}/5 Trục độc lập)`}
        className="inline-flex items-center gap-1 rounded bg-accent-primary/20 border border-accent-primary/50 px-2 py-0.5 text-[10px] font-bold text-accent-primary whitespace-nowrap"
      >
        HẠNG A {pillarsPassed ? `(${pillarsPassed}/5)` : ""} {score ? `· ${score}đ` : ""}
      </span>
    );
  }
  if (grade === "B" || badge === "WATCH") {
    return (
      <span
        title={`Hợp lưu Hạng B (Đạt chuẩn ${pillarsPassed ?? 3}/5 Trục độc lập)`}
        className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 whitespace-nowrap"
      >
        Hạng B {pillarsPassed ? `(${pillarsPassed}/5)` : ""} {score ? `· ${score}đ` : ""}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{score ? `${score}đ` : "—"}</span>;
}

export function FiboGoldenPocketBadge({
  isGoldenPocket,
  summary,
}: {
  isGoldenPocket?: boolean | null;
  summary?: string | null;
}) {
  if (!isGoldenPocket) return null;
  return (
    <span
      title={summary || "Chạm bật Golden Pocket Fibo 0.618 - 0.65"}
      className="inline-flex items-center gap-0.5 rounded bg-purple-500/25 border border-purple-400/50 px-1.5 py-0.2 text-[9px] font-bold text-purple-200"
    >
      Fibo GP 0.618
    </span>
  );
}

export function FlipZoneBadge({
  isFlipZone,
  summary,
}: {
  isFlipZone?: boolean | null;
  summary?: string | null;
}) {
  if (!isFlipZone) return null;
  return (
    <span
      title={summary || "Retest Flip Zone Hỗ trợ mới (Role Reversal)"}
      className="inline-flex items-center gap-0.5 rounded bg-blue-500/25 border border-blue-400/50 px-1.5 py-0.2 text-[9px] font-bold text-blue-200"
    >
      Flip Zone
    </span>
  );
}

export function SmcOrderBlockBadge({
  isOrderBlock,
  summary,
}: {
  isOrderBlock?: boolean | null;
  summary?: string | null;
}) {
  if (!isOrderBlock) return null;
  return (
    <span
      title={summary || "Tín hiệu Order Block (OB) / Dòng tiền tạo lập gom hàng"}
      className="inline-flex items-center gap-0.5 rounded bg-indigo-500/25 border border-indigo-400/50 px-1.5 py-0.2 text-[9px] font-bold text-indigo-200"
    >
      SMC OB
    </span>
  );
}

export function SqueezeBadge({
  state,
  bars,
  slope,
}: {
  state?: string | null | undefined;
  bars?: number | null | undefined;
  slope?: string | null | undefined;
}) {
  if (state === "fired_bull") {
    return (
      <span
        title={`Bứt phá Volatility Squeeze Tăng${slope ? ` (${slope})` : ""}`}
        className="inline-flex items-center gap-1 rounded bg-emerald-500/25 border border-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200 whitespace-nowrap animate-pulse"
      >
        <span className="size-1.5 rounded-full bg-emerald-400" />
        Nổ Squeeze
      </span>
    );
  }
  if (state === "fired_bear") {
    return (
      <span
        title="Gãy giảm Volatility Squeeze (Cảnh báo Bán)"
        className="inline-flex items-center gap-1 rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-rose-400" />
        Gãy Squeeze
      </span>
    );
  }
  if (state === "squeeze_on") {
    return (
      <span
        title={`Đang nén biến động (${bars ? `${bars} phiên` : "chặt"})${slope ? ` · Đà: ${slope}` : ""}`}
        className="inline-flex items-center gap-1 rounded bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-purple-400" />
        Nén {bars ? `${bars}P` : "Squeeze"}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function SectorRrgBadge({
  quadrant,
  rsRatio,
  rsMomentum,
}: {
  quadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | string | null | undefined;
  rsRatio?: number | null | undefined;
  rsMomentum?: number | null | undefined;
}) {
  if (!quadrant) return null;
  if (quadrant === "LEADING") {
    return (
      <span
        title={`Ngành Dẫn Dắt (Leading RRG) · RS-Ratio: ${rsRatio?.toFixed(1) ?? "—"}, RS-Mom: ${rsMomentum?.toFixed(1) ?? "—"}`}
        className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-emerald-400" />
        Dẫn dắt RRG
      </span>
    );
  }
  if (quadrant === "IMPROVING") {
    return (
      <span
        title={`Ngành Cải Thiện (Improving RRG) · RS-Ratio: ${rsRatio?.toFixed(1) ?? "—"}, RS-Mom: ${rsMomentum?.toFixed(1) ?? "—"}`}
        className="inline-flex items-center gap-1 rounded bg-blue-500/20 border border-blue-500/40 px-1.5 py-0.5 text-[9.5px] font-medium text-blue-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-blue-400" />
        Cải thiện RRG
      </span>
    );
  }
  if (quadrant === "WEAKENING") {
    return (
      <span
        title={`Ngành Suy Yếu (Weakening RRG) · RS-Ratio: ${rsRatio?.toFixed(1) ?? "—"}, RS-Mom: ${rsMomentum?.toFixed(1) ?? "—"}`}
        className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] text-amber-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-amber-400" />
        Suy yếu RRG
      </span>
    );
  }
  if (quadrant === "LAGGING") {
    return (
      <span
        title={`Ngành Tụt Hậu (Lagging RRG) · RS-Ratio: ${rsRatio?.toFixed(1) ?? "—"}, RS-Mom: ${rsMomentum?.toFixed(1) ?? "—"}`}
        className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[9.5px] text-rose-300 whitespace-nowrap"
      >
        <span className="size-1.5 rounded-full bg-rose-400" />
        Tụt hậu RRG
      </span>
    );
  }
  return null;
}

export function MaGeometryBadge({
  isRibbonSqueeze,
  isReclaimSpring,
  ribbonSpreadPct,
}: {
  isRibbonSqueeze?: boolean;
  isReclaimSpring?: boolean;
  ribbonSpreadPct?: number | null;
}) {
  if (!isRibbonSqueeze && !isReclaimSpring) return null;
  return (
    <div className="inline-flex items-center gap-1">
      {isRibbonSqueeze && (
        <span
          title={`Dải MA Ribbon nén chặt (${ribbonSpreadPct ? `${ribbonSpreadPct}%` : "≤2.8%"}) · Hội tụ MA10-MA20-MA50`}
          className="inline-flex items-center gap-1 rounded bg-indigo-500/20 border border-indigo-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-indigo-400" />
          Ribbon Nén
        </span>
      )}
      {isReclaimSpring && (
        <span
          title="Quét rũ râu nến thủng MA rồi rút chân dứt khoát lấy lại MA (Spring Hunt)"
          className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-cyan-400" />
          Reclaim MA
        </span>
      )}
    </div>
  );
}

export function VolumeAbsorptionBadge({
  isAbsorptionSpike,
  isVsaNoSupply,
  activeBuyRatioPct,
}: {
  isAbsorptionSpike?: boolean;
  isVsaNoSupply?: boolean;
  activeBuyRatioPct?: number | null;
}) {
  if (!isAbsorptionSpike && !isVsaNoSupply) return null;
  return (
    <div className="inline-flex items-center gap-1">
      {isAbsorptionSpike && (
        <span
          title={`Khối lượng hấp thụ cung đột biến (≥ 1.3x TB20)${activeBuyRatioPct ? ` · Mua chủ động: ${Math.round(activeBuyRatioPct)}%` : ""}`}
          className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-amber-400" />
          Hấp Thụ Cung
        </span>
      )}
      {isVsaNoSupply && (
        <span
          title="VSA No Supply Test: Cạn kiệt lượng bán trôi nổi tại hỗ trợ MA"
          className="inline-flex items-center gap-1 rounded bg-teal-500/20 border border-teal-400/40 px-1.5 py-0.5 text-[9.5px] font-medium text-teal-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-teal-400" />
          Cạn Cung VSA
        </span>
      )}
    </div>
  );
}

export function PrecisionMtfBadge({
  isPrecisionMtfAligned,
  mtfSummary,
}: {
  isPrecisionMtfAligned?: boolean;
  mtfSummary?: string | null;
}) {
  if (!isPrecisionMtfAligned) return null;
  return (
    <span
      title={mtfSummary || "Đồng thuận 3 Khung Thời Gian H1 (Giờ) · D1 (Ngày) · W1 (Tuần) tuyệt đối"}
      className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-amber-500/25 border border-emerald-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300 whitespace-nowrap"
    >
      <span className="size-1.5 rounded-full bg-emerald-400" />
      H1·D1·W1 🟢🟢🟢
    </span>
  );
}

export function FaHealthBadge({
  faCategory,
  faBadgeVi,
  faSummaryVi,
  isNetCash,
  roic,
  cfoToNp,
}: {
  faCategory?: string | null;
  faBadgeVi?: string | null;
  faSummaryVi?: string | null;
  isNetCash?: boolean | null;
  roic?: number | null;
  cfoToNp?: number | null;
}) {
  if (!faCategory || faCategory === "STANDARD") {
    if (isNetCash) {
      return (
        <span
          title="Tiền mặt ròng > Tổng nợ vay tài chính"
          className="inline-flex items-center gap-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 text-[9.5px] font-medium whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Tiền Mặt Ròng
        </span>
      );
    }
    return null;
  }

  let colorClass = "bg-panel-2 text-text-secondary border-border-subtle";
  let dotClass = "bg-text-muted";

  if (faCategory === "FORTRESS") {
    colorClass = "bg-emerald-500/20 text-emerald-200 border-emerald-400/40 font-bold";
    dotClass = "bg-emerald-400";
  } else if (faCategory === "CASH_MACHINE") {
    colorClass = "bg-cyan-500/20 text-cyan-200 border-cyan-400/40 font-bold";
    dotClass = "bg-cyan-400";
  } else if (faCategory === "MOAT_QUALITY") {
    colorClass = "bg-amber-500/20 text-amber-200 border-amber-400/40 font-bold";
    dotClass = "bg-amber-400";
  } else if (faCategory === "UNDERVALUED_GROWTH") {
    colorClass = "bg-purple-500/20 text-purple-200 border-purple-400/40 font-medium";
    dotClass = "bg-purple-400";
  } else if (faCategory === "CONSENSUS_UPSIDE") {
    colorClass = "bg-indigo-500/20 text-indigo-200 border-indigo-400/40 font-semibold";
    dotClass = "bg-indigo-400";
  } else if (faCategory === "VALUE_DIVIDEND") {
    colorClass = "bg-teal-500/20 text-teal-200 border-teal-400/40 font-medium";
    dotClass = "bg-teal-400";
  } else if (faCategory === "HIGH_RISK") {
    colorClass = "bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold";
    dotClass = "bg-rose-400";
  }

  return (
    <span
      title={faSummaryVi || `Phân loại cơ bản: ${faBadgeVi ?? faCategory}`}
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[9.5px] whitespace-nowrap ${colorClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span>{faBadgeVi ?? faCategory}</span>
      {roic != null && roic >= 15 && <span className="opacity-80">· ROIC {roic.toFixed(0)}%</span>}
    </span>
  );
}

export function TechPatternBadge({
  isTightCloses,
  tightCloseSpreadPct,
  isVolumeDryUp,
  isWyckoffLps,
  isRsNewHigh20,
}: {
  isTightCloses?: boolean;
  tightCloseSpreadPct?: number | null;
  isVolumeDryUp?: boolean;
  isWyckoffLps?: boolean;
  isRsNewHigh20?: boolean;
}) {
  if (!isTightCloses && !isVolumeDryUp && !isWyckoffLps && !isRsNewHigh20) return null;
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {isTightCloses && (
        <span
          title={`Minervini Tight Closes: Biên độ nén 4 phiên chỉ ${tightCloseSpreadPct != null ? `${tightCloseSpreadPct}%` : "≤1.25%"} sát MA20`}
          className="inline-flex items-center gap-1 rounded bg-teal-500/20 border border-teal-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-teal-400" />
          Nén Phẳng {tightCloseSpreadPct ? `(${tightCloseSpreadPct}%)` : ""}
        </span>
      )}
      {isVolumeDryUp && (
        <span
          title="Cạn kiệt thanh khoản Volume Dry-Up (VDU ≤ 0.60x MA20) trong vùng tích lũy sát MA20"
          className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-cyan-400" />
          Cạn Von VDU
        </span>
      )}
      {isWyckoffLps && (
        <span
          title="Wyckoff LPS (Last Point of Support): Kiểm định cung kiệt von bật lên trên hỗ trợ MA20"
          className="inline-flex items-center gap-1 rounded bg-indigo-500/20 border border-indigo-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-indigo-400" />
          Wyckoff LPS
        </span>
      )}
      {isRsNewHigh20 && (
        <span
          title="Sức mạnh giá RS Rating dẫn dắt vượt đỉnh 20 phiên"
          className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-300 whitespace-nowrap"
        >
          <span className="size-1.5 rounded-full bg-amber-400" />
          RS Đỉnh Mới
        </span>
      )}
    </div>
  );
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

import {
  PRESET_EDGE_BENCHMARKS,
  STRATEGY_GROUPS,
  PRESET_TABS,
  getPresetCategory,
  type PresetEdgeStat,
  type StrategyGroup,
  type StrategyGroupMeta,
  type PresetTabItem,
} from "./screener-constants";

export {
  PRESET_EDGE_BENCHMARKS,
  STRATEGY_GROUPS,
  PRESET_TABS,
  getPresetCategory,
  type PresetEdgeStat,
  type StrategyGroup,
  type StrategyGroupMeta,
  type PresetTabItem,
};

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
  const [rrgQuadrant, setRrgQuadrant] = useState("ALL");
  const [squeezeFilter, setSqueezeFilter] = useState("ALL");
  const [maRibbonSqueezeOnly, setMaRibbonSqueezeOnly] = useState(false);
  const [maReclaimOnly, setMaReclaimOnly] = useState(false);
  const [absorptionSpikeOnly, setAbsorptionSpikeOnly] = useState(false);
  const [vsaNoSupplyOnly, setVsaNoSupplyOnly] = useState(false);
  const [precisionMtfOnly, setPrecisionMtfOnly] = useState(false);

  // Sniper Execution Quick Modifier States (Phase 3)
  const [sniperTriggerOnly, setSniperTriggerOnly] = useState(false);
  const [setupGradeFilter, setSetupGradeFilter] = useState<"all" | "A+" | "A" | "B">("all");
  const [goldenPocketFilter, setGoldenPocketFilter] = useState(false);
  const [flipZoneFilter, setFlipZoneFilter] = useState(false);
  const [smcOrderBlockFilter, setSmcOrderBlockFilter] = useState(false);
  const [sniperSubtypeFilter, setSniperSubtypeFilter] = useState<"all" | "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM">("all");
  const [minSniperRRFilter, setMinSniperRRFilter] = useState("");

  // Consolidated compound filter helper states
  const [buyPositionCombo, setBuyPositionCombo] = useState("ALL");
  const [volatilityCombo, setVolatilityCombo] = useState("ALL");
  const [vsaCombo, setVsaCombo] = useState("ALL");
  const [faProfileCombo, setFaProfileCombo] = useState("ALL");
  const [techPatternCombo, setTechPatternCombo] = useState("ALL");
  const [minRoic, setMinRoic] = useState("");
  const [minConsensusUpside, setMinConsensusUpside] = useState("");
  const [maxPeg, setMaxPeg] = useState("");
  const [netCashOnly, setNetCashOnly] = useState(false);
  const [tightClosesOnly, setTightClosesOnly] = useState(false);
  const [vduOnly, setVduOnly] = useState(false);

  const handleBuyPositionChange = (val: string) => {
    setBuyPositionCombo(val);
    if (val === "AT_BUY_POINT") {
      setBuyZoneStatus("AT_BUY_POINT");
      setMaxBuyDiff("1.0");
    } else if (val === "NEAR_BUY_POINT") {
      setBuyZoneStatus("NEAR_BUY_POINT");
      setMaxBuyDiff("2.5");
    } else if (val === "SAFE_ACCUMULATION") {
      setBuyZoneStatus("ALL");
      setMaxBuyDiff("3.5");
    } else if (val === "WAIT_PULLBACK") {
      setBuyZoneStatus("WAIT_PULLBACK");
      setMaxBuyDiff("");
    } else if (val === "BELOW_SUPPORT") {
      setBuyZoneStatus("BELOW_SUPPORT");
      setMaxBuyDiff("");
    } else {
      setBuyZoneStatus("ALL");
      setMaxBuyDiff("");
    }
  };

  const handleVolatilityChange = (val: string) => {
    setVolatilityCombo(val);
    if (val === "FIRED") {
      setSqueezeFilter("FIRED");
      setMaRibbonSqueezeOnly(false);
    } else if (val === "SQUEEZE_ON") {
      setSqueezeFilter("ON");
      setMaRibbonSqueezeOnly(false);
    } else if (val === "RIBBON_SQUEEZE") {
      setSqueezeFilter("ALL");
      setMaRibbonSqueezeOnly(true);
    } else if (val === "COIL_SUPER") {
      setSqueezeFilter("ON");
      setMaRibbonSqueezeOnly(true);
    } else {
      setSqueezeFilter("ALL");
      setMaRibbonSqueezeOnly(false);
    }
  };

  const handleVsaChange = (val: string) => {
    setVsaCombo(val);
    if (val === "ABSORPTION") {
      setAbsorptionSpikeOnly(true);
      setVsaNoSupplyOnly(false);
    } else if (val === "NO_SUPPLY") {
      setAbsorptionSpikeOnly(false);
      setVsaNoSupplyOnly(true);
    } else {
      setAbsorptionSpikeOnly(false);
      setVsaNoSupplyOnly(false);
    }
  };

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
    rrgQuadrant: "ALL",
    squeezeFilter: "ALL",
    maRibbonSqueezeOnly: false,
    maReclaimOnly: false,
    absorptionSpikeOnly: false,
    vsaNoSupplyOnly: false,
    precisionMtfOnly: false,
    mtfCandleOnly: false,
    minMtfCandleScore: "",
    vsaOnly: false,
    minOverheadRoom: "",
    faProfileCombo: "ALL",
    techPatternCombo: "ALL",
    minRoic: "",
    minConsensusUpside: "",
    maxPeg: "",
    netCashOnly: false,
    tightClosesOnly: false,
    vduOnly: false,
    sniperTriggerOnly: false,
    setupGradeFilter: "all" as "all" | "A+" | "A" | "B",
    goldenPocketFilter: false,
    flipZoneFilter: false,
    smcOrderBlockFilter: false,
    sniperSubtypeFilter: "all" as "all" | "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM",
    minSniperRRFilter: "",
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
    if (applied.rrgQuadrant && applied.rrgQuadrant !== "ALL") p.set("rrgQuadrant", applied.rrgQuadrant);
    if (applied.squeezeFilter === "FIRED") {
      p.set("squeezeFiredOnly", "true");
    } else if (applied.squeezeFilter === "ON") {
      p.set("squeezeOnly", "true");
    }
    if (applied.maRibbonSqueezeOnly) p.set("maRibbonSqueezeOnly", "true");
    if (applied.maReclaimOnly) p.set("maReclaimOnly", "true");
    if (applied.absorptionSpikeOnly) p.set("absorptionSpikeOnly", "true");
    if (applied.vsaNoSupplyOnly) p.set("vsaNoSupplyOnly", "true");
    if (applied.precisionMtfOnly) p.set("precisionMtfOnly", "true");
    if (applied.faProfileCombo && applied.faProfileCombo !== "ALL") p.set("faProfile", applied.faProfileCombo);
    if (applied.techPatternCombo && applied.techPatternCombo !== "ALL") p.set("techPattern", applied.techPatternCombo);
    if (applied.minRoic) p.set("minRoic", applied.minRoic);
    if (applied.minConsensusUpside) p.set("minConsensusUpside", applied.minConsensusUpside);
    if (applied.maxPeg) p.set("maxPeg", applied.maxPeg);
    if (applied.netCashOnly) p.set("netCashOnly", "true");
    if (applied.tightClosesOnly) p.set("tightClosesOnly", "true");
    if (applied.vduOnly) p.set("vduOnly", "true");
    if (applied.mtfCandleOnly) p.set("mtfCandleOnly", "true");
    if (applied.minMtfCandleScore) p.set("minMtfCandleScore", applied.minMtfCandleScore);
    if (applied.vsaOnly) p.set("vsaOnly", "true");
    if (applied.minOverheadRoom) p.set("minOverheadRoom", applied.minOverheadRoom);
    if (applied.sniperTriggerOnly) p.set("buyTriggerOnly", "true");
    if (applied.setupGradeFilter && applied.setupGradeFilter !== "all") p.set("setupGradeOnly", applied.setupGradeFilter);
    if (applied.goldenPocketFilter) p.set("goldenPocketOnly", "true");
    if (applied.flipZoneFilter) p.set("flipZoneOnly", "true");
    if (applied.smcOrderBlockFilter) p.set("smcOrderBlockOnly", "true");
    if (applied.sniperSubtypeFilter && applied.sniperSubtypeFilter !== "all") p.set("sniperTriggerSubtype", applied.sniperSubtypeFilter);
    if (applied.minSniperRRFilter) p.set("minSniperRR", applied.minSniperRRFilter);
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
      rrgQuadrant,
      squeezeFilter,
      maRibbonSqueezeOnly,
      maReclaimOnly,
      absorptionSpikeOnly,
      vsaNoSupplyOnly,
      precisionMtfOnly,
      mtfCandleOnly: false,
      minMtfCandleScore: "",
      vsaOnly: false,
      minOverheadRoom: "",
      faProfileCombo,
      techPatternCombo,
      minRoic,
      minConsensusUpside,
      maxPeg,
      netCashOnly,
      tightClosesOnly,
      vduOnly,
      sniperTriggerOnly,
      setupGradeFilter,
      goldenPocketFilter,
      flipZoneFilter,
      smcOrderBlockFilter,
      sniperSubtypeFilter,
      minSniperRRFilter,
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
    rrgQuadrant,
    squeezeFilter,
    maRibbonSqueezeOnly,
    maReclaimOnly,
    absorptionSpikeOnly,
    vsaNoSupplyOnly,
    precisionMtfOnly,
    faProfileCombo,
    techPatternCombo,
    minRoic,
    minConsensusUpside,
    maxPeg,
    netCashOnly,
    tightClosesOnly,
    vduOnly,
    sniperTriggerOnly,
    setupGradeFilter,
    goldenPocketFilter,
    flipZoneFilter,
    smcOrderBlockFilter,
    sniperSubtypeFilter,
    minSniperRRFilter,
    mutate,
  ]);

  const toggleQuickModifier = useCallback((key: string, val: unknown) => {
    if (key === "sniperTriggerOnly") setSniperTriggerOnly(Boolean(val));
    if (key === "setupGradeFilter") setSetupGradeFilter(val as any);
    if (key === "goldenPocketFilter") setGoldenPocketFilter(Boolean(val));
    if (key === "squeezeFilter") setSqueezeFilter(val as string);
    if (key === "flipZoneFilter") setFlipZoneFilter(Boolean(val));
    if (key === "smcOrderBlockFilter") setSmcOrderBlockFilter(Boolean(val));
    if (key === "sniperSubtypeFilter") setSniperSubtypeFilter(val as any);
    if (key === "minSniperRRFilter") setMinSniperRRFilter(val as string);
    if (key === "tightClosesOnly") setTightClosesOnly(Boolean(val));
    if (key === "vduOnly") setVduOnly(Boolean(val));
    if (key === "vsaNoSupplyOnly") setVsaNoSupplyOnly(Boolean(val));
    if (key === "maRibbonSqueezeOnly") setMaRibbonSqueezeOnly(Boolean(val));
    if (key === "maReclaimOnly") setMaReclaimOnly(Boolean(val));
    if (key === "minSmartMoneyScore") setMinSmartMoneyScore(val as string);
    if (key === "rrgQuadrant") setRrgQuadrant(val as string);
    if (key === "minRsRating") setMinRsRating(val as string);
    if (key === "mtfOnly") setMtfOnly(Boolean(val));
    if (key === "minOrcaMasterScore") setMinOrcaMasterScore(val as string);
    if (key === "faProfileCombo") setFaProfileCombo(val as string);
    if (key === "netCashOnly") setNetCashOnly(Boolean(val));
    if (key === "minPiotroskiScore") setMinPiotroskiScore(val as string);
    if (key === "minRoic") setMinRoic(val as string);
    if (key === "maxPeg") setMaxPeg(val as string);

    setApplied((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleResetMatrix = useCallback(() => {
    setSniperTriggerOnly(false);
    setSetupGradeFilter("all");
    setGoldenPocketFilter(false);
    setSqueezeFilter("ALL");
    setFlipZoneFilter(false);
    setSmcOrderBlockFilter(false);
    setSniperSubtypeFilter("all");
    setMinSniperRRFilter("");
    setTightClosesOnly(false);
    setVduOnly(false);
    setVsaNoSupplyOnly(false);
    setMaRibbonSqueezeOnly(false);
    setMaReclaimOnly(false);
    setMinSmartMoneyScore("");
    setRrgQuadrant("ALL");
    setMinRsRating("");
    setMtfOnly(false);
    setMinOrcaMasterScore("");
    setFaProfileCombo("ALL");
    setNetCashOnly(false);
    setMinPiotroskiScore("");
    setMinRoic("");
    setMaxPeg("");

    setApplied((prev) => ({
      ...prev,
      sniperTriggerOnly: false,
      setupGradeFilter: "all",
      goldenPocketFilter: false,
      squeezeFilter: "ALL",
      flipZoneFilter: false,
      smcOrderBlockFilter: false,
      sniperSubtypeFilter: "all",
      minSniperRRFilter: "",
      tightClosesOnly: false,
      vduOnly: false,
      vsaNoSupplyOnly: false,
      maRibbonSqueezeOnly: false,
      maReclaimOnly: false,
      minSmartMoneyScore: "",
      rrgQuadrant: "ALL",
      minRsRating: "",
      mtfOnly: false,
      minOrcaMasterScore: "",
      faProfileCombo: "ALL",
      netCashOnly: false,
      minPiotroskiScore: "",
      minRoic: "",
      maxPeg: "",
    }));
  }, []);

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
    setRrgQuadrant("ALL");
    setSqueezeFilter("ALL");
    setMaRibbonSqueezeOnly(false);
    setMaReclaimOnly(false);
    setAbsorptionSpikeOnly(false);
    setVsaNoSupplyOnly(false);
    setPrecisionMtfOnly(false);
    setBuyPositionCombo("ALL");
    setVolatilityCombo("ALL");
    setVsaCombo("ALL");
    setFaProfileCombo("ALL");
    setTechPatternCombo("ALL");
    setMinRoic("");
    setMinConsensusUpside("");
    setMaxPeg("");
    setNetCashOnly(false);
    setTightClosesOnly(false);
    setVduOnly(false);
    setSniperTriggerOnly(false);
    setSetupGradeFilter("all");
    setGoldenPocketFilter(false);
    setFlipZoneFilter(false);
    setSmcOrderBlockFilter(false);
    setSniperSubtypeFilter("all");
    setMinSniperRRFilter("");
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
      rrgQuadrant: "ALL",
      squeezeFilter: "ALL",
      maRibbonSqueezeOnly: false,
      maReclaimOnly: false,
      absorptionSpikeOnly: false,
      vsaNoSupplyOnly: false,
      precisionMtfOnly: false,
      mtfCandleOnly: false,
      minMtfCandleScore: "",
      vsaOnly: false,
      minOverheadRoom: "",
      faProfileCombo: "ALL",
      techPatternCombo: "ALL",
      minRoic: "",
      minConsensusUpside: "",
      maxPeg: "",
      netCashOnly: false,
      tightClosesOnly: false,
      vduOnly: false,
      sniperTriggerOnly: false,
      setupGradeFilter: "all",
      goldenPocketFilter: false,
      flipZoneFilter: false,
      smcOrderBlockFilter: false,
      sniperSubtypeFilter: "all",
      minSniperRRFilter: "",
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
    } else if (p === "mtf_confluence" || p === "smc_golden_pocket" || p === "flip_zone_retest") {
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

  const CORE_GOALS: { id: ScreenerPreset; label: string }[] = [
    { id: "all", label: "Tất cả" },
    { id: "apex_buy_now", label: "Điểm mua bứt phá" },
    { id: "near_buy_point", label: "Sát điểm mua an toàn" },
    { id: "canslim", label: "Tăng trưởng & Vượt đỉnh" },
    { id: "smart_money_inflow", label: "Dòng tiền cá mập" },
    { id: "value", label: "Định giá rẻ & Giá trị" },
    { id: "dividend", label: "Cổ tức cao" },
  ];

  return (
    <div className="space-y-2.5">
      {/* 1. Thanh Chọn Phong Cách Đầu Tư Cốt Lõi (Tối giản, trực quan, không icon rườm rà) */}
      <div className="rounded-lg border border-line bg-panel p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Nhóm mục tiêu cốt lõi */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mr-1">
              Mục tiêu:
            </span>
            {CORE_GOALS.map((goal) => {
              const active = preset === goal.id && !activeCustomPresetName;
              const count = presetsCount ? presetsCount[goal.id] : null;
              return (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => handleSelectPreset(goal.id)}
                  className={`px-3 py-1.5 rounded text-xs transition-all ${
                    active
                      ? "bg-accent-primary text-white font-semibold shadow-xs"
                      : "bg-panel-2 text-text-secondary hover:text-text-primary hover:bg-panel-hover"
                  }`}
                >
                  <span>{goal.label}</span>
                  {count != null && (
                    <span
                      className={`ml-1.5 rounded px-1.5 py-0.2 text-[10px] font-mono ${
                        active ? "bg-white/20 text-white" : "bg-panel-3 text-text-muted"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Dropdown Chiến lược chuyên sâu khác */}
            <select
              value={CORE_GOALS.some((g) => g.id === preset) ? "" : preset}
              onChange={(e) => {
                if (e.target.value) handleSelectPreset(e.target.value as ScreenerPreset);
              }}
              className="rounded border border-border-subtle bg-panel-2 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary focus:border-accent-primary"
            >
              <option value="">Chiến lược chuyên sâu khác...</option>
              {PRESET_TABS.filter((t) => !CORE_GOALS.some((g) => g.id === t.id)).map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label} {presetsCount?.[tab.id] != null ? `(${presetsCount[tab.id]})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Nút Tự tạo bộ lọc */}
          <button
            type="button"
            onClick={() => setShowCustomBuilder(true)}
            className="flex items-center gap-1.5 rounded border border-border-subtle bg-panel-2 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-all shrink-0"
          >
            <span>Tự tạo bộ lọc</span>
            {customPresets.length > 0 && (
              <span className="rounded bg-accent-primary/20 px-1 text-[10px] text-accent-primary font-mono">
                {customPresets.length}
              </span>
            )}
          </button>
        </div>

        {/* Danh sách bộ lọc tùy biến nếu có */}
        {customPresets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-line/60">
            <span className="text-[11px] text-text-muted mr-1">Bộ lọc đã lưu:</span>
            {customPresets.map((cp) => {
              const active = activeCustomPresetName === cp.name;
              return (
                <div
                  key={cp.id}
                  onClick={() => handleApplyCustomPreset(cp.filters, cp.name)}
                  className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs cursor-pointer border transition-all ${
                    active
                      ? "bg-accent-primary/20 text-accent-primary border-accent-primary/50 font-semibold"
                      : "bg-panel-2 text-text-secondary border-border-subtle hover:text-text-primary"
                  }`}
                >
                  <span>{cp.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCustomPreset(cp.id, e)}
                    className="opacity-40 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-all ml-0.5"
                    title="Xóa bộ lọc này"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1.5 Bộ Lọc Chuyên Sâu (Thu gọn mặc định, không icon emoji) */}
      <ScreenerMatrixToolbar
        filters={applied}
        onToggle={toggleQuickModifier}
        onReset={handleResetMatrix}
        totalFilteredCount={data?.total}
      />

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
          <div className="border-b border-line p-3.5 bg-panel-3/40 animate-in fade-in duration-200 space-y-3">
            {/* Row 1: Core Strategy Selectors (Merged & Streamlined) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Vị Thế Vùng Mua
                </span>
                <select
                  value={buyPositionCombo}
                  onChange={(e) => handleBuyPositionChange(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Mọi vị thế điểm mua</option>
                  <option value="AT_BUY_POINT">Ngay điểm mua (Zone ≤ 1.0%)</option>
                  <option value="NEAR_BUY_POINT">Sát điểm mua (≤ 2.5%)</option>
                  <option value="SAFE_ACCUMULATION">Vùng gom an toàn (≤ 3.5%)</option>
                  <option value="WAIT_PULLBACK">Chờ điều chỉnh (&gt; 2.5%)</option>
                  <option value="BELOW_SUPPORT">Dưới hỗ trợ</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Nén Biến Động (Coil)
                </span>
                <select
                  value={volatilityCombo}
                  onChange={(e) => handleVolatilityChange(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Mọi trạng thái nén</option>
                  <option value="FIRED">Nổ Squeeze Tăng (Fired Bull)</option>
                  <option value="SQUEEZE_ON">Đang nén TTM Squeeze</option>
                  <option value="RIBBON_SQUEEZE">Nén Dải Ribbon MA (≤ 2.8%)</option>
                  <option value="COIL_SUPER">Siêu nén kép (TTM + Ribbon)</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Dấu Chân VSA & Dòng Tiền
                </span>
                <select
                  value={vsaCombo}
                  onChange={(e) => handleVsaChange(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Mọi khối lượng VSA</option>
                  <option value="ABSORPTION">Hấp thụ cung đột biến (≥ 1.3x)</option>
                  <option value="NO_SUPPLY">Cạn cung kiểm định (≤ 0.65x)</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Hồ Sơ Cơ Bản FA
                </span>
                <select
                  value={faProfileCombo}
                  onChange={(e) => setFaProfileCombo(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Mọi hồ sơ cơ bản</option>
                  <option value="FORTRESS">Pháo Đài Tiền Mặt (Net Cash)</option>
                  <option value="CASH_MACHINE">Cỗ Máy Tiền Mặt (CFO/LNST ≥ 1.0)</option>
                  <option value="MOAT_QUALITY">Con Hào Kinh Tế (ROIC ≥ 15%)</option>
                  <option value="UNDERVALUED_GROWTH">Định Giá Rẻ PEG ≤ 1.0</option>
                  <option value="CONSENSUS_UPSIDE">Định Giá Hời CTCK (≥ 20%)</option>
                  <option value="VALUE_DIVIDEND">Giá Trị & Cổ Tức Cao</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Mẫu Hình Kỹ Thuật
                </span>
                <select
                  value={techPatternCombo}
                  onChange={(e) => setTechPatternCombo(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Mọi mẫu hình kỹ thuật</option>
                  <option value="TIGHT_CLOSES">Nén Phẳng Minervini (≤ 1.25%)</option>
                  <option value="VDU">Cạn Von Nền VDU (≤ 0.60x)</option>
                  <option value="WYCKOFF_LPS">Wyckoff LPS Test Cung</option>
                  <option value="RS_NEW_HIGH">RS Dẫn Dắt Vượt Đỉnh</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Ngành Dẫn Dắt RRG
                </span>
                <select
                  value={rrgQuadrant}
                  onChange={(e) => setRrgQuadrant(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Tất cả ngành RRG</option>
                  <option value="LEADING">Dẫn dắt (Leading RRG)</option>
                  <option value="IMPROVING">Cải thiện (Improving)</option>
                  <option value="WEAKENING">Suy yếu (Weakening)</option>
                  <option value="LAGGING">Tụt hậu (Lagging)</option>
                </select>
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Tín Hiệu MA & Kênh
                </span>
                <select
                  value={maSignal}
                  onChange={(e) => setMaSignal(e.target.value)}
                  className="input !w-full !py-1.5 text-[12px] font-medium"
                >
                  <option value="ALL">Tất cả tín hiệu MA</option>
                  <option value="GOLDEN_CROSS">Giao cắt Vàng (Golden Cross)</option>
                  <option value="BULLISH_ALIGN">Kênh tăng (Trật tự MA)</option>
                  <option value="DEATH_CROSS">Cắt Tử thần (Death Cross)</option>
                </select>
              </label>
            </div>

            {/* Row 2: Fundamental & Valuation Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5 pt-2 border-t border-line/40">
              <Field label="P/E tối đa" value={maxPe} onChange={setMaxPe} small placeholder="15" />
              <Field label="P/B tối đa" value={maxPb} onChange={setMaxPb} small placeholder="2.0" />
              <Field label="PEG tối đa" value={maxPeg} onChange={setMaxPeg} small placeholder="1.2" />
              <Field label="ROE min (%)" value={minRoe} onChange={setMinRoe} small placeholder="15" />
              <Field label="ROIC min (%)" value={minRoic} onChange={setMinRoic} small placeholder="15" />
              <Field label="CTCK Upside (%)" value={minConsensusUpside} onChange={setMinConsensusUpside} small placeholder="20" />
              <Field label="Cổ tức min (%)" value={minDivYield} onChange={setMinDivYield} small placeholder="5" />
              <Field label="Nợ/VCSH tối đa" value={maxDe} onChange={setMaxDe} small placeholder="1.2" />
              <Field label="Vốn hóa min (tỷ)" value={minMarketCap} onChange={setMinMarketCap} small placeholder="1000" />
            </div>

            {/* Row 3: Actionable Precision Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line/40 text-[11px]">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-text-muted">Kích hoạt Nhanh:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-emerald-300 hover:text-emerald-200 select-none">
                  <input
                    type="checkbox"
                    checked={precisionMtfOnly}
                    onChange={(e) => setPrecisionMtfOnly(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  <span className="font-semibold">Đồng Thuận 3 Khung H1·D1·W1 (BĐ5)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-cyan-300 hover:text-cyan-200 select-none">
                  <input
                    type="checkbox"
                    checked={maReclaimOnly}
                    onChange={(e) => setMaReclaimOnly(e.target.checked)}
                    className="rounded accent-cyan-500"
                  />
                  <span className="font-semibold">Quét Rũ Reclaim Spring MA (BĐ3)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-teal-300 hover:text-teal-200 select-none">
                  <input
                    type="checkbox"
                    checked={tightClosesOnly}
                    onChange={(e) => setTightClosesOnly(e.target.checked)}
                    className="rounded accent-teal-500"
                  />
                  <span className="font-semibold">Nén Giá Phẳng Minervini</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-cyan-400 hover:text-cyan-300 select-none">
                  <input
                    type="checkbox"
                    checked={vduOnly}
                    onChange={(e) => setVduOnly(e.target.checked)}
                    className="rounded accent-cyan-400"
                  />
                  <span className="font-semibold">Cạn Kiệt Von (VDU nền)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-300 hover:text-amber-200 select-none">
                  <input
                    type="checkbox"
                    checked={netCashOnly}
                    onChange={(e) => setNetCashOnly(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span className="font-semibold">Pháo Đài Tiền Mặt Ròng (Net Cash)</span>
                </label>
              </div>
            </div>
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
                                  subtype={row.sniperTriggerSubtype}
                                  labelVi={row.sniperTriggerLabelVi}
                                  entryMin={row.sniperEntryMin}
                                  entryMax={row.sniperEntryMax}
                                  stopLoss={row.sniperStopLoss}
                                  target1={row.sniperTarget1}
                                  target2={row.sniperTarget2}
                                  riskReward={row.sniperRiskReward}
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
                              {row.sectorRrgQuadrant && (
                                <SectorRrgBadge
                                  quadrant={row.sectorRrgQuadrant}
                                  rsRatio={row.sectorRsRatio}
                                  rsMomentum={row.sectorRsMomentum}
                                />
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

                        {/* Sniper Actionable Trade Plan in Grid */}
                        {row.sniperTriggerSubtype && (
                          <div className="my-1.5">
                            <SniperTradePlanBadge
                              subtype={row.sniperTriggerSubtype}
                              labelVi={row.sniperTriggerLabelVi}
                              entryMin={row.sniperEntryMin}
                              entryMax={row.sniperEntryMax}
                              stopLoss={row.sniperStopLoss}
                              target1={row.sniperTarget1}
                              target2={row.sniperTarget2}
                              riskReward={row.sniperRiskReward}
                              reasonVi={row.buyTriggerReasonVi}
                            />
                          </div>
                        )}

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
                          {row.isGoldenPocket && (
                            <FiboGoldenPocketBadge
                              isGoldenPocket={row.isGoldenPocket}
                              summary={row.fiboSummary}
                            />
                          )}
                          {row.isFlipZoneSupport && (
                            <FlipZoneBadge
                              isFlipZone={row.isFlipZoneSupport}
                              summary={row.structureSummary}
                            />
                          )}
                          {row.isSmcOrderBlock && (
                            <SmcOrderBlockBadge
                              isOrderBlock={row.isSmcOrderBlock}
                              summary={row.structureSummary}
                            />
                          )}
                          {row.squeezeState && row.squeezeState !== "squeeze_off" && (
                            <SqueezeBadge
                              state={row.squeezeState}
                              bars={row.squeezeBars}
                              slope={row.squeezeMomentumSlope}
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
                          <PrecisionMtfBadge
                            isPrecisionMtfAligned={row.isPrecisionMtfAligned}
                            mtfSummary={row.mtfSummary}
                          />
                          <MaGeometryBadge
                            isRibbonSqueeze={row.isMaRibbonSqueeze}
                            isReclaimSpring={row.isMaReclaimSpring}
                            ribbonSpreadPct={row.maRibbonSpreadPct}
                          />
                          <VolumeAbsorptionBadge
                            isAbsorptionSpike={row.isAbsorptionSpike}
                            isVsaNoSupply={row.isVsaNoSupplyTest}
                            activeBuyRatioPct={row.activeBuyRatioPct}
                          />
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
                      onClick={() => handleSort("peg")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      PEG {sortKey === "peg" && (sortOrder === "desc" ? "↓" : "↑")}
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
                      onClick={() => handleSort("consensusUpsidePct")}
                      className="py-2.5 text-right font-bold cursor-pointer hover:text-emerald-400 text-emerald-300"
                    >
                      Upside CTCK (%) {sortKey === "consensusUpsidePct" && (sortOrder === "desc" ? "↓" : "↑")}
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
                      onClick={() => handleSort("roic")}
                      className="py-2.5 text-right font-bold cursor-pointer hover:text-emerald-400 text-emerald-300"
                    >
                      ROIC Moat (%) {sortKey === "roic" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("cfoToNetProfit")}
                      className="py-2.5 text-right font-bold cursor-pointer hover:text-cyan-400 text-cyan-300"
                    >
                      CFO / LNST {sortKey === "cfoToNetProfit" && (sortOrder === "desc" ? "↓" : "↑")}
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
                    <th className="py-2.5 text-center font-bold text-emerald-300">Hồ Sơ FA</th>
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
                      onClick={() => handleSort("interestCoverage")}
                      className="py-2.5 text-right font-bold cursor-pointer hover:text-emerald-400 text-emerald-300"
                    >
                      Phủ Lãi Vay (ICR) {sortKey === "interestCoverage" && (sortOrder === "desc" ? "↓" : "↑")}
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
                    <th className="py-2.5 text-center font-medium">Tiền Mặt Ròng</th>
                    <th onClick={() => handleSort("fcfTtm")} className="py-2.5 text-right font-medium">
                      FCF TTM (tỷ)
                    </th>
                    <th
                      onClick={() => handleSort("qualityScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Chất lượng BCTC
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
                            subtype={row.sniperTriggerSubtype}
                            labelVi={row.sniperTriggerLabelVi}
                            entryMin={row.sniperEntryMin}
                            entryMax={row.sniperEntryMax}
                            stopLoss={row.sniperStopLoss}
                            target1={row.sniperTarget1}
                            target2={row.sniperTarget2}
                            riskReward={row.sniperRiskReward}
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
                    <td className="py-2.5 text-[11px] text-text-secondary">
                      <div>{row.sector}</div>
                      {row.sectorRrgQuadrant && (
                        <div className="mt-0.5">
                          <SectorRrgBadge
                            quadrant={row.sectorRrgQuadrant}
                            rsRatio={row.sectorRsRatio}
                            rsMomentum={row.sectorRsMomentum}
                          />
                        </div>
                      )}
                    </td>

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
                        <td className="py-2.5 text-left text-[11px] font-medium text-text-primary">
                          <div className="flex flex-col gap-1 max-w-[210px]">
                            <div className="truncate">{row.buyStrategy ?? "Bệ đỡ hội tụ"}</div>
                            {row.sniperTriggerSubtype && (
                              <SniperTradePlanBadge
                                subtype={row.sniperTriggerSubtype}
                                labelVi={row.sniperTriggerLabelVi}
                                entryMin={row.sniperEntryMin}
                                entryMax={row.sniperEntryMax}
                                stopLoss={row.sniperStopLoss}
                                target1={row.sniperTarget1}
                                target2={row.sniperTarget2}
                                riskReward={row.sniperRiskReward}
                                reasonVi={row.buyTriggerReasonVi}
                              />
                            )}
                            {row.isMtfAligned && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400">
                                Đồng thuận H1·D1·W1
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="num py-2.5 text-right font-medium text-rose-400 font-mono">
                          {row.stopLoss != null
                            ? fmtNum(row.stopLoss, 2)
                            : row.sniperStopLoss != null
                            ? fmtNum(row.sniperStopLoss, 2)
                            : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-emerald-400 font-mono">
                          {row.targetPrice != null
                            ? fmtNum(row.targetPrice, 2)
                            : row.sniperTarget1 != null
                            ? fmtNum(row.sniperTarget1, 2)
                            : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-bold text-amber-400 font-mono">
                          {row.riskReward != null
                            ? `${row.riskReward}R`
                            : row.sniperRiskReward != null
                            ? `${row.sniperRiskReward.toFixed(1)}R`
                            : "—"}
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
                          <SqueezeBadge
                            state={row.squeezeState}
                            bars={row.squeezeBars}
                            slope={row.squeezeMomentumSlope}
                          />
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
                              <PrecisionMtfBadge
                                isPrecisionMtfAligned={row.isPrecisionMtfAligned}
                                mtfSummary={row.mtfSummary}
                              />
                              {!row.isPrecisionMtfAligned && row.isMtfAligned ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded bg-gradient-to-r from-emerald-500/25 to-amber-500/25 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300"
                                  title={row.mtfSummary || "Đồng thuận Tăng Đa Khung: H1 🟢 · D1 🟢 · W1 🟢"}
                                >
                                  H1·D1·W1 🟢🟢🟢
                                </span>
                              ) : !row.isPrecisionMtfAligned && row.mtfConsensus === "D1_W1_BULL" ? (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded bg-blue-500/20 border border-blue-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-blue-300"
                                  title={row.mtfSummary || "Đồng thuận D1 + W1 Tăng"}
                                >
                                  D1·W1 🟢🟢⚪
                                </span>
                              ) : null}
                              <MaGeometryBadge
                                isRibbonSqueeze={row.isMaRibbonSqueeze}
                                isReclaimSpring={row.isMaReclaimSpring}
                                ribbonSpreadPct={row.maRibbonSpreadPct}
                              />
                              <VolumeAbsorptionBadge
                                isAbsorptionSpike={row.isAbsorptionSpike}
                                isVsaNoSupply={row.isVsaNoSupplyTest}
                                activeBuyRatioPct={row.activeBuyRatioPct}
                              />
                              <TechPatternBadge
                                isTightCloses={row.isTightCloses}
                                tightCloseSpreadPct={row.tightCloseSpreadPct}
                                isVolumeDryUp={row.isVolumeDryUp}
                                isWyckoffLps={row.isWyckoffLps}
                                isRsNewHigh20={row.isRsNewHigh20}
                              />
                              <FiboGoldenPocketBadge
                                isGoldenPocket={row.isGoldenPocket}
                                summary={row.fiboSummary}
                              />
                              <FlipZoneBadge
                                isFlipZone={row.isFlipZoneSupport}
                                summary={row.structureSummary}
                              />
                              <SmcOrderBlockBadge
                                isOrderBlock={row.isSmcOrderBlock}
                                summary={row.structureSummary}
                              />
                              {row.sniperTriggerSubtype && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                                  ⚡ {row.sniperTriggerLabelVi || row.sniperTriggerSubtype} {row.sniperRiskReward ? `(${row.sniperRiskReward.toFixed(1)}R)` : ""}
                                </span>
                              )}
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
                          <ConfluenceBadge
                            badge={row.confluenceBadge}
                            score={row.confluenceScore}
                            grade={row.setupGrade}
                            pillarsPassed={row.orthogonalPillarsPassed}
                          />
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
                        <td className="num py-2.5 text-right font-medium text-text-secondary">
                          {row.peg != null ? (
                            <span className={row.peg <= 1.0 && row.peg > 0 ? "text-emerald-400 font-bold" : "text-text-secondary"}>
                              {fmtNum(row.peg, 2)}
                            </span>
                          ) : (
                            "—"
                          )}
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
                        <td className="num py-2.5 text-right font-bold font-mono">
                          {row.consensusUpsidePct != null ? (
                            <span className={row.consensusUpsidePct >= 15 ? "text-emerald-400" : "text-text-secondary"}>
                              +{fmtNum(row.consensusUpsidePct, 1)}%
                            </span>
                          ) : (
                            "—"
                          )}
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
                        <td className="num py-2.5 text-right font-bold font-mono">
                          {row.roic != null ? (
                            <span className={row.roic >= 15 ? "text-emerald-400" : "text-text-primary"}>
                              {fmtNum(row.roic, 1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right font-bold font-mono">
                          {row.cfoToNetProfit != null ? (
                            <span className={row.cfoToNetProfit >= 1.0 ? "text-cyan-400" : "text-text-secondary"}>
                              {fmtNum(row.cfoToNetProfit, 2)}x
                            </span>
                          ) : (
                            "—"
                          )}
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
                          <FaHealthBadge
                            faCategory={row.faCategory}
                            faBadgeVi={row.faBadgeVi}
                            faSummaryVi={row.faSummaryVi}
                            isNetCash={row.isNetCash}
                            roic={row.roic}
                            cfoToNp={row.cfoToNetProfit}
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <PiotroskiBadge score={row.piotroskiFScore} rating={row.piotroskiRating} />
                        </td>
                        <td className="py-2.5 text-center">
                          <AltmanBadge zone={row.altmanZone} zScore={row.altmanZScore} />
                        </td>
                        <td className="num py-2.5 text-right font-bold font-mono">
                          {row.interestCoverage != null ? (
                            <span
                              className={
                                row.interestCoverage >= 4.0
                                  ? "text-emerald-400"
                                  : row.interestCoverage < 1.5
                                  ? "text-rose-400"
                                  : "text-text-primary"
                              }
                            >
                              {fmtNum(row.interestCoverage, 1)}x
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-primary">
                          {row.debtEquity != null ? fmtNum(row.debtEquity, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.currentRatio != null ? fmtNum(row.currentRatio, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-center">
                          {row.isNetCash ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              Net Cash
                            </span>
                          ) : (
                            <span className="text-[10.5px] text-text-muted">Vay ròng</span>
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.fcfTtm != null ? fmtNum(row.fcfTtm, 0) : "—"}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right font-medium text-text-secondary">
                          {row.qualityScore != null ? `${row.qualityScore}/100` : "—"}
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
                  {row.faCategory && row.faCategory !== "STANDARD" && (
                    <FaHealthBadge
                      faCategory={row.faCategory}
                      faBadgeVi={row.faBadgeVi}
                      faSummaryVi={row.faSummaryVi}
                      isNetCash={row.isNetCash}
                      roic={row.roic}
                      cfoToNp={row.cfoToNetProfit}
                    />
                  )}
                  {(row.isTightCloses || row.isVolumeDryUp || row.isWyckoffLps) && (
                    <TechPatternBadge
                      isTightCloses={row.isTightCloses}
                      tightCloseSpreadPct={row.tightCloseSpreadPct}
                      isVolumeDryUp={row.isVolumeDryUp}
                      isWyckoffLps={row.isWyckoffLps}
                      isRsNewHigh20={row.isRsNewHigh20}
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
