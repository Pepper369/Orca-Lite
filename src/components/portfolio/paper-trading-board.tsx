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
} from "lucide-react";
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
      setOrderNotice({ type: "error", message: "Khối lượng phải là bội số của 100." });
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
      // Clear hoặc giữ lại khối lượng
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
    <div className="space-y-6">
      {/* 1. Header & KPI Ribbon: Tổng quan tài sản 500M */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-surface/90 via-surface/70 to-surface/40 p-5 md:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
                Tài Khoản Giao Dịch Ảo (Mô Phỏng 500M)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-raised border border-border/60 text-muted-foreground font-mono">
                {account.tPlusRule === "T0" ? "Chế độ T+0 (Lướt sóng)" : "Chế độ T+2.5 (Chuẩn sàn)"}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-baseline gap-2">
              {fmtVnd(metrics.nav)}
              <span
                className={`text-sm md:text-base font-semibold ${
                  metrics.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ({fmtPct(metrics.totalPnlPct)})
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vốn khởi điểm: {fmtVnd(account.initialCash)} · Lợi nhuận ròng:{" "}
              <span className={metrics.totalPnl >= 0 ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                {metrics.totalPnl >= 0 ? "+" : ""}
                {fmtVnd(metrics.totalPnl)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fetchQuotes()}
              disabled={isLoadingQuotes}
              title="Làm mới giá thị trường"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-surface hover:bg-surface-raised text-xs font-medium text-foreground transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingQuotes ? "animate-spin text-emerald-400" : ""}`} />
              <span>Cập nhật giá</span>
            </button>

            <button
              onClick={() => {
                const nextRule = account.tPlusRule === "T0" ? "T2_5" : "T0";
                setTPlusRule(nextRule);
              }}
              title="Chuyển đổi quy tắc thanh toán T+0 / T+2.5"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-surface hover:bg-surface-raised text-xs font-medium text-foreground transition-all"
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Đổi sang {account.tPlusRule === "T0" ? "T+2.5" : "T+0"}</span>
            </button>

            <button
              onClick={() => setShowAddCashModal(true)}
              title="Bơm thêm vốn ảo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-400 transition-all"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Nạp vốn</span>
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              title="Khôi phục tài khoản về 500 triệu ban đầu"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-400 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Đặt lại 500M</span>
            </button>
          </div>
        </div>

        {/* 4 Cards Thống kê tài sản */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-5">
          <div className="p-3.5 rounded-xl border border-border/60 bg-surface/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Tiền mặt khả dụng</span>
              <Wallet className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-base md:text-lg font-bold text-foreground">
              {fmtVnd(account.availableCash)}
            </div>
            {account.lockedCash > 0 && (
              <div className="text-[11px] text-amber-400 mt-0.5">
                Khoá chờ mua: {fmtVnd(account.lockedCash)}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl border border-border/60 bg-surface/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Giá trị cổ phiếu</span>
              <Briefcase className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <div className="text-base md:text-lg font-bold text-foreground">
              {fmtVnd(metrics.stockValue)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Đang nắm: {metrics.holdings.length} mã CP
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/60 bg-surface/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Lãi/Lỗ tạm tính (Holding)</span>
              {metrics.unrealizedPnl >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
              )}
            </div>
            <div
              className={`text-base md:text-lg font-bold ${
                metrics.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.unrealizedPnl >= 0 ? "+" : ""}
              {fmtVnd(metrics.unrealizedPnl)}
            </div>
            <div
              className={`text-[11px] font-semibold mt-0.5 ${
                metrics.unrealizedPnlPct >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {fmtPct(metrics.unrealizedPnlPct)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/60 bg-surface/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Lãi/Lỗ đã chốt & Winrate</span>
              <History className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div
              className={`text-base md:text-lg font-bold ${
                metrics.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.realizedPnl >= 0 ? "+" : ""}
              {fmtVnd(metrics.realizedPnl)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Thắng: {metrics.winTrades}/{metrics.totalTrades} ({metrics.winRate.toFixed(0)}%)
            </div>
          </div>
        </div>
      </div>

      {/* 2. Khung Đặt Lệnh & Bảng Giá Nhanh */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Phiếu đặt lệnh: 5 Cột trên Desktop */}
        <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Phiếu Đặt Lệnh Mô Phỏng
            </h2>
            <div className="flex rounded-lg bg-surface-raised p-0.5 border border-border/60">
              <button
                onClick={() => setSide("BUY")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  side === "BUY"
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                MUA
              </button>
              <button
                onClick={() => setSide("SELL")}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  side === "SELL"
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                BÁN
              </button>
            </div>
          </div>

          {/* Quick Symbol Chips */}
          <div className="mb-4">
            <div className="text-[11px] text-muted-foreground mb-1.5">Mã phổ biến:</div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SYMBOLS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSymbol(s);
                    setOrderNotice(null);
                  }}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all ${
                    symbol.toUpperCase() === s
                      ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                      : "bg-surface-raised border border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Mã cổ phiếu & Live Price Indicator */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Mã chứng khoán:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value.toUpperCase());
                    setOrderNotice(null);
                  }}
                  placeholder="Nhập mã CP (VD: HPG, SSI...)"
                  className="w-full uppercase font-mono font-bold tracking-wider px-3.5 py-2 rounded-xl border border-border/80 bg-surface-raised text-foreground focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              {/* Thông tin giá tham chiếu, trần, sàn */}
              {currentSymbolPrice > 0 ? (
                <div className="mt-2 p-2.5 rounded-lg border border-border/50 bg-surface/50 grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Giá khớp</div>
                    <div className="font-bold text-emerald-400 font-mono">
                      {currentSymbolPrice.toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Thay đổi</div>
                    <div
                      className={`font-semibold font-mono ${
                        (activeQuote?.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {fmtPct(activeQuote?.changePercent)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Trần (+7%)</div>
                    <div className="font-semibold text-purple-400 font-mono">
                      {currentCeiling?.toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Sàn (-7%)</div>
                    <div className="font-semibold text-cyan-400 font-mono">
                      {currentFloor?.toLocaleString("vi-VN")}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Đang tải giá thị trường mã {symbol}...
                </div>
              )}
            </div>

            {/* Loại lệnh: MP vs LO */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Loại lệnh:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType("MP")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    orderType === "MP"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-border/60 bg-surface-raised text-muted-foreground hover:text-foreground"
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
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    orderType === "LO"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-border/60 bg-surface-raised text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Lệnh Giới Hạn (LO)
                </button>
              </div>
            </div>

            {/* Giá đặt (chỉ hiện khi chọn LO) */}
            {orderType === "LO" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Mức giá đặt (VND):
                </label>
                <input
                  type="number"
                  step="100"
                  value={customPriceInput}
                  onChange={(e) => setCustomPriceInput(e.target.value)}
                  placeholder="Nhập giá LO (VD: 20950)"
                  className="w-full font-mono font-bold px-3.5 py-2 rounded-xl border border-border/80 bg-surface-raised text-foreground focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
            )}

            {/* Khối lượng cổ phiếu */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Khối lượng (Lô 100):
                </label>
                {side === "SELL" && account.holdings[symbol] && (
                  <span className="text-[11px] text-muted-foreground">
                    Khả dụng bán:{" "}
                    <span className="font-semibold text-foreground">
                      {account.holdings[symbol].availableShares.toLocaleString("vi-VN")} CP
                    </span>
                  </span>
                )}
              </div>
              <input
                type="number"
                step="100"
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                placeholder="Số lượng (bội số 100)"
                className="w-full font-mono font-bold px-3.5 py-2 rounded-xl border border-border/80 bg-surface-raised text-foreground focus:outline-none focus:border-emerald-500 text-sm"
              />

              {/* Nút chọn nhanh khối lượng */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[100, 500, 1000, 2000, 5000].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setSharesInput(String(qty))}
                    className="px-2 py-1 rounded-md text-[11px] font-mono bg-surface-raised border border-border/50 text-muted-foreground hover:text-foreground transition-all"
                  >
                    +{qty.toLocaleString("vi-VN")}
                  </button>
                ))}
                {side === "BUY" && currentSymbolPrice > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const maxAffordable = Math.floor(account.availableCash / (currentSymbolPrice * 1.001 * 100)) * 100;
                      if (maxAffordable > 0) setSharesInput(String(maxAffordable));
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    Tối đa (100%)
                  </button>
                )}
                {side === "SELL" && account.holdings[symbol] && (
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(account.holdings[symbol].availableShares))}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  >
                    Bán hết
                  </button>
                )}
              </div>
            </div>

            {/* Chi tiết tính toán lệnh */}
            <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Giá trị lệnh dự tính:</span>
                <span className="font-mono text-foreground font-semibold">
                  {fmtVnd(estimatedGross)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-[11px]">
                <span>Phí giao dịch (0.1%):</span>
                <span className="font-mono text-foreground">
                  {fmtVnd(estimatedFee)}
                </span>
              </div>
              {side === "SELL" && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Thuế TNCN bán (0.1%):</span>
                  <span className="font-mono text-foreground">
                    {fmtVnd(estimatedTax)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-foreground font-bold pt-1.5 border-t border-border/40 text-sm">
                <span>{side === "BUY" ? "Tổng tiền cần trả:" : "Tổng tiền thực nhận:"}</span>
                <span className={`font-mono ${side === "BUY" ? "text-emerald-400" : "text-sky-400"}`}>
                  {fmtVnd(estimatedTotal)}
                </span>
              </div>
            </div>

            {/* Thông báo kết quả lệnh */}
            {orderNotice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  orderNotice.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                }`}
              >
                {orderNotice.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <span>{orderNotice.message}</span>
              </div>
            )}

            {/* Nút hành động MUA / BÁN */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={sharesNum <= 0 || currentSymbolPrice <= 0}
              className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide uppercase shadow-lg transition-all flex items-center justify-center gap-2 ${
                side === "BUY"
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 active:scale-[0.99]"
                  : "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 active:scale-[0.99]"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {side === "BUY" ? "XÁC NHẬN MUA CỔ PHIẾU" : "XÁC NHẬN BÁN CỔ PHIẾU"}
            </button>
          </div>
        </div>

        {/* Bảng Danh mục & Sổ lệnh: 7 Cột trên Desktop */}
        <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-lg backdrop-blur-sm flex flex-col">
          {/* Subtabs điều hướng */}
          <div className="flex items-center gap-2 pb-4 mb-4 border-b border-border/50">
            <button
              onClick={() => setActiveBottomTab("holdings")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeBottomTab === "holdings"
                  ? "bg-surface-raised border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-emerald-400" />
              <span>Danh Mục Nắm Giữ ({metrics.holdings.length})</span>
            </button>

            <button
              onClick={() => setActiveBottomTab("orders")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeBottomTab === "orders"
                  ? "bg-surface-raised border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>
                Sổ Lệnh ({account.orders.filter((o) => o.status === "PENDING").length} chờ)
              </span>
            </button>

            <button
              onClick={() => setActiveBottomTab("history")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeBottomTab === "history"
                  ? "bg-surface-raised border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5 text-sky-400" />
              <span>Nhật Ký Khớp Lệnh ({account.history.length})</span>
            </button>
          </div>

          {/* TAB 1: DANH MỤC NẮM GIỮ */}
          {activeBottomTab === "holdings" && (
            <div className="flex-1 overflow-x-auto">
              {metrics.holdings.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium">Danh mục cổ phiếu đang trống.</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Hãy sử dụng Phiếu Đặt Lệnh bên cạnh để mua thử các cổ phiếu tiêu biểu như HPG, SSI, VNM với số vốn 500 triệu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/50 text-[11px] text-muted-foreground">
                        <th className="pb-2.5 font-medium">Mã CP</th>
                        <th className="pb-2.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-2.5 font-medium text-right">Giá vốn</th>
                        <th className="pb-2.5 font-medium text-right">Giá hiện tại</th>
                        <th className="pb-2.5 font-medium text-right">Tổng giá trị</th>
                        <th className="pb-2.5 font-medium text-right">Lãi / Lỗ</th>
                        <th className="pb-2.5 font-medium text-right">Tỷ trọng</th>
                        <th className="pb-2.5 font-medium text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {metrics.holdings.map((h) => {
                        const isProfitable = h.unrealizedPnl >= 0;
                        return (
                          <tr key={h.symbol} className="hover:bg-surface-raised/40 transition-colors">
                            <td className="py-3 font-mono font-bold text-foreground">
                              {h.symbol}
                            </td>
                            <td className="py-3 font-mono text-right text-foreground">
                              <div>{h.shares.toLocaleString("vi-VN")}</div>
                              {account.tPlusRule === "T2_5" && h.availableShares < h.shares && (
                                <div className="text-[10px] text-amber-400">
                                  Khả dụng: {h.availableShares.toLocaleString("vi-VN")}
                                </div>
                              )}
                            </td>
                            <td className="py-3 font-mono text-right text-muted-foreground">
                              {h.avgCost.toLocaleString("vi-VN")}
                            </td>
                            <td className="py-3 font-mono text-right font-semibold text-foreground">
                              {h.currentPrice.toLocaleString("vi-VN")}
                              {h.changePercent != null && (
                                <div
                                  className={`text-[10px] ${
                                    h.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {fmtPct(h.changePercent)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 font-mono text-right font-medium text-foreground">
                              {fmtVnd(h.marketValue)}
                            </td>
                            <td
                              className={`py-3 font-mono text-right font-bold ${
                                isProfitable ? "text-emerald-400" : "text-rose-400"
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
                            <td className="py-3 font-mono text-right text-muted-foreground">
                              {h.weightPct.toFixed(1)}%
                            </td>
                            <td className="py-3 text-center">
                              <button
                                onClick={() => handleQuickSell(h.symbol, h.availableShares)}
                                title="Bán mã này"
                                className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-semibold border border-rose-500/20 transition-all"
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
                <div className="py-16 text-center text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium">Chưa có lệnh nào được đặt.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/50 text-[11px] text-muted-foreground">
                        <th className="pb-2.5 font-medium">Thời gian</th>
                        <th className="pb-2.5 font-medium">Lệnh</th>
                        <th className="pb-2.5 font-medium">Mã</th>
                        <th className="pb-2.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-2.5 font-medium text-right">Giá</th>
                        <th className="pb-2.5 font-medium text-right">Giá trị</th>
                        <th className="pb-2.5 font-medium text-center">Trạng thái</th>
                        <th className="pb-2.5 font-medium text-center">Huỷ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {account.orders.map((o) => (
                        <tr key={o.id} className="hover:bg-surface-raised/40 transition-colors">
                          <td className="py-2.5 text-muted-foreground font-mono text-[11px]">
                            {new Date(o.placedAt).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                o.side === "BUY"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {o.side === "BUY" ? "MUA" : "BÁN"} {o.orderType}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono font-bold text-foreground">{o.symbol}</td>
                          <td className="py-2.5 font-mono text-right">{o.shares.toLocaleString("vi-VN")}</td>
                          <td className="py-2.5 font-mono text-right">{o.price.toLocaleString("vi-VN")}</td>
                          <td className="py-2.5 font-mono text-right text-muted-foreground">
                            {fmtVnd(o.grossValue)}
                          </td>
                          <td className="py-2.5 text-center">
                            {o.status === "FILLED" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                                Đã khớp
                              </span>
                            )}
                            {o.status === "PENDING" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                                Chờ khớp
                              </span>
                            )}
                            {o.status === "CANCELLED" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-raised text-muted-foreground border border-border/50">
                                Đã huỷ
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-center">
                            {o.status === "PENDING" && (
                              <button
                                onClick={() => handleCancelOrder(o.id)}
                                title="Huỷ lệnh chờ khớp"
                                className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-semibold border border-rose-500/20"
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
                <div className="py-16 text-center text-muted-foreground">
                  <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium">Chưa có giao dịch nào hoàn tất.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/50 text-[11px] text-muted-foreground">
                        <th className="pb-2.5 font-medium">Thời gian</th>
                        <th className="pb-2.5 font-medium">Mã</th>
                        <th className="pb-2.5 font-medium">Loại</th>
                        <th className="pb-2.5 font-medium text-right">Khối lượng</th>
                        <th className="pb-2.5 font-medium text-right">Giá khớp</th>
                        <th className="pb-2.5 font-medium text-right">Tổng tiền</th>
                        <th className="pb-2.5 font-medium text-right">Lãi/Lỗ chốt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {account.history.map((t) => (
                        <tr key={t.id} className="hover:bg-surface-raised/40 transition-colors">
                          <td className="py-2.5 text-muted-foreground font-mono text-[11px]">
                            {new Date(t.executedAt).toLocaleString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 font-mono font-bold text-foreground">{t.symbol}</td>
                          <td className="py-2.5 font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                t.side === "BUY"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {t.side === "BUY" ? "MUA" : "BÁN"}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-right">{t.shares.toLocaleString("vi-VN")}</td>
                          <td className="py-2.5 font-mono text-right">{t.price.toLocaleString("vi-VN")}</td>
                          <td className="py-2.5 font-mono text-right text-foreground font-medium">
                            {fmtVnd(t.netValue)}
                          </td>
                          <td className="py-2.5 font-mono text-right">
                            {t.realizedPnl != null ? (
                              <span
                                className={`font-bold ${
                                  t.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
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
                              <span className="text-muted-foreground">—</span>
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
        </div>
      </div>

      {/* Modal Xác nhận Reset 500M */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-rose-400" />
              Đặt lại tài khoản về 500 triệu?
            </h3>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Hành động này sẽ xoá toàn bộ danh mục cổ phiếu hiện có, sổ lệnh và lịch sử giao dịch mô phỏng, sau đó cấp lại 500.000.000 VNĐ tiền mặt để bạn bắt đầu lại từ đầu.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-raised border border-border text-foreground hover:bg-surface-raised/80 transition-all"
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white transition-all shadow-md shadow-rose-500/20"
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
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-emerald-400" />
              Nạp thêm vốn ảo
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Chọn mức vốn bạn muốn bổ sung vào tiền mặt khả dụng để thử nghiệm quy mô danh mục lớn hơn:
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[50_000_000, 100_000_000, 500_000_000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAddCashAmount(amt)}
                  className={`p-3 rounded-xl border text-xs font-bold font-mono transition-all ${
                    addCashAmount === amt
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-300 shadow-sm"
                      : "border-border/60 bg-surface-raised text-muted-foreground hover:text-foreground"
                  }`}
                >
                  +{amt >= 100_000_000 ? `${amt / 1_000_000} Triệu` : `${amt / 1_000_000} Tr`}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddCashModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-raised border border-border text-foreground hover:bg-surface-raised/80 transition-all"
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-500/20"
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
