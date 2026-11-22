import { ok } from "@/lib/envelope";
import { httpJson } from "@/lib/http";
import { getEconomicCalendar } from "@/lib/providers/economic-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BiquoteCalendarItem {
  time?: string;
  countryCode?: string;
  currency?: string;
  name?: string;
  importance?: string;
}

let cachedCalendar: { data: BiquoteCalendarItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET() {
  const now = Date.now();
  if (cachedCalendar && now - cachedCalendar.fetchedAt < CACHE_TTL_MS) {
    return ok(cachedCalendar.data, {
      source: "biquote-calendar-cached",
      freshness: "FRESH",
    });
  }

  try {
    const raw = await httpJson<BiquoteCalendarItem[]>(
      "https://biquote.io/api/calendar?importance=high&countries=US,EU,GB,JP",
      {
        provider: "BIQUOTE",
        timeoutMs: 3_000,
        headers: { Accept: "application/json" },
      },
    );

    if (Array.isArray(raw) && raw.length > 0) {
      cachedCalendar = { data: raw, fetchedAt: now };
      return ok(raw, {
        source: "biquote-calendar-live",
        freshness: "LIVE",
      });
    }
  } catch {
    // Fallback on error or timeout to internal economic calendar provider
  }

  // Fallback to internal calendar
  try {
    const internal = await getEconomicCalendar();
    const mapped: BiquoteCalendarItem[] = internal.events.map((e) => ({
      time: e.time ? `${e.date}T${e.time}:00Z` : `${e.date}T12:00:00Z`,
      countryCode: e.country,
      currency: e.country === "US" ? "USD" : e.country === "EU" ? "EUR" : "VND",
      name: e.title,
      importance: e.impact.toLowerCase(),
    }));
    return ok(mapped, {
      source: "orca-internal-calendar-fallback",
      freshness: "DELAYED",
    });
  } catch {
    return ok([], {
      source: "empty-calendar",
      freshness: "STALE",
    });
  }
}
