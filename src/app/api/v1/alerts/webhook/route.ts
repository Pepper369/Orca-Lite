import { NextRequest } from "next/server";
import crypto from "crypto";
import dns from "dns/promises";
import { badRequest, fail, ok } from "@/lib/envelope";
import { getGlobalDiscordWebhook, postGlobalDiscord } from "@/lib/services/discord-notify";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";

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

function isDiscordUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

function isSlackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "hooks.slack.com" &&
      u.pathname.startsWith("/services/")
    );
  } catch {
    return false;
  }
}

function looksLikeTelegramToken(s: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(s.trim());
}

function isPrivateIp(ip: string): boolean {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4 Private & Reserved
  const parts = clean.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [o1, o2] = parts;
    if (
      o1 === 0 || // 0.0.0.0/8
      o1 === 10 || // 10.0.0.0/8
      o1 === 127 || // 127.0.0.0/8
      (o1 === 100 && o2 >= 64 && o2 <= 127) || // 100.64.0.0/10 CGNAT
      (o1 === 172 && o2 >= 16 && o2 <= 31) || // 172.16.0.0/12
      (o1 === 169 && o2 === 254) || // 169.254.0.0/16 Link-local / Cloud metadata
      (o1 === 192 && o2 === 168) || // 192.168.0.0/16
      o1 >= 224 // 224.0.0.0/4 Multicast & Reserved
    ) {
      return true;
    }
  }

  // IPv6 Loopback, Link-local, Unique Local, Multicast, IPv4-mapped
  if (
    clean === "::1" ||
    clean === "::" ||
    clean.startsWith("fc") ||
    clean.startsWith("fd") ||
    clean.startsWith("fe80") ||
    clean.startsWith("ff") ||
    clean.includes("::ffff:")
  ) {
    return true;
  }

  return false;
}

/** Chặn triệt để SSRF: cấm IP nội bộ, dải riêng tư, metadata service, và phân giải DNS chống DNS rebinding */
async function isSafeWebhookUrl(rawUrl: string, provider: string): Promise<{ ok: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL không đúng định dạng" };
  }

  if (parsed.protocol !== "https:" && (process.env.NODE_ENV === "production" || parsed.protocol !== "http:")) {
    return { ok: false, reason: "Webhook bắt buộc phải sử dụng giao thức HTTPS" };
  }

  // Chặn thông tin đăng nhập nhúng
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL không được chứa credentials" };
  }

  // Chặn các cổng dịch vụ nội bộ
  if (parsed.port && parsed.port !== "443" && (process.env.NODE_ENV === "production" || parsed.port !== "80")) {
    return { ok: false, reason: "Cổng mạng không được phép vì lý do an toàn" };
  }

  const host = parsed.hostname.toLowerCase();

  // Kiểm tra nhà cung cấp webhook
  if (provider === "discord" && !isDiscordUrl(rawUrl)) {
    return { ok: false, reason: "URL không đúng định dạng Webhook Discord (https://discord.com/api/webhooks/...)" };
  }
  if (provider === "slack" && !isSlackUrl(rawUrl)) {
    return { ok: false, reason: "URL không đúng định dạng Webhook Slack (https://hooks.slack.com/services/...)" };
  }

  // Chặn localhost, loopback, cloud metadata
  if (
    host === "localhost" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.includes("metadata") ||
    isPrivateIp(host)
  ) {
    return { ok: false, reason: "Địa chỉ đích bị từ chối (SSRF Protection)" };
  }

  // Phân giải DNS động để kiểm tra tất cả IP đích, ngăn chặn triệt để DNS Rebinding
  try {
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses || addresses.length === 0) {
      return { ok: false, reason: "Không thể phân giải tên miền webhook" };
    }
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        return { ok: false, reason: "Tên miền phân giải về địa chỉ IP nội bộ không được phép (SSRF Blocked)" };
      }
    }
  } catch {
    return { ok: false, reason: "Lỗi kết nối phân giải DNS webhook" };
  }

  return { ok: true };
}

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
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
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

  const session = await getSessionUser();
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const isCronAuthorized = Boolean(cronSecret && bearer && safeEqual(bearer, cronSecret));

  if (!session && !isCronAuthorized) {
    return fail("UNAUTHORIZED", "Vui lòng đăng nhập để gửi thông báo webhook", 401);
  }

  try {
    const b = (await req.json()) as Body;
    const globalUrl = getGlobalDiscordWebhook();
    let url = typeof b.url === "string" ? b.url.trim() : "";
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
          "Telegram " + upstream.status + ": " + text.slice(0, 200),
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
    if (b.secret) headers["X-Orca-Secret"] = b.secret;

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
        "Webhook responded " + upstream.status + ": " + text.slice(0, 200),
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
    return fail("WEBHOOK_FAILED", e instanceof Error ? e.message : "unknown", 502);
  }
}
