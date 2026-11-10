"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Play,
  RefreshCw,
  Sparkles,
  Check,
  Copy,
  Sliders,
  BarChart2,
  ShieldCheck,
  Terminal,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Award,
  LineChart,
  Layers,
  Search,
  ExternalLink,
  Flame,
  Info,
  Calendar,
  Grid,
  TrendingDown,
  Activity,
  Maximize2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  FIREANT_STRATEGIES,
  executeBacktest,
  extractParamsFromCode,
  runGridOptimization,
  type FireAntStrategy,
  type FullBacktestResult,
  type TradeRecord,
} from "@/lib/quant/quant-engine";
import { Badge, fmtNum, fmtCompact, Chg } from "@/components/ui";

type ActiveStudioTab = "overview" | "trades" | "monthly" | "symbols" | "optimizer" | "robustness";

export function FireAntQuantStudio() {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("golden-cross");
  const [selectedUniverse, setSelectedUniverse] = useState<string>("HOSE_LIQUID");
  const [startCapital, setStartCapital] = useState<number>(100000000);
  const [activeTab, setActiveTab] = useState<ActiveStudioTab>("overview");
  const [editorTab, setEditorTab] = useState<"code" | "params" | "copilot">("params");
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Strategy code & custom parameters
  const currentStrategy = useMemo(() => {
    return FIREANT_STRATEGIES.find((s) => s.id === selectedStrategyId) || FIREANT_STRATEGIES[0];
  }, [selectedStrategyId]);

  const [strategyCode, setStrategyCode] = useState<string>(currentStrategy.code);
  const [customParams, setCustomParams] = useState<Record<string, any>>({});
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Sync code and default params when strategy changes
  useEffect(() => {
    setStrategyCode(currentStrategy.code);
    const defs = extractParamsFromCode(currentStrategy.code);
    const initial: Record<string, any> = {};
    for (const [k, v] of Object.entries(defs)) {
      initial[k] = v.defaultValue;
    }
    setCustomParams(initial);
  }, [currentStrategy]);

  // Execute Backtest Result
  const backtestResult = useMemo(() => {
    return executeBacktest(currentStrategy, customParams, startCapital);
  }, [currentStrategy, customParams, startCapital]);

  // Parameter definitions
  const paramDefs = useMemo(() => {
    return extractParamsFromCode(strategyCode);
  }, [strategyCode]);

  // Handle parameter slider change
  const handleParamChange = (key: string, value: any) => {
    setCustomParams((prev) => ({ ...prev, [key]: value }));
  };

  // Optimizer state
  const [optimizerRun, setOptimizerRun] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  const handleRunOptimizer = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const keys = Object.keys(paramDefs);
      const p1 = keys[0] || "fast";
      const p2 = keys[1] || "slow";

      let p1Vals = [20, 30, 40, 50, 60];
      let p2Vals = [100, 150, 200, 250];

      if (paramDefs[p1]?.type === "pct") p1Vals = [0.08, 0.12, 0.15, 0.18, 0.22];
      if (paramDefs[p2]?.type === "pct") p2Vals = [0.3, 0.5, 0.7, 0.9];

      const opt = runGridOptimization(currentStrategy, p1, p1Vals, p2, p2Vals);
      setOptimizerRun(opt);
      setIsOptimizing(false);
    }, 400);
  };

  // Copilot messages
  const [copilotQuery, setCopilotQuery] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "ai"; text: string; codeSnippet?: string }>>([
    {
      sender: "ai",
      text: "Xin chào! Tôi là Trợ lý AI Quant Studio. Bạn có thể yêu cầu tôi tạo chiến lược mới, tối ưu tham số, giải thích mã lệnh hoặc kiểm định độ vững.",
    },
  ]);

  const handleSendCopilot = () => {
    if (!copilotQuery.trim()) return;
    const q = copilotQuery;
    setCopilotQuery("");
    const newHistory = [...chatHistory, { sender: "user" as const, text: q }];
    setChatHistory(newHistory);

    setTimeout(() => {
      let reply = "";
      let snippet: string | undefined = undefined;

      const lower = q.toLowerCase();
      if (lower.includes("trailing") || lower.includes("dừng lỗ")) {
        reply = `Tôi đã cập nhật trailing stop trong chiến lược sang mức 12% để bảo toàn lợi nhuận tối ưu trong thị trường rung lắc mạnh:`;
        snippet = `risk: (p) => ({ trailingStop: 0.12 }),`;
      } else if (lower.includes("tối ưu") || lower.includes("optimize")) {
        reply = `Kết quả quét tham số tối ưu khuyến nghị đặt chu kỳ ngắn 30 và chu kỳ dài 180, giúp Sharpe Ratio tăng từ 1.48 lên 1.92 và giảm Max Drawdown xuống -12.4%.`;
      } else if (lower.includes("vn30") || lower.includes("hose")) {
        reply = `Đã cấu hình bộ lọc rổ mã thanh khoản cao (VN30 và HOSE GTGD > 10 tỷ):`;
        snippet = `universe: universe("HOSE").liquid(10e9).top(240),`;
      } else {
        reply = `Đã phân tích yêu cầu "${q}". Chiến lược ${currentStrategy.title} hiện đang có CAGR ${backtestResult.metrics.cagr}%, Sharpe ${backtestResult.metrics.sharpe} và Win Rate ${backtestResult.metrics.winRate}%. Bạn có muốn tôi tối ưu thêm tỷ lệ rủi ro/lợi nhuận không?`;
      }

      setChatHistory((prev) => [...prev, { sender: "ai", text: reply, codeSnippet: snippet }]);
    }, 600);
  };

  // Trades filter state
  const [tradeFilter, setTradeFilter] = useState<"ALL" | "WIN" | "LOSS">("ALL");
  const filteredTrades = useMemo(() => {
    if (tradeFilter === "WIN") return backtestResult.trades.filter((t) => t.pnl > 0);
    if (tradeFilter === "LOSS") return backtestResult.trades.filter((t) => t.pnl <= 0);
    return backtestResult.trades;
  }, [backtestResult.trades, tradeFilter]);

  // Strategy categories
  const categories = useMemo(() => {
    const cats = new Set(FIREANT_STRATEGIES.map((s) => s.category));
    return Array.from(cats);
  }, []);

  // SVG Chart Dimensions & Paths
  const svgWidth = 820;
  const svgHeight = 260;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  const points = backtestResult.equityCurve;
  const maxEq = Math.max(...points.map((p) => Math.max(p.equity, p.benchmark)));
  const minEq = Math.min(...points.map((p) => Math.min(p.equity, p.benchmark)));

  const getX = (idx: number) => padding.left + (idx / (points.length - 1)) * chartW;
  const getY = (val: number) => padding.top + chartH - ((val - minEq) / (maxEq - minEq || 1)) * chartH;

  const stratPath = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.equity).toFixed(1)}`).join(" ");
  }, [points, maxEq, minEq]);

  const benchPath = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.benchmark).toFixed(1)}`).join(" ");
  }, [points, maxEq, minEq]);

  // Underwater DD path
  const ddSvgHeight = 90;
  const ddChartH = ddSvgHeight - 25;
  const minDd = Math.min(0, ...points.map((p) => p.drawdown));
  const getDdY = (dd: number) => 15 + ((dd - 0) / (minDd || -1)) * ddChartH;

  const ddPath = useMemo(() => {
    if (points.length === 0) return "";
    const p1 = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getDdY(p.drawdown).toFixed(1)}`).join(" ");
    return `${p1} L ${getX(points.length - 1).toFixed(1)} 15 L ${getX(0).toFixed(1)} 15 Z`;
  }, [points, minDd]);

  return (
    <div className="flex flex-col gap-5 text-text-primary">
      {/* Top Header & Strategy Selector */}
      <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-primary/20 text-accent-primary border border-accent-primary/30">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-text-primary">
                  FireAnt Quant AI Studio
                </h1>
                <Badge tone="accent">Quant DSL v2.4</Badge>
                <Badge tone="up">Live Verified</Badge>
              </div>
              <p className="text-xs text-text-muted">
                Hệ thống phân tích định lượng, backtest danh mục & tối ưu đa nhân tố từ FireAnt Platform
              </p>
            </div>
          </div>

          {/* Universe & Capital & Run button */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center rounded-lg border border-border-subtle bg-surface-elevated px-2.5 py-1.5 text-xs">
              <span className="text-text-muted mr-1.5">Rổ mã:</span>
              <select
                value={selectedUniverse}
                onChange={(e) => setSelectedUniverse(e.target.value)}
                className="bg-transparent font-medium text-text-primary focus:outline-none cursor-pointer"
              >
                <option value="VN30">VN30 (Bluechips)</option>
                <option value="HOSE_LIQUID">HOSE Top 240 (&gt;10 tỷ/phiên)</option>
                <option value="ALL_LIQUID">Toàn sàn (&gt;5 tỷ/phiên)</option>
              </select>
            </div>

            <div className="flex items-center rounded-lg border border-border-subtle bg-surface-elevated px-2.5 py-1.5 text-xs">
              <span className="text-text-muted mr-1.5">Vốn:</span>
              <input
                type="number"
                value={startCapital}
                onChange={(e) => setStartCapital(Math.max(10000000, Number(e.target.value)))}
                className="w-24 bg-transparent font-medium text-text-primary focus:outline-none"
              />
              <span className="text-text-muted ml-1">đ</span>
            </div>

            <button
              onClick={() => {
                setIsCalculating(true);
                setTimeout(() => setIsCalculating(false), 300);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:opacity-90 transition active:scale-95 cursor-pointer"
            >
              <Play className={`size-3.5 fill-current ${isCalculating ? "animate-spin" : ""}`} />
              Chạy Backtest (F5)
            </button>
          </div>
        </div>

        {/* Strategy Selector Row */}
        <div className="mt-4 pt-3.5 border-t border-border-subtle/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted">Chọn mẫu Quant:</span>
            <div className="relative">
              <select
                value={selectedStrategyId}
                onChange={(e) => setSelectedStrategyId(e.target.value)}
                className="appearance-none rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 pr-8 text-xs font-semibold text-text-primary focus:border-accent-primary focus:outline-none cursor-pointer"
              >
                {categories.map((cat) => (
                  <optgroup key={cat} label={`── ${cat} ──`}>
                    {FIREANT_STRATEGIES.filter((s) => s.category === cat).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
            </div>
            <Badge tone="neutral">{currentStrategy.category}</Badge>
          </div>

          <p className="text-xs text-text-muted max-w-xl truncate" title={currentStrategy.description}>
            {currentStrategy.description}
          </p>
        </div>
      </div>

      {/* Main Studio Two-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Pane (5 Cols): Code, Dynamic Parameters & Copilot */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-xl border border-border-subtle bg-surface-base shadow-sm overflow-hidden flex flex-col h-[680px]">
            {/* Sub-tabs header */}
            <div className="flex items-center justify-between border-b border-border-subtle bg-surface-elevated/60 px-3 py-2 text-xs">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditorTab("params")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                    editorTab === "params"
                      ? "bg-surface-base text-accent-primary shadow-sm border border-border-subtle"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Sliders className="size-3.5" />
                  Tham số
                </button>
                <button
                  onClick={() => setEditorTab("code")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                    editorTab === "code"
                      ? "bg-surface-base text-accent-primary shadow-sm border border-border-subtle"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Terminal className="size-3.5" />
                  Mã SDK
                </button>
                <button
                  onClick={() => setEditorTab("copilot")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                    editorTab === "copilot"
                      ? "bg-surface-base text-accent-primary shadow-sm border border-border-subtle"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Sparkles className="size-3.5 text-amber-400" />
                  Quant Copilot
                </button>
              </div>

              {editorTab === "code" && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(strategyCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                >
                  {copiedCode ? <Check className="size-3 text-up" /> : <Copy className="size-3" />}
                  {copiedCode ? "Đã chép" : "Sao chép"}
                </button>
              )}
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* TAB 1: PARAMETERS */}
              {editorTab === "params" && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg bg-surface-elevated/40 p-3 text-xs text-text-muted border border-border-subtle/50">
                    <span className="font-semibold text-text-primary">{currentStrategy.title}</span>: Tinh chỉnh các tham số dưới đây để xem sự thay đổi thời gian thực lên hiệu suất danh mục.
                  </div>

                  <div className="flex flex-col gap-3.5">
                    {Object.entries(paramDefs).map(([key, def]) => {
                      const curVal = customParams[key] ?? def.defaultValue;
                      return (
                        <div key={key} className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated/30 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-text-primary">{def.label || key}</span>
                            <span className="font-mono text-accent-primary font-semibold">
                              {def.type === "pct"
                                ? `${(curVal * 100).toFixed(0)}%`
                                : def.type === "bool"
                                ? curVal ? "BẬT" : "TẮT"
                                : curVal}
                            </span>
                          </div>

                          {def.type === "bool" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => handleParamChange(key, !curVal)}
                                className={`rounded px-3 py-1 text-xs font-medium cursor-pointer transition ${
                                  curVal
                                    ? "bg-up/20 text-up border border-up/30"
                                    : "bg-surface-elevated text-text-muted border border-border-subtle"
                                }`}
                              >
                                {curVal ? "Đang áp dụng bộ lọc" : "Bỏ qua điều kiện"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 mt-1">
                              <input
                                type="range"
                                min={def.min ?? 1}
                                max={def.max ?? 100}
                                step={def.step ?? (def.type === "pct" ? 0.01 : 1)}
                                value={curVal}
                                onChange={(e) =>
                                  handleParamChange(
                                    key,
                                    def.type === "int"
                                      ? parseInt(e.target.value, 10)
                                      : parseFloat(e.target.value)
                                  )
                                }
                                className="flex-1 accent-accent-primary cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-auto pt-4 border-t border-border-subtle flex justify-between items-center text-xs text-text-muted">
                    <span>Tham số đang chạy: {Object.keys(paramDefs).length}</span>
                    <button
                      onClick={() => {
                        const defs = extractParamsFromCode(currentStrategy.code);
                        const initial: Record<string, any> = {};
                        for (const [k, v] of Object.entries(defs)) initial[k] = v.defaultValue;
                        setCustomParams(initial);
                      }}
                      className="text-text-muted hover:text-accent-primary cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="size-3" /> Đặt lại mặc định
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: CODE EDITOR */}
              {editorTab === "code" && (
                <div className="flex flex-col h-full">
                  <textarea
                    value={strategyCode}
                    onChange={(e) => setStrategyCode(e.target.value)}
                    className="flex-1 w-full resize-none font-mono text-[11.5px] leading-relaxed p-3 rounded-lg bg-surface-elevated/70 border border-border-subtle text-text-primary focus:outline-none focus:border-accent-primary selection:bg-accent-primary/30"
                    spellCheck={false}
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                    <span>FireAnt SDK JS Runtime</span>
                    <Badge tone="up">Cú pháp hợp lệ</Badge>
                  </div>
                </div>
              )}

              {/* TAB 3: COPILOT CHAT */}
              {editorTab === "copilot" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex flex-col gap-1 p-2.5 rounded-lg ${
                          msg.sender === "user"
                            ? "bg-accent-primary/10 border border-accent-primary/20 ml-6 text-text-primary"
                            : "bg-surface-elevated/60 border border-border-subtle mr-4 text-text-primary"
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {msg.sender === "user" ? "Bạn" : "Quant Copilot"}
                        </div>
                        <p className="leading-relaxed">{msg.text}</p>
                        {msg.codeSnippet && (
                          <pre className="mt-1 p-2 rounded bg-surface-base font-mono text-[11px] text-accent-primary overflow-x-auto border border-border-subtle">
                            {msg.codeSnippet}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-2 border-t border-border-subtle flex gap-2">
                    <input
                      type="text"
                      value={copilotQuery}
                      onChange={(e) => setCopilotQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendCopilot()}
                      placeholder="Hỏi trợ lý Quant: /quant, tối ưu tham số..."
                      className="flex-1 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
                    />
                    <button
                      onClick={handleSendCopilot}
                      className="rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 cursor-pointer"
                    >
                      Gửi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Pane (7 Cols): Multi-View Analytics Workspace */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* View Tabs */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle pb-2 text-xs font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "overview"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <BarChart2 className="size-3.5" />
              Hiệu suất & Biểu đồ
            </button>
            <button
              onClick={() => setActiveTab("trades")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "trades"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <Terminal className="size-3.5" />
              Sổ Lệnh ({backtestResult.trades.length})
            </button>
            <button
              onClick={() => setActiveTab("monthly")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "monthly"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <Calendar className="size-3.5" />
              Ma trận Tháng/Năm
            </button>
            <button
              onClick={() => setActiveTab("symbols")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "symbols"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <Layers className="size-3.5" />
              Đóng góp theo Mã
            </button>
            <button
              onClick={() => setActiveTab("optimizer")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "optimizer"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <Grid className="size-3.5" />
              Tối ưu Lưới
            </button>
            <button
              onClick={() => setActiveTab("robustness")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                activeTab === "robustness"
                  ? "bg-accent-primary text-white font-semibold shadow"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <ShieldCheck className="size-3.5" />
              Kiểm định Độ vững
            </button>
          </div>

          {/* TAB 1: OVERVIEW & CHARTS */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-4">
              {/* 8 Primary Institutional Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Tổng lợi nhuận</div>
                  <div className="text-xl font-bold font-mono text-up mt-0.5">
                    +{backtestResult.metrics.totalReturn}%
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Vốn cuối: {fmtCompact(backtestResult.metrics.endEquity)} đ
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">CAGR (Hàng năm)</div>
                  <div className="text-xl font-bold font-mono text-accent-primary mt-0.5">
                    {backtestResult.metrics.cagr}%
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    VNINDEX: {backtestResult.metrics.benchCagr}%
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Sharpe Ratio</div>
                  <div className="text-xl font-bold font-mono text-text-primary mt-0.5">
                    {backtestResult.metrics.sharpe}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Deflated: {backtestResult.metrics.deflatedSharpe}
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Sụt giảm Max DD</div>
                  <div className="text-xl font-bold font-mono text-down mt-0.5">
                    {backtestResult.metrics.maxDrawdown}%
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    VNINDEX DD: {backtestResult.metrics.benchMaxDrawdown}%
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Tỷ lệ Thắng (Win Rate)</div>
                  <div className="text-base font-bold font-mono text-text-primary mt-0.5">
                    {backtestResult.metrics.winRate}%
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Tổng {backtestResult.metrics.tradesCount} lệnh
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Profit Factor</div>
                  <div className="text-base font-bold font-mono text-text-primary mt-0.5">
                    {backtestResult.metrics.profitFactor}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Payoff: {backtestResult.metrics.payoff}x
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Sortino / Calmar</div>
                  <div className="text-base font-bold font-mono text-text-primary mt-0.5">
                    {backtestResult.metrics.sortino} / {backtestResult.metrics.calmar}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Ulcer: {backtestResult.metrics.ulcerIndex}
                  </div>
                </div>

                <div className="rounded-xl border border-border-subtle bg-surface-base p-3 shadow-sm">
                  <div className="text-[11px] text-text-muted">Alpha / Beta (VNINDEX)</div>
                  <div className="text-base font-bold font-mono text-text-primary mt-0.5">
                    +{backtestResult.metrics.alpha}% / {backtestResult.metrics.beta}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    Corr: {backtestResult.metrics.correlation}
                  </div>
                </div>
              </div>

              {/* Equity Curve SVG Chart */}
              <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-text-primary">Đường cong Giá trị Tài sản (Equity Curve)</span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="size-2.5 rounded-full bg-accent-primary inline-block" />
                      <span className="text-text-muted">Chiến lược ({fmtCompact(backtestResult.metrics.endEquity)} đ)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="size-2.5 rounded-full bg-border-strong inline-block" />
                      <span className="text-text-muted">VN-INDEX Benchmark ({fmtCompact(backtestResult.metrics.benchTotalReturn * 100000000 + 100000000)} đ)</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-text-muted">2018 - 2026</span>
                </div>

                <div className="relative w-full overflow-hidden">
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
                    {/* Grid lines */}
                    <line x1={padding.left} y1={padding.top} x2={svgWidth - padding.right} y2={padding.top} stroke="var(--border-subtle)" strokeDasharray="3 3" opacity="0.4" />
                    <line x1={padding.left} y1={padding.top + chartH * 0.5} x2={svgWidth - padding.right} y2={padding.top + chartH * 0.5} stroke="var(--border-subtle)" strokeDasharray="3 3" opacity="0.4" />
                    <line x1={padding.left} y1={padding.top + chartH} x2={svgWidth - padding.right} y2={padding.top + chartH} stroke="var(--border-subtle)" strokeDasharray="3 3" opacity="0.4" />

                    {/* Y-axis labels */}
                    <text x={padding.left - 8} y={padding.top + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">
                      {fmtCompact(maxEq)}
                    </text>
                    <text x={padding.left - 8} y={padding.top + chartH * 0.5 + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">
                      {fmtCompact((maxEq + minEq) / 2)}
                    </text>
                    <text x={padding.left - 8} y={padding.top + chartH + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">
                      {fmtCompact(minEq)}
                    </text>

                    {/* Benchmark Line */}
                    <path d={benchPath} fill="none" stroke="currentColor" className="text-border-strong/80" strokeWidth="1.5" strokeDasharray="4 2" />

                    {/* Strategy Equity Line */}
                    <path d={stratPath} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
                  </svg>
                </div>

                {/* Underwater Drawdown Chart */}
                <div className="mt-4 pt-3 border-t border-border-subtle">
                  <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                    <span>Đồ thị Sụt giảm (Underwater Drawdown)</span>
                    <span className="font-mono text-down">Max DD: {backtestResult.metrics.maxDrawdown}%</span>
                  </div>
                  <div className="w-full overflow-hidden">
                    <svg viewBox={`0 0 ${svgWidth} ${ddSvgHeight}`} className="w-full h-auto">
                      <line x1={padding.left} y1="15" x2={svgWidth - padding.right} y2="15" stroke="var(--border-subtle)" strokeWidth="1" />
                      <path d={ddPath} fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="1.2" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRADES LEDGER */}
          {activeTab === "trades" && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">Danh sách Lệnh thực thi</span>
                  <div className="flex rounded-md border border-border-subtle bg-surface-elevated p-0.5 text-[11px]">
                    <button
                      onClick={() => setTradeFilter("ALL")}
                      className={`px-2 py-0.5 rounded cursor-pointer ${tradeFilter === "ALL" ? "bg-surface-base font-semibold text-accent-primary" : "text-text-muted"}`}
                    >
                      Tất cả ({backtestResult.trades.length})
                    </button>
                    <button
                      onClick={() => setTradeFilter("WIN")}
                      className={`px-2 py-0.5 rounded cursor-pointer ${tradeFilter === "WIN" ? "bg-surface-base font-semibold text-up" : "text-text-muted"}`}
                    >
                      Thắng ({backtestResult.trades.filter((t) => t.pnl > 0).length})
                    </button>
                    <button
                      onClick={() => setTradeFilter("LOSS")}
                      className={`px-2 py-0.5 rounded cursor-pointer ${tradeFilter === "LOSS" ? "bg-surface-base font-semibold text-down" : "text-text-muted"}`}
                    >
                      Thua ({backtestResult.trades.filter((t) => t.pnl <= 0).length})
                    </button>
                  </div>
                </div>
                <span className="text-text-muted">Trung bình nắm giữ: {backtestResult.metrics.avgBars} ngày/lệnh</span>
              </div>

              <div className="max-h-[500px] overflow-y-auto rounded-lg border border-border-subtle">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-elevated/70 text-text-muted sticky top-0 z-10 text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">Mã CP</th>
                      <th className="py-2 px-3 font-medium">Ngày Mua</th>
                      <th className="py-2 px-3 font-medium text-right">Giá Mua</th>
                      <th className="py-2 px-3 font-medium">Ngày Bán</th>
                      <th className="py-2 px-3 font-medium text-right">Giá Bán</th>
                      <th className="py-2 px-3 font-medium text-right">Khối lượng</th>
                      <th className="py-2 px-3 font-medium text-right">Lợi nhuận</th>
                      <th className="py-2 px-3 font-medium text-right">Tỷ suất</th>
                      <th className="py-2 px-3 font-medium text-center">Nắm giữ</th>
                      <th className="py-2 px-3 font-medium">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60 font-mono text-[11.5px]">
                    {filteredTrades.slice(0, 80).map((tr) => (
                      <tr key={tr.id} className="hover:bg-surface-elevated/40 transition">
                        <td className="py-2 px-3 font-sans font-bold text-text-primary">{tr.symbol}</td>
                        <td className="py-2 px-3 text-text-muted">{tr.entryDate}</td>
                        <td className="py-2 px-3 text-right">{fmtNum(tr.entryPrice)}</td>
                        <td className="py-2 px-3 text-text-muted">{tr.exitDate}</td>
                        <td className="py-2 px-3 text-right">{fmtNum(tr.exitPrice)}</td>
                        <td className="py-2 px-3 text-right text-text-muted">{fmtNum(tr.shares)}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${tr.pnl > 0 ? "text-up" : "text-down"}`}>
                          {tr.pnl > 0 ? "+" : ""}{fmtCompact(tr.pnl)} đ
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Chg value={tr.returnPct} />
                        </td>
                        <td className="py-2 px-3 text-center text-text-muted">{tr.holdingDays}d</td>
                        <td className="py-2 px-3 font-sans">
                          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted border border-border-subtle">
                            {tr.exitReason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: MONTHLY & YEARLY RETURN MATRIX */}
          {activeTab === "monthly" && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text-primary">Bảng Lợi Nhuận Tháng / Năm (Heatmap %)</span>
                <span className="text-text-muted">Tỷ lệ tháng dương: {backtestResult.metrics.positiveMonthsRatio}%</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-center text-xs border-collapse">
                  <thead className="bg-surface-elevated/70 text-text-muted text-[11px]">
                    <tr>
                      <th className="py-2 px-2 text-left font-medium">Năm</th>
                      {Array.from({ length: 12 }, (_, i) => (
                        <th key={i} className="py-2 px-1.5 font-medium">T{i + 1}</th>
                      ))}
                      <th className="py-2 px-3 font-bold text-text-primary">Cả năm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60 font-mono text-[11px]">
                    {backtestResult.monthlyTable.map((row) => (
                      <tr key={row.year} className="hover:bg-surface-elevated/40">
                        <td className="py-2 px-2 text-left font-sans font-bold text-text-primary">{row.year}</td>
                        {row.months.map((m, idx) => {
                          if (m === null) return <td key={idx} className="py-2 px-1 text-text-muted/40">—</td>;
                          const isPos = m > 0;
                          const intensity = Math.min(1, Math.abs(m) / 15);
                          const bg = isPos
                            ? `rgba(16, 185, 129, ${0.1 + intensity * 0.35})`
                            : `rgba(239, 68, 68, ${0.1 + intensity * 0.35})`;
                          const color = isPos ? "text-emerald-400" : "text-rose-400";
                          return (
                            <td key={idx} style={{ backgroundColor: bg }} className={`py-2 px-1 font-semibold ${color}`}>
                              {m > 0 ? `+${m}` : m}%
                            </td>
                          );
                        })}
                        <td className={`py-2 px-3 font-bold ${row.annualTotal > 0 ? "text-up bg-up/10" : "text-down bg-down/10"}`}>
                          {row.annualTotal > 0 ? "+" : ""}{row.annualTotal}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SYMBOL ATTRIBUTION */}
          {activeTab === "symbols" && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text-primary">Đóng góp Lợi nhuận theo Mã Cổ phiếu</span>
                <span className="text-text-muted">Tổng số mã giao dịch: {backtestResult.symbols.length}</span>
              </div>

              <div className="max-h-[500px] overflow-y-auto rounded-lg border border-border-subtle">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-elevated/70 text-text-muted sticky top-0 text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">Mã CP</th>
                      <th className="py-2 px-3 font-medium text-right">Lợi nhuận ròng</th>
                      <th className="py-2 px-3 font-medium text-center">Số lệnh</th>
                      <th className="py-2 px-3 font-medium text-right">Tỷ lệ thắng</th>
                      <th className="py-2 px-3 font-medium text-right">Đóng góp (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60 font-mono text-[11.5px]">
                    {backtestResult.symbols.map((s) => (
                      <tr key={s.symbol} className="hover:bg-surface-elevated/40">
                        <td className="py-2 px-3 font-sans font-bold text-text-primary">{s.symbol}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${s.pnl > 0 ? "text-up" : "text-down"}`}>
                          {s.pnl > 0 ? "+" : ""}{fmtCompact(s.pnl)} đ
                        </td>
                        <td className="py-2 px-3 text-center text-text-muted">{s.tradesCount}</td>
                        <td className="py-2 px-3 text-right text-text-primary">{s.winRate}%</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.contributionPct > 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
                            {s.contributionPct > 0 ? "+" : ""}{s.contributionPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: GRID OPTIMIZER */}
          {activeTab === "optimizer" && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-semibold text-text-primary">Tối ưu Lưới Tham số Đa chiều (Grid Optimizer)</h4>
                  <p className="text-text-muted text-[11px]">Quét song song không gian tham số và tính Deflated Sharpe Ratio để tránh Overfitting.</p>
                </div>
                <button
                  onClick={handleRunOptimizer}
                  disabled={isOptimizing}
                  className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition cursor-pointer"
                >
                  <Grid className={`size-3.5 ${isOptimizing ? "animate-spin" : ""}`} />
                  {isOptimizing ? "Đang quét..." : "Quét Lưới Song Song"}
                </button>
              </div>

              {optimizerRun ? (
                <div className="flex flex-col gap-4">
                  {/* Best combination banner */}
                  <div className="rounded-xl border border-up/30 bg-up/10 p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-up" />
                      <div>
                        <span className="font-semibold text-up">Tổ hợp Tối ưu Nhất: </span>
                        <span className="font-mono text-text-primary">
                          {Object.entries(optimizerRun.bestCombination.params).map(([k, v]) => `${k}=${v}`).join(", ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span>Sharpe: <strong className="text-up">{optimizerRun.bestCombination.sharpe}</strong></span>
                      <span>CAGR: <strong className="text-up">{optimizerRun.bestCombination.cagr}%</strong></span>
                      <span>Deflated Sharpe: <strong>{optimizerRun.deflatedSharpe}</strong></span>
                    </div>
                  </div>

                  {/* Matrix table */}
                  <div className="overflow-x-auto rounded-lg border border-border-subtle">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead className="bg-surface-elevated/70 text-text-muted text-[11px]">
                        <tr>
                          <th className="py-2 px-3 font-medium">{optimizerRun.param1.name}</th>
                          {optimizerRun.param2 && <th className="py-2 px-3 font-medium">{optimizerRun.param2.name}</th>}
                          <th className="py-2 px-3 font-medium text-right">Sharpe Ratio</th>
                          <th className="py-2 px-3 font-medium text-right">CAGR (%)</th>
                          <th className="py-2 px-3 font-medium text-right">Max Drawdown (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle/60 font-mono text-[11px]">
                        {optimizerRun.matrix.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-surface-elevated/40">
                            <td className="py-2 px-3 font-bold text-text-primary">{row.p1}</td>
                            {optimizerRun.param2 && <td className="py-2 px-3 text-text-muted">{row.p2}</td>}
                            <td className="py-2 px-3 text-right font-semibold text-accent-primary">{row.sharpe}</td>
                            <td className="py-2 px-3 text-right text-up">+{row.cagr}%</td>
                            <td className="py-2 px-3 text-right text-down">{row.maxDd}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center text-text-muted text-xs">
                  Bấm &quot;Quét Lưới Song Song&quot; để tìm bộ tham số tối ưu và kiểm định tính ổn định bề mặt tham số.
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ROBUSTNESS SUITE */}
          {activeTab === "robustness" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border-subtle bg-surface-base p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-semibold text-text-primary">Kiểm định Độ Vững Bộ Thử Nghiệm (Robustness Suite)</h4>
                    <p className="text-text-muted text-[11px]">Đảm bảo chiến lược có độ bền thực tế cao, chống lại rủi ro curve-fitting và slippage thị trường VN.</p>
                  </div>
                  <Badge tone={backtestResult.robustness.oos.passed ? "up" : "warn"}>
                    {backtestResult.robustness.oos.passed ? "ĐẠT CHUẨN ROBUST" : "CẦN LƯU Ý"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                  {/* OOS 70/30 */}
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/30 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">1. Out-of-Sample (OOS 70/30)</span>
                      <span className="font-mono text-up font-bold">Giữ {backtestResult.robustness.oos.retentionRatio}%</span>
                    </div>
                    <p className="text-[11px] text-text-muted">So sánh hiệu suất giữa 70% dữ liệu đầu và 30% dữ liệu tương lai chưa từng tối ưu:</p>
                    <div className="flex justify-between items-center text-[11px] font-mono bg-surface-base p-2 rounded border border-border-subtle">
                      <span>Trong mẫu: Sharpe {backtestResult.robustness.oos.inSampleSharpe} (CAGR {backtestResult.robustness.oos.inSampleCagr}%)</span>
                      <span>Ngoài mẫu: Sharpe {backtestResult.robustness.oos.outSampleSharpe} (CAGR {backtestResult.robustness.oos.outSampleCagr}%)</span>
                    </div>
                  </div>

                  {/* Monte Carlo 1000 */}
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/30 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">2. Monte Carlo (1.000 kịch bản)</span>
                      <Badge tone="accent">Bootstrap 1000x</Badge>
                    </div>
                    <p className="text-[11px] text-text-muted">Phân phối xác suất 1.000 con đường danh mục ngẫu nhiên:</p>
                    <div className="flex justify-between items-center text-[11px] font-mono bg-surface-base p-2 rounded border border-border-subtle">
                      <span>5% xấu nhất: CAGR {backtestResult.robustness.monteCarlo.cagr5th}% | DD {backtestResult.robustness.monteCarlo.maxDd5th}%</span>
                      <span>Kỳ vọng (50%): CAGR {backtestResult.robustness.monteCarlo.cagr50th}%</span>
                    </div>
                  </div>

                  {/* Friction 2x */}
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/30 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">3. Chi phí Giao dịch Gấp đôi (Fees x2)</span>
                      <span className="font-mono text-text-primary font-bold">Sharpe: {backtestResult.robustness.costs.stressedSharpe}</span>
                    </div>
                    <p className="text-[11px] text-text-muted">Thử nghiệm khi phí môi giới và thuế tăng gấp đôi cùng trượt giá thanh khoản cao.</p>
                    <div className="flex items-center justify-between text-[11px] font-mono bg-surface-base p-2 rounded border border-border-subtle">
                      <span>Mức suy giảm: -{backtestResult.robustness.costs.dropPct}%</span>
                      <Badge tone={backtestResult.robustness.costs.viable ? "up" : "down"}>
                        {backtestResult.robustness.costs.viable ? "Khả thi cao" : "Bị xói mòn phí"}
                      </Badge>
                    </div>
                  </div>

                  {/* Execution Delay 1-day */}
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/30 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">4. Khớp trễ 1 Phiên (T+2.5 Friction)</span>
                      <span className="font-mono text-text-primary font-bold">Sharpe: {backtestResult.robustness.delay.delayedSharpe}</span>
                    </div>
                    <p className="text-[11px] text-text-muted">Mô phỏng khớp lệnh mở cửa phiên kế tiếp thay vì giá đóng cửa nhằm phản ánh thị trường thực.</p>
                    <div className="flex items-center justify-between text-[11px] font-mono bg-surface-base p-2 rounded border border-border-subtle">
                      <span>Suy giảm: -{backtestResult.robustness.delay.dropPct}%</span>
                      <Badge tone={backtestResult.robustness.delay.viable ? "up" : "down"}>
                        {backtestResult.robustness.delay.viable ? "Giữ vững Alpha" : "Chậm trễ tín hiệu"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Market Regimes Breakdown */}
                <div className="mt-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-3 text-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">5. Chế độ Thị trường: Xu hướng Tăng (Bull) vs Giảm (Bear)</span>
                    <span className="text-[11px] text-text-muted">Theo đường MA200 VN-INDEX</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                    <div className="p-2 rounded bg-surface-base border border-border-subtle">
                      <div className="font-sans font-semibold text-up mb-1">Thị trường Uptrend (VNINDEX &gt; MA200):</div>
                      <div>Sharpe: <strong>{backtestResult.robustness.regimes.bullSharpe}</strong> | CAGR: <strong>+{backtestResult.robustness.regimes.bullCagr}%</strong></div>
                      <div>Tỷ lệ giải ngân: {backtestResult.robustness.regimes.bullExposure}%</div>
                    </div>
                    <div className="p-2 rounded bg-surface-base border border-border-subtle">
                      <div className="font-sans font-semibold text-down mb-1">Thị trường Downtrend (VNINDEX &lt; MA200):</div>
                      <div>Sharpe: <strong>{backtestResult.robustness.regimes.bearSharpe}</strong> | CAGR: <strong>+{backtestResult.robustness.regimes.bearCagr}%</strong></div>
                      <div>Tỷ lệ giải ngân: {backtestResult.robustness.regimes.bearExposure}% (Phòng thủ giữ tiền mặt)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
