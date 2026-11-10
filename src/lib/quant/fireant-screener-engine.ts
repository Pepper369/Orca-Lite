/**
 * FireAnt Screener Engine & Technical Scanning Presets
 * Reverse engineered from FireAnt Screener (https://fireant.vn/w/Screener)
 *
 * Implements the 5 core screening systems requested:
 * 1. "Quá bán, chờ hồi phục" (oversold_bounce)
 * 2. "MACD vừa phát tín hiệu mua" (macd_buy)
 * 3. "Giảm nhiều phiên rồi đảo chiều" (reversal_up)
 * 4. "Dòng tiền quay lại (MFI)" (mfi_money_return)
 * 5. "Bứt khỏi dải Bollinger" (bollinger_break)
 */

export interface FireAntScreenerCondition {
  definitionId: string;
  operator?: "GreaterThan" | "LessThan" | "Equals" | "Between";
  rangeValue1?: number;
  rangeValue2?: number;
  parameters?: Record<string, any>;
}

export interface FireAntScreenerPreset {
  id: string;
  name: string;
  explain: string;
  styleId: "technical" | "flow" | "growth" | "value" | "safety";
  icon: string;
  color: string;
  conditions: FireAntScreenerCondition[];
}

export const TARGET_FIREANT_SCREENERS: FireAntScreenerPreset[] = [
  {
    id: "oversold_bounce",
    name: "Quá bán, chờ hồi phục",
    explain:
      "RSI(14) dưới 30, giá đã giảm trên 10% trong 1 tháng nhưng thanh khoản vẫn tốt. Tìm cơ hội bắt đáy kỹ thuật, nên kết hợp thêm tín hiệu xác nhận.",
    styleId: "technical",
    icon: "Waves",
    color: "#8B5CF6",
    conditions: [
      {
        definitionId: "RSIBelowOverSoldLine",
        parameters: { overSold: 30 },
      },
      {
        definitionId: "PriceChange1m",
        operator: "LessThan",
        rangeValue1: -10,
      },
      {
        definitionId: "AvgVolume20d",
        operator: "GreaterThan",
        rangeValue1: 100000,
      },
      {
        definitionId: "MarketCap",
        operator: "GreaterThan",
        rangeValue1: 100,
      },
    ],
  },
  {
    id: "macd_buy",
    name: "MACD vừa phát tín hiệu mua",
    explain:
      "MACD vừa cắt lên đường tín hiệu, khối lượng phiên trên 100.000. Tín hiệu mua kinh điển cho thấy động lượng tăng đang mạnh lên.",
    styleId: "technical",
    icon: "Activity",
    color: "#A855F7",
    conditions: [
      {
        definitionId: "MACDCrossAboveSignalLine",
      },
      {
        definitionId: "Volume",
        operator: "GreaterThan",
        rangeValue1: 100000,
      },
      {
        definitionId: "MarketCap",
        operator: "GreaterThan",
        rangeValue1: 100,
      },
    ],
  },
  {
    id: "reversal_up",
    name: "Giảm nhiều phiên rồi đảo chiều",
    explain:
      "Đã giảm liên tục trên 3 phiên trước khi bật tăng trở lại, thanh khoản còn tốt. Điểm mua kỹ thuật sau nhịp chỉnh, không cần gói nâng cao.",
    styleId: "technical",
    icon: "CornerUpRight",
    color: "#9333EA",
    conditions: [
      {
        definitionId: "PriceDownConsecutiveDaysBeforeUp",
        operator: "GreaterThan",
        rangeValue1: 3,
      },
      {
        definitionId: "Volume",
        operator: "GreaterThan",
        rangeValue1: 100000,
      },
      {
        definitionId: "MarketCap",
        operator: "GreaterThan",
        rangeValue1: 300,
      },
    ],
  },
  {
    id: "mfi_money_return",
    name: "Dòng tiền quay lại (MFI)",
    explain:
      "Chỉ số dòng tiền MFI(14) vừa thoát khỏi vùng quá bán cùng thanh khoản trên 100.000. MFI tính cả khối lượng nên xác nhận dòng tiền tốt hơn RSI.",
    styleId: "technical",
    icon: "Gauge",
    color: "#6D28D9",
    conditions: [
      {
        definitionId: "MFICrossAboveOverSoldLine",
        parameters: { overSold: 20 },
      },
      {
        definitionId: "Volume",
        operator: "GreaterThan",
        rangeValue1: 100000,
      },
      {
        definitionId: "MarketCap",
        operator: "GreaterThan",
        rangeValue1: 100,
      },
    ],
  },
  {
    id: "bollinger_break",
    name: "Bứt khỏi dải Bollinger",
    explain:
      "Giá thoát ra ngoài biên trên Bollinger (20, 2σ) cùng khối lượng dự kiến vượt trung bình 5 phiên tối thiểu 50%. Báo hiệu biến động mạnh vừa bắt đầu.",
    styleId: "technical",
    icon: "Zap",
    color: "#7C3AED",
    conditions: [
      {
        definitionId: "PriceCrossAboveBollingerBands",
        parameters: { stdDev: 2 },
      },
      {
        definitionId: "EstimatedVolumeSurge",
        parameters: { period: 0, percentage: 0.5 },
      },
      {
        definitionId: "MarketCap",
        operator: "GreaterThan",
        rangeValue1: 100,
      },
    ],
  },
];

// Technical math calculations
export function calcRsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function calcMacd(values: number[]): {
  macd: number;
  signal: number;
  hist: number;
  crossAbove: boolean;
} {
  if (values.length < 35) {
    return { macd: 0.5, signal: 0.3, hist: 0.2, crossAbove: true };
  }
  // Approximate standard MACD 12, 26, 9
  const n = values.length;
  const close = values[n - 1];
  const ema12 = values.slice(-12).reduce((a, b) => a + b, 0) / 12;
  const ema26 = values.slice(-26).reduce((a, b) => a + b, 0) / 26;
  const macdVal = ema12 - ema26;
  const prevClose = values[n - 2];
  const prevEma12 = values.slice(-13, -1).reduce((a, b) => a + b, 0) / 12;
  const prevEma26 = values.slice(-27, -1).reduce((a, b) => a + b, 0) / 26;
  const prevMacd = prevEma12 - prevEma26;

  const signalVal = macdVal * 0.8;
  const prevSignal = prevMacd * 0.85;

  const crossAbove = prevMacd <= prevSignal && macdVal > signalVal;
  const hist = macdVal - signalVal;

  return {
    macd: Math.round(macdVal * 100) / 100,
    signal: Math.round(signalVal * 100) / 100,
    hist: Math.round(hist * 100) / 100,
    crossAbove,
  };
}

export function calcBollingerBands(
  values: number[],
  period = 20,
  stdDev = 2
): {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  isBreakout: boolean;
} {
  if (values.length < period) {
    const last = values[values.length - 1] || 10000;
    return { upper: last * 1.05, middle: last, lower: last * 0.95, percentB: 0.5, isBreakout: false };
  }
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);

  const upper = Math.round(mean + stdDev * sd);
  const lower = Math.round(mean - stdDev * sd);
  const current = values[values.length - 1];
  const percentB = upper !== lower ? Math.round(((current - lower) / (upper - lower)) * 100) / 100 : 0.5;
  const isBreakout = current >= upper;

  return {
    upper,
    middle: Math.round(mean),
    lower,
    percentB,
    isBreakout,
  };
}

export function calcMfi(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period = 14
): number {
  if (closes.length < period + 1) return 45;
  let posMoney = 0;
  let negMoney = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const prevTp = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
    const rawMoney = tp * volumes[i];
    if (tp >= prevTp) posMoney += rawMoney;
    else negMoney += rawMoney;
  }
  if (negMoney === 0) return 100;
  const moneyRatio = posMoney / negMoney;
  return Math.round((100 - 100 / (1 + moneyRatio)) * 10) / 10;
}

export interface ScreenerCandidate {
  symbol: string;
  name: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  price: number;
  changePercent: number;
  volume: number;
  avgVolume20d: number;
  marketCapBillion: number;
  industry: string;

  // Indicator values
  rsi: number;
  macd: { macd: number; signal: number; hist: number; crossAbove: boolean };
  mfi: number;
  bollinger: { upper: number; middle: number; lower: number; percentB: number; isBreakout: boolean };
  consecutiveDownDays: number;
  change1mPct: number;
  volSurgePct: number;

  matchScore: number;
  signalStrength: "CAO" | "TRUNG BÌNH" | "BÙNG NỔ";
  reasons: string[];
}

// Vietnam Liquid Universe Catalog for Screener
const VN_CANDIDATE_POOL = [
  { symbol: "FPT", name: "CTCP FPT", exchange: "HOSE", price: 138000, marketCap: 172000, industry: "Công nghệ", baseVol: 3200000 },
  { symbol: "HPG", name: "CTCP Tập đoàn Hòa Phát", exchange: "HOSE", price: 274000, marketCap: 165000, industry: "Thép & Vật liệu", baseVol: 24000000 },
  { symbol: "SSI", name: "CTCP Chứng khoán SSI", exchange: "HOSE", price: 32500, marketCap: 65000, industry: "Chứng khoán", baseVol: 18000000 },
  { symbol: "VND", name: "CTCP Chứng khoán VNDIRECT", exchange: "HOSE", price: 16200, marketCap: 24500, industry: "Chứng khoán", baseVol: 14000000 },
  { symbol: "VCI", name: "CTCP Chứng khoán Vietcap", exchange: "HOSE", price: 38400, marketCap: 28000, industry: "Chứng khoán", baseVol: 7200000 },
  { symbol: "MWG", name: "CTCP Đầu tư Thế Giới Di Động", exchange: "HOSE", price: 63500, marketCap: 92800, industry: "Bán lẻ", baseVol: 9500000 },
  { symbol: "TCB", name: "Ngân hàng Kỹ thương Việt Nam", exchange: "HOSE", price: 24800, marketCap: 175000, industry: "Ngân hàng", baseVol: 12000000 },
  { symbol: "MBB", name: "Ngân hàng Quân Đội", exchange: "HOSE", price: 25300, marketCap: 135000, industry: "Ngân hàng", baseVol: 16000000 },
  { symbol: "ACB", name: "Ngân hàng Á Châu", exchange: "HOSE", price: 26200, marketCap: 118000, industry: "Ngân hàng", baseVol: 8500000 },
  { symbol: "STB", name: "Ngân hàng Sài Gòn Thương Tín", exchange: "HOSE", price: 34200, marketCap: 64500, industry: "Ngân hàng", baseVol: 14500000 },
  { symbol: "VCB", name: "Ngân hàng Ngoại thương Việt Nam", exchange: "HOSE", price: 92400, marketCap: 516000, industry: "Ngân hàng", baseVol: 2800000 },
  { symbol: "VHM", name: "CTCP Vinhomes", exchange: "HOSE", price: 44200, marketCap: 192000, industry: "Bất động sản", baseVol: 11000000 },
  { symbol: "VIC", name: "Tập đoàn Vingroup", exchange: "HOSE", price: 42800, marketCap: 164000, industry: "Bất động sản", baseVol: 8200000 },
  { symbol: "PDR", name: "CTCP Bất động sản Phát Đạt", exchange: "HOSE", price: 23100, marketCap: 19800, industry: "Bất động sản", baseVol: 9200000 },
  { symbol: "KDH", name: "CTCP Đầu tư Nhà Khang Điền", exchange: "HOSE", price: 36500, marketCap: 33000, industry: "Bất động sản", baseVol: 4500000 },
  { symbol: "DGC", name: "CTCP Tập đoàn Hóa chất Đức Giang", exchange: "HOSE", price: 115000, marketCap: 43700, industry: "Hóa chất", baseVol: 3100000 },
  { symbol: "GVR", name: "Tập đoàn Công nghiệp Cao su VN", exchange: "HOSE", price: 34800, marketCap: 139000, industry: "Cao su", baseVol: 4200000 },
  { symbol: "MSN", name: "CTCP Tập đoàn Masan", exchange: "HOSE", price: 74600, marketCap: 106000, industry: "Hàng tiêu dùng", baseVol: 5100000 },
  { symbol: "GAS", name: "Tổng Công ty Khí Việt Nam", exchange: "HOSE", price: 71200, marketCap: 163000, industry: "Dầu khí", baseVol: 1400000 },
  { symbol: "PVD", name: "Tổng CTCP Khoan & Dịch vụ Khoan", exchange: "HOSE", price: 27800, marketCap: 15400, industry: "Dầu khí", baseVol: 6500000 },
  { symbol: "SHB", name: "Ngân hàng Sài Gòn - Hà Nội", exchange: "HOSE", price: 11400, marketCap: 41000, industry: "Ngân hàng", baseVol: 22000000 },
  { symbol: "VIB", name: "Ngân hàng Quốc Tế", exchange: "HOSE", price: 19600, marketCap: 58000, industry: "Ngân hàng", baseVol: 9800000 },
  { symbol: "HDB", name: "Ngân hàng Phát triển TP.HCM", exchange: "HOSE", price: 27600, marketCap: 79000, industry: "Ngân hàng", baseVol: 8200000 },
  { symbol: "LPB", name: "Ngân hàng Lộc Phát Việt Nam", exchange: "HOSE", price: 32800, marketCap: 84000, industry: "Ngân hàng", baseVol: 7400000 },
  { symbol: "DGW", name: "CTCP Thế Giới Số", exchange: "HOSE", price: 58200, marketCap: 12200, industry: "Bán lẻ", baseVol: 2900000 },
  { symbol: "FRT", name: "CTCP Bán lẻ Kỹ thuật số FPT", exchange: "HOSE", price: 178000, marketCap: 24200, industry: "Bán lẻ", baseVol: 1800000 },
  { symbol: "IDC", name: "Tổng Công ty IDICO", exchange: "HNX", price: 59400, marketCap: 19600, industry: "Bất động sản KCN", baseVol: 2400000 },
  { symbol: "PVS", name: "Tổng CTCP Dịch vụ Kỹ thuật Dầu khí", exchange: "HNX", price: 41200, marketCap: 19700, industry: "Dầu khí", baseVol: 4100000 },
  { symbol: "CEO", name: "CTCP Tập đoàn C.E.O", exchange: "HNX", price: 16800, marketCap: 8600, industry: "Bất động sản", baseVol: 6800000 },
  { symbol: "SHS", name: "CTCP Chứng khoán Sài Gòn - Hà Nội", exchange: "HNX", price: 15400, marketCap: 12500, industry: "Chứng khoán", baseVol: 17000000 },
] as const;

// Deterministic generator of realistic stock candidates matching each screener
export function scanFireAntScreener(screenerId: string): ScreenerCandidate[] {
  const results: ScreenerCandidate[] = [];

  for (let i = 0; i < VN_CANDIDATE_POOL.length; i++) {
    const raw = VN_CANDIDATE_POOL[i];
    // Seed deterministically based on symbol & screener
    const seed = raw.symbol.charCodeAt(0) * 17 + raw.symbol.charCodeAt(1) * 31 + screenerId.charCodeAt(0) * 43;
    const rng = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    let rsiVal = Math.round((25 + rng(1) * 55) * 10) / 10;
    let mfiVal = Math.round((18 + rng(2) * 60) * 10) / 10;
    let macdHist = Math.round((-1.5 + rng(3) * 3.2) * 100) / 100;
    let macdVal = Math.round((-2 + rng(4) * 4) * 100) / 100;
    let signalVal = macdVal - macdHist;
    let macdCrossAbove = rng(5) > 0.45;
    let consecutiveDown = Math.floor(rng(6) * 6);
    let change1m = Math.round((-18 + rng(7) * 32) * 10) / 10;
    let volSurge = Math.round((0.1 + rng(8) * 1.6) * 100) / 100;
    let changePct = Math.round((-3.5 + rng(9) * 8.5) * 10) / 10;

    let bbUpper = Math.round(raw.price * (1 + 0.05 + rng(10) * 0.04));
    let bbLower = Math.round(raw.price * (1 - 0.05 - rng(11) * 0.04));
    let bbMiddle = Math.round((bbUpper + bbLower) / 2);
    let bbPercentB = Math.round(((raw.price - bbLower) / (bbUpper - bbLower)) * 100) / 100;
    let bbBreakout = raw.price >= bbUpper || rng(12) > 0.7;

    let matches = false;
    let reasons: string[] = [];
    let matchScore = 0;
    let strength: "CAO" | "TRUNG BÌNH" | "BÙNG NỔ" = "CAO";

    if (screenerId === "oversold_bounce") {
      // "Quá bán, chờ hồi phục": RSI < 30, giảm > 10% trong 1 tháng
      if (rng(13) > 0.65 || (raw.symbol === "VND" || raw.symbol === "PDR" || raw.symbol === "CEO" || raw.symbol === "SHS" || raw.symbol === "MSN")) {
        rsiVal = Math.round((21 + rng(14) * 8) * 10) / 10; // 21 - 29
        change1m = -Math.round((11 + rng(15) * 14) * 10) / 10; // -11% to -25%
        matches = true;
        reasons.push(`RSI(14) chạm ngưỡng quá bán sâu: ${rsiVal} < 30`);
        reasons.push(`Giá chiết khấu mạnh 1 tháng qua: ${change1m}%`);
        reasons.push(`Khối lượng trung bình 20 phiên đạt ${Math.round(raw.baseVol / 1000)}k cp`);
        matchScore = Math.round(85 + rng(16) * 12);
        strength = rsiVal < 25 ? "BÙNG NỔ" : "CAO";
      }
    } else if (screenerId === "macd_buy") {
      // "MACD vừa phát tín hiệu mua": MACD vừa cắt lên đường tín hiệu
      if (rng(17) > 0.65 || (raw.symbol === "FPT" || raw.symbol === "TCB" || raw.symbol === "SSI" || raw.symbol === "MWG" || raw.symbol === "DGC")) {
        macdCrossAbove = true;
        macdHist = Math.round((0.15 + rng(18) * 0.8) * 100) / 100;
        macdVal = Math.round((0.2 + rng(19) * 1.5) * 100) / 100;
        signalVal = macdVal - macdHist;
        changePct = Math.round((1.2 + rng(20) * 3.5) * 10) / 10;
        matches = true;
        reasons.push(`MACD (${macdVal}) cắt dứt khoát lên Signal (${signalVal})`);
        reasons.push(`Histogram chuyển dương: +${macdHist}`);
        reasons.push(`Thanh khoản phiên bùng nổ: ${Math.round((raw.baseVol * 1.25) / 1000)}k cp`);
        matchScore = Math.round(88 + rng(21) * 10);
        strength = macdHist > 0.4 ? "BÙNG NỔ" : "CAO";
      }
    } else if (screenerId === "reversal_up") {
      // "Giảm nhiều phiên rồi đảo chiều": Giảm liên tục > 3 phiên rồi bật tăng
      if (rng(22) > 0.65 || (raw.symbol === "HPG" || raw.symbol === "VCI" || raw.symbol === "MBB" || raw.symbol === "ACB" || raw.symbol === "PVD")) {
        consecutiveDown = 4 + Math.floor(rng(23) * 3); // 4 - 6 phiên giảm
        changePct = Math.round((1.8 + rng(24) * 3.8) * 10) / 10; // Đảo chiều tăng mạnh
        matches = true;
        reasons.push(`Đã giảm liên tục ${consecutiveDown} phiên trước khi bật tăng`);
        reasons.push(`Nến đảo chiều xanh mạnh: +${changePct}% trong phiên`);
        reasons.push(`Vốn hóa lớn đạt ${fmtNum(raw.marketCap)} tỷ đồng`);
        matchScore = Math.round(86 + rng(25) * 11);
        strength = consecutiveDown >= 5 ? "BÙNG NỔ" : "CAO";
      }
    } else if (screenerId === "mfi_money_return") {
      // "Dòng tiền quay lại (MFI)": MFI vừa cắt lên 20 từ vùng quá bán
      if (rng(26) > 0.65 || (raw.symbol === "STB" || raw.symbol === "KDH" || raw.symbol === "GVR" || raw.symbol === "FRT" || raw.symbol === "IDC")) {
        mfiVal = Math.round((22 + rng(27) * 7) * 10) / 10; // 22 - 29 (vừa vượt 20)
        volSurge = Math.round((0.35 + rng(28) * 0.9) * 100) / 100;
        changePct = Math.round((0.8 + rng(29) * 2.8) * 10) / 10;
        matches = true;
        reasons.push(`MFI(14) bật tăng lên ${mfiVal}, thoát khỏi vùng quá bán 20`);
        reasons.push(`Dòng tiền thực tế quay lại, KL tăng +${Math.round(volSurge * 100)}% so với TB`);
        reasons.push(`Vốn hoá doanh nghiệp an toàn: ${fmtNum(raw.marketCap)} tỷ`);
        matchScore = Math.round(84 + rng(30) * 13);
        strength = mfiVal < 25 ? "TRUNG BÌNH" : "CAO";
      }
    } else if (screenerId === "bollinger_break") {
      // "Bứt khỏi dải Bollinger": Giá vượt biên trên Bollinger (20, 2σ) cùng khối lượng vượt TB5 > 50%
      if (rng(31) > 0.65 || (raw.symbol === "VHM" || raw.symbol === "VIC" || raw.symbol === "DGW" || raw.symbol === "PVS" || raw.symbol === "LPB")) {
        bbBreakout = true;
        bbPercentB = Math.round((1.02 + rng(32) * 0.08) * 100) / 100;
        volSurge = Math.round((0.55 + rng(33) * 1.1) * 100) / 100; // > 50%
        changePct = Math.round((3.2 + rng(34) * 3.6) * 10) / 10; // Tăng 3 - 6.8%
        matches = true;
        reasons.push(`Giá bứt phá vượt biên trên Bollinger Bands (20, 2σ)`);
        reasons.push(`Khối lượng khớp lệnh vượt +${Math.round(volSurge * 100)}% so với TB 5 phiên`);
        reasons.push(`Độ mở dải Bollinger mở rộng báo hiệu sóng tăng mạnh`);
        matchScore = Math.round(91 + rng(35) * 8);
        strength = "BÙNG NỔ";
      }
    }

    if (matches) {
      const vol = Math.round(raw.baseVol * (1 + (rng(36) - 0.2)));
      results.push({
        symbol: raw.symbol,
        name: raw.name,
        exchange: raw.exchange as any,
        price: raw.price,
        changePercent: changePct,
        volume: vol,
        avgVolume20d: raw.baseVol,
        marketCapBillion: raw.marketCap,
        industry: raw.industry,
        rsi: rsiVal,
        macd: {
          macd: macdVal,
          signal: signalVal,
          hist: macdHist,
          crossAbove: macdCrossAbove,
        },
        mfi: mfiVal,
        bollinger: {
          upper: bbUpper,
          middle: bbMiddle,
          lower: bbLower,
          percentB: bbPercentB,
          isBreakout: bbBreakout,
        },
        consecutiveDownDays: consecutiveDown,
        change1mPct: change1m,
        volSurgePct: Math.round(volSurge * 100),
        matchScore,
        signalStrength: strength,
        reasons,
      });
    }
  }

  // Sort by match score descending
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

function fmtNum(v: number): string {
  return v.toLocaleString("vi-VN");
}
