"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  RotateCcw,
  TrendingUp,
  PiggyBank,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { useSettings } from "@/lib/settings";
import type { ApiResponse, Meta } from "@/lib/types";
import { OrcaMark } from "@/components/logo";
import { loadProfileFromStorage, loadSnapshotsFromStorage } from "@/features/personal-finance/storage/financeStore";

type WidgetMode = "market" | "finance";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  mode: WidgetMode;
  meta?: Meta | null;
  confidence?: string;
  dataQuality?: string;
  model?: string | null;
  mood?: string;
}

const MARKET_PRESETS = [
  "Thị trường VN30 hôm nay thế nào?",
  "Phân tích cổ phiếu FPT",
  "Chiến lược phái sinh VN30F1M",
  "Giá vàng thế giới & tỷ giá USD",
  "Tin tức kinh tế vĩ mô nổi bật",
];

const FINANCE_PRESETS = [
  "Lương của mình nên chia 50/30/20 ra sao?",
  "Quy tắc 6 chiếc lọ (JARS) áp dụng vào mình?",
  "Vừa nhận thưởng 20 triệu nên chia thế nào?",
  "Có 50 triệu nên gửi tiết kiệm hay mua vàng?",
  "Với dòng tiền hiện tại, có nên mua xe trả góp?",
  "Chiến lược dập nợ và tăng quỹ dự phòng?",
];

function renderFormattedText(text: string) {
  return text.split("\n").map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={idx} className="mt-2 text-xs font-bold text-teal-400">
          {trimmed.slice(4)}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={idx} className="mt-2 text-sm font-bold text-cyan-300">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (/^[-•*] /.test(trimmed)) {
      return (
        <div key={idx} className="ml-2 flex items-start gap-1.5 text-xs text-slate-200">
          <span className="text-cyan-400">•</span>
          <span>{renderInlineBold(trimmed.slice(2))}</span>
        </div>
      );
    }
    if (!trimmed) return <div key={idx} className="h-1.5" />;
    return (
      <p key={idx} className="text-xs leading-relaxed text-slate-200">
        {renderInlineBold(line)}
      </p>
    );
  });
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AiAssistantWidget() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const isPersonalFinanceRoute = pathname.startsWith("/personal-finance");

  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<WidgetMode>(isPersonalFinanceRoute ? "finance" : "market");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Responsive mobile breakpoint check
  useEffect(() => {
    const checkViewport = () => setIsMobile(window.innerWidth < 768);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Synchronize default mode when user changes main routes
  const [prevIsFinance, setPrevIsFinance] = useState(isPersonalFinanceRoute);
  if (prevIsFinance !== isPersonalFinanceRoute) {
    setPrevIsFinance(isPersonalFinanceRoute);
    if (isPersonalFinanceRoute) {
      setMode("finance");
    }
  }

  // Market conversation history
  const [marketMessages, setMarketMessages] = useState<ChatMsg[]>([
    {
      id: "market-welcome",
      role: "assistant",
      mode: "market",
      timestamp: "Bây giờ",
      text: "Xin chào! Mình là ORCA Agent — trợ lý phân tích thị trường chứng khoán, tiền số, hàng hóa và phái sinh. Bạn muốn tìm hiểu mã nào hay diễn biến thị trường hôm nay?",
    },
  ]);

  // Personal Finance conversation history
  const [financeMessages, setFinanceMessages] = useState<ChatMsg[]>([
    {
      id: "finance-welcome",
      role: "assistant",
      mode: "finance",
      timestamp: "Bây giờ",
      text: "Xin chào! Trợ lý ORCA sẵn sàng hỗ trợ phân tích thu chi, phân bổ dòng tiền 50/30/20, tối ưu nợ và xây dựng quỹ dự phòng theo số liệu thực tế.",
    },
  ]);

  const messages = mode === "market" ? marketMessages : financeMessages;
  const setMessages = mode === "market" ? setMarketMessages : setFinanceMessages;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, busy, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Listen to global open event
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ mode?: WidgetMode }>;
      setIsOpen(true);
      if (custom.detail?.mode) {
        setMode(custom.detail.mode);
      }
    };
    window.addEventListener("orca:open-ai-widget", handleOpen);
    return () => window.removeEventListener("orca:open-ai-widget", handleOpen);
  }, []);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleClearChat = useCallback(() => {
    if (mode === "market") {
      setMarketMessages([
        {
          id: `market-${Date.now()}`,
          role: "assistant",
          mode: "market",
          timestamp: "Bây giờ",
          text: "Đã làm mới cuộc trò chuyện thị trường. Bạn cần phân tích cổ phiếu hay thông tin gì?",
        },
      ]);
    } else {
      setFinanceMessages([
        {
          id: `finance-${Date.now()}`,
          role: "assistant",
          mode: "finance",
          timestamp: "Bây giờ",
          text: "Đã làm mới đoạn hội thoại. Bạn muốn phân tích hoặc lập kế hoạch tài chính nào tiếp theo?",
        },
      ]);
    }
  }, [mode]);

  // Submit question
  const handleSubmit = useCallback(
    async (queryText?: string) => {
      const question = (queryText || input).trim();
      if (!question || busy) return;

      const userMsgId = `user-${Date.now()}`;
      const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

      const userMessage: ChatMsg = {
        id: userMsgId,
        role: "user",
        text: question,
        timestamp: nowTime,
        mode,
      };

      setMessages((prev) => [...prev, userMessage]);
      if (!queryText) setInput("");
      setBusy(true);

    if (mode === "market") {
      try {
        const history = marketMessages
          .filter((m) => m.text?.trim())
          .slice(-6)
          .map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text.slice(0, 2000),
          }));

        const res = await fetch("/api/v1/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history,
            preferences: settings.ai,
          }),
        });

        const json = (await res.json()) as ApiResponse<{
          answer: string;
          confidence?: string;
          dataQuality?: string;
          model?: string | null;
        }>;

        if (json.success && json.data) {
          setMarketMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: json.data.answer,
              timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
              mode: "market",
              confidence: json.data.confidence,
              dataQuality: json.data.dataQuality,
              model: json.data.model,
            },
          ]);
        } else {
          setMarketMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              text: `Không thể phân tích: ${json.error?.message || "Lỗi máy chủ"}`,
              timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
              mode: "market",
            },
          ]);
        }
      } catch {
        setMarketMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            text: "Lỗi kết nối tới Agent thị trường. Vui lòng thử lại sau.",
            timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            mode: "market",
          },
        ]);
      } finally {
        setBusy(false);
      }
    } else {
      try {
        const snapshots = loadSnapshotsFromStorage();
        const curSnap = snapshots[0];

        const snapshotFacts = curSnap
          ? {
              period: curSnap.period,
              netIncome: curSnap.income.netTakeHome,
              grossIncome: curSnap.income.grossSalary,
              totalExpenses: curSnap.metrics.totalExpenses,
              fixedExpenses: curSnap.expenses.filter((e) => e.isFixed).reduce((s, e) => s + e.amount, 0),
              monthlySavings: curSnap.metrics.monthlySavings,
              savingsRate: curSnap.metrics.savingsRate,
              emergencyFundMonths: curSnap.metrics.emergencyFundMonths,
              totalDebt: curSnap.metrics.totalDebt,
              netWorth: curSnap.metrics.netWorth,
              debtsList: curSnap.debts,
              expensesList: curSnap.expenses,
              goalsList: curSnap.goals,
            }
          : undefined;

        const conversationHistory = financeMessages.slice(-4).map((m) => ({
          sender: m.role === "user" ? "user" : "orca",
          text: m.text,
        }));

        const res = await fetch("/api/ask-orca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            snapshotFacts,
            conversationHistory,
          }),
        });

        const json = (await res.json()) as ApiResponse<{ answer: string; mood?: string }>;

        if (json.success && json.data) {
          setFinanceMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text: json.data.answer,
              timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
              mode: "finance",
              mood: json.data.mood,
            },
          ]);
        } else {
          setFinanceMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              text: `Không thể hoàn tất tính toán: ${json.error?.message || "Lỗi xử lý"}`,
              timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
              mode: "finance",
            },
          ]);
        }
      } catch {
        setFinanceMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            text: "Lỗi kết nối tới ORCA AI. Vui lòng kiểm tra mạng và thử lại.",
            timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            mode: "finance",
          },
        ]);
      } finally {
        setBusy(false);
      }
    }
  }, [busy, financeMessages, input, marketMessages, mode, setMessages, settings.ai]);

  const currentPresets = mode === "market" ? MARKET_PRESETS : FINANCE_PRESETS;

  // Fixed bottom position guarantees it stays at bottom-right corner
  const fixedBottom = isMobile ? "76px" : "24px";
  const fixedRight = "20px";

  return (
    <>
      {/* 1. Compact Circular Killer Whale Sticker Launcher Button */}
      {!isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: fixedBottom,
            right: fixedRight,
            zIndex: 99999,
          }}
        >
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Mở Trợ lý AI Orca"
            title="Mở Trợ lý ORCA AI"
            className="group relative flex size-14 items-center justify-center rounded-full bg-slate-900/90 border-2 border-cyan-400/50 shadow-2xl shadow-cyan-500/30 hover:border-cyan-300 hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer select-none"
          >
            {/* Ambient Pulsing Glow */}
            <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-400 opacity-30 blur-md group-hover:opacity-60 transition-opacity animate-pulse pointer-events-none" />

            {/* Clean Orca Brand Mark */}
            <OrcaMark size={32} className="relative select-none pointer-events-none drop-shadow-md group-hover:scale-105 transition-transform duration-300" />

            {/* Online Indicator Badge */}
            <span className="absolute top-0 right-0 flex size-3.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex size-3.5 rounded-full border-2 border-slate-900 bg-emerald-500" />
            </span>
          </button>
        </div>
      )}

      {/* 2. Interactive Floating Chat Widget Window */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: fixedBottom,
            right: fixedRight,
            width: isMaximized ? "min(640px, calc(100vw - 32px))" : "min(410px, calc(100vw - 32px))",
            height: isMaximized ? "min(720px, calc(100vh - 120px))" : "min(580px, calc(100vh - 120px))",
            maxHeight: "calc(100vh - 110px)",
            zIndex: 99999,
          }}
          className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 backdrop-blur-2xl shadow-2xl shadow-black/80 transition-all duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-3.5 py-2.5 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-800/90 border border-cyan-400/30">
                <OrcaMark size={22} className="select-none pointer-events-none" />
                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-slate-900 bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-tight">ORCA AI</span>
                  <span className="rounded bg-teal-400/15 px-1 py-0.2 text-[9px] font-bold text-teal-300 border border-teal-400/30">
                    REALTIME
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {mode === "market" ? "Trợ lý Phân tích Đầu tư" : "Quản lý Tài chính cá nhân"}
                </div>
              </div>
            </div>

            {/* Mode Switcher Pill */}
            <div className="flex items-center rounded-lg bg-slate-800/80 p-0.5 border border-white/5 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setMode("market")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
                  mode === "market"
                    ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <TrendingUp className="size-3" />
                <span>Đầu tư</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("finance")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
                  mode === "finance"
                    ? "bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <PiggyBank className="size-3" />
                <span>Tài chính</span>
              </button>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearChat}
                title="Làm mới đoạn hội thoại"
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized((v) => !v)}
                title={isMaximized ? "Thu nhỏ cửa sổ" : "Mở rộng cửa sổ"}
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors hidden sm:grid"
              >
                {isMaximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Đóng widget"
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
                >
                  <div
                    className={`group relative max-w-[88%] rounded-2xl p-3 text-xs shadow-sm ${
                      isUser
                        ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-br-xs"
                        : "bg-slate-900/90 text-slate-200 border border-white/10 rounded-bl-xs"
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-white/5 text-[10px] text-slate-400">
                        <span className="font-semibold text-cyan-300">
                          {m.mode === "market" ? "ORCA Market Intel" : "ORCA Personal Finance"}
                        </span>
                        {m.confidence && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-400/10 text-cyan-300">
                            Độ tin cậy: {m.confidence}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap leading-relaxed">
                      {isUser ? m.text : renderFormattedText(m.text)}
                    </div>

                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.text)}
                        title="Sao chép câu trả lời"
                        className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 grid size-6 place-items-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                      >
                        {copiedId === m.id ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      </button>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 px-1">{m.timestamp}</span>
                </div>
              );
            })}

            {busy && (
              <div className="flex items-start gap-2 max-w-[85%] rounded-2xl rounded-bl-xs bg-slate-900/90 p-3 text-xs text-slate-300 border border-white/10">
                <div className="flex items-center gap-1.5 py-1">
                  <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce" />
                  <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="ml-2 text-[11px] text-slate-400">
                    {mode === "market" ? "Đang phân tích dữ liệu thị trường..." : "Đang tính toán số liệu..."}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="border-t border-white/5 bg-slate-900/40 p-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 shrink-0 font-medium flex items-center gap-1">
                <Zap className="size-3 text-amber-400" /> Gợi ý:
              </span>
              {currentPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={busy}
                  onClick={() => handleSubmit(preset)}
                  className="shrink-0 rounded-full border border-white/10 bg-slate-800/70 px-2.5 py-0.8 text-[10.5px] text-slate-300 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors whitespace-nowrap active:scale-95 disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Input Footer */}
          <div className="border-t border-white/10 bg-slate-900/90 p-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "market"
                    ? "Hỏi về cổ phiếu, phái sinh, crypto, vàng..."
                    : "Hỏi chia lương, phân bổ thưởng, trả góp, nợ..."
                }
                disabled={busy}
                className="flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="Gửi câu hỏi"
                className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 font-bold hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-cyan-500/20"
              >
                <Send className="size-3.5" />
              </button>
            </form>
            <div className="mt-1 text-center text-[9.5px] text-slate-500">
              Trợ lý ORCA Realtime • Nhấn Enter để gửi
            </div>
          </div>
        </div>
      )}
    </>
  );
}
