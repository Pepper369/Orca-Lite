import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Public / token-authenticated endpoints that legitimately receive cross-origin or non-browser POSTs
const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/auth/firebase",
  "/api/v1/copytrade/ea-",
];

/**
 * Extracts inline `<script>...</script>` blocks (without `src=`) from HTML
 * and returns CSP `'sha256-...'` source tokens so production CSP can avoid `'unsafe-inline'`.
 */
export function extractInlineScriptHashesFromHtml(html: string): string[] {
  const hashes: string[] = [];
  const seen = new Set<string>();
  const scriptRe = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const body = match[1] ?? "";
    if (!body.trim()) continue;
    const digest = crypto.createHash("sha256").update(body, "utf8").digest("base64");
    const token = `'sha256-${digest}'`;
    if (!seen.has(token)) {
      seen.add(token);
      hashes.push(token);
    }
  }
  return hashes;
}

export function computeInlineScriptHashes(cwd = process.cwd()): string[] {
  const candidates = [
    path.resolve(cwd, "dist", "index.html"),
    path.resolve(cwd, "index.html"),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, "utf8");
        const hashes = extractInlineScriptHashesFromHtml(html);
        if (hashes.length > 0) return hashes;
      }
    } catch {
      // Ignore unreadable candidates and try fallback
    }
  }
  return [];
}

export function buildCspHeader(opts: {
  isApi: boolean;
  isProd: boolean;
  inlineScriptHashes?: string[];
}): string {
  if (opts.isApi) {
    return [
      "default-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; ");
  }

  const hashes = (opts.inlineScriptHashes ?? []).filter((h) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(h));
  const scriptSrc = opts.isProd
    ? ["'self'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net", "https://apis.google.com", ...hashes]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net", "https://apis.google.com"];

  const connectSrc = opts.isProd
    ? [
        "'self'",
        "wss:",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://*.firebaseapp.com",
        "https://cdn.jsdelivr.net",
        "https://api.binance.com",
        "https://fapi.binance.com",
        "https://biquote.io",
      ]
    : [
        "'self'",
        "ws:",
        "wss:",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://*.firebaseapp.com",
        "https://cdn.jsdelivr.net",
        "https://api.binance.com",
        "https://fapi.binance.com",
        "https://biquote.io",
      ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'self' https://s.tradingview.com https://*.firebaseapp.com https://accounts.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function getSecurityHeaders(opts: {
  pathname: string;
  isProd: boolean;
  inlineScriptHashes?: string[];
}): Record<string, string> {
  const isApi = opts.pathname.startsWith("/api/") || opts.pathname === "/api" || opts.pathname.startsWith("/v1/");
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildCspHeader({
      isApi,
      isProd: opts.isProd,
      inlineScriptHashes: opts.inlineScriptHashes,
    }),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // Allow Firebase Auth Google Sign-In popup while still isolating window.opener
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (opts.isProd) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

/**
 * Resolves CORS Access-Control-Allow-Origin strictly.
 * Returns null when Origin is absent, "null", malformed, or untrusted (never reflects arbitrary Origin or falls back to allowedOrigins[0]).
 */
export function resolveCorsOrigin(
  origin: string | undefined | null,
  reqHost: string | undefined | null,
  opts: { allowedOrigins: string[]; isProd: boolean; siteUrl?: string },
): string | null {
  if (!origin || origin === "null") return null;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const normalizedOrigin = parsed.origin;

  if (opts.allowedOrigins.length > 0) {
    return opts.allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : null;
  }

  if (opts.siteUrl) {
    try {
      if (new URL(opts.siteUrl).origin === normalizedOrigin) {
        return normalizedOrigin;
      }
    } catch {
      // Ignore malformed SITE_URL
    }
  }

  if (reqHost && parsed.host.toLowerCase() === reqHost.toLowerCase()) {
    return normalizedOrigin;
  }

  const isLoopback =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

  if (!opts.isProd) {
    return isLoopback ? normalizedOrigin : null;
  }

  return isLoopback ? normalizedOrigin : null;
}

export interface CsrfCheckResult {
  ok: boolean;
  status?: 400 | 403;
  code?: string;
  message?: string;
}

/**
 * Enforces Origin/Referer & Sec-Fetch-Site verification on mutating /api/* routes.
 */
export function verifyCsrfRequest(
  req: Request,
  opts?: { allowedOrigins?: string[]; siteUrl?: string },
): CsrfCheckResult {
  const method = req.method.toUpperCase();
  if (!MUTATION_METHODS.has(method)) return { ok: true };

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return { ok: false, status: 400, code: "INVALID_URL", message: "Request URL không hợp lệ." };
  }

  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) return { ok: true };

  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return { ok: true };
  }

  const secFetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return {
      ok: false,
      status: 403,
      code: "CROSS_ORIGIN_FORBIDDEN",
      message: "Yêu cầu cross-site bị từ chối vì lý do an toàn bảo mật.",
    };
  }

  const allowedHosts = new Set<string>();
  const headerHost = req.headers.get("host")?.trim().toLowerCase();
  if (headerHost) allowedHosts.add(headerHost);
  if (url.host) allowedHosts.add(url.host.toLowerCase());

  const siteUrl = opts?.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (siteUrl) {
    try {
      allowedHosts.add(new URL(siteUrl).host.toLowerCase());
    } catch {
      // Ignore invalid siteUrl
    }
  }

  for (const allowedOrigin of opts?.allowedOrigins ?? []) {
    try {
      allowedHosts.add(new URL(allowedOrigin).host.toLowerCase());
    } catch {
      // Ignore invalid origin entry
    }
  }

  const origin = req.headers.get("origin");
  if (origin !== null) {
    if (!origin || origin === "null") {
      return { ok: false, status: 403, code: "INVALID_ORIGIN", message: "Header Origin không hợp lệ." };
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
        return { ok: false, status: 403, code: "INVALID_ORIGIN", message: "Header Origin không hợp lệ." };
      }
      if (!allowedHosts.has(originUrl.host.toLowerCase())) {
        return {
          ok: false,
          status: 403,
          code: "CROSS_ORIGIN_FORBIDDEN",
          message: "Yêu cầu khác nguồn gốc (Cross-Origin) bị từ chối vì lý do an toàn bảo mật.",
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 400, code: "INVALID_ORIGIN", message: "Header Origin không hợp lệ." };
    }
  }

  const referer = req.headers.get("referer");
  if (referer !== null) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.protocol !== "http:" && refererUrl.protocol !== "https:") {
        return { ok: false, status: 403, code: "INVALID_REFERER", message: "Header Referer không hợp lệ." };
      }
      if (!allowedHosts.has(refererUrl.host.toLowerCase())) {
        return {
          ok: false,
          status: 403,
          code: "CROSS_ORIGIN_FORBIDDEN",
          message: "Yêu cầu từ trang giới thiệu khác nguồn (Cross-Origin Referer) bị từ chối.",
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 400, code: "INVALID_REFERER", message: "Header Referer không hợp lệ." };
    }
  }

  return { ok: true };
}

/**
 * Decodes and validates URL path segments against traversal, null bytes, backslashes, and control chars.
 */
export function sanitizePathSegments(pathname: string): string[] | null {
  const rawSegments = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const decoded: string[] = [];
  for (const raw of rawSegments) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (
      !seg ||
      seg === "." ||
      seg === ".." ||
      seg.includes("..") ||
      seg.includes("/") ||
      seg.includes("\\") ||
      seg.includes("\0") ||
      /[\x00-\x1f\x7f]/.test(seg)
    ) {
      return null;
    }
    decoded.push(seg);
  }
  return decoded;
}
