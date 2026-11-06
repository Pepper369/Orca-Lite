"use client";

import { useMemo } from "react";
import { Panel, Badge } from "@/components/ui";
import { CheckCircle2, Circle, AlertCircle, Compass, Zap, Flame, Shield, TrendingUp } from "lucide-react";
import type { MaCandleConfluenceRow } from "@/lib/engines/ma-candle-confluence";

export interface ConfluenceRadarCardProps {
  symbol: string;
  confluenceData?: MaCandleConfluenceRow | null;
  isLoading?: boolean;
}

export function ConfluenceRadarCard({
  symbol,
  confluenceData,
  isLoading,
}: ConfluenceRadarCardProps) {
  if (isLoading) {
    return (
      <Panel title="Hợp Lưu Đa Yếu Tố (Confluence 2.0)">
        <div className="animate-pulse space-y-3 py-3">
          <div className="h-4 bg-surface-subtle rounded w-3/4"></div>
          <div className="h-10 bg-surface-subtle rounded"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-12 bg-surface-subtle rounded"></div>
            <div className="h-12 bg-surface-subtle rounded"></div>
          </div>
        </div>
      </Panel>
    );
  }

  if (!confluenceData) {
    return (
      <Panel title="Hợp Lưu Đa Yếu Tố (Confluence 2.0)">
        <div className="py-4 text-center text-text-muted text-xs">
          Chưa phát hiện vùng hợp lưu kỹ thuật đủ điều kiện cho {symbol} hôm nay.
        </div>
      </Panel>
    );
  }

  const {
    setupGrade = "B",
    orthogonalPillarsPassed = 3,
    orthogonalPillarDetails = {
      structureTrend: true,
      valueZone: true,
      liquidityFlow: false,
      momentumTrigger: true,
      mtfMacro: false,
    },
    confluenceScore = 70,
    scenarioLabel,
    confluenceTags = [],
    isGoldenPocket,
    isFlipZoneSupport,
    isSmcOrderBlock,
    entryPrice,
    stopLoss,
    target1,
    target2,
    riskReward,
  } = confluenceData;

  const gradeBadgeStyle =
    setupGrade === "A+"
      ? "bg-gradient-to-r from-amber-500/25 to-purple-500/25 border-amber-400 text-amber-300"
      : setupGrade === "A"
      ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
      : "bg-blue-500/15 border-blue-400 text-blue-300";

  const pillars = [
    {
      id: "structure",
      name: "Trục 1: Cấu trúc & Xu hướng",
      desc: "MA Ribbon dốc lên / BOS / Kênh tăng",
      passed: orthogonalPillarDetails.structureTrend,
    },
    {
      id: "value",
      name: "Trục 2: Vùng Giá trị & Cản",
      desc: isGoldenPocket
        ? "Golden Pocket Fibo 0.618 - 0.65"
        : isFlipZoneSupport
        ? "Flip Zone Hỗ trợ mới (Role Reversal)"
        : "Hỗ trợ MA / Mốc số tròn tâm lý",
      passed: orthogonalPillarDetails.valueZone,
      highlight: isGoldenPocket || isFlipZoneSupport,
    },
    {
      id: "liquidity",
      name: "Trục 3: Thanh khoản & SMC",
      desc: isSmcOrderBlock
        ? "Order Block (OB) / Quét râu Sweep"
        : "VSA Absorption / Mua chủ động cá mập",
      passed: orthogonalPillarDetails.liquidityFlow,
      highlight: isSmcOrderBlock,
    },
    {
      id: "momentum",
      name: "Trục 4: Động lượng & Nến",
      desc: "Nến đảo chiều xác nhận / Phân kỳ RSI-MACD",
      passed: orthogonalPillarDetails.momentumTrigger,
    },
    {
      id: "macro",
      name: "Trục 5: Đa khung & Liên thị",
      desc: "Đồng thuận H1-D1-W1 / Sóng ngành Leading",
      passed: orthogonalPillarDetails.mtfMacro,
    },
  ];

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-accent-primary" />
          <span>Hợp Lưu Đa Yếu Tố (Orthogonal Confluence)</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Summary & Setup Grade */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-surface-subtle border border-border-subtle">
          <div>
            <div className="text-xs text-text-muted">Kịch bản Hội tụ</div>
            <div className="text-sm font-bold text-text-primary flex items-center gap-1.5 mt-0.5">
              <span>{scenarioLabel}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Hạng Setup ({orthogonalPillarsPassed}/5 Trục)</div>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold mt-1 ${gradeBadgeStyle}`}>
              <span>HẠNG {setupGrade}</span>
              <span className="text-[10px] opacity-80">· {confluenceScore}đ</span>
            </div>
          </div>
        </div>

        {/* 5 Orthogonal Pillars Checklist */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Ma trận 5 Trục Trực Giao (Chống Bẫy Hợp Lưu Dư Thừa)
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {pillars.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2 rounded text-xs transition-colors ${
                  p.passed
                    ? p.highlight
                      ? "bg-purple-500/10 border border-purple-500/30 text-purple-200"
                      : "bg-surface-subtle border border-border-subtle text-text-primary"
                    : "bg-surface-subtle/40 border border-transparent text-text-muted opacity-60"
                }`}
              >
                <div className="flex items-center gap-2">
                  {p.passed ? (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${p.highlight ? "text-purple-400" : "text-emerald-400"} shrink-0`} />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  )}
                  <span className="font-medium">{p.name}</span>
                </div>
                <span className="text-[11px] text-right truncate max-w-[200px]">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trade Setup Geometry */}
        {entryPrice > 0 && stopLoss > 0 && (
          <div className="p-3 rounded-lg bg-surface-subtle border border-border-subtle">
            <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Kế Hoạch Giao Dịch Hợp Lưu (Setup R:R)
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-1.5 rounded bg-surface border border-border-subtle">
                <div className="text-[10px] text-text-muted">Vùng Entry</div>
                <div className="font-bold text-accent-primary mt-0.5">{entryPrice.toFixed(2)}</div>
              </div>
              <div className="p-1.5 rounded bg-surface border border-border-subtle">
                <div className="text-[10px] text-text-muted">Cắt Lỗ (SL)</div>
                <div className="font-bold text-rose-400 mt-0.5">{stopLoss.toFixed(2)}</div>
              </div>
              <div className="p-1.5 rounded bg-surface border border-border-subtle">
                <div className="text-[10px] text-text-muted">Mục Tiêu 1</div>
                <div className="font-bold text-emerald-400 mt-0.5">{target1.toFixed(2)}</div>
              </div>
              <div className="p-1.5 rounded bg-surface border border-border-subtle">
                <div className="text-[10px] text-text-muted">Tỷ Lệ R:R</div>
                <div className="font-bold text-amber-400 mt-0.5">1:{riskReward}</div>
              </div>
            </div>
          </div>
        )}

        {/* Confluence Tags Strip */}
        {confluenceTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {confluenceTags.map((tag, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded bg-surface-subtle border border-border-subtle text-[10px] text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
