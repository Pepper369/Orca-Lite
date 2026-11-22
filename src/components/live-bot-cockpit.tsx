"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import type {
  AccountEnvironment,
  AccountPnlTelemetry,
  BotLiveTelemetrySnapshot,
  DemoAccountSubtype,
  LiveOpenPosition,
  TierPnlAggregate,
} from "@/lib/engines/bot-telemetry-types";
import {
  Activity,
  Bot,
  Cpu,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Radio,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

function demoSubtypeLabel(subtype: DemoAccountSubtype | null): string {
  switch (subtype) {
    case "EXCHANGE_TESTNET":
      return "DEMO · TESTNET";
    case "MT5_DEMO":
      return "DEMO · MT5";
    case "PAPER_SANDBOX":
    default:
      return "DEMO · PAPER";
  }
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

const REAL_BAR_COLORS = [
  "bg-amber-400",
  "bg-orange-400",
  "bg-emerald-400",
  "bg-yellow-400",
  "bg-rose-400",
];

const DEMO_BAR_COLORS = [
  "bg-cyan-400",
  "bg-sky-400",
  "bg-indigo-400",
  "bg-teal-400",
  "bg-violet-400",
];

function NavPoolHeroCard({
  environment,
  pool,
  accounts,
  compact,
}: {
  environment: AccountEnvironment;
  pool: TierPnlAggregate;
  accounts: AccountPnlTelemetry[];
  compact: boolean;
}) {
  const isReal = environment === "REAL";
  const barPalette = isReal ? REAL_BAR_COLORS : DEMO_BAR_COLORS;

  return (
    <div
      className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 ${
        isReal
          ? "border-amber-500/45 bg-amber-500/[0.04]"
          : "border-cyan-500/40 bg-cyan-500/[0.04]"
      }`}
    >
      {/* Top Row: Environment Identity + NAV Value */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-7 items-center justify-center rounded-lg ${
                isReal ? "bg-amber-500/20 text-amber-400" : "bg-cyan-500/20 text-cyan-400"
              }`}
            >
              {isReal ? <ShieldCheck className="size-4" /> : <FlaskConical className="size-4" />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`text-[12px] font-extrabold uppercase tracking-wide ${
                    isReal ? "text-amber-400" : "text-cyan-400"
                  }`}
                >
                  {isReal ? "REAL NAV · Tiền Thật" : "DEMO NAV · Testnet & Paper"}
                </span>
                <Badge tone={isReal ? "warn" : "accent"}>
                  {pool.accountCount} TK · {pool.activeAutoCount} Auto
                </Badge>
              </div>
              <p className="text-[10.5px] text-text-muted">
                {isReal
                  ? "Tài khoản Live API thật — tách biệt hoàn toàn với Demo"
                  : "Tài khoản Testnet, MT5 Demo & Paper Sandbox"}
              </p>
            </div>
          </div>

          <span className="rounded-md border border-border-subtle/80 bg-surface-primary/80 px-2 py-0.5 text-[10px] font-mono text-text-muted">
            {pool.openPositionsCount} vị thế mở
          </span>
        </div>

        {/* Big NAV Figure & ROI */}
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="num text-2xl font-extrabold tracking-tight text-text-primary">
              {fmtUsd(pool.totalNavUsd)}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-bold ${
                pool.navChangePct > 0
                  ? "bg-positive/15 text-positive"
                  : pool.navChangePct < 0
                    ? "bg-negative/15 text-negative"
                    : "bg-surface-elevated text-text-secondary"
              }`}
            >
              {pool.navChangePct > 0 ? (
                <TrendingUp className="size-3" />
              ) : pool.navChangePct < 0 ? (
                <TrendingDown className="size-3" />
              ) : null}
              {fmtSignedPct(pool.navChangePct)}
            </span>
          </div>
          <span className={`font-mono text-[12px] font-bold ${pnlTextClass(pool.navChangeUsd)}`}>
            Net {fmtSignedUsd(pool.navChangeUsd)}
          </span>
        </div>

        {/* 3 Micro Metrics */}
        <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-line/50 bg-surface-primary/65 px-2.5 py-1.5 font-mono text-[10.5px]">
          <div>
            <div className="text-[9.5px] uppercase text-text-muted">NAV Gốc</div>
            <div className="font-semibold text-text-primary">{fmtUsd(pool.initialNavUsd)}</div>
          </div>
          <div>
            <div className="text-[9.5px] uppercase text-text-muted">Thả Nổi</div>
            <div className={`font-semibold ${pnlTextClass(pool.unrealizedPnlUsd)}`}>
              {fmtSignedUsd(pool.unrealizedPnlUsd)}
            </div>
          </div>
          <div>
            <div className="text-[9.5px] uppercase text-text-muted">Đã Chốt</div>
            <div className={`font-semibold ${pnlTextClass(pool.realizedPnlUsd)}`}>
              {fmtSignedUsd(pool.realizedPnlUsd)}
            </div>
          </div>
        </div>
      </div>

      {/* Per-Account NAV Allocation Bar inside this pool */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-text-muted">
          <span>Phân bổ {isReal ? "REAL NAV" : "DEMO NAV"} theo từng tài khoản</span>
          <span className="font-mono">{accounts.length > 0 ? "100% nội nhóm" : "0 TK"}</span>
        </div>

        {accounts.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line/70 bg-surface-primary/50 px-2.5 py-2 text-[11px] text-text-muted">
            <span>
              {isReal
                ? "Chưa có tài khoản Live REAL. Tiền thật luôn được tách riêng tại đây."
                : "Chưa có tài khoản DEMO / Testnet nào."}
            </span>
            {isReal && !compact && (
              <Link
                href="/copytrade"
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-400 hover:underline"
              >
                <KeyRound className="size-3" />
                Gắn API Real
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
              {accounts.map((acc, idx) => (
                <div
                  key={acc.accountId}
                  style={{ width: `${Math.max(4, acc.navShareInPoolPct)}%` }}
                  className={`${barPalette[idx % barPalette.length]} transition-all`}
                  title={`${acc.name}: ${fmtUsd(acc.navUsd)} (${acc.navShareInPoolPct}%)`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((acc, idx) => (
                <div
                  key={acc.accountId}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-primary/80 px-2 py-0.5 text-[10.5px]"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${barPalette[idx % barPalette.length]}`}
                  />
                  <span className="max-w-[130px] truncate font-medium text-text-primary">
                    {acc.name}
                  </span>
                  <span className="font-mono font-bold text-text-primary">{fmtUsd(acc.navUsd)}</span>
                  <span className="font-mono text-[10px] text-text-muted">
                    ({acc.navShareInPoolPct}%)
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AccountNavGroupTable({
  environment,
  pool,
  accounts,
}: {
  environment: AccountEnvironment;
  pool: TierPnlAggregate;
  accounts: AccountPnlTelemetry[];
}) {
  const isReal = environment === "REAL";

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        isReal ? "border-amber-500/40" : "border-cyan-500/35"
      }`}
    >
      {/* Group Banner Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b ${
          isReal
            ? "border-amber-500/25 bg-amber-500/10"
            : "border-cyan-500/25 bg-cyan-500/10"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {isReal ? (
            <ShieldCheck className="size-4 text-amber-400" />
          ) : (
            <FlaskConical className="size-4 text-cyan-400" />
          )}
          <span
            className={`text-[12px] font-extrabold uppercase tracking-wide ${
              isReal ? "text-amber-400" : "text-cyan-400"
            }`}
          >
            {isReal
              ? `Nhóm Tài Khoản REAL — NAV Tiền Thật (${accounts.length})`
              : `Nhóm Tài Khoản DEMO — NAV Testnet & Paper (${accounts.length})`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="text-text-secondary">
            Tổng {isReal ? "REAL NAV" : "DEMO NAV"}:{" "}
            <strong className="text-text-primary">{fmtUsd(pool.totalNavUsd)}</strong>
          </span>
          <span className={`font-bold ${pnlTextClass(pool.navChangePct)}`}>
            {fmtSignedUsd(pool.navChangeUsd)} ({fmtSignedPct(pool.navChangePct)})
          </span>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto bg-surface-primary/40">
        <table className="w-full text-left text-[11.5px]">
          <thead className="bg-surface-elevated/60 text-[10px] uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2">Tài Khoản &amp; Môi Trường</th>
              <th className="px-3 py-2 text-right">
                {isReal ? "REAL NAV & Tỷ Trọng" : "DEMO NAV & Tỷ Trọng"}
              </th>
              <th className="px-3 py-2 text-right">NAV Gốc / Số Dư Ví</th>
              <th className="px-3 py-2 text-right">Thả Nổi (Unrealized)</th>
              <th className="px-3 py-2 text-right">Đã Chốt / Hôm Nay</th>
              <th className="px-3 py-2 text-right">Biến Động NAV (ROI)</th>
              <th className="px-3 py-2 text-right">Lệnh / WR / Rủi Ro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/30">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-5 text-center text-text-muted">
                  {isReal
                    ? "Chưa có tài khoản REAL (Live API) nào được kết nối. Hãy gắn API Key chế độ REAL / LIVE ở phần Broker Vault bên dưới."
                    : "Chưa có tài khoản DEMO (Testnet / MT5 Demo / Paper) nào trong danh sách."}
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.accountId} className="hover:bg-surface-elevated/40 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-text-primary">{acc.name}</span>
                      <Badge tone={isReal ? "warn" : "accent"}>
                        {isReal ? "REAL" : demoSubtypeLabel(acc.demoSubtype)}
                      </Badge>
                      {acc.timelinePaused ? (
                        <Badge tone="warn">NGHỈ T7/CN (GMT+7)</Badge>
                      ) : (
                        acc.autoExecuteEnabled &&
                        !acc.killSwitched && <Badge tone="up">AUTO ON</Badge>
                      )}
                      {acc.killSwitched && <Badge tone="down">KILL-SWITCH</Badge>}
                    </div>
                    {acc.timelinePaused && acc.timelinePauseReason && (
                      <div className="mt-0.5 text-[10px] font-medium text-amber-400">
                        {acc.timelinePauseReason}
                      </div>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono text-text-muted">
                      <span>{acc.platform}</span>
                      <span>·</span>
                      <span>{pnlSourceLabel(acc.pnlSource)}</span>
                      <span>·</span>
                      <span>ID: {acc.accountNumberMasked}</span>
                    </div>
                    {acc.syncError && (
                      <div
                        className="mt-0.5 max-w-[260px] truncate text-[10px] text-negative"
                        title={acc.syncError}
                      >
                        {acc.syncError}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right font-mono">
                    <div className="text-[12.5px] font-extrabold text-text-primary">
                      {fmtUsd(acc.navUsd)}
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-panel-3">
                        <div
                          className={`h-full ${isReal ? "bg-amber-400" : "bg-cyan-400"}`}
                          style={{ width: `${Math.max(4, acc.navShareInPoolPct)}%` }}
                        />
                      </div>
                      <span>{acc.navShareInPoolPct}% pool</span>
                    </div>
                  </td>

                  <td className="px-3 py-2.5 text-right font-mono">
                    <div className="text-text-secondary">Gốc: {fmtUsd(acc.initialNavUsd)}</div>
                    <div className="text-[10.5px] text-text-muted">
                      Ví: {fmtUsd(acc.walletBalanceUsd)}
                      {acc.marginUtilizationPct > 0 ? ` · Margin ${acc.marginUtilizationPct}%` : ""}
                    </div>
                  </td>

                  <td
                    className={`px-3 py-2.5 text-right font-mono font-bold ${pnlTextClass(acc.unrealizedPnlUsd)}`}
                  >
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
                    <div
                      className={`inline-flex items-center gap-1 text-[12.5px] font-extrabold ${pnlTextClass(acc.navChangePct)}`}
                    >
                      {acc.navChangePct > 0 ? (
                        <TrendingUp className="size-3.5" />
                      ) : acc.navChangePct < 0 ? (
                        <TrendingDown className="size-3.5" />
                      ) : null}
                      {fmtSignedPct(acc.navChangePct)}
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
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-panel-3">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [envFilter, setEnvFilter] = useState<"SPLIT" | "REAL" | "DEMO">("SPLIT");
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [resetDemoBusy, setResetDemoBusy] = useState(false);
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

  const realAccounts = useMemo(
    () => snap?.realAccounts ?? snap?.accounts.filter((a) => a.accountTier === "LIVE_REAL") ?? [],
    [snap],
  );
  const demoAccounts = useMemo(
    () => snap?.demoAccounts ?? snap?.accounts.filter((a) => a.accountTier !== "LIVE_REAL") ?? [],
    [snap],
  );
  const realNav = snap?.realNav ?? snap?.liveRealSummary;
  const demoNav = snap?.demoNav ?? snap?.demoSummary;

  const openPositions = useMemo(() => {
    const all = snap?.openPositions ?? [];
    if (envFilter === "REAL") return all.filter((p) => (p.environment ?? (p.accountTier === "LIVE_REAL" ? "REAL" : "DEMO")) === "REAL");
    if (envFilter === "DEMO") return all.filter((p) => (p.environment ?? (p.accountTier === "LIVE_REAL" ? "REAL" : "DEMO")) === "DEMO");
    return all;
  }, [snap, envFilter]);

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
              ? "Đã quét Engine lõi (chưa có tài khoản bật AUTO ON — hãy bật nút AUTO ON ở bảng kết nối)."
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

  const handleResetDemo = useCallback(async () => {
    if (resetDemoBusy) return;
    setResetDemoBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/v1/copytrade/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_demo", initialBalanceUsd: 10_000 }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!res.ok || json.success === false) {
        setActionMsg({ ok: false, text: json.error?.message || "Không thể reset tài khoản Demo" });
      } else {
        setActionMsg({
          ok: true,
          text: json.data?.message || "Đã reset tài khoản Demo về $10,000 và bắt đầu trade lại từ đầu.",
        });
      }
      await mutateRest();
      onAfterAction?.();
    } catch {
      setActionMsg({ ok: false, text: "Lỗi kết nối khi reset tài khoản Demo" });
    } finally {
      setResetDemoBusy(false);
    }
  }, [resetDemoBusy, mutateRest, onAfterAction]);

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

  if (!snap || !realNav || !demoNav) {
    return (
      <div className="rounded-xl border border-line/70 bg-surface-primary p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Radio className="size-4 animate-pulse text-accent-primary" />
          Đang kết nối luồng NAV (Real &amp; Demo) &amp; Bot Trading thời gian thực...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Real-Time Engine Header + Strictly Split REAL NAV vs DEMO NAV Hero Panels */}
      <div className="rounded-xl border border-accent-primary/35 bg-surface-primary p-3.5 sm:p-4 shadow-sm space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-[13.5px] font-bold text-text-primary">
                  Giám Sát NAV Thực / Demo &amp; Bot Trading Thời Gian Thực
                </h2>
                <Badge tone={sseState === "live" ? "up" : "accent"}>
                  <span
                    className={`inline-block size-1.5 rounded-full ${
                      sseState === "live" ? "bg-positive animate-pulse" : "bg-accent-primary"
                    }`}
                  />
                  {sseState === "live" ? "SSE LIVE 2.5s" : "SYNC"}
                </Badge>
                {snap.timeline && (
                  <Badge tone={snap.timeline.isVnWeekend ? "warn" : "up"}>
                    {snap.timeline.scheduleSummaryVi}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3 text-positive" />
                  Auto: <strong className="text-amber-400">{realNav.activeAutoCount} Real</strong> ·{" "}
                  <strong className="text-cyan-400">{demoNav.activeAutoCount} Demo</strong>
                </span>
                <span>·</span>
                <span>{snap.worker.lastScanStatus}</span>
                <span>·</span>
                <span className="font-mono text-text-secondary">
                  Cập nhật {fmtClock(snap.generatedAt)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resetDemoBusy || scanBusy}
              onClick={() => void handleResetDemo()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-cyan-500 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
              title="Reset toàn bộ tài khoản DEMO về $10,000 gốc, xóa lịch sử lệnh cũ và cho Bot trade lại từ đầu (không ảnh hưởng REAL NAV)"
            >
              <FlaskConical className={`size-3.5 ${resetDemoBusy ? "animate-spin" : ""}`} />
              {resetDemoBusy ? "Đang Reset Demo..." : "Reset Demo ($10K) & Trade Lại"}
            </button>
            <button
              type="button"
              disabled={scanBusy || resetDemoBusy}
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

        {/* Strictly Split REAL NAV vs DEMO NAV Panels — NEVER blended into one misleading capital sum */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NavPoolHeroCard
            environment="REAL"
            pool={realNav}
            accounts={realAccounts}
            compact={variant === "compact"}
          />
          <NavPoolHeroCard
            environment="DEMO"
            pool={demoNav}
            accounts={demoAccounts}
            compact={variant === "compact"}
          />
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

      {/* 2. Per-Account NAV & PnL Breakdown — Split strictly into REAL Group vs DEMO Group */}
      <div className="rounded-xl border border-line/70 bg-surface-primary p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
              <Activity className="size-4 text-positive" />
              Chi Tiết NAV, Lãi/Lỗ &amp; Tỷ Suất ROI Theo Từng Tài Khoản
            </h3>
            <p className="text-[11px] text-text-muted">
              Mỗi tài khoản được tách bạch tuyệt đối giữa nhóm REAL (tiền thật) và DEMO (Testnet / MT5 Demo / Paper), tỷ trọng NAV tính riêng trong nội bộ từng nhóm.
            </p>
          </div>
          <div className="inline-flex flex-wrap rounded-lg border border-border-subtle bg-surface-elevated/70 p-0.5 text-[11px]">
            {(
              [
                { id: "SPLIT", label: `Tách 2 Nhóm (${snap.accounts.length})` },
                { id: "REAL", label: `REAL NAV (${realAccounts.length})` },
                { id: "DEMO", label: `DEMO NAV (${demoAccounts.length})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setEnvFilter(opt.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  envFilter === opt.id
                    ? opt.id === "REAL"
                      ? "bg-amber-500 text-slate-950"
                      : opt.id === "DEMO"
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-accent-primary text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {(envFilter === "SPLIT" || envFilter === "REAL") && (
            <AccountNavGroupTable environment="REAL" pool={realNav} accounts={realAccounts} />
          )}
          {(envFilter === "SPLIT" || envFilter === "DEMO") && (
            <AccountNavGroupTable environment="DEMO" pool={demoNav} accounts={demoAccounts} />
          )}
        </div>
      </div>

      {/* 2.5 Live Quant Engine -> Bot Continuous Signal Pipeline (ICT + SMC + 7-Gate Quant) */}
      {snap.quantFeed && snap.quantFeed.length > 0 && (
        <div className="rounded-xl border border-accent-primary/40 bg-surface-primary p-3.5 sm:p-4 shadow-sm space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
                <Cpu className="size-4 text-accent-primary" />
                Luồng Phân Tích ICT + SMC + Quant Engine Đổ Trực Tiếp Vào Bot ({snap.quantFeed.length} Kèo Hội Tụ)
              </h3>
              <p className="text-[11px] text-text-muted">
                Dữ liệu từ 7-Gate Precision Engine (Sweep/MSS · OTE/FVG/BPR · Online HMM Regime · Purged Meta-Labeling) tự động đẩy liên tục vào các tài khoản gắn API Key đang bật AUTO ON.
              </p>
            </div>
            <Badge tone="up">
              WINRATE GATE A+/A ACTIVE
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line/50">
            <table className="w-full text-left text-[11.5px]">
              <thead className="bg-surface-elevated/60 text-[10px] uppercase text-text-muted">
                <tr>
                  <th className="px-2.5 py-2">Cặp / Chiều</th>
                  <th className="px-2.5 py-2">Hạng &amp; WinRate</th>
                  <th className="px-2.5 py-2">Cấu Trúc ICT/SMC &amp; Regime</th>
                  <th className="px-2.5 py-2 text-right">Chế Độ Entry</th>
                  <th className="px-2.5 py-2 text-right">SL → TP1 / TP2 / TP3</th>
                  <th className="px-2.5 py-2 text-right">Kỳ Vọng E[R]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30 bg-surface-primary/40">
                {snap.quantFeed.slice(0, 8).map((q) => (
                  <tr key={q.id} className="hover:bg-surface-elevated/40">
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="text-text-primary">{q.symbol}</span>
                        <Badge tone={q.direction === "BUY" ? "up" : "down"}>{q.direction}</Badge>
                        <span className="text-[10px] font-mono text-text-muted">{q.assetType}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-2 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={q.setupGrade === "A+" ? "up" : "accent"}>
                          Grade {q.setupGrade}
                        </Badge>
                        <span className="font-bold text-positive">
                          WR ~{q.calibratedWinRatePct}%
                        </span>
                        <span className="text-[10px] text-text-muted">({q.winrateScore}đ)</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-text-primary">{q.ictSetup}</span>
                        {q.liquiditySweepDetected && (
                          <Badge tone="warn" className="text-[9.5px]">SWEEP+MSS</Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted truncate max-w-[260px]" title={q.summaryVi}>
                        {q.regimeState} · {q.summaryVi}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono">
                      <div className="font-bold text-text-primary">{q.entryPrice}</div>
                      <div className="text-[10px] text-accent-primary">{q.entryMode}</div>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-[10.5px]">
                      <div className="text-negative">SL: {q.stopLossPrice}</div>
                      <div className="text-positive">
                        TP1: {q.takeProfit1}
                        {q.takeProfit2 ? ` · TP2: ${q.takeProfit2}` : ""}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono">
                      <span className="font-extrabold text-positive">
                        +{q.expectancyR}R
                      </span>
                      <div className="text-[10px] text-text-muted">
                        {q.assetType === "CRYPTO" ? `${q.recommendedLeverage}x` : `${q.masterLotsOrQty} lot`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Live Open Positions Table & Real-Time Activity Feed */}
      {(variant === "full" || openPositions.length > 0) && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <div className="lg:col-span-8 rounded-xl border border-line/70 bg-surface-primary p-3.5 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-text-primary">
                Vị Thế Bot Đang Mở (Mark-to-Market Thời Gian Thực)
              </h3>
              <div className="flex items-center gap-1.5">
                <Badge tone="warn">
                  REAL: {realNav.openPositionsCount}
                </Badge>
                <Badge tone="accent">
                  DEMO: {demoNav.openPositionsCount}
                </Badge>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-line/50">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-surface-elevated/60 text-[10px] uppercase text-text-muted">
                  <tr>
                    <th className="px-2.5 py-2">Mã / Chiều</th>
                    <th className="px-2.5 py-2">Tài Khoản &amp; Môi Trường</th>
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
                        Hiện chưa có vị thế nào đang mở trong nhóm lọc này. Nhấn &quot;Đẩy Lệnh (Copy Now)&quot; hoặc bật &quot;AUTO ON&quot; để bot vào lệnh và theo dõi NAV nhảy trực tiếp.
                      </td>
                    </tr>
                  ) : (
                    openPositions.map((pos) => {
                      const isRealPos =
                        (pos.environment ?? (pos.accountTier === "LIVE_REAL" ? "REAL" : "DEMO")) === "REAL";
                      const isBuy = pos.direction === "BUY";
                      const isBeLocked =
                        pos.stopLossPrice != null &&
                        ((isBuy && pos.stopLossPrice >= pos.entryPrice) ||
                          (!isBuy && pos.stopLossPrice <= pos.entryPrice));
                      let progressPct = 50;
                      const activeTargetTp =
                        pos.positionStage === "TP2_TRAIL" && pos.takeProfit3
                          ? pos.takeProfit3
                          : pos.positionStage === "TP1_BE" && pos.takeProfit2
                            ? pos.takeProfit2
                            : pos.takeProfit1;
                      if (pos.stopLossPrice != null && activeTargetTp != null && activeTargetTp !== pos.stopLossPrice) {
                        const rawPct = isBuy
                          ? ((pos.markPrice - pos.stopLossPrice) / (activeTargetTp - pos.stopLossPrice)) * 100
                          : ((pos.stopLossPrice - pos.markPrice) / (pos.stopLossPrice - activeTargetTp)) * 100;
                        progressPct = Math.max(4, Math.min(98, Math.round(rawPct)));
                      }
                      return (
                        <tr
                          key={pos.positionId}
                          className={`hover:bg-surface-elevated/40 border-l-2 ${
                            isRealPos ? "border-l-amber-400" : "border-l-cyan-400"
                          }`}
                        >
                          <td className="px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                              <span className="text-text-primary">{pos.symbol}</span>
                              <Badge tone={pos.direction === "BUY" ? "up" : "down"}>
                                {pos.direction}
                              </Badge>
                              {pos.positionStage === "TP1_BE" && (
                                <Badge tone="up" className="text-[9px]">
                                  TP1 50%+BE
                                </Badge>
                              )}
                              {pos.positionStage === "TP2_TRAIL" && (
                                <Badge tone="up" className="text-[9px]">
                                  TP2 LOCK
                                </Badge>
                              )}
                              {isBeLocked && !pos.positionStage?.startsWith("TP") && (
                                <Badge tone="up" className="text-[9px]">
                                  TRAILING LOCK
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-text-muted">
                              {pos.qtyOrLots} {pos.assetType === "FOREX" ? "lots" : ""} · {pos.leverage}x
                              {pos.realizedPnlUsd ? ` · Chốt ${fmtSignedUsd(pos.realizedPnlUsd)}` : ""}
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
                            <div className="text-text-primary font-medium truncate max-w-[140px]">
                              {pos.accountName}
                            </div>
                            <Badge tone={isRealPos ? "warn" : "accent"} className="mt-0.5 text-[9.5px]">
                              {isRealPos ? "REAL" : "DEMO"}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono">
                            <div className="text-text-secondary">{pos.entryPrice}</div>
                            <div className="font-bold text-text-primary">{pos.markPrice}</div>
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono text-[10.5px]">
                            <div className={isBeLocked ? "text-positive font-semibold" : "text-negative"}>
                              SL: {pos.stopLossPrice ?? "—"}
                            </div>
                            <div className="text-positive">
                              {pos.positionStage === "TP2_TRAIL" && pos.takeProfit3
                                ? `TP3: ${pos.takeProfit3}`
                                : pos.positionStage === "TP1_BE" && pos.takeProfit2
                                  ? `TP2: ${pos.takeProfit2}`
                                  : `TP1: ${pos.takeProfit1 ?? "—"}`}
                            </div>
                            {pos.stopLossPrice != null && activeTargetTp != null && (
                              <div className="mt-1 ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-panel-3" title={`Tiến độ SL → TP: ${progressPct}%`}>
                                <div
                                  className={`h-full transition-all ${
                                    pos.unrealizedPnlUsd >= 0 ? "bg-positive" : "bg-warn"
                                  }`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            )}
                          </td>
                          <td
                            className={`px-2.5 py-2 text-right font-mono font-bold ${pnlTextClass(pos.unrealizedPnlUsd)}`}
                          >
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
                  Engine đang lắng nghe thị trường. Khi có tín hiệu khớp lệnh REAL/DEMO, chốt vị thế hoặc cảnh báo guardrail sẽ hiện tức thì tại đây.
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
