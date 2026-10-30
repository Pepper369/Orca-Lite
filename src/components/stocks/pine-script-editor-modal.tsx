"use client";

import React, { useState } from "react";
import type { PineExecutionResult } from "@/lib/engines/pine-runner";

interface Props {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  onExecutePlots?: (result: PineExecutionResult) => void;
}

const TEMPLATES = [
  {
    name: "Golden EMA Cross (9 & 21)",
    code: `//@version=5
indicator("EMA Golden Cross", overlay=true)
emaFast = ta.ema(close, 9)
emaSlow = ta.ema(close, 21)
plot(emaFast, color=color.green, title="EMA 9")
plot(emaSlow, color=color.red, title="EMA 21")`,
  },
  {
    name: "SuperTrend Trend Follower",
    code: `//@version=5
indicator("SuperTrend Pro", overlay=true)
st = ta.supertrend(3.0, 10)
plot(st, color=color.purple, title="SuperTrend 10, 3")`,
  },
  {
    name: "RSI Momentum Line",
    code: `//@version=5
indicator("RSI Custom", overlay=false)
rsiVal = ta.rsi(close, 14)
plot(rsiVal, color=color.orange, title="RSI 14")`,
  },
];

export function PineScriptEditorModal({ symbol, isOpen, onClose, onExecutePlots }: Props) {
  const [code, setCode] = useState(TEMPLATES[0]!.code);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<PineExecutionResult | null>(null);

  if (!isOpen) return null;

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/chart/pine-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe: "1d", script: code }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setOutput(json.data);
        if (onExecutePlots) onExecutePlots(json.data);
      } else {
        setOutput({
          ok: false,
          title: "Error",
          overlay: true,
          plots: [],
          error: json.error || "Execution failed",
        });
      }
    } catch (err: any) {
      setOutput({
        ok: false,
        title: "Error",
        overlay: true,
        plots: [],
        error: err?.message || "Execution error",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-background-secondary shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-surface-base px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-cyan-400" />
            <h3 className="font-bold text-text-primary text-sm sm:text-base">
              Pine Script v5 Studio — {symbol}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-xl font-bold p-1"
          >
            ×
          </button>
        </div>

        {/* Template Selector */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-elevated/40 px-5 py-2">
          <span className="text-xs text-text-tertiary">Mẫu có sẵn:</span>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => setCode(tpl.code)}
              className="text-xs px-2.5 py-1 rounded-md bg-surface-base border border-border-subtle text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
            >
              {tpl.name}
            </button>
          ))}
        </div>

        {/* Code Editor Area */}
        <div className="p-4 flex-1 overflow-auto flex flex-col gap-2">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-input-border bg-black/70 p-3 font-mono text-xs sm:text-sm text-emerald-300 focus:outline-none focus:border-accent resize-none leading-relaxed"
            placeholder="//@version=5..."
            spellCheck={false}
          />

          {output && (
            <div
              className={`rounded-lg p-2.5 text-xs font-mono border ${
                output.ok
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {output.ok ? (
                <div>
                  Thành công: Đã tính {output.plots.length} chuỗi plot (
                  {output.plots.map((p) => p.title).join(", ")}) trên {symbol}.
                </div>
              ) : (
                <div>Lỗi: {output.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-base px-5 py-3">
          <span className="text-[11px] text-text-tertiary">Hỗ trợ: ta.ema, ta.sma, ta.rsi, ta.supertrend, plot()</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-elevated"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              {running ? "Đang tính toán..." : "Chạy Pine Script"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

