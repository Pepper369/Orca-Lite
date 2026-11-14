"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CornerDownLeft, ShieldCheck } from "lucide-react";
import type { ApiResponse, Meta } from "@/lib/types";
import { Badge, Panel } from "@/components/ui";
import { useSettings } from "@/lib/settings";
import { AgentDomainHeader } from "@/components/agent-domain-header";
import type { AgentResponseContext, AgentRoute } from "@/lib/services/agent-router";

interface AgentResult {
  answer: string;
  mode: "deterministic" | "llm";
  intent: string;
  model: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
  dataFreshness: string;
  context: { sectionsUsed: string[]; symbols: string[] };
  route: AgentRoute;
  responses: AgentResponseContext[];
}

interface Msg {
  role: "user" | "agent";
  text: string;
  meta?: Meta | null;
  mode?: string;
  intent?: string;
  confidence?: string;
  dataQuality?: string;
  model?: string | null;
  responses?: AgentResponseContext[];
}

const SUGGESTED = [
  "Phân tích BCTC và chất lượng lợi nhuận của HPG",
  "Định giá cổ phiếu FPT theo mô hình P/E, P/B và DCF",
  "Kiểm tra điểm Piotroski F-Score và Altman Z-Score của VNM",
  "So sánh biên lợi nhuận và sức khỏe tài chính MBB vs TCB",
  "Đánh giá tiêu chuẩn CANSLIM và tăng trưởng EPS của DGC",
  "Cổ phiếu nào đang trả cổ tức tiền mặt cao và an toàn nhất?",
  "Phân tích tác động vĩ mô và lãi suất lên nhóm ngành Thép",
];

const MAX_HISTORY = 8;

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^$]+\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-canvas-2/80 px-1.5 py-0.5 font-mono text-[11px] text-accent font-medium">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      return (
        <span key={i} className="font-mono text-accent font-semibold px-0.5">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

type MarkdownBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "h4"; text: string }
  | { type: "hr" }
  | { type: "callout"; lines: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "space" };

function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  const lines = rawText.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      blocks.push({ type: "space" });
      i++;
      continue;
    }

    // 2. Horizontal divider
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 3. Headings
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "h4", text: trimmed.slice(5).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h2", text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    // 4. Blockquotes / Callout (> ...)
    if (trimmed.startsWith(">")) {
      const calloutLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        calloutLines.push(lines[i]!.trim().replace(/^>\s*/, ""));
        i++;
      }
      blocks.push({ type: "callout", lines: calloutLines });
      continue;
    }

    // 5. Markdown Tables (| ... |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|") && lines[i]!.trim().endsWith("|")) {
        tableLines.push(lines[i]!.trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
        const headers = parseRow(tableLines[0]!);
        const isSep = /^[:\s\-|]+$/.test(tableLines[1]!);
        const rowStart = isSep ? 2 : 1;
        const rows = tableLines.slice(rowStart).map(parseRow);
        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }

    // 6. Lists (- , * , • , 1. )
    if (/^[-*•]\s+|^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+|^\d+\.\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // 7. Normal paragraph
    blocks.push({ type: "paragraph", text: trimmed });
    i++;
  }

  return blocks;
}

export default function AgentPage() {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      text: "Chào bạn — mình là ORCA FA AI Agent. Mình chuyên sâu về Phân tích Cơ bản (FA), Bóc tách BCTC, Định giá Doanh nghiệp (DCF, P/E, P/B), Piotroski F-Score, Altman Z-Score và Hệ thống lọc cổ phiếu CANSLIM/Tăng trưởng. Hãy nhập mã cổ phiếu hoặc câu hỏi cần phân tích!",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function renderAnswer(text: string) {
    const blocks = parseMarkdownBlocks(text);
    return blocks.map((block, index) => {
      switch (block.type) {
        case "callout":
          return (
            <div
              key={index}
              className="my-3 rounded-lg border-l-4 border-accent bg-accent/10 px-4 py-3 text-xs leading-relaxed text-ink shadow-xs"
            >
              {block.lines.map((l, li) => (
                <p key={li} className={li > 0 ? "mt-1.5" : ""}>
                  {renderInline(l)}
                </p>
              ))}
            </div>
          );
        case "table":
          return (
            <div
              key={index}
              className="my-3 overflow-x-auto rounded-lg border border-line bg-canvas/40 shadow-xs"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-canvas-2/80 border-b border-line text-ink font-semibold">
                  <tr>
                    {block.headers.map((h, hi) => (
                      <th key={hi} className="px-3.5 py-2.5 text-accent whitespace-nowrap">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-canvas-2/40 transition-colors">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3.5 py-2 text-ink-2 whitespace-normal">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        case "h2":
          return (
            <h2
              key={index}
              className="mt-4 mb-2 text-sm font-bold text-accent tracking-wide flex items-center gap-1.5 border-b border-line/40 pb-1.5 first:mt-0"
            >
              {renderInline(block.text)}
            </h2>
          );
        case "h3":
          return (
            <h3
              key={index}
              className="mt-3.5 mb-1 text-xs font-semibold text-ink flex items-center gap-1"
            >
              {renderInline(block.text)}
            </h3>
          );
        case "h4":
          return (
            <h4
              key={index}
              className="mt-2.5 mb-1 text-[11px] font-medium text-ink-2"
            >
              {renderInline(block.text)}
            </h4>
          );
        case "hr":
          return <hr key={index} className="my-3.5 border-line/50" />;
        case "list":
          return (
            <div key={index} className="my-2 space-y-1 pl-1">
              {block.items.map((item, ii) => (
                <div key={ii} className="flex items-start gap-2 text-xs text-ink-2 break-words">
                  <span className="text-accent mt-0.5">•</span>
                  <span className="flex-1">
                    {renderInline(item.replace(/^[-*•]\s+|^\d+\.\s+/, ""))}
                  </span>
                </div>
              ))}
            </div>
          );
        case "space":
          return <div key={index} className="h-1.5" />;
        case "paragraph":
          return (
            <p key={index} className="my-1.5 text-xs leading-relaxed text-ink break-words">
              {renderInline(block.text)}
            </p>
          );
      }
    });
  }

  function renderStructured(m: Msg) {
    if (!m.responses?.length) return null;
    return (
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {m.responses.map((ctx) => (
            <AgentDomainHeader
              key={ctx.domain}
              domain={ctx.domain}
              title={ctx.title}
              entity={ctx.relatedEntities[0]}
              updatedAt={m.meta?.sourceTimestamp ? String(m.meta.sourceTimestamp) : (m.meta?.ingestedAt ?? ctx.dataMeta.freshestAt)}
            />
          ))}
        </div>
        {m.responses.map((ctx) => (
          <section
            key={`${ctx.domain}-body`}
            className="rounded-md border border-line/70 bg-canvas/30 p-2.5"
          >
            <h4 className="text-[12px] font-semibold text-accent">Tóm tắt · {ctx.title}</h4>
            <p className="mt-1">{ctx.summary}</p>
            {ctx.analysis.length > 1 ? (
              <div className="mt-1.5 space-y-0.5 text-ink-2">
                {ctx.analysis.slice(1, 4).map((line, i) => (
                  <p key={i}>• {line}</p>
                ))}
              </div>
            ) : null}
            {ctx.risks.length ? (
              <p className="mt-1.5 text-[11px] text-ink-3">
                <strong>Rủi ro:</strong> {ctx.risks.join(" ")}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    );
  }

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 140;
    if (!nearBottom && messages.length > 2) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
  }, [messages, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);

    const prior = messagesRef.current
      .filter((m) => m.text?.trim())
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text.slice(0, 2_500),
      }));

    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");

    const payload = {
      question,
      history: prior,
      preferences: settings.ai,
    };

    const callOnce = async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 55_000);
      try {
        const res = await fetch("/api/v1/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const json = (await res.json()) as ApiResponse<AgentResult>;
        return { res, json };
      } finally {
        window.clearTimeout(timer);
      }
    };

    try {
      let lastErr = "";
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const { res, json } = await callOnce();
          if (json.success) {
            setMessages((m) => [
              ...m,
              {
                role: "agent",
                text: json.data.answer,
                meta: json.meta,
                mode: json.data.mode,
                intent: json.data.intent,
                confidence: json.data.confidence,
                dataQuality: json.data.dataQuality,
                model: json.data.model,
                responses: json.data.responses,
              },
            ]);
            return;
          }
          lastErr = json.error?.message ?? `HTTP ${res.status}`;
          if (res.status >= 500 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
            continue;
          }
          setMessages((m) => [...m, { role: "agent", text: `Không xử lý được: ${lastErr}` }]);
          return;
        } catch (e) {
          lastErr =
            e instanceof Error
              ? e.name === "AbortError"
                ? "hết thời gian chờ (55s)"
                : e.message
              : "network";
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1_000 * attempt));
            continue;
          }
        }
      }
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: `Kết nối tới agent thất bại (${lastErr}) — đã thử 2 lần. Kiểm tra /api/v1/system/llm hoặc thử lại sau.`,
        },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const showSuggestions = messages.length <= 2;

  return (
    <div className="agent-shell mx-auto flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col gap-2 overflow-x-clip">
      <Panel pad={false} className="shrink-0">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Bot className="size-5 shrink-0 text-accent" /> ORCA Financial Agent
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-ink-3 sm:text-[12px]">
              <ShieldCheck className="size-3.5 shrink-0 text-up" /> Nhớ ngữ cảnh phiên · Thị
              trường · Tài chính cá nhân · Gia sản
            </p>
          </div>
          <Badge tone="accent">multi-persona</Badge>
        </div>
      </Panel>

      <div
        ref={listRef}
        className="chat-scroll agent-messages min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden rounded-xl border border-line bg-panel p-3 sm:p-3.5"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`agent-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "max-w-[min(100%,28rem)] border-accent/30 bg-accent/10 text-ink"
                  : "w-full max-w-full border-line bg-panel-2 text-ink"
              }`}
            >
              <div className="space-y-1.5 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                {m.role === "agent" ? (
                  <>
                    {renderStructured(m)}
                    {renderAnswer(m.text)}
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="agent-typing flex items-center gap-2.5 text-[12px] text-ink-3">
            <span className="flex gap-1" aria-hidden>
              <span className="agent-dot size-1.5 rounded-full bg-accent" />
              <span className="agent-dot size-1.5 rounded-full bg-accent" />
              <span className="agent-dot size-1.5 rounded-full bg-accent" />
            </span>
            Đang phân tích…
          </div>
        )}
        <div ref={bottomRef} className="h-3 shrink-0" aria-hidden />
      </div>

      <div className="agent-composer flex min-w-0 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-line bg-canvas px-2.5 pb-2 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.25)]">
        {showSuggestions && (
          <div className="agent-chips -mx-0.5 min-w-0" role="list" aria-label="Câu hỏi gợi ý">
            <div className="agent-chips-track flex gap-1.5 pb-0.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="listitem"
                  onClick={() => ask(s)}
                  disabled={busy}
                  title={s}
                  className="agent-chip max-w-[min(100%,18rem)] shrink-0 truncate rounded-full border border-line bg-panel px-2.5 py-1 text-left text-[11px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex min-w-0 items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi tiếp trong cùng ngữ cảnh, hoặc đổi chủ đề bất kỳ lúc nào…"
            maxLength={800}
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/90 px-3.5 py-2.5 text-[13px] font-semibold text-canvas transition-opacity hover:bg-accent disabled:opacity-50"
          >
            <CornerDownLeft className="size-4" /> Gửi
          </button>
        </form>
        <p className="text-center text-[10px] text-ink-3">
          Enter để gửi · tối đa 800 ký tự · ORCA nghiên cứu — không phải khuyến nghị
        </p>
      </div>
    </div>
  );
}
