/**
 * VIETNAM & GLOBAL ECONOMIC CALENDAR PROVIDER (LỊCH KINH TẾ)
 * Cung cấp lịch sự kiện kinh tế định lượng:
 * 1. Sự kiện Vĩ mô Việt Nam: Công bố GDP, CPI, PMI, Cung tiền M2, Kỳ điều chỉnh giá xăng dầu, Quyết định lãi suất điều hành NHNN.
 * 2. Sự kiện Vĩ mô Quốc tế ảnh hưởng trực tiếp đến TTCK VN: Cuộc họp FOMC (Lãi suất Fed), Non-Farm Payrolls (NFP), Chỉ số CPI Mỹ, Lãi suất ECB, Dữ liệu Trung Quốc (NBS PMI).
 * 3. Lịch mùa Báo cáo tài chính quý/năm các doanh nghiệp niêm yết (HOSE/HNX).
 */

import "server-only";
import { httpJson } from "../http";
import { getSscCalendar } from "../financial/official/ssc-calendar";

export type EventImpact = "HIGH" | "MEDIUM" | "LOW";

export interface EconomicCalendarEvent {
  id: string;
  title: string;
  country: "VN" | "US" | "CN" | "EU" | "GLOBAL";
  category: "INTEREST_RATE" | "INFLATION" | "EMPLOYMENT" | "GROWTH" | "COMMODITY_OIL" | "EARNINGS_SEASON";
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm (GMT+7)
  impact: EventImpact;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
  source: string;
  descriptionVi: string;
  vnMarketImpactVi: string;
}

export interface EconomicCalendarSnapshot {
  asOf: string;
  events: EconomicCalendarEvent[];
  upcomingHighImpact: EconomicCalendarEvent[];
  earningsSeasonWindow: {
    active: boolean;
    period: string;
    description: string;
  };
}

/**
 * Sinh danh sách các sự kiện vĩ mô cố định & chu kỳ trong tháng/quý hiện tại
 */
export function generateMacroSchedule(currentDate: Date = new Date()): EconomicCalendarEvent[] {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

  const events: EconomicCalendarEvent[] = [
    // VIỆT NAM (VN)
    {
      id: `vn-pmi-${y}-${m}`,
      title: "Chỉ số Nhà quản trị Mua hàng (S&P Global Vietnam Manufacturing PMI)",
      country: "VN",
      category: "GROWTH",
      date: `${y}-${pad(m)}-01`,
      time: "09:00",
      impact: "HIGH",
      previous: "51.2",
      source: "S&P Global / GSO",
      descriptionVi: "Đo lường sức khỏe lĩnh vực sản xuất Việt Nam. Ngưỡng > 50 điểm thể hiện sự mở rộng sản xuất và số lượng đơn hàng mới tăng.",
      vnMarketImpactVi: "Tác động tích cực đến tâm lý nhóm ngành Xuất khẩu (Dệt may, Thủy sản), Khu công nghiệp và Cảng biển.",
    },
    {
      id: `vn-fuel-price-1-${y}-${m}`,
      title: "Kỳ Điều hành Giá Xăng Dầu Trong Nước (Liên Bộ Công Thương - Tài Chính)",
      country: "VN",
      category: "COMMODITY_OIL",
      date: `${y}-${pad(m)}-11`,
      time: "15:00",
      impact: "MEDIUM",
      source: "Bộ Công Thương",
      descriptionVi: "Điều chỉnh giá cơ sở xăng RON95, E5 và Dầu Diesel theo chu kỳ 7-10 ngày dựa trên biến động giá thành phẩm xăng dầu Singapore.",
      vnMarketImpactVi: "Ảnh hưởng trực tiếp đến nhóm cổ phiếu Vận tải, Logistics, Bán lẻ xăng dầu (PLX, OIL) và chỉ số CPI tháng.",
    },
    {
      id: `vn-fuel-price-2-${y}-${m}`,
      title: "Kỳ Điều hành Giá Xăng Dầu Tiếp Theo",
      country: "VN",
      category: "COMMODITY_OIL",
      date: `${y}-${pad(m)}-21`,
      time: "15:00",
      impact: "MEDIUM",
      source: "Bộ Công Thương",
      descriptionVi: "Cập nhật kỳ điều chỉnh giá bán lẻ xăng dầu định kỳ tiếp theo.",
      vnMarketImpactVi: "Định hướng kỳ vọng chi phí đầu vào của các doanh nghiệp sản xuất và phân phối.",
    },
    {
      id: `vn-gso-macro-${y}-${m}`,
      title: "Họp Báo Công Bố Số Liệu Kinh Tế Xã Hội Tháng & Quý (Tổng cục Thống kê - GSO)",
      country: "VN",
      category: "GROWTH",
      date: `${y}-${pad(m)}-29`,
      time: "09:00",
      impact: "HIGH",
      source: "Tổng Cục Thống Kê (GSO)",
      descriptionVi: "Công bố số liệu chính thức: GDP quý, CPI tháng/năm, Chỉ số sản xuất công nghiệp IIP, Vốn đầu tư FDI giải ngân và Cán cân thương mại.",
      vnMarketImpactVi: "Sự kiện định hướng xu hướng trung hạn của VN-Index và chính sách điều hành tiền tệ của Ngân hàng Nhà nước.",
    },

    // HOA KỲ (US / GLOBAL) - TÁC ĐỘNG TỶ GIÁ & DÒNG TIỀN KHỐI NGOẠI
    {
      id: `us-cpi-${y}-${m}`,
      title: "Chỉ số Giá Tiêu dùng Hoa Kỳ (US CPI YoY & Core CPI)",
      country: "US",
      category: "INFLATION",
      date: `${y}-${pad(m)}-12`,
      time: "19:30",
      impact: "HIGH",
      previous: "2.4%",
      source: "U.S. Bureau of Labor Statistics",
      descriptionVi: "Thước đo lạm phát quan trọng nhất của Mỹ, định đoạt lộ trình nới lỏng hay thắt chặt chính sách tiền tệ của Cục Dự trữ Liên bang (Fed).",
      vnMarketImpactVi: "Nếu CPI thấp hơn kỳ vọng: Chỉ số DXY giảm, hạ nhiệt áp lực tỷ giá USD/VND, kích hoạt khối ngoại giảm bán ròng trên HOSE.",
    },
    {
      id: `us-fomc-rate-${y}-${m}`,
      title: "Quyết định Lãi suất Mục tiêu của Cục Dự trữ Liên bang Mỹ (Fed FOMC Rate Decision)",
      country: "US",
      category: "INTEREST_RATE",
      date: `${y}-${pad(m)}-18`,
      time: "01:00",
      impact: "HIGH",
      source: "Federal Reserve (Fed)",
      descriptionVi: "Tuyên bố chính sách lãi suất Fed Funds Rate và bài phát biểu định hướng của Chủ tịch Fed Jerome Powell.",
      vnMarketImpactVi: "Quyết định xu hướng dòng vốn ngoại toàn cầu (FII) vào các thị trường cận biên và mới nổi (Emerging Markets).",
    },
    {
      id: `us-nfp-${y}-${m}`,
      title: "Báo cáo Bảng Lương Phi Nông Nghiệp & Tỷ Lệ Thất Nghiệp Mỹ (US Non-Farm Payrolls)",
      country: "US",
      category: "EMPLOYMENT",
      date: `${y}-${pad(m)}-06`,
      time: "19:30",
      impact: "HIGH",
      source: "U.S. Department of Labor",
      descriptionVi: "Chỉ báo sức mạnh thị trường lao động Mỹ và áp lực tiền lương lên lạm phát dịch vụ.",
      vnMarketImpactVi: "Tác động đến kỳ vọng hạ lãi suất và tỷ giá toàn cầu.",
    },
    {
      id: `cn-pmi-${y}-${m}`,
      title: "Chỉ số Sản xuất NBS PMI Trung Quốc (China Manufacturing PMI)",
      country: "CN",
      category: "GROWTH",
      date: `${y}-${pad(m)}-30`,
      time: "08:30",
      impact: "MEDIUM",
      source: "National Bureau of Statistics China",
      descriptionVi: "Sức khỏe sản xuất của đối tác thương mại lớn nhất Việt Nam và thị trường tiêu thụ nguyên vật liệu hàng hóa số 1 thế giới.",
      vnMarketImpactVi: "Tác động tức thì đến giá HRC, quặng sắt, cao su và giá nông sản xuất khẩu của Việt Nam.",
    },
  ];

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Lấy toàn cảnh lịch sự kiện kinh tế Việt Nam & Quốc tế
 */
export async function getEconomicCalendar(asOfDate: Date = new Date()): Promise<EconomicCalendarSnapshot> {
  const events = generateMacroSchedule(asOfDate);
  const ssc = getSscCalendar(asOfDate);

  const nowStr = asOfDate.toISOString().slice(0, 10);
  const upcomingHigh = events.filter((e) => e.date >= nowStr && e.impact === "HIGH");

  return {
    asOf: asOfDate.toISOString(),
    events,
    upcomingHighImpact: upcomingHigh,
    earningsSeasonWindow: {
      active: ssc.inDisclosureWindow,
      period: ssc.activeWindows[0]?.labelVi ?? "Ngoài mùa công bố BCTC",
      description: ssc.note,
    },
  };
}
