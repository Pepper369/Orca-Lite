"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import type { FollowerAccount } from "@/lib/engines/copy-trade-engine";
import type { SetupGrade } from "@/lib/engines/fx-crypto-precision-engine";
import { CheckCircle2, KeyRound, ShieldAlert, Zap } from "lucide-react";

interface AccountsSummary {
  accounts: FollowerAccount[];
  verifiedLiveCount: number;
  killSwitchedCount: number;
}

export interface QuickTradeOrderInput {
  symbol: string;
  assetType: "CRYPTO" | "FOREX";
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  masterLotsOrQty: number;
  recommendedLeverage?: number;
  winrateScore?: number;
  setupGrade?: SetupGrade;
}

export function BrokerQuickTradeBar({
  assetType,
  order,
  compact = false,
}: {
  assetType: "CRYPTO" | "FOREX";
  order?: QuickTradeOrderInput | null;
  compact?: boolean;
}) {
  const { data } = useApi<AccountsSummary>("/api/v1/copytrade/accounts", {
    refreshInterval: 20_000,
    keepPreviousData: true,
  });

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const relevantAccounts = useMemo(() => {
    const all = data?.accounts ?? [];
    if (assetType === "CRYPTO") {
      return all.filter(
        (a) =>
          a.platform === "BINANCE_FUTURES" ||
          a.platform === "OKX_FUTURES" ||
          a.platform === "BYBIT_FUTURES",
      );
    }
    return all.filter(
      (a) =>
        a.platform === "MT5_EXNESS" ||
        a.platform === "MT5_XM" ||
        a.platform === "MT5_EA",
    );
  }, [data, assetType]);

  const activeRealAccounts = useMemo(
    () => relevantAccounts.filter((a) => a.isActive && !a.killSwitched && (a.hasApiKey || a.hasEaToken)),
    [relevantAccounts],
  );

  const autoEnabledCount = useMemo(
    () => relevantAccounts.filter((a) => a.isActive && a.autoExecuteEnabled && !a.killSwitched).length,
    [relevantAccounts],
  );

  const brokerLabel = assetType === "CRYPTO" ? "Binance / OKX" : "Exness / XM";

  const handleDispatch = async () => {
    if (!order || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/copytrade/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: {
            id: `desk_${order.assetType.toLowerCase()}_${order.symbol}_${order.direction}_${Date.now()}`,
            symbol: order.symbol,
            assetType: order.assetType,
            direction: order.direction,
            entryPrice: order.entryPrice,
            stopLossPrice: order.stopLossPrice,
            takeProfit1: order.takeProfit1,
            masterLotsOrQty: order.masterLotsOrQty,
            masterCapitalUsd: 10_000,
            winrateScore: order.winrateScore ?? 80,
            setupGrade: order.setupGrade,
            recommendedLeverage: order.recommendedLeverage ?? (assetType === "CRYPTO" ? 5 : 1),
            timestamp: Date.now(),
          },
          currentMarketPrice: order.entryPrice,
          manualOverride: true,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { filledCount: number; pendingEaCount: number; rejectedCount: number };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false || !json.data) {
        setFeedback({ ok: false, text: json.error?.message || "Gửi lệnh thất bại" });
      } else {
        setFeedback({
          ok: json.data.filledCount > 0 || json.data.pendingEaCount > 0,
          text: `${order.direction} ${order.symbol}: ${json.data.filledCount} khớp/paper · ${json.data.pendingEaCount} chờ MT5 EA · ${json.data.rejectedCount} bị chặn`,
        });
      }
    } catch {
      setFeedback({ ok: false, text: "Lỗi kết nối máy chủ thực thi lệnh" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-lg border border-border-subtle/80 bg-surface-elevated/50 ${
        compact ? "p-2 space-y-1.5" : "p-2.5 sm:p-3 space-y-2"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <KeyRound className="size-3.5 shrink-0 text-accent-primary" />
          <span className="font-semibold text-text-primary">Kết nối {brokerLabel}:</span>
          {activeRealAccounts.length > 0 ? (
            <Badge tone="up">
              {activeRealAccounts.length} TK sẵn sàng{autoEnabledCount > 0 ? ` · ${autoEnabledCount} Auto` : ""}
            </Badge>
          ) : (
            <Badge tone="warn">Chưa gắn API thật (Paper Sandbox)</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {order && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDispatch()}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
                order.direction === "BUY" ? "bg-positive" : "bg-negative"
              }`}
            >
              <Zap className="size-3" />
              {busy
                ? "Đang gửi..."
                : `Trade ${order.direction} ${order.symbol}`}
            </button>
          )}
          <Link
            href="/copytrade"
            className="inline-flex items-center gap-1 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-1 text-[11px] font-semibold text-accent-primary hover:bg-accent-primary hover:text-white transition-colors whitespace-nowrap"
          >
            <KeyRound className="size-3" />
            Gắn API {brokerLabel}
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] ${
            feedback.ok
              ? "border-positive/35 bg-positive/10 text-positive"
              : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <ShieldAlert className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 break-words">{feedback.text}</span>
        </div>
      )}
    </div>
  );
}
