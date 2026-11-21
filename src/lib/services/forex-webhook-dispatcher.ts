/**
 * FOREX WEBHOOK DISPATCHER & AUTOMATION BRIDGE
 *
 * Formats and dispatches institutional quant signals to:
 * 1. Telegram VIP Alert Channel (Markdown formatted)
 * 2. MetaTrader 4 / MetaTrader 5 EA (MQL4/MQL5 WebRequest JSON payload)
 * 3. Discord / Slack Webhooks
 */

import type { ForexQuantSignalItem } from "./forex-signals-hub";
import { getPriceDecimals, roundPrice } from "@/lib/engines/asset-precision";
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
 * Sanitizes untrusted text fields before embedding into Telegram Markdown or JSON webhook alerts.
 * Strips control chars, newlines, and Markdown/HTML/JSON injection tokens.
 */
export function sanitizeWebhookText(raw: unknown, maxLen = 40): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[*_`[\]()~>#+=|{}!\\"<>$']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitizes MT4/MT5 OrderSend comment string (strict ASCII alphanumeric + underscore/hyphen/dot, max 31 chars).
 */
export function sanitizeMt5Comment(raw: unknown, maxLen = 31): string {
  if (raw == null) return "OrcaQuant";
  const cleaned = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, Math.min(31, Math.max(1, maxLen)));
  return cleaned || "OrcaQuant";
}

/**
 * Builds MetaTrader 4 / MetaTrader 5 EA compatible JSON order payload.
 * Guards against non-finite prices, inverted SL/TP geometry, and comment/symbol injection.
 */
export function buildMt5EaOrder(signal: ForexQuantSignalItem, magicNumber = 888369): Mt5EaSignalPayload {
  const isBuy = signal.direction !== "SELL";
  const cmd = isBuy ? "OP_BUY" : "OP_SELL";
  const type = isBuy ? "BUY" : "SELL";
  const cleanPair =
    String(signal.pair ?? "EURUSD")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 16) || "EURUSD";
  const safeMagic =
    Number.isFinite(magicNumber) && magicNumber > 0
      ? Math.min(2147483647, Math.trunc(magicNumber))
      : 888369;

  const rawPrice =
    Number.isFinite(signal.entryPrice) && (signal.entryPrice ?? 0) > 0
      ? signal.entryPrice!
      : Number.isFinite(signal.lastPrice) && signal.lastPrice > 0
        ? signal.lastPrice
        : 0;

  if (rawPrice <= 0) {
    return {
      version: "1.0",
      timestamp: Date.now(),
      ticketId: `ORCA-${cleanPair}-${Date.now().toString().slice(-6)}`,
      magicNumber: safeMagic,
      symbol: cleanPair,
      cmd,
      type,
      price: 0,
      sl: 0,
      tp: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      lots: 0,
      riskPct: 0,
      comment: sanitizeMt5Comment(`OrcaQuant_${cleanPair}_INVALID`),
    };
  }

  const validSl =
    Number.isFinite(signal.stopLossPrice) &&
    (signal.stopLossPrice ?? 0) > 0 &&
    (isBuy ? signal.stopLossPrice! < rawPrice : signal.stopLossPrice! > rawPrice)
      ? signal.stopLossPrice!
      : isBuy
        ? rawPrice * 0.995
        : rawPrice * 1.005;

  const validTp1 =
    Number.isFinite(signal.tp1) &&
    (signal.tp1 ?? 0) > 0 &&
    (isBuy ? signal.tp1! > rawPrice : signal.tp1! < rawPrice)
      ? signal.tp1!
      : isBuy
        ? rawPrice * 1.01
        : rawPrice * 0.99;

  const validTp2 =
    Number.isFinite(signal.tp2) &&
    (signal.tp2 ?? 0) > 0 &&
    (isBuy ? signal.tp2! >= validTp1 : signal.tp2! <= validTp1)
      ? signal.tp2!
      : isBuy
        ? Math.max(validTp1, rawPrice * 1.015)
        : Math.min(validTp1, rawPrice * 0.985);

  const validTp3 =
    Number.isFinite(signal.tp3) &&
    (signal.tp3 ?? 0) > 0 &&
    (isBuy ? signal.tp3! >= validTp2 : signal.tp3! <= validTp2)
      ? signal.tp3!
      : isBuy
        ? Math.max(validTp2, rawPrice * 1.02)
        : Math.min(validTp2, rawPrice * 0.98);

  const safeLots =
    Number.isFinite(signal.recommendedLots) && signal.recommendedLots > 0
      ? Math.max(0.01, Math.min(50, Number(signal.recommendedLots.toFixed(2))))
      : 0.1;

  return {
    version: "1.0",
    timestamp: Date.now(),
    ticketId: `ORCA-${cleanPair}-${Date.now().toString().slice(-6)}`,
    magicNumber: safeMagic,
    symbol: cleanPair,
    cmd,
    type,
    price: roundPrice(rawPrice, cleanPair, "FOREX"),
    sl: roundPrice(validSl, cleanPair, "FOREX"),
    tp: roundPrice(validTp2, cleanPair, "FOREX"),
    tp1: roundPrice(validTp1, cleanPair, "FOREX"),
    tp2: roundPrice(validTp2, cleanPair, "FOREX"),
    tp3: roundPrice(validTp3, cleanPair, "FOREX"),
    lots: safeLots,
    riskPct: 1.0,
    comment: sanitizeMt5Comment(`OrcaQuant_${cleanPair}`),
  };
}

/**
 * Formats a signal into a Telegram VIP alert message with Markdown injection sanitization
 * and price geometry validation.
 */
export function buildTelegramAlertMessage(signal: ForexQuantSignalItem): string {
  const isBuy = signal.direction !== "SELL";
  const icon = isBuy ? "🟢 MUA (BUY)" : "🔴 BÁN (SELL)";
  const cleanPair =
    String(signal.pair ?? "EURUSD")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 16) || "EURUSD";
  const cleanSymbol =
    String(signal.symbol ?? cleanPair)
      .toUpperCase()
      .replace(/[^A-Z0-9/._-]/g, "")
      .slice(0, 20) || cleanPair;
  const cleanTimeframe = sanitizeWebhookText(signal.timeframe || "M15/H1", 24) || "M15/H1";
  const cleanRegime = sanitizeWebhookText(signal.regime || "NORMAL", 40) || "NORMAL";
  const cleanSession = sanitizeWebhookText(signal.session || "GLOBAL", 24) || "GLOBAL";

  const entryValid = Number.isFinite(signal.entryPrice) && (signal.entryPrice ?? 0) > 0;
  const lastValid = Number.isFinite(signal.lastPrice) && signal.lastPrice > 0;
  const refPrice = entryValid ? signal.entryPrice! : lastValid ? signal.lastPrice : 1;
  const digits = getPriceDecimals(refPrice, cleanPair, "FOREX");

  const fmt = (v: number | null | undefined, role?: "SL" | "TP") => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return "—";
    if (entryValid && role === "SL") {
      if ((isBuy && v >= signal.entryPrice!) || (!isBuy && v <= signal.entryPrice!)) {
        return "—";
      }
    }
    if (entryValid && role === "TP") {
      if ((isBuy && v <= signal.entryPrice!) || (!isBuy && v >= signal.entryPrice!)) {
        return "—";
      }
    }
    return v.toFixed(digits);
  };

  const safeProbability = Number.isFinite(signal.probability)
    ? Math.max(0, Math.min(100, Math.round(signal.probability)))
    : 0;
  const safeStopPips =
    Number.isFinite(signal.stopPips) && (signal.stopPips ?? 0) > 0
      ? Number(signal.stopPips!.toFixed(1))
      : 25;
  const safeLots =
    Number.isFinite(signal.recommendedLots) && signal.recommendedLots > 0
      ? Math.max(0.01, Math.min(50, Number(signal.recommendedLots.toFixed(2))))
      : 0.1;

  return [
    `⚡ *ORCA QUANT FOREX VIP SIGNAL* ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *Cặp tiền:* #${cleanPair} (${cleanSymbol})`,
    `🎯 *Khuyến nghị:* ${icon}`,
    `📊 *Khung thời gian:* ${cleanTimeframe} · Độ tin cậy: *${safeProbability}%*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🔹 *Điểm vào (Entry):* \`${fmt(signal.entryPrice)}\``,
    `🛑 *Cắt lỗ (Stop Loss):* \`${fmt(signal.stopLossPrice, "SL")}\` (${safeStopPips} pips)`,
    `🎯 *Mục tiêu 1 (TP1 - R:R 1.2):* \`${fmt(signal.tp1, "TP")}\` *(Chốt 50% + dời SL về BE)*`,
    `🎯 *Mục tiêu 2 (TP2 - R:R 2.0):* \`${fmt(signal.tp2, "TP")}\` *(Chốt tiếp 30%)*`,
    `🎯 *Mục tiêu 3 (TP3 - R:R 3.0):* \`${fmt(signal.tp3, "TP")}\` *(Gồng lãi 20%)*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💼 *Khối lượng khuyến nghị:* \`${safeLots} Lot\` (Vốn $10k · Rủi ro 1% = $100)`,
    `🏛 *Thị trường:* ${cleanRegime} · Phiên: ${cleanSession}`,
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
  if (!payload || typeof payload !== "object") {
    return {
      success: false,
      target: targetUrl,
      status: 422,
      message: "Webhook payload không hợp lệ",
      timestamp: Date.now(),
    };
  }

  // Validate MT5 order payload geometry before network dispatch if payload is an EA order
  if (payload.cmd === "OP_BUY" || payload.cmd === "OP_SELL") {
    const price = Number(payload.price);
    const sl = Number(payload.sl);
    const tp = Number(payload.tp ?? payload.tp1);
    const lots = Number(payload.lots);
    const isBuy = payload.cmd === "OP_BUY";
    const geomInvalid =
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(sl) ||
      sl <= 0 ||
      !Number.isFinite(tp) ||
      tp <= 0 ||
      !Number.isFinite(lots) ||
      lots <= 0 ||
      (isBuy && (sl >= price || tp <= price)) ||
      (!isBuy && (sl <= price || tp >= price));
    if (geomInvalid) {
      return {
        success: false,
        target: targetUrl,
        status: 422,
        message: "Từ chối gửi webhook: Thông số giá hoặc cấu trúc SL/TP không hợp lệ",
        timestamp: Date.now(),
      };
    }
  }
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

