"use client";

import { useEffect, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { PatternAlertMonitorHost } from "@/components/pattern-alert-monitor-host";
import { ErrorBoundary } from "@/components/error-boundary";
import { prefetchMarketSnapshot } from "@/components/ticker-tape";
import { prefetchApi } from "@/lib/hooks";
import { ConvexClientProvider } from "@/components/convex-client-provider";

const globalSwrCache = new Map();

/**
 * Lightweight cold-boot warmer: warms only the active overview APIs when landing on "/".
 * Avoids firing 20+ unvisited-route API requests that saturate HTTP/1.1 connections and Node CPU.
 */
function WarmCriticalApis() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    const navAny = navigator as unknown as { connection?: { saveData?: boolean } };
    if (navAny?.connection?.saveData) return;

    prefetchApi("/api/v1/stocks?board=vn30", 6_000);
    const tIntel = window.setTimeout(() => prefetchApi("/api/v1/market/intel", 10_000), 250);
    return () => {
      window.clearTimeout(tIntel);
    };
  }, []);
  return null;
}

export function ClientProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    prefetchMarketSnapshot();
  }, []);

  return (
    <SWRConfig
      value={{
        provider: () => globalSwrCache,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        dedupingInterval: 4_000,
        focusThrottleInterval: 28_000,
        errorRetryCount: 2,
        errorRetryInterval: 10_000,
        shouldRetryOnError: true,
        suspense: false,
        revalidateIfStale: true,
      }}
    >
      <ConvexClientProvider>
        <ErrorBoundary name="app-root">
          <PatternAlertMonitorHost />
          <WarmCriticalApis />
          {children}
        </ErrorBoundary>
      </ConvexClientProvider>
    </SWRConfig>
  );
}
