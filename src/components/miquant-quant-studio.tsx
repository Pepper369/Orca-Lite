"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import {
  Badge,
  Loading,
  Panel,
  fmtNum,
  fmtCompact,
  Chg,
} from "@/components/ui";
import {
  Bot,
  Zap,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  Search,
  ExternalLink,
  ChevronRight,
  Info,
  RefreshCw,
  Calculator,
  Compass,
  ArrowUpRight,
  BarChart3,
  Flame,
  Award,
  CheckCircle2,
} from "lucide-react";
import type {
  RankedStockItem,
  QuantBotDefinition,
  RebalancePlan,
} from "@/lib/engines/miquant-quant-engine";
import type {
  MiQuantBreakoutStock,
  MiQuantMoneyFlowStock,
  MiQuantSentimentStock,
  MiQuantValuationStock,
  MiQuantTopForeignStock,
  MiQuantCatalystResponse,
  MiQuantRiskResponse,
  MiQuantFinancialCommentary,
} from "@/lib/providers/miquant";
import { StockQuantFlowValuationWidget } from "@/components/stocks/quant-flow-valuation-widget";
import { DeepFinancialsPanel } from "@/components/stocks/deep-financials-panel";

type ActiveTab = "bots" | "ranking" | "signals";

export function MiQuantStudio() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("bots");
  const [selectedBotId, setSelectedBotId] = useState<string>("bot_breakout_momentum");
  const [capitalInput, setCapitalInput] = useState<number>(100000000);
  const [rebalancePlan, setRebalancePlan] = useState<RebalancePlan | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Stock detail modal
  const [inspectSymbol, setInspectSymbol] = useState<string | null>(null);

  // 1. Fetch Market Signals
  const { data: signalsData, isLoading: loadingSignals, mutate: mutateSignals } = useApi<{
    data: {
      signals: {
        sentiment: number;
        cycle: number;
        momentum: number;
        breadth: number;
        rawDate: string;
      };
      overview: {
        symbol: string;
        sentiment_display: string;
        garch_volatility_normal: number;
        risk_label: string;
        technical_indicator_label: string;
        pe: number;
        pb: number;
        high_52w: number;
        low_52w: number;
        net_money_flow: number;
        foreign_netvalue: number;
      } | null;
      supportResistance: {
        nearest_resistance: number;
        nearest_support: number;
        pct_to_resistance: number;
        pct_above_support: number;
      } | null;
    };
  }>("/api/v1/quant/market-signals", { refreshInterval: 60000 });

  // 2. Fetch Top Picks & Multi-Factor Ranking
  const { data: topPicksData, isLoading: loadingPicks, mutate: mutatePicks } = useApi<{
    data: {
      breakout: MiQuantBreakoutStock[];
      money_flow: MiQuantMoneyFlowStock[];
      sentiment: MiQuantSentimentStock[];
      valuation: MiQuantValuationStock[];
      top_foreign: MiQuantTopForeignStock[];
      composite_ranked: RankedStockItem[];
    };
  }>("/api/v1/quant/top-picks", { refreshInterval: 60000 });

  // 3. Fetch Bots
  const { data: botsData, isLoading: loadingBots, mutate: mutateBots } = useApi<{
    data: QuantBotDefinition[];
  }>("/api/v1/quant/bots", { refreshInterval: 120000 });

  // 4. Fetch Stock Catalyst/Risk when inspectSymbol is active
  const { data: stockInfoData, isLoading: loadingStockInfo } = useApi<{
    data: {
      symbol: string;
      catalysts: MiQuantCatalystResponse | null;
      risks: MiQuantRiskResponse | null;
      commentary: MiQuantFinancialCommentary | null;
    };
  }>(inspectSymbol ? `/api/v1/stocks/${inspectSymbol}/catalyst-risk` : null);

  const bots = botsData?.data || [];
  const selectedBot = useMemo(
    () => bots.find((b) => b.id === selectedBotId) || bots[0],
    [bots, selectedBotId]
  );

  const signals = signalsData?.data?.signals;
  const overview = signalsData?.data?.overview;
  const sr = signalsData?.data?.supportResistance;
  const compositeRanked = topPicksData?.data?.composite_ranked || [];

  const handleCalculateRebalance = async (botId: string, capital: number) => {
    setIsCalculating(true);
    try {
      const res = await fetch("/api/v1/quant/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, capital }),
      });
      const json = await res.json();
      if (json.success) {
        setRebalancePlan(json.data);
      }
    } catch (err) {
      console.error("Failed to calculate rebalance:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRefreshAll = () => {
    mutateSignals();
    mutatePicks();
    mutateBots();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-blue-950/30 via-slate-900/60 to-purple-950/30 p-5 backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                <Bot className="size-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                MiQuant Reverse-Engineered Studio
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                Live Data Feeds
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
              MiQuant AI Quant Studio & Bot Trading
            </h1>
            <p className="text-xs text-text-muted sm:text-sm">
              Hệ thống xếp hạng đa nhân tố (Multi-Factor AI Ranking), 4 Bot tự động phân bổ vốn và Radar 4 tín hiệu vĩ mô thời gian thực.
            </p>
          </div>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 self-start rounded-xl border border-border/80 bg-bg-surface px-3 py-2 text-xs font-medium text-text-secondary hover:bg-border/40 hover:text-text-primary transition"
          >
            <RefreshCw className="size-3.5" />
            <span>Làm mới feed</span>
          </button>
        </div>
      </div>

      {/* 4 Macro Quant Signals Radar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Signal 1: Market Sentiment */}
        <div className="rounded-xl border border-border/70 bg-bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <Compass className="size-3.5 text-blue-400" />
              Tâm lý thị trường
            </span>
            <span className="text-[10px]">Tín hiệu AI</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-lg font-bold ${
                signals?.sentiment === 1
                  ? "text-emerald-400"
                  : signals?.sentiment === -1
                  ? "text-rose-400"
                  : "text-amber-400"
              }`}
            >
              {signals?.sentiment === 1
                ? "Tích cực (Bullish)"
                : signals?.sentiment === -1
                ? "Tiêu cực (Bearish)"
                : "Thận trọng (Neutral)"}
            </span>
            <span className="text-xs text-text-muted font-mono">
              VNINDEX {overview?.sentiment_display || "Ổn định"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Đo lường mức độ lạc quan của dòng tiền và truyền thông tài chính.
          </p>
        </div>

        {/* Signal 2: Market Cycle */}
        <div className="rounded-xl border border-border/70 bg-bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <Activity className="size-3.5 text-purple-400" />
              Chu kỳ thị trường
            </span>
            <span className="text-[10px]">Giai đoạn</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-bold text-purple-300">
              {signals?.cycle === 0
                ? "Tích lũy (Accumulation)"
                : signals?.cycle === 1
                ? "Tăng giá (Markup / Bull)"
                : signals?.cycle === 2
                ? "Phân phối (Distribution)"
                : "Suy thoái (Markdown)"}
            </span>
            <span className="text-xs font-mono text-purple-400">Phase {signals?.cycle ?? 1}</span>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Xác định vị thế vĩ mô chu kỳ định lượng 4 pha Wyckoff & GARCH.
          </p>
        </div>

        {/* Signal 3: Momentum */}
        <div className="rounded-xl border border-border/70 bg-bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="size-3.5 text-emerald-400" />
              Động lượng (Momentum)
            </span>
            <span className="text-[10px]">Xu hướng</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-lg font-bold ${
                signals?.momentum === 1 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {signals?.momentum === 1 ? "Gia tốc tăng (+1)" : "Đi ngang / Yếu (0)"}
            </span>
            <span className="text-xs font-mono text-text-muted">
              {overview?.technical_indicator_label || "Tích cực"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Tương quan vận động giá VNINDEX so với xung lượng thanh khoản.
          </p>
        </div>

        {/* Signal 4: Market Breadth & Support/Resistance */}
        <div className="rounded-xl border border-border/70 bg-bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <Layers className="size-3.5 text-amber-400" />
              Độ rộng & Kháng cự
            </span>
            <span className="text-[10px]">VNINDEX</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs font-mono text-text-primary">
              KC: <strong className="text-rose-400">{fmtNum(sr?.nearest_resistance || 0)}</strong>
            </span>
            <span className="text-xs font-mono text-text-primary">
              HT: <strong className="text-emerald-400">{fmtNum(sr?.nearest_support || 0)}</strong>
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
            <span>Cách KC: +{(sr?.pct_to_resistance || 0).toFixed(1)}%</span>
            <span>Cách HT: -{(sr?.pct_above_support || 0).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <button
          onClick={() => setActiveTab("bots")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "bots"
              ? "bg-accent-primary text-text-inverse shadow-sm"
              : "text-text-muted hover:bg-bg-surface hover:text-text-primary"
          }`}
        >
          <Bot className="size-3.5" />
          <span>4 Bot Giao dịch Định lượng (Quant Bots)</span>
        </button>

        <button
          onClick={() => setActiveTab("ranking")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "ranking"
              ? "bg-accent-primary text-text-inverse shadow-sm"
              : "text-text-muted hover:bg-bg-surface hover:text-text-primary"
          }`}
        >
          <Award className="size-3.5" />
          <span>Bảng Xếp Hạng Đa Nhân Tố (AI Multi-Factor Ranking)</span>
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] text-amber-300">
            Top {compositeRanked.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("signals")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "signals"
              ? "bg-accent-primary text-text-inverse shadow-sm"
              : "text-text-muted hover:bg-bg-surface hover:text-text-primary"
          }`}
        >
          <Flame className="size-3.5" />
          <span>Tín Hiệu Nổi Bật (Breakout, Dòng Tiền, Định Giá)</span>
        </button>
      </div>

      {/* TAB 1: 4 QUANT TRADING BOTS */}
      {activeTab === "bots" && (
        <div className="space-y-6">
          {/* Bots Selection Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {bots.map((b) => {
              const isSelected = b.id === selectedBotId;
              return (
                <div
                  key={b.id}
                  onClick={() => {
                    setSelectedBotId(b.id);
                    setRebalancePlan(null);
                  }}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                    isSelected
                      ? "border-blue-500/80 bg-blue-950/20 shadow-md ring-1 ring-blue-500/40"
                      : "border-border/70 bg-bg-surface hover:border-border hover:bg-bg-surface/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                      {b.rebalance_frequency === "weekly"
                        ? "Tái cơ cấu tuần"
                        : b.rebalance_frequency === "biweekly"
                        ? "2 tuần / lần"
                        : "Hàng tháng"}
                    </span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      CAGR +{b.backtest.cagr}%
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-text-primary group-hover:text-blue-400 transition">
                    {b.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] text-text-muted">
                    {b.tagline}
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-bg-base/60 p-2 text-center text-[10px]">
                    <div>
                      <div className="text-text-muted">Sharpe</div>
                      <div className="font-bold text-blue-300">{b.backtest.sharpe}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Drawdown</div>
                      <div className="font-bold text-rose-400">-{b.backtest.max_drawdown}%</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Win Rate</div>
                      <div className="font-bold text-emerald-400">{b.backtest.win_rate}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Bot Detailed Studio */}
          {selectedBot && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Bot Info & Target Holdings */}
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-2xl border border-border/80 bg-bg-surface p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
                    <div>
                      <h2 className="text-lg font-bold text-text-primary">{selectedBot.name}</h2>
                      <p className="text-xs text-text-muted">{selectedBot.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                        Chốt lời: {selectedBot.target_profit}
                      </span>
                      <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400">
                        Cắt lỗ: {selectedBot.stop_loss}
                      </span>
                    </div>
                  </div>

                  {/* Holdings Table */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                        Danh Mục Nắm Giữ Mục Tiêu ({selectedBot.target_holdings.length} Cổ Phiếu)
                      </h3>
                      <span className="text-[11px] text-text-muted">
                        Tỷ trọng đều: 25% mỗi mã
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/50 text-[10px] uppercase text-text-muted">
                            <th className="py-2">Mã CK</th>
                            <th className="py-2">Giá Hiện Tại</th>
                            <th className="py-2 text-center">Tỷ Trọng</th>
                            <th className="py-2">Cơ Sở Lựa Chọn Của Bot</th>
                            <th className="py-2 text-right">Phân Tích</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {selectedBot.target_holdings.map((h) => (
                            <tr key={h.symbol} className="hover:bg-bg-base/40">
                              <td className="py-2.5 font-bold text-accent-primary">
                                <Link
                                  href={`/stocks/${h.symbol}`}
                                  className="hover:underline flex items-center gap-1"
                                >
                                  {h.symbol}
                                  <ArrowUpRight className="size-3 text-text-muted" />
                                </Link>
                              </td>
                              <td className="py-2.5 font-mono text-text-primary">
                                {fmtNum(h.current_price)} đ
                              </td>
                              <td className="py-2.5 text-center font-bold text-blue-400">
                                {(h.weight * 100).toFixed(0)}%
                              </td>
                              <td className="py-2.5 text-[11px] text-text-secondary">
                                {h.reason}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => setInspectSymbol(h.symbol)}
                                  className="rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-400 hover:bg-blue-500/20 transition"
                                >
                                  AI Insights
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capital Allocation & Order Rebalance Simulator */}
              <div className="rounded-2xl border border-border/80 bg-bg-surface p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                  <Calculator className="size-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-text-primary">
                    Mô Phỏng Lệnh Cân Bằng Vốn
                  </h3>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-text-muted block">
                    Nhập số vốn đầu tư (VND):
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={5000000}
                      value={capitalInput}
                      onChange={(e) => setCapitalInput(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-mono text-text-primary focus:border-blue-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-text-muted">VND</span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex gap-1.5 pt-1">
                    {[50000000, 100000000, 200000000, 500000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCapitalInput(amt)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-medium transition ${
                          capitalInput === amt
                            ? "bg-blue-600 text-white"
                            : "bg-bg-base text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {amt / 1000000}Tr
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCalculating}
                  onClick={() => handleCalculateRebalance(selectedBot.id, capitalInput)}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:from-blue-500 hover:to-indigo-500 transition shadow-sm disabled:opacity-50"
                >
                  {isCalculating ? "Đang tính toán..." : "Tính Toán Bảng Lệnh Mua (Lô 100)"}
                </button>

                {/* Rebalance Plan Results */}
                {rebalancePlan && (
                  <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-emerald-400">
                      <span>Tổng giải ngân:</span>
                      <span>{fmtNum(rebalancePlan.total_allocated)} đ</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>Tiền mặt còn dư:</span>
                      <span>{fmtNum(rebalancePlan.cash_remaining)} đ</span>
                    </div>

                    <div className="border-t border-emerald-500/20 pt-2 space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase text-text-muted">
                        Danh sách lệnh đề xuất:
                      </div>
                      {rebalancePlan.orders.map((o) => (
                        <div
                          key={o.symbol}
                          className="flex items-center justify-between rounded-lg bg-bg-base/60 p-2 font-mono text-[11px]"
                        >
                          <div>
                            <span className="font-bold text-accent-primary">{o.symbol}</span>
                            <span className="ml-2 text-text-muted">
                              x {fmtNum(o.shares)} cp
                            </span>
                          </div>
                          <span className="font-semibold text-text-primary">
                            {fmtNum(o.actual_amount)} đ
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AI MULTI-FACTOR RANKING */}
      {activeTab === "ranking" && (
        <div className="rounded-2xl border border-border/80 bg-bg-surface p-5 space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Bảng Xếp Hạng Đa Nhân Tố (Multi-Factor Composite Score)
              </h2>
              <p className="text-xs text-text-muted">
                Công thức trọng số định lượng: 30% Động lượng (Momentum) + 30% Dòng tiền (Money Flow) + 25% Định giá (Valuation) + 15% Tâm lý (Sentiment)
              </p>
            </div>
            <span className="text-xs text-text-muted">
              Cập nhật từ mô hình MiQuant Platform
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase text-text-muted">
                  <th className="py-2.5">Thứ hạng</th>
                  <th className="py-2.5">Mã CK</th>
                  <th className="py-2.5">Giá Hiện Tại</th>
                  <th className="py-2.5">Tín Hiệu AI</th>
                  <th className="py-2.5 text-center">Điểm AI Ranking</th>
                  <th className="py-2.5">Chi Tiết 4 Nhân Tố</th>
                  <th className="py-2.5">Thẻ Bot Chiến Lược</th>
                  <th className="py-2.5 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {compositeRanked.map((item, idx) => (
                  <tr key={item.symbol} className="hover:bg-bg-base/40">
                    <td className="py-3 font-mono font-bold text-text-muted">
                      #{idx + 1}
                    </td>
                    <td className="py-3 font-bold text-accent-primary">
                      <Link
                        href={`/stocks/${item.symbol}`}
                        className="hover:underline flex items-center gap-1"
                      >
                        {item.symbol}
                        <ArrowUpRight className="size-3 text-text-muted" />
                      </Link>
                    </td>
                    <td className="py-3 font-mono">
                      <div>{fmtNum(item.close)} đ</div>
                      <Chg value={item.pct_change} className="text-[10px]" />
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.signal === "MUA MẠNH"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : item.signal === "TÍCH LŨY"
                            ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                            : item.signal === "THEO DÕI"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {item.signal}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="text-base font-extrabold text-blue-400">
                        {item.ai_score}
                      </span>
                      <span className="text-[10px] text-text-muted">/100</span>
                    </td>
                    <td className="py-3">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-text-muted w-48">
                        <div>
                          Mom: <strong className="text-text-primary">{item.factors.momentum}</strong>
                        </div>
                        <div>
                          Flow: <strong className="text-text-primary">{item.factors.money_flow}</strong>
                        </div>
                        <div>
                          Val: <strong className="text-text-primary">{item.factors.valuation}</strong>
                        </div>
                        <div>
                          Sent: <strong className="text-text-primary">{item.factors.sentiment}</strong>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.bot_tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-bg-base border border-border/70 px-1.5 py-0.5 text-[9px] text-text-secondary"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setInspectSymbol(item.symbol)}
                        className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition"
                      >
                        Xem AI Catalyst
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HIGHLIGHTED FEEDS (BREAKOUT, MONEY FLOW, VALUATION) */}
      {activeTab === "signals" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Column 1: Breakout Stocks */}
          <div className="rounded-2xl border border-border/80 bg-bg-surface p-4 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-border/50 pb-2">
              <Zap className="size-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Cổ Phiếu Breakout (Bứt Phá)
              </h3>
            </div>
            <div className="space-y-2">
              {(topPicksData?.data?.breakout || []).map((b) => (
                <div
                  key={b.symbol}
                  className="rounded-xl border border-border/60 bg-bg-base/60 p-3 hover:border-amber-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-accent-primary">{b.symbol}</span>
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                      Vol x{b.volume_ratio.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs font-mono">
                    <span>{fmtNum(b.close * (b.close < 1000 ? 1000 : 1))} đ</span>
                    <Chg value={b.pct_change * 100} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
                    <span>Kháng cự: {fmtNum(b.breakout_price)} đ</span>
                    <button
                      onClick={() => setInspectSymbol(b.symbol)}
                      className="text-blue-400 hover:underline"
                    >
                      AI Insights &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Top Money Flow Stocks */}
          <div className="rounded-2xl border border-border/80 bg-bg-surface p-4 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-border/50 pb-2">
              <DollarSign className="size-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Dòng Tiền Lớn Tích Lũy Ròng
              </h3>
            </div>
            <div className="space-y-2">
              {(topPicksData?.data?.money_flow || []).map((m) => (
                <div
                  key={m.symbol}
                  className="rounded-xl border border-border/60 bg-bg-base/60 p-3 hover:border-emerald-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-accent-primary">{m.symbol}</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      +{fmtNum(m.cum_money_flow_bil)} Tỷ
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs font-mono">
                    <span>{fmtNum(m.close * (m.close < 1000 ? 1000 : 1))} đ</span>
                    <Chg value={m.pct_change * 100} />
                  </div>
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => setInspectSymbol(m.symbol)}
                      className="text-[10px] text-blue-400 hover:underline"
                    >
                      Xem dòng tiền chi tiết &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Deep Value / Highest Upside */}
          <div className="rounded-2xl border border-border/80 bg-bg-surface p-4 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-border/50 pb-2">
              <ShieldCheck className="size-4 text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Định Giá Hời (Upside Cao Nhất)
              </h3>
            </div>
            <div className="space-y-2">
              {(topPicksData?.data?.valuation || []).map((v) => (
                <div
                  key={v.symbol}
                  className="rounded-xl border border-border/60 bg-bg-base/60 p-3 hover:border-blue-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-accent-primary">{v.symbol}</span>
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                      Upside +{(v.upside * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs font-mono">
                    <span>Giá: {fmtNum(v.close * (v.close < 1000 ? 1000 : 1))} đ</span>
                    <span className="text-emerald-400">
                      Mục tiêu: {fmtNum(v.target_price * (v.target_price < 1000 ? 1000 : 1))} đ
                    </span>
                  </div>
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => setInspectSymbol(v.symbol)}
                      className="text-[10px] text-blue-400 hover:underline"
                    >
                      Mô hình định giá AI &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AI CATALYST & RISK WARNINGS FOR SELECTED STOCK */}
      {inspectSymbol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-accent-primary">{inspectSymbol}</span>
                <span className="text-xs text-text-muted">
                  AI Fundamental Catalysts & Risk Radar (MiQuant Engine)
                </span>
              </div>
              <button
                onClick={() => setInspectSymbol(null)}
                className="rounded-lg p-1 text-text-muted hover:bg-bg-base hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            {/* Live Quantitative Flow & Valuation Chart */}
            <StockQuantFlowValuationWidget symbol={inspectSymbol} />

            {/* Deep Financials: Bank Ratios (NIM/CASA/NPL) or Corporate Asset Composition */}
            <DeepFinancialsPanel symbol={inspectSymbol} />

            {loadingStockInfo ? (
              <Loading rows={4} />
            ) : (
              <div className="space-y-4">
                {/* Catalysts Section */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <Sparkles className="size-3.5" />
                    Động Lực Tăng Trưởng & Sự Kiện Thúc Đẩy (Catalysts)
                  </h4>
                  <div className="mt-2 space-y-2">
                    {stockInfoData?.data?.catalysts?.summary && stockInfoData.data.catalysts.summary.length > 0 ? (
                      stockInfoData.data.catalysts.summary.map((c, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3 text-xs leading-relaxed text-text-secondary"
                        >
                          <div dangerouslySetInnerHTML={{ __html: c.description.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                          {c.sites && c.sites.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 pt-1 border-t border-emerald-500/10">
                              {c.sites.flatMap((s) => (s.articles || []).map((art) => ({ ...art, domain: s.domain }))).slice(0, 2).map((a, idx) => (
                                <a
                                  key={idx}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink className="size-2.5" />
                                  <span>{a.domain || "Báo chí"}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-text-muted">Chưa có sự kiện đột biến mới ghi nhận cho {inspectSymbol}.</p>
                    )}
                  </div>
                </div>

                {/* Risks Section */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-400">
                    <ShieldAlert className="size-3.5" />
                    Cảnh Báo Rủi Ro Đầu Tư (Risk Warnings)
                  </h4>
                  <div className="mt-2 space-y-2">
                    {stockInfoData?.data?.risks?.summary && stockInfoData.data.risks.summary.length > 0 ? (
                      stockInfoData.data.risks.summary.map((r, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 text-xs leading-relaxed text-text-secondary"
                        >
                          <div dangerouslySetInnerHTML={{ __html: r.description.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-text-muted">Chưa có cảnh báo rủi ro đặc biệt cho {inspectSymbol}.</p>
                    )}
                  </div>
                </div>

                {/* Financial Commentary Section */}
                {stockInfoData?.data?.commentary?.commentary && (
                  <div>
                    <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-400">
                      <BarChart3 className="size-3.5" />
                      Phân Tích Tài Chính AI So Sánh Ngành
                    </h4>
                    <div className="mt-2 overflow-x-auto rounded-xl border border-border/70 bg-bg-base/70 p-3 text-[11px] leading-relaxed text-text-secondary font-sans whitespace-pre-wrap">
                      {stockInfoData.data.commentary.commentary}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border/50">
              <Link
                href={`/stocks/${inspectSymbol}`}
                className="rounded-xl bg-accent-primary px-4 py-2 text-xs font-bold text-text-inverse hover:opacity-90 transition"
              >
                Mở Trang Phân Tích Đầy Đủ {inspectSymbol} &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
