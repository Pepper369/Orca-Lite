"use client";

import React, { Suspense, lazy } from "react";
import { usePathname } from "@/lib/shims/next-navigation";
import { StockKeepAliveWorkspace, type StockTabKey } from "@/components/stocks/stock-keep-alive-workspace";
import { Loading } from "@/components/ui";

const DashboardView = lazy(() => import("@/components/dashboard").then((m) => ({ default: m.Dashboard })));
const ProTerminalPage = lazy(() => import("@/app/terminal/page"));
const VnMarketCenterPage = lazy(() => import("@/app/stocks/page"));
const ScreenerPage = lazy(() => import("@/app/screener/page"));
const WatchlistPage = lazy(() => import("@/app/watchlist/page"));
const CryptoPage = lazy(() => import("@/app/crypto/page"));
const ForexPage = lazy(() => import("@/app/forex/page"));
const CommoditiesPage = lazy(() => import("@/app/commodities/page"));
const DerivativesPage = lazy(() => import("@/app/derivatives/page"));
const MacroEconomicPage = lazy(() => import("@/app/macro-economic/page"));
const CurrencyInterestRatePage = lazy(() => import("@/app/currency-interest-rate/page"));
const NewsPage = lazy(() => import("@/app/news/page"));
const ReportsPage = lazy(() => import("@/app/reports/page"));
const AgentPage = lazy(() => import("@/app/agent/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));

export function AppRouter() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

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

  if (pathname === "/" || pathname === "") {
    content = <DashboardView />;
  } else if (pathname === "/terminal") {
    content = <ProTerminalPage />;
  } else if (segments[0] === "stocks") {
    if (segments.length === 1) {
      content = <VnMarketCenterPage />;
    } else {
      const symbol = segments[1].toUpperCase();
      let tab: StockTabKey = "overview";
      if (segments[2] === "financials") tab = "financials";
      else if (segments[2] === "fundamentals") tab = "fundamentals";
      else if (segments[2] === "valuation") tab = "valuation";
      else if (segments[2] === "profile") tab = "profile";

      content = <StockKeepAliveWorkspace symbol={symbol} initialTab={tab} />;
    }
  } else if (pathname === "/screener" || pathname.startsWith("/screener")) {
    content = <ScreenerPage />;
  } else if (pathname === "/watchlist") {
    content = <WatchlistPage />;
  } else if (pathname === "/crypto" || pathname.startsWith("/crypto")) {
    content = <CryptoPage />;
  } else if (pathname === "/forex" || pathname.startsWith("/forex")) {
    content = <ForexPage />;
  } else if (pathname === "/commodities") {
    content = <CommoditiesPage />;
  } else if (pathname === "/derivatives") {
    content = <DerivativesPage />;
  } else if (pathname === "/macro-economic") {
    content = <MacroEconomicPage />;
  } else if (pathname === "/currency-interest-rate") {
    content = <CurrencyInterestRatePage />;
  } else if (pathname === "/news" || pathname.startsWith("/news")) {
    content = <NewsPage />;
  } else if (pathname === "/reports" || pathname.startsWith("/reports")) {
    content = <ReportsPage />;
  } else if (pathname === "/agent") {
    content = <AgentPage />;
  } else if (pathname === "/settings") {
    content = <SettingsPage />;
  } else {
    content = <DashboardView />;
  }

  return <Suspense fallback={fallback}>{content}</Suspense>;
}
