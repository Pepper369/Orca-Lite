import { ok, badRequest } from "@/lib/envelope";
import {
  VN_SYSTEMIC_EXPOSURE_MAP,
  getContagionExposureForTicker,
  evaluateSystemicLegalRisk,
  type LegalRiskSignal,
} from "@/lib/services/systemic-risk-radar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Dữ liệu mẫu radar các vụ việc pháp lý & lan tỏa trọng điểm gần đây để theo dõi
const MOCK_HISTORICAL_SIGNALS: Array<{ title: string; content: string; ticker: string }> = [
  {
    title: "Novaland (NVL) nỗ lực đàm phán gia hạn các lô trái phiếu chậm trả lãi",
    content: "Các ngân hàng chủ nợ lớn gồm VPBank, MBBank đang phối hợp tái cấu trúc dư nợ dự án Aqua City.",
    ticker: "NVL",
  },
  {
    title: "Kết luận thanh tra các dự án năng lượng tái tạo và điện mặt trời mái nhà",
    content: "Một số dự án của Bamboo Capital (BCG) thuộc diện rà soát giá FIT và cơ cấu nợ trái phiếu tại TPBank.",
    ticker: "BCG",
  },
  {
    title: "Vinhomes (VHM) tiếp tục bàn giao phân khu cao tầng tại các đại đô thị",
    content: "Techcombank (TCB) tài trợ các gói tín dụng người mua nhà và bảo lãnh tiến độ.",
    ticker: "VHM",
  },
];

/**
 * TRỤ CỘT 3: RADAR RỦI RO PHÁP LÝ & LAN TỎA HỆ THỐNG
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

  // 2. Nếu không có symbol, trả về toàn cảnh Radar rủi ro hệ thống
  const activeSignals: LegalRiskSignal[] = [];
  for (const item of MOCK_HISTORICAL_SIGNALS) {
    const sig = evaluateSystemicLegalRisk(item.title, item.content, item.ticker);
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
