"use client";

import { useState } from "react";
import { Sparkles, X, CheckCircle2, AlertCircle, Wallet } from "lucide-react";
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary text-xs font-semibold transition-all shadow-sm ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Giao dịch ảo 500M</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-elevated p-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border-subtle mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-accent-primary animate-pulse" />
                <h3 className="text-sm font-bold text-text-primary">
                  Lệnh Ảo 500M: <span className="font-mono text-accent-primary font-bold">{sym}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-base transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tài sản & Sức mua */}
            <div className="p-3 rounded-xl border border-border-subtle bg-surface-base mb-4 flex items-center justify-between text-xs">
              <div>
                <div className="text-[11px] text-text-muted flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-accent-primary" />
                  Tiền mặt khả dụng:
                </div>
                <div className="num font-bold text-text-primary mt-0.5">
                  {fmtVnd(account.availableCash)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-text-muted">Đang giữ {sym}:</div>
                <div className="num font-semibold text-text-primary mt-0.5">
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
                    ? "bg-positive text-surface-base font-extrabold shadow-sm"
                    : "bg-surface-base border border-border-subtle text-text-muted hover:text-text-primary"
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
                    ? "bg-negative text-white font-extrabold shadow-sm"
                    : "bg-surface-base border border-border-subtle text-text-muted hover:text-text-primary"
                }`}
              >
                BÁN {sym}
              </button>
            </div>

            {/* Giá thị trường info */}
            {normCurrentPrice > 0 && (
              <div className="p-2.5 rounded-xl border border-border-subtle bg-surface-base mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-text-muted">Giá khớp</div>
                  <div className="num font-bold text-positive">{normCurrentPrice.toLocaleString("vi-VN")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Trần</div>
                  <div className="num font-semibold text-purple-400">{normCeiling ? normCeiling.toLocaleString("vi-VN") : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Sàn</div>
                  <div className="num font-semibold text-cyan-400">{normFloor ? normFloor.toLocaleString("vi-VN") : "—"}</div>
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
                      ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                      : "border-border-subtle bg-surface-base text-text-muted hover:text-text-primary"
                  }`}
                >
                  Lệnh Thị Trường (MP)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("LO")}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-bold transition-all ${
                    orderType === "LO"
                      ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                      : "border-border-subtle bg-surface-base text-text-muted hover:text-text-primary"
                  }`}
                >
                  Lệnh Giới Hạn (LO)
                </button>
              </div>

              {orderType === "LO" && (
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Mức giá đặt (VND):</label>
                  <input
                    type="number"
                    step="100"
                    value={customPriceInput}
                    onChange={(e) => setCustomPriceInput(e.target.value)}
                    className="w-full num font-bold px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-base text-text-primary focus:outline-none focus:border-accent-primary text-sm"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <span className="text-text-muted">Khối lượng (Lô 100):</span>
                  {side === "SELL" && (
                    <span className="text-text-muted">
                      Khả dụng: <span className="num font-semibold text-text-primary">{availableToSell.toLocaleString("vi-VN")} CP</span>
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="100"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  className="w-full num font-bold px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-base text-text-primary focus:outline-none focus:border-accent-primary text-sm"
                />
                <div className="flex gap-1.5 mt-1.5">
                  {[100, 500, 1000, 2000].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSharesInput(String(q))}
                      className="px-2 py-0.5 rounded text-[11px] num bg-surface-base border border-border-subtle text-text-muted hover:text-text-primary"
                    >
                      +{q}
                    </button>
                  ))}
                  {side === "SELL" && availableToSell > 0 && (
                    <button
                      type="button"
                      onClick={() => setSharesInput(String(availableToSell))}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-negative/15 text-negative border border-negative/30 hover:bg-negative/25"
                    >
                      Bán hết
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tóm tắt tiền */}
            <div className="p-3 rounded-xl border border-border-subtle bg-surface-base space-y-1 text-xs mb-4">
              <div className="flex justify-between text-text-muted">
                <span>Ước tính giá trị:</span>
                <span className="num text-text-primary font-semibold">{fmtVnd(grossVal)}</span>
              </div>
              <div className="flex justify-between text-text-muted text-[11px]">
                <span>Phí (0.1%) + Thuế (0.1% khi Bán):</span>
                <span className="num text-text-primary">{fmtVnd(fee + tax)}</span>
              </div>
              <div className="flex justify-between text-text-primary font-bold pt-1.5 border-t border-border-subtle">
                <span>{side === "BUY" ? "Tổng tiền cần trả:" : "Tổng tiền thực nhận:"}</span>
                <span className={`num text-sm ${side === "BUY" ? "text-positive" : "text-accent-primary"}`}>
                  {fmtVnd(totalVal)}
                </span>
              </div>
            </div>

            {/* Thông báo kết quả */}
            {notice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 mb-4 border ${
                  notice.type === "success"
                    ? "bg-positive/10 border-positive/30 text-positive"
                    : "bg-negative/10 border-negative/30 text-negative"
                }`}
              >
                {notice.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-negative mt-0.5" />
                )}
                <span className="leading-relaxed">{notice.message}</span>
              </div>
            )}

            {/* Nút Thực hiện & Link sang Portfolio */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExecute}
                disabled={sharesNum <= 0 || normCurrentPrice <= 0}
                className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all ${
                  side === "BUY"
                    ? "bg-positive text-surface-base hover:opacity-95"
                    : "bg-negative text-white hover:opacity-95"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {side === "BUY" ? `XÁC NHẬN MUA ${sym}` : `XÁC NHẬN BÁN ${sym}`}
              </button>

              <div className="text-center">
                <Link
                  href="/portfolio"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] text-accent-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  Xem toàn bộ đấu trường & danh mục mô phỏng 500M →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
