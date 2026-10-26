import "server-only";
import { httpJson } from "../../http";
import { classifyFiling, periodLabelFromFiscal } from "./classify";
import { discoverFromSscPortal } from "./ssc-portal";
import type { FilingDiscoveryResult, FilingSourceChannel, OfficialFiling } from "./types";

const BASE = (process.env.VNDIRECT_BASE_URL ?? "https://api-finfo.vndirect.com.vn").replace(/\/$/, "");

function filingId(ticker: string, channel: string, fiscalDate: string | null, kind: string, idx: number): string {
  return `${ticker}:${channel}:${fiscalDate ?? "na"}:${kind}:${idx}`;
}

async function discoverFromFsMeta(symbol: string): Promise<{ filings: OfficialFiling[]; ok: boolean }> {
  const sym = symbol.toUpperCase();
  const paths = [
    `/v4/financial_statements?q=code:${sym}~reportType:QUARTER2&size=80&sort=fiscalDate:desc`,
    `/v4/financial_statements?q=code:${sym}~reportType:ANNUAL2&size=40&sort=fiscalDate:desc`,
  ];
  const filings: OfficialFiling[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const res = await httpJson<{ data?: Record<string, unknown>[] }>(`${BASE}${path}`, {
      provider: "vndirect-fs-meta",
      timeoutMs: 12_000,
      retries: 1,
    });
    if (!res.ok || !res.data?.data?.length) continue;

    const byKey = new Map<string, Record<string, unknown>>();
    for (const row of res.data.data) {
      const fd = String(row.fiscalDate ?? "");
      const rt = String(row.reportType ?? "");
      const k = `${fd}|${rt}`;
      if (!byKey.has(k)) byKey.set(k, row);
    }

    let i = 0;
    for (const row of byKey.values()) {
      const fiscalDate = typeof row.fiscalDate === "string" ? row.fiscalDate : null;
      const reportType = typeof row.reportType === "string" ? row.reportType : null;
      const created = typeof row.createdDate === "string" ? row.createdDate : null;
      const modified = typeof row.modifiedDate === "string" ? row.modifiedDate : null;
      const cls = classifyFiling({ reportType, fiscalDate });
      const period = periodLabelFromFiscal(fiscalDate, cls.periodType);
      const id = filingId(sym, "vndirect_fs_meta", fiscalDate, cls.kind, i++);
      if (seen.has(id)) continue;
      seen.add(id);
      filings.push({
        id,
        ticker: sym,
        kind: cls.kind,
        title: `BCTC ${reportType ?? ""} ${period ?? fiscalDate ?? ""}`.trim(),
        period,
        periodType: cls.periodType,
        fiscalDate,
        filingDate: modified ?? created,
        disclosureDate: created,
        statementScope: cls.statementScope,
        auditStatus: cls.auditStatus,
        sourceChannel: "vndirect_fs_meta",
        sourceUrl: `${BASE}${path.split("?")[0]}`,
        documentUrl: null,
        mimeType: null,
        confidence: 0.72,
        rawNote: "Phát hiện từ metadata financial_statements (chưa có file PDF gốc).",
      });
    }
  }

  return { filings, ok: filings.length > 0 };
}

interface FinfoNewsAttachment {
  name?: string;
  url?: string;
  sourceUrl?: string;
}

interface FinfoNewsRow {
  newsId?: string;
  newsTitle?: string;
  newsDate?: string;
  newsTime?: string;
  newsSource?: string;
  newsUrl?: string;
  dstockUrl?: string;
  attachments?: FinfoNewsAttachment[];
}

export async function getLatestSignedBctcDisclosure(symbol: string): Promise<{
  title: string;
  date: string;
  time?: string;
  source: string;
  newsUrl?: string;
  dstockUrl?: string;
  pdfUrl?: string;
  pdfName?: string;
} | null> {
  const sym = symbol.toUpperCase().trim();
  try {
    const path = `/v4/news?q=newsType:financialstatement~tagCodes:${sym}&sort=newsDate:desc~newsTime:desc&size=1`;
    const res = await httpJson<{ data?: FinfoNewsRow[] }>(`${BASE}${path}`, {
      provider: "vndirect-bctc-news",
      timeoutMs: 4_000,
      retries: 0,
    });
    const first = res.data?.data?.[0];
    if (!first?.newsTitle) return null;
    const att = first.attachments?.[0];
    return {
      title: first.newsTitle,
      date: first.newsDate ?? "",
      time: first.newsTime,
      source: first.newsSource ?? "HOSE/HNX",
      newsUrl: first.newsUrl,
      dstockUrl: first.dstockUrl,
      pdfUrl: att?.url ?? att?.sourceUrl,
      pdfName: att?.name,
    };
  } catch {
    return null;
  }
}

async function discoverFromFinfoNews(symbol: string): Promise<{ filings: OfficialFiling[]; ok: boolean }> {
  const sym = symbol.toUpperCase().trim();
  try {
    const path = `/v4/news?q=newsType:financialstatement~tagCodes:${sym}&sort=newsDate:desc~newsTime:desc&size=10`;
    const res = await httpJson<{ data?: FinfoNewsRow[] }>(`${BASE}${path}`, {
      provider: "vndirect-bctc-news",
      timeoutMs: 7_000,
      retries: 1,
    });
    if (!res.ok || !res.data?.data?.length) return { filings: [], ok: false };

    const filings: OfficialFiling[] = [];
    let idx = 0;
    for (const item of res.data.data) {
      const title = item.newsTitle ?? "Báo cáo tài chính";
      const cls = classifyFiling({ title });
      const pubDate = item.newsDate ?? null;
      const att = item.attachments?.[0];
      const docUrl = att?.url ?? att?.sourceUrl ?? item.newsUrl ?? null;
      const fid = filingId(sym, "vndirect_bctc_news", pubDate, cls.kind, idx++);

      filings.push({
        id: fid,
        ticker: sym,
        kind: cls.kind === "unknown" ? "disclosure_other" : cls.kind,
        title,
        period: periodLabelFromFiscal(pubDate, cls.periodType),
        periodType: cls.periodType,
        fiscalDate: null,
        filingDate: pubDate,
        disclosureDate: pubDate,
        statementScope: cls.statementScope,
        auditStatus: cls.auditStatus,
        sourceChannel: "hose_disclosure",
        sourceUrl: item.dstockUrl ?? item.newsUrl ?? `${BASE}${path}`,
        documentUrl: docUrl,
        mimeType: docUrl?.endsWith(".pdf") ? "application/pdf" : null,
        confidence: 0.95,
        rawNote: `Công bố chính thức từ ${item.newsSource ?? "Sở GDCK"}${item.newsTime ? ` lúc ${item.newsTime}` : ""}${att?.name ? ` (File: ${att.name})` : ""}`,
      });
    }
    return { filings, ok: filings.length > 0 };
  } catch {
    return { filings: [], ok: false };
  }
}

async function discoverFromEvents(symbol: string): Promise<{ filings: OfficialFiling[]; ok: boolean }> {
  const sym = symbol.toUpperCase();
  const res = await httpJson<{ data?: Record<string, unknown>[] }>(
    `${BASE}/v4/events?q=code:${sym}&size=30&sort=disclosureDate:desc`,
    { provider: "vndirect-events", timeoutMs: 10_000, retries: 1 },
  );
  if (!res.ok || !res.data?.data?.length) return { filings: [], ok: false };

  const filings: OfficialFiling[] = [];
  let i = 0;
  for (const row of res.data.data) {
    const typeDesc = typeof row.typeDesc === "string" ? row.typeDesc : typeof row.type === "string" ? row.type : "";
    const cls = classifyFiling({ title: typeDesc, typeDesc });
    if (cls.kind === "unknown" && !/t[aà]i ch[ií]nh|bctc|b[aá]o c[aá]o|dividend|c[oổ] t[uứ]c/i.test(typeDesc)) {
      continue;
    }
    const disclosureDate = typeof row.disclosureDate === "string" ? row.disclosureDate : null;
    const effectiveDate = typeof row.effectiveDate === "string" ? row.effectiveDate : null;
    const id = filingId(sym, "vndirect_events", disclosureDate, cls.kind === "unknown" ? "event" : cls.kind, i++);
    filings.push({
      id,
      ticker: sym,
      kind: cls.kind === "unknown" ? "disclosure_other" : cls.kind,
      title: typeDesc || "Sự kiện doanh nghiệp",
      period: null,
      periodType: cls.periodType,
      fiscalDate: effectiveDate,
      filingDate: disclosureDate,
      disclosureDate,
      statementScope: cls.statementScope,
      auditStatus: cls.auditStatus,
      sourceChannel: "vndirect_events",
      sourceUrl: `${BASE}/v4/events`,
      documentUrl: null,
      mimeType: null,
      confidence: 0.55,
      rawNote: typeof row.note === "string" ? row.note : undefined,
    });
  }
  return { filings, ok: filings.length > 0 };
}

function discoverPublicCatalog(symbol: string): OfficialFiling[] {
  const sym = symbol.toUpperCase();
  const catalogs: { title: string; url: string; kind: OfficialFiling["kind"] }[] = [
    {
      title: `CafeF — Báo cáo tài chính ${sym}`,
      url: `https://s.cafef.vn/hose/${sym}-bao-cao-tai-chinh.chn`,
      kind: "disclosure_other",
    },
    {
      title: `Vietstock — Tài chính ${sym}`,
      url: `https://finance.vietstock.vn/${sym}/tai-chinh.htm`,
      kind: "disclosure_other",
    },
    {
      title: `VNDirect — Bảng CĐKT ${sym}`,
      url: `https://www.vndirect.com.vn/portal/bang-can-doi-ke-toan/${sym.toLowerCase()}.shtml`,
      kind: "disclosure_other",
    },
  ];

  return catalogs.map((c, idx) => ({
    id: filingId(sym, "company_ir", null, c.kind, idx),
    ticker: sym,
    kind: c.kind,
    title: c.title,
    period: null,
    periodType: "unknown" as const,
    fiscalDate: null,
    filingDate: null,
    disclosureDate: null,
    statementScope: "unknown" as const,
    auditStatus: "unknown" as const,
    sourceChannel: "company_ir" as const,
    sourceUrl: c.url,
    documentUrl: null,
    mimeType: null,
    confidence: 0.4,
    rawNote: "Catalog IR công khai — truy xuất nguồn; không coi là đã parse BCTC.",
  }));
}

/** Optional JSON adapters via env (HOSE/HNX/custom IR API). SSC built-in via ssc-portal. */
async function discoverOfficialPortals(symbol: string): Promise<{
  filings: OfficialFiling[];
  channels: FilingSourceChannel[];
}> {
  const channels: FilingSourceChannel[] = [];
  const filings: OfficialFiling[] = [];
  const portals: { env: string; channel: FilingSourceChannel }[] = [
    { env: "SSC_IDS_BASE_URL", channel: "ssc_ids" },
    { env: "HOSE_DISCLOSURE_URL", channel: "hose_disclosure" },
    { env: "HNX_DISCLOSURE_URL", channel: "hnx_disclosure" },
    { env: "COMPANY_IR_BASE_URL", channel: "company_ir" },
  ];
  for (const p of portals) {
    const base = process.env[p.env]?.trim();
    if (!base) continue;
    channels.push(p.channel);
    try {
      const res = await httpJson<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>(
        `${base.replace(/\/$/, "")}/${symbol.toUpperCase()}`,
        { provider: p.channel, timeoutMs: 8_000, retries: 0 },
      );
      if (!res.ok) continue;
      const rows = Array.isArray(res.data) ? res.data : (res.data as { data?: Record<string, unknown>[] })?.data;
      if (!rows?.length) continue;
      rows.slice(0, 20).forEach((row, idx) => {
        const title = String(row.title ?? row.name ?? "Filing");
        const cls = classifyFiling({ title });
        const fiscalDate = typeof row.fiscalDate === "string" ? row.fiscalDate : null;
        filings.push({
          id: filingId(symbol, p.channel, fiscalDate, cls.kind, idx),
          ticker: symbol.toUpperCase(),
          kind: cls.kind,
          title,
          period: periodLabelFromFiscal(fiscalDate, cls.periodType),
          periodType: cls.periodType,
          fiscalDate,
          filingDate: typeof row.filingDate === "string" ? row.filingDate : null,
          disclosureDate: typeof row.disclosureDate === "string" ? row.disclosureDate : null,
          statementScope: cls.statementScope,
          auditStatus: cls.auditStatus,
          sourceChannel: p.channel,
          sourceUrl: base,
          documentUrl:
            typeof row.url === "string"
              ? row.url
              : typeof row.documentUrl === "string"
                ? row.documentUrl
                : null,
          mimeType: typeof row.mimeType === "string" ? row.mimeType : null,
          confidence: 0.9,
        });
      });
    } catch {
      /* channel unavailable */
    }
  }
  return { filings, channels };
}

export async function discoverOfficialFilings(symbol: string): Promise<FilingDiscoveryResult> {
  const sym = symbol.toUpperCase();
  const channelsAttempted: FilingSourceChannel[] = [];
  const notes: string[] = [];
  const all: OfficialFiling[] = [];

  // 1) SSC CongBoThongTin — always on (official SoT)
  channelsAttempted.push("ssc_ids");
  const ssc = await discoverFromSscPortal(sym);
  all.push(...ssc.filings);
  notes.push(...ssc.notes);

  // 2) Optional env JSON adapters (HOSE/HNX/custom)
  const portals = await discoverOfficialPortals(sym);
  channelsAttempted.push(...portals.channels.filter((c) => c !== "ssc_ids"));
  all.push(...portals.filings);

  // 3) Structured metadata & Real-time Signed Disclosures (HOSE/HNX)
  channelsAttempted.push("hose_disclosure");
  const news = await discoverFromFinfoNews(sym);
  all.push(...news.filings);

  channelsAttempted.push("vndirect_fs_meta");
  const fs = await discoverFromFsMeta(sym);
  all.push(...fs.filings);
  if (!fs.ok && !news.ok) notes.push("Không phát hiện kỳ BCTC từ metadata VNDirect.");

  channelsAttempted.push("vndirect_events");
  const ev = await discoverFromEvents(sym);
  all.push(...ev.filings);

  // 4) Public IR catalog
  channelsAttempted.push("company_ir");
  all.push(...discoverPublicCatalog(sym));

  all.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (b.filingDate ?? b.fiscalDate ?? "").localeCompare(a.filingDate ?? a.fiscalDate ?? "");
  });

  const seen = new Set<string>();
  const unique: OfficialFiling[] = [];
  for (const f of all) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    unique.push(f);
  }

  return {
    ticker: sym,
    filings: unique.slice(0, 50),
    discoveredAt: new Date().toISOString(),
    channelsAttempted: [...new Set(channelsAttempted)],
    notes,
  };
}
