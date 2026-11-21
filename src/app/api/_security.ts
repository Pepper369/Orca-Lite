/**
 * Server-side API input sanitization & anti-stored-XSS / prototype-pollution helpers.
 * Used across src/app/api/** route handlers.
 */

const CONTROL_CHARS_SINGLE_LINE = /[\u0000-\u001F\u007F]/g;
const CONTROL_CHARS_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const DANGEROUS_XSS_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(script|iframe|object|embed|svg|math|link|meta|base|form|style|img|video|audio|body|html)\b/i,
  /\bon[a-z]{2,24}\s*=/i,
  /(?:javascript|vbscript|livescript|mocha)\s*:/i,
  /data\s*:\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)/i,
];

const NAMED_HTML_ENTITIES: Record<string, string> = {
  colon: ":",
  tab: "\t",
  newline: "\n",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeHtmlEntitiesForCheck(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);?/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? m);
}

export function stripControlChars(value: string, multiline = false): string {
  return value.replace(multiline ? CONTROL_CHARS_MULTILINE : CONTROL_CHARS_SINGLE_LINE, "");
}

export function containsXssVector(value: string): boolean {
  const decoded = decodeHtmlEntitiesForCheck(value);
  const compact = decoded.replace(/[\u0000-\u0020\u007F]+/g, "");
  return (
    DANGEROUS_XSS_PATTERNS.some((re) => re.test(value) || re.test(decoded) || re.test(compact))
  );
}

/**
 * Validates and sanitizes single-line identity/label strings (user name, displayName, broker name).
 * Rejects angle brackets (`<`, `>`), control chars, and XSS URI/handler vectors.
 */
export type SanitizeResult<T> =
  | { ok: true; value: T; reason?: undefined }
  | { ok: false; reason: string; value?: undefined };

export function sanitizeIdentityName(
  input: unknown,
  maxLen = 80,
): SanitizeResult<string> {
  if (typeof input !== "string") {
    return { ok: false, reason: "Giá trị tên phải là chuỗi ký tự" };
  }
  const cleaned = stripControlChars(input, false).trim();
  if (!cleaned) {
    return { ok: false, reason: "Tên không được để trống" };
  }
  if (/[<>]/.test(cleaned) || containsXssVector(cleaned)) {
    return { ok: false, reason: "Tên chứa ký tự hoặc thẻ HTML không được phép" };
  }
  return { ok: true, value: cleaned.slice(0, maxLen) };
}

/**
 * Sanitizes free-text plain fields (bio, notes, reasons, alert messages) by removing
 * control characters, stripping angle brackets, and rejecting active XSS vectors.
 */
export function sanitizePlainText(input: unknown, maxLen = 200, multiline = false): string {
  if (typeof input !== "string") return "";
  const cleaned = stripControlChars(input, multiline).trim();
  if (!cleaned) return "";
  const noTags = cleaned.replace(/[<>]/g, "");
  if (containsXssVector(noTags)) {
    return "";
  }
  return noTags.slice(0, maxLen);
}

/**
 * Validates avatar URLs persisted via /api/v1/settings.
 * Allows null/empty, safe raster data:image/(jpeg|jpg|png|webp|gif|avif);base64,... URLs,
 * safe relative `/...` paths (excluding protocol-relative `//`), or `https://` URLs.
 * Explicitly blocks `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`.
 */
export function sanitizeAvatarUrl(
  input: unknown,
): SanitizeResult<string | null> {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, reason: "avatarUrl phải là chuỗi URL hợp lệ" };
  }
  if (input.length > 24_000) {
    return { ok: false, reason: "avatarUrl vượt quá kích thước tối đa" };
  }

  const trimmed = stripControlChars(input, false).trim();
  if (!trimmed) return { ok: true, value: null };

  const decoded = decodeHtmlEntitiesForCheck(trimmed);
  const compact = decoded.replace(/[\u0000-\u0020\u007F]+/g, "").toLowerCase();

  if (
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:text/") ||
    compact.startsWith("data:image/svg+xml") ||
    compact.startsWith("data:application/")
  ) {
    return { ok: false, reason: "avatarUrl sử dụng giao thức hoặc MIME type không an toàn" };
  }

  // Safe raster data URL (cropped avatar JPEG/PNG/WebP/GIF/AVIF)
  if (/^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return { ok: true, value: trimmed };
  }

  // Relative same-origin path (must not be protocol-relative //)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\") && !/[<>]/.test(trimmed)) {
    return { ok: true, value: trimmed };
  }

  // HTTPS remote URL only
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: "avatarUrl chỉ chấp nhận HTTPS hoặc ảnh raster base64 hợp lệ" };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, reason: "avatarUrl không được chứa thông tin xác thực" };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, reason: "avatarUrl không đúng định dạng URL" };
  }
}

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function hasPrototypePollutionKey(value: unknown, depth = 0): boolean {
  if (depth > 12 || !value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasPrototypePollutionKey(item, depth + 1));
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) return true;
    if (hasPrototypePollutionKey((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

export function stripPrototypePollution<T>(value: T, depth = 0): T {
  if (depth > 12 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripPrototypePollution(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(k)) continue;
    out[k] = stripPrototypePollution(v, depth + 1);
  }
  return out as T;
}

export function escapeHtmlStrict(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeHttpHeaderValue(value: unknown, maxLen = 256): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\r\n\0\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

export function isValidTradingSymbol(symbol: unknown): symbol is string {
  return typeof symbol === "string" && /^[A-Z0-9._-]{1,20}$/.test(symbol.trim().toUpperCase());
}

export function safeInternalErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== "production" && err instanceof Error && err.message) {
    return err.message.slice(0, 200);
  }
  return fallback;
}
