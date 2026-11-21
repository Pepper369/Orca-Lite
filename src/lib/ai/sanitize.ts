/**
 * Client-safe SSOT sanitization helpers for AI output, markdown links,
 * provider scraping, and personal-finance storage/exports.
 *
 * Pure TypeScript — NEVER import "server-only" or Node-only modules here.
 */

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  colon: ":",
  tab: "\t",
  newline: "\n",
  lpar: "(",
  rpar: ")",
  sol: "/",
  bsol: "\\",
  semi: ";",
  num: "#",
  percnt: "%",
  minus: "-",
  ndash: "–",
  mdash: "—",
};

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const STRIP_FOR_URL_SCHEME_RE = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff\u00ad]/g;
const TEXT_CONTROL_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g;

const BLOCKED_SCHEMES = [
  "javascript:",
  "vbscript:",
  "data:",
  "file:",
  "blob:",
  "about:",
  "filesystem:",
  "jar:",
  "view-source:",
  "ms-appx:",
];

function safeCodePoint(point: number, allowControl = false): string {
  if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return "";
  if (point >= 0xd800 && point <= 0xdfff) return "";
  if (!allowControl && ((point < 0x20 && point !== 0x09 && point !== 0x0a && point !== 0x0d) || (point >= 0x7f && point <= 0x9f))) {
    return "";
  }
  try {
    return String.fromCodePoint(point);
  } catch {
    return "";
  }
}

/**
 * Safely decode HTML/XML entities (including leading-zero numeric entities and
 * non-BMP code points via String.fromCodePoint). Strips NUL/surrogate/control points.
 */
export function decodeHtmlEntitiesSafe(input: string, maxPasses = 2, allowMissingSemicolon = false): string {
  let current = input;
  const entityRe = allowMissingSemicolon
    ? /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);?/g
    : /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

  for (let pass = 0; pass < maxPasses; pass++) {
    const next = current.replace(entityRe, (entity, code: string) => {
      if (!code.startsWith("#")) {
        const mapped = NAMED_HTML_ENTITIES[code.toLowerCase()];
        if (mapped !== undefined) return mapped;
        return entity;
      }
      const isHex = code[1]?.toLowerCase() === "x";
      const digits = code.slice(isHex ? 2 : 1);
      const point = Number.parseInt(digits, isHex ? 16 : 10);
      return safeCodePoint(point, allowMissingSemicolon);
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Strictly sanitize an external URL (http/https only).
 * Rejects:
 * - mixed-case, whitespace, or control-char obfuscated `javascript:`, `vbscript:`, `data:`, etc.
 * - HTML-entity encoded schemes (`javascript&#58;`, `&colon;`, `&#x6a;avascript:`)
 * - percent-encoded schemes (`%6a%61%76%61%73%63%72%69%70%74:`)
 * - protocol-relative (`//evil.com`, `\\evil.com`, `/\evil.com`)
 * - embedded credentials (`https://user:pass@host`)
 */
export function sanitizeExternalUrl(
  raw: unknown,
  opts?: { allowHttp?: boolean },
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  // Reject protocol-relative and backslash tricks immediately
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\") || trimmed.startsWith("/\\")) {
    return null;
  }

  // Decode entities (including missing-semicolon forms like &#58) up to 3 passes to catch double-encoding
  const decoded = decodeHtmlEntitiesSafe(trimmed, 3, true).trim();
  if (!decoded || decoded.startsWith("//") || decoded.startsWith("\\\\") || decoded.startsWith("/\\")) {
    return null;
  }

  // Inspect scheme after stripping all whitespace, control chars, and zero-width chars
  const collapsed = decoded.replace(STRIP_FOR_URL_SCHEME_RE, "").toLowerCase();
  if (!collapsed || collapsed.startsWith("//") || collapsed.startsWith("\\\\") || collapsed.startsWith("/\\")) {
    return null;
  }

  for (const scheme of BLOCKED_SCHEMES) {
    if (collapsed.startsWith(scheme)) return null;
  }

  // Also check percent-decoded scheme prefix
  try {
    const pctDecoded = decodeURIComponent(collapsed);
    for (const scheme of BLOCKED_SCHEMES) {
      if (pctDecoded.startsWith(scheme)) return null;
    }
  } catch {
    // malformed percent sequence is fine to continue to new URL() check or reject below
  }

  // Reject any control characters in the cleaned URL and require explicit http(s)://
  const cleaned = decoded.replace(CONTROL_CHARS_RE, "");
  if (!cleaned || !/^https?:\/\//i.test(cleaned) || cleaned.includes("\\")) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);
    const allowHttp = opts?.allowHttp !== false;
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Strictly sanitize an image URL for `<img src>` (http/https only, no data:/blob:/svg).
 */
export function sanitizeImageUrl(
  raw: unknown,
  opts?: { requireHttps?: boolean },
): string | null {
  const safe = sanitizeExternalUrl(raw, { allowHttp: !opts?.requireHttps });
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    const lowerPath = parsed.pathname.toLowerCase();
    if (lowerPath.endsWith(".svg") || lowerPath.endsWith(".svgz")) {
      return null;
    }
    return safe;
  } catch {
    return null;
  }
}

/**
 * Strip HTML/XML/SVG/script/style markup and safely decode entities into plain text.
 */
export function sanitizeText(raw: unknown, maxLen?: number): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style|svg|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  s = decodeHtmlEntitiesSafe(s, 2, false);
  // Strip any tags revealed after entity decoding (e.g. &lt;script&gt;...&lt;/script&gt;)
  s = s
    .replace(/<(script|style|svg|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(TEXT_CONTROL_CHARS_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  if (maxLen != null && maxLen > 0 && s.length > maxLen) {
    return s.slice(0, maxLen).trim();
  }
  return s;
}

const PROTO_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Parse JSON while stripping `__proto__`, `constructor`, and `prototype` keys
 * to prevent prototype pollution from untrusted localStorage/API/scraped JSON.
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw, (key, value) => (PROTO_POLLUTION_KEYS.has(key) ? undefined : value)) as T;
  } catch {
    return null;
  }
}

/**
 * Neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) and
 * properly quote CSV cells containing delimiters, quotes, or newlines.
 */
export function escapeCsvCell(val: unknown): string {
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "0";
  }
  let s = String(val ?? "").replace(/\u0000/g, "");
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
