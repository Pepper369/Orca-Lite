import { NextRequest } from "next/server";
import crypto from "crypto";
import { badRequest, fail, ok } from "@/lib/envelope";
import { getGlobalDiscordWebhook, postGlobalDiscord } from "@/lib/services/discord-notify";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { isDiscordUrl, isSafeWebhookUrl, looksLikeTelegramToken } from "@/lib/webhook-security";
import {
  escapeHtmlStrict,
  safeInternalErrorMessage,
  sanitizeHttpHeaderValue,
  sanitizePlainText,
} from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest();
function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

type Body = {
  url?: string;
  provider?: "discord" | "slack" | "telegram" | "generic";
  title?: string;
  body?: string;
  symbol?: string;
  price?: number;
  targetPrice?: number;
  direction?: string;
  reason?: string;
  secret?: string;
  color?: number;
  chatId?: string;
};

function discordPayload(b: Body) {
  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (b.symbol) fields.push({ name: "Ma", value: "`" + b.symbol + "`", inline: true });
  if (b.price != null) fields.push({ name: "Gia", value: String(b.price), inline: true });
  if (b.targetPrice != null) fields.push({ name: "Muc", value: String(b.targetPrice), inline: true });
  if (b.direction) fields.push({ name: "Dieu kien", value: String(b.direction), inline: true });
  if (b.reason) fields.push({ name: "Ly do", value: b.reason.slice(0, 200), inline: false });
  return {
    username: "Orca Alerts",
    embeds: [
      {
        title: b.title || "Orca — Canh bao gia",
        description: b.body || undefined,
        color: b.color ?? 0xa78bfa,
        fields: fields.length ? fields : undefined,
        timestamp: new Date().toISOString(),
        footer: { text: "Orca Multi-Finance" },
      },
    ],
  };
}

function slackPayload(b: Body) {
  const text = [b.title || "Orca — Canh bao gia", b.body, b.symbol && "Ma: " + b.symbol, b.price != null && "Gia: " + b.price]
    .filter(Boolean)
    .join("\n");
  return { text };
}

function escapeHtml(s: string): string {
  return escapeHtmlStrict(s);
}

function telegramText(b: Body): string {
  const lines = [
    "<b>" + escapeHtml(b.title || "Orca — Canh bao gia") + "</b>",
    b.body ? escapeHtml(b.body) : null,
    b.symbol ? "<b>Ma:</b> " + escapeHtml(b.symbol) : null,
    b.price != null ? "<b>Gia:</b> " + b.price : null,
    b.targetPrice != null ? "<b>Muc:</b> " + b.targetPrice : null,
    b.direction ? "<b>Dieu kien:</b> " + escapeHtml(String(b.direction)) : null,
    b.reason ? "<b>Ly do:</b> " + escapeHtml(b.reason.slice(0, 200)) : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function genericPayload(b: Body) {
  return {
    event: "price_alert",
    title: b.title || "Orca — Canh bao gia",
    body: b.body ?? null,
    symbol: b.symbol ?? null,
    price: b.price ?? null,
    targetPrice: b.targetPrice ?? null,
    direction: b.direction ?? null,
    reason: b.reason ?? null,
    at: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "alert_webhook", binding: "RL_AUTH", limit: 20, windowSec: 60 });
  if (limited) return limited;

  const session = await getSessionUser(req);
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const isCronAuthorized = Boolean(cronSecret && bearer && safeEqual(bearer, cronSecret));

  if (!session && !isCronAuthorized) {
    return fail("UNAUTHORIZED", "Vui lòng đăng nhập để gửi thông báo webhook", 401);
  }

  try {
    const raw = (await req.json()) as Body;
    const b: Body = {
      ...raw,
      title: raw.title ? sanitizePlainText(raw.title, 200) : undefined,
      body: raw.body ? sanitizePlainText(raw.body, 1500, true) : undefined,
      symbol: raw.symbol ? sanitizePlainText(raw.symbol, 30) : undefined,
      direction: raw.direction ? sanitizePlainText(raw.direction, 30) : undefined,
      reason: raw.reason ? sanitizePlainText(raw.reason, 200) : undefined,
    };
    const globalUrl = getGlobalDiscordWebhook();
    let url = typeof b.url === "string" ? b.url.replace(/[\r\n\0]/g, "").trim() : "";
    if (!url && globalUrl) {
      url = globalUrl;
      b.provider = "discord";
    }
    if (!url) {
      return badRequest("url is required (or set DISCORD_WEBHOOK_URL on server)");
    }

    let provider = b.provider ?? "discord";
    if (isDiscordUrl(url)) provider = "discord";
    if (looksLikeTelegramToken(url) || provider === "telegram") provider = "telegram";

    if (provider === "telegram") {
      if (!looksLikeTelegramToken(url)) {
        return badRequest("telegram bot token invalid (format: 123456:AAH...)");
      }
      const chatId = (b.chatId || b.secret || "").trim();
      if (!/^-?\d{5,}$/.test(chatId)) {
        return badRequest("telegram chat_id required (secret field)");
      }
      const apiUrl = "https://api.telegram.org/bot" + url + "/sendMessage";
      const upstream = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Orca-Multi-Finance/1.0",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramText(b),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const text = await upstream.text().catch(() => "");
      if (!upstream.ok) {
        return fail(
          "WEBHOOK_UPSTREAM",
          "Telegram " + upstream.status + ": " + sanitizePlainText(text, 200),
          502,
        );
      }
      const g = await postGlobalDiscord({
        title: b.title || "Orca — Canh bao gia",
        description: b.body,
        color: b.color ?? 0xa78bfa,
        username: "ORCA Alerts",
        fields: [
          ...(b.symbol ? [{ name: "Ma", value: "`" + b.symbol + "`", inline: true }] : []),
          ...(b.price != null ? [{ name: "Gia", value: String(b.price), inline: true }] : []),
        ],
      });
      return ok({
        delivered: true,
        status: upstream.status,
        provider: "telegram",
        globalMirrored: g.ok && !g.skipped,
      });
    }

    // SSRF Safe Check: Dynamic DNS resolution + Provider-specific verification
    const safeCheck = await isSafeWebhookUrl(url, provider);
    if (!safeCheck.ok) {
      return badRequest(safeCheck.reason ?? "URL không an toàn (SSRF Blocked)");
    }

    const payload =
      provider === "slack"
        ? slackPayload(b)
        : provider === "generic"
          ? genericPayload(b)
          : discordPayload(b);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Orca-Multi-Finance/1.0",
    };
    const safeSecret = sanitizeHttpHeaderValue(b.secret, 256);
    if (safeSecret) headers["X-Orca-Secret"] = safeSecret;

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });

    const text = await upstream.text().catch(() => "");
    if (!upstream.ok) {
      return fail(
        "WEBHOOK_UPSTREAM",
        "Webhook responded " + upstream.status + ": " + sanitizePlainText(text, 200),
        502,
      );
    }

    const g = await postGlobalDiscord({
      title: b.title || "Orca — Canh bao gia",
      description: b.body,
      color: b.color ?? 0xa78bfa,
      username: "ORCA Alerts",
      alreadyPostedUrl: url,
      fields: [
        ...(b.symbol ? [{ name: "Ma", value: "`" + b.symbol + "`", inline: true }] : []),
        ...(b.price != null ? [{ name: "Gia", value: String(b.price), inline: true }] : []),
        ...(b.targetPrice != null ? [{ name: "Muc", value: String(b.targetPrice), inline: true }] : []),
        ...(b.direction ? [{ name: "Dieu kien", value: String(b.direction), inline: true }] : []),
      ],
    });

    return ok({
      delivered: true,
      status: upstream.status,
      provider,
      globalMirrored: g.ok && !g.skipped,
      globalConfigured: Boolean(getGlobalDiscordWebhook()),
    });
  } catch (e) {
    return fail("WEBHOOK_FAILED", safeInternalErrorMessage(e, "Webhook dispatch failed"), 502);
  }
}
