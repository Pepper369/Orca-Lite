"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { Loading, Panel } from "@/components/ui";
import { FlatsIcon } from "@/components/screener-icons";
import { ErrorBoundary } from "@/components/error-boundary";
import { prefetchApi } from "@/lib/hooks";

type Universe =
  | "multi-source"
  | "quant-edge"
  | "confluence"
  | "stocks"
  | "oquant-quant"
  | "miquant-quant"
  | "ma-cross"
  | "sector-flow"
  | "rrg-rotation"
  | "four-m"
  | "canslim"
  | "crypto"
  | "wyckoff"
  | "minervini"
  | "elliott"
  | "valuation"
  | "fundamental"
  | "candlestick"
  | "divergence"
  | "macro-radar"
  | "alpha-beta";

const UNIVERSE_TABS: { id: Universe; label: string }[] = [
  { id: "multi-source", label: "Đa Nguồn Pro (Orca Multi-Source Engine)" },
  { id: "quant-edge", label: "Ưu Thế Quant (Statistical Alpha)" },
  { id: "confluence", label: "Siêu Hội Tụ (Orca Confluence Pro)" },
  { id: "macro-radar", label: "Radar Vĩ Mô & Chu Kỳ Kinh Tế" },
  { id: "rrg-rotation", label: "Vòng xoay RRG Ngành" },
  { id: "stocks", label: "Cổ phiếu VN" },
  { id: "oquant-quant", label: "OQuant AI Bot & Quant" },
  { id: "ma-cross", label: "Đường MA (Golden/Death Cross)" },
  { id: "sector-flow", label: "Dòng tiền ngành" },
  { id: "four-m", label: "Bộ lọc 4M" },
  { id: "canslim", label: "CANSLIM" },
  { id: "divergence", label: "Phân kỳ" },
  { id: "alpha-beta", label: "Hệ số cổ phiếu" },
  { id: "candlestick", label: "Mẫu nến" },
  { id: "minervini", label: "Minervini" },
  { id: "wyckoff", label: "Wyckoff" },
  { id: "elliott", label: "Sóng Elliott" },
  { id: "valuation", label: "Định giá P" },
  { id: "fundamental", label: "Chỉ số cơ bản" },
  { id: "crypto", label: "Tiền mã hóa" },
];

function parseUniverse(raw: string | null): Universe {
  const allowed = new Set(UNIVERSE_TABS.map((t) => t.id));
  if (raw && allowed.has(raw as Universe)) return raw as Universe;
  return "multi-source";
}

const PanelFallback = () => <Loading rows={6} />;

/** Lazy panels — one broken module cannot take down the whole /screener route. */
const MultiSourceScreener = dynamic(
  () => import("@/components/multi-source-screener").then((m) => m.MultiSourceScreener),
  { ssr: false, loading: PanelFallback },
);
const RrgChart = dynamic(
  () => import("@/components/rrg-chart").then((m) => m.RrgChart),
  { ssr: false, loading: PanelFallback },
);
const OQuantStudio = dynamic(
  () => import("@/components/oquant-quant-studio").then((m) => m.OQuantStudio),
  { ssr: false, loading: PanelFallback },
);
const VnScreener = dynamic(
  () => import("./screener-panels").then((m) => m.VnScreener),
  { ssr: false, loading: PanelFallback },
);
const CryptoScreener = dynamic(
  () => import("./screener-panels").then((m) => m.CryptoScreener),
  { ssr: false, loading: PanelFallback },
);
const AlphaBetaScreener = dynamic(
  () => import("@/components/alpha-beta-screener").then((m) => m.AlphaBetaScreener),
  { ssr: false, loading: PanelFallback },
);
const DivergenceScreener = dynamic(
  () => import("@/components/divergence-screener").then((m) => m.DivergenceScreener),
  { ssr: false, loading: PanelFallback },
);
const CandlestickScreener = dynamic(
  () => import("@/components/candlestick-screener").then((m) => m.CandlestickScreener),
  { ssr: false, loading: PanelFallback },
);
const WyckoffScreener = dynamic(
  () => import("@/components/wyckoff-screener").then((m) => m.WyckoffScreener),
  { ssr: false, loading: PanelFallback },
);
const CanslimScreener = dynamic(
  () => import("@/components/canslim-screener").then((m) => m.CanslimScreener),
  { ssr: false, loading: PanelFallback },
);
const MinerviniScreener = dynamic(
  () => import("@/components/minervini-screener").then((m) => m.MinerviniScreener),
  { ssr: false, loading: PanelFallback },
);
const ElliottScreener = dynamic(
  () => import("@/components/elliott-screener").then((m) => m.ElliottScreener),
  { ssr: false, loading: PanelFallback },
);
const ValuationScreener = dynamic(
  () => import("@/components/valuation-screener").then((m) => m.ValuationScreener),
  { ssr: false, loading: PanelFallback },
);
const FundamentalScreener = dynamic(
  () => import("@/components/fundamental-screener").then((m) => m.FundamentalScreener),
  { ssr: false, loading: PanelFallback },
);
const FourMScreener = dynamic(
  () => import("@/components/four-m-screener").then((m) => m.FourMScreener),
  { ssr: false, loading: PanelFallback },
);
const SectorFlowScreener = dynamic(
  () => import("@/components/sector-flow-screener").then((m) => m.SectorFlowScreener),
  { ssr: false, loading: PanelFallback },
);
const MaScreener = dynamic(
  () => import("@/components/ma-screener").then((m) => m.MaScreener),
  { ssr: false, loading: PanelFallback },
);
const ScreenerBacktestModal = dynamic(
  () => import("@/components/screener-backtest-modal").then((m) => m.ScreenerBacktestModal),
  { ssr: false }
);
const MacroRadarCard = dynamic(
  () => import("@/components/macro-radar-card").then((m) => m.MacroRadarCard),
  { ssr: false, loading: PanelFallback }
);

function SoftPanel({
  name,
  resetKey,
  children,
}: {
  name: string;
  resetKey: string;
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      name={`screener:${name}`}
      resetKey={resetKey}
      fallback={
        <div className="mx-auto max-w-lg rounded-xl border border-border-subtle bg-surface-elevated/80 px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-text-primary">Bộ lọc này gặp lỗi tạm thời</p>
          <p className="mt-1 text-[12px] text-text-muted">
            Tab khác vẫn dùng được. Chọn bộ lọc khác hoặc thử lại.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

function ScreenerInner() {
  const params = useSearchParams();
  const [universe, setUniverse] = useState<Universe>(() => parseUniverse(params.get("universe")));
  const [showBacktest, setShowBacktest] = useState(false);
  const sector = params.get("sector");

  let body: React.ReactNode;
  switch (universe) {
    case "multi-source":
      body = <MultiSourceScreener />;
      break;
    case "quant-edge":
      body = (
        <VnScreener
          defaultSector={sector}
          defaultPreset="quant_edge"
          defaultView="quant"
          onOpenBacktest={() => setShowBacktest(true)}
        />
      );
      break;
    case "confluence":
      body = (
        <VnScreener
          defaultSector={sector}
          defaultPreset="confluence"
          defaultView="confluence"
          onOpenBacktest={() => setShowBacktest(true)}
        />
      );
      break;
    case "macro-radar":
      body = <MacroRadarCard />;
      break;
    case "oquant-quant":
    case "miquant-quant":
      body = <OQuantStudio />;
      break;
    case "ma-cross":
      body = <MaScreener defaultSector={sector} />;
      break;
    case "sector-flow":
      body = <SectorFlowScreener />;
      break;
    case "rrg-rotation":
      body = <RrgChart />;
      break;
    case "four-m":
      body = <FourMScreener defaultSector={sector} />;
      break;
    case "crypto":
      body = <CryptoScreener />;
      break;
    case "alpha-beta":
      body = <AlphaBetaScreener defaultSector={sector} />;
      break;
    case "divergence":
      body = <DivergenceScreener />;
      break;
    case "candlestick":
      body = <CandlestickScreener defaultSector={sector} />;
      break;
    case "wyckoff":
      body = <WyckoffScreener defaultSector={sector} />;
      break;
    case "canslim":
      body = <CanslimScreener defaultSector={sector} />;
      break;
    case "minervini":
      body = <MinerviniScreener defaultSector={sector} />;
      break;
    case "elliott":
      body = <ElliottScreener defaultSector={sector} />;
      break;
    case "valuation":
      body = <ValuationScreener defaultSector={sector} />;
      break;
    case "fundamental":
      body = <FundamentalScreener defaultSector={sector} />;
      break;
    default:
      body = <VnScreener defaultSector={sector} onOpenBacktest={() => setShowBacktest(true)} />;
  }

  return (
    <div className="space-y-3">
      <Panel pad={false}>
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <FlatsIcon /> Bộ lọc tài sản
              </h1>
              <p className="mt-1 text-[12px] text-text-muted">
                Ưu tiên thị trường chứng khoán Việt Nam — chạy hoàn toàn trên dữ liệu thật mới nhất, không minh họa bằng dữ
                liệu giả.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBacktest(true)}
              className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              Backtest Mô Phỏng (OQuant)
            </button>
          </div>
          <div className="seg-scroll mt-3">
            <div className="seg" role="tablist" aria-label="Chọn bộ lọc">
              {UNIVERSE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={universe === tab.id}
                  data-active={universe === tab.id}
                  onClick={() => setUniverse(tab.id)}
                  onMouseEnter={() => {
                    // P5-A: warm screener API on tab hover
                    if (tab.id === "ma-cross") prefetchApi("/api/v1/screener/ma-cross", 10_000);
                    else if (tab.id === "fundamental") prefetchApi("/api/v1/screener/fundamental", 12_000);
                    else if (tab.id === "valuation") prefetchApi("/api/v1/screener/valuation", 12_000);
                    else if (tab.id === "crypto") prefetchApi("/api/v1/crypto/markets?limit=120", 8_000);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 hidden text-[10px] text-text-muted sm:block md:hidden">
            Vuốt ngang để xem thêm bộ lọc (Định giá P, Chỉ số cơ bản…)
          </p>
          <p className="mt-1.5 text-[10px] text-text-muted sm:hidden">← Vuốt ngang để chọn thêm bộ lọc →</p>
        </div>
      </Panel>
      <SoftPanel name={universe} resetKey={universe}>
        {body}
      </SoftPanel>
      <ScreenerBacktestModal isOpen={showBacktest} onClose={() => setShowBacktest(false)} />
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={<Loading rows={8} />}>
      <ScreenerInner />
    </Suspense>
  );
}
