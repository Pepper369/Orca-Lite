"use client";

import React, { Suspense, lazy, useMemo } from "react";
import { usePathname } from "@/lib/shims/next-navigation";
import { StockKeepAliveWorkspace, type StockTabKey } from "@/components/stocks/stock-keep-alive-workspace";
import { Loading } from "@/components/ui";
import { ErrorBoundary } from "@/components/error-boundary";

function getSearchParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

const DashboardView = lazy(() => import("@/components/dashboard").then((m) => ({ default: m.Dashboard })));
const VnMarketCenterPage = lazy(() => import("@/app/stocks/page"));
const ScreenerPage = lazy(() => import("@/app/screener/page"));
const WatchlistPage = lazy(() => import("@/app/watchlist/page"));
const StockSymbolLayout = lazy(() => import("@/app/stocks/[symbol]/layout"));
const SectorTrendPage = lazy(() => import("@/app/stocks/sectors/page"));
const CryptoPage = lazy(() => import("@/app/crypto/page"));
const CryptoDetailPage = lazy(() => import("@/components/crypto-detail").then((m) => ({ default: m.CryptoDetailPage })));
const ForexPage = lazy(() => import("@/app/forex/page"));
const ForexDetailPage = lazy(() => import("@/components/forex-detail").then((m) => ({ default: m.ForexDetailPage })));
const CommoditiesPage = lazy(() => import("@/app/commodities/page"));
const DerivativesPage = lazy(() => import("@/app/derivatives/page"));
const MacroEconomicPage = lazy(() => import("@/app/macro-economic/page"));
const CurrencyInterestRatePage = lazy(() => import("@/app/currency-interest-rate/page"));
const QuantPage = lazy(() => import("@/app/quant/page"));
const CopyTradePage = lazy(() => import("@/app/copytrade/page"));
const EarningsPage = lazy(() => import("@/app/earnings/page"));
const HeatmapPage = lazy(() => import("@/app/heatmap/page"));
const PortfolioPage = lazy(() => import("@/app/portfolio/page"));
const PersonalFinancePage = lazy(() => import("@/app/personal-finance/page"));
const MarketPage = lazy(() => import("@/app/market/page"));
const IndexDetailPage = lazy(() => import("@/app/market/index/[code]/page"));
const JournalPage = lazy(() => import("@/app/journal/page"));
const SystemPage = lazy(() => import("@/app/system/page"));
const NewsPage = lazy(() => import("@/app/news/page"));
const ReportsPage = lazy(() => import("@/app/reports/page"));
const AgentPage = lazy(() => import("@/app/agent/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));
const LoginPage = lazy(() => import("@/app/login/page"));
const RegisterPage = lazy(() => import("@/app/register/page"));

function IndexDetailRoute({ code }: { code: string }) {
  const params = useMemo(() => Promise.resolve({ code }), [code]);
  return <IndexDetailPage params={params} />;
}

export function AppRouter() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0] ?? "";

  // Fallback loader
  const fallback = (
    <div className="flex h-64 w-full items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="size-5 rounded-full border-2 border-accent-primary border-t-transparent animate-spin" />
        <span className="text-[12px] text-text-muted">Đang tải phân hệ…</span>
      </div>
    </div>
  );

  let content: React.ReactNode = null;

  if (pathname === "/" || pathname === "" || root === "") {
    content = <DashboardView />;
  } else if (root === "stocks") {
    if (segments.length === 1) {
      content = <VnMarketCenterPage />;
    } else if (segments[1] === "sectors") {
      content = <SectorTrendPage />;
    } else if (segments[1] === "screener") {
      content = <ScreenerPage />;
    } else {
      const rawSymbol =
        segments[1] === "detail"
          ? getSearchParam("symbol") || "VNM"
          : segments[1] || "";
      const symbol = rawSymbol.toUpperCase();
      let tab: StockTabKey = "overview";
      if (segments[2] === "financials") tab = "financials";
      else if (segments[2] === "fundamentals") tab = "fundamentals";
      else if (segments[2] === "valuation") tab = "valuation";
      else if (segments[2] === "profile") tab = "profile";

      content = (
        <StockSymbolLayout symbol={symbol}>
          <StockKeepAliveWorkspace symbol={symbol} initialTab={tab} />
        </StockSymbolLayout>
      );
    }
  } else if (root === "market") {
    if (segments[1] === "index" && segments[2]) {
      content = <IndexDetailRoute code={segments[2]} />;
    } else {
      content = <MarketPage />;
    }
  } else if (root === "screener") {
    content = <ScreenerPage />;
  } else if (root === "watchlist") {
    content = <WatchlistPage />;
  } else if (root === "crypto") {
    if (segments.length === 1) {
      content = <CryptoPage />;
    } else if (segments[1] === "trade-desk") {
      const qSymbol = getSearchParam("symbol") || "BTCUSDT";
      content = <CryptoDetailPage symbol={qSymbol.toUpperCase()} />;
    } else {
      const rawSymbol =
        segments[1] === "detail"
          ? getSearchParam("symbol") || "BTCUSDT"
          : segments[1];
      const symbol = (rawSymbol || "BTCUSDT").toUpperCase();
      content = <CryptoDetailPage symbol={symbol} />;
    }
  } else if (root === "forex") {
    if (segments.length === 1) {
      content = <ForexPage />;
    } else if (segments[1] === "trade-desk") {
      const qPair = getSearchParam("pair") || "EURUSD";
      content = <ForexDetailPage pair={qPair.toUpperCase().replace(/[^A-Z]/g, "") || "EURUSD"} />;
    } else {
      const rawPair =
        segments[1] === "detail"
          ? getSearchParam("pair") || "EURUSD"
          : segments[1];
      const pair = (rawPair || "EURUSD").toUpperCase().replace(/[^A-Z]/g, "");
      content = <ForexDetailPage pair={pair || "EURUSD"} />;
    }
  } else if (root === "commodities") {
    content = <CommoditiesPage />;
  } else if (root === "derivatives") {
    content = <DerivativesPage />;
  } else if (root === "macro-economic") {
    content = <MacroEconomicPage />;
  } else if (root === "currency-interest-rate") {
    content = <CurrencyInterestRatePage />;
  } else if (root === "quant") {
    content = <QuantPage />;
  } else if (root === "copytrade") {
    content = <CopyTradePage />;
  } else if (root === "earnings") {
    content = <EarningsPage />;
  } else if (root === "heatmap") {
    content = <HeatmapPage />;
  } else if (root === "portfolio") {
    content = <PortfolioPage />;
  } else if (root === "personal-finance") {
    content = <PersonalFinancePage />;
  } else if (root === "journal") {
    content = <JournalPage />;
  } else if (root === "system") {
    content = <SystemPage />;
  } else if (root === "news") {
    content = <NewsPage />;
  } else if (root === "reports") {
    content = <ReportsPage />;
  } else if (root === "agent") {
    content = <AgentPage />;
  } else if (root === "settings") {
    content = <SettingsPage />;
  } else if (root === "login") {
    content = <LoginPage />;
  } else if (root === "register") {
    content = <RegisterPage />;
  } else {
    content = <DashboardView />;
  }

  return (
    <ErrorBoundary name="router-view" resetKey={pathname}>
      <Suspense fallback={fallback}>{content}</Suspense>
    </ErrorBoundary>
  );
}
