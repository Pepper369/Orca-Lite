"use client";

import { useState } from "react";
import { Sparkles, X, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertCircle, Wallet } from "lucide-react";
import Link from "next/link";
import {
  loadPaperAccount,
  placePaperOrder,
  type OrderSide,
  type OrderType,
} from "@/lib/paper-trading";

interface QuickPaperTradeModalProps {
  symbol: string;
  currentPrice?: number | null;
  ceilingPrice?: number | null;
  floorPrice?: number | null;
  className?: string;
}

function fmtVnd(num: number): string {
  return `${Math.round(num).toLocaleString("vi-VN")} đ`;
}

function normalizePrice(p: number): number {
  if (p <= 0) return 0;
  return p < 1000 ? Math.round(p * 1000) : Math.round(p);
}

export function QuickPaperTradeButton({
  symbol,
  currentPrice,
  ceilingPrice,
  floorPrice,
  className = "",
}: QuickPaperTradeModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MP");
  const [sharesInput, setSharesInput] = useState("1000");
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const sym = symbol.toUpperCase().trim();
  const account = loadPaperAccount();

  const normCurrentPrice = currentPrice ? normalizePrice(currentPrice) : 0;
  const normCeiling = ceilingPrice ? normalizePrice(ceilingPrice) : undefined;
  const normFloor = floorPrice ? normalizePrice(floorPrice) : undefined;

  const sharesNum = parseInt(sharesInput, 10) || 0;
  const targetPrice = orderType === "MP" ? normCurrentPrice : parseInt(customPriceInput, 10) || normCurrentPrice;
  const grossVal = sharesNum * targetPrice;
  const fee = Math.round(grossVal * 0.001);
  const tax = side === "SELL" ? Math.round(grossVal * 0.001) : 0;
  const totalVal = side === "BUY" ? grossVal + fee : grossVal - fee - tax;

  const holding = account.holdings[sym];
  const availableToSell = holding ? (account.tPlusRule === "T0" ? holding.shares : holding.availableShares) : 0;

  const handleOpen = () => {
    setNotice(null);
    if (!customPriceInput && normCurrentPrice > 0) {
      setCustomPriceInput(String(normCurrentPrice));
    }
    setIsOpen(true);
  };

  const handleExecute = () => {
    setNotice(null);
    if (sharesNum <= 0) {
      setNotice({ type: "error", message: "Khối lượng phải lớn hơn 0." });
      return;
    }
    if (sharesNum % 100 !== 0) {
      setNotice({ type: "error", message: "Khối lượng phải là bội số của 100." });
      return;
    }
    if (normCurrentPrice <= 0) {
      setNotice({ type: "error", message: "Chưa có giá thị trường cho mã này." });
      return;
    }

    const price = orderType === "MP" ? normCurrentPrice : targetPrice;

    const res = placePaperOrder({
      symbol: sym,
      side,
      orderType,
      shares: sharesNum,
      price,
      currentMarketPrice: normCurrentPrice,
      ceilingPrice: normCeiling,
      floorPrice: normFloor,
    });

    if (res.success) {
      setNotice({ type: "success", message: res.message });
    } else {
      setNotice({ type: "error", message: res.message });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Đặt lệnh mô phỏng ảo 500M"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition-all shadow-sm ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Giao dịch ảo</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border/50 mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-base font-bold text-foreground">
                  Đặt Lệnh Ảo: <span className="font-mono text-emerald-400">{sym}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tài sản & Sức mua */}
            <div className="p-3 rounded-xl border border-border/60 bg-surface-raised/40 mb-4 flex items-center justify-between text-xs">
              <div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-emerald-400" />
                  Tiền mặt khả dụng:
                </div>
                <div className="font-mono font-bold text-foreground mt-0.5">
                  {fmtVnd(account.availableCash)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Đang giữ {sym}:</div>
                <div className="font-mono font-semibold text-foreground mt-0.5">
                  {holding ? `${holding.shares.toLocaleString("vi-VN")} CP` : "0 CP"}
                </div>
              </div>
            </div>

            {/* Nút MUA / BÁN */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setSide("BUY");
                  setNotice(null);
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  side === "BUY"
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                    : "bg-surface-raised border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                MUA {sym}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSide("SELL");
                  setNotice(null);
                  if (availableToSell > 0) setSharesInput(String(availableToSell));
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  side === "SELL"
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                    : "bg-surface-raised border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                BÁN {sym}
              </button>
            </div>

            {/* Giá thị trường info */}
            {normCurrentPrice > 0 && (
              <div className="p-2.5 rounded-xl border border-border/50 bg-surface/40 mb-3 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div>
                  <div className="text-[10px] text-muted-foreground font-sans">Giá khớp</div>
                  <div className="font-bold text-emerald-400">{normCurrentPrice.toLocaleString("vi-VN")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-sans">Trần</div>
                  <div className="font-semibold text-purple-400">{normCeiling?.toLocaleString("vi-VN")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-sans">Sàn</div>
                  <div className="font-semibold text-cyan-400">{normFloor?.toLocaleString("vi-VN")}</div>
                </div>
              </div>
            )}

            {/* Loại lệnh & Khối lượng */}
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType("MP")}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-bold transition-all ${
                    orderType === "MP"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-border/60 bg-surface-raised text-muted-foreground"
                  }`}
                >
                  Lệnh Thị Trường (MP)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("LO")}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-bold transition-all ${
                    orderType === "LO"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-border/60 bg-surface-raised text-muted-foreground"
                  }`}
                >
                  Lệnh Giới Hạn (LO)
                </button>
              </div>

              {orderType === "LO" && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Mức giá đặt (VND):</label>
                  <input
                    type="number"
                    step="100"
                    value={customPriceInput}
                    onChange={(e) => setCustomPriceInput(e.target.value)}
                    className="w-full font-mono font-bold px-3 py-1.5 rounded-lg border border-border/80 bg-surface-raised text-foreground focus:outline-none focus:border-emerald-500 text-sm"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <span className="text-muted-foreground">Khối lượng (Lô 100):</span>
                  {side === "SELL" && (
                    <span className="text-muted-foreground">
                      Khả dụng: <span className="font-semibold text-foreground">{availableToSell.toLocaleString("vi-VN")} CP</span>
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="100"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  className="w-full font-mono font-bold px-3 py-1.5 rounded-lg border border-border/80 bg-surface-raised text-foreground focus:outline-none focus:border-emerald-500 text-sm"
                />
                <div className="flex gap-1.5 mt-1.5">
                  {[100, 500, 1000, 2000].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSharesInput(String(q))}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-raised border border-border/50 text-muted-foreground hover:text-foreground"
                    >
                      +{q}
                    </button>
                  ))}
                  {side === "SELL" && availableToSell > 0 && (
                    <button
                      type="button"
                      onClick={() => setSharesInput(String(availableToSell))}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    >
                      Bán hết
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tóm tắt tiền */}
            <div className="p-3 rounded-xl border border-border/60 bg-surface/30 space-y-1 text-xs mb-4">
              <div className="flex justify-between text-muted-foreground">
                <span>Ước tính giá trị:</span>
                <span className="font-mono text-foreground font-semibold">{fmtVnd(grossVal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-[11px]">
                <span>Phí (0.1%) + Thuế:</span>
                <span className="font-mono text-foreground">{fmtVnd(fee + tax)}</span>
              </div>
              <div className="flex justify-between text-foreground font-bold pt-1 border-t border-border/40">
                <span>{side === "BUY" ? "Tổng tiền cần trả:" : "Tổng tiền thực nhận:"}</span>
                <span className={`font-mono ${side === "BUY" ? "text-emerald-400" : "text-sky-400"}`}>
                  {fmtVnd(totalVal)}
                </span>
              </div>
            </div>

            {/* Thông báo kết quả */}
            {notice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 mb-4 ${
                  notice.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                }`}
              >
                {notice.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <span>{notice.message}</span>
              </div>
            )}

            {/* Nút Thực hiện & Link sang Portfolio */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExecute}
                disabled={sharesNum <= 0 || normCurrentPrice <= 0}
                className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all ${
                  side === "BUY"
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                    : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20"
                } disabled:opacity-50`}
              >
                {side === "BUY" ? `XÁC NHẬN MUA ${sym}` : `XÁC NHẬN BÁN ${sym}`}
              </button>

              <div className="text-center">
                <Link
                  href="/portfolio"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] text-emerald-400 hover:underline font-medium inline-flex items-center gap-1"
                >
                  Xem toàn bộ danh mục & sổ lệnh mô phỏng 500M →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
