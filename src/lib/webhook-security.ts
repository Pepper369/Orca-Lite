import "server-only";
import dns from "dns/promises";

export type WebhookProviderKind = "discord" | "slack" | "telegram" | "generic";

export function isDiscordUrl(url: string): boolean {
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

export function isSlackUrl(url: string): boolean {
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

export function looksLikeTelegramToken(s: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(s.trim());
}

export function isPrivateIp(ip: string): boolean {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4 Private & Reserved
  const parts = clean.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [o1, o2] = parts;
    if (
      o1 === 0 ||
      o1 === 10 ||
      o1 === 127 ||
      (o1 === 100 && o2 >= 64 && o2 <= 127) ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 169 && o2 === 254) ||
      (o1 === 192 && o2 === 168) ||
      o1 >= 224
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

/**
 * SSRF Guard: rejects non-HTTPS (in prod), embedded credentials, internal ports,
 * loopback/private/metadata hosts, and DNS-rebinding private IPs.
 */
export async function isSafeWebhookUrl(
  rawUrl: string,
  provider: WebhookProviderKind = "generic",
): Promise<{ ok: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL không đúng định dạng" };
  }

  if (parsed.protocol !== "https:" && (process.env.NODE_ENV === "production" || parsed.protocol !== "http:")) {
    return { ok: false, reason: "Webhook bắt buộc phải sử dụng giao thức HTTPS" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL không được chứa credentials" };
  }

  if (parsed.port && parsed.port !== "443" && (process.env.NODE_ENV === "production" || parsed.port !== "80")) {
    return { ok: false, reason: "Cổng mạng không được phép vì lý do an toàn" };
  }

  const host = parsed.hostname.toLowerCase();

  if (provider === "discord" && !isDiscordUrl(rawUrl)) {
    return { ok: false, reason: "URL không đúng định dạng Webhook Discord (https://discord.com/api/webhooks/...)" };
  }
  if (provider === "slack" && !isSlackUrl(rawUrl)) {
    return { ok: false, reason: "URL không đúng định dạng Webhook Slack (https://hooks.slack.com/services/...)" };
  }

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
