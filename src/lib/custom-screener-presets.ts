"use client";

export interface CustomScreenerPreset {
  id: string;
  name: string;
  desc?: string;
  createdAt: number;
  filters: {
    minOrcaMasterScore?: number;
    minRsRating?: number;
    minSmartMoneyScore?: number;
    minPiotroskiScore?: number;
    maxBuyDiff?: number;
    buyZoneStatus?: string;
    mtfOnly?: boolean;
    maSignal?: string;
    minTradingValue?: number;
    minPe?: number;
    maxPe?: number;
    minPb?: number;
    maxPb?: number;
    minRoe?: number;
    minDivYield?: number;
    maxDe?: number;
    minMarketCap?: number;
    mtfCandleOnly?: boolean;
    minMtfCandleScore?: number;
    vsaOnly?: boolean;
    minOverheadRoom?: number;
  };
}

const STORAGE_KEY = "orca_custom_screener_presets_v1";
const MAX_SAVED_PRESETS = 30;

export function loadCustomPresets(): CustomScreenerPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is CustomScreenerPreset =>
        Boolean(
          p &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            p.filters &&
            typeof p.filters === "object"
        )
    );
  } catch {
    return [];
  }
}

export function persistCustomPreset(preset: CustomScreenerPreset) {
  if (typeof window === "undefined") return;
  try {
    const current = loadCustomPresets();
    const next = [preset, ...current.filter((p) => p.id !== preset.id)].slice(0, MAX_SAVED_PRESETS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // QuotaExceededError or private browsing
  }
}

export function removeCustomPreset(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = loadCustomPresets();
    const next = current.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // safe
  }
}
