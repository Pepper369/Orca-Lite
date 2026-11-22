"use client";

import { useMemo, useState } from "react";
import { Badge, fmtNum, Panel } from "@/components/ui";
import { getAssetPipSize, getPriceDecimals } from "@/lib/engines/asset-precision";
import type { SetupGrade } from "@/lib/engines/fx-crypto-precision-engine";
import { DollarSign, Globe, Calculator, ArrowUpRight, ArrowDownRight, Clock, ShieldCheck } from "lucide-react";
import { BrokerQuickTradeBar } from "@/components/broker-quick-trade-bar";

interface Props {
  pair: string;
  base: string;
  quote: string;
  price: number | null;
  changePercent: number | null;
  setupGrade?: SetupGrade | null;
  recommendedSizeMultiplier?: number | null;
}

const LOT_SIZES = [
  { label: "0.01 Micro", units: 1_000, value: 0.01 },
  { label: "0.10 Mini", units: 10_000, value: 0.1 },
  { label: "1.00 Standard", units: 100_000, value: 1.0 },
] as const;

export function ForexTradeDesk({
  pair,
  base,
  quote,
  price,
  changePercent,
  setupGrade,
  recommendedSizeMultiplier,
}: Props) {
  const [lot, setLot] = useState<number>(0.1);
  const [leverage, setLeverage] = useState<number>(100);

  const curPrice = price ?? 1.0;
  const upperPair = (pair || "EURUSD").toUpperCase();
  const isGold = upperPair.startsWith("XAU");
  const isSilver = upperPair.startsWith("XAG");
  const isOil = upperPair.includes("OIL");
  const pipFactor = getAssetPipSize(upperPair, "FOREX", curPrice);
  const priceDecimals = getPriceDecimals(curPrice, upperPair, "FOREX");
  const contractUnitsPerLot = isGold ? 100 : isSilver ? 5_000 : isOil ? 1_000 : 100_000;
  const unitLabel = isGold || isSilver ? "oz" : isOil ? "bbl" : "đơn vị";

  // Approximate institutional spread (pips)
  const spreadPips = useMemo(() => {
    const p = upperPair;
    if (p.startsWith("XAU")) return 2.0;
    if (p.startsWith("XAG")) return 2.5;
    if (p.includes("OIL")) return 3.0;
    if (p.includes("EURUSD")) return 0.8;
    if (p.includes("GBPUSD")) return 1.1;
    if (p.includes("USDJPY")) return 0.9;
    if (p.includes("AUDUSD")) return 1.2;
    if (p.includes("USDCAD")) return 1.3;
    if (p.includes("USDCHF")) return 1.4;
    return 1.8;
  }, [upperPair]);

  const halfSpread = (spreadPips * pipFactor) / 2;
  const bidPrice = curPrice - halfSpread;
  const askPrice = curPrice + halfSpread;

  // Pip value in USD for selected lot size
  const pipValueUsd = useMemo(() => {
    const units = lot * contractUnitsPerLot;
    const q = (quote || "USD").toUpperCase();
    const b = (base || (pair ? pair.slice(0, 3) : "EUR")).toUpperCase();
    if (q === "USD") {
      return units * pipFactor;
    }
    if (b === "USD") {
      return (units * pipFactor) / curPrice;
    }
    return (units * pipFactor) / (curPrice || 1);
  }, [lot, contractUnitsPerLot, base, quote, curPrice, pipFactor, pair]);

  // Margin required in USD at selected leverage
  const marginRequired = useMemo(() => {
    const b = (base || (pair ? pair.slice(0, 3) : "EUR")).toUpperCase();
    const contractValueUsd = lot * contractUnitsPerLot * (b === "USD" ? 1 : curPrice);
    return contractValueUsd / leverage;
  }, [lot, contractUnitsPerLot, base, curPrice, leverage, pair]);

  // Global Session status (UTC based)
  const sessions = useMemo(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    return [
      { name: "Sydney", hours: "21:00 - 06:00 UTC", isOpen: utcHour >= 21 || utcHour < 6 },
      { name: "Tokyo", hours: "00:00 - 09:00 UTC", isOpen: utcHour >= 0 && utcHour < 9 },
      { name: "London", hours: "07:00 - 16:00 UTC", isOpen: utcHour >= 7 && utcHour < 16 },
      { name: "New York", hours: "12:00 - 21:00 UTC", isOpen: utcHour >= 12 && utcHour < 21 },
    ];
  }, []);

  return (
    <Panel
      className="h-full overflow-hidden"
      title={
        <span className="flex items-center gap-2">
          <Calculator className="size-4 text-accent-primary" /> Bàn Tính Vị Thế & Thanh Khoản
        </span>
      }
      right={
        <Badge tone="accent">
          {base || "EUR"}/{quote || "USD"}
        </Badge>
      }
    >
      <div className="flex h-full flex-col justify-between space-y-2.5">
        {/* Bid / Ask Dual Rate Box */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="panel-inset p-2 border-l-2 border-negative">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-negative font-semibold">
              <ArrowDownRight className="size-3 shrink-0" />
              <span className="truncate">GIÁ BÁN (BID)</span>
            </div>
            <div className="num mt-0.5 text-[15px] font-bold text-text-primary">
              {fmtNum(bidPrice, priceDecimals)}
            </div>
            <div className="text-[9px] text-text-muted">Khớp lệnh SELL</div>
          </div>

          <div className="panel-inset p-2 border-l-2 border-positive">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-positive font-semibold">
              <ArrowUpRight className="size-3 shrink-0" />
              <span className="truncate">GIÁ MUA (ASK)</span>
            </div>
            <div className="num mt-0.5 text-[15px] font-bold text-text-primary">
              {fmtNum(askPrice, priceDecimals)}
            </div>
            <div className="text-[9px] text-text-muted">Khớp lệnh BUY</div>
          </div>
        </div>

        {/* Spread & Pip Value Strip */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="panel-inset p-1.5">
            <span className="text-[8.5px] uppercase tracking-wider text-text-muted block">Spread</span>
            <strong className="num text-[12px] font-semibold text-accent-primary">{spreadPips.toFixed(1)} pips</strong>
          </div>
          <div className="panel-inset p-1.5">
            <span className="text-[8.5px] uppercase tracking-wider text-text-muted block">Giá trị / Pip</span>
            <strong className="num text-[12px] font-semibold text-positive">${pipValueUsd.toFixed(2)}</strong>
          </div>
          <div className="panel-inset p-1.5">
            <span className="text-[8.5px] uppercase tracking-wider text-text-muted block">Ký quỹ (Margin)</span>
            <strong className="num text-[12px] font-semibold text-text-primary">${marginRequired.toFixed(0)}</strong>
          </div>
        </div>

        {setupGrade && (
          <div className="flex items-center justify-between rounded-md border border-border-subtle/70 bg-surface-elevated/40 px-2 py-1 text-[10px]">
            <span className="text-text-muted">Precision Sizing:</span>
            {setupGrade === "NO_TRADE" ? (
              <span className="font-semibold text-warning">WAIT / LỌC · Chưa khuyến nghị mở vị thế</span>
            ) : (
              <span className="font-semibold text-positive">
                Grade {setupGrade} · Khuyến nghị {recommendedSizeMultiplier ?? 1}x size
              </span>
            )}
          </div>
        )}

        {/* Position Size / Lot Selector */}
        <div className="panel-inset p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="font-semibold uppercase tracking-wider text-text-muted">Khối lượng vào lệnh (Lots)</span>
            <span className="num font-bold text-accent-primary">
              {(lot * contractUnitsPerLot).toLocaleString()} {unitLabel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {LOT_SIZES.map((ls) => (
              <button
                key={ls.value}
                type="button"
                onClick={() => setLot(ls.value)}
                className={`rounded border px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                  lot === ls.value
                    ? "border-accent-primary bg-accent-primary/15 text-accent-primary"
                    : "border-border-subtle bg-surface-elevated/40 text-text-secondary hover:border-border-default hover:text-text-primary"
                }`}
              >
                {ls.label}
              </button>
            ))}
          </div>

          {/* Leverage Selector */}
          <div className="flex items-center justify-between pt-1 border-t border-border-subtle/50 text-[9.5px]">
            <span className="text-text-muted">Đòn bẩy tài khoản:</span>
            <div className="flex items-center gap-1">
              {[50, 100, 200, 500].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                    leverage === lev
                      ? "bg-accent-primary text-text-inverse font-bold"
                      : "bg-surface-elevated text-text-muted hover:text-text-primary"
                  }`}
                >
                  1:{lev}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Global Forex Market Sessions Tracker */}
        <div className="panel-inset p-2 space-y-1">
          <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
            <span className="flex items-center gap-1">
              <Clock className="size-3 text-accent-primary" /> Phiên giao dịch ngoại hối
            </span>
            <span className="text-[8.5px] text-accent-primary">Giờ Quốc Tế (UTC)</span>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {sessions.map((s) => (
              <div
                key={s.name}
                className={`flex items-center justify-between rounded px-1.5 py-1 border ${
                  s.isOpen
                    ? "border-positive/30 bg-positive/10 text-positive font-semibold"
                    : "border-border-subtle/40 bg-surface-elevated/20 text-text-muted"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`size-1.5 rounded-full ${s.isOpen ? "bg-positive animate-pulse" : "bg-text-muted/40"}`} />
                  <span className="truncate">{s.name}</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider">
                  {s.isOpen ? "MỞ" : "ĐÓNG"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Connected Exness / XM Broker Quick Execution */}
        <BrokerQuickTradeBar
          assetType="FOREX"
          compact
          order={
            price != null && price > 0
              ? {
                  symbol: upperPair,
                  assetType: "FOREX",
                  direction: (changePercent ?? 0) >= 0 ? "BUY" : "SELL",
                  entryPrice: (changePercent ?? 0) >= 0 ? askPrice : bidPrice,
                  stopLossPrice:
                    (changePercent ?? 0) >= 0
                      ? Number((askPrice - 20 * pipFactor).toFixed(priceDecimals))
                      : Number((bidPrice + 20 * pipFactor).toFixed(priceDecimals)),
                  takeProfit1:
                    (changePercent ?? 0) >= 0
                      ? Number((askPrice + 40 * pipFactor).toFixed(priceDecimals))
                      : Number((bidPrice - 40 * pipFactor).toFixed(priceDecimals)),
                  masterLotsOrQty: lot,
                  recommendedLeverage: 1,
                  setupGrade: setupGrade ?? undefined,
                }
              : null
          }
        />

        {/* Swap Rates Note */}
        <div className="rounded border border-border-subtle/60 bg-surface-elevated/30 px-2 py-1.5 text-[9.5px] text-text-muted flex items-center justify-between">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3 text-positive" /> Phí Swap qua đêm: Long -3.2 / Short +1.8 pts
          </span>
          <span className="text-text-secondary">Rollover 21:00 UTC</span>
        </div>
      </div>
    </Panel>
  );
}
