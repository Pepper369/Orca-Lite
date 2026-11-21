/**
 * Client-safe DOM XSS & URL Injection Sanitization (SSOT).
 *
 * Pure TypeScript with zero Node/server-only dependencies so it can be imported
 * safely by React client components, shims, and server code alike.
 */

const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;
const SAFE_RELATIVE_PATH_RE = /^\/(?![/\\])/;
const SAFE_RASTER_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;
const HAS_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const DANGEROUS_SCHEME_RE = /^(?:javascript|vbscript|data|file|blob):/i;

function decodeSchemeCheck(raw: string): string {
  return raw
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);?/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&colon;/gi, ":")
    .replace(/[\s\u0000-\u001F\u007F]+/g, "");
}

/** Escape HTML special characters for safe interpolation into text and quoted attributes. */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SanitizeHrefOptions {
  /** Allow same-origin relative paths (`/foo`) and fragment links (`#bar`). Default: true. */
  allowRelative?: boolean;
  /** Value returned when the input URL is empty or unsafe. Default: `"#"`. */
  fallback?: string;
}

/**
 * Validate and normalize an anchor/navigation URL.
 * Blocks `javascript:`, `vbscript:`, `data:`, `file:`, `blob:`, protocol-relative `//`,
 * entity-encoded schemes (`&#58;`, `&colon;`), and control-character obfuscation.
 */
export function sanitizeHref(raw: unknown, opts: SanitizeHrefOptions = {}): string {
  const allowRelative = opts.allowRelative ?? true;
  const fallback = opts.fallback ?? "#";

  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_CHAR_RE.test(trimmed)) return fallback;

  const normalizedCheck = decodeSchemeCheck(trimmed);
  if (DANGEROUS_SCHEME_RE.test(normalizedCheck)) return fallback;

  if (allowRelative) {
    if (trimmed.startsWith("#")) return trimmed;
    if (SAFE_RELATIVE_PATH_RE.test(trimmed)) return trimmed;
  }

  // Reject protocol-relative (`//evil.com`) or backslash-relative (`\\evil.com`) URLs
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return fallback;

  // Require explicit `http://` or `https://` authority delimiter (reject `http:alert(1)`)
  if (!/^https?:\/\//i.test(trimmed)) return fallback;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export interface SanitizeImageSrcOptions {
  /** Allow same-origin relative paths (`/brand/...`). Default: true. */
  allowRelative?: boolean;
  /** Allow strictly validated raster base64 data URLs (PNG/JPEG/WebP/GIF). Default: false. */
  allowSafeDataImage?: boolean;
  /** Value returned when the image src is empty or unsafe. Default: `""`. */
  fallback?: string;
}

/**
 * Validate an image `src` attribute.
 * Blocks `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`,
 * entity-encoded schemes, and protocol-relative URLs.
 */
export function sanitizeImageSrc(raw: unknown, opts: SanitizeImageSrcOptions = {}): string {
  const allowRelative = opts.allowRelative ?? true;
  const allowSafeDataImage = opts.allowSafeDataImage ?? false;
  const fallback = opts.fallback ?? "";

  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_CHAR_RE.test(trimmed)) return fallback;

  if (allowSafeDataImage && SAFE_RASTER_DATA_IMAGE_RE.test(trimmed)) {
    return trimmed;
  }

  const normalizedCheck = decodeSchemeCheck(trimmed);
  if (DANGEROUS_SCHEME_RE.test(normalizedCheck)) return fallback;

  if (allowRelative && SAFE_RELATIVE_PATH_RE.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return fallback;
  if (!/^https?:\/\//i.test(trimmed)) return fallback;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

/**
 * Sanitize a ticker/symbol before interpolating into external URLs or query strings.
 * Keeps only `[A-Za-z0-9._:-]` up to `maxLen` characters and strips `..` sequences.
 */
export function sanitizeQuerySymbol(raw: unknown, maxLen = 32): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .replace(/\.{2,}/g, "")
    .slice(0, maxLen);
}

/**
 * Normalize a company website string (e.g. `hoaphat.com.vn` or `https://...`)
 * into a safe `http:`/`https:` URL or empty string if invalid/malicious.
 */
export function normalizeExternalWebsite(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_CHAR_RE.test(trimmed)) return "";
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return "";
  if (DANGEROUS_SCHEME_RE.test(decodeSchemeCheck(trimmed))) return "";

  if (HAS_SCHEME_RE.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  return sanitizeHref(candidate, { allowRelative: false, fallback: "" });
}
