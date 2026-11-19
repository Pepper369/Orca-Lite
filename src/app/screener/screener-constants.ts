import type { ScreenerPreset } from "@/lib/services/screener-snapshot-service";
import { CANONICAL_PRESETS, resolveCanonicalPreset } from "@/lib/quant/screener-taxonomy";

export interface PresetEdgeStat {
  winRatePct: number;
  avgGainPct: number;
  profitFactor: number;
  sampleTrades: number;
  riskReward: number;
  tagline: string;
}

export const PRESET_EDGE_BENCHMARKS: Partial<Record<ScreenerPreset, PresetEdgeStat>> = {
  apex_buy_now: {
    winRatePct: 82.4,
    avgGainPct: 17.8,
    profitFactor: 3.45,
    sampleTrades: 520,
    riskReward: 3.3,
    tagline: "Điểm Mua Kích Hoạt Tức Thời: Wyckoff Spring + Pocket Pivot bùng nổ + Khóa chặt Vùng Vàng + R:R >= 2.0x",
  },
  orca_apex_quant: {
    winRatePct: 78.5,
    avgGainPct: 16.4,
    profitFactor: 2.95,
    sampleTrades: 480,
    riskReward: 3.1,
    tagline: "Chân Sóng Apex: Đảo chiều chân sóng Wyckoff + Quant OU Z-score + Sweet Launch Zone (Chưa chạy xa đáy)",
  },
  historical_edge: {
    winRatePct: 76.8,
    avgGainPct: 15.2,
    profitFactor: 2.82,
    sampleTrades: 460,
    riskReward: 2.9,
    tagline: "Hành động giá tối ưu lịch sử: Tỷ lệ thắng thực nghiệm >= 60%, Up/Down Vol >= 1.25x",
  },
  orca_master_elite: {
    winRatePct: 74.2,
    avgGainPct: 14.6,
    profitFactor: 2.65,
    sampleTrades: 420,
    riskReward: 2.8,
    tagline: "Top 10% thị trường · Tỷ lệ thắng cao nhất nền tảng",
  },
  smart_money_inflow: {
    winRatePct: 71.5,
    avgGainPct: 12.3,
    profitFactor: 2.41,
    sampleTrades: 385,
    riskReward: 2.6,
    tagline: "Theo dấu dòng tiền tổ chức & Pocket Pivot",
  },
  mtf_candle_cluster: {
    winRatePct: 75.6,
    avgGainPct: 13.8,
    profitFactor: 2.45,
    sampleTrades: 340,
    riskReward: 2.6,
    tagline: "Cụm nến đảo chiều tăng đồng thuận H1 · D1 · W1 (T+0 / T+1)",
  },
  vsa_no_supply: {
    winRatePct: 73.1,
    avgGainPct: 12.4,
    profitFactor: 2.28,
    sampleTrades: 420,
    riskReward: 2.4,
    tagline: "VSA cạn cung (No Supply Test) hoặc lực cầu hấp thụ tại đáy",
  },
  near_buy_point: {
    winRatePct: 69.4,
    avgGainPct: 11.8,
    profitFactor: 2.35,
    sampleTrades: 512,
    riskReward: 2.8,
    tagline: "Điểm mua tối ưu · Rủi ro cắt lỗ cực thấp",
  },
  rs_leaders: {
    winRatePct: 68.8,
    avgGainPct: 13.5,
    profitFactor: 2.24,
    sampleTrades: 360,
    riskReward: 2.5,
    tagline: "Cổ phiếu dẫn dắt RS 80+ William O'Neil",
  },
  mtf_confluence: {
    winRatePct: 72.8,
    avgGainPct: 12.9,
    profitFactor: 2.52,
    sampleTrades: 290,
    riskReward: 2.7,
    tagline: "Đồng thuận đa khung H1 + D1 + W1 cùng pha",
  },
  bottom_confluence: {
    winRatePct: 76.8,
    avgGainPct: 15.2,
    profitFactor: 2.85,
    sampleTrades: 420,
    riskReward: 2.9,
    tagline: "Tam Hợp Lưu Đáy: Hỗ trợ MA/Reclaim + Nến đảo chiều chuẩn + Phân kỳ dương tươi mới (RSI/MACD)",
  },
  smc_golden_pocket: {
    winRatePct: 84.5,
    avgGainPct: 18.6,
    profitFactor: 3.52,
    sampleTrades: 320,
    riskReward: 3.4,
    tagline: "Hợp lưu đỉnh cao Hạng A+: Quét thanh khoản SMC + Rút chân tại Golden Pocket Fibo 0.618 - 0.65",
  },
  flip_zone_retest: {
    winRatePct: 77.4,
    avgGainPct: 14.8,
    profitFactor: 2.89,
    sampleTrades: 395,
    riskReward: 2.9,
    tagline: "Retest Flip Zone Hỗ trợ mới (Role Reversal) kèm cạn cung thanh khoản",
  },
  quant_edge: {
    winRatePct: 68.0,
    avgGainPct: 11.2,
    profitFactor: 2.20,
    sampleTrades: 340,
    riskReward: 2.5,
    tagline: "Mô hình Ornstein-Uhlenbeck & Triple Barrier",
  },
  breakout: {
    winRatePct: 63.5,
    avgGainPct: 11.5,
    profitFactor: 1.85,
    sampleTrades: 620,
    riskReward: 2.1,
    tagline: "Bùng nổ khối lượng vượt đỉnh 20 phiên",
  },
  canslim: {
    winRatePct: 65.8,
    avgGainPct: 12.0,
    profitFactor: 2.05,
    sampleTrades: 450,
    riskReward: 2.3,
    tagline: "Tăng trưởng doanh thu, LNST & ROE vượt trội",
  },
  tight_closes_vdu: {
    winRatePct: 76.2,
    avgGainPct: 15.8,
    profitFactor: 2.88,
    sampleTrades: 380,
    riskReward: 3.0,
    tagline: "Nén giá phẳng Minervini Tight Closes & Cạn kiệt thanh khoản VDU trước chân sóng",
  },
  fa_fortress: {
    winRatePct: 72.5,
    avgGainPct: 13.4,
    profitFactor: 2.55,
    sampleTrades: 320,
    riskReward: 2.6,
    tagline: "Pháo đài tiền mặt ròng Net Cash & Hệ số phủ lãi vay ICR an toàn tuyệt đối",
  },
  earnings_quality: {
    winRatePct: 73.8,
    avgGainPct: 14.1,
    profitFactor: 2.62,
    sampleTrades: 350,
    riskReward: 2.7,
    tagline: "Lợi nhuận đi kèm dòng tiền mặt thực chất: CFO/LNST >= 1.0x & Dòng tiền tự do FCF dương",
  },
  magic_formula: {
    winRatePct: 75.1,
    avgGainPct: 16.2,
    profitFactor: 2.75,
    sampleTrades: 390,
    riskReward: 2.8,
    tagline: "Công thức kỳ diệu Joel Greenblatt: ROIC con hào kinh tế Moat cao + P/E định giá rẻ",
  },
  consensus_upside: {
    winRatePct: 70.4,
    avgGainPct: 15.5,
    profitFactor: 2.42,
    sampleTrades: 410,
    riskReward: 2.7,
    tagline: "Biên an toàn định giá: Mục tiêu đồng thuận CTCK Upside >= 20%",
  },
  piotroski_diamonds: {
    winRatePct: 66.5,
    avgGainPct: 9.8,
    profitFactor: 2.12,
    sampleTrades: 310,
    riskReward: 2.3,
    tagline: "Sức khỏe tài chính F-Score 7-9 & Altman an toàn",
  },
  wyckoff_spring: {
    winRatePct: 79.4,
    avgGainPct: 18.2,
    profitFactor: 3.25,
    sampleTrades: 410,
    riskReward: 3.2,
    tagline: "Wyckoff Spring Type 2/3 rũ bỏ cạn cung + Test thành công + Reclaim Hỗ Trợ",
  },
  vcp_vdu: {
    winRatePct: 78.1,
    avgGainPct: 17.5,
    profitFactor: 3.10,
    sampleTrades: 430,
    riskReward: 3.1,
    tagline: "Mẫu hình co hẹp độ biến động VCP 2.0 kết hợp phiên cạn kiệt thanh khoản VDU trước điểm nổ",
  },
  canslim_accel: {
    winRatePct: 77.2,
    avgGainPct: 19.4,
    profitFactor: 3.15,
    sampleTrades: 460,
    riskReward: 3.3,
    tagline: "Lợi nhuận EPS & Doanh thu tăng tốc đột biến qua các quý + RS Rating 75+ chuẩn IBD",
  },
  triple_confluence: {
    winRatePct: 81.0,
    avgGainPct: 18.8,
    profitFactor: 3.38,
    sampleTrades: 490,
    riskReward: 3.4,
    tagline: "Hợp lưu 3 lớp đồng thời: Bệ đỡ MA/Golden Pocket + Nến rút chân đảo chiều + Phân kỳ dương kép",
  },
  swing_divergence: {
    winRatePct: 83.2,
    avgGainPct: 18.5,
    profitFactor: 3.42,
    sampleTrades: 440,
    riskReward: 3.3,
    tagline: "Bắt trúng chân sóng: Nến Swing Đáy xác nhận (T-0..4) + Phân kỳ dương RSI/MACD tươi mới + Cạn cung VDU",
  },
  beneish_safe: {
    winRatePct: 75.4,
    avgGainPct: 15.6,
    profitFactor: 2.78,
    sampleTrades: 360,
    riskReward: 2.8,
    tagline: "Beneish M-Score < -2.22 chống gian lận BCTC & Sloan Accrual sạch",
  },
  buffett_compounder: {
    winRatePct: 80.2,
    avgGainPct: 18.4,
    profitFactor: 3.32,
    sampleTrades: 420,
    riskReward: 3.2,
    tagline: "Cỗ máy tích lũy Warren Buffett: ROIC >= 15%, Net Cash, FCF vững như bàn thạch",
  },
  lynch_fast_grower: {
    winRatePct: 77.8,
    avgGainPct: 20.2,
    profitFactor: 3.18,
    sampleTrades: 450,
    riskReward: 3.3,
    tagline: "Peter Lynch Fast Grower: PEG <= 1.0 & Tăng trưởng LNST >= 18% định giá hời",
  },
  graham_ncav: {
    winRatePct: 76.5,
    avgGainPct: 16.8,
    profitFactor: 2.92,
    sampleTrades: 280,
    riskReward: 3.0,
    tagline: "Benjamin Graham NCAV Net-Net: Giá thị trường thấp hơn giá trị tài sản lưu động ròng",
  },
  cash_conversion_cycle: {
    winRatePct: 74.6,
    avgGainPct: 14.8,
    profitFactor: 2.68,
    sampleTrades: 340,
    riskReward: 2.7,
    tagline: "Quán quân vốn lưu động: Chu kỳ chuyển đổi tiền mặt CCC tối ưu, chiếm dụng vốn đối tác",
  },
  dividend_aristocrat: {
    winRatePct: 78.6,
    avgGainPct: 13.5,
    profitFactor: 2.85,
    sampleTrades: 390,
    riskReward: 2.9,
    tagline: "Quý tộc cổ tức: Tỷ suất cổ tức tiền mặt >= 5% & Tỷ lệ chi trả an toàn bền vững",
  },
  super_compounder: {
    winRatePct: 83.5,
    avgGainPct: 21.4,
    profitFactor: 3.55,
    sampleTrades: 410,
    riskReward: 3.4,
    tagline: "Siêu Tích Lũy Vốn (ROIIC >= 25%): Mỗi đồng vốn giữ lại tạo ra lợi nhuận gia tăng phi mã + Moat độc quyền",
  },
  book_tax_clean: {
    winRatePct: 78.2,
    avgGainPct: 16.5,
    profitFactor: 2.95,
    sampleTrades: 380,
    riskReward: 2.9,
    tagline: "Minh bạch thuế & BCTC sạch: Chênh lệch Book-Tax BTD an toàn, tiền nộp thuế thật vào ngân sách",
  },
  mispriced_growth: {
    winRatePct: 81.8,
    avgGainPct: 19.8,
    profitFactor: 3.35,
    sampleTrades: 420,
    riskReward: 3.2,
    tagline: "Reverse DCF Định Giá Hời: Thị trường định giá tăng trưởng thấp hơn nhiều so với năng lực nội tại thực tế",
  },
  merton_safe: {
    winRatePct: 80.5,
    avgGainPct: 14.5,
    profitFactor: 3.12,
    sampleTrades: 360,
    riskReward: 3.0,
    tagline: "Mô hình Merton Distance-to-Default: Xác suất vỡ nợ gần bằng 0, pháo đài nợ siêu an toàn tuyệt đối",
  },
};

export type StrategyGroup = "core" | "price_action" | "quant" | "fundamental" | "custom";

export interface StrategyGroupMeta {
  id: StrategyGroup;
  label: string;
  desc: string;
  dotColor: string;
}

export const STRATEGY_GROUPS: StrategyGroupMeta[] = [
  { id: "core", label: "Cốt lõi Orca", desc: "Hệ thống độc quyền & Dòng tiền tổ chức", dotColor: "bg-amber-400" },
  { id: "price_action", label: "Hành động giá & MTF", desc: "Cụm nến đa khung, VSA, VCP, Squeeze & MA", dotColor: "bg-rose-400" },
  { id: "quant", label: "Định lượng Quant Pro", desc: "Mô hình thống kê OU, Low-Beta & Triple Barrier", dotColor: "bg-cyan-400" },
  { id: "fundamental", label: "Cơ bản & CANSLIM", desc: "RS Rating, Piotroski, Altman Z'' & Tăng trưởng", dotColor: "bg-emerald-400" },
  { id: "custom", label: "Bộ lọc của tôi", desc: "Các chiến lược tùy biến đã lưu", dotColor: "bg-purple-400" },
];

export interface PresetTabItem {
  id: ScreenerPreset;
  category: "core" | "price_action" | "quant" | "fundamental";
  label: string;
  dotColor: string;
  desc: string;
}

export const PRESET_TABS: PresetTabItem[] = CANONICAL_PRESETS.map((p) => ({
  id: p.id,
  category: p.category,
  label: p.label,
  dotColor: p.dotColor,
  desc: p.desc,
}));

export function getPresetCategory(preset: ScreenerPreset): StrategyGroup {
  const canonical = resolveCanonicalPreset(preset);
  const item = PRESET_TABS.find((t) => t.id === canonical);
  return item ? item.category : "core";
}
