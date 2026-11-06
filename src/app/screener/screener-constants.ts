import type { ScreenerPreset } from "@/lib/services/screener-snapshot-service";

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

export const PRESET_TABS: PresetTabItem[] = [
  // Core Orca
  { id: "all", category: "core", label: "Tất cả", dotColor: "bg-text-muted", desc: "Toàn bộ thị trường niêm yết" },
  { id: "apex_buy_now", category: "core", label: "Điểm Mua Kích Hoạt", dotColor: "bg-emerald-400", desc: "Kích hoạt điểm mua tức thời: Chạm chuẩn điểm mua / Vùng Vàng + Nổ vol gom hàng Pocket Pivot / Cá mập + Dư địa cản trên >= 5% + R:R >= 2.0x" },
  { id: "orca_apex_quant", category: "core", label: "Chân Sóng Apex", dotColor: "bg-amber-400", desc: "Đỉnh cao hợp lưu: Đảo chiều chân sóng Wyckoff Spring + Quant OU Z-score + Khóa chặt vùng Sweet Launch Zone (chưa chạy xa đáy) + Dư địa tăng >= 6.5%" },
  { id: "historical_edge", category: "core", label: "Lợi Thế Lịch Sử", dotColor: "bg-emerald-400", desc: "Bộ lọc tối ưu dựa trên huấn luyện chuỗi giá quá khứ: Tỷ lệ thắng thực nghiệm >= 60%, tích lũy Up/Down Vol >= 1.15x, loại bỏ hoàn toàn bẫy giá" },
  { id: "orca_master_elite", category: "core", label: "Orca Master 80+", dotColor: "bg-amber-400", desc: "Top siêu phẩm tổng hợp 5 trụ cột (Kỹ thuật + Cá mập + Cơ bản + Điểm mua + Định giá)" },
  { id: "smart_money_inflow", category: "core", label: "Dòng Tiền Cá Mập", dotColor: "bg-purple-400", desc: "Dấu chân tổ chức: Mua chủ động > 65%, Khối ngoại gom ròng hoặc Pocket Pivot nổ vol" },
  { id: "near_buy_point", category: "core", label: "Sát Điểm Mua (Buy Zone)", dotColor: "bg-emerald-400", desc: "Cổ phiếu có điểm mua gần giá hiện tại nhất (|Lệch| ≤ 1.5%), R:R ≥ 2.5, rủi ro cắt lỗ cực thấp" },
  { id: "sector_leading", category: "core", label: "Ngành Dẫn Dắt RRG", dotColor: "bg-emerald-400", desc: "Cổ phiếu thuộc ngành Dẫn dắt (Leading Quadrant RRG) với RS-Ratio & RS-Momentum vượt trội VN-Index" },

  // Price Action & MTF
  { id: "smc_golden_pocket", category: "price_action", label: "SMC & Golden Pocket (A+)", dotColor: "bg-purple-400", desc: "Hợp lưu đỉnh cao Hạng A+: Quét rũ thanh khoản (Liquidity Sweep/OB) + Rút chân tại Golden Pocket Fibo (0.618-0.65) + Mua chủ động" },
  { id: "flip_zone_retest", category: "price_action", label: "Retest Flip Zone Cản Cũ", dotColor: "bg-blue-400", desc: "Hợp lưu cấu trúc: Kháng cự cũ bị phá vỡ dứt khoát nay trở thành Hỗ trợ mới (Role Reversal) kèm cạn cung" },
  { id: "mtf_confluence", category: "price_action", label: "Đồng Thuận H1-D1-W1", dotColor: "bg-emerald-400", desc: "Đồng thuận đa khung tuyệt đối: Cả 3 khung H1 (Giờ) · D1 (Ngày) · W1 (Tuần) cùng tăng kèm cụm nến đảo chiều" },
  { id: "bottom_confluence", category: "price_action", label: "Tam Hợp Lưu Đáy", dotColor: "bg-cyan-400", desc: "Tam Hợp Lưu Đáy: Hỗ trợ MA/Reclaim MA + Nến đảo chiều tăng + Phân kỳ dương RSI/MACD kép" },
  { id: "confluence", category: "price_action", label: "Hội Tụ 4 Trụ Cột", dotColor: "bg-amber-400", desc: "Hội tụ 4 trụ cột: Xu hướng + Mẫu hình + Dòng tiền + Cơ bản" },
  { id: "vsa_no_supply", category: "price_action", label: "Cạn Cung VSA", dotColor: "bg-teal-400", desc: "Dấu hiệu cạn cung (No Supply Test) tại hỗ trợ MA hoặc lực cầu hấp thụ Stopping Volume" },
  { id: "ttm_squeeze", category: "price_action", label: "Nén Squeeze (TTM) & Ribbon", dotColor: "bg-purple-400", desc: "Độ nén biến động kép: Bollinger nén trong Keltner (TTM) hoặc dải MA Ribbon hội tụ co cụm <= 2.8%" },
  { id: "vcp", category: "price_action", label: "Mẫu Hình VCP / Cup", dotColor: "bg-blue-400", desc: "Minervini VCP, Cốc tay cầm, Hai đáy" },
  { id: "breakout", category: "price_action", label: "Bùng Nổ Khối Lượng", dotColor: "bg-purple-400", desc: "Giá tăng > 2% kèm vol lớn vượt đỉnh" },
  { id: "ma_cross", category: "price_action", label: "Giao Cắt MA Vàng", dotColor: "bg-emerald-400", desc: "Golden Cross & Trật tự MA tăng" },
  { id: "tight_closes_vdu", category: "price_action", label: "Nén Minervini & Cạn Von", dotColor: "bg-teal-400", desc: "Nén giá phẳng Tight Closes (≤ 1.25%) kết hợp Cạn kiệt thanh khoản VDU (≤ 0.60x MA20) & Wyckoff LPS" },

  // Quant Pro
  { id: "quant_edge", category: "quant", label: "Ưu Thế Quant Pro", dotColor: "bg-cyan-400", desc: "Top cổ phiếu có ưu thế định lượng thống kê toàn diện (Score >= 62)" },
  { id: "quant_mean_revert", category: "quant", label: "Mean Reversion OU", dotColor: "bg-emerald-400", desc: "Mô hình Ornstein-Uhlenbeck: Bắt đáy thống kê Z-Score <= -1.4, chu kỳ t½" },
  { id: "quant_low_beta", category: "quant", label: "Low-Beta Anomaly", dotColor: "bg-blue-400", desc: "Bất thường học thuyết AQR: Beta <= 0.88 & Chất lượng cao" },
  { id: "quant_asymmetric", category: "quant", label: "Triple-Barrier R/R ≥ 2", dotColor: "bg-amber-400", desc: "Tỷ lệ Lời/Lỗ tối ưu theo mô hình biến động Marcos López de Prado" },

  // Fundamental & CANSLIM
  { id: "rs_leaders", category: "fundamental", label: "Dẫn Dắt RS 80+ (O'Neil)", dotColor: "bg-amber-400", desc: "Top siêu cổ phiếu có Relative Strength Rating >= 80 (chuẩn William O'Neil)" },
  { id: "canslim", category: "fundamental", label: "CANSLIM & Tăng Trưởng", dotColor: "bg-emerald-400", desc: "Tăng trưởng doanh thu, LNST vượt trội > 20% & ROE dẫn dắt" },
  { id: "piotroski_diamonds", category: "fundamental", label: "Piotroski & Altman Z", dotColor: "bg-cyan-400", desc: "Sức khỏe tài chính xuất sắc: Piotroski F-Score >= 7 và Altman Z'' Vùng An Toàn" },
  { id: "fa_fortress", category: "fundamental", label: "Pháo Đài Tài Chính", dotColor: "bg-emerald-400", desc: "Pháo đài tiền mặt ròng (Net Cash > Nợ), Phủ lãi vay ICR >= 4.0x, Đòn bẩy an toàn tuyệt đối" },
  { id: "earnings_quality", category: "fundamental", label: "Dòng Tiền Thực Chất", dotColor: "bg-cyan-400", desc: "Chất lượng lợi nhuận cao: Dòng tiền thuần HĐKD CFO / LNST >= 1.0x & Dòng tiền tự do FCF dương" },
  { id: "magic_formula", category: "fundamental", label: "Magic Formula (Greenblatt)", dotColor: "bg-amber-400", desc: "Công thức kỳ diệu Joel Greenblatt: Tỷ suất sinh lời vốn đầu tư ROIC >= 15% kết hợp Định giá P/E rẻ" },
  { id: "consensus_upside", category: "fundamental", label: "Định Giá Hời CTCK", dotColor: "bg-indigo-400", desc: "Upside định giá mục tiêu từ các CTCK hàng đầu (Vietcap, VNDirect...) >= 20% so với thị giá hiện tại" },
  { id: "value", category: "fundamental", label: "Giá Trị Biên An Toàn", dotColor: "bg-blue-400", desc: "P/E < 11, P/B < 1.3, an toàn vốn" },
  { id: "dividend", category: "fundamental", label: "Cổ Tức Tiền Mặt Cao", dotColor: "bg-emerald-400", desc: "Cổ tức tiền mặt > 5%, nợ an toàn" },
];

export function getPresetCategory(preset: ScreenerPreset): StrategyGroup {
  const item = PRESET_TABS.find((t) => t.id === preset);
  return item ? item.category : "core";
}
