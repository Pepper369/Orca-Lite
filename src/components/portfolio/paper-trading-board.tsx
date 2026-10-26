"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  PieChart,
  RefreshCw,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  X,
  History,
  Briefcase,
  Layers,
  Sparkles,
  Share2,
} from "lucide-react";
import { Badge, Chg, Panel, fmtNum } from "@/components/ui";
import {
  loadPaperAccount,
  placePaperOrder,
  cancelPaperOrder,
  resetPaperAccount,
  adjustPaperCash,
  setTPlusRule,
  calculatePortfolioMetrics,
  matchPendingOrdersWithPrices,
  subscribePaperAccount,
  DEFAULT_INITIAL_CASH,
  type PaperAccount,
  type PortfolioMetrics,
  type OrderSide,
  type OrderType,
} from "@/lib/paper-trading";

const POPULAR_SYMBOLS = ["HPG", "SSI", "VNM", "FPT", "MWG", "TCB", "MBB", "DGC", "VHM", "VIC"];

function fmtVnd(num: number | null | undefined): string {
  if (num == null || isNaN(num)) return "0 đ";
  return `${Math.round(num).toLocaleString("vi-VN")} đ`;
}

function fmtPct(num: number | null | undefined): string {
  if (num == null || isNaN(num)) return "0.00%";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function normalizePrice(p: number): number {
  if (p <= 0) return 0;
  return p < 1000 ? Math.round(p * 1000) : Math.round(p);
}

export function PaperTradingBoard() {
  const [account, setAccount] = useState<PaperAccount>(() => loadPaperAccount());
  const [priceMap, setPriceMap] = useState<Record<string, { price: number; changePercent?: number | null }>>({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);

  // Form đặt lệnh
  const [symbol, setSymbol] = useState("HPG");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MP");
  const [sharesInput, setSharesInput] = useState("1000");
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [orderNotice, setOrderNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Quản lý modal xác nhận
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddCashModal, setShowAddCashModal] = useState(false);
  const [addCashAmount, setAddCashAmount] = useState(100_000_000);

  // Tab sổ lệnh / lịch sử
  const [activeBottomTab, setActiveBottomTab] = useState<"holdings" | "orders" | "history">("holdings");

  // Đồng bộ account từ storage
  useEffect(() => {
    const handleUpdate = (acc: PaperAccount) => setAccount(acc);
    return subscribePaperAccount(handleUpdate);
  }, []);

  // Danh sách các mã cần kéo giá: mã đang giữ + mã trong sổ lệnh pending + mã đang chọn đặt lệnh
  const symbolsToWatch = useMemo(() => {
    const syms = new Set<string>();
    syms.add(symbol.toUpperCase());
    for (const s of POPULAR_SYMBOLS) syms.add(s);
    for (const s of Object.keys(account.holdings)) syms.add(s);
    for (const o of account.orders) {
      if (o.status === "PENDING") syms.add(o.symbol);
    }
    return Array.from(syms).filter(Boolean);
  }, [account, symbol]);

  // Kéo giá realtime từ Data Hub marks endpoint
  const fetchQuotes = useCallback(async () => {
    if (!symbolsToWatch.length) return;
    setIsLoadingQuotes(true);
    try {
      const positions = symbolsToWatch.map((s) => ({ assetType: "stock", symbol: s }));
      const res = await fetch("/api/v1/portfolio/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        rows?: Array<{
          symbol: string;
          price: number;
          changePercent?: number | null;
        }>;
      };
      if (data.rows?.length) {
        const next: Record<string, { price: number; changePercent?: number | null }> = {};
        const numericPrices: Record<string, number> = {};
        for (const r of data.rows) {
          const norm = normalizePrice(r.price);
          next[r.symbol] = { price: norm, changePercent: r.changePercent };
          numericPrices[r.symbol] = norm;
        }
        setPriceMap((prev) => ({ ...prev, ...next }));

        // Tự động kiểm tra khớp lệnh LO đang chờ nếu giá thị trường thoả điều kiện
        matchPendingOrdersWithPrices(numericPrices);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [symbolsToWatch]);

  // Polling giá mỗi 8 giây
  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 8_000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  // Tính toán số liệu tổng thể danh mục
  const metrics: PortfolioMetrics = useMemo(() => {
    return calculatePortfolioMetrics(account, priceMap);
  }, [account, priceMap]);

  // Giá thị trường của mã đang chọn đặt lệnh
  const activeQuote = priceMap[symbol.toUpperCase()];
  const currentSymbolPrice = activeQuote?.price || 0;
  const currentCeiling = currentSymbolPrice > 0 ? Math.round(currentSymbolPrice * 1.07) : undefined;
  const currentFloor = currentSymbolPrice > 0 ? Math.round(currentSymbolPrice * 0.93) : undefined;

  // Tính toán trước chi phí lệnh
  const sharesNum = parseInt(sharesInput, 10) || 0;
  const targetPrice = orderType === "MP" ? currentSymbolPrice : parseInt(customPriceInput, 10) || currentSymbolPrice;
  const estimatedGross = sharesNum * targetPrice;
  const estimatedFee = Math.round(estimatedGross * 0.001);
  const estimatedTax = side === "SELL" ? Math.round(estimatedGross * 0.001) : 0;
  const estimatedTotal = side === "BUY" ? estimatedGross + estimatedFee : estimatedGross - estimatedFee - estimatedTax;

  // Xử lý gửi lệnh
  const handlePlaceOrder = () => {
    setOrderNotice(null);
    if (sharesNum <= 0) {
      setOrderNotice({ type: "error", message: "Vui lòng nhập khối lượng lớn hơn 0." });
      return;
    }
    if (sharesNum % 100 !== 0) {
      setOrderNotice({ type: "error", message: "Khối lượng phải là bội số của 100 (chuẩn sàn VN)." });
      return;
    }
    if (currentSymbolPrice <= 0) {
      setOrderNotice({ type: "error", message: `Chưa có giá thị trường cho mã ${symbol}. Vui lòng thử lại sau vài giây.` });
      return;
    }

    const price = orderType === "MP" ? currentSymbolPrice : targetPrice;

    const res = placePaperOrder({
      symbol,
      side,
      orderType,
      shares: sharesNum,
      price,
      currentMarketPrice: currentSymbolPrice,
      ceilingPrice: currentCeiling,
      floorPrice: currentFloor,
    });

    if (res.success) {
      setOrderNotice({ type: "success", message: res.message });
    } else {
      setOrderNotice({ type: "error", message: res.message });
    }
  };

  // Nhanh chóng chọn bán một mã từ danh mục
  const handleQuickSell = (sym: string, availableShares: number) => {
    setSymbol(sym);
    setSide("SELL");
    setOrderType("MP");
    setSharesInput(String(availableShares));
    setOrderNotice(null);
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  const cashPct = metrics.nav > 0 ? (metrics.totalCash / metrics.nav) * 100 : 100;
  const stockPct = metrics.nav > 0 ? (metrics.stockValue / metrics.nav) * 100 : 0;

  const handleSharePerformance = () => {
    const text = `🌊 Orca-Lite Paper Trading (500M)
• NAV: ${fmtVnd(metrics.nav)} (${fmtPct(metrics.totalPnlPct)})
• Tiền mặt: ${fmtVnd(account.availableCash)}
• Cổ phiếu: ${fmtVnd(metrics.stockValue)} (${metrics.holdings.length} mã)
• Lãi/lỗ tạm tính: ${metrics.unrealizedPnl >= 0 ? "+" : ""}${fmtVnd(metrics.unrealizedPnl)}
• Lãi đã chốt: ${metrics.realizedPnl >= 0 ? "+" : ""}${fmtVnd(metrics.realizedPnl)} (Winrate: ${metrics.winRate.toFixed(0)}%)
👉 Thực hành đầu tư cổ phiếu tại: https://orcalite.vn/portfolio`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setOrderNotice({ type: "success", message: "Đã sao chép tóm tắt thành tích danh mục vào Clipboard!" });
    }
  };

  // Huỷ lệnh LO chờ khớp
  const handleCancelOrder = (id: string) => {
    const res = cancelPaperOrder(id);
    if (res.success) {
      setOrderNotice({ type: "success", message: res.message });
    } else {
      setOrderNotice({ type: "error", message: res.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & KPI Ribbon: Tổng quan tài sản 500M */}
      <Panel
        pad={true}
        className="border-border-subtle bg-surface-elevated"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-2 rounded-full bg-positive animate-pulse" />
            <span className="text-[13px] font-semibold text-text-primary">
              Tài Khoản Giao Dịch Ảo (Mô Phỏng 500M)
            </span>
            <Badge tone="accent">
              {account.tPlusRule === "T0" ? "T+0 Lướt sóng" : "T+2.5 Chuẩn sàn"}
            </Badge>
          </div>
        }
        subtitle={
          <span className="text-[11px] text-text-muted">
            Vốn khởi điểm: <strong className="num text-text-primary">{fmtVnd(account.initialCash)}</strong> · Lợi nhuận ròng:{" "}
            <span className={`num font-medium ${metrics.totalPnl >= 0 ? "text-positive" : "text-negative"}`}>
              {metrics.totalPnl >= 0 ? "+" : ""}
              {fmtVnd(metrics.totalPnl)}
            </span>
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => fetchQuotes()}
              disabled={isLoadingQuotes}
              title="Làm mới giá thị trường"
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-base px-2.5 py-1 text-[11px] font-medium text-text-primary hover:border-border-default transition"
            >
              <RefreshCw className={`size-3 ${isLoadingQuotes ? "animate-spin text-accent-primary" : ""}`} />
              <span>Cập nhật giá</span>
            </button>

            <button
              onClick={() => {
                const nextRule = account.tPlusRule === "T0" ? "T2_5" : "T0";
                setTPlusRule(nextRule);
              }}
              title="Chuyển đổi quy tắc thanh toán T+0 / T+2.5"
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-base px-2.5 py-1 text-[11px] font-medium text-text-primary hover:border-border-default transition"
            >
              <Clock className="size-3 text-warning" />
              <span>{account.tPlusRule === "T0" ? "Đổi sang T+2.5" : "Đổi sang T+0"}</span>
            </button>

            <button
              onClick={() => setShowAddCashModal(true)}
              title="Bơm thêm vốn ảo"
              className="inline-flex items-center gap-1 rounded-md border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive hover:bg-positive/20 transition"
            >
              <PlusCircle className="size-3" />
              <span>Nạp vốn</span>
            </button>

            <button
              onClick={handleSharePerformance}
              title="Chia sẻ thành tích danh mục"
              className="inline-flex items-center gap-1 rounded-md border border-accent-primary/30 bg-accent-primary/10 px-2.5 py-1 text-[11px] font-medium text-accent-primary hover:bg-accent-primary/20 transition"
            >
              <Share2 className="size-3" />
              <span>Chia sẻ</span>
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              title="Khôi phục tài khoản về 500 triệu ban đầu"
              className="inline-flex items-center gap-1 rounded-md border border-negative/30 bg-negative/10 px-2.5 py-1 text-[11px] font-medium text-negative hover:bg-negative/20 transition"
            >
              <RefreshCw className="size-3" />
              <span>Đặt lại 500M</span>
            </button>
          </div>
        }
      >
        {/* NAV Value display */}
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight num text-text-primary">
              {fmtVnd(metrics.nav)}
            </span>
            <Chg value={metrics.totalPnlPct} className="text-[13px] sm:text-[14px]" />
          </div>
        </div>

        {/* 4 Cards Thống kê tài sản */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-0.5">
              <span>Tiền mặt khả dụng</span>
              <Wallet className="size-3.5 text-positive" />
            </div>
            <div className="num text-[14px] sm:text-[15px] font-semibold text-text-primary">
              {fmtVnd(account.availableCash)}
            </div>
            {account.lockedCash > 0 && (
              <div className="num text-[10px] text-warning mt-0.5">
                Khoá chờ: {fmtVnd(account.lockedCash)}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-0.5">
              <span>Giá trị cổ phiếu</span>
              <Briefcase className="size-3.5 text-accent-primary" />
            </div>
            <div className="num text-[14px] sm:text-[15px] font-semibold text-text-primary">
              {fmtVnd(metrics.stockValue)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              Đang nắm: <strong className="num text-text-primary">{metrics.holdings.length}</strong> mã CP
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-0.5">
              <span>Lãi/Lỗ tạm tính (Holding)</span>
              {metrics.unrealizedPnl >= 0 ? (
                <ArrowUpRight className="size-3.5 text-positive" />
              ) : (
                <ArrowDownRight className="size-3.5 text-negative" />
              )}
            </div>
            <div
              className={`num text-[14px] sm:text-[15px] font-semibold ${
                metrics.unrealizedPnl >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {metrics.unrealizedPnl >= 0 ? "+" : ""}
              {fmtVnd(metrics.unrealizedPnl)}
            </div>
            <div className="mt-0.5">
              <Chg value={metrics.unrealizedPnlPct} className="text-[11px]" />
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-0.5">
              <span>Lãi/Lỗ đã chốt & Winrate</span>
              <History className="size-3.5 text-warning" />
            </div>
            <div
              className={`num text-[14px] sm:text-[15px] font-semibold ${
                metrics.realizedPnl >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {metrics.realizedPnl >= 0 ? "+" : ""}
              {fmtVnd(metrics.realizedPnl)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              Thắng: <span className="num text-text-primary">{metrics.winTrades}/{metrics.totalTrades}</span> ({metrics.winRate.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* Thanh Phân Bổ Cấu Trúc Tài Sản */}
        <div className="mt-3.5 pt-3 border-t border-border-subtle/60">
          <div className="flex flex-wrap items-center justify-between text-[11px] text-text-muted mb-1.5 gap-1">
            <span className="font-medium text-text-primary flex items-center gap-1">
              <PieChart className="size-3 text-accent-primary" />
              Phân bổ tài sản:
            </span>
            <span className="num">
              Tiền mặt: <strong className="text-text-primary">{cashPct.toFixed(1)}%</strong> · Cổ phiếu: <strong className="text-text-primary">{stockPct.toFixed(1)}%</strong>
            </span>
          </div>

          {/* Stacked Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-surface-base overflow-hidden flex border border-border-subtle/50">
            <div
              style={{ width: `${cashPct}%` }}
              title={`Tiền mặt: ${fmtVnd(metrics.totalCash)} (${cashPct.toFixed(1)}%)`}
              className="bg-accent-primary h-full transition-all duration-300"
            />
            {metrics.holdings.map((h, idx) => {
              const colors = ["bg-positive", "bg-warning", "bg-indigo-400", "bg-sky-400", "bg-purple-400", "bg-pink-400"];
              const c = colors[idx % colors.length];
              return (
                <div
                  key={h.symbol}
                  style={{ width: `${h.weightPct}%` }}
                  title={`${h.symbol}: ${fmtVnd(h.marketValue)} (${h.weightPct.toFixed(1)}%)`}
                  className={`${c} h-full transition-all duration-300 border-l border-surface-base`}
                />
              );
            })}
          </div>

          {/* Legend chips */}
          <div className="flex flex-wrap gap-2.5 mt-2 text-[10.5px]">
            <span className="inline-flex items-center gap-1 text-text-muted">
              <span className="size-1.5 rounded-full bg-accent-primary" />
              Tiền mặt: <span className="num font-medium text-text-primary">{cashPct.toFixed(1)}%</span>
            </span>
            {metrics.holdings.slice(0, 6).map((h, idx) => {
              const dotColors = ["bg-positive", "bg-warning", "bg-indigo-400", "bg-sky-400", "bg-purple-400", "bg-pink-400"];
              return (
                <span key={h.symbol} className="inline-flex items-center gap-1 text-text-muted">
                  <span className={`size-1.5 rounded-full ${dotColors[idx % dotColors.length]}`} />
                  <strong className="num text-text-primary">{h.symbol}</strong>: <span className="num">{h.weightPct.toFixed(1)}%</span>
                </span>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* 2. Khung Đặt Lệnh & Bảng Danh mục */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Phiếu đặt lệnh: 5 Cột trên Desktop */}
        <Panel
          pad={true}
          className="lg:col-span-5 border-border-subtle bg-surface-elevated"
          title={
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-accent-primary" />
              <span className="text-[13px] font-semibold text-text-primary">Phiếu Đặt Lệnh</span>
            </div>
          }
          right={
            <div className="flex rounded-md bg-surface-base p-0.5 border border-border-subtle">
              <button
                type="button"
                onClick={() => setSide("BUY")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition ${
                  side === "BUY"
                    ? "bg-positive/20 text-positive border border-positive/30 font-bold"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                MUA
              </button>
              <button
                type="button"
                onClick={() => setSide("SELL")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition ${
                  side === "SELL"
                    ? "bg-negative/20 text-negative border border-negative/30 font-bold"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                BÁN
              </button>
            </div>
          }
        >
          {/* Quick Symbol Chips */}
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-medium">Mã gợi ý:</div>
            <div className="flex flex-wrap gap-1">
              {POPULAR_SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSymbol(s);
                    setOrderNotice(null);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] num font-medium transition ${
                    symbol.toUpperCase() === s
                      ? "bg-accent-primary/15 border border-accent-primary/40 text-accent-primary"
                      : "bg-surface-base border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-default"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1 font-medium">
                Mã chứng khoán:
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setOrderNotice(null);
                }}
                placeholder="Nhập mã (VD: HPG, SSI...)"
                className="w-full uppercase num font-bold px-3 py-1.5 rounded-md border border-border-subtle bg-surface-base text-text-primary focus:outline-none focus:border-accent-primary text-[13px]"
              />

              {/* Live quote grid */}
              {currentSymbolPrice > 0 ? (
                <div className="mt-1.5 p-2 rounded-md border border-border-subtle bg-surface-base/80 grid grid-cols-4 gap-1.5 text-center text-[11px]">
                  <div>
                    <div className="text-[10px] text-text-muted">Giá khớp</div>
                    <div className="num font-bold text-accent-primary">
                      {fmtNum(currentSymbolPrice, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">Thay đổi</div>
                    <Chg value={activeQuote?.changePercent} className="text-[11px]" />
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">Trần (+7%)</div>
                    <div className="num font-medium text-purple-400">
                      {fmtNum(currentCeiling, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted">Sàn (-7%)</div>
                    <div className="num font-medium text-cyan-400">
                      {fmtNum(currentFloor, 0)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-warning flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  Đang đồng bộ giá mã {symbol}...
                </div>
              )}
            </div>

            {/* Loại lệnh: MP vs LO */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1 font-medium">
                Loại lệnh:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOrderType("MP")}
                  className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition ${
                    orderType === "MP"
                      ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                      : "border-border-subtle bg-surface-base text-text-muted hover:text-text-primary"
                  }`}
                >
                  Lệnh Thị Trường (MP)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderType("LO");
                    if (!customPriceInput && currentSymbolPrice > 0) {
                      setCustomPriceInput(String(currentSymbolPrice));
                    }
                  }}
                  className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition ${
                    orderType === "LO"
                      ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                      : "border-border-subtle bg-surface-base text-text-muted hover:text-text-primary"
                  }`}
                >
                  Lệnh Giới Hạn (LO)
                </button>
              </div>
            </div>

            {/* Giá LO */}
            {orderType === "LO" && (
              <div>
                <label className="block text-[11px] text-text-muted mb-1 font-medium">
                  Mức giá đặt (VND):
                </label>
                <input
                  type="number"
                  step="100"
                  value={customPriceInput}
                  onChange={(e) => setCustomPriceInput(e.target.value)}
                  placeholder="Nhập giá LO (VD: 20950)"
                  className="w-full num font-bold px-3 py-1.5 rounded-md border border-border-subtle bg-surface-base text-text-primary focus:outline-none focus:border-accent-primary text-[13px]"
                />
              </div>
            )}

            {/* Khối lượng */}
            <div>
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <label className="text-text-muted font-medium">Khối lượng (Lô 100):</label>
                {side === "SELL" && account.holdings[symbol] && (
                  <span className="text-text-muted">
                    Khả dụng: <strong className="num text-text-primary">{fmtNum(account.holdings[symbol].availableShares, 0)}</strong> CP
                  </span>
                )}
              </div>
              <input
                type="number"
                step="100"
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                placeholder="Khối lượng (100, 500, 1000...)"
                className="w-full num font-bold px-3 py-1.5 rounded-md border border-border-subtle bg-surface-base text-text-primary focus:outline-none focus:border-accent-primary text-[13px]"
              />

              {/* Quick Qty buttons */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[100, 500, 1000, 2000, 5000].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setSharesInput(String(qty))}
                    className="px-2 py-0.5 rounded text-[10.5px] num bg-surface-base border border-border-subtle text-text-muted hover:text-text-primary transition"
                  >
                    +{qty}
                  </button>
                ))}
                {side === "BUY" && currentSymbolPrice > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const maxAffordable = Math.floor(account.availableCash / (currentSymbolPrice * 1.001 * 100)) * 100;
                      if (maxAffordable > 0) setSharesInput(String(maxAffordable));
                    }}
                    className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/30"
                  >
                    Tối đa
                  </button>
                )}
                {side === "SELL" && account.holdings[symbol] && (
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(account.holdings[symbol].availableShares))}
                    className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-negative/10 text-negative border border-negative/30"
                  >
                    Bán hết
                  </button>
                )}
              </div>
            </div>

            {/* Chi tiết chi phí */}
            <div className="p-2.5 rounded-md border border-border-subtle bg-surface-base/60 space-y-1 text-[11px]">
              <div className="flex justify-between text-text-muted">
                <span>Giá trị lệnh:</span>
                <span className="num font-semibold text-text-primary">{fmtVnd(estimatedGross)}</span>
              </div>
              <div className="flex justify-between text-text-muted text-[10.5px]">
                <span>Phí giao dịch (0.1%):</span>
                <span className="num text-text-primary">{fmtVnd(estimatedFee)}</span>
              </div>
              {side === "SELL" && (
                <div className="flex justify-between text-text-muted text-[10.5px]">
                  <span>Thuế TNCN bán (0.1%):</span>
                  <span className="num text-text-primary">{fmtVnd(estimatedTax)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-primary font-semibold pt-1 border-t border-border-subtle/50 text-[12px]">
                <span>{side === "BUY" ? "Tổng tiền cần trả:" : "Tổng tiền thực nhận:"}</span>
                <span className={`num font-bold ${side === "BUY" ? "text-positive" : "text-accent-primary"}`}>
                  {fmtVnd(estimatedTotal)}
                </span>
              </div>
            </div>

            {/* Thông báo kết quả */}
            {orderNotice && (
              <div
                className={`p-2.5 rounded-md text-[11px] flex items-start gap-1.5 ${
                  orderNotice.type === "success"
                    ? "bg-positive/10 border border-positive/30 text-positive"
                    : "bg-negative/10 border border-negative/30 text-negative"
                }`}
              >
                {orderNotice.type === "success" ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-positive mt-0.5" />
                ) : (
                  <AlertCircle className="size-3.5 shrink-0 text-negative mt-0.5" />
                )}
                <span>{orderNotice.message}</span>
              </div>
            )}

            {/* Nút Thực hiện lệnh */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={sharesNum <= 0 || currentSymbolPrice <= 0}
              className={`w-full py-2 rounded-md text-[12px] font-bold tracking-wide uppercase transition ${
                side === "BUY"
                  ? "bg-positive text-surface-base hover:bg-positive/90 active:scale-[0.99]"
                  : "bg-negative text-white hover:bg-negative/90 active:scale-[0.99]"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {side === "BUY" ? "Xác Nhận Mua Cổ Phiếu" : "Xác Nhận Bán Cổ Phiếu"}
            </button>
          </div>
        </Panel>

        {/* Bảng Danh mục & Sổ lệnh: 7 Cột trên Desktop */}
        <Panel
          pad={true}
          className="lg:col-span-7 border-border-subtle bg-surface-elevated flex flex-col"
          title={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveBottomTab("holdings")}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  activeBottomTab === "holdings"
                    ? "bg-surface-base text-accent-primary font-bold border border-border-subtle"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Danh mục ({metrics.holdings.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab("orders")}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  activeBottomTab === "orders"
                    ? "bg-surface-base text-accent-primary font-bold border border-border-subtle"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Sổ lệnh ({account.orders.filter((o) => o.status === "PENDING").length} chờ)
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab("history")}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                  activeBottomTab === "history"
                    ? "bg-surface-base text-accent-primary font-bold border border-border-subtle"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Nhật ký khớp ({account.history.length})
              </button>
            </div>
          }
        >
          {/* TAB 1: DANH MỤC NẮM GIỮ */}
          {activeBottomTab === "holdings" && (
            <div className="flex-1 overflow-x-auto">
              {metrics.holdings.length === 0 ? (
                <div className="py-12 text-center text-text-muted">
                  <Briefcase className="size-8 mx-auto text-text-muted/40 mb-1.5" />
                  <p className="text-[12px] font-medium text-text-primary">Danh mục cổ phiếu đang trống</p>
                  <p className="text-[11px] text-text-muted mt-0.5 max-w-xs mx-auto">
                    Đặt lệnh Mua thử các mã tiêu biểu như HPG, SSI, VNM với số vốn được cấp 500 triệu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                        <th className="pb-1.5 font-medium">Mã</th>
                        <th className="pb-1.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-1.5 font-medium text-right">Giá vốn</th>
                        <th className="pb-1.5 font-medium text-right">Giá HT</th>
                        <th className="pb-1.5 font-medium text-right">Giá trị</th>
                        <th className="pb-1.5 font-medium text-right">uPnL</th>
                        <th className="pb-1.5 font-medium text-right">Tỷ trọng</th>
                        <th className="pb-1.5 font-medium text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                      {metrics.holdings.map((h) => {
                        const isProfitable = h.unrealizedPnl >= 0;
                        return (
                          <tr key={h.symbol} className="hover:bg-surface-base/50 transition">
                            <td className="py-2.5 font-bold num text-text-primary">
                              {h.symbol}
                            </td>
                            <td className="py-2.5 num text-right text-text-primary">
                              <div>{fmtNum(h.shares, 0)}</div>
                              {account.tPlusRule === "T2_5" && h.availableShares < h.shares && (
                                <div className="text-[9.5px] text-warning">
                                  Khả dụng: {fmtNum(h.availableShares, 0)}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 num text-right text-text-muted">
                              {fmtNum(h.avgCost, 0)}
                            </td>
                            <td className="py-2.5 num text-right font-medium text-text-primary">
                              {fmtNum(h.currentPrice, 0)}
                              {h.changePercent != null && (
                                <Chg value={h.changePercent} className="block text-[10px]" />
                              )}
                            </td>
                            <td className="py-2.5 num text-right font-medium text-text-primary">
                              {fmtVnd(h.marketValue)}
                            </td>
                            <td
                              className={`py-2.5 num text-right font-bold ${
                                isProfitable ? "text-positive" : "text-negative"
                              }`}
                            >
                              <div>
                                {isProfitable ? "+" : ""}
                                {fmtVnd(h.unrealizedPnl)}
                              </div>
                              <div className="text-[10px]">
                                {fmtPct(h.unrealizedPnlPct)}
                              </div>
                            </td>
                            <td className="py-2.5 num text-right text-text-muted">
                              {h.weightPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                onClick={() => handleQuickSell(h.symbol, h.availableShares)}
                                title="Bán mã này"
                                className="px-2 py-0.5 rounded bg-negative/10 hover:bg-negative/20 text-negative text-[10.5px] font-semibold border border-negative/25 transition"
                              >
                                Bán
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SỔ LỆNH */}
          {activeBottomTab === "orders" && (
            <div className="flex-1 overflow-x-auto">
              {account.orders.length === 0 ? (
                <div className="py-12 text-center text-text-muted">
                  <Clock className="size-8 mx-auto text-text-muted/40 mb-1.5" />
                  <p className="text-[12px] font-medium text-text-primary">Chưa có lệnh nào được đặt</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                        <th className="pb-1.5 font-medium">Thời gian</th>
                        <th className="pb-1.5 font-medium">Lệnh</th>
                        <th className="pb-1.5 font-medium">Mã</th>
                        <th className="pb-1.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-1.5 font-medium text-right">Giá</th>
                        <th className="pb-1.5 font-medium text-right">Giá trị</th>
                        <th className="pb-1.5 font-medium text-center">Trạng thái</th>
                        <th className="pb-1.5 font-medium text-center">Huỷ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                      {account.orders.map((o) => (
                        <tr key={o.id} className="hover:bg-surface-base/50 transition">
                          <td className="py-2 text-text-muted num text-[10.5px]">
                            {new Date(o.placedAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="py-2 font-bold">
                            <span
                              className={`px-1 py-0.5 rounded text-[9.5px] ${
                                o.side === "BUY"
                                  ? "bg-positive/15 text-positive"
                                  : "bg-negative/15 text-negative"
                              }`}
                            >
                              {o.side === "BUY" ? "MUA" : "BÁN"} {o.orderType}
                            </span>
                          </td>
                          <td className="py-2 num font-bold text-text-primary">{o.symbol}</td>
                          <td className="py-2 num text-right">{fmtNum(o.shares, 0)}</td>
                          <td className="py-2 num text-right">{fmtNum(o.price, 0)}</td>
                          <td className="py-2 num text-right text-text-muted">
                            {fmtVnd(o.grossValue)}
                          </td>
                          <td className="py-2 text-center">
                            {o.status === "FILLED" && (
                              <Badge tone="up">Khớp</Badge>
                            )}
                            {o.status === "PENDING" && (
                              <Badge tone="warn">Chờ khớp</Badge>
                            )}
                            {o.status === "CANCELLED" && (
                              <Badge tone="neutral">Đã huỷ</Badge>
                            )}
                          </td>
                          <td className="py-2 text-center">
                            {o.status === "PENDING" && (
                              <button
                                onClick={() => handleCancelOrder(o.id)}
                                title="Huỷ lệnh chờ khớp"
                                className="px-1.5 py-0.5 rounded bg-negative/10 hover:bg-negative/20 text-negative text-[10px] font-semibold border border-negative/25"
                              >
                                Huỷ
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: NHẬT KÝ KHỚP LỆNH */}
          {activeBottomTab === "history" && (
            <div className="flex-1 overflow-x-auto">
              {account.history.length === 0 ? (
                <div className="py-12 text-center text-text-muted">
                  <History className="size-8 mx-auto text-text-muted/40 mb-1.5" />
                  <p className="text-[12px] font-medium text-text-primary">Chưa có giao dịch nào hoàn tất</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                        <th className="pb-1.5 font-medium">Thời gian</th>
                        <th className="pb-1.5 font-medium">Mã</th>
                        <th className="pb-1.5 font-medium">Loại</th>
                        <th className="pb-1.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-1.5 font-medium text-right">Giá khớp</th>
                        <th className="pb-1.5 font-medium text-right">Tổng tiền</th>
                        <th className="pb-1.5 font-medium text-right">Lãi/Lỗ chốt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                      {account.history.map((t) => (
                        <tr key={t.id} className="hover:bg-surface-base/50 transition">
                          <td className="py-2 text-text-muted num text-[10.5px]">
                            {new Date(t.executedAt).toLocaleString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2 num font-bold text-text-primary">{t.symbol}</td>
                          <td className="py-2 font-bold">
                            <span
                              className={`px-1 py-0.5 rounded text-[9.5px] ${
                                t.side === "BUY"
                                  ? "bg-positive/15 text-positive"
                                  : "bg-negative/15 text-negative"
                              }`}
                            >
                              {t.side === "BUY" ? "MUA" : "BÁN"}
                            </span>
                          </td>
                          <td className="py-2 num text-right">{fmtNum(t.shares, 0)}</td>
                          <td className="py-2 num text-right">{fmtNum(t.price, 0)}</td>
                          <td className="py-2 num text-right text-text-primary font-medium">
                            {fmtVnd(t.netValue)}
                          </td>
                          <td className="py-2 num text-right">
                            {t.realizedPnl != null ? (
                              <span
                                className={`font-semibold ${
                                  t.realizedPnl >= 0 ? "text-positive" : "text-negative"
                                }`}
                              >
                                {t.realizedPnl >= 0 ? "+" : ""}
                                {fmtVnd(t.realizedPnl)}
                                {t.realizedPnlPct != null && (
                                  <span className="text-[10px] ml-1">
                                    ({fmtPct(t.realizedPnlPct)})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Modal Xác nhận Reset 500M */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary mb-1.5 flex items-center gap-1.5">
              <RefreshCw className="size-4 text-negative" />
              Đặt lại tài khoản về 500 triệu?
            </h3>
            <p className="text-[11px] text-text-muted mb-4 leading-relaxed">
              Hành động này sẽ xoá toàn bộ danh mục cổ phiếu, sổ lệnh và lịch sử giao dịch mô phỏng, sau đó cấp lại 500.000.000 VNĐ tiền mặt để bạn bắt đầu lại từ đầu.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-surface-base border border-border-subtle text-text-primary hover:border-border-default transition"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  resetPaperAccount(DEFAULT_INITIAL_CASH, account.tPlusRule);
                  setShowResetConfirm(false);
                  setOrderNotice({ type: "success", message: "Đã khôi phục tài khoản về 500 triệu đồng ban đầu." });
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-negative text-white hover:bg-negative/90 transition shadow-sm"
              >
                Xác nhận đặt lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bơm thêm vốn */}
      {showAddCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary mb-1.5 flex items-center gap-1.5">
              <PlusCircle className="size-4 text-positive" />
              Nạp thêm vốn ảo
            </h3>
            <p className="text-[11px] text-text-muted mb-3">
              Chọn mức vốn bạn muốn bổ sung vào tiền mặt khả dụng:
            </p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[50_000_000, 100_000_000, 500_000_000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAddCashAmount(amt)}
                  className={`p-2 rounded-md border text-[11px] font-semibold num transition ${
                    addCashAmount === amt
                      ? "border-accent-primary bg-accent-primary/15 text-accent-primary"
                      : "border-border-subtle bg-surface-base text-text-muted hover:text-text-primary"
                  }`}
                >
                  +{amt >= 100_000_000 ? `${amt / 1_000_000} Triệu` : `${amt / 1_000_000} Tr`}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCashModal(false)}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-surface-base border border-border-subtle text-text-primary hover:border-border-default transition"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  adjustPaperCash(addCashAmount);
                  setShowAddCashModal(false);
                  setOrderNotice({
                    type: "success",
                    message: `Đã nạp thêm ${fmtVnd(addCashAmount)} vào tài khoản thành công!`,
                  });
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-positive text-surface-base hover:bg-positive/90 transition shadow-sm"
              >
                Nạp ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
