/**
 * Volume Surge Detection & Institutional Activity Classifier.
 * Identifies abnormal volume surges using Z-Score and historical moving averages.
 * Ported from lotusmarket (Go/Python signals).
 */

export interface VolumeSurge {
  ticker: string;
  currentVol: number;
  avgVol20: number;
  stddevVol20?: number;
  ratio: number;
  zScore?: number;
  priceChange: number;
  signal: "accumulation" | "distribution" | "high_activity" | "";
  intensity: "surge" | "strong_surge" | "";
  labelVi: string;
  isBullish: boolean;
}

export function classifyVolumeSurgeLabel(signal: string, intensity: string): string {
  if (signal === "accumulation" && intensity === "strong_surge") return "Tiền đổ vào mạnh";
  if (signal === "accumulation" && intensity === "surge") return "Tiền đang đổ vào";
  if (signal === "distribution" && intensity === "strong_surge") return "Bán tháo mạnh";
  if (signal === "distribution" && intensity === "surge") return "Đang bán tháo";
  if (signal === "high_activity") return "Giao dịch đột biến";
  return "";
}

export function classifyVolumeSurge(params: {
  ticker?: string;
  currentVol: number;
  avgVol20: number;
  stddevVol20?: number;
  priceChange: number;
}): VolumeSurge {
  const { currentVol, avgVol20, stddevVol20 = 0, priceChange, ticker = "" } = params;

  const res: VolumeSurge = {
    ticker,
    currentVol,
    avgVol20,
    stddevVol20,
    ratio: avgVol20 > 0 ? Number((currentVol / avgVol20).toFixed(2)) : 1.0,
    priceChange,
    signal: "",
    intensity: "",
    labelVi: "",
    isBullish: priceChange >= 0.5,
  };

  if (avgVol20 <= 0) return res;

  if (stddevVol20 > 0) {
    res.zScore = Number(((currentVol - avgVol20) / stddevVol20).toFixed(2));
    if (res.zScore < 2.0) return res;
    res.intensity = res.zScore >= 3.0 ? "strong_surge" : "surge";
  } else {
    if (res.ratio < 2.0) return res;
    res.intensity = res.ratio >= 3.0 ? "strong_surge" : "surge";
  }

  if (priceChange >= 0.5) {
    res.signal = "accumulation";
  } else if (priceChange <= -0.5) {
    res.signal = "distribution";
  } else {
    res.signal = "high_activity";
  }

  res.labelVi = classifyVolumeSurgeLabel(res.signal, res.intensity);
  return res;
}
