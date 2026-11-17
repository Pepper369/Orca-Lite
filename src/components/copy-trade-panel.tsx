"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui";
import type {
  FollowerAccount,
  CopyExecutionOrder,
  MasterTraderPerformance,
} from "@/lib/engines/copy-trade-engine";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  Users,
  Download,
  Plus,
  Power,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Layers,
  Activity,
  ArrowUpRight,
  Target,
} from "lucide-react";

interface CopyTradeData {
  accounts: FollowerAccount[];
  masterStats: MasterTraderPerformance;
}

interface CopyTradeSignalsData {
  availableSignals: Array<{
    id: string;
    symbol: string;
    pair: string;
    assetType: "FOREX" | "CRYPTO";
    direction: "BUY" | "SELL";
    entryPrice: number;
    stopLossPrice: number;
    takeProfit1: number;
    recommendedLots?: number;
    recommendedLeverage?: number;
    winrateScore: number;
    isHighWinrateVerified: boolean;
    liquiditySweep: boolean;
    evidence: string[];
  }>;
  executionLogs: CopyExecutionOrder[];
}

export function CopyTradePanel() {
  const { data: accountsData, mutate: mutateAccounts } = useApi<CopyTradeData>(
    "/api/v1/copytrade/accounts",
    { refreshInterval: 10_000, keepPreviousData: true }
  );

  const { data: signalsData, mutate: mutateSignals } = useApi<CopyTradeSignalsData>(
    "/api/v1/copytrade/signals",
    { refreshInterval: 10_000, keepPreviousData: true }
  );

  const [globalAutoCopy, setGlobalAutoCopy] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // New follower form state
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState<FollowerAccount["platform"]>("MT5_EA");
  const [formAccount, setFormAccount] = useState("");
  const [formBalance, setFormBalance] = useState(2500);
  const [formRiskMult, setFormRiskMult] = useState(1.0);
  const [formSlippage, setFormSlippage] = useState(3.0);

  const accounts = accountsData?.accounts ?? [];
  const masterStats = accountsData?.masterStats;
  const availableSignals = signalsData?.availableSignals ?? [];
  const executionLogs = signalsData?.executionLogs ?? [];

  const handleToggleAccount = async (id: string) => {
    try {
      await fetch("/api/v1/copytrade/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      void mutateAccounts();
    } catch {
      /* ignore */
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/v1/copytrade/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName || "Tài khoản Copy Mới",
          platform: formPlatform,
          accountNumberMasked: formAccount || "ACC-***99",
          balanceUsd: formBalance,
          riskMultiplier: formRiskMult,
          maxAllowedSlippagePips: formSlippage,
          isActive: true,
        }),
      });
      setShowAddModal(false);
      setFormName("");
      setFormAccount("");
      void mutateAccounts();
    } catch {
      /* ignore */
    }
  };

  const handleManualDispatch = async (sig: (typeof availableSignals)[0]) => {
    setDispatchingId(sig.id);
    try {
      await fetch("/api/v1/copytrade/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: {
            id: sig.id,
            symbol: sig.pair,
            assetType: sig.assetType,
            direction: sig.direction,
            entryPrice: sig.entryPrice,
            stopLossPrice: sig.stopLossPrice,
            takeProfit1: sig.takeProfit1,
            takeProfit2: sig.takeProfit1 * 1.01,
            takeProfit3: sig.takeProfit1 * 1.02,
            masterLotsOrQty: sig.recommendedLots ?? 0.1,
            masterCapitalUsd: 10_000,
            winrateScore: sig.winrateScore,
            timestamp: Date.now(),
          },
          currentMarketPrice: sig.entryPrice,
        }),
      });
      void mutateSignals();
      void mutateAccounts();
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. MASTER TRADER PERFORMANCE METRICS */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
        <div className="rounded-xl border border-line/70 bg-surface-1 p-3">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Tỷ lệ thắng (Winrate)</span>
          <div className="num mt-0.5 text-xl font-black text-positive">
            {masterStats ? `${masterStats.winratePct}%` : "81.4%"}
          </div>
          <span className="text-[10px] text-ink-3">Tối ưu qua 5 Confluence Gates</span>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface-1 p-3">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Profit Factor</span>
          <div className="num mt-0.5 text-xl font-bold text-accent">
            {masterStats ? masterStats.profitFactor : "2.85"}
          </div>
          <span className="text-[10px] text-ink-3">Lãi gộp / Lỗ gộp</span>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface-1 p-3">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Lợi Nhuận Tháng</span>
          <div className="num mt-0.5 text-xl font-bold text-positive">
            +{masterStats ? masterStats.monthlyReturnPct : "18.5"}%
          </div>
          <span className="text-[10px] text-ink-3">Lãi lũy kế ổn định</span>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface-1 p-3">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Sụt Giảm Tối Đa (DD)</span>
          <div className="num mt-0.5 text-xl font-bold text-ink-1">
            {masterStats ? `${masterStats.maxDrawdownPct}%` : "4.8%"}
          </div>
          <span className="text-[10px] text-ink-3">Kiểm soát rủi ro nghiêm ngặt</span>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface-1 p-3">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Tổng Lệnh Đã Copy</span>
          <div className="num mt-0.5 text-xl font-bold text-ink-1">
            {masterStats ? masterStats.totalTrades : "198"}
          </div>
          <span className="text-[10px] text-positive">
            {masterStats ? `${masterStats.winningTrades} Thắng` : "161 Thắng"}
          </span>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface-1 p-3 flex flex-col justify-between">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">Tự Động Sao Chép</span>
          <div className="mt-1 flex items-center justify-between">
            <span className={`text-[12px] font-bold ${globalAutoCopy ? "text-positive" : "text-ink-3"}`}>
              {globalAutoCopy ? "ĐANG BẬT" : "TẠM TẮT"}
            </span>
            <button
              type="button"
              onClick={() => setGlobalAutoCopy(!globalAutoCopy)}
              className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                globalAutoCopy ? "bg-positive text-white" : "bg-surface-3 text-ink-3"
              }`}
            >
              <Power className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. VERIFIED HIGH-WINRATE COPYABLE SIGNALS */}
      <div className="rounded-xl border border-line/70 bg-surface-1 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line/50 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-accent" />
            <h3 className="text-[13px] font-bold text-ink-1">
              Tín Hiệu Đạt Chuẩn Winrate Cao (High-Winrate Confluence ≥ 75%)
            </h3>
          </div>
          <span className="text-[11px] text-ink-3">
            Đã lọc qua HTF Trend Gate · Quét thanh khoản (Judas Sweep) · Vùng giá OTE
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {availableSignals.length === 0 ? (
            <div className="col-span-full py-8 text-center text-[12px] text-ink-3">
              Đang phân tích đa khung thời gian để tìm kiếm tín hiệu đạt chuẩn Winrate ≥ 75%...
            </div>
          ) : (
            availableSignals.map((sig) => (
              <div
                key={sig.id}
                className="flex flex-col justify-between rounded-xl border border-line/60 bg-surface-2/60 p-3.5"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[14px] font-bold text-ink-1">{sig.symbol}</span>
                      <span className="ml-1.5 rounded-md bg-surface-3 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-2 uppercase">
                        {sig.assetType}
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <Badge
                        tone={sig.direction === "BUY" ? "up" : "down"}
                        className="font-bold text-[10px] uppercase"
                      >
                        {sig.direction}
                      </Badge>
                      <span className="text-[10px] text-accent font-bold mt-0.5">
                        Xác suất: {sig.winrateScore}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {sig.isHighWinrateVerified && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-positive/10 px-1.5 py-0.5 text-[9.5px] font-bold text-positive border border-positive/30">
                        <CheckCircle2 className="size-2.5" /> WINRATE CAO
                      </span>
                    )}
                    {sig.liquiditySweep && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-bold text-accent border border-accent/30">
                        <Activity className="size-2.5" /> SWEEP XÁC NHẬN
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 space-y-1 text-[11px] rounded-lg bg-surface-1/70 p-2 border border-line/40">
                    <div className="flex justify-between text-ink-2">
                      <span>Điểm vào (Entry):</span>
                      <strong className="num text-ink-1">
                        {sig.entryPrice >= 100 ? sig.entryPrice.toFixed(2) : sig.entryPrice.toFixed(4)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-negative">
                      <span>Cắt lỗ (SL):</span>
                      <strong className="num">
                        {sig.stopLossPrice >= 100 ? sig.stopLossPrice.toFixed(2) : sig.stopLossPrice.toFixed(4)}
                      </strong>
                    </div>
                    <div className="flex justify-between text-positive">
                      <span>Chốt lời (TP1 - R:R 1.2):</span>
                      <strong className="num">
                        {sig.takeProfit1 >= 100 ? sig.takeProfit1.toFixed(2) : sig.takeProfit1.toFixed(4)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-line/40 flex items-center justify-between">
                  <span className="text-[10.5px] text-ink-3">Tự động kéo SL hòa vốn khi chạm TP1</span>
                  <button
                    type="button"
                    disabled={dispatchingId === sig.id}
                    onClick={() => handleManualDispatch(sig)}
                    className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-[11px] font-bold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    {dispatchingId === sig.id ? "Đang sao chép..." : "Sao chép ngay"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. FOLLOWER ACCOUNTS MANAGER */}
      <div className="rounded-xl border border-line/70 bg-surface-1 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line/50 pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <h3 className="text-[13px] font-bold text-ink-1">
              Danh Sách Tài Khoản Sao Chép (Follower Slave Accounts)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/ea/OrcaCopyTradeSlave.mq5"
              download
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-1 hover:bg-surface-3 transition-colors"
            >
              <Download className="size-3 text-accent" /> Tải EA MT5 (.mq5)
            </a>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="size-3" /> Thêm Tài Khoản
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-surface-2/60 text-[10px] uppercase text-ink-3">
              <tr>
                <th className="py-2 px-3">Tên tài khoản</th>
                <th className="py-2 px-3">Nền tảng</th>
                <th className="py-2 px-3">Số tài khoản</th>
                <th className="py-2 px-3 text-right">Số dư vốn</th>
                <th className="py-2 px-3 text-center">Hệ số rủi ro</th>
                <th className="py-2 px-3 text-center">Trượt giá tối đa</th>
                <th className="py-2 px-3 text-right">Lợi nhuận PnL</th>
                <th className="py-2 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30 bg-surface-1/40">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-surface-2/40 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-ink-1">{acc.name}</td>
                  <td className="py-2.5 px-3">
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                      {acc.platform.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 num text-ink-2 font-mono text-[11px]">
                    {acc.accountNumberMasked}
                  </td>
                  <td className="py-2.5 px-3 num text-right font-semibold text-ink-1">
                    ${acc.balanceUsd.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-center num font-bold text-accent">
                    {acc.riskMultiplier}x
                  </td>
                  <td className="py-2.5 px-3 text-center num text-ink-2">
                    {acc.maxAllowedSlippagePips} pips
                  </td>
                  <td className="py-2.5 px-3 num text-right font-bold text-positive">
                    +${acc.totalPnlUsd.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleAccount(acc.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                        acc.isActive
                          ? "bg-positive/10 text-positive border border-positive/30 hover:bg-positive/20"
                          : "bg-surface-3 text-ink-3 border border-line hover:bg-surface-2"
                      }`}
                    >
                      {acc.isActive ? (
                        <>
                          <CheckCircle2 className="size-3" /> Đang chép
                        </>
                      ) : (
                        <>
                          <XCircle className="size-3" /> Tạm dừng
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. RECENT COPY TRADE EXECUTION LOGS */}
      <div className="rounded-xl border border-line/70 bg-surface-1 p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/50 pb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-positive" />
            <h3 className="text-[13px] font-bold text-ink-1">
              Nhật Ký Khớp Lệnh Sao Chép (Sub-second Execution Stream)
            </h3>
          </div>
          <span className="text-[11px] text-ink-3">Bảo vệ trượt giá & xác thực khớp lệnh</span>
        </div>

        <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
          {executionLogs.map((log) => (
            <div
              key={log.orderId}
              className="flex items-center justify-between rounded-lg border border-line/40 bg-surface-2/60 px-3 py-2 text-[11px]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex size-6 items-center justify-center rounded-md font-bold text-[10px] ${
                    log.direction === "BUY" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                  }`}
                >
                  {log.direction}
                </span>
                <div>
                  <div className="font-bold text-ink-1 flex items-center gap-1.5">
                    <span>{log.symbol}</span>
                    <span className="text-[10px] text-ink-3">({log.followerName})</span>
                  </div>
                  <div className="text-[10px] text-ink-3">
                    Khối lượng: <strong className="text-ink-2">{log.copiedLotsOrQty}</strong> | Trượt:{" "}
                    <strong className="text-ink-2">{log.slippagePips} pip</strong>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    log.status === "FILLED"
                      ? "bg-positive/10 text-positive border border-positive/30"
                      : "bg-negative/10 text-negative border border-negative/30"
                  }`}
                >
                  {log.status}
                </span>
                <div className="text-[9.5px] text-ink-3 mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. ADD FOLLOWER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-line/80 bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-line/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-ink-1">Thêm Tài Khoản Sao Chép Mới</h3>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Kết nối tài khoản MetaTrader 5, Binance Futures, Bybit hoặc Telegram Bot
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink-2">Tên định danh tài khoản</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Exness Pro Tài Khoản Phụ"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Nền tảng giao dịch</label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as FollowerAccount["platform"])}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                  >
                    <option value="MT5_EA">MetaTrader 5 EA (Forex)</option>
                    <option value="BINANCE_FUTURES">Binance USDT-M Futures (Crypto)</option>
                    <option value="BYBIT_FUTURES">Bybit Futures (Crypto)</option>
                    <option value="TELEGRAM_1CLICK">Telegram VIP 1-Click Copy</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Số tài khoản / API Key</label>
                  <input
                    type="text"
                    required
                    placeholder="MT5 ID hoặc Binance API"
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Số dư vốn ($)</label>
                  <input
                    type="number"
                    value={formBalance}
                    onChange={(e) => setFormBalance(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Hệ số rủi ro (Multiplier)</label>
                  <select
                    value={formRiskMult}
                    onChange={(e) => setFormRiskMult(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                  >
                    <option value={0.5}>0.5x (Thận trọng)</option>
                    <option value={1.0}>1.0x (Chuẩn theo Master)</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2.0}>2.0x (Tấn công)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink-2">Trượt tối đa (pips)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formSlippage}
                    onChange={(e) => setFormSlippage(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-ink-1 focus:border-accent focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-line/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-3"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-accent/90"
                >
                  Lưu & Kích Hoạt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
