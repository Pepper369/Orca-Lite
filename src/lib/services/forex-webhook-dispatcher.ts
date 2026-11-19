/**
 * FOREX WEBHOOK DISPATCHER & AUTOMATION BRIDGE
 *
 * Formats and dispatches institutional quant signals to:
 * 1. Telegram VIP Alert Channel (Markdown formatted)
 * 2. MetaTrader 4 / MetaTrader 5 EA (MQL4/MQL5 WebRequest JSON payload)
 * 3. Discord / Slack Webhooks
 */

import type { ForexQuantSignalItem } from "./forex-signals-hub";
import { isSafeWebhookUrl } from "@/lib/webhook-security";

export interface Mt5EaSignalPayload {
  version: "1.0";
  timestamp: number;
  ticketId: string;
  magicNumber: number;
  symbol: string;
  cmd: "OP_BUY" | "OP_SELL";
  type: "BUY" | "SELL";
  price: number;
  sl: number;
  tp: number;
  tp1: number;
  tp2: number;
  tp3: number;
  lots: number;
  riskPct: number;
  comment: string;
}

export interface TelegramAlertPayload {
  chatId?: string;
  text: string;
  parseMode: "MarkdownV2" | "Markdown" | "HTML";
}

export interface WebhookDispatchResult {
  success: boolean;
  target: string;
  status: number;
  message: string;
  timestamp: number;
}

/**
 * Builds MetaTrader 4 / MetaTrader 5 EA compatible JSON order payload.
 */
export function buildMt5EaOrder(signal: ForexQuantSignalItem, magicNumber = 888369): Mt5EaSignalPayload {
  const isBuy = signal.direction === "BUY";
  const cmd = isBuy ? "OP_BUY" : "OP_SELL";
  const type = isBuy ? "BUY" : "SELL";
  const price = signal.entryPrice ?? signal.lastPrice;
  const sl = signal.stopLossPrice ?? (isBuy ? price * 0.995 : price * 1.005);
  const tp = signal.tp2 ?? signal.tp1 ?? (isBuy ? price * 1.01 : price * 0.99);

  return {
    version: "1.0",
    timestamp: Date.now(),
    ticketId: `ORCA-${signal.pair}-${Date.now().toString().slice(-6)}`,
    magicNumber,
    symbol: signal.pair,
    cmd,
    type,
    price: Math.round(price * 10000) / 10000,
    sl: Math.round(sl * 10000) / 10000,
    tp: Math.round(tp * 10000) / 10000,
    tp1: Math.round((signal.tp1 ?? tp) * 10000) / 10000,
    tp2: Math.round((signal.tp2 ?? tp) * 10000) / 10000,
    tp3: Math.round((signal.tp3 ?? tp) * 10000) / 10000,
    lots: signal.recommendedLots || 0.1,
    riskPct: 1.0,
    comment: `OrcaQuant_${signal.pair}`,
  };
}

/**
 * Formats a signal into a Telegram VIP alert message.
 */
export function buildTelegramAlertMessage(signal: ForexQuantSignalItem): string {
  const isBuy = signal.direction === "BUY";
  const icon = isBuy ? "🟢 MUA (BUY)" : "🔴 BÁN (SELL)";
  const digits = signal.pair.includes("JPY") ? 2 : signal.pair.startsWith("XAU") ? 2 : 4;

  const fmt = (v: number | null | undefined) =>
    v != null ? (v >= 100 ? v.toFixed(2) : v.toFixed(digits)) : "—";

  return [
    `⚡ *ORCA QUANT FOREX VIP SIGNAL* ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Cặp tiền:* #${signal.pair} (${signal.symbol})`,
    `🎯 *Khuyến nghị:* ${icon}`,
    `📊 *Khung thời gian:* ${signal.timeframe} · Độ tin cậy: *${signal.probability}%*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🔹 *Điểm vào (Entry):* \`${fmt(signal.entryPrice)}\``,
    `🛑 *Cắt lỗ (Stop Loss):* \`${fmt(signal.stopLossPrice)}\` (${signal.stopPips ?? 25} pips)`,
    `🎯 *Mục tiêu 1 (TP1 - R:R 1.2):* \`${fmt(signal.tp1)}\` *(Chốt 50% + dời SL về BE)*`,
    `🎯 *Mục tiêu 2 (TP2 - R:R 2.0):* \`${fmt(signal.tp2)}\` *(Chốt tiếp 30%)*`,
    `🎯 *Mục tiêu 3 (TP3 - R:R 3.0):* \`${fmt(signal.tp3)}\` *(Gồng lãi 20%)*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💼 *Khối lượng khuyến nghị:* \`${signal.recommendedLots} Lot\` (Vốn $10k · Rủi ro 1% = $100)`,
    `🏛 *Thị trường:* ${signal.regime} · Phiên: ${signal.session}`,
    `⚠️ *Lưu ý quản lý vốn:* Tuân thủ kỷ luật cắt lỗ tuyệt đối, không nhồi lệnh.`,
  ].join("\n");
}

/**
 * Dispatches a payload to a target webhook URL.
 */
export async function dispatchForexWebhook(
  targetUrl: string,
  payload: Record<string, unknown>
): Promise<WebhookDispatchResult> {
  const safe = await isSafeWebhookUrl(targetUrl, "generic");
  if (!safe.ok) {
    return {
      success: false,
      target: targetUrl,
      status: 403,
      message: safe.reason ?? "Webhook URL bị chặn bởi bộ lọc SSRF",
      timestamp: Date.now(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Orca-Quant-Forex-Dispatcher/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    return {
      success: res.ok,
      target: targetUrl,
      status: res.status,
      message: res.ok ? "Đã gửi webhook thành công." : `Lỗi HTTP ${res.status}`,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gửi webhook thất bại";
    return {
      success: false,
      target: targetUrl,
      status: 500,
      message,
      timestamp: Date.now(),
    };
  }
}

