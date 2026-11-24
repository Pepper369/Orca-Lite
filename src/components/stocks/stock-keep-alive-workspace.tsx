"use client";

import { useEffect, useState, useRef } from "react";
import { StockDetailClient } from "@/app/stocks/[symbol]/stock-detail-client";
import { StockFinancialsView } from "./stock-financials-view";
import { StockFundamentalsView } from "./stock-fundamentals-view";
import { StockValuationView } from "./stock-valuation-view";
import { StockProfileView } from "./stock-profile-view";

export type StockTabKey = "overview" | "financials" | "fundamentals" | "valuation" | "profile";

export function StockKeepAliveWorkspace({
  symbol,
  initialTab = "overview",
}: {
  symbol: string;
  initialTab?: StockTabKey;
}) {
  const [activeTab, setActiveTab] = useState<StockTabKey>(initialTab);
  const [visited, setVisited] = useState<Set<StockTabKey>>(() => new Set([initialTab]));
  const prevTabRef = useRef<StockTabKey>(initialTab);

  // Sync initial tab when route param changes
  useEffect(() => {
    setActiveTab(initialTab);
    setVisited((prev) => {
      if (prev.has(initialTab)) return prev;
      const next = new Set(prev);
      next.add(initialTab);
      return next;
    });
  }, [initialTab]);

  // Listen for instant client tab switches dispatched by StockTabs
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const custom = e as CustomEvent<{ key?: StockTabKey; symbol?: string }>;
      if (custom.detail?.key && (!custom.detail.symbol || custom.detail.symbol === symbol)) {
        const nextKey = custom.detail.key;
        setActiveTab(nextKey);
        setVisited((prev) => {
          if (prev.has(nextKey)) return prev;
          const next = new Set(prev);
          next.add(nextKey);
          return next;
        });
      }
    };

    const handlePopState = () => {
      const p = window.location.pathname;
      let target: StockTabKey = "overview";
      if (p.includes("/financials")) target = "financials";
      else if (p.includes("/fundamentals")) target = "fundamentals";
      else if (p.includes("/valuation")) target = "valuation";
      else if (p.includes("/profile")) target = "profile";

      setActiveTab(target);
      setVisited((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
    };

    window.addEventListener("orca:stock-tab-change", handleTabChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("orca:stock-tab-change", handleTabChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [symbol]);

  // Trigger chart re-paint when switching back to Overview
  useEffect(() => {
    if (activeTab === "overview" && prevTabRef.current !== "overview") {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  return (
    <div className="stock-keep-alive-workspace w-full">
      {/* Overview & Technical Analysis (Chart stays alive in memory) */}
      <div
        style={{ display: activeTab === "overview" ? "block" : "none" }}
        aria-hidden={activeTab !== "overview"}
      >
        <StockDetailClient symbol={symbol} isActive={activeTab === "overview"} />
      </div>

      {/* Financials (BCTC) */}
      {visited.has("financials") && (
        <div
          style={{ display: activeTab === "financials" ? "block" : "none" }}
          aria-hidden={activeTab !== "financials"}
        >
          <StockFinancialsView symbol={symbol} />
        </div>
      )}

      {/* Fundamentals (Cơ bản) */}
      {visited.has("fundamentals") && (
        <div
          style={{ display: activeTab === "fundamentals" ? "block" : "none" }}
          aria-hidden={activeTab !== "fundamentals"}
        >
          <StockFundamentalsView symbol={symbol} />
        </div>
      )}

      {/* Valuation (Định giá & Dự phóng) */}
      {visited.has("valuation") && (
        <div
          style={{ display: activeTab === "valuation" ? "block" : "none" }}
          aria-hidden={activeTab !== "valuation"}
        >
          <StockValuationView symbol={symbol} />
        </div>
      )}

      {/* Profile (Hồ sơ Doanh nghiệp) */}
      {visited.has("profile") && (
        <div
          style={{ display: activeTab === "profile" ? "block" : "none" }}
          aria-hidden={activeTab !== "profile"}
        >
          <StockProfileView symbol={symbol} />
        </div>
      )}
    </div>
  );
}
