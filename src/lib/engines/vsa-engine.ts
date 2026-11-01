import type { OhlcvBar } from "../types";

/**
 * Volume Spread Analysis (VSA) Engine
 * Chuẩn hóa theo Tom Williams ("Master the Markets") & Filter 6 - VSA bar chart (All in one).afl
 */

export type VsaSignalCode =
  | "NO_SUPPLY"
  | "NO_DEMAND"
  | "STOPPING_VOLUME"
  | "SHAKEOUT"
  | "UPTHRUST"
  | "EFFORT_TO_RISE"
  | "EFFORT_TO_RISE_FAILED"
  | "ABSORPTION";

export interface VsaBarSignal {
  index: number;
  time: number;
  code: VsaSignalCode;
  nameVi: string;
  nature: "BULLISH" | "BEARISH" | "NEUTRAL";
  spreadType: "WIDE" | "NARROW" | "AVERAGE";
  volumeType: "ULTRA_HIGH" | "HIGH" | "LOW" | "AVERAGE";
  closePosition: "UPPER" | "MIDDLE" | "LOWER";
  descriptionVi: string;
}

export interface VsaAnalysisResult {
  latestSignal: VsaBarSignal | null;
  recentSignals: VsaBarSignal[];
  summaryVi: string;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function detectSingleVsaBar(
  bars: OhlcvBar[],
  idx: number,
  volAvg: number,
  avgSpread: number,
): VsaBarSignal | null {
  if (idx < 1 || idx >= bars.length) return null;

  const b = bars[idx]!;
  const prev = bars[idx - 1]!;
  const spread = Math.max(0.001, b.high - b.low);
  const prevSpread = Math.max(0.001, prev.high - prev.low);
  const closePos = (b.close - b.low) / spread;
  const vol = b.volume || 0;

  const closePosition: VsaBarSignal["closePosition"] =
    closePos >= 0.65 ? "UPPER" : closePos <= 0.35 ? "LOWER" : "MIDDLE";

  const isWideSpread = spread >= 1.25 * avgSpread;
  const isNarrowSpread = spread <= 0.8 * avgSpread;
  const spreadType: VsaBarSignal["spreadType"] = isWideSpread
    ? "WIDE"
    : isNarrowSpread
      ? "NARROW"
      : "AVERAGE";

  const isUltraVol = vol >= 1.8 * volAvg;
  const isHighVol = vol >= 1.25 * volAvg;
  const isLowVol = vol <= 0.8 * volAvg;
  const volumeType: VsaBarSignal["volumeType"] = isUltraVol
    ? "ULTRA_HIGH"
    : isHighVol
      ? "HIGH"
      : isLowVol
        ? "LOW"
        : "AVERAGE";

  const isUpBar = b.close >= prev.close;
  const isDownBar = b.close <= prev.close;

  // 1. SHAKEOUT / REVERSE UPTHRUST (Rũ bỏ gom hàng)
  if (b.low < prev.low && closePos >= 0.65 && isWideSpread && (isHighVol || isUltraVol)) {
    return {
      index: idx,
      time: b.time,
      code: "SHAKEOUT",
      nameVi: "Shakeout (Rũ bỏ gom hàng)",
      nature: "BULLISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Đâm thủng đáy trước rũ bỏ cá nhân rồi kéo ngược đóng cửa cao nhất phiên kèm volume lớn.",
    };
  }

  // 2. UPTHRUST (Bẫy giá vượt đỉnh thất bại)
  if (b.high > prev.high && closePos <= 0.35 && isWideSpread && (isHighVol || isUltraVol)) {
    return {
      index: idx,
      time: b.time,
      code: "UPTHRUST",
      nameVi: "Upthrust Bar (Bẫy vượt đỉnh)",
      nature: "BEARISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Vượt đỉnh trước nhưng bị áp lực bán dội ngược đóng cửa thấp nhất phiên kèm khối lượng cao.",
    };
  }

  // 3. STOPPING VOLUME (Khối lượng chặn đà rơi)
  let lowest5 = b.low;
  for (let k = Math.max(0, idx - 5); k < idx; k++) {
    if (bars[k]!.low < lowest5) lowest5 = bars[k]!.low;
  }
  if (b.low <= lowest5 && closePos >= 0.4 && (isHighVol || isUltraVol) && prev.close < prev.open) {
    return {
      index: idx,
      time: b.time,
      code: "STOPPING_VOLUME",
      nameVi: "Stopping Volume (Chặn đà rơi)",
      nature: "BULLISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Lực cầu của Smart Money bắt đáy hấp thụ toàn bộ lực bán tháo hoảng loạn tại vùng đáy.",
    };
  }

  // 4. NO SUPPLY BAR (Nến cạn cung)
  if (isDownBar && isNarrowSpread && isLowVol && closePos >= 0.4) {
    return {
      index: idx,
      time: b.time,
      code: "NO_SUPPLY",
      nameVi: "No Supply (Cạn cung)",
      nature: "BULLISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Nến giảm biên độ hẹp kèm khối lượng cạn kiệt. Nguồn cung bán tháo đã cạn, sẵn sàng tăng.",
    };
  }

  // 5. NO DEMAND BAR (Nến cạn cầu)
  if (isUpBar && isNarrowSpread && isLowVol && closePos <= 0.6) {
    return {
      index: idx,
      time: b.time,
      code: "NO_DEMAND",
      nameVi: "No Demand (Cạn cầu)",
      nature: "BEARISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Nến tăng biên độ hẹp với khối lượng thấp dưới trung bình. Thiếu vắng lực cầu mua lên, dễ suy yếu.",
    };
  }

  // 6. ABSORPTION / DEMAND OVERCOMING SUPPLY (Hấp thụ cung)
  if (isDownBar && isHighVol && spread < prevSpread * 0.85 && closePos >= 0.35) {
    return {
      index: idx,
      time: b.time,
      code: "ABSORPTION",
      nameVi: "Absorption (Hấp thụ cung)",
      nature: "BULLISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Khối lượng cao nhưng biên độ nến co hẹp lại, chứng tỏ lực cầu tổ chức đang âm thầm hấp thụ hết lực bán.",
    };
  }

  // 7. EFFORT VS RESULT FAILED (Nỗ lực tăng không đạt kết quả)
  if ((isHighVol || isUltraVol) && (b.high - b.close) >= 0.45 * spread && b.close <= (b.high + b.low) / 2) {
    return {
      index: idx,
      time: b.time,
      code: "EFFORT_TO_RISE_FAILED",
      nameVi: "Effort Failed (Nỗ lực thất bại)",
      nature: "BEARISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Khối lượng bùng nổ nhưng giá rụt râu đóng ở nửa dưới. Lực bán lớn tiềm ẩn đã chặn đứng đà tăng.",
    };
  }

  // 8. EFFORT TO RISE (Nỗ lực tăng giá thành công)
  if (isUpBar && isWideSpread && closePos >= 0.7 && isHighVol) {
    return {
      index: idx,
      time: b.time,
      code: "EFFORT_TO_RISE",
      nameVi: "Effort to Rise (Nỗ lực tăng giá)",
      nature: "BULLISH",
      spreadType,
      volumeType,
      closePosition,
      descriptionVi: "Nỗ lực mua quyết liệt và đóng cửa ở mức cao nhất phiên kèm thanh khoản lớn.",
    };
  }

  return null;
}

export function analyzeVsaBars(bars: OhlcvBar[]): VsaAnalysisResult {
  const n = bars.length;
  if (n < 20) {
    return { latestSignal: null, recentSignals: [], summaryVi: "Chưa đủ 20 nến để phân tích VSA." };
  }

  const volMaLen = Math.min(20, n);
  const volAvg = avg(bars.slice(-volMaLen).map((b) => b.volume || 0)) || 1;
  const avgSpread = avg(bars.slice(-volMaLen).map((b) => b.high - b.low)) || 0.1;

  const recentSignals: VsaBarSignal[] = [];
  const lookback = Math.min(25, n);

  for (let i = n - lookback; i < n; i++) {
    const sig = detectSingleVsaBar(bars, i, volAvg, avgSpread);
    if (sig) {
      recentSignals.push(sig);
    }
  }

  const latestSignal = recentSignals[recentSignals.length - 1] ?? null;

  let summaryVi = "Dao động nến VSA ở mức cân bằng, chưa có tín hiệu đặc biệt.";
  if (latestSignal) {
    if (latestSignal.nature === "BULLISH") {
      summaryVi = `Xuất hiện ${latestSignal.nameVi}: ${latestSignal.descriptionVi}`;
    } else if (latestSignal.nature === "BEARISH") {
      summaryVi = `Cảnh báo ${latestSignal.nameVi}: ${latestSignal.descriptionVi}`;
    }
  }

  return {
    latestSignal,
    recentSignals,
    summaryVi,
  };
}
