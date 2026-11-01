"use client";

import { useMemo, useState, useEffect } from "react";
import { calculatePositionSizing } from "@/lib/engines/wyckoff-position-sizing";
import { ShieldCheck, Calculator, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";

interface WyckoffPositionCalculatorProps {
  symbol: string;
  entryPrice: number;
  stopLossPrice?: number | null;
  target1Price?: number | null;
  target2Price?: number | null;
  onClose?: () => void;
}

const QUICK_NAVS = [
  { label: "50 Tr", value: 50_000_000 },
  { label: "100 Tr", value: 100_000_000 },
  { label: "200 Tr", value: 200_000_000 },
  { label: "500 Tr", value: 500_000_000 },
  { label: "1 Tỷ", value: 1_000_000_000 },
];

const RISK_PRESETS = [
  { label: "1.0%", value: 1.0 },
  { label: "1.25% (Wyckoff)", value: 1.25 },
  { label: "1.5%", value: 1.5 },
  { label: "2.0%", value: 2.0 },
];

export function WyckoffPositionCalculator({
  symbol,
  entryPrice,
  stopLossPrice,
  target1Price,
  target2Price,
  onClose,
}: WyckoffPositionCalculatorProps) {
  // Chuẩn hóa giá sang đơn vị VNĐ nếu truyền vào dạng ngàn đồng
  const norm = (p?: number | null, fallback = 0) => {
    if (!p || p <= 0) return fallback;
    return p < 1000 ? p * 1000 : p;
  };

  const initialEntry = norm(entryPrice, 30_000);
  const initialSL = norm(stopLossPrice, initialEntry * 0.93);
  const initialT1 = norm(target1Price, initialEntry * 1.15);
  const initialT2 = norm(target2Price, initialEntry * 1.25);

  const [nav, setNav] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("orca_user_nav");
      if (saved && Number(saved) > 0) return Number(saved);
    }
    return 200_000_000;
  });

  const [riskPct, setRiskPct] = useState<number>(1.25);
  const [entry, setEntry] = useState<number>(initialEntry);
  const [sl, setSl] = useState<number>(initialSL);
  const [t1, setT1] = useState<number>(initialT1);
  const [t2, setT2] = useState<number>(initialT2);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("orca_user_nav", String(nav));
    }
  }, [nav]);

  const result = useMemo(() => {
    return calculatePositionSizing({
      nav,
      entryPrice: entry,
      stopLossPrice: sl,
      target1Price: t1,
      target2Price: t2 > entry ? t2 : null,
      maxRiskNavPct: riskPct,
    });
  }, [nav, entry, sl, t1, t2, riskPct]);

  const fmtVnd = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} Tỷ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} Tr`;
    return val.toLocaleString("vi-VN");
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-panel-2/90 p-3.5 text-[12px] shadow-lg backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border-subtle/70 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span className="font-bold text-[13px] text-text-primary">
            Quản trị Vốn & Đi tiền Wyckoff · {symbol}
          </span>
          <span className="rounded bg-accent-primary/15 px-1.5 py-0.2 text-[10px] font-semibold text-accent-primary">
            Quy tắc 1.25% NAV
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
          >
            ✕
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Cột 1: Thông số đầu vào */}
        <div className="space-y-2.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Tổng vốn NAV (VNĐ)
              </label>
              <span className="font-mono text-emerald-400 font-bold">{fmtVnd(nav)}</span>
            </div>
            <input
              type="number"
              step="10000000"
              value={nav}
              onChange={(e) => setNav(Math.max(1_000_000, Number(e.target.value) || 0))}
              className="input !w-full !px-2.5 !py-1.5 font-mono text-[12px]"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {QUICK_NAVS.map((qn) => (
                <button
                  key={qn.value}
                  type="button"
                  onClick={() => setNav(qn.value)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                    nav === qn.value
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-surface-elevated text-text-muted hover:text-text-primary"
                  }`}
                >
                  {qn.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Rủi ro tối đa cho 1 deal (% NAV)
            </label>
            <div className="flex flex-wrap gap-1">
              {RISK_PRESETS.map((rp) => (
                <button
                  key={rp.value}
                  type="button"
                  onClick={() => setRiskPct(rp.value)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    riskPct === rp.value
                      ? "bg-accent-primary text-white font-semibold"
                      : "bg-surface-elevated text-text-muted hover:text-text-primary"
                  }`}
                >
                  {rp.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <div>
              <label className="block text-[10px] text-text-muted">Giá mua (Entry)</label>
              <input
                type="number"
                step="100"
                value={entry}
                onChange={(e) => setEntry(Number(e.target.value) || 0)}
                className="input !w-full !px-1.5 !py-1 font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-rose-400">Cắt lỗ (SL)</label>
              <input
                type="number"
                step="100"
                value={sl}
                onChange={(e) => setSl(Number(e.target.value) || 0)}
                className="input !w-full !px-1.5 !py-1 font-mono text-[11px] text-rose-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-emerald-400">Mục tiêu (T1)</label>
              <input
                type="number"
                step="100"
                value={t1}
                onChange={(e) => setT1(Number(e.target.value) || 0)}
                className="input !w-full !px-1.5 !py-1 font-mono text-[11px] text-emerald-400"
              />
            </div>
          </div>
        </div>

        {/* Cột 2: Kết quả tính toán & Khuyến nghị */}
        <div className="flex flex-col justify-between rounded-lg border border-border-subtle/80 bg-background-secondary/50 p-3">
          {result ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-border-subtle/60 pb-1.5">
                <span className="text-[11px] text-text-muted">Đánh giá thiết lập:</span>
                <span
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${
                    result.rating === "OPTIMAL"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : result.rating === "ACCEPTABLE"
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {result.rating === "OPTIMAL" ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {result.ratingVi}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border-subtle bg-surface-elevated/40 p-2">
                  <div className="text-[10px] text-text-muted">Số lượng mua (lô 100)</div>
                  <div className="font-mono text-[15px] font-bold text-accent-primary mt-0.5">
                    {result.sharesToBuy.toLocaleString("vi-VN")} <span className="text-[11px] font-normal text-text-secondary">CP</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {fmtVnd(result.actualInvestmentVnd)} ({result.cappedWeightPct}% NAV)
                  </div>
                </div>

                <div className="rounded border border-border-subtle bg-surface-elevated/40 p-2">
                  <div className="text-[10px] text-rose-400">Rủi ro tối đa nếu SL</div>
                  <div className="font-mono text-[15px] font-bold text-rose-400 mt-0.5">
                    -{fmtVnd(result.maxLossVnd)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    Mất {result.actualRiskNavPct}% NAV (SL -{result.riskPercent}%)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border-subtle bg-surface-elevated/40 p-2">
                  <div className="text-[10px] text-emerald-400">Lợi nhuận mục tiêu T1</div>
                  <div className="font-mono text-[13px] font-bold text-emerald-400 mt-0.5">
                    +{fmtVnd(result.maxProfit1Vnd)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    +{result.reward1Percent}% · <b>R:R 1:{result.rr1}</b>
                  </div>
                </div>

                {result.maxProfit2Vnd != null ? (
                  <div className="rounded border border-border-subtle bg-surface-elevated/40 p-2">
                    <div className="text-[10px] text-cyan-400">Lợi nhuận mục tiêu T2</div>
                    <div className="font-mono text-[13px] font-bold text-cyan-400 mt-0.5">
                      +{fmtVnd(result.maxProfit2Vnd)}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      +{result.reward2Percent}% · <b>R:R 1:{result.rr2}</b>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-border-subtle bg-surface-elevated/40 p-2 flex items-center justify-center text-[10px] text-text-muted">
                    Chưa đạt mốc T2 mở rộng
                  </div>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-text-secondary border-t border-border-subtle/50 pt-1.5 mt-1">
                💡 <b>Lời khuyên</b>: {result.adviceVi}
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-text-muted p-4">
              <AlertTriangle className="size-5 text-amber-400 mb-1" />
              <span>Giá Cắt lỗ (SL) phải nhỏ hơn Giá mua (Entry). Vui lòng điều chỉnh lại.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
