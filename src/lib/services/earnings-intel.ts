/**
 * Earnings Intelligence & BCTC Regulatory Deadlines.
 * Pure-logic extraction of profit/revenue numbers from Vietnamese headlines and period detection.
 * Ported from lotusmarket (Go/Python earnings).
 */

export interface BctcDeadline {
  date: string; // YYYY-MM-DD
  period: string;
  descriptionVi: string;
  isUpcoming: boolean;
  daysRemaining: number;
}

export interface ExtractedEarnings {
  ticker?: string;
  profitVndBillions?: number;
  revenueVndBillions?: number;
  targetProfitVndBillions?: number;
  period?: string;
}

const SKIP_TICKERS = new Set([
  "CEO", "CFO", "IPO", "GDP", "VND", "USD", "ETF", "EPS", "FDI", "FED", "THE", "AND", "UBCK", "BCTC", "ĐHCĐ", "DTT", "LNST"
]);

function parseVietnameseNumber(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/[.,]/g, "").trim();
  const val = parseInt(clean, 10);
  return isNaN(val) ? 0 : val;
}

const PROFIT_PAT = /(?:lãi(?:\s+(?:ròng|sau\s+thuế|trước\s+thuế))?|lợi\s+nhuận|LNST)[^.]{0,40}?(?:hơn|gần|khoảng|đạt|vượt)?\s*([\d.,]+)\s*tỷ/i;
const REVENUE_PAT = /doanh\s+thu[^.]{0,40}?(?:hơn|gần|khoảng|đạt|vượt)?\s*([\d.,]+)\s*tỷ/i;
const TARGET_PAT = /(?:kế\s+hoạch|mục\s+tiêu|chỉ\s+tiêu)[^.]{0,80}?(?:lãi(?:\s+(?:ròng|sau\s+thuế|trước\s+thuế))?|lợi\s+nhuận)[^.]{0,30}?(?:hơn|gần|khoảng|đạt|vượt)?\s*([\d.,]+)\s*tỷ/i;

const PERIOD_PATTERNS: Array<{ key: string; pat: RegExp }> = [
  { key: "Q1", pat: /(?:quý\s*(?:1|I|một)|Q1)(?:\s*[/\-]\s*(\d{4}))?/i },
  { key: "Q2", pat: /(?:quý\s*(?:2|II|hai)|Q2)(?:\s*[/\-]\s*(\d{4}))?/i },
  { key: "Q3", pat: /(?:quý\s*(?:3|III|ba)|Q3)(?:\s*[/\-]\s*(\d{4}))?/i },
  { key: "Q4", pat: /(?:quý\s*(?:4|IV|bốn)|Q4)(?:\s*[/\-]\s*(\d{4}))?/i },
  { key: "9M", pat: /(?:9\s*tháng)(?:\s+(?:đầu\s+năm|năm)\s*(\d{4}))?/i },
  { key: "6M", pat: /(?:6\s*tháng|nửa\s+đầu\s+năm|bán\s+niên)(?:\s*(?:năm)?\s*(\d{4}))?/i },
  { key: "FY", pat: /(?:cả\s+năm|cả\s+năm\s+(\d{4})|năm\s+(\d{4}))/i },
];

export function detectReportingPeriod(title: string): string {
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? yearMatch[1] : "";

  for (const item of PERIOD_PATTERNS) {
    const m = title.match(item.pat);
    if (m) {
      const year = m[1] || fallbackYear;
      return year ? `${item.key}/${year}` : item.key;
    }
  }
  return "";
}

export function extractEarningsFromHeadline(title: string): ExtractedEarnings {
  const period = detectReportingPeriod(title);

  let profitVndBillions: number | undefined = undefined;
  const profitMatch = title.match(PROFIT_PAT);
  if (profitMatch) {
    const val = parseVietnameseNumber(profitMatch[1]);
    if (val > 0) profitVndBillions = val;
  }

  let revenueVndBillions: number | undefined = undefined;
  const revMatch = title.match(REVENUE_PAT);
  if (revMatch) {
    const val = parseVietnameseNumber(revMatch[1]);
    if (val > 0) revenueVndBillions = val;
  }

  let targetProfitVndBillions: number | undefined = undefined;
  const targetMatch = title.match(TARGET_PAT);
  if (targetMatch) {
    const val = parseVietnameseNumber(targetMatch[1]);
    if (val > 0) targetProfitVndBillions = val;
  }

  // Ticker extraction
  const tickerMatches = title.match(/\b([A-Z]{3})\b/g) || [];
  const validTicker = tickerMatches.find((t) => !SKIP_TICKERS.has(t));

  return {
    ticker: validTicker,
    profitVndBillions,
    revenueVndBillions,
    targetProfitVndBillions,
    period,
  };
}

/**
 * Returns the 6 statutory BCTC submission deadlines for a given fiscal year
 * pursuant to Circular 96/2020/TT-BTC (UBCKNN).
 */
export function getBCTCDeadlines(year: number = new Date().getFullYear()): BctcDeadline[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const rawDeadlines = [
    { date: `${year}-04-20`, period: `Q1/${year}`, desc: `Hạn nộp BCTC Quý 1/${year}` },
    { date: `${year}-07-20`, period: `Q2/${year}`, desc: `Hạn nộp BCTC Quý 2/${year}` },
    { date: `${year}-08-14`, period: `6M/${year}`, desc: `Hạn nộp BCTC Bán niên Soát xét ${year}` },
    { date: `${year}-10-20`, period: `Q3/${year}`, desc: `Hạn nộp BCTC Quý 3/${year}` },
    { date: `${year + 1}-01-20`, period: `Q4/${year}`, desc: `Hạn nộp BCTC Quý 4/${year}` },
    { date: `${year + 1}-03-31`, period: `FY/${year}`, desc: `Hạn nộp BCTC Kiểm toán năm ${year}` },
  ];

  return rawDeadlines.map((d) => {
    const targetDate = new Date(d.date);
    const diffTime = targetDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
      date: d.date,
      period: d.period,
      descriptionVi: d.desc,
      isUpcoming: daysRemaining >= 0 && daysRemaining <= 60,
      daysRemaining,
    };
  });
}
