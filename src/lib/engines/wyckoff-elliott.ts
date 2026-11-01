import type { OhlcvBar } from "../types";

/** Deterministic Wyckoff + Elliott heuristics from OHLCV. Research only. */

export type WyckoffPhase =
  | "accumulation"
  | "markup"
  | "distribution"
  | "markdown"
  | "re-accumulation"
  | "re-distribution"
  | "unknown";

export type WyckoffSubPhase = "A" | "B" | "C" | "D" | "E" | null;

export type WyckoffTransitionStatus =
  | "PHASE_A_STOPPING"
  | "PHASE_B_BUILDING"
  | "PHASE_C_TESTING"
  | "PHASE_C_VERIFIED"
  | "PHASE_D_LPS"
  | "PHASE_D_SOS"
  | "PHASE_E_MARKUP"
  | "PHASE_E_MARKDOWN"
  | "NEUTRAL";

export type ElliottPattern =
  | "impulse-up"
  | "impulse-down"
  | "corrective-abc-up"
  | "corrective-abc-down"
  | "diagonal"
  | "unclear";

export interface StructurePivot {
  time: number;
  price: number;
  kind: "H" | "L";
  index: number;
}

export interface WyckoffSnapshot {
  phase: WyckoffPhase;
  phaseVi: string;
  subPhase: WyckoffSubPhase;
  confidence: number;
  bias: "bullish" | "bearish" | "neutral";
  events: string[];
  eventCodes: string[];
  volumeTrend: "rising" | "falling" | "flat";
  range: { high: number; low: number } | null;
  notes: string[];
  transitionStatus?: WyckoffTransitionStatus;
  transitionVi?: string;
  springTested?: boolean;
  lpsConfirmed?: boolean;
  phaseAgeBars?: number;
  creekLevel?: number | null;
  iceLevel?: number | null;
  testVolumeRatio?: number | null;
  // v2 additions (Wyckoff VSA Master fields)
  trModel?: "Base" | "Top" | null;       // auto Base Accumulation vs Top Distribution
  channelPosPct?: number | null;         // % vị trí giá trong kênh Ice-Creek (0-100)
  causeWeeks?: number | null;            // số tuần tích lũy (Cause & Effect)
  target1?: number | null;              // mục tiêu 1 (Creek + 0.5× height)
  target2?: number | null;              // mục tiêu 2 (theo CauseWeeks)
  stopLoss?: number | null;             // cắt lỗ dưới Ice
  vsaTag?: "ultra-high" | "high" | "low" | "normal";  // VSA volume classification
}

export interface ElliottSnapshot {
  pattern: ElliottPattern;
  patternVi: string;
  degree: "minor" | "intermediate";
  confidence: number;
  bias: "bullish" | "bearish" | "neutral";
  waves: { label: string; price: number; time: number }[];
  invalidation: number | null;
  nextTarget: number | null;
  notes: string[];
}

export interface StructureAnalysis {
  wyckoff: WyckoffSnapshot;
  elliott: ElliottSnapshot;
  pivots: StructurePivot[];
  summary: string;
}

const PHASE_VI: Record<WyckoffPhase, string> = {
  accumulation: "Tích lũy (Accumulation)",
  markup: "Mark-up (Xu hướng tăng)",
  distribution: "Phân phối (Distribution)",
  markdown: "Mark-down (Xu hướng giảm)",
  "re-accumulation": "Tái tích lũy",
  "re-distribution": "Tái phân phối",
  unknown: "Chưa xác định",
};

const ELLIOTT_VI: Record<ElliottPattern, string> = {
  "impulse-up": "Xung lực tăng (1-2-3-4-5)",
  "impulse-down": "Xung lực giảm (1-2-3-4-5)",
  "corrective-abc-up": "Điều chỉnh ABC tăng",
  "corrective-abc-down": "Điều chỉnh ABC giảm",
  diagonal: "Nêm chéo (Diagonal)",
  unclear: "Cấu trúc chưa rõ",
};

function avg(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmtNum(n: number, d = 1): string {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

export function findPivots(bars: OhlcvBar[], w = 3): StructurePivot[] {
  const out: StructurePivot[] = [];
  if (bars.length < w * 2 + 3) return out;
  for (let i = w; i < bars.length - w; i++) {
    const b = bars[i]!;
    let isH = true;
    let isL = true;
    for (let j = 1; j <= w; j++) {
      if (bars[i - j]!.high >= b.high || bars[i + j]!.high >= b.high) isH = false;
      if (bars[i - j]!.low <= b.low || bars[i + j]!.low <= b.low) isL = false;
    }
    if (isH) out.push({ time: b.time, price: b.high, kind: "H", index: i });
    if (isL) out.push({ time: b.time, price: b.low, kind: "L", index: i });
  }
  return out;
}

function volumeTrend(bars: OhlcvBar[]): "rising" | "falling" | "flat" {
  if (bars.length < 20) return "flat";
  const mid = Math.floor(bars.length / 2);
  const a = avg(bars.slice(0, mid).map((b) => b.volume || 0));
  const b = avg(bars.slice(mid).map((x) => x.volume || 0));
  if (a <= 0) return "flat";
  if (b / a > 1.15) return "rising";
  if (b / a < 0.85) return "falling";
  return "flat";
}

function emptySnap(notes: string[]): WyckoffSnapshot {
  return {
    phase: "unknown",
    phaseVi: PHASE_VI.unknown,
    subPhase: null,
    confidence: 0,
    bias: "neutral",
    events: [],
    eventCodes: [],
    volumeTrend: "flat",
    range: null,
    notes,
    transitionStatus: "NEUTRAL",
    transitionVi: "Chưa xác định",
    trModel: null,
    channelPosPct: null,
    causeWeeks: null,
    target1: null,
    target2: null,
    stopLoss: null,
    vsaTag: "normal",
  };
}

export function analyzeWyckoff(bars: OhlcvBar[]): WyckoffSnapshot {
  const events: string[] = [];
  const eventCodes: string[] = [];
  const notes: string[] = [];
  if (bars.length < 30) {
    return emptySnap(["Cần ≥30 nến để đọc cấu trúc Wyckoff"]);
  }

  const n = bars.length;
  const lastBar = bars[n - 1]!;
  const prevBar = bars[n - 2] ?? lastBar;
  const curClose = lastBar.close;

  // 1. PHÂN TÍCH VOLUME VSA & BIÊN ĐỘ NẾN (SPREAD)
  const volWindow = Math.min(20, n);
  const volMa20 = avg(bars.slice(-volWindow).map((b) => b.volume || 0)) || 1;
  const lastVol = lastBar.volume || 0;
  const isUltraVol = lastVol >= 1.8 * volMa20;
  const isHighVol = lastVol >= 1.25 * volMa20 && !isUltraVol;
  const isLowVol = lastVol <= 0.75 * volMa20;
  const vsaTag: WyckoffSnapshot["vsaTag"] = isUltraVol
    ? "ultra-high"
    : isHighVol
      ? "high"
      : isLowVol
        ? "low"
        : "normal";

  // 2. QUÉT SWING HIGHS / SWING LOWS
  const swWin = n >= 90 ? 4 : 3;
  const isSwLow: boolean[] = new Array(n).fill(false);
  const isSwHigh: boolean[] = new Array(n).fill(false);

  for (let i = swWin; i < n - swWin; i++) {
    let isMin = true;
    let isMax = true;
    const curLow = bars[i]!.low;
    const curHigh = bars[i]!.high;
    for (let k = i - swWin; k <= i + swWin; k++) {
      if (bars[k]!.low < curLow) isMin = false;
      if (bars[k]!.high > curHigh) isMax = false;
    }
    if (isMin) isSwLow[i] = true;
    if (isMax) isSwHigh[i] = true;
  }

  // 3. ĐỊNH VỊ CẤU TRÚC VĨ MÔ: ĐÁY CHU KỲ (SC) vs ĐỈNH PHÂN PHỐI (TOP TR)
  // Quét tìm đáy chu kỳ (SC candidate) trong khoảng đầu/giữa dữ liệu
  const scanLimitSC = Math.min(n - swWin, Math.floor(n * 0.65));
  let scCandidateIdx = 0;
  let scCandidatePrice = Infinity;

  for (let i = swWin; i <= scanLimitSC; i++) {
    if (isSwLow[i] && bars[i]!.low < scCandidatePrice) {
      scCandidatePrice = bars[i]!.low;
      scCandidateIdx = i;
    }
  }
  if (!Number.isFinite(scCandidatePrice)) {
    for (let i = 0; i <= scanLimitSC; i++) {
      if (bars[i]!.low < scCandidatePrice) {
        scCandidatePrice = bars[i]!.low;
        scCandidateIdx = i;
      }
    }
  }

  // Tìm đỉnh cao nhất sau đáy chu kỳ:
  let postScHighIdx = scCandidateIdx;
  let postScHigh = -Infinity;
  for (let i = scCandidateIdx; i < n; i++) {
    if (bars[i]!.high > postScHigh) {
      postScHigh = bars[i]!.high;
      postScHighIdx = i;
    }
  }

  const gainFromSc = (postScHigh - scCandidatePrice) / Math.max(0.01, scCandidatePrice);
  const barsSincePeak = n - 1 - postScHighIdx;

  // Tiêu chuẩn Wyckoff phân biệt Base Accumulation vs Top Distribution:
  // Cổ phiếu tăng mạnh từ đáy (>= 75%), đã qua đỉnh >= 20 phiên,
  // và thị giá hiện tại vẫn neo giữ được >= 50% nhịp tăng trước đó -> Top Distribution/Re-accumulation.
  const isTopDist =
    gainFromSc >= 0.75 &&
    barsSincePeak >= 20 &&
    curClose >= scCandidatePrice + (postScHigh - scCandidatePrice) * 0.5;

  const trModel: "Base" | "Top" = isTopDist ? "Top" : "Base";

  // 4. XÂY DỰNG KÊNH GIÁ THOẢI ICE & CREEK VÀ NHẬN DIỆN SỰ KIỆN
  let trStartIdx = 0;
  let scIdx = 0;
  let scPrice = 0;
  let bcIdx = 0;
  let bcPrice = 0;
  let arIdx = 0;
  let arPrice = 0;
  let stIdx = 0;
  let stPrice = 0;
  let springIdx = 0;
  let springIsBreak = false;
  let utIdx = 0;
  let sosIdx = 0;
  let sowIdx = 0;
  let bestSlope = 0;

  if (isTopDist) {
    // === TOP DISTRIBUTION / TOP TR ===
    trStartIdx = postScHighIdx;
    bcIdx = postScHighIdx;
    bcPrice = bars[bcIdx]!.high;

    // Tìm Automatic Reaction (AR): Đáy rơi tự động sau BC
    arIdx = Math.min(n - 1, bcIdx + 1);
    arPrice = Infinity;
    const arLimit = Math.min(n - 1, bcIdx + 45);
    for (let i = bcIdx + 1; i <= arLimit; i++) {
      if (isSwLow[i] && bars[i]!.low < arPrice) {
        arPrice = bars[i]!.low;
        arIdx = i;
      }
    }
    if (!Number.isFinite(arPrice)) {
      for (let i = bcIdx + 1; i <= arLimit; i++) {
        if (bars[i]!.low < arPrice) {
          arPrice = bars[i]!.low;
          arIdx = i;
        }
      }
    }

    // Secondary Test (ST Phase A)
    const stLimit = Math.min(n - 1, arIdx + 40);
    stIdx = 0;
    stPrice = -Infinity;
    for (let i = arIdx + 1; i <= stLimit; i++) {
      if (isSwHigh[i] && bars[i]!.high > stPrice) {
        stPrice = bars[i]!.high;
        stIdx = i;
      }
    }
    if (stIdx === 0) {
      stIdx = Math.min(n - 1, arIdx + 5);
      stPrice = bars[stIdx]!.high;
    }

    // UT / UTAD detection (Phân phối)
    for (let i = stIdx + 1; i < n; i++) {
      if (bars[i]!.high >= bcPrice * 0.98) {
        const spread = Math.max(0.01, bars[i]!.high - bars[i]!.low);
        const rejected = bars[i]!.close <= bcPrice * 1.01 || (bars[i]!.high - bars[i]!.close) >= 0.25 * spread;
        if (rejected) utIdx = i;
      }
      if (bars[i]!.close < arPrice * 0.985 && (bars[i]!.volume || 0) >= 1.25 * volMa20) {
        sowIdx = i;
      }
    }
  } else {
    // === BASE ACCUMULATION TR ===
    trStartIdx = scCandidateIdx;
    scIdx = scCandidateIdx;
    scPrice = bars[scIdx]!.low;

    // Automatic Rally (AR): Đỉnh hồi phục đầu tiên sau SC
    arIdx = Math.min(n - 1, scIdx + 1);
    arPrice = -Infinity;
    const arLimit = Math.min(n - 1, scIdx + 45);
    for (let i = scIdx + 1; i <= arLimit; i++) {
      if (isSwHigh[i] && bars[i]!.high > arPrice) {
        arPrice = bars[i]!.high;
        arIdx = i;
      }
    }
    if (!Number.isFinite(arPrice)) {
      for (let i = scIdx + 1; i <= arLimit; i++) {
        if (bars[i]!.high > arPrice) {
          arPrice = bars[i]!.high;
          arIdx = i;
        }
      }
    }

    // Secondary Test (ST Phase A)
    const stLimit = Math.min(n - 1, arIdx + 40);
    stIdx = 0;
    stPrice = Infinity;
    for (let i = arIdx + 1; i <= stLimit; i++) {
      if (isSwLow[i]) {
        stIdx = i;
        stPrice = bars[i]!.low;
        break;
      }
    }
    if (stIdx === 0) {
      stIdx = Math.min(n - 1, arIdx + 5);
      stPrice = bars[stIdx]!.low;
    }

    // Best gentle slope cho kênh tích lũy
    let maxScore = -1e9;
    for (let idx = scIdx + 1; idx <= n - 3; idx++) {
      if (isSwLow[idx]) {
        const candSlope = (bars[idx]!.low - scPrice) / Math.max(1, idx - scIdx);
        if (candSlope >= -0.003 && candSlope <= 0.008) {
          let score = 0;
          for (let k = scIdx; k < n; k++) {
            const testSup = scPrice + candSlope * (k - scIdx);
            if (bars[k]!.close >= testSup * 0.96) score++;
          }
          if (score > maxScore) {
            maxScore = score;
            bestSlope = candSlope;
          }
        }
      }
    }
  }

  // Tính Ice (Support) & Creek (Resistance) tại thanh nến hiện tại
  let curSup: number;
  let curRes: number;

  if (isTopDist) {
    curRes = bcPrice;
    curSup = arPrice;
  } else {
    curSup = scPrice + bestSlope * (n - 1 - scIdx);
    curRes = arPrice + bestSlope * (n - 1 - arIdx);
  }

  if (curRes <= curSup) {
    curRes = curSup * 1.15;
  }

  const channelHeight = Math.max(0.1, curRes - curSup);
  const channelPosPct = Math.min(150, Math.max(-50, Math.round(((curClose - curSup) / channelHeight) * 100)));

  // 5. NHẬN DIỆN CÁC SỰ KIỆN WYCKOFF NÂNG CAO (SPRING, LPS, SOS, UTAD, SOW)
  let springTested = false;
  let testVolumeRatio: number | null = null;
  let lpsConfirmed = false;

  const recentWindow = Math.min(25, n - trStartIdx);
  const recent = bars.slice(-recentWindow);
  const recentLow = Math.min(...recent.map((b) => b.low));
  const recentLowBar = recent.reduce((a, b) => (b.low <= a.low ? b : a), recent[0]!);
  const recentHigh = Math.max(...recent.map((b) => b.high));

  // Base Accumulation Events
  let spring = false;
  let sos = false;

  if (!isTopDist) {
    // Spring: Thủng sàn Ice (Low < Support * 0.99) rồi nhanh chóng kéo ngược đóng trong TR
    if (recentLow < curSup * 0.995 && curClose >= curSup * 0.99) {
      spring = true;
      springIdx = bars.indexOf(recentLowBar);
      springIsBreak = true;
    }

    // Spring Test verification:
    if (spring) {
      const lowIdxInRecent = recent.indexOf(recentLowBar);
      if (lowIdxInRecent >= 0 && lowIdxInRecent < recent.length - 1) {
        const subSeq = recent.slice(lowIdxInRecent + 1);
        const lowVol = recentLowBar.volume || 1;
        for (const sb of subSeq) {
          const distToLow = Math.abs(sb.low - recentLowBar.low) / Math.max(recentLowBar.low, 1e-9);
          const sbVol = sb.volume || 0;
          if (distToLow <= 0.03 && sbVol <= lowVol * 0.9 && sb.close >= sb.open) {
            springTested = true;
            testVolumeRatio = Number((sbVol / lowVol).toFixed(2));
            break;
          }
        }
      }
    }

    // LPS (Last Point of Support trong Phase D):
    // Giá giữ vững ở nửa trên biên tích lũy (>= 45%), vol cạn kiệt, tạo nền phẳng trước khi nổ
    if (channelPosPct >= 45 && channelPosPct <= 95) {
      const last5 = bars.slice(-5);
      const minLast5 = Math.min(...last5.map((b) => b.low));
      const avgVol5 = avg(last5.map((b) => b.volume || 0));
      if (minLast5 >= (curSup + curRes) / 2 * 0.98 && avgVol5 <= volMa20 * 1.1) {
        lpsConfirmed = true;
      }
    }

    // SOS (Sign of Strength / Jump Across Creek):
    // Giá vượt Creek hoặc tiệm cận với nến tăng kèm khối lượng lớn
    if (curClose > curRes || (lastBar.high >= curRes * 0.97 && (lastVol >= 1.25 * volMa20 || isUltraVol) && curClose >= lastBar.open)) {
      sos = true;
      sosIdx = n - 1;
    }
  }

  // Top Distribution Events
  let utad = false;
  let sow = false;

  if (isTopDist) {
    if (recentHigh > curRes * 0.99 && curClose < curRes * 1.01) {
      utad = true;
      utIdx = n - 1;
    }
    if (curClose < curSup * 0.99 || (sowIdx > 0 && curClose <= curSup * 1.02)) {
      sow = true;
    }
  }

  // 6. GẮN NHÃN SỰ KIỆN VÀ MÃ CODES
  if (isTopDist) {
    if (bcIdx > 0) {
      eventCodes.push("BC");
      events.push(`BC — Mua cao trào phân phối đỉnh (${fmtNum(bcPrice, 1)})`);
    }
    if (arIdx > 0) {
      eventCodes.push("AR");
      events.push(`AR — Nhịp rơi tự động kiểm định sàn Ice (${fmtNum(arPrice, 1)})`);
    }
    if (utad) {
      eventCodes.push("UTAD");
      events.push("UTAD — Bẫy giá vượt đỉnh cản vùng phân phối");
    }
    if (sow) {
      eventCodes.push("SOW");
      events.push("SOW — Thủng sàn hỗ trợ Ice kèm thanh khoản suy yếu");
    }
  } else {
    if (scIdx > 0) {
      eventCodes.push("SC");
      events.push(`SC — Bán tháo cao trào đáy chu kỳ (${fmtNum(scPrice, 1)})`);
    }
    if (arIdx > 0) {
      eventCodes.push("AR");
      events.push(`AR — Sóng hồi phục tự động lập trần Creek (${fmtNum(arPrice, 1)})`);
    }
    if (springTested) {
      eventCodes.push("SPRING_TESTED");
      events.push(`Spring Tested — Rũ bỏ đã test cạn cung (${testVolumeRatio ?? 0.7}x vol đáy)`);
    } else if (spring) {
      eventCodes.push("SPRING");
      events.push(`Spring — Rũ bỏ thủng sàn Ice rồi rút chân hồi phục`);
    }
    if (lpsConfirmed && !sos) {
      eventCodes.push("LPS");
      events.push("LPS — Điểm tựa cuối giữ vững trên nửa trên TR, vol cạn");
    }
    if (sos) {
      eventCodes.push("SOS");
      events.push(`SOS / JAC — Bứt phá trần Creek (${fmtNum(curRes, 1)}) kèm dòng tiền`);
    }
  }

  // 7. XÁC ĐỊNH GIAI ĐOẠN WYCKOFF (PHASES A -> E)
  let phase: WyckoffPhase = "unknown";
  let subPhase: WyckoffSubPhase = null;
  let bias: WyckoffSnapshot["bias"] = "neutral";
  let transitionStatus: WyckoffTransitionStatus = "NEUTRAL";
  let transitionVi = "Chưa xác định";
  let confidence = 45;

  if (isTopDist) {
    if (sow && curClose < curSup) {
      phase = "markdown";
      subPhase = "E";
      bias = "bearish";
      transitionStatus = "PHASE_E_MARKDOWN";
      transitionVi = "Pha E: Markdown — Rơi tự do sau khi gãy Ice";
      notes.push("Phân phối đỉnh hoàn tất, chuyển sang sóng giảm Markdown");
      confidence = 78;
    } else if (sow) {
      phase = "distribution";
      subPhase = "D";
      bias = "bearish";
      transitionStatus = "PHASE_D_SOS";
      transitionVi = "Pha D: SOW — Thủng hỗ trợ kiểm định xu hướng giảm";
      notes.push("Xuất hiện dấu hiệu suy yếu SOW gần sàn Ice");
      confidence = 74;
    } else if (utad) {
      phase = "distribution";
      subPhase = "C";
      bias = "bearish";
      transitionStatus = "PHASE_C_TESTING";
      transitionVi = "Pha C: UTAD — Bẫy vượt đỉnh gom xả cuối cùng";
      notes.push("Bẫy cầu UTAD kiểm định lượng cầu đỉnh");
      confidence = 72;
    } else if (n - 1 <= stIdx + 12) {
      phase = "distribution";
      subPhase = "A";
      bias = "bearish";
      transitionStatus = "PHASE_A_STOPPING";
      transitionVi = "Pha A: BC/AR — Chặn đứng đà tăng nóng";
      notes.push("Phase A — Tạo đỉnh cao trào BC và hồi phục AR");
      confidence = 58;
    } else {
      phase = "distribution";
      subPhase = "B";
      bias = "neutral";
      transitionStatus = "PHASE_B_BUILDING";
      transitionVi = "Pha B: Giằng co phân phối đỉnh / tái tích lũy";
      notes.push("Phase B — Dao động giằng co trong biên độ đỉnh");
      confidence = 52;
    }
  } else {
    // Base Accumulation
    if (curClose > curRes * 1.01) {
      phase = "markup";
      subPhase = "E";
      bias = "bullish";
      transitionStatus = "PHASE_E_MARKUP";
      transitionVi = "Pha E: Markup — Đại sóng tăng giá bứt phá Kênh TR";
      notes.push("Thoát khỏi Trading Range, bước vào chu kỳ tăng trưởng Mark-up");
      confidence = 82;
    } else if (sos) {
      phase = "accumulation";
      subPhase = "D";
      bias = "bullish";
      transitionStatus = "PHASE_D_SOS";
      transitionVi = "Pha D: SOS — Bứt phá vượt trần Creek kèm khối lượng lớn";
      notes.push("Dòng tiền lớn bứt phá Creek, chuẩn bị vào Pha E");
      confidence = 78;
    } else if (lpsConfirmed) {
      phase = "accumulation";
      subPhase = "D";
      bias = "bullish";
      transitionStatus = "PHASE_D_LPS";
      transitionVi = "Pha D: LPS — Điểm tựa cuối kiểm định hỗ trợ thành công";
      notes.push("Điểm vào lệnh tối ưu LPS trước thềm bứt phá");
      confidence = 75;
    } else if (springTested) {
      phase = "accumulation";
      subPhase = "C";
      bias = "bullish";
      transitionStatus = "PHASE_C_VERIFIED";
      transitionVi = "Pha C: Spring Tested — Kiểm định cạn cung hoàn tất";
      notes.push("Rũ bỏ cạn cung thành công, xác nhận chân sóng");
      confidence = 80;
    } else if (spring) {
      phase = "accumulation";
      subPhase = "C";
      bias = "bullish";
      transitionStatus = "PHASE_C_TESTING";
      transitionVi = "Pha C: Spring — Rũ bỏ thủng sàn Ice, đang chờ Test";
      notes.push("Xuất hiện rũ bỏ rũ hàng, theo dõi nhịp test cạn vol");
      confidence = 70;
    } else if (n - 1 <= stIdx + 12) {
      phase = "accumulation";
      subPhase = "A";
      bias = "neutral";
      transitionStatus = "PHASE_A_STOPPING";
      transitionVi = "Pha A: SC/AR — Chặn đà rơi hoảng loạn";
      notes.push("Phase A — Tạo đáy cao trào SC và hồi phục AR");
      confidence = 58;
    } else {
      phase = "accumulation";
      subPhase = "B";
      bias = "neutral";
      transitionStatus = "PHASE_B_BUILDING";
      transitionVi = "Pha B: Gom hàng xây nguyên nhân (Cause)";
      notes.push("Phase B — Smart money âm thầm hấp thụ nguồn cung");
      confidence = 52;
    }
  }

  // 8. TÍNH TOÁN QUẢN TRỊ RỦI RO, CAUSE & EFFECT (R:R)
  const barsInRange = Math.max(10, n - 1 - trStartIdx);
  const causeWeeks = Math.max(1, Math.round(barsInRange / 5));

  // StopLoss theo AFL:
  const recentCandleLow = Math.min(lastBar.low, prevBar.low);
  let stopLossVal = recentCandleLow * 0.985;
  if (stopLossVal >= curClose || (curClose - stopLossVal) / curClose > 0.15) {
    stopLossVal = curClose * 0.93;
  }
  const stopLoss = Number(stopLossVal.toFixed(2));

  // Targets theo Cause & Effect (Villahermosa & AFL Master):
  let target1: number;
  let target2: number;

  if (isTopDist) {
    target1 = Number(curSup.toFixed(2));
    target2 = Number((curSup - channelHeight * 0.5).toFixed(2));
  } else {
    if (curClose >= curRes) {
      target1 = Number((curRes + channelHeight * 1.0).toFixed(2));
      target2 = Number((curRes + channelHeight * 2.0).toFixed(2));
    } else {
      target1 = Number(curRes.toFixed(2));
      if (causeWeeks >= 20) {
        target2 = Number((curRes + channelHeight * 1.0).toFixed(2));
      } else if (causeWeeks >= 10) {
        target2 = Number((curRes + channelHeight * 0.75).toFixed(2));
      } else {
        target2 = Number((curRes + channelHeight * 0.5).toFixed(2));
      }
    }
  }

  // Điều chỉnh điểm tin cậy multi-factor
  const vt = volumeTrend(bars.slice(-30));
  if (vt === "rising" && (phase === "markup" || phase === "markdown")) confidence = Math.min(92, confidence + 6);
  if (vt === "falling" && (phase === "accumulation" || phase === "distribution")) confidence = Math.min(88, confidence + 5);
  if (isUltraVol) confidence = Math.min(92, confidence + 4);
  if (springTested || sos) confidence = Math.min(92, confidence + 4);

  return {
    phase,
    phaseVi: PHASE_VI[phase],
    subPhase,
    confidence,
    bias,
    events: events.slice(0, 4),
    eventCodes: [...new Set(eventCodes)].slice(0, 6),
    volumeTrend: vt,
    range: { high: Number(curRes.toFixed(2)), low: Number(curSup.toFixed(2)) },
    notes: notes.slice(0, 4),
    transitionStatus,
    transitionVi,
    springTested,
    lpsConfirmed,
    creekLevel: Number(curRes.toFixed(2)),
    iceLevel: Number(curSup.toFixed(2)),
    testVolumeRatio,
    trModel,
    channelPosPct,
    causeWeeks,
    target1,
    target2,
    stopLoss,
    vsaTag,
  };
}

export function analyzeElliott(bars: OhlcvBar[]): ElliottSnapshot {
  const pivots = findPivots(bars.slice(-120), 3);
  const alternating = pivots.filter((p, i) => i === 0 || p.kind !== pivots[i - 1]!.kind).slice(-7);
  const degree = bars.length >= 90 ? "intermediate" : "minor";
  if (alternating.length < 4) return { pattern: "unclear", patternVi: ELLIOTT_VI.unclear, degree, confidence: 0, bias: "neutral", waves: [], invalidation: null, nextTarget: null, notes: ["Chưa đủ pivot để gắn nhãn sóng; cần tối thiểu 4 pivot xác nhận"] };

  const points = alternating.map((p) => p.price);
  const direction = points[points.length - 1]! > points[0]! ? "up" : "down";
  const legs = points.slice(1).map((p, i) => Math.abs(p - points[i]!));
  const [a, b, c, d, e] = legs;
  const impulse = legs.length >= 5 && a > 0 && b > 0 && c > 0 && d > 0 && e > 0 && c >= Math.min(a, e) && b < a && d < c;
  const corrective = legs.length >= 3 && b < a * 0.9 && c >= b * 0.8;
  const waves = alternating.slice(-Math.min(7, alternating.length)).map((p, i) => ({ label: i < 5 ? String(i + 1) : ["A", "B", "C"][i - 5]!, price: p.price, time: p.time }));
  const last = points[points.length - 1]!;
  const origin = points[0]!;
  const span = Math.abs(last - origin);
  const retrace = direction === "up" ? last - span * 0.382 : last + span * 0.382;
  const pattern: ElliottPattern = impulse ? (direction === "up" ? "impulse-up" : "impulse-down") : corrective ? (direction === "up" ? "corrective-abc-up" : "corrective-abc-down") : "unclear";
  const confidence = pattern === "unclear" ? 25 : Math.min(88, 48 + alternating.length * 5 + (impulse ? 15 : 0));
  const bias = pattern === "unclear" ? "neutral" : direction === "up" ? "bullish" : "bearish";
  const invalidation = direction === "up" ? Math.min(...points) : Math.max(...points);
  return { pattern, patternVi: ELLIOTT_VI[pattern], degree, confidence, bias, waves, invalidation, nextTarget: pattern === "unclear" ? null : retrace, notes: ["Heuristic theo pivot OHLCV; không thay thế việc đếm sóng đa cấp độ thủ công", impulse ? "Đã kiểm tra 3 quy tắc xung lực: sóng 2, 3 và 4" : corrective ? "Mẫu điều chỉnh ABC sơ bộ, cần xác nhận thêm ở khung lớn" : "Cấu trúc chưa đạt đủ điều kiện xung lực hoặc điều chỉnh"] };
}

export function analyzeStructure(bars: OhlcvBar[]): StructureAnalysis | null {
  if (bars.length < 30) return null;
  const pivots = findPivots(bars.slice(-120), 3);
  const wyckoff = analyzeWyckoff(bars);
  const elliott = analyzeElliott(bars);
  const sub = wyckoff.subPhase ? ` Phase ${wyckoff.subPhase}` : "";
  return {
    wyckoff,
    elliott,
    pivots: pivots.slice(-8),
    summary: `Wyckoff: ${wyckoff.phaseVi}${sub} (${wyckoff.confidence}%) · Elliott: ${elliott.patternVi}`,
  };
}
