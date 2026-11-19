import "server-only";

import { putHot, getHot } from "@/lib/hot-snapshot";
import { postGlobalDiscord } from "@/lib/services/discord-notify";
import { isSafeWebhookUrl, looksLikeTelegramToken } from "@/lib/webhook-security";
import {
  getMasterScreenerSnapshot,
  queryScreenerStocks,
  type ScreenerPreset,
  type ScreenerStockItem,
} from "@/lib/services/screener-snapshot-service";

export interface ScreenerAlertTrigger {
  preset: ScreenerPreset;
  presetNameVi: string;
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  volRatio20?: number | null;
  buyPoint?: number | null;
  buyPointDiffPct?: number | null;
  buyZoneStatus?: string | null;
  rsRating?: number | null;
  compositeScore?: number | null;
  vsaSignal?: string | null;
  setupGrade?: string | null;
  tripleBarrierLower?: number | null;
  tripleBarrierUpper?: number | null;
  tripleBarrierRiskReward?: number | null;
  triggeredAt: string;
}

export const ALERT_MONITORED_PRESETS: Array<{
  preset: ScreenerPreset;
  nameVi: string;
  emoji: string;
  color: number;
}> = [
  { preset: "apex_buy_now", nameVi: "Chân Sóng Apex (Buy Now)", emoji: "🚀", color: 0x10b981 },
  { preset: "smc_golden_pocket", nameVi: "SMC Golden Pocket (0.618 - 0.65)", emoji: "🏆", color: 0xf59e0b },
  { preset: "bottom_confluence", nameVi: "Hợp Lưu Bắt Đáy Đảo Chiều", emoji: "⚓", color: 0x06b6d4 },
  { preset: "breakout", nameVi: "Breakout Vượt Đỉnh Khối Lượng Lớn", emoji: "⚡", color: 0x8b5cf6 },
];

/** In-memory cooldown cache to prevent spamming the same symbol within 30 minutes */
const firedAlertCooldown = new Map<string, number>();
const COOLDOWN_MS = 30 * 60_000;

/** Send alert to global Telegram Bot if configured */
export async function postGlobalTelegram(text: string): Promise<{
  ok: boolean;
  skipped: boolean;
  reason?: string;
}> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN)?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: "no_TELEGRAM_BOT_TOKEN_or_CHAT_ID" };
  }

  try {
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Orca-Multi-Finance/1.0",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, skipped: false, reason: `http_${res.status}:${errText.slice(0, 100)}` };
    }

    return { ok: true, skipped: false };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reason: e instanceof Error ? e.message : "telegram_fetch_failed",
    };
  }
}

/** Format HTML text for Telegram alert */
function formatTelegramAlert(trigger: ScreenerAlertTrigger, emoji: string): string {
  const pStr = trigger.price.toLocaleString("vi-VN") + " đ";
  const chgStr = (trigger.changePercent >= 0 ? "+" : "") + trigger.changePercent.toFixed(2) + "%";
  const volStr = trigger.volume.toLocaleString("vi-VN");
  const volRatio = trigger.volRatio20 ? ` (${trigger.volRatio20.toFixed(1)}x MA20)` : "";
  const bpStr = trigger.buyPoint ? `${trigger.buyPoint.toLocaleString("vi-VN")} đ` : "—";
  const diffStr = trigger.buyPointDiffPct != null ? ` (${trigger.buyPointDiffPct >= 0 ? "+" : ""}${trigger.buyPointDiffPct.toFixed(1)}%)` : "";

  const sl = trigger.tripleBarrierLower ? `${Math.round(trigger.tripleBarrierLower).toLocaleString("vi-VN")} đ` : `${Math.round(trigger.price * 0.94).toLocaleString("vi-VN")} đ`;
  const tp = trigger.tripleBarrierUpper ? `${Math.round(trigger.tripleBarrierUpper).toLocaleString("vi-VN")} đ` : `${Math.round(trigger.price * 1.12).toLocaleString("vi-VN")} đ`;
  const rr = trigger.tripleBarrierRiskReward ? `${trigger.tripleBarrierRiskReward.toFixed(1)}x` : "2.0x";

  return [
    `${emoji} <b>ORCA SCREENER ALERT · ${trigger.symbol}</b>`,
    `<b>Bộ lọc:</b> ${trigger.presetNameVi}`,
    `<b>Thị giá:</b> <code>${pStr}</code> (${chgStr})`,
    `<b>Khối lượng:</b> ${volStr}${volRatio}`,
    `<b>Điểm mua (Pivot):</b> ${bpStr}${diffStr}`,
    `<b>Sức mạnh RS:</b> ${trigger.rsRating ?? "N/A"}/99 · <b>Điểm Master:</b> ${trigger.compositeScore ?? "N/A"}/100`,
    trigger.vsaSignal ? `<b>Tín hiệu VSA:</b> <i>${trigger.vsaSignal}</i>` : null,
    `<b>Kế hoạch R:R (${rr}):</b> SL: <code>${sl}</code> | TP: <code>${tp}</code>`,
    `<i>Thời gian quét: ${new Date(trigger.triggeredAt).toLocaleTimeString("vi-VN")}</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Execute Screener Alert Monitor: compares T against T-1 snapshot,
 * detects newly qualifying stocks, and dispatches real-time webhooks.
 */
export async function runScreenerAlertMonitor(options?: {
  forceDispatch?: boolean;
  webhookUrl?: string;
  provider?: "discord" | "telegram";
  secret?: string;
}): Promise<{
  ok: boolean;
  scannedPresets: number;
  newlyTriggeredCount: number;
  alerts: ScreenerAlertTrigger[];
  discordDispatched: number;
  telegramDispatched: number;
  durationMs: number;
}> {
  const t0 = Date.now();
  const alerts: ScreenerAlertTrigger[] = [];
  let discordDispatched = 0;
  let telegramDispatched = 0;

  // 1. Ensure master snapshot is fresh
  const snapshot = await getMasterScreenerSnapshot();
  if (!snapshot?.items?.length) {
    return {
      ok: false,
      scannedPresets: 0,
      newlyTriggeredCount: 0,
      alerts: [],
      discordDispatched: 0,
      telegramDispatched: 0,
      durationMs: Date.now() - t0,
    };
  }

  // 2. Read previous state (T-1) from hot snapshot
  const prevEntry = await getHot("screener-alerts-prev");
  const prevMap: Record<string, string[]> =
    prevEntry?.data && typeof prevEntry.data === "object"
      ? (prevEntry.data as Record<string, string[]>)
      : {};

  const currentMap: Record<string, string[]> = {};
  const now = Date.now();

  // 3. Scan each monitored preset
  for (const config of ALERT_MONITORED_PRESETS) {
    const res = await queryScreenerStocks({
      preset: config.preset,
      limit: 60,
    });

    const currentSymbols = res.items.map((s) => s.symbol);
    currentMap[config.preset] = currentSymbols;

    const prevSymbols = prevMap[config.preset] || [];
    const prevSet = new Set(prevSymbols);

    // Identify newly added symbols
    const candidates = res.items.filter((item) => {
      if (options?.forceDispatch) return true;
      return !prevSet.has(item.symbol);
    });

    for (const item of candidates) {
      const cooldownKey = `${config.preset}:${item.symbol}`;
      const lastFired = firedAlertCooldown.get(cooldownKey) || 0;

      if (!options?.forceDispatch && now - lastFired < COOLDOWN_MS) {
        continue; // Skip within cooldown window
      }

      const trigger: ScreenerAlertTrigger = {
        preset: config.preset,
        presetNameVi: config.nameVi,
        symbol: item.symbol,
        price: item.price ?? 0,
        changePercent: item.changePercent ?? 0,
        volume: item.volume ?? 0,
        volRatio20: item.volRatio20,
        buyPoint: item.buyPoint,
        buyPointDiffPct: item.buyPointDiffPct,
        buyZoneStatus: item.buyZoneStatus,
        rsRating: item.rsRating,
        compositeScore: item.compositeScore,
        vsaSignal: item.vsaSignal || item.smartMoneySignal,
        setupGrade: item.setupGrade,
        tripleBarrierLower: item.tripleBarrierLower,
        tripleBarrierUpper: item.tripleBarrierUpper,
        tripleBarrierRiskReward: item.tripleBarrierRiskReward,
        triggeredAt: new Date().toISOString(),
      };

      alerts.push(trigger);
      firedAlertCooldown.set(cooldownKey, now);

      // A. Dispatch to Global Discord
      const discordRes = await postGlobalDiscord({
        title: `${config.emoji} ORCA ALERT · [${config.nameVi}] · ${item.symbol}`,
        description: `Cổ phiếu **${item.symbol}** (${item.name || item.sector}) vừa nổ tín hiệu đạt tiêu chuẩn **${config.nameVi}**!`,
        color: config.color,
        fields: [
          { name: "Thị giá", value: `${(item.price ?? 0).toLocaleString("vi-VN")} đ (${(item.changePercent ?? 0) >= 0 ? "+" : ""}${(item.changePercent ?? 0).toFixed(2)}%)`, inline: true },
          { name: "Khối lượng", value: `${(item.volume ?? 0).toLocaleString("vi-VN")} ${item.volRatio20 ? `(${item.volRatio20.toFixed(1)}x MA20)` : ""}`, inline: true },
          { name: "Điểm mua (Pivot)", value: `${(item.buyPoint ?? 0).toLocaleString("vi-VN")} đ (${(item.buyPointDiffPct ?? 0) >= 0 ? "+" : ""}${(item.buyPointDiffPct ?? 0).toFixed(1)}%)`, inline: true },
          { name: "Sức mạnh RS / Composite", value: `RS: ${item.rsRating ?? "N/A"}/99 · Master: ${item.compositeScore ?? "N/A"}/100`, inline: true },
          { name: "Quản trị Rủi ro (R:R)", value: `SL: ${Math.round(item.tripleBarrierLower ?? (item.price ?? 0) * 0.94).toLocaleString("vi-VN")} đ | TP: ${Math.round(item.tripleBarrierUpper ?? (item.price ?? 0) * 1.12).toLocaleString("vi-VN")} đ (R:R ${item.tripleBarrierRiskReward ? item.tripleBarrierRiskReward.toFixed(1) : "2.0"}x)`, inline: false },
        ],
      });
      if (discordRes.ok) discordDispatched++;

      // B. Dispatch to Global Telegram
      const tgText = formatTelegramAlert(trigger, config.emoji);
      const tgRes = await postGlobalTelegram(tgText);
      if (tgRes.ok) telegramDispatched++;

      // C. Optional User Custom Webhook (SSRF-guarded)
      if (options?.webhookUrl) {
        try {
          if (options.provider === "telegram" && options.secret) {
            if (looksLikeTelegramToken(options.webhookUrl)) {
              await fetch(`https://api.telegram.org/bot${options.webhookUrl.trim()}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: options.secret,
                  text: tgText,
                  parse_mode: "HTML",
                }),
                signal: AbortSignal.timeout(6_000),
              }).catch(() => null);
            }
          } else {
            const safeCheck = await isSafeWebhookUrl(options.webhookUrl, "discord");
            if (safeCheck.ok) {
              await fetch(options.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: `${config.emoji} **ORCA ALERT · [${config.nameVi}] · ${item.symbol}**\nGiá: ${(item.price ?? 0).toLocaleString("vi-VN")} đ | RS: ${item.rsRating ?? "N/A"}`,
                }),
                signal: AbortSignal.timeout(6_000),
              }).catch(() => null);
            }
          }
        } catch {
          // Non-blocking custom webhook dispatch
        }
      }
    }
  }

  // 4. Update Hot Snapshot with current (T) state for next iteration
  putHot("screener-alerts-prev", currentMap, {
    source: "screener-alert-monitor",
    newAlertsCount: alerts.length,
    timestamp: now,
  });

  return {
    ok: true,
    scannedPresets: ALERT_MONITORED_PRESETS.length,
    newlyTriggeredCount: alerts.length,
    alerts,
    discordDispatched,
    telegramDispatched,
    durationMs: Date.now() - t0,
  };
}
