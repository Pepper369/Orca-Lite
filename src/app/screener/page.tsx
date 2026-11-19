"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LayoutGrid, Sparkles } from "lucide-react";
import { Loading, Panel } from "@/components/ui";
import { FlatsIcon } from "@/components/screener-icons";
import { ErrorBoundary } from "@/components/error-boundary";
import { prefetchApi } from "@/lib/hooks";
import {
  WORKSPACE_GROUPS,
  resolveUniverseRoute,
  type CanonicalWorkspaceId,
  type WorkspaceGroupDef,
} from "@/lib/quant/screener-taxonomy";

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
const SystemicRiskRadarPanel = dynamic(
  () => import("@/components/systemic-risk-radar-panel").then((m) => m.SystemicRiskRadarPanel),
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
const SectorFlowScreener = dynamic(
  () => import("@/components/sector-flow-screener").then((m) => m.SectorFlowScreener),
  { ssr: false, loading: PanelFallback },
);
const ScreenerBacktestModal = dynamic(
  () => import("@/components/screener-backtest-modal").then((m) => m.ScreenerBacktestModal),
  { ssr: false },
);
const MacroRadarCard = dynamic(
  () => import("@/components/macro-radar-card").then((m) => m.MacroRadarCard),
  { ssr: false, loading: PanelFallback },
);
const FireAntScreenerPanel = dynamic(
  () => import("@/components/screener/fireant-screener-panel").then((m) => m.FireAntScreenerPanel),
  { ssr: false, loading: PanelFallback },
);

/* Specialized Domain Studios */
const CanslimScreener = dynamic(
  () => import("@/components/canslim-screener").then((m) => m.CanslimScreener),
  { ssr: false, loading: PanelFallback },
);
const WyckoffScreener = dynamic(
  () => import("@/components/wyckoff-screener").then((m) => m.WyckoffScreener),
  { ssr: false, loading: PanelFallback },
);
const CandlestickScreener = dynamic(
  () => import("@/components/candlestick-screener").then((m) => m.CandlestickScreener),
  { ssr: false, loading: PanelFallback },
);
const DivergenceScreener = dynamic(
  () => import("@/components/divergence-screener").then((m) => m.DivergenceScreener),
  { ssr: false, loading: PanelFallback },
);
const ElliottScreener = dynamic(
  () => import("@/components/elliott-screener").then((m) => m.ElliottScreener),
  { ssr: false, loading: PanelFallback },
);
const MinerviniScreener = dynamic(
  () => import("@/components/minervini-screener").then((m) => m.MinerviniScreener),
  { ssr: false, loading: PanelFallback },
);
const AlphaBetaScreener = dynamic(
  () => import("@/components/alpha-beta-screener").then((m) => m.AlphaBetaScreener),
  { ssr: false, loading: PanelFallback },
);
const FundamentalScreener = dynamic(
  () => import("@/components/fundamental-screener").then((m) => m.FundamentalScreener),
  { ssr: false, loading: PanelFallback },
);
const ValuationScreener = dynamic(
  () => import("@/components/valuation-screener").then((m) => m.ValuationScreener),
  { ssr: false, loading: PanelFallback },
);
const MaCandleConfluenceScreener = dynamic(
  () => import("@/components/ma-candle-confluence-screener").then((m) => m.MaCandleConfluenceScreener),
  { ssr: false, loading: PanelFallback },
);
const FourMScreener = dynamic(
  () => import("@/components/four-m-screener").then((m) => m.FourMScreener),
  { ssr: false, loading: PanelFallback },
);

const HAS_STUDIO_VIEW = new Set<CanonicalWorkspaceId>([
  "trend-breakout",
  "wyckoff-smc",
  "patterns-candles",
  "fa-screener",
  "valuation-studio",
  "growth-canslim-4m",
]);

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

function SubTabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-border-subtle bg-panel/70 p-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            active === t.id
              ? "bg-accent-primary text-white font-semibold shadow-xs"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ScreenerInner() {
  const params = useSearchParams();
  const initialResolved = useMemo(() => resolveUniverseRoute(params.get("universe")), [params]);
  const [workspace, setWorkspace] = useState<CanonicalWorkspaceId>(() => initialResolved.workspace);
  const [subTabMap, setSubTabMap] = useState<Partial<Record<CanonicalWorkspaceId, string>>>(() =>
    initialResolved.subTab ? { [initialResolved.workspace]: initialResolved.subTab } : {},
  );
  const [showBacktest, setShowBacktest] = useState(false);
  const [visited, setVisited] = useState<Set<CanonicalWorkspaceId>>(() => new Set([initialResolved.workspace]));
  const sector = params.get("sector");

  const initialGroup =
    WORKSPACE_GROUPS.find((g) => g.items.some((i) => i.id === workspace))?.id ?? "strategy_hub";
  const [selectedGroup, setSelectedGroup] = useState<WorkspaceGroupDef["id"]>(initialGroup);
  const [studioModeMap, setStudioModeMap] = useState<Partial<Record<CanonicalWorkspaceId, "studio" | "matrix">>>({});
  const currentViewMode = studioModeMap[workspace] ?? "matrix";

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(workspace)) return prev;
      const next = new Set(prev);
      next.add(workspace);
      return next;
    });
  }, [workspace]);

  useEffect(() => {
    const parentGroup = WORKSPACE_GROUPS.find((g) => g.items.some((i) => i.id === workspace))?.id;
    if (parentGroup && parentGroup !== selectedGroup) {
      setSelectedGroup(parentGroup);
    }
  }, [workspace, selectedGroup]);

  const currentGroupItems =
    WORKSPACE_GROUPS.find((g) => g.id === selectedGroup)?.items ?? WORKSPACE_GROUPS[0].items;

  const renderPanel = (w: CanonicalWorkspaceId) => {
    const isStudio = (studioModeMap[w] ?? "matrix") === "studio";
    const sub = subTabMap[w];

    switch (w) {
      case "master-matrix":
        return (
          <VnScreener
            defaultSector={sector}
            defaultPreset={initialResolved.workspace === "master-matrix" ? (initialResolved.defaultPreset ?? "apex_buy_now") : "apex_buy_now"}
            defaultView="orca_master"
            onOpenBacktest={() => setShowBacktest(true)}
          />
        );
      case "multi-source":
        return <MultiSourceScreener />;
      case "oquant-studio":
        return <OQuantStudio />;
      case "fireant-presets":
        return <FireAntScreenerPanel />;
      case "crypto":
        return <CryptoScreener />;

      case "trend-breakout": {
        const tab = sub ?? "minervini";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "minervini", label: "Minervini VCP & Tight Closes" },
                { id: "ma-cross", label: "MA Cross & Xu hướng" },
                { id: "alpha-beta", label: "Alpha / Beta & Low-Vol" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "trend-breakout": id }))}
            />
            {isStudio ? (
              tab === "alpha-beta" ? (
                <AlphaBetaScreener defaultSector={sector} />
              ) : (
                <MinerviniScreener defaultSector={sector} />
              )
            ) : (
              <VnScreener
                defaultSector={sector}
                defaultPreset={tab === "alpha-beta" ? "quant_low_beta" : tab === "ma-cross" ? "trend_alignment" : "volatility_breakout"}
                defaultView={tab === "alpha-beta" ? "quant" : "technical"}
                onOpenBacktest={() => setShowBacktest(true)}
              />
            )}
          </div>
        );
      }

      case "wyckoff-smc": {
        const tab = sub ?? "wyckoff";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "wyckoff", label: "Wyckoff VSA & Spring" },
                { id: "elliott", label: "Sóng Elliott" },
                { id: "divergence", label: "Phân kỳ RSI / MACD" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "wyckoff-smc": id }))}
            />
            {isStudio ? (
              tab === "elliott" ? (
                <ElliottScreener defaultSector={sector} />
              ) : tab === "divergence" ? (
                <DivergenceScreener />
              ) : (
                <WyckoffScreener defaultSector={sector} />
              )
            ) : (
              <VnScreener
                defaultSector={sector}
                defaultPreset="reversal_confluence"
                defaultView="confluence"
                onOpenBacktest={() => setShowBacktest(true)}
              />
            )}
          </div>
        );
      }

      case "patterns-candles": {
        const tab = sub ?? "ma-confluence";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "ma-confluence", label: "Hợp lưu MA & Nến" },
                { id: "candlestick", label: "Mẫu Nến Đa Khung" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "patterns-candles": id }))}
            />
            {isStudio ? (
              tab === "candlestick" ? (
                <CandlestickScreener defaultSector={sector} />
              ) : (
                <MaCandleConfluenceScreener defaultSector={sector} />
              )
            ) : (
              <VnScreener
                defaultSector={sector}
                defaultPreset="trend_alignment"
                defaultView="confluence"
                onOpenBacktest={() => setShowBacktest(true)}
              />
            )}
          </div>
        );
      }

      case "fa-screener": {
        const tab = sub ?? "fundamental";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "fundamental", label: "Chỉ số Cơ bản BCTC (Truth-in-Data)" },
                { id: "piotroski", label: "Piotroski F-Score & Altman Z''" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "fa-screener": id }))}
            />
            {isStudio ? (
              <FundamentalScreener defaultSector={sector} />
            ) : (
              <VnScreener
                defaultSector={sector}
                defaultPreset={tab === "piotroski" ? "piotroski_diamonds" : "fa_fortress"}
                defaultView="fa_matrix"
                onOpenBacktest={() => setShowBacktest(true)}
              />
            )}
          </div>
        );
      }

      case "valuation-studio":
        return isStudio ? (
          <ValuationScreener defaultSector={sector} />
        ) : (
          <VnScreener
            defaultSector={sector}
            defaultPreset="deep_value"
            defaultView="valuation"
            onOpenBacktest={() => setShowBacktest(true)}
          />
        );

      case "growth-canslim-4m": {
        const tab = sub ?? "canslim";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "canslim", label: "CANSLIM O'Neil & GARP" },
                { id: "four-m", label: "4M Phil Town & Compounder" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "growth-canslim-4m": id }))}
            />
            {isStudio ? (
              tab === "four-m" ? (
                <FourMScreener defaultSector={sector} />
              ) : (
                <CanslimScreener defaultSector={sector} />
              )
            ) : (
              <VnScreener
                defaultSector={sector}
                defaultPreset={tab === "four-m" ? "buffett_compounder" : "garp_growth"}
                defaultView="profitability"
                onOpenBacktest={() => setShowBacktest(true)}
              />
            )}
          </div>
        );
      }

      case "macro-sector-flow": {
        const tab = sub ?? "sector-flow";
        return (
          <div>
            <SubTabBar
              tabs={[
                { id: "sector-flow", label: "Dòng tiền Ngành" },
                { id: "rrg-rotation", label: "Vòng xoay RRG" },
                { id: "macro-radar", label: "Radar Vĩ mô & Chu kỳ" },
                { id: "systemic-radar", label: "Radar Rủi ro Hệ thống" },
              ]}
              active={tab}
              onSelect={(id) => setSubTabMap((p) => ({ ...p, "macro-sector-flow": id }))}
            />
            {tab === "rrg-rotation" ? (
              <RrgChart />
            ) : tab === "macro-radar" ? (
              <MacroRadarCard />
            ) : tab === "systemic-radar" ? (
              <SystemicRiskRadarPanel />
            ) : (
              <SectorFlowScreener />
            )}
          </div>
        );
      }

      default:
        return <VnScreener defaultSector={sector} onOpenBacktest={() => setShowBacktest(true)} />;
    }
  };

  return (
    <div className="space-y-3">
      <Panel pad={false}>
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <FlatsIcon /> Bộ lọc tài sản · FA 2.0
              </h1>
              <p className="mt-1 text-[12px] text-text-muted">
                12 không gian lọc tinh gọn · 20 chiến lược trực giao · Dữ liệu BCTC đa kỳ thật & chuẩn hóa theo ngành.
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

          {/* Tier 1: 4 Strategy Groups */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border-subtle/80">
            {WORKSPACE_GROUPS.map((g) => {
              const active = selectedGroup === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroup(g.id);
                    if (!g.items.some((item) => item.id === workspace)) {
                      setWorkspace(g.items[0].id);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    active
                      ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40 shadow-xs"
                      : "bg-surface-elevated/70 text-text-secondary border border-border-subtle hover:text-text-primary hover:bg-surface-elevated"
                  }`}
                >
                  <span>{g.title}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${active ? "bg-accent-primary/30 text-accent-primary" : "text-text-muted"}`}>
                    {g.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tier 2: Consolidated Workspaces (12 total) */}
          <div className="seg-scroll mt-2">
            <div className="seg" role="tablist" aria-label="Chọn không gian bộ lọc">
              {currentGroupItems.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={workspace === tab.id}
                  data-active={workspace === tab.id}
                  onClick={() => setWorkspace(tab.id)}
                  onMouseEnter={() => {
                    if (tab.id === "fa-screener") prefetchApi("/api/v1/screener/fundamental", 12_000);
                    else if (tab.id === "valuation-studio") prefetchApi("/api/v1/screener/valuation", 12_000);
                    else if (tab.id === "growth-canslim-4m") prefetchApi("/api/v1/screener/canslim?minScore=50&minPass=3&limit=40", 12_000);
                    else if (tab.id === "wyckoff-smc") prefetchApi("/api/v1/screener/wyckoff?phase=all&setup=all&limit=40", 12_000);
                    else if (tab.id === "crypto") prefetchApi("/api/v1/crypto/markets?limit=120", 8_000);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Studio vs Matrix Dual View Switcher */}
          {HAS_STUDIO_VIEW.has(workspace) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-3 border-t border-border-subtle/80 text-xs">
              <div className="flex items-center gap-2 text-text-secondary text-xs">
                <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>
                  Chế độ xem: <strong>Bảng Ma Trận</strong> (Đa chỉ số tốc độ cao) hoặc <strong>Studio Chuyên Sâu</strong> (Trường phái đặc thù).
                </span>
              </div>
              <div className="inline-flex self-start sm:self-auto rounded-lg border border-border-subtle bg-surface-elevated/90 p-0.5 text-xs font-medium shadow-xs">
                <button
                  type="button"
                  onClick={() => setStudioModeMap((prev) => ({ ...prev, [workspace]: "matrix" }))}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    currentViewMode === "matrix"
                      ? "bg-accent-primary text-black font-semibold shadow-xs"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-base/50"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Bảng Ma Trận</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioModeMap((prev) => ({ ...prev, [workspace]: "studio" }))}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    currentViewMode === "studio"
                      ? "bg-accent-primary text-black font-semibold shadow-xs"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-base/50"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Studio Chuyên Sâu</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>
      <div className="screener-keep-alive-views">
        {Array.from(visited).map((w) => (
          <div
            key={w}
            style={{ display: w === workspace ? "block" : "none" }}
            aria-hidden={w !== workspace}
          >
            <SoftPanel name={w} resetKey={`${w}:${studioModeMap[w] ?? "matrix"}`}>
              {renderPanel(w)}
            </SoftPanel>
          </div>
        ))}
      </div>
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
