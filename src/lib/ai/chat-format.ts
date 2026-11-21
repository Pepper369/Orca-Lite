/**
 * ORCA Agent chat — markdown-lite parser (pure, framework-free).
 *
 * Agent answers arrive as plain text: the deterministic engine emits
 * `heading\n` + one fact per line, while the LLM persona emits real Markdown
 * (headings, bullets, wrapped paragraphs, **bold**, `code`, and validated [label](url) links).
 * The chat frame renders both from the same block model, so this lives outside
 * React and is unit-tested in isolation (src/lib/ai/__tests__/chat-format.test.ts).
 *
 * Deliberately no HTML parsing, no raw <img> rendering, and no dangerouslySetInnerHTML:
 * all text nodes are plain React text, and links are strictly validated to http(s) URLs.
 */

import { sanitizeExternalUrl } from "./sanitize";

export interface ChatInline {
  text: string;
  bold?: boolean;
  code?: boolean;
  href?: string;
}

export type ChatBlock =
  | { type: "heading"; level: 2 | 3; inline: ChatInline[] }
  | { type: "bullet"; marker: string; inline: ChatInline[] }
  | { type: "quote"; inline: ChatInline[] }
  | { type: "para"; inline: ChatInline[] }
  | { type: "gap" };

const HEAD_RE = /^(#{1,6})\s+/;
const BULLET_RE = /^[-*•·+]\s+/;
const ORDERED_RE = /^(\d{1,2})[.)]\s+/;
const QUOTE_RE = /^>\s?/;
/** A line starting lowercase is treated as a wrapped continuation of the paragraph above. */
const CONTINUATION_RE = /^[\p{Ll}]/u;
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g;

interface ParsedLinkMatch {
  start: number;
  end: number;
  isImage: boolean;
  label: string;
  rawUrl: string;
}

/**
 * Scan for balanced markdown link/image `[label](target)` or `![alt](target)`.
 * Handles nested parentheses in targets like `javascript:alert(1)` or Wikipedia URLs,
 * and rejects nested `[` inside labels to prevent bracket-smuggling bypasses.
 */
function findNextMarkdownLink(text: string, from: number): ParsedLinkMatch | null {
  let idx = from;
  while (idx < text.length) {
    const openBracket = text.indexOf("[", idx);
    if (openBracket < 0) return null;

    const isImage = openBracket > 0 && text[openBracket - 1] === "!";
    const start = isImage ? openBracket - 1 : openBracket;

    // Find matching ']' without nested '['
    let closeBracket = -1;
    for (let i = openBracket + 1; i < text.length; i++) {
      const ch = text[i];
      if (ch === "[") break;
      if (ch === "]") {
        closeBracket = i;
        break;
      }
    }
    if (closeBracket < 0) {
      idx = openBracket + 1;
      continue;
    }

    if (text[closeBracket + 1] !== "(") {
      idx = closeBracket + 1;
      continue;
    }

    // Scan balanced parentheses for URL target
    let depth = 1;
    let i = closeBracket + 2;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0) break;
      i++;
    }

    if (depth !== 0) {
      idx = openBracket + 1;
      continue;
    }

    const label = text.slice(openBracket + 1, closeBracket);
    const rawTarget = text.slice(closeBracket + 2, i).trim();
    // Strip optional markdown title `"..."` or `'...'` after URL
    const titleSplit = rawTarget.match(/^(\S+)(?:\s+["'][^"']*["'])?$/);
    const rawUrl = titleSplit ? titleSplit[1]! : rawTarget;

    return {
      start,
      end: i + 1,
      isImage,
      label,
      rawUrl,
    };
  }
  return null;
}

function parseInlineStyles(text: string): ChatInline[] {
  const out: ChatInline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    const token = m[0];
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (token.startsWith("`")) out.push({ text: token.slice(1, -1), code: true });
    else out.push({ text: token.slice(2, -2), bold: true });
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((s) => s.text.length > 0);
}

/**
 * Split `**bold**`, `__bold__`, `` `code` ``, and safe `[label](https://...)` runs out of a single line.
 * Dangerous or non-http(s) markdown links and all `![alt](url)` image markdown are neutralized to plain text.
 */
export function parseInline(text: string): ChatInline[] {
  const out: ChatInline[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const link = findNextMarkdownLink(text, cursor);
    if (!link) {
      out.push(...parseInlineStyles(text.slice(cursor)));
      break;
    }
    if (link.start > cursor) {
      out.push(...parseInlineStyles(text.slice(cursor, link.start)));
    }
    if (link.isImage) {
      // Never render markdown images from untrusted AI/user text; keep alt text only if non-empty
      if (link.label.trim()) out.push({ text: link.label.trim() });
    } else {
      const safeHref = sanitizeExternalUrl(link.rawUrl);
      if (safeHref && link.label.trim()) {
        out.push({ text: link.label, href: safeHref });
      } else if (link.label.trim()) {
        // Neutralize unsafe link targets (javascript:, vbscript:, data:, //, entity-encoded) to inert plain text
        out.push({ text: link.label });
      }
    }
    cursor = link.end;
  }
  return out.filter((s) => s.text.length > 0);
}

/** Plain text of a block, for the copy-to-clipboard action. */
export function blockText(block: ChatBlock): string {
  if (block.type === "gap") return "";
  const body = block.inline.map((s) => s.text).join("");
  if (block.type === "heading") return `${"#".repeat(block.level)} ${body}`;
  if (block.type === "bullet") return `${block.marker} ${body}`;
  if (block.type === "quote") return `> ${body}`;
  return body;
}

/**
 * Turn raw answer text into blocks.
 * - `##`/`###` → heading (levels collapse to 2|3 for a consistent chat scale)
 * - `-`, `*`, `•`, `1.` → bullet, marker preserved
 * - `>` → quote
 * - blank line → single gap (runs collapse, never leading)
 * - otherwise a paragraph; consecutive lines that start lowercase are joined,
 *   so wrapped LLM prose reads as prose while the deterministic engine's
 *   "Label: value" lines (all capitalised) stay one line per block.
 */
export function parseChatBlocks(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length === 0) return;
    blocks.push({ type: "para", inline: parseInline(para.join(" ")) });
    para = [];
  };

  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flush();
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== "gap") blocks.push({ type: "gap" });
      continue;
    }

    const head = HEAD_RE.exec(line);
    if (head) {
      flush();
      const body = line.slice(head[0].length).trim();
      if (body) blocks.push({ type: "heading", level: head[1].length >= 3 ? 3 : 2, inline: parseInline(body) });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flush();
      blocks.push({ type: "bullet", marker: "•", inline: parseInline(line.slice(bullet[0].length)) });
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      flush();
      blocks.push({ type: "bullet", marker: `${ordered[1]}.`, inline: parseInline(line.slice(ordered[0].length)) });
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: "quote", inline: parseInline(line.slice(quote[0].length)) });
      continue;
    }

    if (para.length > 0 && CONTINUATION_RE.test(line)) para.push(line);
    else {
      flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
