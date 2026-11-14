import "server-only";
import { type FastDatafeedContext } from "./fast-datafeed-hub";
import { isVnSymbol } from "../vn/master";

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
  peMax?: number;
  peMin?: number;
  pbMax?: number;
  roeMin?: number;
  roaMin?: number;
  divYieldMin?: number;
  debtEquityMax?: number;
  fScoreMin?: number;
  sweetZoneOnly?: boolean;
  sectors?: string[];
  minTradingValue?: number;
  sort?: "marketCap" | "roe" | "divYield" | "pe" | "compositeScore" | "quantEdgeScore";
  order?: "asc" | "desc";
  humanSummary: string[];
}

export function isScreenerQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /lọc|bộ lọc|sàng lọc|screener|tìm mã|tìm cổ phiếu|tìm cho tôi|tìm những|tìm các mã|cho tôi danh sách|những mã nào|cổ phiếu nào|top cổ phiếu|tiêu chí|thỏa mãn tiêu chí/i.test(q) ||
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
    res.roeMin = 15;
    humanSummary.push("ROE ≥ 15% (Sinh lời cao)");
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
    res.peMax = 12;
    humanSummary.push("P/E ≤ 12x (Định giá hấp dẫn)");
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
    res.pbMax = 1.2;
    humanSummary.push("P/B ≤ 1.2x");
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
    res.divYieldMin = 6.0;
    humanSummary.push("Cổ tức tiền mặt ≥ 6.0%/năm");
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
    res.debtEquityMax = 0.8;
    humanSummary.push("Nợ/Vốn CSH (D/E) ≤ 0.8 (Cơ cấu tài chính bảo thủ)");
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
    res.fScoreMin = 7;
    humanSummary.push("Piotroski F-Score ≥ 7/9 (Chất lượng BCTC xuất sắc)");
  }

  // 8. Chân Sóng Apex / Vùng Vàng (Sweet Launch Zone)
  if (/(?:chân sóng|vùng vàng|apex|sweet zone|sweet launch|đảo chiều wyckoff|spring)/i.test(q)) {
    res.sweetZoneOnly = true;
    humanSummary.push("👑 Vùng Vàng Chân Sóng Apex (cách đáy 0.8% - 7.5%, R:R ≥ 2.2x)");
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
  } else if (/(?:apex|chân sóng|vùng vàng)/i.test(q)) {
    res.sort = "quantEdgeScore";
    res.order = "desc";
  } else {
    res.sort = "compositeScore";
    res.order = "desc";
  }

  res.minTradingValue = 5;
  humanSummary.push("Thanh khoản tối thiểu: Khớp lệnh ≥ 5 tỷ VNĐ/phiên");

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
    "RSI", "MAC", "MA1", "MA2", "CAP", "SAN", "TAP", "HOP", "BCT", "BCTC", "THU"
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
1. **TIÊU ĐỀ & MỐC THAM CHIẾU**: Tên mã/chỉ số, giá hiện tại, bối cảnh vĩ mô/ngành.
2. **KẾT LUẬN ĐIỀU HÀNH (EXECUTIVE VERDICT)**: 
   - Khuyến nghị hành động rõ ràng: [TÍCH LŨY MẠNH (STRONG_ACCUMULATE) | MUA THĂM DÒ (SELECTIVE_BUY) | QUAN SÁT (HOLD_OBSERVE) | HẠ TỶ TRỌNG (TRIM_RISK) | PHÒNG THỦ (DEFENSIVE_CASH)].
   - Tỷ số Lợi nhuận/Rủi ro tổng hợp RRR, Lợi suất kỳ vọng $E[R] = \\sum (p_i \\times R_i)$.
3. **BẢNG MA TRẬN 3 KỊCH BẢN (BULL / BASE / BEAR)**:
   - Bắt buộc tuân thủ tiên đề xác suất: $p_{bull} + p_{base} + p_{bear} = 1.0$ (100%).
   - Cột: Kịch bản | Xác suất (%) | Giá mục tiêu (VND) | Lợi suất (%) | Điểm vô hiệu hóa (Invalidation Point) | Xúc tác chính.
4. **MA TRẬN ĐA KHUNG THỜI GIAN**:
   - Ngắn hạn (T+2.5 / 1-10 phiên): Xu hướng kỹ thuật, hỗ trợ/kháng cự, cung cầu micro.
   - Trung hạn (1-2 Quý / BCTC): Doanh thu, EPS forward, P/E chu kỳ, biên lợi nhuận.
   - Dài hạn (1-3 Năm / Chu kỳ ngành): Con hào kinh tế (Economic Moat), định giá DCF.
5. **KẾ HOẠCH PHÒNG VỆ BEAR CASE & KẸT SÀN T+2.5**: Ngưỡng cắt lỗ cứng, độ trượt giá dự kiến, kịch bản thoát hàng ATO/ATC khi thị trường biến động cực đoan.`;
      break;

    case "STOCK_TECHNICAL":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÂN TÍCH KỸ THUẬT & DÒNG TIỀN NÂNG CAO) ===
1. **TỔNG QUAN XU HƯỚNG & KHUNG THỜI GIAN (TREND & BIAS)**:
   - Xu hướng ngắn hạn (Daily T+2.5): [Tăng / Giảm / Đi ngang tích lũy / Breakout].
   - Xu hướng trung - dài hạn (Weekly): [Tăng / Giảm / Tích lũy].
   - Đánh giá dòng tiền lớn: [Hấp thụ cung Wyckoff / Đột biến Volume / Phân phối / Cạn kiệt].
2. **HÀNH VI GIÁ & CHỈ BÁO ĐỘNG LƯỢNG (MOMENTUM & VOLATILITY)**:
   - Vị thế giá so với MA20 (+/-%), MA50, MA200.
   - RSI(14): Giá trị hiện tại, trạng thái Quá mua/Quá bán và phân kỳ âm/dương.
   - MACD: Giao cắt đường tín hiệu Signal và Histogram.
   - Bollinger Bands: Thắt nút cổ chai (Squeeze) hay Mở band hướng lên/xuống.
   - Khối lượng giao dịch: So sánh với trung bình 20 phiên ($V/V_{20}$).
3. **ĐO LƯỜNG DƯ ĐỊA CẢN TRÊN ĐẦU & NÉ BẪY KẸP HÀNG T+2.5**:
   - Kháng cự gần nhất và kháng cự mạnh (vùng kẹp hàng lớn).
   - Đo lường Overhead Room: Khoảng trống an toàn tới cản trên đầu phải $\\ge 5.0\\%$ để không dính cản T+.
   - Hỗ trợ ngắn hạn và Hỗ trợ chặn lỗ cứng.
4. **THIẾT LẬP KỊCH BẢN HÀNH ĐỘNG (ACTIONABLE TRIPLE-BARRIER SETUPS)**:
   - Kịch bản Mua: Vùng giải ngân an toàn (Vùng Vàng Sweet Launch Zone $0.8\\% - 7.5\\%$ từ đáy).
   - Điểm cắt lỗ cứng (Hard Stop-Loss theo ATR $1.0\\text{x}$).
   - Mục tiêu chốt lời (Target 1 & 2) đảm bảo tỷ số Lợi nhuận/Rủi ro $R:R \\ge 2.2\\text{x}$.
   - Khuyến nghị trạng thái: [TÍCH LŨY MẠNH / MUA THĂM DÒ / NẮM GIỮ / QUAN SÁT / HẠ TỶ TRỌNG].`;
      break;

    case "EARNINGS_REVIEW":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU BÓC TÁCH KẾT QUẢ KINH DOANH & BCTC) ===
1. **TỔNG HỢP KẾT QUẢ KINH DOANH CHÍNH**:
   - Doanh thu thuần và Tốc độ tăng trưởng YoY / QoQ.
   - Lợi nhuận sau thuế (LNST) cổ đông công ty mẹ và Tăng trưởng YoY / QoQ.
   - Tiến độ thực hiện kế hoạch kinh doanh năm (% kế hoạch DT & LN).
2. **BÓC TÁCH CƠ CẤU DOANH THU & BIÊN LỢI NHUẬN (CORE BUSINESS DRIVERS)**:
   - Đóng góp từ các mảng kinh doanh chính (Segment Breakdown).
   - Biến động Biên lãi gộp (Gross Margin) và Biên lãi ròng (Net Margin) giải trình nguyên nhân.
   - Tỷ trọng lợi nhuận cốt lõi vs Bất thường: Lợi nhuận từ HĐKD cốt lõi (Core EBIT) chiếm bao nhiêu %, thu nhập tài chính/bán tài sản 1 lần chiếm bao nhiêu %.
3. **CHẤT LƯỢNG TÀI SẢN & DÒNG TIỀN HOẠT ĐỘNG (FORENSIC CFO & ACCRUALS)**:
   - Dòng tiền thuần từ HĐKD (CFO) so với LNST (cảnh báo rủi ro nếu CFO âm sâu dù báo lãi).
   - Biến động Phải thu khách hàng và Hàng tồn kho (Chu kỳ chuyển hóa tiền mặt Cash Conversion Cycle).
   - Đòn bẩy nợ (D/E) và Khả năng thanh toán lãi vay (ICR).
4. **TÁC ĐỘNG LÊN ĐỊNH GIÁ & QUAN ĐIỂM ĐẦU TƯ**:
   - EPS trượt 4 quý gần nhất (Trailing EPS) và P/E điều chỉnh mới sau BCTC.
   - Đánh giá thị giá hiện tại: Đã phản ánh hết KQKD hay mở ra dư địa tái định giá mới (Re-rating catalyst).
   - Xếp hạng KQKD: [XUẤT SẮC VƯỢT TRỘI / ĐẠT KỲ VỌNG / DƯỚI KỲ VỌNG].`;
      break;

    case "SCREENER_FILTER":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU LỌC & SÀNG LỌC CỔ PHIẾU ĐỊNH LƯỢNG) ===
1. **BỘ TIÊU CHÍ SÀNG LỌC ĐÃ CHUẨN HÓA (SCREENING CRITERIA)**:
   - Liệt kê chính xác các tiêu chí người dùng yêu cầu kèm giải thích ý nghĩa kinh tế & kiểm toán (ROE/ROA, Định giá P/E, P/B, Cổ tức tiền mặt, Đòn bẩy nợ D/E, Piotroski F-Score).
   - Bộ lọc an toàn: Thanh khoản tối thiểu $\\ge 5$ tỷ VNĐ/phiên, loại trừ các mã rác, diện cảnh báo/kiểm soát.
2. **BẢNG XẾP HẠNG TOP CỔ PHIẾU ĐẠT TIÊU CHÍ (MA TRẬN DATAFEED & ORCA QUANT SCORE)**:
   - Dùng chính xác BẢNG DỮ LIỆU SÀNG LỌC TRỰC TIẾP được cung cấp bên dưới làm căn cứ số liệu tuyệt đối (Grounding).
   - Bắt buộc lập bảng Markdown: Hạng | Mã CP | Doanh Nghiệp | Ngành | Thị giá (VNĐ) | P/E (x) | P/B (x) | ROE (%) | Cổ tức (%) | D/E | F-Score | Vị thế Vùng Vàng Apex | Orca Quant Score.
3. **ĐIỂM SÁNG ĐỘNG LỰC CỦA TOP 3 CỔ PHIẾU NỔI BẬT NHẤT**:
   - 🥇 **[Mã 1]**: Luận điểm định lượng cốt lõi, con hào kinh tế (Moat), sức mạnh bảng cân đối kế toán và dòng tiền FCF.
   - 🥈 **[Mã 2]**: Động lực tăng trưởng doanh thu/lợi nhuận, biên lãi ròng mở rộng và chất lượng tài sản sạch.
   - 🥉 **[Mã 3]**: Đặc điểm định giá hấp dẫn kèm biên an toàn (MOS $\\ge 15-20\\%$).
4. **CẢNH BÁO BẪY SỐ LIỆU ĐỊNH LƯỢNG (FILTER CAVEATS)**:
   - Bẫy P/E thấp ở đỉnh chu kỳ (đặc biệt nhóm Thép, Hóa chất, Cảng biển, Vận tải biển).
   - Kiểm tra khoản mục lợi nhuận bất thường (bán tài sản 1 lần, hoàn nhập dự phòng làm méo mó ROE/PE).
   - Đo lường cản trên đầu (Overhead Room $\\ge 5\\%$) và khả năng thanh khoản trước khi giải ngân.
5. **CHIẾN LƯỢC GIẢI NGÂN & KẾ HOẠCH TRIPLE-BARRIER (T+20)**:
   - Vùng tích lũy giải ngân an toàn (Vùng Vàng Sweet Launch Zone cách đáy $0.8\\% - 7.5\\%$).
   - Ngưỡng cắt lỗ cứng bảo vệ vốn (Hard Stop-Loss theo ATR $1.0\\text{x}$).
   - Mục tiêu chốt lời 1 & 2 đảm bảo tỷ số Lợi nhuận/Rủi ro $R:R \\ge 2.2\\text{x}$.`;
      break;

    case "STOCK_COMPARE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU SO SÁNH ĐỐI ĐẦU CỔ PHIẾU - HEAD TO HEAD) ===
1. **BẢNG MA TRẬN ĐỐI ĐẦU ĐỊNH LƯỢNG (HEAD-TO-HEAD MATRIX)**:
   - Cột so sánh trực diện: Tiêu chí | ${detectedEntities.tickers.join(" | ") || "Mã A | Mã B"}
   - Các dòng bắt buộc:
     * Thị giá hiện tại & P/E, P/B, Vốn hóa.
     * Tăng trưởng Doanh thu & LNST quý gần nhất.
     * Tỷ suất sinh lời: ROE, ROA, Biên lợi nhuận gộp/ròng.
     * Sức khỏe tài chính: Nợ/Vốn CSH (D/E), Khả năng thanh toán lãi vay (ICR), Piotroski F-Score.
     * Dòng tiền CFO/LNST và Cổ tức tiền mặt (%/năm).
     * Chỉ báo kỹ thuật: RSI(14), Xu hướng giá vs MA50/MA200, Điểm vị thế Vùng Vàng Apex.
     * Điểm số Orca Composite Master (1-99).
2. **SO SÁNH LỢI THẾ CẠNH TRANH & CON HÀO KINH TẾ (ECONOMIC MOAT)**:
   - Phân tích sự vượt trội về quy mô, thị phần, rào cản gia nhập ngành, quyền định giá.
3. **ĐÁNH GIÁ ĐỊNH GIÁ & DƯ ĐỊA TĂNG TRƯỞNG**:
   - Mã nào đang có định giá chiết khấu hơn so với tốc độ tăng trưởng (PEG).
4. **KẾT LUẬN LỰA CHỌN & CHIẾN LƯỢC PHÂN BỔ**:
   - Chọn mã tối ưu hơn cho từng khẩu vị: Mã nào phù hợp phòng thủ cổ tức, mã nào phù hợp tăng trưởng bứt phá (Growth).
   - Tỷ lệ phân bổ danh mục đề xuất (Ví dụ: 60/40 hoặc 70/30).`;
      break;

    case "STOCK_DEEP_DIVE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÂN TÍCH CỔ PHIẾU CHUYÊN SÂU & ĐA NHÂN TỐ) ===
1. **TỔNG QUAN TẬN DỤNG DATAFEED TRỰC TIẾP**: Trích xuất giá hiện tại, % biến động, P/E, P/B, RSI, và điểm số kỹ thuật từ dữ liệu realtime được cung cấp bên dưới.
2. **MA TRẬN ĐỊNH LƯỢNG ĐA NHÂN TỐ (ORCA MULTI-FACTOR QUANTITATIVE MATRIX)**:
   - Lập bảng tổng hợp 3 trục nhân tố:
     * Trục Kỹ thuật ($Z_{\\text{Tech}}$): Điểm RS O'Neil, Tỷ lệ Lực cầu chủ động (Active Buy), Vị thế Vùng Vàng Apex Launch ($0.8\\% - 7.5\\%$), Dư địa cản trên Overhead Room ($\\ge 5\\%$).
     * Trục Cơ bản ($Z_{\\text{Fund}}$): ROIC, ROE, Sloan Accrual Ratio ($\\le 5\\%$), Tỷ lệ CFO/LNST ($\\ge 0.8$), Piotroski F-Score (0-9), Altman $Z''$-Score.
     * Trục Định giá ($Z_{\\text{Val}}$): P/E 5 năm Median, Gordon Growth P/B vs ROE, FCF Yield, Biên an toàn định giá (MOS $\\ge 15-20\\%$).
   - Điểm Orca Master Composite Score (1 - 99 Percentile) & Phân loại định chế (SUPER_ELITE / LEADER / WATCH / AVOID) theo Chế độ Thị trường.
3. **SỨC KHỎE TÀI CHÍNH & CHẤT LƯỢNG LỢI NHUẬN (BCTC)**:
   - Tăng trưởng doanh thu & LNST cốt lõi (Core EBIT).
   - Chất lượng dòng tiền hoạt động kinh doanh (CFO) so với LNST (cảnh báo nếu lợi nhuận giấy/Accruals cao).
   - Đòn bẩy nợ vay (D/E), khả năng thanh toán lãi vay (ICR) và sức khỏe theo Piotroski F-Score / Altman Z-Score.
4. **ĐỊNH GIÁ & BIÊN ĐỘ AN TOÀN (MARGIN OF SAFETY)**:
   - So sánh định giá P/E, P/B với trung bình 3-5 năm và trung bình ngành.
   - Ước lượng vùng giá trị hợp lý (Fair Value) và biên an toàn $\\ge 15-20\\%$.
5. **KẾ HOẠCH HÀNH ĐỘNG TRIPLE-BARRIER (T+20)**:
   - Vùng giá tích lũy giải ngân an toàn.
   - Ngưỡng cắt lỗ cứng bảo vệ vốn (Stop-loss $1.0\\text{x}$ ATR).
   - Giá mục tiêu chốt lời đảm bảo tỷ số Lợi nhuận/Rủi ro $R:R \\ge 2.2\\text{x}$.
   - Khuyến nghị trạng thái: [TÍCH LŨY MẠNH / MUA THĂM DÒ / QUAN SÁT / HẠ TỶ TRỌNG].`;
      break;

    case "COMMODITY_MACRO":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TÁC ĐỘNG HÀNG HÓA VĨ MÔ & TRUYỀN DẪN CỔ PHIẾU) ===
1. **DIỄN BIẾN GIÁ HÀNG HÓA TOÀN CẦU (COMMODITY BENCHMARK)**:
   - Trích xuất số liệu trực tiếp từ bảng giá hàng hóa bên dưới: Giá hiện tại, đơn vị, biến động % gần nhất.
   - Xu hướng chính (Tăng mạnh / Giảm / Đi ngang) và nguyên nhân vĩ mô (Cung-cầu OPEC+, chiến tranh, tồn kho, chính sách xuất nhập khẩu Trung Quốc/Mỹ).
2. **CƠ CHẾ TRUYỀN DẪN KINH TẾ (TRANSMISSION MECHANISM)**:
   - Giải thích chuỗi giá trị: Biến động giá hàng hóa đầu vào tác động tới Doanh thu, Biên lợi nhuận gộp hay Chi phí vốn lưu động như thế nào.
   - Độ trễ phản ánh vào BCTC các doanh nghiệp niêm yết (thường trễ 1-2 quý do tồn kho giá rẻ/đắt).
3. **DANH MỤC CỔ PHIẾU HƯỞNG LỢI TRỰC TIẾP (BENEFICIARY STOCKS)**:
   - Danh sách mã cổ phiếu hưởng lợi và giải thích cụ thể lợi thế (sở hữu tồn kho giá thấp, tự chủ nguyên liệu, biên lãi gộp nới rộng).
4. **DANH MỤC CỔ PHIẾU CHỊU RỦI RO / ÁP LỰC CHI PHÍ (HEADWIND STOCKS)**:
   - Danh sách mã cổ phiếu chịu áp lực chi phí đầu vào và mức độ rủi ro xói mòn biên lợi nhuận.
5. **CHIẾN LƯỢC GIAO DỊCH & PHÒNG VỆ CHU KỲ (COMMODITY CYCLE TRADING)**:
   - Đánh giá giai đoạn chu kỳ: Đầu sóng, Giữa chu kỳ hay Vùng phân phối đỉnh chu kỳ.
   - Cảnh báo bẫy P/E thấp ở đỉnh chu kỳ hàng hóa và kế hoạch dừng lỗ/chốt lời.`;
      break;

    case "FORENSIC_OR_RISK":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU PHÁP Y BCTC & KIỂM SOÁT BẪY RỦI RO) ===
1. **CHẨN ĐOÁN CỜ ĐỎ TÀI CHÍNH (FORENSIC AUDIT RED FLAGS)**:
   - Khoản phải thu khác / Tổng tài sản (nguy cơ rút ruột hoặc ủy thác đầu tư mờ ám).
   - Hàng tồn kho ứ đọng hoặc dự phòng giảm giá chưa trích lập đủ.
   - Dòng tiền thuần từ HĐKD (CFO) âm liên tục dù báo lãi (bẫy lợi nhuận giấy).
   - Tỷ lệ đòn bẩy nợ vay và cấu trúc kỳ hạn nợ (áp lực trả nợ trái phiếu/ngân hàng đến hạn).
2. **BẪY ĐỊNH GIÁ & CHU KỲ (VALUATION & CYCLE TRAPS)**:
   - Bẫy P/E ảo do bán tài sản 1 lần hoặc ở đỉnh chu kỳ kinh doanh.
3. **RỦI RO THANH KHOẢN & KẸT SÀN T+2.5**:
   - Đánh giá thanh khoản bình quân phiên, hiện tượng dư bán sàn trắng bảng bên mua (mất thanh khoản).
   - Rủi ro bán giải chấp (Force Sell / Call Margin) dây chuyền từ ban lãnh đạo.
4. **KỊCH BẢN PHÒNG VỆ & HƯỚNG XỬ LÝ KHẨN CẤP**:
   - Kịch bản hạ tỷ trọng từng bước hoặc lệnh MP/ATO/ATC khi vi phạm ngưỡng cắt lỗ.
   - Quy tắc bất di bất dịch: Tuyệt đối không trung bình giá xuống đối với cổ phiếu có vấn đề kiểm toán hoặc gian lận BCTC.`;
      break;

    case "MARKET_OVERVIEW":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TOÀN CẢNH THỊ TRƯỜNG VN-INDEX & CHẾ ĐỘ REGIME) ===
1. **TRẠNG THÁI CHỈ SỐ VN-INDEX & VN30**:
   - Điểm số hiện tại, % tăng giảm, giá trị thanh khoản toàn thị trường (so với bình quân 20 phiên).
   - Độ rộng thị trường (Số mã tăng / giảm / trần / sàn) và độ nghiêng dòng tiền.
2. **CHẾ ĐỘ THỊ TRƯỜNG (MARKET REGIME CLASSIFICATION)**:
   - Xác định rõ chế độ: [BULL_EXPANSION (Thị trường giá lên mạnh) | SIDEWAY_CONSOLIDATION (Tích lũy biên hẹp) | BEAR_CAPITULATION (Thị trường giá xuống) | HIGH_VOLATILITY (Biến động cực đoan)].
   - Vị thế chỉ số so với MA20, MA50, MA200 ngày.
3. **DÒNG TIỀN PHÂN HÓA THEO NHÓM NGÀNH**:
   - Nhóm ngành dẫn dắt (Leading sectors) và Nhóm ngành chịu áp lực rút tiền (Lagging sectors).
   - Hành vi khối ngoại & tự doanh (Mua ròng / Bán ròng tập trung ở đâu).
4. **CHIẾN LƯỢC QUẢN TRỊ DANH MỤC & TỶ TRỌNG TIỀN/CỔ**:
   - Tỷ trọng tiền mặt / cổ phiếu đề xuất cho chế độ hiện tại (ví dụ: Bull 70-80% cổ, Sideway 50/50, Bear 20-30% cổ).
   - Vùng hỗ trợ cứng và vùng cản cản trở đà tăng.`;
      break;

    case "PERSONAL_FINANCE":
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (MẪU TÀI CHÍNH CÁ NHÂN & TỐI ƯU DÒNG TIỀN) ===
1. **BẢNG CHẨN ĐOÁN DÒNG TIỀN CÁ NHÂN**:
   - Thu nhập hàng tháng (Gross vs Net), các khoản giảm trừ gia cảnh người phụ thuộc.
   - Phân bổ chi tiêu chuẩn (Ví dụ mô hình 50/30/20 hoặc 60/20/20).
2. **TÍNH TOÁN BẬC THUẾ TNCN & TỐI ƯU NGHĨA VỤ THUẾ**:
   - Bảng lũy tiến từng phần theo luật thuế TNCN Việt Nam (từ 5% đến 35%).
   - Các khoản đóng góp bảo hiểm bắt buộc (BHXH 8%, BHYT 1.5%, BHTN 1%) và mẹo tối ưu chi phí hợp pháp.
3. **CHIẾN LƯỢC TRẢ NỢ & TỐI ƯU LÃI SUẤT**:
   - So sánh nợ theo dư nợ ban đầu vs dư nợ giảm dần.
   - Chiến lược quả cầu tuyết (Snowball) vs Tuyết lở (Avalanche) đối với nợ vay thẻ tín dụng / vay tiêu dùng.
4. **QUỸ KHẨN CẤP & BẢO VỆ TÀI CHÍNH**:
   - Quy mô quỹ khẩn cấp khuyến nghị (3 - 6 tháng chi phí thiết yếu).
   - Nơi cất giữ tối ưu (tiền gửi có kỳ hạn linh hoạt, chứng chỉ tiền gửi).`;
      break;

    default:
      templateGuidance = `
=== CẤU TRÚC TRẢ LỜI BẮT BUỘC (TƯ VẤN TÀI CHÍNH CHUẨN ĐỊNH CHẾ) ===
1. **TRỰC DIỆN VÀO CÂU HỎI**: Trả lời rõ ràng luận điểm chính với dữ liệu kiểm chứng.
2. **LUẬN CỨ ĐỊNH LƯỢNG & SỐ LIỆU MINH BẠCH**: Dùng số liệu từ thị trường, BCTC hoặc dữ liệu realtime để hỗ trợ lập luận.
3. **ĐÁNH GIÁ RỦI RO & BẢO VỆ VỐN**: Luôn phân tích 2 mặt cơ hội và rủi ro.
4. **KHUYẾN NGHỊ HÀNH ĐỘNG**: Các bước thực thi rõ ràng, thực tế.`;
      break;
  }

  return `
Bạn là ORCA AI - Trợ lý Phân tích Định lượng & Tư vấn Tài chính Cao cấp cho Thị trường Chứng khoán Việt Nam (HOSE, HNX, UPCoM).

BỐI CẢNH DỮ LIỆU THỜI GIAN THỰC (DATAFEED CONTEXT):
${datafeedText ? datafeedText : "Hiện không có dữ liệu live bổ sung. Sử dụng kiến thức định lượng chuẩn mực."}

${templateGuidance}

NGUYÊN TẮC BẮT BUỘC KHI TRẢ LỜI:
- Luôn giữ thái độ khách quan, khoa học định lượng (Quantitative rigor), không phỏng đoán cảm tính.
- Ưu tiên sử dụng số liệu từ DATAFEED trực tiếp (giá, P/E, P/B, ROE, RSI, hàng hóa, chế độ thị trường) làm căn cứ số liệu.
- Công thức toán học, tài chính và phân vị điểm số bắt buộc viết theo cú pháp KaTeX rõ ràng (ví dụ: $R:R \\ge 2.2\\text{x}$, $E[R]$, $MOS \\ge 15\\%$, $Z_{\\text{Tech}}$).
- Luôn kết thúc bằng một khối miễn trừ trách nhiệm chuẩn định chế:
  > **Tuyên bố miễn trừ trách nhiệm**: Phân tích được tạo tự động bởi hệ thống mô hình định lượng Orca AI dựa trên dữ liệu công khai và dữ liệu thị trường trực tiếp. Nội dung mang tính chất tham khảo cho mục đích nghiên cứu, không cấu thành lời mời chào mua bán chứng khoán hay cam kết lợi nhuận đầu tư. Nhà đầu tư tự chịu trách nhiệm về quyết định tài chính của mình.
`.trim();
}
