"use client";

import { memo, useState } from "react";
import {
  Activity,
  Calculator,
  Gauge,
  Info,
  Layers,
  Percent,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { RatioEngineResult, RatioItem, RatioCategory } from "@/lib/financial/ratio-engine";
import { Loading, Panel, EmptyState, Badge } from "@/components/ui";

type RatiosApiResponse = {
  symbol: string;
  ratios: RatioEngineResult;
  sources: Record<string, string | null>;
  periodsAvailable: number;
};

type GroupKey = "liquidity" | "leverage" | "efficiency" | "profitability" | "valuation";

const GROUPS: {
  key: GroupKey;
  num: string;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  catKeys: RatioCategory[];
}[] = [
  {
    key: "liquidity",
    num: "1",
    title: "Khả năng thanh toán ngắn hạn (Thanh khoản)",
    sub: "Đo lường năng lực trang trải nghĩa vụ đến hạn & vốn lưu động thuần",
    icon: ShieldCheck,
    catKeys: ["liquidity"],
  },
  {
    key: "leverage",
    num: "2",
    title: "Khả năng thanh toán dài hạn (Đòn bẩy tài chính)",
    sub: "Đánh giá mức độ an toàn nợ vay, cơ cấu nợ dài hạn & bảo đảm gốc lãi",
    icon: Gauge,
    catKeys: ["leverage"],
  },
  {
    key: "efficiency",
    num: "3",
    title: "Hiệu suất sử dụng tài sản (Vòng quay hoạt động)",
    sub: "Tốc độ luân chuyển tài sản cố định, tồn kho, khoản phải thu & chu kỳ tiền",
    icon: Activity,
    catKeys: ["efficiency"],
  },
  {
    key: "profitability",
    num: "4",
    title: "Khả năng sinh lời & Mô hình DuPont",
    sub: "Biên lợi nhuận gộp/ròng, ROE, ROA, ROIC & bóc tách 3-5 nhân tố DuPont",
    icon: TrendingUp,
    catKeys: ["profitability", "dupont"],
  },
  {
    key: "valuation",
    num: "5",
    title: "Giá trị thị trường & Bội số định giá",
    sub: "P/E, PEG, P/B, EV/EBITDA, Dividend Yield và các chỉ số trên mỗi cổ phần",
    icon: Calculator,
    catKeys: ["valuation", "perShare"],
  },
];

function formatVal(item: RatioItem): string {
  const v = item.value;
  if (v == null || !Number.isFinite(v)) return "—";
  if (item.format === "pct") return `${(v * 100).toFixed(2)}%`;
  if (item.format === "x") return `${v.toFixed(2)}x`;
  if (item.format === "days") return `${Math.round(v)} ngày`;
  if (item.format === "money") {
    if (Math.abs(v) >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(2)} nghìn tỷ`;
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ`;
    return v.toLocaleString("vi-VN") + " ₫";
  }
  return v.toFixed(2);
}

function RatioCard({ item }: { item: RatioItem }) {
  const tone = item.band === "safe" ? "up" : item.band === "risk" ? "down" : "accent";
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border-subtle/80 bg-surface-elevated/40 p-3 transition hover:border-border-default">
      <div>
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-[12px] font-semibold text-text-primary">{item.labelVi}</span>
          {item.bandLabel && (
            <Badge tone={tone} className="text-[10px] shrink-0">
              {item.bandLabel}
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-text-muted">{item.labelEn}</div>
      </div>

      <div className="mt-2.5">
        <div className="text-[18px] font-bold tabular-nums text-text-primary">
          {formatVal(item)}
        </div>
        {item.formula && (
          <div className="mt-1 text-[10px] text-text-muted/80 line-clamp-1 hover:line-clamp-none transition-all" title={item.formula}>
            <span className="opacity-70">CT:</span> {item.formula}
          </div>
        )}
        {item.note && (
          <div className="mt-0.5 text-[10px] text-accent-primary/80 line-clamp-1" title={item.note}>
            * {item.note}
          </div>
        )}
      </div>
    </div>
  );
}

export const FinancialRatiosPanel = memo(function FinancialRatiosPanel({ symbol }: { symbol: string }) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>("liquidity");

  const { data, isLoading } = useApi<RatiosApiResponse>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/ratios` : null,
    { refreshInterval: 300_000 }
  );

  const title = (
    <span className="flex items-center gap-2">
      <Gauge className="size-4 text-accent-primary" /> Bộ 5 Nhóm Chỉ Số Tài Chính Doanh Nghiệp ({symbol})
    </span>
  );

  if (isLoading && !data) {
    return (
      <Panel title={title}>
        <Loading rows={4} />
      </Panel>
    );
  }

  if (!data?.ratios) {
    return (
      <Panel title={title}>
        <EmptyState title="Chưa có dữ liệu tỷ số tài chính" description={`Hệ thống đang chuẩn hóa số liệu BCTC cho ${symbol}.`} />
      </Panel>
    );
  }

  const ratios = data.ratios;
  const currentGroup = GROUPS.find((g) => g.key === activeGroup)!;

  // Thu thập các chỉ tiêu thuộc các categories của nhóm
  const items: RatioItem[] = [];
  for (const cat of currentGroup.catKeys) {
    const list = ratios.categories[cat] ?? [];
    items.push(...list);
  }

  return (
    <Panel title={title}>
      {/* 5 Tab chuyển đổi trực quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pb-3 mb-3 border-b border-line/40">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const isActive = activeGroup === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveGroup(g.key)}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                isActive
                  ? "border-accent-primary bg-accent-primary/10 shadow-sm"
                  : "border-border-subtle bg-surface-elevated/20 hover:border-border-default hover:bg-surface-elevated/40 text-text-muted"
              }`}
            >
              <div
                className={`mt-0.5 rounded-md p-1.5 ${
                  isActive ? "bg-accent-primary text-white" : "bg-surface-elevated text-text-muted"
                }`}
              >
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-semibold truncate ${isActive ? "text-accent-primary" : "text-text-primary"}`}>
                  {g.num}. {g.title.split("(")[0].trim()}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {g.title.includes("(") ? `(${g.title.split("(")[1]}` : g.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Header nhóm đang chọn */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h4 className="text-[13px] font-bold text-text-primary">
            Nhóm {currentGroup.num}: {currentGroup.title}
          </h4>
          <p className="text-[11px] text-text-muted">{currentGroup.sub}</p>
        </div>
        {ratios.period && (
          <span className="text-[11px] font-mono text-text-muted bg-surface-elevated px-2 py-0.5 rounded border border-border-subtle">
            Kỳ BCTC: {ratios.period}
          </span>
        )}
      </div>

      {/* Grid danh sách thẻ chỉ số */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => (
          <RatioCard key={it.key} item={it} />
        ))}
      </div>
    </Panel>
  );
});
