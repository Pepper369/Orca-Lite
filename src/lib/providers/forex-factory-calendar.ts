import "server-only";
import { httpJson } from "@/lib/http";
import { getEconomicCalendar } from "./economic-calendar";

export interface ForexFactoryRawEvent {
  title: string;
  country: string; // Currency symbol: USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD
  date: string; // ISO format with timezone e.g. 2026-11-22T16:45:00-05:00
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface NormalizedMacroCalendarEvent {
  id: string;
  title: string;
  currency: string;
  time: string; // ISO UTC
  timestamp: number;
  impact: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  source: "FOREX_FACTORY" | "BIQUOTE" | "ORCA_INTERNAL";
  surprise: {
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    magnitudePct: number;
    descriptionVi: string;
  } | null;
}

export interface CurrencyMacroBias {
  currency: string;
  biasScore: number; // -5.0 (Cực kỳ tiêu cực) đến +5.0 (Cực kỳ tích cực), 0 là trung tính
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: "HIGH" | "MODERATE" | "LOW";
  recentCatalysts: string[];
}

let cachedEvents: { data: NormalizedMacroCalendarEvent[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút cache Forex Factory feed

function parseNumericValue(val?: string | null): number | null {
  if (!val || typeof val !== "string") return null;
  const cleaned = val.replace(/[%KkMmBb]/g, "").trim();
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;

  if (val.includes("K") || val.includes("k")) return num * 1_000;
  if (val.includes("M") || val.includes("m")) return num * 1_000_000;
  if (val.includes("B") || val.includes("b")) return num * 1_000_000_000;
  return num;
}

/**
 * Đánh giá độ lệch bất ngờ (Surprise Index) của tin kinh tế:
 * Đối với hầu hết các chỉ số (GDP, NFP, Retail Sales, PMI, CPI, Lãi suất): Actual > Forecast -> Bullish
 * Đối với Thất nghiệp / Trợ cấp thất nghiệp (Unemployment, Jobless Claims): Actual < Forecast -> Bullish
 */
export function evaluateNewsSurprise(
  title: string,
  actualStr?: string | null,
  forecastStr?: string | null,
): NormalizedMacroCalendarEvent["surprise"] {
  const actual = parseNumericValue(actualStr);
  const forecast = parseNumericValue(forecastStr);
  if (actual == null || forecast == null) return null;

  const diff = actual - forecast;
  const isZeroTolerance = Math.abs(diff) < 1e-6;
  if (isZeroTolerance) {
    return {
      direction: "NEUTRAL",
      magnitudePct: 0,
      descriptionVi: `Khớp đúng dự báo (${actualStr})`,
    };
  }

  const upper = title.toUpperCase();
  const isInverseIndicator =
    upper.includes("UNEMPLOYMENT") ||
    upper.includes("JOBLESS CLAIMS") ||
    upper.includes("LAYOFFS");

  const isPositiveSurprise = isInverseIndicator ? diff < 0 : diff > 0;
  const pctDiff = forecast !== 0 ? Math.abs((diff / forecast) * 100) : Math.abs(diff) * 10;

  return {
    direction: isPositiveSurprise ? "BULLISH" : "BEARISH",
    magnitudePct: Math.round(pctDiff),
    descriptionVi: isPositiveSurprise
      ? `Thực tế (${actualStr}) vượt kỳ vọng (${forecastStr}) -> Hỗ trợ tăng giá`
      : `Thực tế (${actualStr}) thấp hơn kỳ vọng (${forecastStr}) -> Áp lực giảm giá`,
  };
}

/**
 * Lấy lịch kinh tế hợp nhất (Forex Factory chính thức -> Biquote Live -> Internal Fallback)
 */
export async function getUnifiedMacroCalendarEvents(
  forceRefresh = false,
): Promise<NormalizedMacroCalendarEvent[]> {
  const now = Date.now();
  if (!forceRefresh && cachedEvents && now - cachedEvents.fetchedAt < CACHE_TTL_MS) {
    return cachedEvents.data;
  }

  // 1. Thử lấy nguồn Forex Factory chính thức (Fair Economy Media)
  try {
    const rawFf = await httpJson<ForexFactoryRawEvent[]>(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      {
        provider: "GENERIC",
        timeoutMs: 4_000,
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrcaQuant/1.0",
        },
      },
    );

    if (Array.isArray(rawFf) && rawFf.length > 0) {
      const parsed: NormalizedMacroCalendarEvent[] = rawFf
        .map((ev, idx): NormalizedMacroCalendarEvent | null => {
          const t = Date.parse(ev.date);
          if (!Number.isFinite(t)) return null;
          const curr = (ev.country || "USD").toUpperCase().trim();
          const impactMapped: NormalizedMacroCalendarEvent["impact"] =
            ev.impact === "High"
              ? "CRITICAL"
              : ev.impact === "Medium"
                ? "HIGH"
                : ev.impact === "Low"
                  ? "MEDIUM"
                  : "LOW";

          return {
            id: `ff_${t}_${curr}_${idx}`,
            title: ev.title,
            currency: curr,
            time: new Date(t).toISOString(),
            timestamp: t,
            impact: impactMapped,
            forecast: ev.forecast ?? null,
            previous: ev.previous ?? null,
            actual: ev.actual ?? null,
            source: "FOREX_FACTORY",
            surprise: evaluateNewsSurprise(ev.title, ev.actual, ev.forecast),
          };
        })
        .filter((x): x is NormalizedMacroCalendarEvent => x !== null);

      if (parsed.length > 0) {
        cachedEvents = { data: parsed, fetchedAt: now };
        return parsed;
      }
    }
  } catch {
    // Fallback sang Biquote / Internal
  }

  // 2. Fallback sang Biquote Live Calendar
  try {
    const rawBq = await httpJson<
      Array<{
        time?: string;
        currency?: string;
        name?: string;
        importance?: string;
        actual?: number | string;
        forecast?: number | string;
        previous?: number | string;
      }>
    >("https://biquote.io/api/calendar?importance=high&countries=US,EU,GB,JP,AU,CA,CH,NZ", {
      provider: "BIQUOTE",
      timeoutMs: 3_000,
      headers: { Accept: "application/json" },
    });

    if (Array.isArray(rawBq) && rawBq.length > 0) {
      const parsed: NormalizedMacroCalendarEvent[] = rawBq
        .map((ev, idx): NormalizedMacroCalendarEvent | null => {
          if (!ev.time || !ev.name) return null;
          const t = Date.parse(ev.time);
          if (!Number.isFinite(t)) return null;
          const curr = (ev.currency || "USD").toUpperCase().trim();
          const actStr = ev.actual != null ? String(ev.actual) : null;
          const fctStr = ev.forecast != null ? String(ev.forecast) : null;
          const impactMapped: NormalizedMacroCalendarEvent["impact"] =
            ev.importance === "high" ? "CRITICAL" : "HIGH";

          return {
            id: `bq_${t}_${curr}_${idx}`,
            title: ev.name,
            currency: curr,
            time: new Date(t).toISOString(),
            timestamp: t,
            impact: impactMapped,
            forecast: fctStr,
            previous: ev.previous != null ? String(ev.previous) : null,
            actual: actStr,
            source: "BIQUOTE",
            surprise: evaluateNewsSurprise(ev.name, actStr, fctStr),
          };
        })
        .filter((x): x is NormalizedMacroCalendarEvent => x !== null);

      if (parsed.length > 0) {
        cachedEvents = { data: parsed, fetchedAt: now };
        return parsed;
      }
    }
  } catch {
    // Fallback sang Internal Calendar
  }

  // 3. Fallback sang Internal Scheduled Macro Calendar
  try {
    const internal = await getEconomicCalendar();
    const mapped: NormalizedMacroCalendarEvent[] = internal.events.map((ev, idx) => {
      const t = Date.parse(`${ev.date}T${ev.time ?? "12:00"}:00+07:00`);
      return {
        id: `orca_${ev.id}_${idx}`,
        title: ev.title,
        currency: ev.country === "US" ? "USD" : ev.country === "EU" ? "EUR" : "VND",
        time: new Date(t).toISOString(),
        timestamp: t,
        impact: ev.impact === "HIGH" ? "CRITICAL" : "MEDIUM",
        forecast: ev.forecast ?? null,
        previous: ev.previous ?? null,
        actual: ev.actual ?? null,
        source: "ORCA_INTERNAL" as const,
        surprise: evaluateNewsSurprise(ev.title, ev.actual, ev.forecast),
      };
    });

    cachedEvents = { data: mapped, fetchedAt: now };
    return mapped;
  } catch {
    return [];
  }
}

/**
 * Tính toán Bias Vĩ Mô Định Lượng cho từng đồng tiền (Forex Factory Macro Trend Bias Engine):
 * Đọc các tin tức trong 24 giờ qua và các tin sắp diễn ra trong 2 giờ tới:
 * - Tin vừa công bố tốt hơn dự báo: +1.0 đến +3.0 điểm sức mạnh
 * - Tin vừa công bố kém hơn dự báo: -1.0 đến -3.0 điểm sức mạnh
 * - Tin sắp công bố trong vòng 30 phút: Đánh dấu High Volatility Warning
 */
export async function computeForexFactoryMacroBiasMap(): Promise<Map<string, CurrencyMacroBias>> {
  const events = await getUnifiedMacroCalendarEvents();
  const now = Date.now();
  const LOOKBACK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 giờ qua
  const LOOKAHEAD_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ tới

  const biasMap = new Map<string, CurrencyMacroBias>();
  const activeCurrencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

  for (const curr of activeCurrencies) {
    biasMap.set(curr, {
      currency: curr,
      biasScore: 0,
      direction: "NEUTRAL",
      confidence: "LOW",
      recentCatalysts: [],
    });
  }

  for (const ev of events) {
    const diff = ev.timestamp - now;
    // Xét các sự kiện trong cửa sổ [-24h .. +2h]
    if (diff < -LOOKBACK_WINDOW_MS || diff > LOOKAHEAD_WINDOW_MS) continue;

    const curr = ev.currency;
    const currentBias = biasMap.get(curr);
    if (!currentBias) continue;

    // Trọng số theo mức độ ảnh hưởng của tin
    const impactWeight = ev.impact === "CRITICAL" ? 1.5 : ev.impact === "HIGH" ? 1.0 : 0.5;

    // Nếu tin đã công bố và có kết quả bất ngờ
    if (ev.actual != null && ev.surprise) {
      const ageHours = Math.max(0.1, (now - ev.timestamp) / 3_600_000);
      const decayFactor = Math.exp(-ageHours / 12); // Suy hao theo hàm mũ trong 12 giờ

      if (ev.surprise.direction === "BULLISH") {
        currentBias.biasScore += Math.min(3.0, 1.5 * impactWeight * decayFactor);
        currentBias.recentCatalysts.push(`🟢 ${ev.title}: ${ev.surprise.descriptionVi}`);
      } else if (ev.surprise.direction === "BEARISH") {
        currentBias.biasScore -= Math.min(3.0, 1.5 * impactWeight * decayFactor);
        currentBias.recentCatalysts.push(`🔴 ${ev.title}: ${ev.surprise.descriptionVi}`);
      }
    }
  }

  // Chuẩn hóa điểm số và hướng bias
  for (const [curr, bias] of biasMap.entries()) {
    bias.biasScore = Number(Math.max(-5.0, Math.min(5.0, bias.biasScore)).toFixed(2));
    if (bias.biasScore >= 1.2) {
      bias.direction = "BULLISH";
      bias.confidence = bias.biasScore >= 2.5 ? "HIGH" : "MODERATE";
    } else if (bias.biasScore <= -1.2) {
      bias.direction = "BEARISH";
      bias.confidence = bias.biasScore <= -2.5 ? "HIGH" : "MODERATE";
    } else {
      bias.direction = "NEUTRAL";
      bias.confidence = "LOW";
    }
  }

  return biasMap;
}
