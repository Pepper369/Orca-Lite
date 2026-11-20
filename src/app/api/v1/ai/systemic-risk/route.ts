import { ok, badRequest } from "@/lib/envelope";
import {
  VN_SYSTEMIC_EXPOSURE_MAP,
  getContagionExposureForTicker,
  evaluateSystemicLegalRisk,
  type LegalRiskSignal,
} from "@/lib/services/systemic-risk-radar";
import { getLastMasterSnapshot } from "@/lib/services/screener-snapshot-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRỤ CỘT 3: RADAR RỦI RO PHÁP LÝ & LAN TỎA HỆ THỐNG (100% REAL EXPOSURE & BCTC DATA)
 * GET /api/v1/ai/systemic-risk?symbol=NVL
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol");
  const symbol = rawSymbol?.toUpperCase().trim();

  // 1. Nếu có symbol, kiểm tra định dạng và trả về chuỗi lan tỏa liên đới của riêng mã đó
  if (symbol) {
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) {
      return badRequest("Mã cổ phiếu không hợp lệ");
    }
    const links = getContagionExposureForTicker(symbol);
    return ok({
      ticker: symbol,
      contagionLinks: links,
      totalLinkedPartners: links.length,
      note: "Bản đồ liên kết tín dụng, bảo lãnh trái phiếu và tài sản thế chấp chéo.",
    });
  }

  // 2. Tổng hợp tín hiệu thực tế từ VN_SYSTEMIC_EXPOSURE_MAP kết hợp chỉ số sức khỏe tài chính thực từ Master Snapshot
  const snap = getLastMasterSnapshot();
  const snapMap = new Map((snap?.items ?? []).map((it) => [it.symbol.toUpperCase(), it]));
  const activeSignals: LegalRiskSignal[] = [];
  const evaluatedTickers = new Set<string>();

  for (const link of VN_SYSTEMIC_EXPOSURE_MAP) {
    if (link.contagionLevel !== "HIGH" && link.contagionLevel !== "MEDIUM") continue;
    if (evaluatedTickers.has(link.sourceTicker)) continue;
    evaluatedTickers.add(link.sourceTicker);

    const item = snapMap.get(link.sourceTicker);
    const deText =
      item?.debtEquity != null ? ` (D/E=${item.debtEquity}x, Altman=${item.altmanZone ?? "N/A"})` : "";
    const title = `Giám sát rủi ro tín dụng & trái phiếu liên kết hệ thống: ${link.sourceTicker} ↔ ${link.targetTicker}`;
    const content = `${link.relationshipVi}: ${link.note}${deText}`;

    const sig = evaluateSystemicLegalRisk(title, content, link.sourceTicker);
    if (sig) activeSignals.push(sig);
  }

  return ok({
    radarSignals: activeSignals,
    systemicMap: VN_SYSTEMIC_EXPOSURE_MAP,
    totalTrackedLinks: VN_SYSTEMIC_EXPOSURE_MAP.length,
    highRiskLinksCount: VN_SYSTEMIC_EXPOSURE_MAP.filter((l) => l.contagionLevel === "HIGH").length,
    timestamp: new Date().toISOString(),
  });
}
