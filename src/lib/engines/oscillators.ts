/**
 * Pure oscillator / moving-average helpers — no dependency on technical.ts
 * or divergence engine (breaks Turbopack circular import).
 */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null,
  );
  const macdVals = macdLine.map((v) => v ?? 0);
  const firstValid = macdLine.findIndex((v) => v != null);
  const signalFull = ema(macdVals.slice(Math.max(0, firstValid)), signalPeriod);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < signalFull.length; i++) {
    signal[i + Math.max(0, firstValid)] = signalFull[i];
  }
  const histogram = macdLine.map((m, i) =>
    m != null && signal[i] != null ? m - (signal[i] as number) : null,
  );
  return { macd: macdLine, signal, histogram };
}

/**
 * Stochastic oscillator.
 * Returns smoothed %K (SMA of raw %K over dPeriod) for pivot detection.
 */
export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): (number | null)[] {
  const n = closes.length;
  const rawK: (number | null)[] = new Array(n).fill(null);
  if (kPeriod <= 0 || n < kPeriod) return rawK;

  for (let i = kPeriod - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hi) hi = highs[j];
      if (lows[j] < lo) lo = lows[j];
    }
    const range = hi - lo;
    rawK[i] = range === 0 ? 50 : ((closes[i] - lo) / range) * 100;
  }

  if (dPeriod <= 1) return rawK;

  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rawK[i] == null) continue;
    if (i < kPeriod - 1 + dPeriod - 1) continue;
    let sum = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (rawK[j] != null) {
        sum += rawK[j] as number;
        count++;
      }
    }
    if (count === dPeriod) out[i] = sum / dPeriod;
  }
  return out;
}

/**
 * Full series Average True Range (Wilder smoothing).
 */
export function atrSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1 || period <= 0) return out;

  const trs: number[] = new Array(n).fill(0);
  trs[0] = highs[0]! - lows[0]!;
  for (let i = 1; i < n; i++) {
    const h = highs[i]!;
    const l = lows[i]!;
    const pc = closes[i - 1]!;
    trs[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i]!;
  out[period - 1] = sum / period;

  for (let i = period; i < n; i++) {
    out[i] = ((out[i - 1] as number) * (period - 1) + trs[i]!) / period;
  }
  return out;
}

/**
 * Average Directional Index (ADX) & Directional Movement (+DI / -DI).
 * Wilder's standard formulation.
 */
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): { adx: (number | null)[]; plusDi: (number | null)[]; minusDi: (number | null)[] } {
  const n = closes.length;
  const adxArr: (number | null)[] = new Array(n).fill(null);
  const plusDiArr: (number | null)[] = new Array(n).fill(null);
  const minusDiArr: (number | null)[] = new Array(n).fill(null);

  if (n < period * 2 || period <= 1) {
    return { adx: adxArr, plusDi: plusDiArr, minusDi: minusDiArr };
  }

  const tr: number[] = new Array(n).fill(0);
  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const h = highs[i]!;
    const l = lows[i]!;
    const ph = highs[i - 1]!;
    const pl = lows[i - 1]!;
    const pc = closes[i - 1]!;

    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph;
    const down = pl - l;

    if (up > down && up > 0) plusDm[i] = up;
    if (down > up && down > 0) minusDm[i] = down;
  }

  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i++) {
    smTr += tr[i]!;
    smPlus += plusDm[i]!;
    smMinus += minusDm[i]!;
  }

  const dx: (number | null)[] = new Array(n).fill(null);
  const calcDi = (idx: number, t: number, p: number, m: number) => {
    const pDi = t > 0 ? (p / t) * 100 : 0;
    const mDi = t > 0 ? (m / t) * 100 : 0;
    plusDiArr[idx] = pDi;
    minusDiArr[idx] = mDi;
    const sum = pDi + mDi;
    dx[idx] = sum > 0 ? (Math.abs(pDi - mDi) / sum) * 100 : 0;
  };

  calcDi(period, smTr, smPlus, smMinus);

  for (let i = period + 1; i < n; i++) {
    smTr = smTr - smTr / period + tr[i]!;
    smPlus = smPlus - smPlus / period + plusDm[i]!;
    smMinus = smMinus - smMinus / period + minusDm[i]!;
    calcDi(i, smTr, smPlus, smMinus);
  }

  // Smooth DX to get ADX
  let dxSum = 0;
  for (let i = period; i < period * 2; i++) {
    if (dx[i] != null) dxSum += dx[i] as number;
  }
  adxArr[period * 2 - 1] = dxSum / period;

  for (let i = period * 2; i < n; i++) {
    const prev = adxArr[i - 1];
    const curDx = dx[i];
    if (prev != null && curDx != null) {
      adxArr[i] = (prev * (period - 1) + curDx) / period;
    }
  }

  return { adx: adxArr, plusDi: plusDiArr, minusDi: minusDiArr };
}

/**
 * Keltner Channel (EMA midline +/- mult * ATR).
 */
export function keltner(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20,
  mult = 1.5,
): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const n = closes.length;
  const mid = ema(closes, period);
  const atrs = atrSeries(highs, lows, closes, period);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const m = mid[i];
    const a = atrs[i];
    if (m != null && a != null) {
      upper[i] = m + mult * a;
      lower[i] = m - mult * a;
    }
  }
  return { upper, mid, lower };
}

/**
 * TTM Squeeze — detect volatility compression inside Keltner Channel.
 */
export function ttmSqueeze(
  highs: number[],
  lows: number[],
  closes: number[],
  bbPeriod = 20,
  bbMult = 2,
  kcPeriod = 20,
  kcMult = 1.5,
): {
  squeezeOn: boolean[];
  momentum: (number | null)[];
  state: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear";
} {
  const n = closes.length;
  const kc = keltner(highs, lows, closes, kcPeriod, kcMult);
  const bbMid = sma(closes, bbPeriod);

  const squeezeOn: boolean[] = new Array(n).fill(false);
  const momentum: (number | null)[] = new Array(n).fill(null);

  const bbUpper: (number | null)[] = new Array(n).fill(null);
  const bbLower: (number | null)[] = new Array(n).fill(null);

  for (let i = bbPeriod - 1; i < n; i++) {
    const mid = bbMid[i];
    if (mid == null) continue;
    let sumSq = 0;
    for (let j = i - bbPeriod + 1; j <= i; j++) {
      const d = closes[j]! - mid;
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / bbPeriod);
    bbUpper[i] = mid + bbMult * sd;
    bbLower[i] = mid - bbMult * sd;
  }

  // Pre-calculate deltas for momentum linear regression
  const emaMid = ema(closes, kcPeriod);
  const deltas: (number | null)[] = new Array(n).fill(null);

  for (let i = kcPeriod - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kcPeriod + 1; j <= i; j++) {
      if (highs[j]! > hi) hi = highs[j]!;
      if (lows[j]! < lo) lo = lows[j]!;
    }
    const donchianMid = (hi + lo) / 2;
    const e = emaMid[i];
    if (e != null) {
      const mean = (donchianMid + e) / 2;
      deltas[i] = closes[i]! - mean;
    }

    // Check squeeze condition
    const bU = bbUpper[i];
    const bL = bbLower[i];
    const kU = kc.upper[i];
    const kL = kc.lower[i];
    if (bU != null && bL != null && kU != null && kL != null) {
      squeezeOn[i] = bU <= kU && bL >= kL;
    }
  }

  // Linear regression slope of deltas over kcPeriod
  const xMean = (kcPeriod - 1) / 2;
  let xVar = 0;
  for (let k = 0; k < kcPeriod; k++) xVar += (k - xMean) ** 2;

  for (let i = kcPeriod * 2 - 2; i < n; i++) {
    let ySum = 0;
    let xySum = 0;
    let valid = true;
    for (let k = 0; k < kcPeriod; k++) {
      const idx = i - kcPeriod + 1 + k;
      const val = deltas[idx];
      if (val == null) {
        valid = false;
        break;
      }
      ySum += val;
      xySum += k * val;
    }
    if (valid && xVar > 0) {
      const yMean = ySum / kcPeriod;
      const slope = (xySum - kcPeriod * xMean * yMean) / xVar;
      momentum[i] = slope;
    }
  }

  let state: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" = "squeeze_off";
  if (n > 1) {
    const isCurOn = squeezeOn[n - 1] ?? false;
    const isPrevOn = squeezeOn[n - 2] ?? false;
    const curMom = momentum[n - 1] ?? 0;

    if (isCurOn) {
      state = "squeeze_on";
    } else if (isPrevOn && !isCurOn) {
      state = curMom >= 0 ? "fired_bull" : "fired_bear";
    } else {
      state = "squeeze_off";
    }
  }

  return { squeezeOn, momentum, state };
}

/**
 * SuperTrend indicator (ATR-based dynamic trailing stop).
 */
export function superTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 10,
  mult = 3,
): { superTrend: (number | null)[]; direction: ("up" | "down" | null)[] } {
  const n = closes.length;
  const outVal: (number | null)[] = new Array(n).fill(null);
  const outDir: ("up" | "down" | null)[] = new Array(n).fill(null);

  const atrs = atrSeries(highs, lows, closes, period);
  if (n < period + 1) return { superTrend: outVal, direction: outDir };

  let finalUpper = 0;
  let finalLower = 0;
  let dir: "up" | "down" = "up";

  for (let i = period - 1; i < n; i++) {
    const atr = atrs[i];
    if (atr == null) continue;

    const hl2 = (highs[i]! + lows[i]!) / 2;
    const basicUpper = hl2 + mult * atr;
    const basicLower = hl2 - mult * atr;

    if (i === period - 1) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      dir = closes[i]! >= hl2 ? "up" : "down";
    } else {
      const prevClose = closes[i - 1]!;
      finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

      if (dir === "up") {
        if (closes[i]! < finalLower) {
          dir = "down";
        }
      } else {
        if (closes[i]! > finalUpper) {
          dir = "up";
        }
      }
    }

    outDir[i] = dir;
    outVal[i] = dir === "up" ? finalLower : finalUpper;
  }

  return { superTrend: outVal, direction: outDir };
}
