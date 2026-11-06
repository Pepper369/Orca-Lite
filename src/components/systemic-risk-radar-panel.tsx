"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Panel, Loading, Badge } from "@/components/ui";
import {
  ShieldAlert,
  AlertTriangle,
  Building2,
  Landmark,
  ArrowRight,
  TrendingDown,
  Activity,
  FileText,
} from "lucide-react";
import type { LegalRiskSignal, SystemicExposureLink } from "@/lib/services/systemic-risk-radar";

interface RadarApiResponse {
  radarSignals: LegalRiskSignal[];
  systemicMap: SystemicExposureLink[];
  totalTrackedLinks: number;
  highRiskLinksCount: number;
}

export function SystemicRiskRadarPanel() {
  const { data, isLoading } = useApi<RadarApiResponse>("/api/v1/ai/systemic-risk", {
    refreshInterval: 120_000,
  });

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  if (isLoading && !data) {
    return (
      <Panel title="Radar Cảnh Báo Rủi Ro Pháp Lý & Lan Tỏa Hệ Thống">
        <Loading />
      </Panel>
    );
  }

  const signals = data?.radarSignals ?? [];
  const links = data?.systemicMap ?? [];

  // Lọc liên kết theo mã được chọn
  const filteredLinks = selectedTicker
    ? links.filter((l) => l.sourceTicker === selectedTicker || l.targetTicker === selectedTicker)
    : links;

  const getSeverityBadge = (sev: LegalRiskSignal["severity"]) => {
    switch (sev) {
      case "CRITICAL":
        return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold px-2 py-0.5 rounded text-[10px]">CỰC KỲ NGUY HIỂM</span>;
      case "HIGH":
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold px-2 py-0.5 rounded text-[10px]">RỦI RO CAO</span>;
      case "MEDIUM":
        return <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-medium px-2 py-0.5 rounded text-[10px]">TRUNG BÌNH</span>;
      default:
        return <span className="bg-emerald-500/20 text-emerald-400 font-medium px-2 py-0.5 rounded text-[10px]">THẤP</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-rose-400" />
            <h2 className="text-base font-bold text-ink">
              Radar Rủi Ro Pháp Lý & Lan Tỏa Hệ Thống (Bank ⇄ BĐS)
            </h2>
          </div>
          <p className="text-xs text-ink-3">
            Tự động giám sát biến cố thanh tra, bắt bớ, chậm trả trái phiếu và bóc tách chuỗi lây lan sang các ngân hàng tài trợ chính.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold">
            {data?.highRiskLinksCount ?? 0} Mắt Xích Nguy Cơ Cao
          </span>
        </div>
      </div>

      {/* Grid 2 Cột: Tín Hiệu Rủi Ro Đang Giám Sát vs Bản Đồ Liên Kết Hệ Thống */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cột 1: Tín hiệu rủi ro pháp lý & AI khuyến nghị */}
        <Panel
          title={
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <span className="font-semibold text-ink">Biến Cố Pháp Lý Đang Giám Sát</span>
            </div>
          }
        >
          <div className="space-y-3">
            {signals.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-3">
                Không ghi nhận biến cố pháp lý nghiêm trọng trong phiên.
              </div>
            ) : (
              signals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-3 rounded-lg border border-line bg-panel-2 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-ink text-sm leading-tight">
                      {sig.title}
                    </span>
                    {getSeverityBadge(sig.severity)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
                    <span className="font-semibold text-ink">Tâm điểm: <span className="text-accent font-bold">{sig.primaryTicker}</span></span>
                    <span>•</span>
                    <span>Dạng rủi ro: <span className="text-amber-400 font-medium">{sig.categoryVi}</span></span>
                  </div>

                  <p className="text-ink-2 bg-panel-1 p-2 rounded border border-line leading-relaxed">
                    {sig.exposureSummaryVi}
                  </p>

                  <div className="bg-rose-500/5 p-2 rounded border border-rose-500/20 text-[11px]">
                    <span className="font-bold text-rose-400">Khuyến nghị AI: </span>
                    <span className="text-ink">{sig.aiActionPlanVi}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Cột 2: Bản đồ liên kết chéo Ngân Hàng - Bất Động Sản */}
        <Panel
          title={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Landmark className="size-4 text-accent" />
                <span className="font-semibold text-ink">Chuỗi Lan Tỏa Tín Dụng & Trái Phiếu</span>
              </div>
              {selectedTicker && (
                <button
                  type="button"
                  onClick={() => setSelectedTicker(null)}
                  className="text-[10px] text-accent hover:underline font-mono"
                >
                  Xem tất cả ({links.length})
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredLinks.map((item, idx) => (
              <div
                key={`${item.sourceTicker}-${item.targetTicker}-${idx}`}
                className="p-2.5 rounded-lg border border-line bg-panel-2 hover:bg-panel-3/60 transition-colors text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTicker(item.sourceTicker)}
                      className="font-bold text-ink px-1.5 py-0.5 rounded bg-panel-1 border border-line hover:border-accent"
                    >
                      {item.sourceTicker}
                    </button>
                    <ArrowRight className="size-3 text-ink-3" />
                    <button
                      type="button"
                      onClick={() => setSelectedTicker(item.targetTicker)}
                      className="font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10 border border-accent/30"
                    >
                      {item.targetTicker}
                    </button>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      item.contagionLevel === "HIGH"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    LAN TỎA {item.contagionLevel}
                  </span>
                </div>

                <div className="text-[11px] text-ink-2 font-medium">
                  {item.relationshipVi}
                </div>

                <div className="text-[10px] text-ink-3 italic">
                  {item.note}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
