import "server-only";
import { type FastDatafeedContext } from "./fast-datafeed-hub";
import { isVnSymbol } from "../vn/master";
import type { ScreenerPreset } from "./screener-snapshot-service";

export type DetectedQueryIntent =
  | "MULTI_SCENARIO"       // Phân tích đa kịch bản Bull/Base/Bear, điểm vô hiệu hóa, RRR
  | "STOCK_COMPARE"        // So sánh đối đầu 2 hay nhiều mã cổ phiếu
  | "STOCK_TECHNICAL"      // Phân tích kỹ thuật chuyên sâu & dòng tiền (RSI, MACD, MA, Wyckoff, Overhead room)
  | "EARNINGS_REVIEW"      // Bóc tách kết quả kinh doanh quý / lũy kế cả năm / chất lượng BCTC
  | "SCREENER_FILTER"      // Lọc & sàng lọc cổ phiếu theo bộ tiêu chí định lượng (ROE, ROA, P/E, F-Score)
  | "STOCK_DEEP_DIVE"      // Soi cổ phiếu cơ bản toàn diện, định giá, con hào kinh tế & đa nhân tố
  | "COMMODITY_MACRO"      // Tác động giá hàng hóa (dầu, thép, quặng, vàng, phân bón)
  | "MARKET_OVERVIEW"      // Diễn biến VN-Index, chế độ thị trường, thanh khoản
  | "FORENSIC_OR_RISK"     // Soi BCTC, dòng tiền CFO, bẫy nợ, bẫy P/E đỉnh, rủi ro T+2.5
  | "PERSONAL_FINANCE"     // Quản lý tài chính cá nhân, thuế TNCN, trả nợ, quỹ khẩn cấp
  | "DERIVATIVES"          // Giao dịch phái sinh VN30F1M, độ lệch Basis, vị thế Long/Short, OI
  | "CRYPTO"               // Tiền mã hóa (Bitcoin, Ethereum, Altcoins), biến động 24h, funding rate
  | "FOREX_MACRO"          // Tỷ giá USD/VND, DXY, thị trường ngoại hối và chính sách tỷ giá SBV
  | "GENERAL_CONSULTATION"; // Tư vấn chung

export interface IntentDetectionResult {
  intent: DetectedQueryIntent;
  confidence: number;
  detectedEntities: {
    tickers: string[];
    commodities: string[];
    hasMacroKeyword: boolean;
    hasRiskKeyword: boolean;
  };
}

export interface ParsedScreeningCriteria {
  preset?: ScreenerPreset;
  peMax?: number;
  peMin?: number;
  pbMax?: number;
  roeMin?: number;
  roaMin?: number;
  divYieldMin?: number;
  debtEquityMax?: number;
  fScoreMin?: number;
  rsMin?: number;
  minRiskReward?: number;
  quantEdgeMin?: number;
  sweetZoneOnly?: boolean;
  smartMoneyOnly?: boolean;
  vsaOnly?: boolean;
  squeezeOnly?: boolean;
  sectors?: string[];
  minTradingValue?: number;
  sort?: "marketCap" | "roe" | "divYield" | "pe" | "compositeScore" | "quantEdgeScore" | "orcaMasterScore" | "rsRating";
  order?: "asc" | "desc";
  humanSummary: string[];
}

export function isScreenerQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /lọc|bộ lọc|sàng lọc|screener|tìm mã|tìm cổ phiếu|tìm cho tôi|tìm những|tìm các mã|cho tôi danh sách|những mã nào|cổ phiếu nào|top cổ phiếu|tiêu chí|thỏa mãn tiêu chí/i.test(q) ||
    /canslim|vcp|squeeze|smart money|cá mập|rs rating|mean reversion|low beta|asymmetric|piotroski|magic formula|chân sóng/i.test(q) ||
    (/(?:roe|p\/e|pe|p\/b|pb|cổ tức|dividend|d\/e|f-?score)\s*(?:>|>=|<|<=|trên|dưới|cao|thấp)/i.test(q) && !/thị trường|vn-?index/i.test(q))
  );
}

export function parseScreeningCriteria(query: string): ParsedScreeningCriteria {
  const q = query.toLowerCase();
  const humanSummary: string[] = [];
  const res: ParsedScreeningCriteria = {
    humanSummary,
  };

  // 1. ROE (Return on Equity)
  const roeValMatch = q.match(/(?:roe|tỷ suất sinh lời trên vốn|sinh lời)\s*(?:>|>=|trên|từ|tối thiểu|lớn hơn|cao hơn)?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  if (roeValMatch) {
    const val = parseFloat(roeValMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.roeMin = val;
      humanSummary.push(`ROE ≥ ${val}%`);
    }
  } else if (/(?:roe|khả năng sinh lời)\s*(?:cao|tốt|ổn định)/i.test(q)) {
    res.roeMin = 12;
    humanSummary.push("ROE ≥ 12% (Sinh lời bền vững)");
  }

  // 2. ROA
  const roaValMatch = q.match(/roa\s*(?:>|>=|trên|từ|tối thiểu|lớn hơn|cao hơn)?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
  if (roaValMatch) {
    const val = parseFloat(roaValMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.roaMin = val;
      humanSummary.push(`ROA ≥ ${val}%`);
    }
  }

  // 3. P/E (Price to Earnings)
  const peValMatch = q.match(/(?:p\/e|pe|hệ số pe|định giá pe)\s*(?:<|<=|dưới|tối đa|nhỏ hơn|thấp hơn)?\s*(\d+(?:[.,]\d+)?)/i);
  if (peValMatch) {
    const val = parseFloat(peValMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.peMax = val;
      humanSummary.push(`P/E ≤ ${val}x`);
    }
  } else if (/(?:p\/e|pe)\s*(?:thấp|rẻ|hợp lý)|định giá\s*(?:rẻ|thấp)/i.test(q)) {
    res.peMax = 14;
    humanSummary.push("P/E ≤ 14x (Định giá hấp dẫn)");
  }

  // 4. P/B (Price to Book)
  const pbValMatch = q.match(/(?:p\/b|pb)\s*(?:<|<=|dưới|tối đa|nhỏ hơn|thấp hơn)?\s*(\d+(?:[.,]\d+)?)/i);
  if (pbValMatch) {
    const val = parseFloat(pbValMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.pbMax = val;
      humanSummary.push(`P/B ≤ ${val}x`);
    }
  } else if (/(?:p\/b|pb)\s*(?:thấp|dưới 1|dưới book)/i.test(q)) {
    res.pbMax = 1.4;
    humanSummary.push("P/B ≤ 1.4x (Biên an toàn tài sản)");
  }

  // 5. Cổ tức / Dividend Yield
  const divMatch = q.match(/(?:cổ tức|dividend)\s*(?:tiền mặt)?\s*(?:>|>=|trên|tối thiểu|cao hơn)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  if (divMatch) {
    const val = parseFloat(divMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.divYieldMin = val;
      humanSummary.push(`Cổ tức tiền mặt ≥ ${val}%/năm`);
    }
  } else if (/(?:cổ tức|dividend)\s*(?:cao|tiền mặt|đều đặn|bền vững|thay lãi tiết kiệm)/i.test(q)) {
    res.divYieldMin = 4.5;
    humanSummary.push("Cổ tức tiền mặt ≥ 4.5%/năm (Vượt trội lãi suất tiết kiệm)");
  }

  // 6. Nợ vay / D/E (Debt to Equity)
  const deMatch = q.match(/(?:d\/e|nợ\/vốn|nợ trên vốn|đòn bẩy nợ)\s*(?:<|<=|dưới|nhỏ hơn|thấp hơn)?\s*(\d+(?:[.,]\d+)?)/i);
  if (deMatch) {
    const val = parseFloat(deMatch[1].replace(",", "."));
    if (!isNaN(val) && val > 0) {
      res.debtEquityMax = val;
      humanSummary.push(`Nợ/Vốn CSH (D/E) ≤ ${val}`);
    }
  } else if (/(?:nợ thấp|ít nợ|không nợ|sạch nợ|nợ an toàn|bảo thủ)/i.test(q)) {
    res.debtEquityMax = 1.2;
    humanSummary.push("Nợ/Vốn CSH (D/E) ≤ 1.2 (Cơ cấu vốn lành mạnh)");
  }

  // 7. Piotroski F-Score
  const fMatch = q.match(/(?:f-?score|piotroski)\s*(?:>|>=|trên|từ)?\s*(\d+)/i);
  if (fMatch) {
    const val = parseInt(fMatch[1], 10);
    if (!isNaN(val) && val >= 1 && val <= 9) {
      res.fScoreMin = val;
      humanSummary.push(`Piotroski F-Score ≥ ${val}/9`);
    }
  } else if (/(?:sức khỏe tài chính|chất lượng bctc|f-?score)\s*(?:tốt|lành mạnh|vững mạnh)/i.test(q)) {
    res.fScoreMin = 6;
    humanSummary.push("Piotroski F-Score ≥ 6/9 (Chất lượng BCTC vững vàng)");
  }

  // 8. Chân Sóng Apex / Vùng Vàng (Sweet Launch Zone)
  if (/(?:chân sóng|vùng vàng|apex|sweet zone|sweet launch|đảo chiều wyckoff|spring)/i.test(q)) {
    res.sweetZoneOnly = true;
    res.preset = "apex_buy_now";
    humanSummary.push("👑 Vùng Vàng Chân Sóng Apex (cách đáy 0.8% - 7.5%, R:R ≥ 2.2x)");
  }

  // 8.1. Quant Trading Presets & Alpha Strategies
  if (/canslim|siêu cổ phiếu tăng trưởng/i.test(q)) {
    res.preset = "canslim";
    humanSummary.push("Phương pháp CANSLIM William O'Neil (EPS & Doanh thu tăng trưởng mạnh)");
  } else if (/vcp|thu hẹp độ biến động|thu hẹp biến động/i.test(q)) {
    res.preset = "vcp";
    humanSummary.push("Mô hình VCP Mark Minervini (Thu hẹp biến động & Cạn cung)");
  } else if (/squeeze|thắt nút|nén bollinger/i.test(q)) {
    res.preset = "ttm_squeeze";
    res.squeezeOnly = true;
    humanSummary.push("TTM Squeeze (Bollinger Bands thắt chặt trong Keltner Channel)");
  } else if (/smart money|cá mập|dòng tiền lớn|dòng tiền thông minh|tay to gom|tổ chức tích lũy/i.test(q)) {
    res.preset = "smart_money_inflow";
    res.smartMoneyOnly = true;
    humanSummary.push("Dấu chân Dòng Tiền Lớn (Smart Money Footprint & Lực gom chủ động)");
  } else if (/asymmetric|bất đối xứng|r:r|risk\s*\/?\s*reward/i.test(q)) {
    res.preset = "quant_asymmetric";
    res.minRiskReward = 2.2;
    humanSummary.push("Quant Asymmetric Payoff (Tỷ lệ Lợi nhuận/Rủi ro R:R ≥ 2.2x)");
  } else if (/mean reversion|hồi quy trung bình|bật đáy định lượng/i.test(q)) {
    res.preset = "quant_mean_revert";
    humanSummary.push("Quant Mean Reversion (Mô hình Ornstein-Uhlenbeck Z ≤ -1.3)");
  } else if (/low beta|beta thấp|phòng thủ/i.test(q)) {
    res.preset = "quant_low_beta";
    humanSummary.push("Low-Beta Anomaly (Beta ≤ 0.85, ROE cao - Phòng thủ an toàn)");
  } else if (/vsa|no supply|cạn cung|test cung/i.test(q)) {
    res.preset = "vsa_no_supply";
    res.vsaOnly = true;
    humanSummary.push("VSA No Supply Bar (Cạn kiệt khối lượng kiểm định cung)");
  } else if (/magic formula|công thức kỳ diệu|greenblatt/i.test(q)) {
    res.preset = "magic_formula";
    humanSummary.push("Magic Formula Joel Greenblatt (ROIC vượt trội + P/E rẻ)");
  } else if (/piotroski|f-score\s*[789]|fscore\s*[789]/i.test(q)) {
    res.preset = "piotroski_diamonds";
    res.fScoreMin = 6;
    humanSummary.push("Piotroski Diamonds (F-Score ≥ 6/9 - BCTC sạch)");
  } else if (/breakout|vượt đỉnh|bứt phá cản/i.test(q)) {
    res.preset = "breakout";
    humanSummary.push("Breakout Vượt Đỉnh (Thanh khoản bùng nổ vượt kháng cự)");
  }

  // 8.2 Sức mạnh giá Relative Strength (RS Rating)
  const rsMatch = q.match(/rs(?:\s+rating)?\s*(?:>|>=|trên|tối thiểu|đạt)?\s*(\d+)/i);
  if (rsMatch) {
    const val = parseInt(rsMatch[1], 10);
    if (!isNaN(val) && val >= 1 && val <= 99) {
      res.rsMin = val;
      if (!res.preset) res.preset = "rs_leaders";
      humanSummary.push(`Sức mạnh giá RS Rating ≥ ${val}/99`);
    }
  } else if (/rs cao|sức mạnh giá tốt|dẫn dắt thị trường|siêu cổ phiếu o'neil/i.test(q)) {
    res.rsMin = 72;
    if (!res.preset) res.preset = "rs_leaders";
    humanSummary.push("Sức mạnh giá RS Rating ≥ 72/99 (Nhóm cổ phiếu dẫn dắt thị trường)");
  }

  // 9. Ngành / Sector
  const detectedSectors: string[] = [];
  const sectorMap: Record<string, string[]> = {
    "Ngân hàng": ["ngân hàng", "bank", "ngan hang"],
    "Chứng khoán": ["chứng khoán", "chung khoan", "ctck", "môi giới"],
    "Thép": ["thép", "thep", "hrc"],
    "Bất động sản": ["bất động sản", "bds", "bđs", "địa ốc"],
    "Khu công nghiệp": ["khu công nghiệp", "kcn"],
    "Bán lẻ": ["bán lẻ", "ban le", "retail"],
    "Công nghệ": ["công nghệ", "cong nghe", "it", "phần mềm"],
    "Dầu khí": ["dầu khí", "dau khi"],
    "Hóa chất & Phân bón": ["hóa chất", "hoa chat", "phân bón", "phan bon", "ure", "urê", "dap"],
    "Điện lực": ["điện", "dien", "năng lượng", "nang luong"],
    "Thực phẩm & Đồ uống": ["thực phẩm", "thuc pham", "tiêu dùng"],
    "Dược phẩm & Y tế": ["dược", "duoc", "y tế", "thuốc"],
    "Hàng không & Vận tải": ["cảng biển", "vận tải", "logistics", "kho bãi", "hàng hải", "tàu biển"],
    "Nông nghiệp & Thủy sản": ["thủy sản", "thuy san", "nông nghiệp", "tôm", "cá tra"],
    "Dệt may & Da giày": ["dệt may", "det may"],
  };

  for (const [secName, kws] of Object.entries(sectorMap)) {
    if (kws.some((kw) => q.includes(kw))) {
      detectedSectors.push(secName);
    }
  }

  if (detectedSectors.length > 0) {
    res.sectors = detectedSectors;
    humanSummary.push(`Ngành mục tiêu: ${detectedSectors.join(", ")}`);
  }

  // 10. Ưu tiên sắp xếp (Sorting priority)
  if (/(?:cổ tức|dividend)/i.test(q)) {
    res.sort = "divYield";
    res.order = "desc";
  } else if (/(?:roe|sinh lời)/i.test(q)) {
    res.sort = "roe";
    res.order = "desc";
  } else if (/(?:p\/e|pe|rẻ|định giá thấp)/i.test(q)) {
    res.sort = "pe";
    res.order = "asc";
  } else if (/(?:rs|sức mạnh giá)/i.test(q) || res.preset === "rs_leaders") {
    res.sort = "rsRating";
    res.order = "desc";
  } else if (/(?:apex|chân sóng|vùng vàng|quant|định lượng|asymmetric)/i.test(q)) {
    res.sort = "quantEdgeScore";
    res.order = "desc";
  } else {
    res.sort = "compositeScore";
    res.order = "desc";
  }

  if (/thanh khoản cao|thanh khoản khủng|thanh khoản dồi dào|bluechip|vốn hóa lớn/i.test(q)) {
    res.minTradingValue = 10;
    humanSummary.push("Thanh khoản cao: Khớp lệnh ≥ 10 tỷ VNĐ/phiên");
  } else if (/thanh khoản vừa|thanh khoản nhỏ|penny|midcap/i.test(q)) {
    res.minTradingValue = 1;
    humanSummary.push("Thanh khoản: Khớp lệnh ≥ 1 tỷ VNĐ/phiên");
  } else {
    res.minTradingValue = 2;
    humanSummary.push("Thanh khoản an toàn: Khớp lệnh ≥ 2 tỷ VNĐ/phiên (Bảo đảm thoát vị thế T+2.5)");
  }

  return res;
}

export function detectQueryIntent(query: string, feed?: FastDatafeedContext): IntentDetectionResult {
  const q = query.toLowerCase();

  const skipWords = new Set([
    "VND", "USD", "EUR", "ALL", "THE", "FOR", "AND", "NOT", "BUY", "BAN",
    "MUA", "GIA", "DON", "TIEN", "TIET", "LUONG", "CHI", "APP", "API", "NOW",
    "TOP", "DAT", "VAY", "NOI", "CAN", "XEM", "CHO", "TOI", "COI", "HOI",
    "LAM", "SAO", "NEN", "QUA", "CAC", "MOT", "HAI", "BAA", "BON", "NAM",
    "DAY", "HAY", "LAI", "THI", "KHI", "VOI", "DOC", "NHA", "TRA", "NET", "CON",
    "RSI", "MAC", "MA1", "MA2", "CAP", "SAN", "TAP", "HOP", "BCT", "BCTC", "THU",
    "PE", "PER", "PB", "PBR", "DE", "EPS", "ROE", "ROA", "WACC", "DCF", "NAV",
    "CFO", "FCF", "MACD", "VSA", "VCP", "CANSLIM", "MOS"
  ]);

  const tickerSet = new Set<string>(feed?.matchedStocks?.map((s) => s.symbol.toUpperCase()) ?? []);
  const words = query.toUpperCase().match(/\b[A-Z0-9]{3,4}\b/g) ?? [];
  for (const w of words) {
    if (!skipWords.has(w) && isVnSymbol(w)) {
      tickerSet.add(w);
    }
  }

  const tickers = Array.from(tickerSet);
  const commodities = feed?.matchedCommodities?.map((c) => c.name) ?? [];

  const hasScenarioKw = /kịch bản|bull|base|bear|đa khung|xác suất|điểm vô hiệu|invalidation|kỳ vọng lợi nhuận|e\[r\]|rrr/i.test(q);
  const hasRiskKw = /bẫy|cảnh báo|rủi ro|cắt lỗ|sàn|kẹt hàng|t\+2\.5|lừa|thao túng|lỗ|cfo âm|accrual|nợ xấu/i.test(q);
  const hasMacroKw = /thị trường|vn-?index|vn30|lãi suất|tỷ giá|fed|sbv|ngân hàng nhà nước|lạm phát/i.test(q);
  const hasPfKw = /thuế|tncn|lương|gross|net|vay|trả góp|thẻ tín dụng|tiết kiệm|chi tiêu|quỹ khẩn cấp|mua nhà|mua xe|người phụ thuộc/i.test(q);
  const hasCompareKw = /so sánh|\bhơn\b|\bkém\b|\bhay\b|\bvs\b|đối đầu|chọn mã nào|nên mua mã nào/i.test(q);
  const hasScreenerKw = isScreenerQuery(query) || feed?.screenerResult != null;
  const hasCommodityKw = commodities.length > 0 || /dầu|dầu thô|brent|wti|thép|hrc|quặng|vàng|xăng|phân bón|ure|urê|cao su|gạo|cà phê/i.test(q);
  const hasEarningsKw = /bctc|báo cáo tài chính|kết quả kinh doanh|kqkd|lợi nhuận|doanh thu|quý [1-4]|quý này|quý trước|lũy kế|cả năm|niên độ/i.test(q);
  const hasTechnicalKw = /kỹ thuật|chart|đồ thị|rsi|macd|bollinger|ma20|ma50|ma200|kháng cự|hỗ trợ|điểm mua|điểm bán|cản|vượt cản|test đáy|volume|thanh khoản|momentum|động lượng|thắt nút/i.test(q);
  const hasDerivKw = /phái sinh|vn30f|f1m|f2m|basis|long\s*short|hợp đồng tương lai|hđtl|\boi\b|open interest/i.test(q);
  const hasCryptoKw = /crypto|tiền mã hóa|tiền ảo|tiền điện tử|bitcoin|btc|ethereum|eth|solana|sol|binance|altcoin|tether|usdt|bnb|xrp|doge/i.test(q);
  const hasForexKw = /forex|ngoại tệ|ngoại hối|tỷ giá|usd\/vnd|usdvnd|dxy|đô la|eur\/usd|eurusd|usd\/jpy|usdjpy/i.test(q);

  if (hasDerivKw) {
    return {
      intent: "DERIVATIVES",
      confidence: 0.95,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasCryptoKw) {
    return {
      intent: "CRYPTO",
      confidence: 0.95,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasForexKw && !hasCompareKw) {
    return {
      intent: "FOREX_MACRO",
      confidence: 0.93,
      detectedEntities: { tickers, commodities, hasMacroKeyword: true, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasScenarioKw) {
    return {
      intent: "MULTI_SCENARIO",
      confidence: 0.95,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasRiskKw) {
    return {
      intent: "FORENSIC_OR_RISK",
      confidence: 0.9,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: true },
    };
  }

  if (hasPfKw && tickers.length <= 1) {
    return {
      intent: "PERSONAL_FINANCE",
      confidence: 0.95,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasScreenerKw) {
    return {
      intent: "SCREENER_FILTER",
      confidence: 0.96,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasCommodityKw && !hasCompareKw) {
    return {
      intent: "COMMODITY_MACRO",
      confidence: 0.92,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if ((tickers.length >= 2 && hasCompareKw) || tickers.length >= 2) {
    return {
      intent: "STOCK_COMPARE",
      confidence: 0.94,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (tickers.length === 1) {
    if (hasEarningsKw) {
      return {
        intent: "EARNINGS_REVIEW",
        confidence: 0.93,
        detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
      };
    }
    if (hasTechnicalKw) {
      return {
        intent: "STOCK_TECHNICAL",
        confidence: 0.93,
        detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
      };
    }
    return {
      intent: "STOCK_DEEP_DIVE",
      confidence: 0.92,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasPfKw) {
    return {
      intent: "PERSONAL_FINANCE",
      confidence: 0.9,
      detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
    };
  }

  if (hasMacroKw) {
    return {
      intent: "MARKET_OVERVIEW",
      confidence: 0.85,
      detectedEntities: { tickers, commodities, hasMacroKeyword: true, hasRiskKeyword: hasRiskKw },
    };
  }

  return {
    intent: "GENERAL_CONSULTATION",
    confidence: 0.7,
    detectedEntities: { tickers, commodities, hasMacroKeyword: hasMacroKw, hasRiskKeyword: hasRiskKw },
  };
}

export function buildStructuredSystemPrompt(
  intentResult: IntentDetectionResult,
  datafeedText: string
): string {
  const { intent, detectedEntities } = intentResult;

  let templateGuidance = "";

  switch (intent) {
    case "MULTI_SCENARIO":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU ĐA KỊCH BẢN & ĐA KHUNG THỜI GIAN) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **KẾT LUẬN ĐIỀU HÀNH (EXECUTIVE VERDICT)**: 
   - 1 câu chốt hành động rõ ràng: [TÍCH LŨY MẠNH | MUA THĂM DÒ | QUAN SÁT | HẠ TỶ TRỌNG | PHÒNG THỦ].
   - Tỷ số Lợi nhuận/Rủi ro tổng hợp RRR, Lợi suất kỳ vọng $E[R] = \\sum (p_i \\times R_i)$.
2. 📊 **BẢNG MA TRẬN 3 KỊCH BẢN (BULL / BASE / BEAR)**:
   - Bắt buộc tuân thủ tiên đề xác suất: $p_{bull} + p_{base} + p_{bear} = 1.0$ (100%).
   - Cột: Kịch bản | Xác suất (%) | Giá mục tiêu (VND) | Lợi suất (%) | Điểm vô hiệu hóa (Invalidation Point) | Xúc tác chính.
3. ⏱️ **MA TRẬN ĐA KHUNG THỜI GIAN**:
   - Ngắn hạn (T+2.5 / 1-10 phiên): Xu hướng kỹ thuật, hỗ trợ/kháng cự, cung cầu micro.
   - Trung hạn (1-2 Quý / BCTC): Doanh thu, EPS forward, P/E chu kỳ, biên lợi nhuận.
   - Dài hạn (1-3 Năm / Chu kỳ ngành): Con hào kinh tế (Economic Moat), định giá DCF.
4. 🚀 **KẾ HOẠCH PHÒNG VỆ BEAR CASE & KẸT SÀN T+2.5**: Ngưỡng cắt lỗ cứng, độ trượt giá dự kiến, kịch bản thoát hàng ATO/ATC khi thị trường biến động cực đoan.`;
      break;

    case "STOCK_TECHNICAL":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÂN TÍCH KỸ THUẬT & DÒNG TIỀN NÂNG CAO) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **TÍN HIỆU KỸ THUẬT & KẾT LUẬN CHỐT (TREND & BIAS)**:
   - 1 câu chốt vị thế: [ĐÃ CÓ ĐIỂM MUA VÙNG VÀNG / CHỜ TEST CUNG / QUAN SÁT / CẢNH BÁO PHÂN PHỐI].
   - Đánh giá dòng tiền lớn: Hấp thụ cung Wyckoff hay Cạn kiệt volume.
2. 📊 **BẢNG THÔNG SỐ KỸ THUẬT & MOMENTUM**:
   - Vị thế giá so với MA20, MA50, MA200.
   - RSI(14) và MACD động lượng.
   - Đo lường Overhead Room: Khoảng trống an toàn tới cản trên đầu phải $\\ge 5.0\\%$ để không dính cản T+2.5.
   - Đảm bảo tỷ số $R:R \\ge 2.2\\text{x}$.
3. 🚀 **THIẾT LẬP LỆNH GIAO DỊCH (ĐO LƯỜNG DƯ ĐỊA CẢN TRÊN ĐẦU & NÉ BẪY KẸP HÀNG T+2.5)**:
   - Vùng mua an toàn (Vùng Vàng Sweet Launch Zone $0.8\\% - 7.5\\%$ từ đáy).
   - Điểm cắt lỗ cứng (Hard Stop-Loss theo ATR $1.0\\text{x}$).
   - Giá mục tiêu chốt lời (Target 1 & 2).`;
      break;

    case "EARNINGS_REVIEW":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU BÓC TÁCH KẾT QUẢ KINH DOANH & BCTC QUÝ / NIÊN ĐỘ) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **KẾT QUẢ KINH DOANH CHỐT (EARNINGS VERDICT)**:
   - 1 câu chốt: [XUẤT SẮC VƯỢT TRỘI / ĐẠT KỲ VỌNG / DƯỚI KỲ VỌNG / CẢNH BÁO LỢI NHUẬN GIẤY].
   - Tốc độ tăng trưởng Doanh thu & LNST YoY/QoQ.
2. 📊 **BẢNG ĐIỀU TRA CHẤT LƯỢNG LỢI NHUẬN (CORE EBIT VS THU NHẬP BẤT THƯỜNG)**:
   - Tỷ trọng lợi nhuận từ CORE EBIT cốt lõi vs Thu nhập tài chính bất thường 1 lần.
   - Dòng tiền thuần HĐKD (FORENSIC CFO & ACCRUALS): Cảnh báo rủi ro nếu CFO âm sâu dù báo lãi kế toán.
   - Đòn bẩy nợ (D/E) và khả năng thanh toán lãi vay (ICR).
3. 🚀 **TÁC ĐỘNG LÊN ĐỊNH GIÁ & HÀNH ĐỘNG**:
   - Trailing P/E sau BCTC và dư địa tái định giá (Re-rating catalyst).
   - Khuyến nghị hành động cụ thể cho nhà đầu tư.`;
      break;

    case "SCREENER_FILTER":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU LỌC & SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **KẾT QUẢ SÀNG LỌC TỨC THÌ**:
   - 1 dòng chốt số lượng mã đạt chuẩn và nhóm ngành nổi bật nhất.
2. 📊 **BẢNG XẾP HẠNG TOP CỔ PHIẾU ĐẠT TIÊU CHÍ (MA TRẬN DATAFEED & ORCA QUANT SCORE)**:
   - Lập bảng Markdown: Hạng | Mã CP | Ngành | Thị giá (VNĐ) | P/E (x) | ROE (%) | Cổ tức (%) | F-Score | Vị thế Vùng Vàng Apex | Khuyến nghị.
   - Điểm sáng động lực của Top 1, Top 2, Top 3.
3. 🚀 **HÀNH ĐỘNG & BẪY SỐ LIỆU ĐỊNH LƯỢNG**:
   - Cảnh báo Bẫy P/E thấp ở đỉnh chu kỳ (Thép, Hóa chất, Cảng biển).
   - Vùng giải ngân an toàn (Vùng Vàng Sweet Launch Zone cách đáy $0.8\\% - 7.5\\%$).
   - Ngưỡng cắt lỗ bảo vệ vốn (Stop-Loss $1.0\\text{x}$ ATR, $R:R \\ge 2.2\\text{x}$).`;
      break;

    case "STOCK_COMPARE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU SO SÁNH ĐỐI ĐẦU CỔ PHIẾU - HEAD TO HEAD) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **KẾT LUẬN CHỌN MÃ TỐI ƯU**:
   - 1 câu chốt mã nào vượt trội hơn cho mục tiêu tăng trưởng hay phòng thủ kèm tỷ lệ vốn đề xuất (Ví dụ: 60/40).
2. 📊 **BẢNG MA TRẬN ĐỐI ĐẦU ĐỊNH LƯỢNG (HEAD-TO-HEAD MATRIX)**:
   - Cột so sánh trực diện: Tiêu chí | ${detectedEntities.tickers.join(" | ") || "Mã A | Mã B"} | Mã vượt trội.
   - So sánh: Thị giá, P/E, P/B, ROE, D/E, Dòng tiền CFO, Dòng tiền Cá mập, Điểm số Orca Composite Master.
3. 🚀 **VỊ THẾ CẠNH TRANH & CON HÀO KINH TẾ (ECONOMIC MOAT)**:
   - Phân tích ngắn gọn lợi thế quy mô, thị phần và định giá chiết khấu (PEG).
   - Kế hoạch giải ngân cụ thể cho từng mã.`;
      break;

    case "STOCK_DEEP_DIVE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÂN TÍCH CỔ PHIẾU CHUYÊN SÂU & ĐA NHÂN TỐ) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **KẾT LUẬN ĐẦU TƯ TỨC THÌ (VERDICT CARD)**:
   - 1 câu chốt vị thế: [TÍCH LŨY MẠNH / MUA THĂM DÒ / QUAN SÁT / HẠ TỶ TRỌNG] kèm tỷ trọng NAV đề xuất.
2. 📊 **BẢNG THÔNG SỐ ĐA NHÂN TỐ (ORCA MULTI-FACTOR QUANTITATIVE MATRIX)**:
   - Bảng 3 trục:
     * Kỹ thuật: Thị giá, RS Rating, Vị thế Vùng Vàng Apex ($0.8\\% - 7.5\\%$), Dư địa cản trên Overhead Room ($\\ge 5\\%$).
     * SỨC KHỎE TÀI CHÍNH & CHẤT LƯỢNG LỢI NHUẬN (BCTC): ROE, Tăng trưởng LNST Core EBIT, CFO/LNST, Nợ D/E, F-Score.
     * ĐỊNH GIÁ & BIÊN ĐỘ AN TOÀN (MARGIN OF SAFETY): P/E hiện tại vs Median 5 năm, Vùng Fair Value (MOS $\\ge 15-20\\%$).
3. 🚀 **KẾ HOẠCH HÀNH ĐỘNG TRIPLE-BARRIER (T+20)**:
   - Vùng giá tích lũy giải ngân.
   - Ngưỡng cắt lỗ cứng bảo vệ vốn (Stop-loss $1.0\\text{x}$ ATR).
   - Giá mục tiêu chốt lời đảm bảo tỷ số $R:R \\ge 2.2\\text{x}$.`;
      break;

    case "COMMODITY_MACRO":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TÁC ĐỘNG HÀNG HÓA & NGUYÊN VẬT LIỆU) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **CỔ PHIẾU HƯỞNG LỢI TRỰC TIẾP NHẤT**:
   - 1 câu chốt tên mã hưởng lợi số 1 và xu hướng giá hàng hóa thế giới.
2. 📊 **CƠ CHẾ TRUYỀN DẪN VÀO NỀN KINH TẾ VIỆT NAM (BẢNG PHÂN HÓA)**:
   - Diễn biến giá hàng hóa (giá, biến động %).
   - Nhóm hưởng lợi: Danh sách mã, tỷ lệ hưởng lợi biên lãi gộp và độ trễ tồn kho (1-2 quý).
   - Nhóm chịu áp lực chi phí: Danh sách mã bị ảnh hưởng chi phí đầu vào.
3. 🚀 **CHIẾN LƯỢC GIAO DỊCH CHU KỲ**:
   - Vùng giá gom cổ phiếu hưởng lợi và điểm chặn cắt lỗ theo giá hàng hóa.`;
      break;

    case "FORENSIC_OR_RISK":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU KIỂM TOÁN THẨM ĐỊNH & PHÒNG VỆ RỦI RO - MẪU PHÁP Y BCTC) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **CHẨN ĐOÁN RỦI RO KHẨN CẤP (FORENSIC AUDIT)**:
   - 1 câu chốt mức độ rủi ro: [RỦI RO CAO - BÁO ĐỘNG ĐỎ | RỦI RO TRUNG BÌNH | AN TOÀN].
   - Hành động khẩn cấp: [HẠ NGAY 50% VỊ THẾ / KHÔNG TRUNG BÌNH GIÁ / QUAN SÁT].
2. 📊 **BÓC TÁCH BẰNG CHỨNG SỐ LIỆU ĐỊNH LƯỢNG (NHẬN DIỆN BẢN CHẤT CỜ ĐỎ)**:
   - Cờ đỏ BCTC: Dòng tiền thuần HĐKD (CFO) âm dù báo lãi, Khoản phải thu/Tổng tài sản bất thường, áp lực nợ trái phiếu.
   - Bẫy định giá & thanh khoản: Rủi ro kẹt sàn T+2.5 mất thanh khoản, bẫy P/E ảo.
3. 🚀 **KỊCH BẢN THOÁT HIỂM & BẢO VỆ VỐN**:
   - Kế hoạch thoát hàng ATO/ATC, tuyệt đối không trung bình giá xuống cổ phiếu gian lận.`;
      break;

    case "MARKET_OVERVIEW":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TỔNG QUAN THỊ TRƯỜNG & CHẾ ĐỘ REGIME) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **CHẨN ĐOÁN THỊ TRƯỜNG TỨC THÌ**:
   - 1 câu chốt: Điểm số VN-Index, CHẾ ĐỘ THỊ TRƯỜNG (MARKET REGIME): [BULL_EXPANSION | SIDEWAY_CONSOLIDATION | BEAR_CAPITULATION | HIGH_VOLATILITY].
   - Tỷ trọng tiền mặt / cổ phiếu khuyến nghị (Ví dụ: 60% Cổ / 40% Tiền).
2. 📊 **BẢNG XUNG LỰC THỊ TRƯỜNG**:
   - Điểm số, thanh khoản so với bình quân 20 phiên, độ rộng tăng/giảm.
   - Dòng tiền Khối ngoại & Tự doanh.
   - Vùng hỗ trợ cứng và vùng cản cản trở đà tăng.
3. 🚀 **CHIẾN LƯỢC QUẢN TRỊ DANH MỤC & PHÒNG VỆ T+2.5**:
   - Nhóm ngành dẫn dắt dòng tiền vs nhóm bị rút tiền.
   - Hành động đề xuất cho danh mục.`;
      break;

    case "PERSONAL_FINANCE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TÀI CHÍNH CÁ NHÂN & DÒNG TIỀN) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **ĐÁP SỐ CHỐT TỨC THÌ (VERDICT CARD)**:
   - 1 câu chốt số tiền cần tích lũy hoặc số thuế thực đóng / số tiền nợ cần dập ngay tháng này.
2. 📊 **CHẨN ĐOÁN DÒNG TIỀN & BẢNG TÍNH ĐỊNH LƯỢNG**:
   - Bảng phân bổ 3 hũ 50/30/20 (Thiết yếu - Linh hoạt - Tích lũy).
   - Bảng tính Thuế TNCN (THUẾ TNCN lũy tiến từ 5% đến 35%), bảo hiểm 10.5% hoặc bóc tách chi phí lãi vay thẻ tín dụng vs ngân hàng.
   - Đệm dự phòng khẩn cấp (3-6 tháng chi phí).
3. 🚀 **LỘ TRÌNH HÀNH ĐỘNG CỤ THỂ**:
   - 2 - 3 bước thực hiện ngay khi nhận lương hoặc cách giảm trừ gia cảnh hợp pháp.`;
      break;

    case "DERIVATIVES":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÁI SINH VN30F & BASIS SPREAD) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **CHIẾN LƯỢC PHÁI SINH TỨC THÌ (VERDICT CARD)**:
   - 1 câu chốt vị thế: [ƯU TIÊN LONG | ƯU TIÊN SHORT | ĐỨNG NGOÀI QUAN SÁT] kèm mốc Basis và điểm chặn lỗ.
2. 📊 **BẢNG THÔNG SỐ PHÁI SINH TRỌNG YẾU (HNX / TCBS FEED)**:
   - Hợp đồng gần nhất (VN30F1M): Điểm số, độ lệch Basis so với VN30 cơ sở.
   - Trạng thái Curve (Contango vs Backwardation) và khối lượng mở (OI).
   - Dòng tiền Khối ngoại & Tự doanh (Net Long/Short).
3. 🚀 **KỊCH BẢN ĐI LỆNH TRONG PHIÊN (INTRADAY TRADE SETUP)**:
   - Vùng kích hoạt lệnh Long/Short.
   - Ngưỡng cắt lỗ kỷ luật tuyệt đối (Stop-Loss 2.5 - 3.5 điểm).`;
      break;

    case "CRYPTO":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TIỀN MÃ HÓA & CRYPTO ASSETS) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **XU HƯỚNG THỊ TRƯỜNG CRYPTO (VERDICT CARD)**:
   - 1 câu chốt: Trạng thái thị trường [TĂNG TRƯỞNG MẠNH / ĐIỀU CHỈNH / TÍCH LŨY BIÊN ĐỘ] và nhận định Bitcoin (BTC).
2. 📊 **BẢNG GIÁ CRYPTO TRỰC TIẾP (BINANCE SPOT FEED)**:
   - Giá USD hiện tại, Biến động 24h (%), Khối lượng giao dịch 24h của BTC, ETH và các Altcoin được hỏi.
   - Vùng cản trên và Hỗ trợ cứng gần nhất.
3. 🚀 **KẾ HOẠCH GIAO DỊCH & QUẢN TRỊ RỦI RO**:
   - Vùng gom hàng Spot hoặc chiến lược Futures (Đòn bẩy an toàn $\\le 2-3\\text{x}$).
   - Điểm cắt lỗ cứng bảo vệ vốn.`;
      break;

    case "FOREX_MACRO":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TỶ GIÁ NGOẠI HỐI & VĨ MÔ TIỀN TỆ) ===
Tuân thủ nguyên tắc BLUF (3 giây thấy ngay kết quả):
1. 🎯 **CHẨN ĐOÁN TỶ GIÁ TỨC THÌ (VERDICT CARD)**:
   - 1 câu chốt: Xu hướng áp lực tỷ giá [CĂNG THẲNG / ỔN ĐỊNH / HẠ NHIỆT] và tỷ giá USD/VND hiện tại.
2. 📊 **BẢNG TỶ GIÁ NGOẠI TỆ & DXY**:
   - Tỷ giá USD/VND (Ngân hàng VCB & Thị trường tự do).
   - Chỉ số DXY (US Dollar Index) và diễn biến các cặp tiền tệ chính (EUR/USD, USD/JPY).
3. 🚀 **TÁC ĐỘNG TỚI THỊ TRƯỜNG CHỨNG KHOÁN & DOANH NGHIỆP**:
   - Nhóm doanh nghiệp hưởng lợi (Xuất khẩu: Thủy sản, Dệt may, Cảng biển).
   - Nhóm doanh nghiệp chịu áp lực nợ vay USD hoặc nhập khẩu nguyên liệu.
   - Định hướng chính sách tiền tệ của Ngân hàng Nhà nước (SBV).`;
      break;

    default:
      templateGuidance = `
=== CẤU TRÚC PHẢN HỒI CHUẨN 5 LỚP (BỘ KHUNG 100 KỊCH BẢN TÀI CHÍNH - ORCA AI) ===
1. 🎯 **LỚP 1 - TRẢ LỜI TRỰC DIỆN (BLUF)**:
   - Trả lời thẳng vào câu hỏi trong 1–2 câu đầu. Tuyệt đối không chào hỏi dài dòng.
2. 📊 **LỚP 2 - GIẢI THÍCH & SỐ LIỆU MINH BẠCH**:
   - Số liệu phải có đơn vị chuẩn (tỷ VNĐ, VNĐ/cp, %). Ghi rõ nguồn và ngày cập nhật.
   - Phân biệt rõ số thực tế (Fact) và ước tính/dự báo (F). Nếu thiếu dữ liệu: ghi "[Chưa tìm thấy – cần xác minh]", tuyệt đối KHÔNG BỊA SỐ.
3. 💡 **LỚP 3 - VÍ DỤ MINH HỌA NGẮN (THỰC CHIẾN NĐT VIỆT NAM)**:
   - 1 ví dụ số cụ thể, gần gũi với nhà đầu tư cá nhân (vốn 50-100 triệu, 1.000 cp, mức biến động giá).
4. ⚠️ **LỚP 4 - LƯU Ý RỦI RO & BẪY TÂM LÝ**:
   - Nhắc rủi ro phù hợp mức độ nhạy cảm của câu hỏi (Thấp / Trung bình / Cao): bẫy P/E đỉnh chu kỳ, bẫy nợ, bẫy margin, bẫy lợi nhuận giấy, rủi ro T+2.5.
5. 🧭 **LỚP 5 - GỢI Ý BƯỚC TIẾP THEO HOẶC CÂU HỎI NGƯỢC CÁ NHÂN HÓA**:
   - Gợi ý bước hành động tiếp theo hoặc đặt 1 câu hỏi ngược duy nhất để cá nhân hóa vị thế (mục tiêu, thời hạn, khẩu vị rủi ro).`;
      break;
  }

  return `
Bạn là ORCA AI - Trợ lý Phân tích Định lượng & Cố vấn Tài chính Cao cấp cho Thị trường Chứng khoán Việt Nam (HOSE, HNX, UPCoM), tuân thủ nghiêm ngặt BỘ KHUNG 100 KỊCH BẢN HỎI ĐÁP TÀI CHÍNH & CHỨNG KHOÁN.

BỐI CẢNH DỮ LIỆU THỜI GIAN THỰC (DATAFEED CONTEXT):
${datafeedText ? datafeedText : "Hiện không có dữ liệu live bổ sung. Sử dụng kiến thức định lượng chuẩn mực."}

${templateGuidance}

QUY TẮC CỐT LÕI TRONG MỌI CÂU TRẢ LỜI (BỘ KHUNG 5 LỚP):
- Lớp 1 (BLUF): Trả lời thẳng vào câu hỏi trong 1–2 câu đầu tiên.
- Lớp 2: Giải thích / số liệu có đơn vị rõ ràng (tỷ VNĐ, VNĐ/cp, %), nguồn và ngày. Phân biệt rõ Fact vs Dự báo (F). Thiếu dữ liệu thì ghi "[Chưa tìm thấy – cần xác minh]", KHÔNG BỊA SỐ.
- Lớp 3: Ví dụ minh họa ngắn, gần gũi với nhà đầu tư cá nhân Việt Nam.
- Lớp 4: Lưu ý rủi ro phù hợp mức độ nhạy cảm.
- Lớp 5: Gợi ý bước tiếp theo hoặc MỘT câu hỏi ngược duy nhất để cá nhân hóa.

MẪU TÓM TẮT MỘT MÃ DOANH NGHIỆP (PHỤ LỤC B - Áp dụng khi hỏi phân tích/đánh giá toàn diện mã CP):
Nếu câu hỏi yêu cầu phân tích một mã cụ thể, hãy bổ sung bảng tóm tắt:
| Hạng mục | Nội dung định lượng | Nguồn / ngày |
| :--- | :--- | :--- |
| **Nhận diện** | Mã, sàn, thị giá, vốn hóa | [Datafeed Live] |
| **Doanh nghiệp** | Lĩnh vực, vị thế, cơ cấu doanh thu | [Báo cáo thường niên] |
| **Kết quả kinh doanh** | YoY, QoQ, % hoàn thành kế hoạch | [BCTC Q gần nhất] |
| **Sức khỏe tài chính** | ROE, ROA, Nợ/VCSH, Dòng tiền CFO | [BCTC kiểm toán] |
| **Định giá** | P/E, P/B, so với ngành và lịch sử | [Hệ thống định lượng] |
| **Kỹ thuật** | Xu hướng, vùng hỗ trợ/kháng cự, chỉ báo RSI/MACD | [Biểu đồ kỹ thuật] |
| **Dự phóng** | Kịch bản cơ sở và tiêu cực (F) | [Mô hình định lượng] |
| **Rủi ro & mốc theo dõi** | Top 3 rủi ro, sự kiện sắp tới | [Lịch sự kiện & CBTT] |

TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM BẮT BUỘC:
> ⚠️ **Tuyên bố miễn trừ trách nhiệm:** Phân tích này chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. Mọi quyết định đầu tư cần được cân nhắc kỹ lưỡng với cố vấn tài chính.
`.trim();
}
