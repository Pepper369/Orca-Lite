import { ok } from "@/lib/envelope";
import { getBCTCDeadlines, type BctcDeadline } from "@/lib/services/earnings-intel";
import { BOOTSTRAP_VN30_QUOTES } from "@/lib/bootstrap-data";
import { VN_ICB_SECTORS } from "@/lib/engines/rrg-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface CompanyEarningsItem {
  symbol: string;
  name: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  sector: string;
  period: string;
  deadlineDate: string;
  status: "PUBLISHED" | "PENDING" | "OVERDUE";
  publishedAt?: string;
  revenueVndBillions?: number;
  netProfitVndBillions?: number;
  growthPct?: number;
  qualityGrade?: "GRADE_A" | "GRADE_B" | "GRADE_C" | "GRADE_D";
  qualityTitleVi?: string;
  docUrl?: string;
}

// Bảng dữ liệu tiến độ công bố BCTC mẫu của rổ đại diện thị trường
const SAMPLE_EARNINGS_DATABASE: CompanyEarningsItem[] = [
  {
    symbol: "HPG",
    name: "Tập đoàn Hòa Phát",
    exchange: "HOSE",
    sector: "Thép & Vật liệu",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-18",
    revenueVndBillions: 34500,
    netProfitVndBillions: 3200,
    growthPct: 24.5,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Tăng trưởng từ HĐKD cốt lõi",
    docUrl: "https://congbothongtin.ssc.gov.vn",
  },
  {
    symbol: "FPT",
    name: "Công ty Cổ phần FPT",
    exchange: "HOSE",
    sector: "Công nghệ thông tin",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-15",
    revenueVndBillions: 16800,
    netProfitVndBillions: 2450,
    growthPct: 21.2,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Doanh thu phần mềm nước ngoài vững chắc",
    docUrl: "https://congbothongtin.ssc.gov.vn",
  },
  {
    symbol: "VNM",
    name: "Vinamilk",
    exchange: "HOSE",
    sector: "Thực phẩm & Đồ uống",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-19",
    revenueVndBillions: 15200,
    netProfitVndBillions: 2150,
    growthPct: 5.8,
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Chất lượng khá: Biên lợi nhuận gộp hồi phục",
    docUrl: "https://congbothongtin.ssc.gov.vn",
  },
  {
    symbol: "VCB",
    name: "Ngân hàng Ngoại thương Việt Nam",
    exchange: "HOSE",
    sector: "Ngân hàng",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-19",
    revenueVndBillions: 19500,
    netProfitVndBillions: 11200,
    growthPct: 12.3,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Tỷ lệ bao phủ nợ xấu dẫn đầu hệ thống",
  },
  {
    symbol: "TCB",
    name: "Ngân hàng Kỹ thương Việt Nam",
    exchange: "HOSE",
    sector: "Ngân hàng",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-17",
    revenueVndBillions: 13200,
    netProfitVndBillions: 6800,
    growthPct: 15.6,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Thu nhập phí và CASA phục hồi",
  },
  {
    symbol: "SSI",
    name: "Chứng khoán SSI",
    exchange: "HOSE",
    sector: "Dịch vụ tài chính",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-16",
    revenueVndBillions: 2100,
    netProfitVndBillions: 780,
    growthPct: 35.1,
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Chất lượng khá: Mảng môi giới và FVTPL tăng mạnh",
  },
  {
    symbol: "VND",
    name: "Chứng khoán VNDirect",
    exchange: "HOSE",
    sector: "Dịch vụ tài chính",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-19",
    revenueVndBillions: 1850,
    netProfitVndBillions: 610,
    growthPct: 18.4,
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Chất lượng khá: Dư nợ margin mở rộng",
  },
  {
    symbol: "NVL",
    name: "Tập đoàn Đầu tư Địa ốc No Va",
    exchange: "HOSE",
    sector: "Bất động sản",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-20",
    revenueVndBillions: 2300,
    netProfitVndBillions: 450,
    growthPct: -15.0,
    qualityGrade: "GRADE_D",
    qualityTitleVi: "Báo động đỏ: Thoát lỗ nhờ thu nhập tài chính và gia hạn nợ",
  },
  {
    symbol: "PDR",
    name: "Bất động sản Phát Đạt",
    exchange: "HOSE",
    sector: "Bất động sản",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-18",
    revenueVndBillions: 680,
    netProfitVndBillions: 280,
    growthPct: 8.5,
    qualityGrade: "GRADE_C",
    qualityTitleVi: "Chất lượng trung bình: Chuyển nhượng dự án đóng góp chính",
  },
  {
    symbol: "SHS",
    name: "Chứng khoán Sài Gòn - Hà Nội",
    exchange: "HNX",
    sector: "Dịch vụ tài chính",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-18",
    revenueVndBillions: 750,
    netProfitVndBillions: 340,
    growthPct: 28.0,
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Chất lượng khá: Danh mục tự doanh cổ phiếu tăng trưởng",
  },
  {
    symbol: "PVS",
    name: "Tổng Cổ phần Dịch vụ Kỹ thuật Dầu khí",
    exchange: "HNX",
    sector: "Dầu khí",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-19",
    revenueVndBillions: 5400,
    netProfitVndBillions: 310,
    growthPct: 14.8,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Khối lượng công việc mảng EPC điện gió ngoài khơi",
  },
  {
    symbol: "IDC",
    name: "Tổng Công ty IDICO",
    exchange: "HNX",
    sector: "Bất động sản KCN",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-17",
    revenueVndBillions: 2150,
    netProfitVndBillions: 580,
    growthPct: 32.1,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Cho thuê đất KCN Hựu Thạnh và Cầu Nghìn",
  },
  {
    symbol: "BSR",
    name: "Lọc hóa dầu Bình Sơn",
    exchange: "UPCOM",
    sector: "Dầu khí",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-19",
    revenueVndBillions: 31800,
    netProfitVndBillions: 1250,
    growthPct: -8.4,
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Chất lượng khá: Crack spread lọc dầu duy trì tích cực",
  },
  {
    symbol: "VGI",
    name: "Viettel Global",
    exchange: "UPCOM",
    sector: "Viễn thông",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PUBLISHED",
    publishedAt: "2026-01-18",
    revenueVndBillions: 8900,
    netProfitVndBillions: 1450,
    growthPct: 45.2,
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Chất lượng cao: Thị trường Châu Phi và Đông Nam Á bứt phá",
  },
  {
    symbol: "VIC",
    name: "Tập đoàn Vingroup",
    exchange: "HOSE",
    sector: "Bất động sản & Công nghiệp",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PENDING",
    qualityGrade: "GRADE_B",
    qualityTitleVi: "Đang chờ công bố hợp nhất đầy đủ",
  },
  {
    symbol: "VHM",
    name: "Vinhomes",
    exchange: "HOSE",
    sector: "Bất động sản",
    period: "Q4/2025",
    deadlineDate: "2026-01-20",
    status: "PENDING",
    qualityGrade: "GRADE_A",
    qualityTitleVi: "Đang chờ công bố phân kỳ bàn giao Ocean Park 2-3",
  },
];

/**
 * TRỤ CỘT 4: BCTC STATUTORY DEADLINES & DISCLOSURE PROGRESS API
 * GET /api/v1/earnings/calendar?year=2026
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const yearParam = Number(searchParams.get("year")) || currentYear;

  const deadlines: BctcDeadline[] = getBCTCDeadlines(yearParam);

  // Tìm hạn nộp kế tiếp gần nhất
  const upcomingDeadline =
    deadlines.find((d) => d.daysRemaining >= 0) || deadlines[deadlines.length - 1]!;

  const totalCompanies = SAMPLE_EARNINGS_DATABASE.length;
  const publishedCount = SAMPLE_EARNINGS_DATABASE.filter((c) => c.status === "PUBLISHED").length;
  const pendingCount = SAMPLE_EARNINGS_DATABASE.filter((c) => c.status === "PENDING").length;
  const overdueCount = SAMPLE_EARNINGS_DATABASE.filter((c) => c.status === "OVERDUE").length;
  const progressPct = Math.round((publishedCount / totalCompanies) * 100);

  return ok({
    deadlines,
    upcomingDeadline,
    progress: {
      totalCompanies,
      publishedCount,
      pendingCount,
      overdueCount,
      progressPct,
    },
    companies: SAMPLE_EARNINGS_DATABASE,
    legalBasisVi: "Thông tư 96/2020/TT-BTC của Bộ Tài chính hướng dẫn công bố thông tin trên TTCK",
    timestamp: new Date().toISOString(),
  });
}
