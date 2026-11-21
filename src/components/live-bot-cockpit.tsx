"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import type {
  AccountPnlTelemetry,
  AccountTier,
  BotLiveTelemetrySnapshot,
  LiveOpenPosition,
} from "@/lib/engines/bot-telemetry-types";
import {
  Activity,
  Bot,
  Cpu,
  ExternalLink,
  Radio,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

function fmtSignedUsd(v: number): string {
  if (!Number.isFinite(v)) return "$0.00";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtSignedPct(v: number): string {
  if (!Number.isFinite(v)) return "0.00%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pnlTextClass(v: number): string {
  if (v > 0.0001) return "text-positive";
  if (v < -0.0001) return "text-negative";
  return "text-text-secondary";
}

function tierBadge(tier: AccountTier): { label: string; tone: "warn" | "accent" | "neutral" } {
  if (tier === "LIVE_REAL") return { label: "TÀI KHOẢN THỰC", tone: "warn" };
  if (tier === "TESTNET_DEMO") return { label: "DEMO / TESTNET", tone: "accent" };
  return { label: "PAPER SANDBOX", tone: "neutral" };
}

function pnlSourceLabel(src: AccountPnlTelemetry["pnlSource"]): string {
  switch (src) {
    case "EXCHANGE_API_LIVE":
      return "API Sàn Live";
    case "METAAPI_CLOUD_LIVE":
      return "MetaApi Cloud";
    case "EA_REPORTED":
      return "MT5 EA Bridge";
    default:
      return "WS Mark-to-Market";
  }
}

function fmtClock(ts: number | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function LiveBotCockpit({
  variant = "full",
  onAfterAction,
}: {
  variant?: "full" | "compact";
  onAfterAction?: () => void;
}) {
  const { data: initialData, mutate: mutateRest } = useApi<BotLiveTelemetrySnapshot>(
    "/api/v1/copytrade/telemetry",
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  const [liveSnap, setLiveSnap] = useState<BotLiveTelemetrySnapshot | null>(null);
  const [sseState, setSseState] = useState<"connecting" | "live" | "polling">("connecting");
  const [tierFilter, setTierFilter] = useState<"ALL" | "LIVE_REAL" | "DEMO">("ALL");
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setSseState("polling");
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setSseState("connecting");
      es = new EventSource("/api/v1/copytrade/stream");
      es.addEventListener("telemetry", (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data) as BotLiveTelemetrySnapshot;
          setLiveSnap(parsed);
          setSseState("live");
        } catch {
          /* ignore malformed frame */
        }
      });
      es.onerror = () => {
        setSseState("polling");
        es?.close();
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 5_000);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  const snap = liveSnap ?? initialData ?? null;

  const filteredAccounts = useMemo(() => {
    const all = snap?.accounts ?? [];
    if (tierFilter === "LIVE_REAL") return all.filter((a) => a.accountTier === "LIVE_REAL");
    if (tierFilter === "DEMO") return all.filter((a) => a.accountTier !== "LIVE_REAL");
    return all;
  }, [snap, tierFilter]);

  const openPositions = useMemo(() => {
    const all = snap?.openPositions ?? [];
    if (tierFilter === "LIVE_REAL") return all.filter((p) => p.accountTier === "LIVE_REAL");
    if (tierFilter === "DEMO") return all.filter((p) => p.accountTier !== "LIVE_REAL");
    return all;
  }, [snap, tierFilter]);

  const handleScanNow = useCallback(async () => {
    setScanBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/v1/copytrade/worker", { method: "POST" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { tick?: { dispatched: number; activeAutoAccounts: number } };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false) {
        setActionMsg({ ok: false, text: json.error?.message || "Không thể quét tín hiệu" });
      } else {
        const t = json.data?.tick;
        setActionMsg({
          ok: true,
          text:
            t && t.activeAutoAccounts === 0
              ? "Đã quét Engine lõi (chưa có tài khoản bật AUTO ON — hãy bật nút AUTO ON bên dưới)."
              : `Đã quét xong trên ${t?.activeAutoAccounts ?? 0} bot: đẩy ${t?.dispatched ?? 0} lệnh mới.`,
        });
      }
      await mutateRest();
      onAfterAction?.();
    } catch {
      setActionMsg({ ok: false, text: "Lỗi kết nối Auto-Trade Worker" });
    } finally {
      setScanBusy(false);
    }
  }, [mutateRest, onAfterAction]);

  const handleClosePosition = useCallback(
    async (pos: LiveOpenPosition) => {
      if (!pos.orderId || closingOrderId) return;
      setClosingOrderId(pos.orderId);
      setActionMsg(null);
      try {
        const res = await fetch("/api/v1/copytrade/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "close", orderId: pos.orderId }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { message?: string };
          error?: { message?: string };
        };
        if (!res.ok || json.success === false) {
          setActionMsg({ ok: false, text: json.error?.message || "Đóng vị thế thất bại" });
        } else {
          setActionMsg({ ok: true, text: json.data?.message || `Đã chốt vị thế ${pos.symbol}` });
        }
        await mutateRest();
        onAfterAction?.();
      } catch {
        setActionMsg({ ok: false, text: "Lỗi kết nối khi chốt vị thế" });
      } finally {
        setClosingOrderId(null);
      }
    },
    [closingOrderId, mutateRest, onAfterAction],
  );

  if (!snap) {
    return (
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Radio className="size-4 animate-pulse text-accent-primary" />
          Đang kết nối luồng Bot Trading &amp; PnL thời gian thực...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Real-Time Engine Heartbeat Header + Split Live/Demo PnL Summary */}
      <div className="rounded-xl border border-accent-primary/35 bg-surface-primary p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-[13.5px] font-bold text-text-primary">
                  Giám Sát Bot Trading &amp; Lãi/Lỗ Thời Gian Thực (Real &amp; Demo)
                </h2>
                <Badge tone={sseState === "live" ? "up" : "accent"}>
                  <span
                    className={`inline-block size-1.5 rounded-full ${
                      sseState === "live" ? "bg-positive animate-pulse" : "bg-accent-primary"
                    }`}
                  />
                  {sseState === "live" ? "SSE LIVE 2.5s" : "SYNC"}
                </Badge>
              </div>
              <p className="text-[11px] text-text-muted">
                {snap.worker.lastScanStatus} · Cập nhật lúc{" "}
                <span className="font-mono text-text-secondary">{fmtClock(snap.generatedAt)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={scanBusy}
              onClick={() => void handleScanNow()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Zap className={`size-3.5 ${scanBusy ? "animate-pulse" : ""}`} />
              {scanBusy ? "Đang quét Engine..." : "Quét & Khớp Lệnh Ngay"}
            </button>
            {variant === "compact" && (
              <Link
                href="/copytrade"
                className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-elevated px-2.5 py-1.5 text-[11.5px] font-semibold text-text-primary hover:border-accent-primary/50 transition-colors"
              >
                Mở Trung Tâm Bot
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>

        {/* 4 Summary Cards: Total / Live Real / Demo-Testnet / Engine Status */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Total Portfolio */}
          <div className="rounded-xl border border-border-subtle bg-surface-elevated/50 p-3">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>Tổng Tài Sản Bot (Equity)</span>
              <Wallet className="size-3.5 text-accent-primary" />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="num text-lg font-extrabold text-text-primary">
                ${snap.summary.equityUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`num text-xs font-bold ${pnlTextClass(snap.summary.totalRoiPct)}`}>
                {fmtSignedPct(snap.summary.totalRoiPct)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10.5px] text-text-muted font-mono">
              <span>Thả nổi: <strong className={pnlTextClass(snap.summary.unrealizedPnlUsd)}>{fmtSignedUsd(snap.summary.unrealizedPnlUsd)}</strong></span>
              <span>Đã chốt: <strong className={pnlTextClass(snap.summary.realizedPnlUsd)}>{fmtSignedUsd(snap.summary.realizedPnlUsd)}</strong></span>
            </div>
          </div>

          {/* Card 2: LIVE REAL Accounts Only */}
          <div className="rounded-xl border border-warn/35 bg-warn/5 p-3">
            <div className="flex items-center justify-between text-[11px] text-warn">
              <span className="font-semibold">Tài Khoản Thực (LIVE REAL)</span>
              <Badge tone="warn">{snap.liveRealSummary.accountCount} TK</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="num text-lg font-extrabold text-text-primary">
                ${snap.liveRealSummary.equityUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`num text-xs font-bold ${pnlTextClass(snap.liveRealSummary.totalRoiPct)}`}>
                {fmtSignedPct(snap.liveRealSummary.totalRoiPct)}
              </span>
            </div>
            <div className="mt-1 text-[10.5px] text-text-muted font-mono">
              Net PnL:{" "}
              <strong className={pnlTextClass(snap.liveRealSummary.totalNetPnlUsd)}>
                {fmtSignedUsd(snap.liveRealSummary.totalNetPnlUsd)}
              </strong>{" "}
              · {snap.liveRealSummary.openPositionsCount} vị thế mở
            </div>
          </div>

          {/* Card 3: DEMO / TESTNET / PAPER Accounts */}
          <div className="rounded-xl border border-accent-primary/35 bg-accent-primary/5 p-3">
            <div className="flex items-center justify-between text-[11px] text-accent-2">
              <span className="font-semibold">Tài Khoản Demo / Testnet</span>
              <Badge tone="accent">{snap.demoSummary.accountCount} TK</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="num text-lg font-extrabold text-text-primary">
                ${snap.demoSummary.equityUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`num text-xs font-bold ${pnlTextClass(snap.demoSummary.totalRoiPct)}`}>
                {fmtSignedPct(snap.demoSummary.totalRoiPct)}
              </span>
            </div>
            <div className="mt-1 text-[10.5px] text-text-muted font-mono">
              Net PnL:{" "}
              <strong className={pnlTextClass(snap.demoSummary.totalNetPnlUsd)}>
                {fmtSignedUsd(snap.demoSummary.totalNetPnlUsd)}
              </strong>{" "}
              · {snap.demoSummary.openPositionsCount} vị thế mở
            </div>
          </div>

          {/* Card 4: Core Worker & Open Positions */}
          <div className="rounded-xl border border-border-subtle bg-surface-elevated/50 p-3">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>Trạng Thái Engine Lõi</span>
              <Cpu className="size-3.5 text-positive" />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="num text-lg font-extrabold text-text-primary">
                {snap.summary.activeAutoCount}/{snap.summary.accountCount}
              </span>
              <Badge tone={snap.summary.activeAutoCount > 0 ? "up" : "neutral"}>
                {snap.summary.activeAutoCount > 0 ? "AUTO RUNNING" : "MANUAL / IDLE"}
              </Badge>
            </div>
            <div className="mt-1 text-[10.5px] text-text-muted font-mono">
              Đang mở: <strong className="text-text-primary">{snap.summary.openPositionsCount}</strong> · Chu kỳ{" "}
              {Math.round(snap.worker.pollIntervalMs / 1000)}s · Quét gần nhất {fmtClock(snap.worker.lastTickAt)}
            </div>
          </div>
        </div>

        {actionMsg && (
          <div
            className={`rounded-lg border px-3 py-1.5 text-[11.5px] ${
              actionMsg.ok
                ? "border-positive/35 bg-positive/10 text-positive"
                : "border-warn/40 bg-warn/10 text-warn"
            }`}
          >
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* 2. Per-Account Real-Time PnL & ROI Table (Real + Demo) */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
              <Activity className="size-4 text-positive" />
              Bảng Lãi / Lỗ &amp; Tỷ Suất ROI Theo Từng Tài Khoản
            </h3>
            <p className="text-[11px] text-text-muted">
              Đồng bộ trực tiếp từ API sàn (Binance, OKX, MetaApi Exness/XM) và giá Mark-to-Market WebSocket cho Demo/Paper.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border-subtle bg-surface-elevated/70 p-0.5 text-[11px]">
            {(
              [
                { id: "ALL", label: `Tất cả (${snap.accounts.length})` },
                { id: "LIVE_REAL", label: `Thực (${snap.liveRealSummary.accountCount})` },
                { id: "DEMO", label: `Demo/Testnet (${snap.demoSummary.accountCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTierFilter(opt.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  tierFilter === opt.id
                    ? "bg-accent-primary text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-line/50">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-surface-elevated/60 text-[10px] uppercase text-text-muted">
              <tr>
                <th className="px-3 py-2">Tài Khoản &amp; Loại</th>
                <th className="px-3 py-2 text-right">Balance / Equity</th>
                <th className="px-3 py-2 text-right">Thả Nổi (Unrealized)</th>
                <th className="px-3 py-2 text-right">Đã Chốt / Hôm Nay</th>
                <th className="px-3 py-2 text-right">Tỷ Lệ Lãi/Lỗ (ROI)</th>
                <th className="px-3 py-2 text-right">Lệnh / Winrate / Rủi Ro Ngày</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30 bg-surface-primary/40">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-text-muted">
                    Chưa có tài khoản nào trong nhóm lọc này. Hãy gắn API Key Binance, OKX, Exness hoặc XM để theo dõi trực tiếp.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const tb = tierBadge(acc.accountTier);
                  return (
                    <tr key={acc.accountId} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-text-primary">{acc.name}</span>
                          <Badge tone={tb.tone}>{tb.label}</Badge>
                          {acc.autoExecuteEnabled && !acc.killSwitched && (
                            <Badge tone="up">AUTO ON</Badge>
                          )}
                          {acc.killSwitched && <Badge tone="down">KILL-SWITCH</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] font-mono text-text-muted">
                          <span>{acc.platform}</span>
                          <span>·</span>
                          <span>{pnlSourceLabel(acc.pnlSource)}</span>
                          <span>·</span>
                          <span>ID: {acc.accountNumberMasked}</span>
                        </div>
                        {acc.syncError && (
                          <div className="mt-0.5 text-[10px] text-negative truncate max-w-[280px]" title={acc.syncError}>
                            {acc.syncError}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className="font-bold text-text-primary">
                          ${acc.equityUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10.5px] text-text-muted">
                          Bal: ${acc.walletBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${pnlTextClass(acc.unrealizedPnlUsd)}`}>
                        <div>{fmtSignedUsd(acc.unrealizedPnlUsd)}</div>
                        <div className="text-[10px] font-normal text-text-muted">
                          {acc.openPositionsCount} vị thế mở
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className={`font-semibold ${pnlTextClass(acc.realizedPnlUsd)}`}>
                          {fmtSignedUsd(acc.realizedPnlUsd)}
                        </div>
                        <div className={`text-[10px] ${pnlTextClass(acc.dailyRealizedPnlUsd)}`}>
                          Hôm nay: {fmtSignedUsd(acc.dailyRealizedPnlUsd)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className={`inline-flex items-center gap-1 text-[13px] font-extrabold ${pnlTextClass(acc.totalRoiPct)}`}>
                          {acc.totalRoiPct > 0 ? (
                            <TrendingUp className="size-3.5" />
                          ) : acc.totalRoiPct < 0 ? (
                            <TrendingDown className="size-3.5" />
                          ) : null}
                          {fmtSignedPct(acc.totalRoiPct)}
                        </div>
                        <div className={`text-[10px] ${pnlTextClass(acc.dailyRoiPct)}`}>
                          Ngày: {fmtSignedPct(acc.dailyRoiPct)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className="text-text-primary">
                          {acc.totalTrades} lệnh · WR{" "}
                          <strong>{acc.winratePct != null ? `${acc.winratePct}%` : "—"}</strong>
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
                          <span>Cap ${acc.maxDailyLossUsd}</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-3">
                            <div
                              className={`h-full ${
                                acc.dailyLossUsedPct >= 75
                                  ? "bg-negative"
                                  : acc.dailyLossUsedPct >= 40
                                    ? "bg-warn"
                                    : "bg-positive"
                              }`}
                              style={{ width: `${Math.max(4, acc.dailyLossUsedPct)}%` }}
                            />
                          </div>
                          <span>{acc.dailyLossUsedPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Live Open Positions Table & Real-Time Activity Feed (full mode or when positions exist) */}
      {(variant === "full" || openPositions.length > 0) && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Open Positions */}
          <div className="lg:col-span-8 rounded-xl border border-line/70 bg-surface-primary p-3.5 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-text-primary">
                Vị Thế Bot Đang Mở (Mark-to-Market Thời Gian Thực)
              </h3>
              <Badge tone={openPositions.length > 0 ? "up" : "neutral"}>
                {openPositions.length} Vị Thế Mở
              </Badge>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-line/50">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-surface-elevated/60 text-[10px] uppercase text-text-muted">
                  <tr>
                    <th className="px-2.5 py-2">Mã / Chiều</th>
                    <th className="px-2.5 py-2">Tài Khoản</th>
                    <th className="px-2.5 py-2 text-right">Entry → Mark Live</th>
                    <th className="px-2.5 py-2 text-right">SL / TP1</th>
                    <th className="px-2.5 py-2 text-right">Lãi/Lỗ &amp; ROE%</th>
                    <th className="px-2.5 py-2 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/30 bg-surface-primary/40">
                  {openPositions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-5 text-center text-text-muted">
                        Hiện chưa có vị thế nào đang mở. Nhấn &quot;Đẩy Lệnh (Copy Now)&quot; hoặc bật &quot;AUTO ON&quot; để bot vào lệnh và theo dõi PnL nhảy trực tiếp tại đây.
                      </td>
                    </tr>
                  ) : (
                    openPositions.map((pos) => {
                      const tb = tierBadge(pos.accountTier);
                      return (
                        <tr key={pos.positionId} className="hover:bg-surface-elevated/40">
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-text-primary">{pos.symbol}</span>
                              <Badge tone={pos.direction === "BUY" ? "up" : "down"}>
                                {pos.direction}
                              </Badge>
                            </div>
                            <div className="text-[10px] font-mono text-text-muted">
                              {pos.qtyOrLots} {pos.assetType === "FOREX" ? "lots" : ""} · {pos.leverage}x
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
                            <div className="text-text-primary font-medium truncate max-w-[140px]">
                              {pos.accountName}
                            </div>
                            <Badge tone={tb.tone} className="mt-0.5 text-[9.5px]">
                              {tb.label}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono">
                            <div className="text-text-secondary">{pos.entryPrice}</div>
                            <div className="font-bold text-text-primary">{pos.markPrice}</div>
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono text-[10.5px]">
                            <div className="text-negative">{pos.stopLossPrice ?? "—"}</div>
                            <div className="text-positive">{pos.takeProfit1 ?? "—"}</div>
                          </td>
                          <td className={`px-2.5 py-2 text-right font-mono font-bold ${pnlTextClass(pos.unrealizedPnlUsd)}`}>
                            <div>{fmtSignedUsd(pos.unrealizedPnlUsd)}</div>
                            <div className="text-[10px]">{fmtSignedPct(pos.roePct)}</div>
                          </td>
                          <td className="px-2.5 py-2 text-right">
                            {pos.canCloseInApp && pos.orderId ? (
                              <button
                                type="button"
                                disabled={closingOrderId === pos.orderId}
                                onClick={() => void handleClosePosition(pos)}
                                className="inline-flex items-center gap-1 rounded-md border border-down/40 bg-down/10 px-2 py-1 text-[10.5px] font-semibold text-down hover:bg-down hover:text-white transition-colors disabled:opacity-40"
                              >
                                <XCircle className="size-3" />
                                {closingOrderId === pos.orderId ? "..." : "Chốt"}
                              </button>
                            ) : (
                              <span className="text-[10px] text-text-muted">SL/TP trên sàn</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="lg:col-span-4 rounded-xl border border-line/70 bg-surface-primary p-3.5 sm:p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
                <Radio className="size-3.5 text-accent-primary" />
                Luồng Engine Thời Gian Thực
              </h3>
              <span className="text-[10px] font-mono text-text-muted">
                {snap.recentEvents.length} sự kiện
              </span>
            </div>

            <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto pr-1 text-[11px]">
              {snap.recentEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line/60 bg-surface-elevated/30 p-3 text-center text-text-muted">
                  Engine đang lắng nghe thị trường. Khi có tín hiệu khớp lệnh, chốt vị thế hoặc cảnh báo guardrail sẽ hiện tức thì tại đây.
                </div>
              ) : (
                snap.recentEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`rounded-lg border px-2.5 py-1.5 ${
                      ev.level === "ok"
                        ? "border-positive/25 bg-positive/5"
                        : ev.level === "warn"
                          ? "border-warn/30 bg-warn/5"
                          : ev.level === "error"
                            ? "border-negative/30 bg-negative/5"
                            : "border-line/60 bg-surface-elevated/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-text-muted">
                      <span className="font-semibold text-text-secondary">
                        [{ev.category}]{ev.symbol ? ` ${ev.symbol}` : ""}
                      </span>
                      <span>{fmtClock(ev.ts)}</span>
                    </div>
                    <div className="mt-0.5 text-text-primary leading-snug break-words">
                      {ev.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
